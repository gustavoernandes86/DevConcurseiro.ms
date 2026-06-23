<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useProgramStore } from '../stores/program'
import { useStudyPlanStore } from '../stores/studyPlan'
import Card from 'primevue/card'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'
import Button from 'primevue/button'

const programStore = useProgramStore()
const planStore = useStudyPlanStore()

const activeTab = ref<'sessions' | 'notes'>('sessions')
const sessionsList = ref<any[]>([])
const loading = ref(true)

const fetchHistoryData = async () => {
  if (!programStore.activeProgramId) return
  loading.value = true
  try {
    // 1. Fetch study sessions
    const sessionsRes = await fetch(`/api/programs/${programStore.activeProgramId}/sessions`)
    if (sessionsRes.ok) {
      sessionsList.value = await sessionsRes.json()
    }
    
    // 2. Fetch study plan (for topic title lookups)
    await planStore.fetchPlan(programStore.activeProgramId)
  } catch (e) {
    console.error('Erro ao carregar histórico:', e)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchHistoryData()
})

// Topic title lookup mapper helper
const getTopicTitle = (topicId: string | null) => {
  if (!topicId) return 'Estudo Geral / Não Vinculado'
  
  // Search within studyPlanStore phases/weeks
  for (const phase of planStore.phases) {
    for (const week of phase.weeks) {
      const topic = week.topics.find(t => t.id === topicId)
      if (topic) {
        return `${topic.tag}: ${topic.title}`
      }
    }
  }
  return topicId // fallback to ID
}

// Map list of notes for the data table
const notesList = computed(() => {
  const list: { topicId: string; title: string; content: string }[] = []
  Object.entries(planStore.notes).forEach(([topicId, content]) => {
    if (content.trim()) {
      list.push({
        topicId,
        title: getTopicTitle(topicId),
        content
      })
    }
  })
  return list
})

const sortedSessions = computed(() => {
  return [...sessionsList.value].sort((a, b) => b.started_at - a.started_at)
})

const formatDuration = (seconds?: number) => {
  if (!seconds) return '0s'
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const leftSeconds = seconds % 60
  return leftSeconds > 0 ? `${minutes}m ${leftSeconds}s` : `${minutes}m`
}

const formatDate = (timestamp?: number) => {
  if (!timestamp) return '-'
  return new Date(timestamp).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const getSessionTypeSeverity = (type: string) => {
  switch (type) {
    case 'focus': return 'success'
    case 'short_break': return 'info'
    case 'long_break': return 'warn'
    default: return 'secondary'
  }
}

const getSessionTypeLabel = (type: string) => {
  switch (type) {
    case 'focus': return 'Foco Pomodoro'
    case 'short_break': return 'Intervalo Curto'
    case 'long_break': return 'Intervalo Longo'
    case 'pdf': return 'Leitura PDF'
    default: return 'Manual/Vídeo'
  }
}

const deleteSession = async (sessionId: string) => {
  if (!confirm('Deseja realmente excluir este registro de estudo do seu histórico?')) return
  try {
    const res = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' })
    if (res.ok) {
      sessionsList.value = sessionsList.value.filter(s => String(s.id) !== String(sessionId))
    }
  } catch (err) {
    console.error('Falha ao excluir sessão:', err)
  }
}
</script>

<template>
  <div class="history-view-container">
    <div class="header-section">
      <h1 class="page-title">Histórico de Atividades</h1>
      <p class="page-subtitle">Visualize todo o seu registro cronológico de foco, notas salvas e revisões.</p>
    </div>

    <!-- Tab selectors -->
    <div class="history-tabs-bar">
      <button 
        class="tab-btn" 
        :class="{ active: activeTab === 'sessions' }"
        @click="activeTab = 'sessions'"
      >
        <i class="pi pi-clock"></i>
        <span>Sessões de Estudo</span>
      </button>

      <button 
        class="tab-btn" 
        :class="{ active: activeTab === 'notes' }"
        @click="activeTab = 'notes'"
      >
        <i class="pi pi-pencil"></i>
        <span>Notas de Estudo</span>
      </button>
    </div>

    <!-- Active Tab Display -->
    <div class="history-content-panel">
      <!-- Study Sessions Tab -->
      <Card v-if="activeTab === 'sessions'" class="history-panel-card">
        <template #content>
          <DataTable 
            :value="sortedSessions" 
            class="history-datatable p-datatable-sm" 
            :paginator="true" 
            :rows="10"
            responsiveLayout="scroll"
            v-if="sortedSessions.length > 0"
          >
            <Column header="Horário de Início" style="width: 25%">
              <template #body="slotProps">
                {{ formatDate(slotProps.data.started_at) }}
              </template>
            </Column>
            <Column header="Tipo" style="width: 20%">
              <template #body="slotProps">
                <Tag 
                  :value="getSessionTypeLabel(slotProps.data.type)" 
                  :severity="getSessionTypeSeverity(slotProps.data.type)" 
                />
              </template>
            </Column>
            <Column header="Tópico Vinculado" style="width: 30%">
              <template #body="slotProps">
                {{ getTopicTitle(slotProps.data.topic_id) }}
              </template>
            </Column>
            <Column header="Duração" style="width: 15%">
              <template #body="slotProps">
                {{ formatDuration(slotProps.data.duration) }}
              </template>
            </Column>
            <Column header="Ação" style="width: 10%">
              <template #body="slotProps">
                <Button 
                  icon="pi pi-trash" 
                  severity="danger" 
                  text 
                  rounded
                  @click="deleteSession(slotProps.data.id)"
                  title="Excluir Registro"
                />
              </template>
            </Column>
          </DataTable>
          <div v-else class="no-data-display">
            <i class="pi pi-calendar-minus"></i>
            <p>Nenhuma sessão de estudo gravada no banco de dados.</p>
          </div>
        </template>
      </Card>

      <!-- Study Notes Tab -->
      <Card v-else class="history-panel-card">
        <template #content>
          <DataTable 
            :value="notesList" 
            class="history-datatable p-datatable-sm" 
            :paginator="true" 
            :rows="10"
            responsiveLayout="scroll"
            v-if="notesList.length > 0"
          >
            <Column header="Tópico / Matéria" style="width: 35%">
              <template #body="slotProps">
                <strong>{{ slotProps.data.title }}</strong>
              </template>
            </Column>
            <Column header="Anotação Escrita" style="width: 65%">
              <template #body="slotProps">
                <p class="note-snippet">{{ slotProps.data.content }}</p>
              </template>
            </Column>
          </DataTable>
          <div v-else class="no-data-display">
            <i class="pi pi-pencil"></i>
            <p>Nenhuma nota ou resumo de estudo escrita até o momento.</p>
          </div>
        </template>
      </Card>
    </div>
  </div>
</template>

<style scoped>
.history-view-container {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.header-section {
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 16px;
}

.page-title {
  font-size: 24px;
  font-weight: 800;
  margin: 0;
  color: var(--text-primary);
}

.page-subtitle {
  font-size: 13.5px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.history-tabs-bar {
  display: flex;
  gap: 12px;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 8px;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-secondary);
  padding: 8px 16px 12px 16px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.tab-btn:hover {
  color: var(--text-primary);
}

.tab-btn.active {
  color: var(--accent-blue);
  border-bottom-color: var(--accent-blue);
}

.history-content-panel {
  display: flex;
  flex-direction: column;
}

.history-panel-card {
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
}

.history-datatable {
  background-color: transparent;
}

.no-data-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  gap: 12px;
  padding: 60px 0;
}

.no-data-display i {
  font-size: 40px;
}

.no-data-display p {
  font-size: 13.5px;
  margin: 0;
}

.note-snippet {
  font-size: 13px;
  color: var(--text-primary);
  white-space: pre-wrap;
  line-height: 1.4;
  margin: 0;
  max-height: 120px;
  overflow-y: auto;
}
</style>
