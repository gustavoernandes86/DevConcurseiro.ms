import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface TopicSummary {
  id: number
  topicId: string
  content: string
  sourceMaterialIds: string[]
  generatedAt: number
}

export const useSummaryStore = defineStore('summary', () => {
  // Map of topicId -> summary data
  const summaries = ref<Record<string, TopicSummary | null>>({})
  // Set of topicIds currently being generated
  const generating = ref<Set<string>>(new Set())
  const errors = ref<Record<string, string>>({})

  async function fetchSummary(programId: string, topicId: string): Promise<void> {
    try {
      const res = await fetch(`/api/programs/${programId}/topics/${topicId}/summary`)
      if (res.ok) {
        const data = await res.json()
        summaries.value[topicId] = data.summary // null if none
      }
    } catch (err) {
      console.error(`[SummaryStore] Failed to fetch summary for ${topicId}:`, err)
    }
  }

  async function generateSummary(programId: string, topicId: string): Promise<void> {
    if (generating.value.has(topicId)) return
    generating.value.add(topicId)
    delete errors.value[topicId]

    try {
      const res = await fetch(
        `/api/programs/${programId}/topics/${topicId}/summary/generate`,
        { method: 'POST' }
      )
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Falha ao gerar resumo' }))
        throw new Error(errData.error || 'Falha ao gerar resumo')
      }
      const data = await res.json()
      summaries.value[topicId] = data.summary
    } catch (err) {
      errors.value[topicId] = err instanceof Error ? err.message : 'Erro ao gerar resumo'
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

  return { summaries, fetchSummary, generateSummary, isGenerating, getError }
})
