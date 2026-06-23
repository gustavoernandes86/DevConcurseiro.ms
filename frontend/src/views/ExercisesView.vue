<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useExerciseStore } from '../stores/exercise'
import type { Question } from '../stores/exercise'
import { useProgramStore } from '../stores/program'
import Button from 'primevue/button'
import Card from 'primevue/card'
import ProgressBar from 'primevue/progressbar'
import Tag from 'primevue/tag'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Dialog from 'primevue/dialog'

const exerciseStore = useExerciseStore()
const programStore = useProgramStore()

// Quiz state
const activeQuizMode = ref(false)
const selectedAnswers = ref<Record<string, string>>({})
const currentQuestionIndex = ref(0)
const quizCompleted = ref(false)
const quizScore = ref(0)

// Dialog history state
const viewHistoryDialog = ref(false)
const selectedHistorySession = ref<any>(null)

onMounted(async () => {
  if (programStore.activeProgramId) {
    await exerciseStore.fetchTodayStatus(programStore.activeProgramId)
    await exerciseStore.fetchHistory(programStore.activeProgramId)
    
    // Resume quiz if session exists but answers are not saved yet
    if (exerciseStore.todaySession && !exerciseStore.todaySession.completedAt) {
      activeQuizMode.value = true
      selectedAnswers.value = {}
      currentQuestionIndex.value = 0
      quizCompleted.value = false
    }
  }
})

const activeQuestion = computed<Question | null>(() => {
  if (!exerciseStore.todaySession || !exerciseStore.todaySession.questions) return null
  return exerciseStore.todaySession.questions[currentQuestionIndex.value] || null
})

const generateSimulado = async () => {
  if (!programStore.activeProgramId) return
  try {
    await exerciseStore.generateTodayExercises(programStore.activeProgramId)
    activeQuizMode.value = true
    selectedAnswers.value = {}
    currentQuestionIndex.value = 0
    quizCompleted.value = false
  } catch (err: any) {
    console.error('Falha ao gerar simulado:', err.message)
  }
}

const selectOption = (optionKey: string) => {
  if (!activeQuestion.value) return
  selectedAnswers.value[activeQuestion.value.id] = optionKey
}

const nextQuestion = () => {
  if (currentQuestionIndex.value < (exerciseStore.todaySession?.questions.length || 1) - 1) {
    currentQuestionIndex.value++
  }
}

const prevQuestion = () => {
  if (currentQuestionIndex.value > 0) {
    currentQuestionIndex.value--
  }
}

const finishQuiz = async () => {
  if (!exerciseStore.todaySession || !programStore.activeProgramId) return
  
  let correctCount = 0
  const questions = exerciseStore.todaySession.questions
  
  questions.forEach(q => {
    if (selectedAnswers.value[q.id] === q.correct) {
      correctCount++
    }
  })
  
  // Save results to server
  await exerciseStore.saveAnswers(
    programStore.activeProgramId,
    exerciseStore.todaySession.id,
    selectedAnswers.value,
    correctCount
  )
  
  quizScore.value = correctCount
  quizCompleted.value = true
  activeQuizMode.value = false
  
  // Refresh history list
  await exerciseStore.fetchHistory(programStore.activeProgramId)
}

const showHistoryDetail = (session: any) => {
  selectedHistorySession.value = session
  viewHistoryDialog.value = true
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
</script>

<template>
  <div class="exercises-container">
    <div class="header-section">
      <h1 class="page-title">Simulados Inteligentes com IA</h1>
      <p class="page-subtitle">Testes gerados dinamicamente com base nas páginas de PDFs que você leu no dia.</p>
    </div>

    <div class="exercises-grid">
      <!-- Left side: Today's generator panel -->
      <div class="generator-panel">
        <!-- Generator Initial Mode -->
        <Card v-if="!activeQuizMode && (!exerciseStore.todaySession || exerciseStore.todaySession.completedAt)" class="generator-card">
          <template #title>
            <div class="card-title">
              <i class="pi pi-sparkles spark-icon"></i>
              <span>Simulado Diário</span>
            </div>
          </template>
          
          <template #content>
            <div class="pages-metric">
              <div class="metric-circle">
                <span class="metric-num">{{ exerciseStore.todayPagesReadCount }}</span>
                <span class="metric-label">Páginas lidas hoje</span>
              </div>
            </div>

            <div class="generator-info">
              <p v-if="exerciseStore.todayPagesReadCount > 0">
                Parabéns! Você leu <strong>{{ exerciseStore.todayPagesReadCount }}</strong> páginas hoje. 
                O gerador de IA irá compilar um simulado com <strong>10 questões de múltipla escolha (A-E)</strong> com base nesse conteúdo.
              </p>
              <p v-else class="warning-text">
                <i class="pi pi-exclamation-triangle"></i>
                Você precisa registrar e ler pelo menos 1 página de PDF nos livros didáticos hoje para gerar um simulado adaptativo.
              </p>
            </div>

            <div class="action-row">
              <Button 
                label="Gerar Simulado do Dia" 
                icon="pi pi-cog" 
                :loading="exerciseStore.loading" 
                :disabled="exerciseStore.todayPagesReadCount === 0" 
                class="p-button-lg w-full"
                @click="generateSimulado" 
              />
            </div>
          </template>
        </Card>

        <!-- Quiz Answering Mode -->
        <Card v-else-if="activeQuizMode && activeQuestion" class="quiz-card">
          <template #title>
            <div class="quiz-header-row">
              <span class="question-index">Questão {{ currentQuestionIndex + 1 }} de {{ exerciseStore.todaySession?.questions.length }}</span>
              <ProgressBar :value="Math.round(((currentQuestionIndex + 1) / (exerciseStore.todaySession?.questions.length || 1)) * 100)" class="quiz-progress" />
            </div>
          </template>

          <template #content>
            <!-- Question Content -->
            <div class="question-body">
              <p class="question-text">{{ activeQuestion.text }}</p>
              
              <!-- Alternatives List -->
              <div class="alternatives-list">
                <button 
                  v-for="(text, key) in activeQuestion.options" 
                  :key="key"
                  class="alternative-btn"
                  :class="{ selected: selectedAnswers[activeQuestion.id] === key }"
                  @click="selectOption(key)"
                >
                  <span class="alternative-letter">{{ key }}</span>
                  <span class="alternative-text">{{ text }}</span>
                </button>
              </div>
            </div>

            <!-- Navigation Controls -->
            <div class="quiz-navigation">
              <Button 
                label="Anterior" 
                icon="pi pi-chevron-left" 
                outlined 
                :disabled="currentQuestionIndex === 0"
                @click="prevQuestion" 
              />

              <Button 
                v-if="currentQuestionIndex === (exerciseStore.todaySession?.questions.length || 1) - 1"
                label="Concluir e Enviar" 
                icon="pi pi-check" 
                severity="success"
                :disabled="Object.keys(selectedAnswers).length < (exerciseStore.todaySession?.questions.length || 1)"
                @click="finishQuiz" 
              />
              <Button 
                v-else
                label="Próxima" 
                icon="pi pi-chevron-right" 
                iconPos="right"
                @click="nextQuestion" 
              />
            </div>
          </template>
        </Card>

        <!-- Quiz Today Finished Summary -->
        <Card v-else-if="exerciseStore.todaySession && exerciseStore.todaySession.completedAt" class="results-card">
          <template #title>
            <div class="card-title text-success">
              <i class="pi pi-check-circle"></i>
              <span>Simulado Concluído</span>
            </div>
          </template>
          
          <template #content>
            <div class="score-display">
              <div class="score-circle" :class="{ 'pass': (exerciseStore.todaySession.score || 0) >= 6 }">
                <span class="score-num">{{ exerciseStore.todaySession.score }}</span>
                <span class="score-total">/ 10</span>
              </div>
              <p class="score-feedback">
                Aproveitamento: {{ (exerciseStore.todaySession.score || 0) * 10 }}%
              </p>
            </div>

            <div class="results-actions">
              <Button 
                label="Ver Gabarito do Simulado de Hoje" 
                icon="pi pi-list" 
                outlined 
                class="w-full mb-3"
                @click="showHistoryDetail(exerciseStore.todaySession)" 
              />
            </div>
          </template>
        </Card>
      </div>

      <!-- Right side: History logs table -->
      <div class="history-panel">
        <Card class="history-card">
          <template #title>
            <div class="card-title">
              <i class="pi pi-history"></i>
              <span>Histórico de Simulados</span>
            </div>
          </template>

          <template #content>
            <DataTable 
              :value="exerciseStore.history" 
              class="history-table p-datatable-sm" 
              :paginator="true" 
              :rows="5"
              responsiveLayout="scroll"
            >
              <Column field="dateStr" header="Data" style="width: 25%">
                <template #body="slotProps">
                  {{ slotProps.data.dateStr }}
                </template>
              </Column>
              <Column field="score" header="Nota" style="width: 25%">
                <template #body="slotProps">
                  <Tag 
                    :value="slotProps.data.score !== null ? `${slotProps.data.score}/10` : 'Incompleto'"
                    :severity="slotProps.data.score === null ? 'warning' : (slotProps.data.score >= 6 ? 'success' : 'danger')" 
                  />
                </template>
              </Column>
              <Column header="Conclusão" style="width: 35%">
                <template #body="slotProps">
                  {{ formatDate(slotProps.data.completedAt) }}
                </template>
              </Column>
              <Column header="Ação" style="width: 15%">
                <template #body="slotProps">
                  <Button 
                    icon="pi pi-eye" 
                    class="p-button-text p-button-rounded p-button-sm" 
                    @click="showHistoryDetail(slotProps.data)"
                    title="Visualizar respostas e gabarito"
                  />
                </template>
              </Column>
            </DataTable>
          </template>
        </Card>
      </div>
    </div>

    <!-- Gabarito Detail Dialog -->
    <Dialog 
      v-model:visible="viewHistoryDialog" 
      header="Gabarito Detalhado do Simulado" 
      :modal="true" 
      class="gabarito-dialog"
      :style="{ width: '800px' }"
    >
      <div v-if="selectedHistorySession" class="gabarito-scrollable">
        <div class="dialog-meta">
          <p><strong>Data de Execução:</strong> {{ selectedHistorySession.dateStr }}</p>
          <p><strong>Pontuação Final:</strong> {{ selectedHistorySession.score }}/10 ({{ (selectedHistorySession.score || 0) * 10 }}% de acerto)</p>
        </div>

        <div class="questions-gab-list">
          <div 
            v-for="(q, idx) in selectedHistorySession.questions" 
            :key="q.id" 
            class="gab-item"
            :class="{ 
              'correct': selectedHistorySession.answers && selectedHistorySession.answers[q.id] === q.correct,
              'incorrect': selectedHistorySession.answers && selectedHistorySession.answers[q.id] !== q.correct
            }"
          >
            <h4 class="gab-question-title">Questão {{ Number(idx) + 1 }}</h4>
            <p class="gab-question-text">{{ q.text }}</p>

            <div class="gab-options">
              <div 
                v-for="(text, opt) in q.options" 
                :key="opt"
                class="gab-option"
                :class="{ 
                  'is-correct': opt === q.correct,
                  'is-user-selected': selectedHistorySession.answers && selectedHistorySession.answers[q.id] === opt 
                }"
              >
                <span class="gab-option-letter">{{ opt }}</span>
                <span>{{ text }}</span>
                <span v-if="opt === q.correct" class="badge-status-opt success">Gabarito</span>
                <span v-if="selectedHistorySession.answers && selectedHistorySession.answers[q.id] === opt && opt !== q.correct" class="badge-status-opt error">Sua Resposta</span>
              </div>
            </div>

            <div class="explanation-box">
              <h5>💡 Explicação da IA:</h5>
              <p>{{ q.explanation }}</p>
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  </div>
</template>

<style scoped>
.exercises-container {
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

.exercises-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  align-items: start;
}

@media (max-width: 1024px) {
  .exercises-grid {
    grid-template-columns: 1fr;
  }
}

.card-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.card-title.text-success {
  color: var(--accent-green);
}

.spark-icon {
  color: var(--accent-blue);
}

.pages-metric {
  display: flex;
  justify-content: center;
  margin: 20px 0;
}

.metric-circle {
  width: 130px;
  height: 130px;
  border-radius: 50%;
  border: 4px solid var(--border-color);
  background-color: var(--bg-primary);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.metric-num {
  font-size: 32px;
  font-weight: 800;
  color: var(--accent-blue);
  line-height: 1;
}

.metric-label {
  font-size: 10px;
  color: var(--text-secondary);
  text-align: center;
  margin-top: 4px;
  padding: 0 10px;
}

.generator-info {
  text-align: center;
  font-size: 13.5px;
  color: var(--text-secondary);
  margin-bottom: 24px;
}

.warning-text {
  color: var(--accent-yellow);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

/* Quiz Style */
.quiz-header-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.question-index {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

.quiz-progress {
  height: 6px;
}

.question-body {
  margin: 16px 0;
}

.question-text {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.6;
  color: var(--text-primary);
  margin-bottom: 20px;
}

.alternatives-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.alternative-btn {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px;
  background-color: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
  transition: all 0.2s;
}

.alternative-btn:hover {
  background-color: var(--bg-card-hover);
  border-color: var(--text-muted);
}

.alternative-btn.selected {
  border-color: var(--accent-blue);
  background-color: rgba(99, 138, 255, 0.05);
}

.alternative-letter {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-secondary);
}

.alternative-btn.selected .alternative-letter {
  background-color: var(--accent-blue);
  color: #fff;
  border-color: transparent;
}

.alternative-text {
  font-size: 13px;
  line-height: 1.4;
  flex-grow: 1;
}

.quiz-navigation {
  display: flex;
  justify-content: space-between;
  margin-top: 24px;
  border-top: 1px solid var(--border-color);
  padding-top: 16px;
}

/* Score displays */
.score-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 24px 0;
}

.score-circle {
  width: 110px;
  height: 110px;
  border-radius: 50%;
  border: 4px solid var(--accent-red);
  background-color: var(--bg-primary);
  display: flex;
  align-items: baseline;
  justify-content: center;
  padding-top: 28px;
}

.score-circle.pass {
  border-color: var(--accent-green);
}

.score-num {
  font-size: 40px;
  font-weight: 800;
  color: var(--text-primary);
}

.score-total {
  font-size: 16px;
  color: var(--text-secondary);
}

.score-feedback {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-top: 12px;
}

.history-card {
  height: 100%;
}

.history-table {
  background-color: transparent;
}

/* Gabarito Dialog styling */
.gabarito-scrollable {
  max-height: 70vh;
  overflow-y: auto;
  padding-right: 10px;
}

.dialog-meta {
  background-color: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 12px 16px;
  margin-bottom: 20px;
  font-size: 13px;
  color: var(--text-secondary);
}

.questions-gab-list {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.gab-item {
  border: 1px solid var(--border-color);
  background-color: var(--bg-card);
  border-radius: var(--radius);
  padding: 18px;
}

.gab-item.correct {
  border-left: 4px solid var(--accent-green);
}

.gab-item.incorrect {
  border-left: 4px solid var(--accent-red);
}

.gab-question-title {
  font-size: 14px;
  font-weight: 800;
  color: var(--text-primary);
  margin: 0 0 8px 0;
}

.gab-question-text {
  font-size: 13.5px;
  line-height: 1.5;
  color: var(--text-primary);
  margin-bottom: 16px;
}

.gab-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.gab-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-radius: var(--radius-xs);
  font-size: 12.5px;
  color: var(--text-secondary);
  background-color: var(--bg-primary);
  border: 1px solid var(--border-color);
}

.gab-option.is-correct {
  border-color: var(--accent-green);
  background-color: rgba(52, 211, 153, 0.05);
  color: var(--text-primary);
}

.gab-option.is-user-selected {
  border-color: var(--accent-red);
  background-color: rgba(248, 113, 113, 0.05);
  color: var(--text-primary);
}

.gab-option.is-correct.is-user-selected {
  border-color: var(--accent-green);
  background-color: rgba(52, 211, 153, 0.05);
}

.gab-option-letter {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
}

.gab-option.is-correct .gab-option-letter {
  background-color: var(--accent-green);
  color: #fff;
  border-color: transparent;
}

.gab-option.is-user-selected:not(.is-correct) .gab-option-letter {
  background-color: var(--accent-red);
  color: #fff;
  border-color: transparent;
}

.badge-status-opt {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  margin-left: auto;
  text-transform: uppercase;
}

.badge-status-opt.success {
  background-color: var(--accent-green-dim);
  color: var(--accent-green);
}

.badge-status-opt.error {
  background-color: var(--accent-red-dim);
  color: var(--accent-red);
}

.explanation-box {
  background-color: var(--bg-primary);
  border-top: 1px solid var(--border-color);
  padding: 12px;
  border-radius: var(--radius-xs);
  margin-top: 12px;
}

.explanation-box h5 {
  font-size: 12px;
  color: var(--text-primary);
  margin: 0 0 6px 0;
}

.explanation-box p {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
  margin: 0;
}
</style>
