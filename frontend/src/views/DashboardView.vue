<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useProgramStore } from '../stores/program'
import { useStudyPlanStore } from '../stores/studyPlan'
import Card from 'primevue/card'
import ProgressBar from 'primevue/progressbar'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'

const programStore = useProgramStore()
const planStore = useStudyPlanStore()

const stats = ref<any>(null)
const sessions = ref<any[]>([])
const loading = ref(true)

const fetchDashboardData = async () => {
  if (!programStore.activeProgramId) return
  loading.value = true
  try {
    // 1. Fetch Plan to map program to contest
    await planStore.fetchPlan(programStore.activeProgramId)
    
    // 2. Fetch stats
    if (planStore.contestId) {
      const statsRes = await fetch(`/api/contests/${planStore.contestId}/stats`)
      if (statsRes.ok) {
        stats.value = await statsRes.json()
      }
    }

    // 3. Fetch study sessions
    const sessionsRes = await fetch(`/api/programs/${programStore.activeProgramId}/sessions`)
    if (sessionsRes.ok) {
      sessions.value = await sessionsRes.json()
    }
  } catch (e) {
    console.error('Erro ao carregar dados do painel:', e)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchDashboardData()
})

// Calculate study stats
const totalStudyMinutes = computed(() => {
  if (!sessions.value.length) return 0
  const seconds = sessions.value.reduce((acc, s) => acc + (s.duration || 0), 0)
  return Math.round(seconds / 60)
})

const studySessionsToday = computed(() => {
  const today = new Date().toDateString()
  return sessions.value.filter(s => new Date(s.started_at).toDateString() === today).length
})

// Calculate current streak in consecutive days of activity (sessions)
const currentStreak = computed(() => {
  if (!sessions.value.length) return 0
  
  // Extract unique sorted dates (YYYY-MM-DD) of sessions
  const dates = Array.from(new Set(
    sessions.value.map(s => new Date(s.started_at).toISOString().split('T')[0])
  )).sort((a, b) => new Date(b).getTime() - new Date(a).getTime()) // latest first

  if (dates.length === 0) return 0

  const todayStr = new Date().toISOString().split('T')[0]
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0]
  
  // Streak only counts if active today or yesterday
  if (dates[0] !== todayStr && dates[0] !== yesterdayStr) {
    return 0
  }

  let streak = 1
  for (let i = 0; i < dates.length - 1; i++) {
    const current = new Date(dates[i])
    const prev = new Date(dates[i + 1])
    const diffTime = Math.abs(current.getTime() - prev.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    
    if (diffDays === 1) {
      streak++
    } else if (diffDays > 1) {
      break // broken streak
    }
  }
  return streak
})

const lastFiveSessions = computed(() => {
  return [...sessions.value]
    .sort((a, b) => b.started_at - a.started_at)
    .slice(0, 5)
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
</script>

<template>
  <div class="dashboard-container">
    <div class="header-section">
      <h1 class="page-title">Dashboard de Estudos</h1>
      <p class="page-subtitle">Acompanhe seu progresso, estatísticas e streak no concurso ativo.</p>
    </div>

    <!-- Stats Cards Summary Grid -->
    <div class="stats-cards-grid">
      <!-- Streak Card -->
      <Card class="stat-card streak-card">
        <template #content>
          <div class="stat-card-inner">
            <div class="stat-icon fire">🔥</div>
            <div class="stat-info">
              <span class="stat-value">{{ currentStreak }}</span>
              <span class="stat-label">Dias Seguidos</span>
            </div>
          </div>
        </template>
      </Card>

      <!-- Study Time Card -->
      <Card class="stat-card time-card">
        <template #content>
          <div class="stat-card-inner">
            <div class="stat-icon clock">⏱️</div>
            <div class="stat-info">
              <span class="stat-value">{{ totalStudyMinutes }}</span>
              <span class="stat-label">Minutos Estudados</span>
            </div>
          </div>
        </template>
      </Card>

      <!-- Today Focus Sessions Card -->
      <Card class="stat-card sessions-card">
        <template #content>
          <div class="stat-card-inner">
            <div class="stat-icon target">🎯</div>
            <div class="stat-info">
              <span class="stat-value">{{ studySessionsToday }}</span>
              <span class="stat-label">Sessões Concluídas Hoje</span>
            </div>
          </div>
        </template>
      </Card>

      <!-- Progress Card -->
      <Card class="stat-card progress-card-summary">
        <template #content>
          <div class="stat-card-inner" v-if="stats">
            <div class="stat-icon check">✅</div>
            <div class="stat-info">
              <span class="stat-value">{{ stats.percentage }}%</span>
              <span class="stat-label">Tópicos Concluídos ({{ stats.completedTopics }}/{{ stats.totalTopics }})</span>
            </div>
          </div>
          <div class="stat-card-inner" v-else>
            <div class="stat-icon check">✅</div>
            <div class="stat-info">
              <span class="stat-value">0%</span>
              <span class="stat-label">Sem dados de progresso</span>
            </div>
          </div>
        </template>
      </Card>
    </div>

    <!-- Main Dashboard Panels Split Grid -->
    <div class="dashboard-panels-grid">
      <!-- Left Panel: Cesgranrio Minima Progress check -->
      <Card class="panel-card minima-card" v-if="stats && stats.sectionBreakdown">
        <template #title>
          <div class="panel-title">
            <i class="pi pi-shield shield-icon"></i>
            <span>Requisitos Mínimos (Cesgranrio)</span>
          </div>
        </template>
        
        <template #content>
          <p class="panel-desc">A banca exige pontuações mínimas em blocos específicos. Certifique-se de manter uma cobertura equilibrada de estudos:</p>
          
          <div class="phases-breakdown-list">
            <div v-for="sec in stats.sectionBreakdown" :key="sec.sectionId" class="phase-progress-item">
              <div class="phase-meta-row">
                <span class="phase-name">{{ sec.name }}</span>
                <span class="phase-percent">{{ sec.completed }} de {{ sec.total }} tópicos ({{ sec.percentage }}%)</span>
              </div>
              <ProgressBar :value="sec.percentage" class="phase-progressbar" />
            </div>
          </div>
        </template>
      </Card>

      <!-- Right Panel: Recent study activity -->
      <Card class="panel-card activity-card">
        <template #title>
          <div class="panel-title">
            <i class="pi pi-calendar-times"></i>
            <span>Atividades Recentes</span>
          </div>
        </template>

        <template #content>
          <DataTable 
            :value="lastFiveSessions" 
            class="activity-table p-datatable-sm"
            responsiveLayout="scroll"
            v-if="lastFiveSessions.length > 0"
          >
            <Column header="Horário" style="width: 30%">
              <template #body="slotProps">
                {{ formatDate(slotProps.data.started_at) }}
              </template>
            </Column>
            <Column header="Tipo" style="width: 40%">
              <template #body="slotProps">
                <Tag 
                  :value="getSessionTypeLabel(slotProps.data.type)" 
                  :severity="getSessionTypeSeverity(slotProps.data.type)" 
                />
              </template>
            </Column>
            <Column header="Duração" style="width: 30%">
              <template #body="slotProps">
                {{ formatDuration(slotProps.data.duration) }}
              </template>
            </Column>
          </DataTable>
          <div v-else class="no-activity">
            <i class="pi pi-inbox"></i>
            <p>Nenhuma atividade registrada nos últimos dias.</p>
          </div>
        </template>
      </Card>
    </div>
  </div>
</template>

<style scoped>
.dashboard-container {
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

.stats-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}

.stat-card {
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
}

.stat-card-inner {
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
}

.stat-icon.fire {
  background-color: var(--accent-orange-dim);
  box-shadow: 0 0 15px rgba(251, 146, 60, 0.1);
}

.stat-icon.clock {
  background-color: var(--accent-blue-dim);
}

.stat-icon.target {
  background-color: var(--accent-red-dim);
}

.stat-icon.check {
  background-color: var(--accent-green-dim);
}

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-size: 24px;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1.1;
}

.stat-label {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 2px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.dashboard-panels-grid {
  display: grid;
  grid-template-columns: 1.2fr 0.8fr;
  gap: 24px;
  align-items: start;
}

@media (max-width: 1024px) {
  .dashboard-panels-grid {
    grid-template-columns: 1fr;
  }
}

.panel-card {
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.shield-icon {
  color: var(--accent-blue);
}

.panel-desc {
  font-size: 12.5px;
  color: var(--text-secondary);
  margin-top: 0;
  margin-bottom: 20px;
}

.phases-breakdown-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.phase-progress-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.phase-meta-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  font-weight: 600;
}

.phase-name {
  color: var(--text-primary);
}

.phase-percent {
  color: var(--text-secondary);
}

.phase-progressbar {
  height: 6px;
}

.activity-table {
  background-color: transparent;
}

.no-activity {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  gap: 10px;
  padding: 40px 0;
}

.no-activity i {
  font-size: 32px;
}

.no-activity p {
  font-size: 13px;
  margin: 0;
}
</style>
