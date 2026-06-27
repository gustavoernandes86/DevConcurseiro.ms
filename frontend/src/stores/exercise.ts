import { defineStore } from 'pinia'

export interface Question {
  id: string
  text: string
  options: {
    A: string
    B: string
    C: string
    D: string
    E: string
  }
  correct: 'A' | 'B' | 'C' | 'D' | 'E'
  explanation: string
}

export interface ExerciseSession {
  id: string
  dateStr: string
  sourceType: string
  questions: Question[]
  answers: Record<string, string> | null
  score: number | null
  createdAt?: number
  completedAt?: number
}

export const useExerciseStore = defineStore('exercise', {
  state: () => ({
    history: [] as ExerciseSession[],
    todaySession: null as ExerciseSession | null,
    todayPagesReadCount: 0,
    loading: false,
    error: null as string | null
  }),
  actions: {
    async fetchTodayStatus(programId: string) {
      const todayStr = new Date().toISOString().split('T')[0]
      try {
        const response = await fetch(`/api/programs/${programId}/exercises/today?dateStr=${todayStr}`)
        if (response.ok) {
          const data = await response.json()
          this.todayPagesReadCount = data.pagesReadCount
          this.todaySession = data.session
        }
      } catch (err) {
        console.error('Erro ao buscar status de exercícios de hoje:', err)
      }
    },

    async fetchHistory(programId: string) {
      this.loading = true
      this.error = null
      try {
        const response = await fetch(`/api/programs/${programId}/exercises/history`)
        if (!response.ok) {
          throw new Error('Falha ao obter histórico de exercícios')
        }
        this.history = await response.json()
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Erro ao obter histórico'
        console.error(err)
      } finally {
        this.loading = false
      }
    },

    async generateTodayExercises(programId: string) {
      this.loading = true
      this.error = null
      const todayStr = new Date().toISOString().split('T')[0]
      try {
        const response = await fetch(`/api/programs/${programId}/exercises/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dateStr: todayStr })
        })
        if (!response.ok) {
          const errData = await response.json()
          throw new Error(errData.error || 'Falha ao gerar simulado por IA')
        }
        const data = await response.json()
        this.todaySession = {
          id: data.id,
          dateStr: todayStr,
          sourceType: 'pdf_reading',
          questions: data.questions,
          answers: null,
          score: null
        }
        await this.fetchHistory(programId)
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Erro ao gerar simulado'
        console.error(err)
        throw err
      } finally {
        this.loading = false
      }
    },

    async generateCustomExercises(
      programId: string, 
      payload: { sourceType: 'pdf_reading' | 'manual_topic'; numQuestions: number; topicIds?: string[] }
    ) {
      this.loading = true
      this.error = null
      const todayStr = new Date().toISOString().split('T')[0]
      try {
        const response = await fetch(`/api/programs/${programId}/exercises/generate-custom`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        if (!response.ok) {
          const errData = await response.json()
          throw new Error(errData.error || 'Falha ao gerar simulado customizado por IA')
        }
        const data = await response.json()
        this.todaySession = {
          id: data.id,
          dateStr: todayStr,
          sourceType: payload.sourceType,
          questions: data.questions,
          answers: null,
          score: null
        }
        await this.fetchHistory(programId)
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Erro ao gerar simulado personalizado'
        console.error(err)
        throw err
      } finally {
        this.loading = false
      }
    },

    async saveAnswers(programId: string, sessionId: string, answers: Record<string, string>, score: number) {
      try {
        const response = await fetch(`/api/programs/${programId}/exercises/${sessionId}/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers, score })
        })
        if (!response.ok) {
          throw new Error('Falha ao salvar respostas no servidor')
        }
        
        const data = await response.json()
        
        if (this.todaySession && this.todaySession.id === sessionId) {
          this.todaySession.answers = answers
          this.todaySession.score = score
          this.todaySession.completedAt = data.completedAt || Date.now()
        }
        
        await this.fetchHistory(programId)
      } catch (err) {
        console.error('Erro ao salvar respostas:', err)
      }
    },

    async deleteSession(programId: string, sessionId: string) {
      this.loading = true
      this.error = null
      try {
        const response = await fetch(`/api/programs/${programId}/exercises/sessions/${sessionId}`, {
          method: 'DELETE'
        })
        if (!response.ok) {
          const errData = await response.json()
          throw new Error(errData.error || 'Falha ao remover o simulado')
        }
        
        this.history = this.history.filter(s => s.id !== sessionId)
        
        if (this.todaySession && this.todaySession.id === sessionId) {
          this.todaySession = null
        }
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Erro ao remover simulado'
        console.error(err)
        throw err
      } finally {
        this.loading = false
      }
    }
  }
})
