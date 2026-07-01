<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useExerciseStore } from '../stores/exercise'
import type { Question } from '../stores/exercise'
import { useProgramStore } from '../stores/program'
import { useStudyPlanStore } from '../stores/studyPlan'
import Button from 'primevue/button'
import Card from 'primevue/card'
import ProgressBar from 'primevue/progressbar'
import Dialog from 'primevue/dialog'
import MultiSelect from 'primevue/multiselect'
import QuizHistoryTable from '../components/exercises/QuizHistoryTable.vue'

const exerciseStore = useExerciseStore()
const programStore = useProgramStore()
const planStore = useStudyPlanStore()

// Custom Quiz form state
const selectedSourceType = ref<'pdf_reading' | 'manual_topic'>('pdf_reading')
const selectedTopicIds = ref<string[]>([])
const selectedNumQuestions = ref<number>(10)

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
    
    // Fetch plan details to populate topics dropdown
    if (planStore.phases.length === 0) {
      await planStore.fetchPlan(programStore.activeProgramId)
    }
  }
})

const activeQuestion = computed<Question | null>(() => {
  if (!exerciseStore.todaySession || !exerciseStore.todaySession.questions) return null
  return exerciseStore.todaySession.questions[currentQuestionIndex.value] || null
})

// Flatten topics for the MultiSelect dropdown
const availableTopics = computed(() => {
  const list: { id: string; name: string; tag: string }[] = []
  planStore.phases.forEach(phase => {
    phase.weeks.forEach(week => {
      week.topics.forEach(topic => {
        if (topic.materials && topic.materials.length > 0) {
          list.push({
            id: topic.id,
            name: topic.title,
            tag: topic.tag
          })
        }
      })
    })
  })
  return list
})

const generateCustomSimulado = async () => {
  if (!programStore.activeProgramId) return
  
  const payload = {
    sourceType: selectedSourceType.value,
    numQuestions: selectedNumQuestions.value,
    topicIds: selectedSourceType.value === 'manual_topic' ? selectedTopicIds.value : undefined
  }

  try {
    await exerciseStore.generateCustomExercises(programStore.activeProgramId, payload)
    activeQuizMode.value = true
    selectedAnswers.value = {}
    currentQuestionIndex.value = 0
    quizCompleted.value = false
  } catch (err: any) {
    console.error('Falha ao gerar simulado personalizado:', err.message)
  }
}

const selectOption = (optionKey: string) => {
  if (!activeQuestion.value) return
  // Use String() to ensure key consistency regardless of id type (number or string)
  selectedAnswers.value[String(activeQuestion.value.id)] = optionKey
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

// Count how many questions have been answered (use String() for key consistency)
const answeredCount = computed(() => {
  if (!exerciseStore.todaySession) return 0
  return exerciseStore.todaySession.questions.filter(
    q => selectedAnswers.value[String(q.id)] !== undefined
  ).length
})

const finishQuiz = async () => {
  if (!exerciseStore.todaySession || !programStore.activeProgramId) return
  
  let correctCount = 0
  const questions = exerciseStore.todaySession.questions
  
  questions.forEach(q => {
    // Use String() for key consistency
    if (selectedAnswers.value[String(q.id)] === q.correct) {
      correctCount++
    }
  })

  // Build answers map with string keys
  const answersMap: Record<string, string> = {}
  Object.entries(selectedAnswers.value).forEach(([k, v]) => {
    answersMap[String(k)] = v
  })
  
  // Save results to server
  await exerciseStore.saveAnswers(
    programStore.activeProgramId,
    exerciseStore.todaySession.id,
    answersMap,
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


</script>

<template>
  <div class="exercises-container">
    <div class="header-section">
      <h1 class="page-title">Simulados Inteligentes com IA</h1>
      <p class="page-subtitle">Gere simulados de forma personalizada e ilimitada no estilo Cesgranrio com base nos tópicos do concurso ou nas páginas que leu.</p>
    </div>

    <div class="exercises-grid">
      <!-- Left side: Today's generator panel -->
      <div class="generator-panel">
        <!-- Generator Initial Mode -->
        <Card v-if="!activeQuizMode && !quizCompleted" class="generator-card">
          <template #title>
            <div class="card-title">
              <i class="pi pi-sparkles spark-icon"  aria-hidden="true"></i>
              <span>Novo Simulado Cesgranrio</span>
            </div>
          </template>
          
          <template #content>
            <div class="custom-generator-form">
              <!-- Source Content Selection -->
              <div class="form-section">
                <label class="section-label">1. Origem do Conteúdo</label>
                <div class="source-tabs">
                  <button 
                    class="source-tab-btn" 
                    :class="{ active: selectedSourceType === 'pdf_reading' }"
                    @click="selectedSourceType = 'pdf_reading'"
                    type="button"
                  >
                    <i class="pi pi-calendar"  aria-hidden="true"></i>
                    <span>Leitura de Hoje</span>
                  </button>
                  <button 
                    class="source-tab-btn" 
                    :class="{ active: selectedSourceType === 'manual_topic' }"
                    @click="selectedSourceType = 'manual_topic'"
                    type="button"
                  >
                    <i class="pi pi-book"  aria-hidden="true"></i>
                    <span>Tópicos de Estudo</span>
                  </button>
                </div>
              </div>

              <!-- Pages Read Metric (For Today's Reading option) -->
              <div v-if="selectedSourceType === 'pdf_reading'" class="source-sub-panel">
                <div class="pages-metric compact">
                  <div class="metric-circle-compact">
                    <span class="metric-num-compact">{{ exerciseStore.todayPagesReadCount }}</span>
                    <span class="metric-label-compact">páginas lidas</span>
                  </div>
                </div>
                <div class="generator-info">
                  <p v-if="exerciseStore.todayPagesReadCount > 0" class="info-text">
                    Será compilado um simulado com base nas <strong>{{ exerciseStore.todayPagesReadCount }}</strong> páginas que você leu hoje nos PDFs do plano de estudos.
                  </p>
                  <p v-else class="warning-text">
                    <i class="pi pi-exclamation-triangle"  aria-hidden="true"></i>
                    Nenhuma página lida hoje. Registre progresso nos PDFs na aba <strong>Plano</strong> para habilitar, ou selecione <strong>Tópicos de Estudo</strong> acima.
                  </p>
                </div>
              </div>

              <!-- Topic Selector dropdown (For Manual Topics option) -->
              <div v-else-if="selectedSourceType === 'manual_topic'" class="source-sub-panel">
                <div class="form-field">
                  <label class="field-label">Selecione um ou mais Tópicos:</label>
                  <MultiSelect 
                    v-model="selectedTopicIds" 
                    :options="availableTopics" 
                    optionLabel="name" 
                    optionValue="id" 
                    placeholder="Selecione os tópicos para o simulado..." 
                    :filter="true" 
                    class="w-full multiselect-custom"
                    display="chip"
                  >
                    <template #option="slotProps">
                      <div class="topic-option-item">
                        <Tag :value="slotProps.option.tag" severity="info" class="mr-2" />
                        <span>{{ slotProps.option.name }}</span>
                      </div>
                    </template>
                  </MultiSelect>
                </div>
              </div>

              <!-- Number of Questions Selector -->
              <div class="form-section">
                <label class="section-label">2. Quantidade de Questões</label>
                <div class="q-chips">
                  <button 
                    v-for="num in [5, 10, 15, 20]" 
                    :key="num"
                    class="q-chip"
                    :class="{ active: selectedNumQuestions === num }"
                    @click="selectedNumQuestions = num"
                    type="button"
                  >
                    {{ num }} questões
                  </button>
                </div>
              </div>

              <div class="action-row pt-3">
                <Button 
                  label="✨ Gerar Simulado Cesgranrio" 
                  icon="pi pi-sparkles" 
                  :loading="exerciseStore.loading" 
                  :disabled="selectedSourceType === 'pdf_reading' ? exerciseStore.todayPagesReadCount === 0 : selectedTopicIds.length === 0" 
                  class="p-button-lg w-full generate-btn-premium"
                  @click="generateCustomSimulado" 
                />
              </div>
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
                  :class="{ selected: selectedAnswers[String(activeQuestion.id)] === key }"
                  @click="selectOption(String(key))"
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
                :disabled="answeredCount < (exerciseStore.todaySession?.questions.length || 1)"
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
        <Card v-else-if="quizCompleted" class="results-card">
          <template #title>
            <div class="card-title text-success">
              <i class="pi pi-check-circle"  aria-hidden="true"></i>
              <span>Simulado Concluído</span>
            </div>
          </template>
          
          <template #content>
            <div class="score-display">
              <div class="score-circle" :class="{ 'pass': quizScore >= ((exerciseStore.todaySession?.questions.length || 1) * 0.6) }">
                <span class="score-num">{{ quizScore }}</span>
                <span class="score-total">/ {{ exerciseStore.todaySession?.questions.length }}</span>
              </div>
              <p class="score-feedback">
                Aproveitamento: {{ Math.round((quizScore / (exerciseStore.todaySession?.questions.length || 1)) * 100) }}%
              </p>
            </div>
 
            <div class="results-actions">
              <Button 
                label="Ver Gabarito do Simulado" 
                icon="pi pi-list" 
                outlined 
                class="w-full mb-3"
                @click="showHistoryDetail(exerciseStore.todaySession)" 
              />
              <Button 
                label="✨ Gerar Novo Simulado" 
                icon="pi pi-plus" 
                class="w-full generate-btn-premium"
                @click="quizCompleted = false" 
              />
            </div>
          </template>
        </Card>
      </div>
 
      <!-- Right side: History logs table -->
      <div class="history-panel">
        <QuizHistoryTable @showDetail="showHistoryDetail" />
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
          <p><strong>Pontuação Final:</strong> {{ selectedHistorySession.score }}/{{ selectedHistorySession.questions ? selectedHistorySession.questions.length : 10 }} ({{ Math.round(((selectedHistorySession.score || 0) / (selectedHistorySession.questions ? selectedHistorySession.questions.length : 10)) * 100) }}% de acerto)</p>
        </div>

        <div class="questions-gab-list">
          <div 
            v-for="(q, idx) in selectedHistorySession.questions" 
            :key="q.id" 
            class="gab-item"
            :class="{ 
              'correct': selectedHistorySession.answers && selectedHistorySession.answers[String(q.id)] === q.correct,
              'incorrect': selectedHistorySession.answers && selectedHistorySession.answers[String(q.id)] !== q.correct
            }"
          >
            <h4 class="gab-question-title">Questão {{ Number(idx) + 1 }}</h4>
            <p class="gab-question-text">{{ q.text || q.enunciado || '(enunciado não disponível)' }}</p>

            <div class="gab-options">
              <div 
                v-for="(text, opt) in (q.options || q.alternativas || {})"
                :key="opt"
                class="gab-option"
                :class="{ 
                  'is-correct': opt === (q.correct || q.resposta_correta),
                  'is-user-selected': selectedHistorySession.answers && selectedHistorySession.answers[String(q.id)] === opt 
                }"
              >
                <span class="gab-option-letter">{{ opt }}</span>
                <span>{{ text }}</span>
                <span v-if="opt === (q.correct || q.resposta_correta)" class="badge-status-opt success">Gabarito</span>
                <span v-if="selectedHistorySession.answers && selectedHistorySession.answers[String(q.id)] === opt && opt !== (q.correct || q.resposta_correta)" class="badge-status-opt error">Sua Resposta</span>
              </div>
            </div>

            <div class="explanation-box">
              <h5>💡 Explicação da IA:</h5>
              <p>{{ q.explanation || q.comentario || '(sem explicação disponível)' }}</p>
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

/* Custom Generator Form Styling */
.custom-generator-form {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-label {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.source-tabs {
  display: flex;
  gap: 10px;
  background-color: var(--bg-primary);
  border: 1px solid var(--border-color);
  padding: 4px;
  border-radius: var(--radius-sm);
}

.source-tab-btn {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  padding: 8px 12px;
  border-radius: var(--radius-xs);
  font-size: 12.5px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.source-tab-btn:hover {
  color: var(--text-primary);
}

.source-tab-btn.active {
  background-color: var(--bg-card);
  color: var(--text-primary);
  box-shadow: var(--shadow-sm);
}

.source-sub-panel {
  background-color: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 14px;
}

.pages-metric.compact {
  display: flex;
  justify-content: center;
  margin-bottom: 10px;
}

.metric-circle-compact {
  width: 90px;
  height: 90px;
  border-radius: 50%;
  border: 3px solid var(--border-color);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background-color: var(--bg-card);
}

.metric-num-compact {
  font-size: 26px;
  font-weight: 800;
  color: var(--accent-green);
  line-height: 1;
}

.metric-label-compact {
  font-size: 9px;
  color: var(--text-muted);
  text-transform: uppercase;
  font-weight: 700;
  margin-top: 2px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.multiselect-custom {
  background-color: var(--bg-card) !important;
  border-color: var(--border-color) !important;
}

.topic-option-item {
  display: flex;
  align-items: center;
}

.q-chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.q-chip {
  background-color: var(--bg-primary);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.q-chip:hover {
  color: var(--text-primary);
  border-color: var(--text-muted);
}

.q-chip.active {
  background: var(--gradient-primary);
  color: #fff;
  border-color: transparent;
}

.generate-btn-premium {
  background: var(--gradient-primary) !important;
  border: none !important;
  box-shadow: 0 4px 12px rgba(99, 138, 255, 0.3);
}

.generate-btn-premium:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(99, 138, 255, 0.4);
}
</style>
