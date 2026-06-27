import { defineStore } from 'pinia'

export interface MaterialMapping {
  materialId: string
  title: string
  type: string
  path: string
  startPage: number
  endPage: number
}

export interface Topic {
  id: string
  title: string
  tag: string
  tagClass: string
  detail: string | null
  materials: MaterialMapping[]
}

export interface Week {
  id: string
  number: number
  title: string
  subtitle: string
  topics: Topic[]
}

export interface Phase {
  id: string
  title: string
  subtitle: string
  weeks: Week[]
}

export interface TopicProgress {
  status: 'todo' | 'studying' | 'done' | 'review'
  completedAt: number | null
  confidence: number | null
}

export interface StudyPlanStoreState {
  phases: Phase[]
  progress: Record<string, TopicProgress>
  notes: Record<string, string> // maps topicId -> note text
  loading: boolean
  error: string | null
  contestId: string | null
}

export const useStudyPlanStore = defineStore('studyPlan', {
  state: (): StudyPlanStoreState => ({
    phases: [],
    progress: {},
    notes: {},
    loading: false,
    error: null,
    contestId: null
  }),
  actions: {
    async fetchPlan(programId: string) {
      this.loading = true
      this.error = null
      try {
        // 1. Fetch contest mapping to find the contestId for this program
        const contestsResponse = await fetch('/api/contests')
        if (!contestsResponse.ok) {
          throw new Error('Falha ao buscar concursos')
        }
        const contests = await contestsResponse.json()
        const contest = contests.find((c: { program_id: string, [key: string]: any }) => c.program_id === programId)

        if (!contest) {
          // If no contest is associated (e.g. it's a video course), clear plan
          this.phases = []
          this.contestId = null
          await this.fetchProgressAndNotes(programId)
          return
        }

        this.contestId = contest.id

        // 2. Fetch the plan details
        const planResponse = await fetch(`/api/contests/${contest.id}/plan`)
        if (!planResponse.ok) {
          throw new Error('Falha ao buscar plano de estudos do concurso')
        }
        const planData = await planResponse.json()
        this.phases = planData.phases

        // 3. Fetch progress and notes
        await this.fetchProgressAndNotes(programId)
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Erro ao carregar o plano de estudos'
        console.error(err)
      } finally {
        this.loading = false
      }
    },

    async fetchProgressAndNotes(programId: string) {
      try {
        // Fetch progress
        const progResponse = await fetch(`/api/programs/${programId}/progress`)
        if (progResponse.ok) {
          this.progress = await progResponse.json()
        }

        // Fetch notes
        const notesResponse = await fetch(`/api/programs/${programId}/notes`)
        if (notesResponse.ok) {
          const notesList = await notesResponse.json()
          const notesMap: Record<string, string> = {}
          notesList.forEach((n: { target_type: string, target_id: string, note: string }) => {
            if (n.target_type === 'topic') {
              notesMap[n.target_id] = n.note
            }
          })
          this.notes = notesMap
        }
      } catch (err) {
        console.error('Erro ao carregar progresso e notas:', err)
      }
    },

    async updateTopicProgress(
      programId: string,
      topicId: string,
      status: 'todo' | 'studying' | 'done' | 'review',
      confidence: number | null = null
    ) {
      const current = this.progress[topicId] || { status: 'todo', completedAt: null, confidence: null }
      const completedAt = status === 'done' ? (current.completedAt || Date.now()) : null

      // Optimistic update
      this.progress[topicId] = {
        status,
        completedAt,
        confidence
      }

      try {
        const response = await fetch(`/api/programs/${programId}/topics/${topicId}/progress`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status,
            completedAt,
            confidence
          })
        })
        if (!response.ok) {
          throw new Error('Falha ao atualizar progresso no servidor')
        }
      } catch (err) {
        console.error(err)
        // Rollback on error
        this.progress[topicId] = current
      }
    },

    async saveTopicNote(programId: string, topicId: string, noteText: string) {
      // Optimistic update
      this.notes[topicId] = noteText

      try {
        const response = await fetch(`/api/programs/${programId}/notes`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetType: 'topic',
            targetId: topicId,
            note: noteText
          })
        })
        if (!response.ok) {
          throw new Error('Falha ao salvar nota de estudo')
        }
      } catch (err) {
        console.error('Erro ao salvar nota:', err)
      }
    }
  }
})
