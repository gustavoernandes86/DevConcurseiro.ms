import { defineStore } from 'pinia'

export interface Bookmark {
  currentPage: number
  totalPages: number
  lastReadAt: number
}

export const usePdfStore = defineStore('pdf', {
  state: () => ({
    pdfViewerOpen: false,
    activeMaterialId: null as string | null,
    activeTopicId: null as string | null,
    activeMaterialTitle: '' as string,
    currentPage: 1,
    totalPages: 1,
    bookmarks: {} as Record<string, Bookmark>, // Key is: materialId#topicId or materialId
    readingTimer: null as number | null,
    timerPageNumber: null as number | null
  }),
  getters: {
    activeBookmarkKey(state): string {
      if (!state.activeMaterialId) return ''
      return state.activeTopicId ? `${state.activeMaterialId}#${state.activeTopicId}` : state.activeMaterialId
    },
    currentBookmark(state): Bookmark | undefined {
      if (!state.activeMaterialId) return undefined
      const key = this.activeBookmarkKey
      return state.bookmarks[key]
    }
  },
  actions: {
    async fetchBookmarks(programId: string) {
      try {
        const response = await fetch(`/api/programs/${programId}/bookmarks`)
        if (response.ok) {
          this.bookmarks = await response.json()
        }
      } catch (err) {
        console.error('Erro ao buscar bookmarks:', err)
      }
    },

    async openPdf(programId: string, materialId: string, topicId: string | null, title: string) {
      this.activeMaterialId = materialId
      this.activeTopicId = topicId
      this.activeMaterialTitle = title
      this.pdfViewerOpen = true

      // Load bookmark if it exists
      await this.fetchBookmarks(programId)
      const key = this.activeBookmarkKey
      const b = this.bookmarks[key]
      if (b) {
        this.currentPage = b.currentPage
        this.totalPages = b.totalPages
      } else {
        this.currentPage = 1
        this.totalPages = 1
      }

      this.startReadingTimer(programId, this.currentPage)
    },

    closePdf() {
      this.pdfViewerOpen = false
      this.clearReadingTimer()
      this.activeMaterialId = null
      this.activeTopicId = null
    },

    async updatePage(programId: string, pageNumber: number) {
      if (pageNumber < 1 || pageNumber > this.totalPages) return
      this.currentPage = pageNumber
      
      // Update bookmark on server (throttled/immediate)
      await this.saveCurrentBookmark(programId)

      // Reset reading timer for the new page
      this.startReadingTimer(programId, pageNumber)
    },

    async saveCurrentBookmark(programId: string) {
      if (!this.activeMaterialId) return
      
      const key = this.activeBookmarkKey
      const now = Date.now()

      // Optimistic update local bookmark list
      this.bookmarks[key] = {
        currentPage: this.currentPage,
        totalPages: this.totalPages,
        lastReadAt: now
      }

      try {
        await fetch(`/api/programs/${programId}/bookmarks`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            materialId: this.activeMaterialId,
            topicId: this.activeTopicId,
            currentPage: this.currentPage,
            totalPages: this.totalPages
          })
        })
      } catch (e) {
        console.error('Erro ao salvar bookmark no servidor:', e)
      }
    },

    startReadingTimer(programId: string, pageNumber: number) {
      this.clearReadingTimer()
      this.timerPageNumber = pageNumber
      
      this.readingTimer = window.setTimeout(async () => {
        if (this.activeMaterialId && this.timerPageNumber === pageNumber) {
          const todayStr = new Date().toISOString().split('T')[0] // YYYY-MM-DD
          try {
            await fetch(`/api/programs/${programId}/reading-log`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                materialId: this.activeMaterialId,
                topicId: this.activeTopicId,
                pageNumber: pageNumber,
                dateStr: todayStr
              })
            })
          } catch (e) {
            console.error('Falha ao registar log de leitura:', e)
          }
        }
      }, 15000) // 15 seconds rule
    },

    clearReadingTimer() {
      if (this.readingTimer) {
        clearTimeout(this.readingTimer)
        this.readingTimer = null
      }
      this.timerPageNumber = null
    }
  }
})
