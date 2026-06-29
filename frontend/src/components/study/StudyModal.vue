<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import { marked } from 'marked'
import { useSummaryStore } from '../../stores/summary'
import { useFlashcardStore } from '../../stores/flashcard'
import { useNotification } from '../../composables/useNotification'
import FlashcardsViewer from './FlashcardsViewer.vue'
import type { Topic } from '../../stores/studyPlan'

const props = defineProps<{
  topic: Topic | null
  programId: string
  initialTab?: 'summary' | 'anki'
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const summaryStore = useSummaryStore()
const flashcardStore = useFlashcardStore()
const notification = useNotification()

const visible = computed(() => !!props.topic)
const activeTab = ref<'summary' | 'anki'>(props.initialTab || 'summary')

// When topic or initialTab changes, reset tab and load data
watch(() => [props.topic, props.initialTab], async ([newTopic, newTab]) => {
  if (!newTopic) return
  activeTab.value = (newTab as 'summary' | 'anki') || 'summary'
  const topic = newTopic as Topic

  if (activeTab.value === 'summary' && summaryStore.summaries[topic.id] === undefined) {
    await summaryStore.fetchSummary(props.programId, topic.id)
  } else if (activeTab.value === 'anki' && flashcardStore.cards[topic.id] === undefined) {
    await flashcardStore.fetchFlashcards(props.programId, topic.id)
  }
}, { immediate: true })

const switchTab = async (tab: 'summary' | 'anki') => {
  activeTab.value = tab
  if (!props.topic) return
  if (tab === 'summary' && summaryStore.summaries[props.topic.id] === undefined) {
    await summaryStore.fetchSummary(props.programId, props.topic.id)
  } else if (tab === 'anki' && flashcardStore.cards[props.topic.id] === undefined) {
    await flashcardStore.fetchFlashcards(props.programId, props.topic.id)
  }
}

const parsedSummaryHtml = computed(() => {
  if (!props.topic) return ''
  const summary = summaryStore.summaries[props.topic.id]
  if (!summary?.content) return ''
  return marked.parse(summary.content) as string
})

const generateSummary = async () => {
  if (!props.topic) return
  try {
    await summaryStore.generateSummary(props.programId, props.topic.id)
    notification.showSuccess('Resumo gerado!', 'O resumo foi gerado com sucesso.')
  } catch (err: any) {
    notification.showError('Erro ao gerar resumo', err.message || 'Tente novamente.')
  }
}

const generateFlashcards = async () => {
  if (!props.topic) return
  try {
    await flashcardStore.generateFlashcards(props.programId, props.topic.id)
    notification.showSuccess('Flashcards gerados!', 'Os cartões de revisão foram criados com sucesso.')
  } catch (err: any) {
    notification.showError('Erro ao gerar flashcards', err.message || 'Tente novamente.')
  }
}

const modalMaximized = ref(false)
</script>

<template>
  <Dialog
    :visible="visible"
    v-model:maximized="modalMaximized"
    :modal="true"
    maximizable
    class="study-modal-dialog"
    contentClass="study-modal-dialog-content"
    @hide="emit('close')"
    @update:visible="(v) => { if (!v) emit('close') }"
  >
    <!-- Header -->
    <template #header>
      <div class="study-modal-header">
        <i class="pi pi-book study-modal-icon" aria-hidden="true"></i>
        <h3 class="study-modal-title" :title="topic?.title">{{ topic?.title }}</h3>
        <div class="study-modal-tabs">
          <button
            class="study-tab-btn"
            :class="{ active: activeTab === 'summary' }"
            @click="switchTab('summary')"
          >
            <i class="pi pi-align-left" aria-hidden="true"></i>
            Resumo
          </button>
          <button
            class="study-tab-btn"
            :class="{ active: activeTab === 'anki' }"
            @click="switchTab('anki')"
          >
            <i class="pi pi-clone" aria-hidden="true"></i>
            Revisão Anki
          </button>
        </div>
      </div>
    </template>

    <!-- Body -->
    <div class="study-modal-body">

      <!-- ──── TAB: RESUMO ──── -->
      <template v-if="activeTab === 'summary'">
        <div v-if="summaryStore.isGenerating(topic!.id)" class="state-loading">
          <i class="pi pi-spin pi-spinner"></i>
          <span>Gerando resumo com IA...</span>
        </div>

        <div v-else-if="summaryStore.getError(topic!.id)" class="state-error">
          <i class="pi pi-exclamation-triangle"></i>
          <span>{{ summaryStore.getError(topic!.id) }}</span>
          <button class="btn-action-primary" @click="generateSummary">Tentar novamente</button>
        </div>

        <div
          v-else-if="summaryStore.summaries[topic!.id]"
          class="content-area"
        >
          <div class="markdown-content" v-html="parsedSummaryHtml"></div>
          <div class="modal-footer">
            <span class="footer-date">
              Gerado em {{ new Date(summaryStore.summaries[topic!.id]!.generatedAt).toLocaleDateString('pt-BR') }}
            </span>
            <Button
              icon="pi pi-refresh"
              label="Regenerar"
              class="p-button-outlined p-button-sm"
              :disabled="summaryStore.isGenerating(topic!.id)"
              @click="generateSummary"
            />
          </div>
        </div>

        <div v-else class="state-empty">
          <div class="empty-icon">🤖</div>
          <h4>Nenhum resumo gerado ainda</h4>
          <p>A IA irá sintetizar o material vinculado a este tópico em um resumo claro e objetivo.</p>
          <button
            class="btn-action-primary"
            :disabled="summaryStore.isGenerating(topic!.id)"
            @click="generateSummary"
          >
            <i class="pi pi-sparkles"></i>
            Gerar Resumo com IA
          </button>
        </div>
      </template>

      <!-- ──── TAB: ANKI ──── -->
      <template v-else-if="activeTab === 'anki'">
        <div v-if="flashcardStore.isGenerating(topic!.id)" class="state-loading">
          <i class="pi pi-spin pi-spinner"></i>
          <span>Gerando flashcards com IA...</span>
        </div>

        <div v-else-if="flashcardStore.getError(topic!.id)" class="state-error">
          <i class="pi pi-exclamation-triangle"></i>
          <span>{{ flashcardStore.getError(topic!.id) }}</span>
          <button class="btn-action-primary" @click="generateFlashcards">Tentar novamente</button>
        </div>

        <div
          v-else-if="flashcardStore.cards[topic!.id] && flashcardStore.cards[topic!.id]!.length > 0"
          class="content-area anki-area"
        >
          <FlashcardsViewer :cards="flashcardStore.cards[topic!.id] || []" />
          <div class="modal-footer">
            <span class="footer-date">
              Gerado em {{ new Date(flashcardStore.cards[topic!.id]![0].createdAt).toLocaleDateString('pt-BR') }}
              · {{ flashcardStore.cards[topic!.id]!.length }} cartões
            </span>
            <Button
              icon="pi pi-refresh"
              label="Regenerar"
              class="p-button-outlined p-button-sm"
              :disabled="flashcardStore.isGenerating(topic!.id)"
              @click="generateFlashcards"
            />
          </div>
        </div>

        <div v-else class="state-empty">
          <div class="empty-icon">🗂️</div>
          <h4>Nenhum cartão de revisão ainda</h4>
          <p>A IA irá criar flashcards estilo Anki focados nos pontos mais cobrados em prova.</p>
          <button
            class="btn-action-primary"
            :disabled="flashcardStore.isGenerating(topic!.id)"
            @click="generateFlashcards"
          >
            <i class="pi pi-sparkles"></i>
            Gerar Anki com IA
          </button>
        </div>
      </template>

    </div>
  </Dialog>
</template>

<style>
/* ─── Global (non-scoped) — needed for teleported Dialog ─── */
.study-modal-dialog {
  background-color: var(--bg-secondary) !important;
  border: 1px solid var(--border-color) !important;
  border-radius: var(--radius) !important;
  width: 820px !important;
  max-width: 96vw !important;
  height: 80vh !important;
  max-height: 90vh !important;
  display: flex !important;
  flex-direction: column !important;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6) !important;
}

.study-modal-dialog.p-dialog-maximized {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  max-width: 100vw !important;
  max-height: 100vh !important;
  margin: 0 !important;
  border: none !important;
  border-radius: 0 !important;
}

.study-modal-dialog .p-dialog-header {
  background-color: var(--bg-card) !important;
  border-bottom: 1px solid var(--border-color) !important;
  padding: 8px 16px !important;
  color: var(--text-primary) !important;
  display: flex !important;
  align-items: center !important;
  flex-shrink: 0 !important;
}

.study-modal-dialog .p-dialog-content {
  padding: 0 !important;
  background-color: var(--bg-secondary) !important;
  flex: 1 1 0% !important;
  min-height: 0 !important;
  display: flex !important;
  flex-direction: column !important;
}

.study-modal-dialog .p-dialog-header-actions {
  margin-left: auto !important;
  display: flex !important;
  align-items: center !important;
  gap: 4px !important;
}

.study-modal-dialog .p-dialog-header-icon {
  color: var(--text-secondary) !important;
  background: transparent !important;
  border: none !important;
  width: 28px !important;
  height: 28px !important;
  border-radius: 50% !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  transition: all 0.2s !important;
  cursor: pointer !important;
}

.study-modal-dialog .p-dialog-header-icon:hover {
  background-color: var(--bg-card-hover) !important;
  color: var(--text-primary) !important;
}
</style>

<style scoped>
/* ─── Header ─── */
.study-modal-header {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-grow: 1;
  min-width: 0;
}

.study-modal-icon {
  color: var(--accent-blue, #638aff);
  font-size: 18px;
  flex-shrink: 0;
}

.study-modal-title {
  font-size: 15px;
  font-weight: 700;
  margin: 0;
  color: #ffffff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 280px;
  flex-shrink: 1;
}

.study-modal-tabs {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.study-tab-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: 1px solid transparent;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.study-tab-btn:hover {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.05);
}

.study-tab-btn.active {
  color: var(--accent-blue, #638aff);
  background: rgba(99, 138, 255, 0.12);
  border-color: rgba(99, 138, 255, 0.25);
}

/* ─── Body ─── */
.study-modal-body {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* ─── Content Area ─── */
.content-area {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.anki-area {
  padding: 32px;
  max-width: 600px;
  margin: 0 auto;
  width: 100%;
}

.markdown-content {
  flex: 1;
  overflow-y: auto;
  padding: 28px 36px;
  font-size: 14px;
  line-height: 1.8;
  color: var(--text-secondary);
  word-break: break-word;
}

.markdown-content :deep(h1) {
  font-size: 1.6em; margin: 0 0 16px; color: var(--text-primary);
  border-bottom: 1px solid var(--border-color); padding-bottom: 10px; font-weight: 700;
}
.markdown-content :deep(h2) {
  font-size: 1.3em; margin: 24px 0 10px; color: var(--text-primary); font-weight: 600;
}
.markdown-content :deep(h3) {
  font-size: 1.1em; margin: 20px 0 8px; color: var(--text-primary); font-weight: 600;
}
.markdown-content :deep(p) { margin: 0 0 14px; }
.markdown-content :deep(ul), .markdown-content :deep(ol) {
  padding-left: 22px; margin: 0 0 14px;
}
.markdown-content :deep(li) { margin-bottom: 6px; }
.markdown-content :deep(strong) { color: var(--text-primary); font-weight: 600; }
.markdown-content :deep(code) {
  font-family: monospace; background: rgba(255,255,255,0.07); padding: 2px 6px;
  border-radius: 4px; font-size: 0.88em; color: var(--accent-blue, #638aff);
}
.markdown-content :deep(pre) {
  background: rgba(0,0,0,0.3); padding: 16px; border-radius: 8px; overflow-x: auto;
  margin-bottom: 16px; border: 1px solid var(--border-color);
}
.markdown-content :deep(pre code) { background: transparent; padding: 0; color: inherit; }
.markdown-content :deep(hr) {
  border: 0; border-top: 1px solid var(--border-color); margin: 24px 0;
}
.markdown-content :deep(blockquote) {
  border-left: 4px solid var(--accent-blue, #638aff); padding-left: 16px;
  margin: 0 0 16px; color: var(--text-secondary); opacity: 0.85; font-style: italic;
}

/* ─── Footer ─── */
.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 28px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-card);
  flex-shrink: 0;
}

.footer-date {
  font-size: 11px;
  color: var(--text-muted, #6e7681);
}

/* ─── States ─── */
.state-loading, .state-error, .state-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  height: 100%;
  color: var(--text-secondary);
  text-align: center;
  padding: 48px 32px;
}

.state-loading {
  gap: 12px;
  font-size: 14px;
}

.state-loading i { font-size: 28px; color: var(--accent-blue, #638aff); }

.state-error {
  gap: 12px;
  font-size: 14px;
  color: var(--accent-red, #f87171);
}

.state-error i { font-size: 28px; }

.empty-icon { font-size: 52px; }

.state-empty h4 {
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.state-empty p {
  font-size: 13px;
  max-width: 380px;
  line-height: 1.6;
  margin: 0;
}

.btn-action-primary {
  display: flex;
  align-items: center;
  gap: 8px;
  background: linear-gradient(135deg, #638aff, #a855f7);
  color: #fff;
  border: none;
  padding: 12px 28px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 18px rgba(99, 138, 255, 0.35);
  margin-top: 8px;
}

.btn-action-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(99, 138, 255, 0.45);
}

.btn-action-primary:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
}
</style>
