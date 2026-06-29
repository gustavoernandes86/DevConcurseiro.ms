import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface Flashcard {
  id: number
  topicId: string
  front: string
  back: string
  createdAt: number
}

export const useFlashcardStore = defineStore('flashcard', () => {
  // Map of topicId -> list of cards or null
  const cards = ref<Record<string, Flashcard[] | null>>({})
  // Set of topicIds currently generating flashcards
  const generating = ref<Set<string>>(new Set())
  const errors = ref<Record<string, string>>({})

  async function fetchFlashcards(programId: string, topicId: string): Promise<void> {
    try {
      const res = await fetch(`/api/programs/${programId}/topics/${topicId}/flashcards`)
      if (res.ok) {
        const data = await res.json()
        cards.value[topicId] = data.cards || []
      }
    } catch (err) {
      console.error(`[FlashcardStore] Failed to fetch flashcards for ${topicId}:`, err)
    }
  }

  async function generateFlashcards(programId: string, topicId: string): Promise<void> {
    if (generating.value.has(topicId)) return
    generating.value.add(topicId)
    delete errors.value[topicId]

    try {
      const res = await fetch(
        `/api/programs/${programId}/topics/${topicId}/flashcards/generate`,
        { method: 'POST' }
      )
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Falha ao gerar cartões' }))
        throw new Error(errData.error || 'Falha ao gerar cartões')
      }
      const data = await res.json()
      cards.value[topicId] = data.cards || []
    } catch (err) {
      errors.value[topicId] = err instanceof Error ? err.message : 'Erro ao gerar cartões de revisão'
      throw err
    } finally {
      generating.value.delete(topicId)
    }
  }

  function isGenerating(topicId: string): boolean {
    return generating.value.has(topicId)
  }

  function getError(topicId: string): string | null {
    return errors.value[topicId] || null
  }

  return { cards, fetchFlashcards, generateFlashcards, isGenerating, getError }
})
