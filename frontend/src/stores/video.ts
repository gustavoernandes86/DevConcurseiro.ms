import { defineStore } from 'pinia'

export interface VideoProgress {
  status: 'todo' | 'watching' | 'done'
  lastPositionSeconds: number
  completedAt: number | null
}

export interface Video {
  id: string
  videoNumber: number
  title: string
  durationSeconds: number | null
  url: string | null
  progress: VideoProgress
}

export interface Subject {
  id: string
  name: string
  videos: Video[]
}

export interface VideoModule {
  id: string
  moduleNumber: number
  title: string
  subjects: Subject[]
}

export const useVideoStore = defineStore('video', {
  state: () => ({
    modules: [] as VideoModule[],
    loading: false,
    error: null as string | null
  }),
  actions: {
    async fetchVideos(programId: string) {
      this.loading = true
      this.error = null
      try {
        const response = await fetch(`/api/programs/${programId}/videos`)
        if (!response.ok) {
          throw new Error('Falha ao carregar aulas em vídeo')
        }
        this.modules = await response.json()
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Erro ao carregar vídeos'
        console.error(err)
      } finally {
        this.loading = false
      }
    },

    async updateVideoProgress(
      programId: string,
      videoId: string,
      status: 'todo' | 'watching' | 'done',
      lastPositionSeconds = 0
    ) {
      // Optimistic update of local state
      let found = false
      for (const mod of this.modules) {
        if (found) break
        for (const sub of mod.subjects) {
          const video = sub.videos.find(v => v.id === videoId)
          if (video) {
            video.progress.status = status
            video.progress.lastPositionSeconds = lastPositionSeconds
            video.progress.completedAt = status === 'done' ? Date.now() : null
            found = true
            break
          }
        }
      }

      try {
        const response = await fetch(`/api/programs/${programId}/videos/${videoId}/progress`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status, lastPositionSeconds })
        })
        if (!response.ok) {
          throw new Error('Falha ao salvar progresso do vídeo')
        }
      } catch (err) {
        console.error('Erro ao atualizar progresso de vídeo:', err)
      }
    }
  }
})
