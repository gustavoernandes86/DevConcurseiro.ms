<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { useStudyPlanStore } from '../stores/studyPlan'
import type { Topic } from '../stores/studyPlan'
import { useProgramStore } from '../stores/program'
import { usePdfStore } from '../stores/pdf'
import Splitter from 'primevue/splitter'
import SplitterPanel from 'primevue/splitterpanel'
import InputText from 'primevue/inputtext'
import Skeleton from 'primevue/skeleton'
import PomodoroTimer from '../components/pomodoro/PomodoroTimer.vue'
import PhaseCard from '../components/study/PhaseCard.vue'
import NoteEditorPanel from '../components/study/NoteEditorPanel.vue'
import PdfViewerModal from '../components/study/PdfViewerModal.vue'
import StudyModal from '../components/study/StudyModal.vue'
import { useNotification } from '../composables/useNotification'

const planStore = useStudyPlanStore()
const programStore = useProgramStore()
const pdfStore = usePdfStore()
const notification = useNotification()

const searchQuery = ref('')
const statusFilter = ref<string>('all')
const activeTopicForNote = ref<Topic | null>(null)
const noteContent = ref('')
const noteSaved = ref(false)

const isMobile = ref(false)

const checkMobile = () => {
  isMobile.value = window.innerWidth < 992
}

onMounted(async () => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
  if (programStore.activeProgramId) {
    await planStore.fetchPlan(programStore.activeProgramId)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', checkMobile)
})


// Study modal state (summary + anki)
const studyModalTopic = ref<Topic | null>(null)
const studyModalTab = ref<'summary' | 'anki'>('summary')

const openSummary = (topic: Topic) => {
  studyModalTopic.value = topic
  studyModalTab.value = 'summary'
}

const openFlashcards = (topic: Topic) => {
  studyModalTopic.value = topic
  studyModalTab.value = 'anki'
}

// Open note editor
const editNote = (topic: Topic) => {
  activeTopicForNote.value = topic
  noteContent.value = planStore.notes[topic.id] || ''
  noteSaved.value = false
  pdfStore.pdfViewerOpen = false // Close PDF viewer if note is edited
}

// Save note
const saveNote = async (content: string) => {
  if (!activeTopicForNote.value) return
  try {
    await planStore.saveTopicNote(
      programStore.activeProgramId,
      activeTopicForNote.value.id,
      content
    )
    notification.showSuccess('Anotações Salvas', 'Suas anotações foram gravadas com sucesso!')
  } catch (err: any) {
    notification.showError('Erro ao Salvar', err.message || 'Não foi possível salvar as anotações.')
  }
}

// Open PDF file in viewer
const openMaterial = (topic: Topic, materialId: string, title: string) => {
  activeTopicForNote.value = null // Close note editor
  pdfStore.openPdf(programStore.activeProgramId, materialId, topic.id, title)
}

// Toggle status of topic progress cycle
const cycleTopicStatus = async (topicId: string) => {
  const current = planStore.progress[topicId]?.status || 'todo'
  let nextStatus: 'todo' | 'studying' | 'done' | 'review' = 'todo'
  
  if (current === 'todo') nextStatus = 'studying'
  else if (current === 'studying') nextStatus = 'done'
  else if (current === 'done') nextStatus = 'review'
  else nextStatus = 'todo'

  await planStore.updateTopicProgress(programStore.activeProgramId, topicId, nextStatus)
}

// Filtered phases and weeks
const filteredPhases = computed(() => {
  return planStore.phases.map(phase => {
    const weeks = phase.weeks.map(week => {
      const topics = week.topics.filter(topic => {
        // Search Filter
        const matchesSearch = topic.title.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
          (topic.detail && topic.detail.toLowerCase().includes(searchQuery.value.toLowerCase()))
        
        // Status Filter
        const status = planStore.progress[topic.id]?.status || 'todo'
        const matchesStatus = statusFilter.value === 'all' || status === statusFilter.value

        return matchesSearch && matchesStatus
      })

      return {
        ...week,
        topics
      }
    }).filter(week => week.topics.length > 0) // Only show weeks with matching topics

    return {
      ...phase,
      weeks
    }
  }).filter(phase => phase.weeks.length > 0) // Only show phases with matching weeks
})
</script>

<template>
  <div class="study-plan-container">
    <!-- Header Controls -->
    <div class="filters-bar">
      <div class="search-box">
        <i class="pi pi-search search-icon"  aria-hidden="true"></i>
        <InputText 
          v-model="searchQuery" 
          placeholder="Buscar tópicos ou palavras-chave..." 
          class="search-input" 
        />
      </div>

      <div class="status-filters">
        <button 
          v-for="filter in [
            { id: 'all', label: 'Todos' },
            { id: 'todo', label: 'Pendente' },
            { id: 'studying', label: 'Estudando' },
            { id: 'done', label: 'Concluído' },
            { id: 'review', label: 'Revisar' }
          ]" 
          :key="filter.id"
          class="filter-chip"
          :class="{ active: statusFilter === filter.id }"
          @click="statusFilter = filter.id"
        >
          {{ filter.label }}
        </button>
      </div>
    </div>

    <!-- Main Workspace Splitter -->
    <Splitter class="workspace-splitter" style="height: calc(100vh - 180px);">
      <!-- Left Panel: Study Plan Tree -->
      <SplitterPanel :size="60" :minSize="30" class="plan-panel">
        <div class="plan-scrollable">
          <!-- Loading State with Skeletons -->
          <div v-if="planStore.loading" class="skeleton-plan p-md">
            <div v-for="i in 2" :key="i" class="skeleton-phase-card mb-lg p-md bg-card radius">
              <Skeleton width="40%" height="24px" class="mb-sm" />
              <Skeleton width="60%" height="16px" class="mb-md" />
              <div class="skeleton-weeks mt-md ml-sm">
                <div v-for="j in 2" :key="j" class="skeleton-week-item mb-md">
                  <Skeleton width="30%" height="20px" class="mb-sm" />
                  <div class="skeleton-topics ml-md">
                    <div v-for="k in 3" :key="k" class="skeleton-topic-row mb-sm d-flex items-center gap-sm">
                      <Skeleton shape="circle" size="20px" />
                      <div style="flex-grow: 1;">
                        <Skeleton width="80%" height="14px" class="mb-xs" />
                        <Skeleton width="40%" height="10px" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Empty State -->
          <div v-else-if="filteredPhases.length === 0" class="no-results">
            <i class="pi pi-info-circle" aria-hidden="true"></i>
            <p>Nenhum tópico encontrado com os filtros selecionados.</p>
          </div>

          <!-- Loaded State -->
          <template v-else>
            <PhaseCard
              v-for="(phase, index) in filteredPhases" 
              :key="phase.id"
              :phase="phase"
              :initiallyExpanded="index === 0"
              @cycleStatus="cycleTopicStatus"
              @openMaterial="openMaterial"
              @editNote="editNote"
              @openSummary="openSummary"
              @openFlashcards="openFlashcards"
            />
          </template>
        </div>
      </SplitterPanel>

      <!-- Right Panel: Pomodoro + Info -->
      <SplitterPanel :size="30" :minSize="22" class="workspace-panel">
        <NoteEditorPanel 
          v-if="activeTopicForNote" 
          :topic="activeTopicForNote"
          :initialContent="noteContent"
          @close="activeTopicForNote = null"
          @save="saveNote"
        />
        <div v-else class="default-side-workspace">
          <PomodoroTimer />
          <div class="pomodoro-tip-card">
            <h4>💡 Dica de Estudo</h4>
            <p>Utilize o Pomodoro acima para marcar 25 minutos de foco ininterrupto em um PDF de material didático. Ao concluir o tempo, faça um intervalo curto de 5 minutos!</p>
          </div>
        </div>
      </SplitterPanel>
    </Splitter>

    <!-- Modals -->
    <PdfViewerModal />
    <StudyModal
      :topic="studyModalTopic"
      :programId="programStore.activeProgramId"
      :initialTab="studyModalTab"
      @close="studyModalTopic = null"
    />
  </div>
</template>

<style scoped>
.study-plan-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
}

.filters-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}

.search-box {
  position: relative;
  flex-grow: 1;
  max-width: 400px;
}

.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
}

.search-input {
  width: 100%;
  padding-left: 36px;
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
}

.status-filters {
  display: flex;
  gap: 8px;
}

.filter-chip {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.filter-chip:hover {
  color: var(--text-primary);
  border-color: var(--text-muted);
}

.filter-chip.active {
  background: var(--gradient-primary);
  color: #fff;
  border-color: transparent;
}

.workspace-splitter {
  border: 1px solid var(--border-color);
  background: transparent;
  border-radius: var(--radius);
  overflow: hidden;
}

.plan-panel {
  background-color: var(--bg-primary);
}

.plan-scrollable {
  height: 100%;
  overflow-y: auto;
  padding: 16px;
}

.no-results {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  gap: 12px;
  padding: 48px 0;
}

.no-results i {
  font-size: 32px;
}

.note-editor-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--bg-secondary);
  border-left: 1px solid var(--border-color);
}

.note-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background-color: var(--bg-card);
  border-bottom: 1px solid var(--border-color);
}

.note-header h3 {
  font-size: 14px;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 80%;
}

.note-body {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  padding: 16px;
  gap: 16px;
}

.note-textarea {
  flex-grow: 1;
  width: 100%;
  background-color: var(--bg-primary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 13px;
  padding: 12px;
  border-radius: var(--radius-sm);
  resize: none;
}

.note-textarea:focus {
  border-color: var(--accent-blue);
  outline: none;
}

.note-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 16px;
}

.saved-message {
  font-size: 12px;
  color: var(--accent-green);
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 4px;
}

@media (max-width: 992px) {
  :deep(.workspace-splitter) {
    flex-direction: column !important;
    height: auto !important;
  }
  
  :deep(.workspace-splitter > .p-splitterpanel) {
    width: 100% !important;
    flex-basis: auto !important;
  }
  
  :deep(.workspace-splitter > .p-splitter-gutter) {
    display: none !important;
  }
  
  .plan-scrollable {
    max-height: 50vh;
    overflow-y: auto;
  }
}

/* ─── Summary Panel ─── */
.summary-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-card);
  border-left: 1px solid var(--border-color);
}

.summary-panel-header-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-glass);
}

.panel-tab-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: none;
  border: 1px solid transparent;
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.panel-tab-btn:hover {
  color: var(--text-primary);
  background: var(--bg-card-hover);
}

.panel-tab-btn.active {
  color: var(--text-primary);
  background: var(--accent-blue-dim);
  border-color: var(--border-color);
}

.btn-close-panel {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  transition: all 0.2s;
  margin-left: auto;
}
.btn-close-panel:hover { color: var(--text-primary); background: var(--bg-card-hover); }

.summary-topic-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--accent-blue, #638aff);
  padding: 12px 20px 0;
  margin: 0;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 12px;
}

.summary-loading, .summary-error {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 24px 20px;
  font-size: 13px;
  color: var(--text-secondary);
}
.summary-error { color: #e05252; }
.summary-loading i, .summary-error i { font-size: 18px; flex-shrink: 0; margin-top: 2px; }

.summary-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.summary-text {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-primary);
  word-break: break-word;
  font-family: inherit;
  margin: 0;
  background: transparent;
}

.summary-text :deep(h1) {
  font-size: 1.5em;
  margin-top: 24px;
  margin-bottom: 12px;
  color: var(--text-primary);
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 8px;
  font-weight: 700;
}

.summary-text :deep(h2) {
  font-size: 1.3em;
  margin-top: 20px;
  margin-bottom: 10px;
  color: var(--text-primary);
  font-weight: 600;
}

.summary-text :deep(h3) {
  font-size: 1.1em;
  margin-top: 16px;
  margin-bottom: 8px;
  color: var(--text-primary);
  font-weight: 600;
}

.summary-text :deep(p) {
  margin-top: 0;
  margin-bottom: 16px;
  color: var(--text-secondary);
}

.summary-text :deep(ul), .summary-text :deep(ol) {
  padding-left: 20px;
  margin-top: 0;
  margin-bottom: 16px;
}

.summary-text :deep(li) {
  margin-bottom: 6px;
  color: var(--text-secondary);
}

.summary-text :deep(code) {
  font-family: monospace;
  background: rgba(255, 255, 255, 0.08);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.9em;
  color: var(--accent-blue, #638aff);
}

.summary-text :deep(pre) {
  background: rgba(0, 0, 0, 0.25);
  padding: 14px;
  border-radius: 8px;
  overflow-x: auto;
  margin-bottom: 16px;
  border: 1px solid var(--border-color);
}

.summary-text :deep(pre code) {
  background: transparent;
  padding: 0;
  color: inherit;
}

.summary-text :deep(hr) {
  border: 0;
  border-top: 1px solid var(--border-color);
  margin: 24px 0;
}

.summary-text :deep(blockquote) {
  border-left: 4px solid var(--accent-blue, #638aff);
  padding-left: 16px;
  margin: 0 0 16px;
  color: var(--text-secondary);
  opacity: 0.8;
  font-style: italic;
}


.summary-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-glass);
}

.summary-date {
  font-size: 11px;
  color: var(--text-muted, #6e7681);
}

.btn-regenerate {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  cursor: pointer;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12px;
  transition: all 0.2s;
}
.btn-regenerate:hover:not(:disabled) { border-color: var(--accent-blue, #638aff); color: var(--accent-blue, #638aff); }
.btn-regenerate:disabled { opacity: 0.5; cursor: not-allowed; }

.summary-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 48px 24px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 14px;
}

.summary-empty-icon { font-size: 40px; }
.summary-empty p { margin: 0; }

.btn-generate-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  background: linear-gradient(135deg, #638aff, #a855f7);
  color: #fff;
  border: none;
  padding: 12px 24px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 16px rgba(99,138,255,0.3);
}
.btn-generate-summary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(99,138,255,0.4); }
.btn-generate-summary:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
</style>