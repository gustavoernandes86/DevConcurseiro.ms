<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useStudyPlanStore } from '../stores/studyPlan'
import type { Topic } from '../stores/studyPlan'
import { useProgramStore } from '../stores/program'
import { usePdfStore } from '../stores/pdf'
import Splitter from 'primevue/splitter'
import SplitterPanel from 'primevue/splitterpanel'
import Button from 'primevue/button'
import Textarea from 'primevue/textarea'
import InputText from 'primevue/inputtext'
import PomodoroTimer from '../components/pomodoro/PomodoroTimer.vue'
import PhaseCard from '../components/study/PhaseCard.vue'
import TopicItem from '../components/study/TopicItem.vue'
import NoteEditorPanel from '../components/study/NoteEditorPanel.vue'
import PdfViewerModal from '../components/study/PdfViewerModal.vue'
import { usePomodoroStore } from '../stores/pomodoro'

const planStore = useStudyPlanStore()
const programStore = useProgramStore()
const pdfStore = usePdfStore()
const pomodoroStore = usePomodoroStore()

const searchQuery = ref('')
const statusFilter = ref<string>('all')
const activeTopicForNote = ref<Topic | null>(null)
const noteContent = ref('')
const noteSaved = ref(false)

// Controla se o modal do PDF está maximizado (fullscreen) ou no tamanho normal
const pdfModalMaximized = ref(true)


onMounted(async () => {
  if (programStore.activeProgramId) {
    await planStore.fetchPlan(programStore.activeProgramId)
  }
})


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
  await planStore.saveTopicNote(
    programStore.activeProgramId,
    activeTopicForNote.value.id,
    content
  )
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
        <i class="pi pi-search search-icon"></i>
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
          <div v-if="filteredPhases.length === 0" class="no-results">
            <i class="pi pi-info-circle"></i>
            <p>Nenhum tópico encontrado com os filtros selecionados.</p>
          </div>

          <PhaseCard
              v-for="(phase, index) in filteredPhases" 
              :key="phase.id"
              :phase="phase"
              :initiallyExpanded="index === 0"
              @cycleStatus="cycleTopicStatus"
              @openMaterial="openMaterial"
              @editNote="editNote"
            />
        </div>
      </SplitterPanel>

      <!-- Right Panel: Side Panel Workspace -->
      <SplitterPanel :size="40" :minSize="30" class="workspace-panel">
        <!-- Study Note Editor Panel -->
        <NoteEditorPanel 
          v-if="activeTopicForNote" 
          :topic="activeTopicForNote"
          :initialContent="noteContent"
          @close="activeTopicForNote = null"
          @save="saveNote"
        />

        <!-- Default Right Panel State: Pomodoro & Info -->
        <div v-else class="default-side-workspace">
          <PomodoroTimer />
          <div class="pomodoro-tip-card">
            <h4>💡 Dica de Estudo</h4>
            <p>Utilize o Pomodoro acima para marcar 25 minutos de foco ininterrupto em um PDF de material didático. Ao concluir o tempo, faça um intervalo curto de 5 minutos!</p>
          </div>
        </div>
      </SplitterPanel>
    </Splitter>

    <PdfViewerModal />
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
</style>