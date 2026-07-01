<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useProgramStore } from '../stores/program'
import Card from 'primevue/card'
import ProgressBar from 'primevue/progressbar'
import Chart from 'primevue/chart'

const programStore = useProgramStore()

interface DailyStudy {
  date: string
  minutes: number
  focus: number
  pdf: number
  video: number
  manual: number
}

interface DisciplineProgress {
  id: string
  name: string
  total: number
  done: number
  review: number
  studying: number
  todo: number
  percent: number
}

interface ExerciseSession {
  id: string
  date: string
  sourceType: string
  score: number
  totalQuestions: number
  scorePercent: number
  completedAt: number
}

interface ExerciseByDiscipline {
  name: string
  sessions: number
  avgScore: number
  totalCorrect: number
  totalQuestions: number
}

interface MaterialReading {
  title: string
  pages: number
}

interface HeatmapEntry {
  date: string
  pages: number
}

interface DashboardStats {
  studyTime: {
    totalMinutes: number
    currentStreak: number
    last30Days: DailyStudy[]
  }
  topicProgress: {
    todo: number
    studying: number
    done: number
    review: number
    byDiscipline: DisciplineProgress[]
  }
  exercises: {
    totalSessions: number
    totalQuestionsAnswered: number
    totalCorrect: number
    avgScorePercent: number
    bestSession: ExerciseSession | null
    history: ExerciseSession[]
    byDiscipline: ExerciseByDiscipline[]
  }
  reading: {
    totalPagesRead: number
    byMaterial: MaterialReading[]
    heatmap: HeatmapEntry[]
  }
}

const stats = ref<DashboardStats | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

const fetchStats = async () => {
  if (!programStore.activeProgramId) {
    loading.value = false
    return
  }
  loading.value = true
  error.value = null
  try {
    const res = await fetch(`/api/programs/${programStore.activeProgramId}/dashboard-stats`)
    if (!res.ok) throw new Error('Falha ao carregar dados')
    stats.value = await res.json()
  } catch (e: any) {
    error.value = e.message || 'Erro ao carregar o dashboard'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchStats()
})

// ─── Formatters ───
const formatHours = (minutes: number) => {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

// ─── KPIs ───
const totalTopics = computed(() => {
  if (!stats.value) return 0
  const p = stats.value.topicProgress
  return p.todo + p.studying + p.done + p.review
})

const overallPercent = computed(() => {
  if (!stats.value || totalTopics.value === 0) return 0
  return Math.round((stats.value.topicProgress.done / totalTopics.value) * 100)
})

// ─── Chart: Atividade Diária (últimos 30 dias) ───
const activityChartData = computed(() => {
  if (!stats.value) return null
  const days = stats.value.studyTime.last30Days
  return {
    labels: days.map(d => formatDate(d.date)),
    datasets: [
      {
        type: 'bar' as const,
        label: 'Pomodoro',
        data: days.map(d => d.focus),
        backgroundColor: 'rgba(99, 138, 255, 0.7)',
        borderRadius: 4,
        stack: 'total'
      },
      {
        type: 'bar' as const,
        label: 'PDF',
        data: days.map(d => d.pdf),
        backgroundColor: 'rgba(52, 211, 153, 0.7)',
        borderRadius: 4,
        stack: 'total'
      },
      {
        type: 'bar' as const,
        label: 'Vídeo',
        data: days.map(d => d.video),
        backgroundColor: 'rgba(251, 191, 36, 0.7)',
        borderRadius: 4,
        stack: 'total'
      },
      {
        type: 'bar' as const,
        label: 'Manual',
        data: days.map(d => d.manual),
        backgroundColor: 'rgba(167, 139, 250, 0.7)',
        borderRadius: 4,
        stack: 'total'
      }
    ]
  }
})

const activityChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'top' as const, labels: { color: '#94a3b8', font: { size: 11 } } },
    tooltip: {
      callbacks: {
        label: (ctx: any) => ` ${ctx.dataset.label}: ${ctx.raw}min`
      }
    }
  },
  scales: {
    x: {
      stacked: true,
      ticks: { color: '#64748b', font: { size: 10 }, maxTicksLimit: 10 },
      grid: { color: 'rgba(255,255,255,0.04)' }
    },
    y: {
      stacked: true,
      ticks: { color: '#64748b', font: { size: 10 }, callback: (v: any) => `${v}m` },
      grid: { color: 'rgba(255,255,255,0.06)' }
    }
  }
}

// ─── Chart: Progresso Geral (Donut) ───
const progressDonutData = computed(() => {
  if (!stats.value) return null
  const p = stats.value.topicProgress
  return {
    labels: ['Concluído', 'Revisão', 'Estudando', 'Pendente'],
    datasets: [{
      data: [p.done, p.review, p.studying, p.todo],
      backgroundColor: ['#22c55e', '#3b82f6', '#f59e0b', '#374151'],
      borderColor: ['#16a34a', '#2563eb', '#d97706', '#1f2937'],
      borderWidth: 2,
      hoverOffset: 6
    }]
  }
})

const donutOptions = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: '68%',
  plugins: {
    legend: {
      position: 'bottom' as const,
      labels: { color: '#94a3b8', padding: 16, font: { size: 11 } }
    },
    tooltip: {
      callbacks: {
        label: (ctx: any) => ` ${ctx.label}: ${ctx.raw} tópicos`
      }
    }
  }
}

// ─── Chart: Progresso por Disciplina (Barras horizontais) ───
const disciplineChartData = computed(() => {
  if (!stats.value) return null
  const disciplines = stats.value.topicProgress.byDiscipline.slice(0, 12)
  return {
    labels: disciplines.map(d => d.name.length > 28 ? d.name.slice(0, 26) + '…' : d.name),
    datasets: [
      {
        label: 'Concluído (%)',
        data: disciplines.map(d => d.percent),
        backgroundColor: disciplines.map(d =>
          d.percent >= 80 ? 'rgba(34,197,94,0.75)' :
          d.percent >= 50 ? 'rgba(59,130,246,0.75)' :
          d.percent >= 20 ? 'rgba(245,158,11,0.75)' :
          'rgba(239,68,68,0.65)'
        ),
        borderRadius: 5,
        barThickness: 16
      }
    ]
  }
})

const disciplineChartOptions = {
  indexAxis: 'y' as const,
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx: any) => {
          const d = stats.value?.topicProgress.byDiscipline[ctx.dataIndex]
          return d ? ` ${d.done}/${d.total} tópicos (${d.percent}%)` : ''
        }
      }
    }
  },
  scales: {
    x: {
      min: 0, max: 100,
      ticks: { color: '#64748b', callback: (v: any) => `${v}%` },
      grid: { color: 'rgba(255,255,255,0.05)' }
    },
    y: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { display: false } }
  }
}

// ─── Chart: Evolução de Acertos em Exercícios ───
const exerciseLineData = computed(() => {
  if (!stats.value || stats.value.exercises.history.length === 0) return null
  const history = stats.value.exercises.history
  return {
    labels: history.map(h => formatDate(h.date)),
    datasets: [{
      label: 'Taxa de Acerto (%)',
      data: history.map(h => h.scorePercent),
      borderColor: '#638aff',
      backgroundColor: 'rgba(99,138,255,0.12)',
      fill: true,
      tension: 0.4,
      pointBackgroundColor: history.map(h =>
        h.scorePercent >= 70 ? '#22c55e' : h.scorePercent >= 50 ? '#f59e0b' : '#ef4444'
      ),
      pointRadius: 5,
      pointHoverRadius: 7
    }]
  }
})

const exerciseLineOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx: any) => {
          const h = stats.value?.exercises.history[ctx.dataIndex]
          return h ? ` ${h.score}/${h.totalQuestions} acertos (${h.scorePercent}%)` : ''
        }
      }
    }
  },
  scales: {
    x: { ticks: { color: '#64748b', font: { size: 10 }, maxTicksLimit: 10 }, grid: { color: 'rgba(255,255,255,0.04)' } },
    y: {
      min: 0, max: 100,
      ticks: { color: '#64748b', callback: (v: any) => `${v}%` },
      grid: { color: 'rgba(255,255,255,0.06)' }
    }
  }
}

// ─── Chart: Acerto por Disciplina (barras) ───
const exerciseDisciplineData = computed(() => {
  if (!stats.value || stats.value.exercises.byDiscipline.length === 0) return null
  const data = stats.value.exercises.byDiscipline.slice(0, 8)
  return {
    labels: data.map(d => d.name.length > 20 ? d.name.slice(0, 18) + '…' : d.name),
    datasets: [{
      label: 'Média de Acertos (%)',
      data: data.map(d => d.avgScore),
      backgroundColor: data.map(d =>
        d.avgScore >= 70 ? 'rgba(34,197,94,0.75)' :
        d.avgScore >= 50 ? 'rgba(245,158,11,0.75)' :
        'rgba(239,68,68,0.65)'
      ),
      borderRadius: 5
    }]
  }
})

const exerciseDisciplineOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
    y: {
      min: 0, max: 100,
      ticks: { color: '#64748b', callback: (v: any) => `${v}%` },
      grid: { color: 'rgba(255,255,255,0.06)' }
    }
  }
}

// ─── Chart: Páginas lidas por material ───
const readingMaterialData = computed(() => {
  if (!stats.value || stats.value.reading.byMaterial.length === 0) return null
  const data = stats.value.reading.byMaterial
  return {
    labels: data.map(m => m.title.length > 22 ? m.title.slice(0, 20) + '…' : m.title),
    datasets: [{
      label: 'Páginas lidas',
      data: data.map(m => m.pages),
      backgroundColor: 'rgba(99,138,255,0.7)',
      borderRadius: 5
    }]
  }
})

const readingMaterialOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
    y: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.06)' } }
  }
}

// ─── Heatmap de leitura (60 dias) ───
const heatmapData = computed(() => {
  if (!stats.value) return []
  const map: Record<string, number> = {}
  stats.value.reading.heatmap.forEach(h => { map[h.date] = h.pages })

  const cells = []
  for (let i = 59; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
    const dateStr = d.toISOString().split('T')[0]
    const pages = map[dateStr] || 0
    const intensity = pages === 0 ? 0 : pages <= 5 ? 1 : pages <= 15 ? 2 : pages <= 30 ? 3 : 4
    cells.push({ date: dateStr, pages, intensity })
  }
  return cells
})

const heatmapIntensityClass = (intensity: number) => {
  const classes = ['hm-0', 'hm-1', 'hm-2', 'hm-3', 'hm-4']
  return classes[intensity] || 'hm-0'
}
</script>

<template>
  <div class="dashboard-container">
    <!-- Header -->
    <div class="header-section">
      <h1 class="page-title">📊 Dashboard de Progresso</h1>
      <p class="page-subtitle">Central de estatísticas e acompanhamento dos seus estudos.</p>
      <button class="btn-refresh" @click="fetchStats" :disabled="loading" aria-label="Atualizar dados">
        <i class="pi pi-refresh" :class="{ 'pi-spin': loading }" aria-hidden="true"></i>
        Atualizar
      </button>
    </div>

    <!-- Sem programa ativo -->
    <div v-if="!programStore.activeProgramId" class="empty-state-banner">
      <i class="pi pi-info-circle" aria-hidden="true"></i>
      <p>Selecione um programa ativo no topo da página para ver seu progresso.</p>
    </div>

    <!-- Erro -->
    <div v-else-if="error" class="error-banner">
      <i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
      <p>{{ error }}</p>
    </div>

    <!-- Skeleton Loading -->
    <template v-else-if="loading">
      <div class="stats-cards-grid">
        <div v-for="i in 6" :key="i" class="skeleton-card"></div>
      </div>
      <div class="skeleton-chart tall"></div>
      <div class="charts-row-2">
        <div class="skeleton-chart"></div>
        <div class="skeleton-chart"></div>
      </div>
    </template>

    <!-- Conteúdo real -->
    <template v-else-if="stats">

      <!-- ═══ SEÇÃO 1: KPI CARDS ═══ -->
      <div class="stats-cards-grid">
        <!-- Streak -->
        <Card class="stat-card">
          <template #content>
            <div class="stat-card-inner">
              <div class="stat-icon fire">🔥</div>
              <div class="stat-info">
                <span class="stat-value">{{ stats.studyTime.currentStreak }}</span>
                <span class="stat-label">Dias Seguidos</span>
              </div>
            </div>
          </template>
        </Card>

        <!-- Total horas -->
        <Card class="stat-card">
          <template #content>
            <div class="stat-card-inner">
              <div class="stat-icon clock">⏱️</div>
              <div class="stat-info">
                <span class="stat-value">{{ formatHours(stats.studyTime.totalMinutes) }}</span>
                <span class="stat-label">Tempo Total Estudado</span>
              </div>
            </div>
          </template>
        </Card>

        <!-- Tópicos concluídos -->
        <Card class="stat-card">
          <template #content>
            <div class="stat-card-inner">
              <div class="stat-icon check">✅</div>
              <div class="stat-info">
                <span class="stat-value">{{ overallPercent }}%</span>
                <span class="stat-label">Tópicos Concluídos ({{ stats.topicProgress.done }}/{{ totalTopics }})</span>
              </div>
            </div>
          </template>
        </Card>

        <!-- Taxa de acerto -->
        <Card class="stat-card">
          <template #content>
            <div class="stat-card-inner">
              <div class="stat-icon target">🎯</div>
              <div class="stat-info">
                <span class="stat-value" :class="stats.exercises.avgScorePercent >= 70 ? 'text-green' : stats.exercises.avgScorePercent >= 50 ? 'text-amber' : 'text-red'">
                  {{ stats.exercises.avgScorePercent }}%
                </span>
                <span class="stat-label">Taxa de Acerto ({{ stats.exercises.totalQuestionsAnswered }} questões)</span>
              </div>
            </div>
          </template>
        </Card>

        <!-- Questões respondidas -->
        <Card class="stat-card">
          <template #content>
            <div class="stat-card-inner">
              <div class="stat-icon book">📝</div>
              <div class="stat-info">
                <span class="stat-value">{{ stats.exercises.totalSessions }}</span>
                <span class="stat-label">Simulados Realizados</span>
              </div>
            </div>
          </template>
        </Card>

        <!-- Páginas lidas -->
        <Card class="stat-card">
          <template #content>
            <div class="stat-card-inner">
              <div class="stat-icon pdf">📖</div>
              <div class="stat-info">
                <span class="stat-value">{{ stats.reading.totalPagesRead }}</span>
                <span class="stat-label">Páginas de PDF Lidas</span>
              </div>
            </div>
          </template>
        </Card>
      </div>

      <!-- ═══ SEÇÃO 2: ATIVIDADE DIÁRIA (30 dias) ═══ -->
      <Card class="panel-card">
        <template #title>
          <div class="panel-title">
            <i class="pi pi-calendar" aria-hidden="true"></i>
            <span>Atividade de Estudo — Últimos 30 Dias</span>
          </div>
        </template>
        <template #content>
          <div class="chart-wrapper tall" v-if="activityChartData">
            <Chart type="bar" :data="activityChartData" :options="activityChartOptions" />
          </div>
          <div class="no-data" v-else>
            <i class="pi pi-chart-bar" aria-hidden="true"></i>
            <p>Nenhuma sessão de estudo registrada nos últimos 30 dias.</p>
          </div>
        </template>
      </Card>

      <!-- ═══ SEÇÃO 3 + 4: DONUT + DISCIPLINAS ═══ -->
      <div class="charts-row-2">
        <!-- Donut — Progresso Geral -->
        <Card class="panel-card">
          <template #title>
            <div class="panel-title">
              <i class="pi pi-chart-pie" aria-hidden="true"></i>
              <span>Progresso Geral por Status</span>
            </div>
          </template>
          <template #content>
            <div class="donut-wrapper" v-if="progressDonutData && totalTopics > 0">
              <div class="donut-center-label">
                <span class="donut-percent">{{ overallPercent }}%</span>
                <span class="donut-sublabel">Concluído</span>
              </div>
              <Chart type="doughnut" :data="progressDonutData" :options="donutOptions" class="donut-chart" />
            </div>
            <div class="no-data" v-else>
              <i class="pi pi-chart-pie" aria-hidden="true"></i>
              <p>Nenhum dado de progresso disponível.</p>
            </div>
          </template>
        </Card>

        <!-- Barras — Por Disciplina -->
        <Card class="panel-card chart-discipline">
          <template #title>
            <div class="panel-title">
              <i class="pi pi-list-check" aria-hidden="true"></i>
              <span>Progresso por Disciplina</span>
            </div>
          </template>
          <template #content>
            <div class="chart-wrapper discipline-chart" v-if="disciplineChartData">
              <Chart type="bar" :data="disciplineChartData" :options="disciplineChartOptions" />
            </div>
            <div class="no-data" v-else>
              <i class="pi pi-list" aria-hidden="true"></i>
              <p>Nenhuma disciplina encontrada.</p>
            </div>
          </template>
        </Card>
      </div>

      <!-- ═══ SEÇÃO 5: EXERCÍCIOS ═══ -->
      <Card class="panel-card">
        <template #title>
          <div class="panel-title">
            <i class="pi pi-bolt" aria-hidden="true"></i>
            <span>Performance em Exercícios</span>
          </div>
        </template>
        <template #content>
          <div v-if="stats.exercises.totalSessions > 0">
            <!-- Mini KPIs de exercícios -->
            <div class="exercise-kpi-row">
              <div class="exercise-kpi">
                <span class="ekpi-value">{{ stats.exercises.totalQuestionsAnswered }}</span>
                <span class="ekpi-label">Questões respondidas</span>
              </div>
              <div class="exercise-kpi">
                <span class="ekpi-value" :class="stats.exercises.avgScorePercent >= 70 ? 'text-green' : stats.exercises.avgScorePercent >= 50 ? 'text-amber' : 'text-red'">
                  {{ stats.exercises.avgScorePercent }}%
                </span>
                <span class="ekpi-label">Média geral de acertos</span>
              </div>
              <div class="exercise-kpi" v-if="stats.exercises.bestSession">
                <span class="ekpi-value text-green">{{ stats.exercises.bestSession.scorePercent }}%</span>
                <span class="ekpi-label">Melhor sessão ({{ formatDate(stats.exercises.bestSession.date) }})</span>
              </div>
            </div>

            <!-- Gráfico de evolução -->
            <p class="chart-sub-title">Evolução da taxa de acerto por sessão</p>
            <div class="chart-wrapper medium" v-if="exerciseLineData">
              <Chart type="line" :data="exerciseLineData" :options="exerciseLineOptions" />
            </div>

            <!-- Gráfico por disciplina -->
            <div v-if="exerciseDisciplineData">
              <p class="chart-sub-title">Média de acertos por disciplina</p>
              <div class="chart-wrapper medium">
                <Chart type="bar" :data="exerciseDisciplineData" :options="exerciseDisciplineOptions" />
              </div>
            </div>
          </div>
          <div class="no-data" v-else>
            <i class="pi pi-bolt" aria-hidden="true"></i>
            <p>Nenhum simulado concluído ainda. Complete seu primeiro exercício!</p>
          </div>
        </template>
      </Card>

      <!-- ═══ SEÇÃO 6: LEITURA DE PDFs ═══ -->
      <Card class="panel-card">
        <template #title>
          <div class="panel-title">
            <i class="pi pi-file-pdf" aria-hidden="true"></i>
            <span>Leitura de Materiais (PDF)</span>
          </div>
        </template>
        <template #content>
          <div v-if="stats.reading.totalPagesRead > 0">
            <!-- Páginas por material -->
            <p class="chart-sub-title">Páginas lidas por material</p>
            <div class="chart-wrapper medium" v-if="readingMaterialData">
              <Chart type="bar" :data="readingMaterialData" :options="readingMaterialOptions" />
            </div>

            <!-- Heatmap 60 dias -->
            <p class="chart-sub-title">Heatmap de leitura — últimos 60 dias</p>
            <div class="heatmap-container">
              <div
                v-for="cell in heatmapData"
                :key="cell.date"
                :class="['hm-cell', heatmapIntensityClass(cell.intensity)]"
                :title="`${cell.date}: ${cell.pages} pág.`"
              ></div>
            </div>
            <div class="heatmap-legend">
              <span class="hm-legend-label">Menos</span>
              <div class="hm-cell hm-0"></div>
              <div class="hm-cell hm-1"></div>
              <div class="hm-cell hm-2"></div>
              <div class="hm-cell hm-3"></div>
              <div class="hm-cell hm-4"></div>
              <span class="hm-legend-label">Mais</span>
            </div>
          </div>
          <div class="no-data" v-else>
            <i class="pi pi-file-pdf" aria-hidden="true"></i>
            <p>Nenhuma leitura de PDF registrada ainda.</p>
          </div>
        </template>
      </Card>

      <!-- ═══ SEÇÃO 7: REQUISITOS MÍNIMOS CESGRANRIO ═══ -->
      <Card class="panel-card" v-if="stats.topicProgress.byDiscipline.length > 0">
        <template #title>
          <div class="panel-title">
            <i class="pi pi-shield" aria-hidden="true"></i>
            <span>Progresso por Disciplina — Detalhado</span>
          </div>
        </template>
        <template #content>
          <p class="panel-desc">
            Cobertura de tópicos por disciplina. Cor indica nível: 
            <span class="tag green">≥80% Ótimo</span>
            <span class="tag blue">≥50% Bom</span>
            <span class="tag amber">≥20% Regular</span>
            <span class="tag red">&lt;20% Atenção</span>
          </p>
          <div class="phases-breakdown-list">
            <div
              v-for="disc in stats.topicProgress.byDiscipline"
              :key="disc.id"
              class="phase-progress-item"
            >
              <div class="phase-meta-row">
                <span class="phase-name">{{ disc.name }}</span>
                <span class="phase-percent">{{ disc.done }}/{{ disc.total }} tópicos ({{ disc.percent }}%)</span>
              </div>
              <ProgressBar
                :value="disc.percent"
                :class="[
                  'phase-progressbar',
                  disc.percent >= 80 ? 'pb-green' : disc.percent >= 50 ? 'pb-blue' : disc.percent >= 20 ? 'pb-amber' : 'pb-red'
                ]"
              />
            </div>
          </div>
        </template>
      </Card>

    </template>
  </div>
</template>

<style scoped>
/* ─── Layout ─── */
.dashboard-container {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.header-section {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 16px;
}

.page-title {
  font-size: 22px;
  font-weight: 800;
  margin: 0;
  color: var(--text-primary);
  flex: 1;
}

.page-subtitle {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0;
}

.btn-refresh {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-refresh:hover { color: var(--text-primary); border-color: var(--accent-blue); }
.btn-refresh:disabled { opacity: 0.5; cursor: not-allowed; }

/* ─── KPI Cards ─── */
.stats-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.stat-card {
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  transition: transform 0.2s, box-shadow 0.2s;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.2);
}

.stat-card-inner { display: flex; align-items: center; gap: 14px; }

.stat-icon {
  width: 46px; height: 46px;
  border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  font-size: 22px; flex-shrink: 0;
}

.fire { background: var(--accent-orange-dim, rgba(251,146,60,0.15)); }
.clock { background: var(--accent-blue-dim, rgba(99,138,255,0.15)); }
.check { background: var(--accent-green-dim, rgba(34,197,94,0.15)); }
.target { background: var(--accent-red-dim, rgba(239,68,68,0.15)); }
.book { background: rgba(167,139,250,0.15); }
.pdf { background: rgba(52,211,153,0.15); }

.stat-info { display: flex; flex-direction: column; }
.stat-value { font-size: 22px; font-weight: 800; color: var(--text-primary); line-height: 1.1; }
.stat-label { font-size: 10.5px; color: var(--text-secondary); margin-top: 3px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.4px; }

.text-green { color: #22c55e !important; }
.text-amber { color: #f59e0b !important; }
.text-red { color: #ef4444 !important; }

/* ─── Panel Cards ─── */
.panel-card {
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg, 0 4px 20px rgba(0,0,0,0.15));
}

.panel-title {
  display: flex; align-items: center; gap: 10px;
  font-size: 15px; font-weight: 700; color: var(--text-primary);
}

.panel-desc { font-size: 12px; color: var(--text-secondary); margin: 0 0 16px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.panel-desc .tag { padding: 2px 8px; border-radius: 99px; font-size: 11px; font-weight: 600; }
.tag.green { background: rgba(34,197,94,0.15); color: #22c55e; }
.tag.blue { background: rgba(59,130,246,0.15); color: #3b82f6; }
.tag.amber { background: rgba(245,158,11,0.15); color: #f59e0b; }
.tag.red { background: rgba(239,68,68,0.15); color: #ef4444; }

.chart-sub-title { font-size: 12.5px; color: var(--text-secondary); font-weight: 600; margin: 20px 0 10px; text-transform: uppercase; letter-spacing: 0.5px; }

/* ─── Chart sizes ─── */
.chart-wrapper { width: 100%; }
.chart-wrapper.tall { height: 280px; }
.chart-wrapper.medium { height: 230px; }
.chart-wrapper.discipline-chart { height: 320px; }

/* ─── Donut ─── */
.donut-wrapper { position: relative; display: flex; justify-content: center; }
.donut-chart { max-height: 280px; }
.donut-center-label {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -58%);
  display: flex; flex-direction: column; align-items: center;
  pointer-events: none;
}
.donut-percent { font-size: 28px; font-weight: 800; color: var(--text-primary); }
.donut-sublabel { font-size: 11px; color: var(--text-secondary); text-transform: uppercase; font-weight: 500; }

/* ─── 2-column row ─── */
.charts-row-2 {
  display: grid;
  grid-template-columns: 1fr 1.6fr;
  gap: 24px;
}

@media (max-width: 1024px) {
  .charts-row-2 { grid-template-columns: 1fr; }
}

/* ─── Exercise KPIs ─── */
.exercise-kpi-row {
  display: flex; gap: 24px; flex-wrap: wrap;
  margin-bottom: 20px;
  padding: 16px;
  background: var(--bg-glass, rgba(255,255,255,0.03));
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
}
.exercise-kpi { display: flex; flex-direction: column; }
.ekpi-value { font-size: 28px; font-weight: 800; color: var(--text-primary); }
.ekpi-label { font-size: 11px; color: var(--text-secondary); text-transform: uppercase; font-weight: 500; letter-spacing: 0.4px; }

/* ─── Heatmap ─── */
.heatmap-container {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  margin-top: 8px;
}
.hm-cell {
  width: 14px; height: 14px;
  border-radius: 3px;
  cursor: default;
  transition: transform 0.1s;
}
.hm-cell:hover { transform: scale(1.4); }

.hm-0 { background: rgba(255,255,255,0.06); }
.hm-1 { background: rgba(99,138,255,0.3); }
.hm-2 { background: rgba(99,138,255,0.55); }
.hm-3 { background: rgba(99,138,255,0.8); }
.hm-4 { background: #638aff; box-shadow: 0 0 6px rgba(99,138,255,0.5); }

.heatmap-legend {
  display: flex; align-items: center; gap: 4px;
  margin-top: 10px; font-size: 11px; color: var(--text-secondary);
}
.hm-legend-label { font-size: 11px; }

/* ─── Discipline list ─── */
.phases-breakdown-list { display: flex; flex-direction: column; gap: 14px; }
.phase-progress-item { display: flex; flex-direction: column; gap: 5px; }
.phase-meta-row { display: flex; justify-content: space-between; font-size: 12px; font-weight: 600; }
.phase-name { color: var(--text-primary); }
.phase-percent { color: var(--text-secondary); }

:deep(.phase-progressbar.pb-green .p-progressbar-value) { background: #22c55e !important; }
:deep(.phase-progressbar.pb-blue .p-progressbar-value) { background: #3b82f6 !important; }
:deep(.phase-progressbar.pb-amber .p-progressbar-value) { background: #f59e0b !important; }
:deep(.phase-progressbar.pb-red .p-progressbar-value) { background: #ef4444 !important; }
:deep(.phase-progressbar) { height: 6px; border-radius: 99px; }

/* ─── Empty / Error / Loading ─── */
.no-data {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; padding: 40px 0;
  color: var(--text-muted, #6e7681); gap: 10px;
}
.no-data i { font-size: 32px; opacity: 0.5; }
.no-data p { font-size: 13px; margin: 0; }

.empty-state-banner, .error-banner {
  display: flex; align-items: center; gap: 12px;
  padding: 16px 20px; border-radius: var(--radius);
  font-size: 13.5px;
}
.empty-state-banner { background: rgba(99,138,255,0.08); border: 1px solid rgba(99,138,255,0.25); color: var(--text-secondary); }
.error-banner { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.25); color: #ef4444; }

.skeleton-card {
  height: 90px; border-radius: var(--radius);
  background: linear-gradient(90deg, var(--bg-card) 25%, rgba(255,255,255,0.04) 50%, var(--bg-card) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
  border: 1px solid var(--border-color);
}
.skeleton-chart {
  height: 220px; border-radius: var(--radius);
  background: linear-gradient(90deg, var(--bg-card) 25%, rgba(255,255,255,0.04) 50%, var(--bg-card) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
  border: 1px solid var(--border-color);
}
.skeleton-chart.tall { height: 300px; }
.charts-row-2.skeleton { display: grid; grid-template-columns: 1fr 1.6fr; gap: 24px; }

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
</style>
