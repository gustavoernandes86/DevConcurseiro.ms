import { defineStore } from 'pinia'

export interface LearningProgram {
  id: string
  name: string
  type: 'contest' | 'course'
  active: number
  description: string | null
  created_at: number
  updated_at: number
}

export const useProgramStore = defineStore('program', {
  state: () => ({
    programs: [] as LearningProgram[],
    activeProgramId: localStorage.getItem('activeProgramId') || 'petrobras-eng-software-2026',
    loading: false,
    error: null as string | null
  }),
  getters: {
    activeProgram(state): LearningProgram | undefined {
      return state.programs.find(p => p.id === state.activeProgramId)
    }
  },
  actions: {
    async fetchPrograms() {
      this.loading = true
      this.error = null
      try {
        const response = await fetch('/api/programs')
        if (!response.ok) {
          throw new Error('Falha ao buscar programas de estudo')
        }
        const data = await response.json()
        this.programs = data
        if (data.length > 0 && !data.some((p: LearningProgram) => p.id === this.activeProgramId)) {
          this.activeProgramId = data[0].id
          localStorage.setItem('activeProgramId', this.activeProgramId)
        }
      } catch (err: any) {
        this.error = err.message || 'Erro ao carregar programas'
        console.error(err)
      } finally {
        this.loading = false
      }
    },
    setActiveProgramId(id: string) {
      this.activeProgramId = id
      localStorage.setItem('activeProgramId', id)
    }
  }
})
