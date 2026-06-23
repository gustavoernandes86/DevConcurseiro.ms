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
import PdfReaderPanel from '../components/pdf/PdfReaderPanel.vue'
import PomodoroTimer from '../components/pomodoro/PomodoroTimer.vue'

const planStore = useStudyPlanStore()
const programStore = useProgramStore()
const pdfStore = usePdfStore()

const searchQuery = ref('')
const statusFilter = ref<string>('all')
const activeTopicForNote = ref<Topic | null>(null)
const noteContent = ref('')
const noteSaved = ref(false)

// Expand/Collapse phases state
const expandedPhases = ref<Record<string, boolean>>({})

onMounted(async () => {
  if (programStore.activeProgramId) {
    await planStore.fetchPlan(programStore.activeProgramId)
    // Expand first phase by default
    if (planStore.phases.length > 0) {
      expandedPhases.value[planStore.phases[0].id] = true
    }
  }
})

// Toggle phase collapse
const togglePhase = (phaseId: string) => {
  expandedPhases.value[phaseId] = !expandedPhases.value[phaseId]
}

// Open note editor
const editNote = (topic: Topic) => {
  activeTopicForNote.value = topic
  noteContent.value = planStore.notes[topic.id] || ''
  noteSaved.value = false
  pdfStore.pdfViewerOpen = false // Close PDF viewer if note is edited
}

// Save note
const saveNote = async () => {
  if (!activeTopicForNote.value) return
  await planStore.saveTopicNote(
    programStore.activeProgramId,
    activeTopicForNote.value.id,
    noteContent.value
  )
  noteSaved.value = true
  setTimeout(() => {
    noteSaved.value = false
  }, 2000)
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

          <div v-for="phase in filteredPhases" :key="phase.id" class="phase-card">
            <!-- Phase Header Collapsible -->
            <div class="phase-header" @click="togglePhase(phase.id)">
              <div class="phase-title">
                <i :class="expandedPhases[phase.id] ? 'pi pi-chevron-down' : 'pi pi-chevron-right'"></i>
                <h3>{{ phase.title }}</h3>
              </div>
              <span class="phase-subtitle">{{ phase.subtitle }}</span>
            </div>

            <!-- Phase Content (Weeks) -->
            <div v-show="expandedPhases[phase.id]" class="phase-content">
              <div v-for="week in phase.weeks" :key="week.id" class="week-card">
                <div class="week-header">
                  <h4>Semana {{ week.number }}: {{ week.title }}</h4>
                  <p class="week-subtitle">{{ week.subtitle }}</p>
                </div>

                <div class="topics-list">
                  <div 
                    v-for="topic in week.topics" 
                    :key="topic.id" 
                    class="topic-item"
                    :class="planStore.progress[topic.id]?.status || 'todo'"
                  >
                    <!-- Status Icon Button (Cycles on click) -->
                    <button 
                      class="status-indicator" 
                      @click="cycleTopicStatus(topic.id)"
                      :title="'Clique para alterar o progresso. Status atual: ' + (planStore.progress[topic.id]?.status || 'Pendente')"
                    >
                      <i v-if="planStore.progress[topic.id]?.status === 'done'" class="pi pi-check-circle status-icon done"></i>
                      <i v-else-if="planStore.progress[topic.id]?.status === 'studying'" class="pi pi-bolt status-icon studying"></i>
                      <i v-else-if="planStore.progress[topic.id]?.status === 'review'" class="pi pi-star-fill status-icon review"></i>
                      <i v-else class="pi pi-circle status-icon todo"></i>
                    </button>

                    <!-- Topic Details -->
                    <div class="topic-info">
                      <div class="topic-title-row">
                        <span class="topic-tag" :class="topic.tagClass">{{ topic.tag }}</span>
                        <h5 class="topic-title">{{ topic.title }}</h5>
                      </div>
                      <p v-if="topic.detail" class="topic-detail">{{ topic.detail }}</p>
                      
                      <!-- Topic Material List -->
                      <div v-if="topic.materials.length > 0" class="materials-links">
                        <span class="materials-label">PDFs:</span>
                        <button 
                          v-for="m in topic.materials" 
                          :key="m.materialId"
                          class="material-link-btn"
                          @click="openMaterial(topic, m.materialId, m.title)"
                          :title="`Abrir ${m.title} (Págs ${m.startPage}-${m.endPage})`"
                        >
                          <i class="pi pi-file-pdf"></i>
                          <span>{{ m.title }}</span>
                        </button>
                      </div>
                    </div>

                    <!-- Topic Actions (Notes button) -->
                    <div class="topic-actions">
                      <Button 
                        icon="pi pi-pencil" 
                        class="p-button-rounded p-button-text" 
                        :class="{ 'note-active': planStore.notes[topic.id] }"
                        @click="editNote(topic)"
                        title="Escrever Anotações"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </SplitterPanel>

      <!-- Right Panel: Side Panel Workspace -->
      <SplitterPanel :size="40" :minSize="30" class="workspace-panel">
        <!-- PDF Viewer Panel -->
        <PdfReaderPanel v-if="pdfStore.pdfViewerOpen" />

        <!-- Study Note Editor Panel -->
        <div v-else-if="activeTopicForNote" class="note-editor-panel">
          <div class="note-header">
            <h3>Anotações: {{ activeTopicForNote.title }}</h3>
            <Button 
              icon="pi pi-times" 
              class="p-button-rounded p-button-text p-button-secondary" 
              @click="activeTopicForNote = null"
            />
          </div>
          <div class="note-body">
            <Textarea 
              v-model="noteContent" 
              rows="12" 
              class="note-textarea"
              placeholder="Digite suas notas de estudo para este tópico aqui..."
            />
            <div class="note-footer">
              <span v-if="noteSaved" class="saved-message">
                <i class="pi pi-check"></i> Anotações salvas!
              </span>
              <Button label="Salvar" icon="pi pi-save" @click="saveNote" />
            </div>
          </div>
        </div>

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

.phase-card {
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  margin-bottom: 16px;
  overflow: hidden;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
}

.phase-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background-color: rgba(26, 34, 54, 0.4);
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
  transition: background-color 0.2s;
}

.phase-header:hover {
  background-color: rgba(26, 34, 54, 0.8);
}

.phase-title {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text-primary);
}

.phase-title h3 {
  font-size: 16px;
  font-weight: 700;
  margin: 0;
}

.phase-subtitle {
  font-size: 12px;
  color: var(--text-secondary);
}

.phase-content {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.week-card {
  border-left: 2px solid var(--border-color);
  padding-left: 16px;
}

.week-header {
  margin-bottom: 12px;
}

.week-header h4 {
  font-size: 14px;
  font-weight: 700;
  margin: 0;
  color: var(--text-primary);
}

.week-subtitle {
  font-size: 12px;
  color: var(--text-secondary);
}

.topics-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.topic-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  background-color: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  transition: all 0.2s;
}

.topic-item:hover {
  border-color: var(--text-muted);
}

.topic-item.studying {
  border-left: 4px solid var(--accent-blue);
  background-color: rgba(99, 138, 255, 0.03);
}

.topic-item.done {
  border-left: 4px solid var(--accent-green);
  background-color: rgba(52, 211, 153, 0.03);
}

.topic-item.review {
  border-left: 4px solid var(--accent-purple);
  background-color: rgba(167, 139, 250, 0.03);
}

.status-indicator {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 2px;
}

.status-icon {
  font-size: 18px;
  transition: transform 0.2s;
}

.status-icon:hover {
  transform: scale(1.15);
}

.status-icon.todo {
  color: var(--text-muted);
}

.status-icon.studying {
  color: var(--accent-blue);
}

.status-icon.done {
  color: var(--accent-green);
}

.status-icon.review {
  color: var(--accent-purple);
}

.topic-info {
  flex-grow: 1;
}

.topic-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}

.topic-tag {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 700;
  text-transform: uppercase;
}

.topic-tag.tag-basic {
  background-color: var(--accent-yellow-dim);
  color: var(--accent-yellow);
}

.topic-tag.tag-es {
  background-color: var(--accent-blue-dim);
  color: var(--accent-blue);
}

.topic-title {
  font-size: 13.5px;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary);
  line-height: 1.4;
}

.topic-detail {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.materials-links {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 6px;
}

.materials-label {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 600;
}

.material-link-btn {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  color: var(--accent-blue);
  padding: 4px 8px;
  border-radius: var(--radius-xs);
  font-size: 11px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.material-link-btn:hover {
  background-color: var(--bg-card-hover);
  color: var(--text-primary);
}

.note-active {
  color: var(--accent-yellow) !important;
}

.workspace-panel {
  background-color: var(--bg-primary);
}

.default-side-workspace {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  align-items: stretch;
}

.pomodoro-tip-card {
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  padding: 16px;
}

.pomodoro-tip-card h4 {
  font-size: 13px;
  color: var(--text-primary);
  margin: 0 0 6px 0;
}

.pomodoro-tip-card p {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
}

/* Note Editor styling */
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
