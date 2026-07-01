<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useProgramStore } from '../stores/program'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import DatePicker from 'primevue/datepicker'
import Stepper from 'primevue/stepper'
import StepList from 'primevue/steplist'
import Step from 'primevue/step'
import StepPanels from 'primevue/steppanels'
import StepPanel from 'primevue/steppanel'
import Message from 'primevue/message'
import { useToast } from 'primevue/usetoast'

const router = useRouter()
const programStore = useProgramStore()
const toast = useToast()

// ─── Stepper state ───
const activeStep = ref(1)

// ─── Step 1: basic metadata ───
const contestName = ref('')
const contestRole = ref('')
const contestBoard = ref('')
const contestInstitution = ref('')
const contestStatus = ref<'pre_edital' | 'pos_edital'>('pos_edital')
const contestExamDate = ref<Date | null>(null)
const editalFile = ref<File | null>(null)
const editalFileInput = ref<HTMLInputElement | null>(null)

const statusOptions = [
  { label: 'Pós-edital (edital publicado)', value: 'pos_edital' },
  { label: 'Pré-edital (ainda não publicado)', value: 'pre_edital' }
]

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  editalFile.value = input.files?.[0] || null
}

function removeFile() {
  editalFile.value = null
  if (editalFileInput.value) editalFileInput.value.value = ''
}

// ─── Step 2: AI extraction ───
const extracting = ref(false)
const extractError = ref<string | null>(null)
const tmpFilename = ref<string | null>(null)
const keepEdital = ref(true)

// Extracted data (editable)
interface Section { name: string; is_eliminatory: boolean; min_score: number | null }
interface SubTopic { title: string; detail: string }
interface TopicItem { title: string; detail: string; weight: number | null; subtopics: SubTopic[] }
interface Discipline { name: string; section_name: string; topics: TopicItem[] }
interface ExamProfile { board: string; alternatives_count: number; has_negative_marking: boolean }

const sections = ref<Section[]>([])
const disciplines = ref<Discipline[]>([])
const examProfile = ref<ExamProfile>({ board: '', alternatives_count: 5, has_negative_marking: false })

async function goToStep2() {
  if (!contestName.value.trim()) {
    toast.add({ severity: 'warn', summary: 'Campo obrigatório', detail: 'Informe o nome do concurso.', life: 3000 })
    return
  }

  if (!editalFile.value) {
    // No PDF — skip extraction, go to step 3 with empty structure
    sections.value = []
    disciplines.value = []
    activeStep.value = 2
    return
  }

  extracting.value = true
  extractError.value = null

  try {
    const formData = new FormData()
    formData.append('edital', editalFile.value)

    const res = await fetch('/api/wizard/extract', { method: 'POST', body: formData })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Falha ao extrair estrutura do edital.')
    }

    const data = await res.json()
    tmpFilename.value = data.tmpFilename

    sections.value = (data.extracted?.contest_sections || []).map((s: any) => ({
      name: s.name || '',
      is_eliminatory: !!s.is_eliminatory,
      min_score: s.min_score ?? null
    }))

    disciplines.value = (data.extracted?.disciplines || []).map((d: any) => ({
      name: d.name || '',
      section_name: d.section_name || '',
      topics: (d.topics || []).map((t: any) => ({
        title: t.title || '',
        detail: t.detail || '',
        weight: t.weight ?? null,
        subtopics: (t.subtopics || []).map((s: any) => ({ title: s.title || '', detail: s.detail || '' }))
      }))
    }))

    if (data.extracted?.exam_profile) {
      examProfile.value = {
        board: data.extracted.exam_profile.board || contestBoard.value,
        alternatives_count: data.extracted.exam_profile.alternatives_count || 5,
        has_negative_marking: !!data.extracted.exam_profile.has_negative_marking
      }
    } else {
      examProfile.value.board = contestBoard.value
    }

    activeStep.value = 2

  } catch (err) {
    extractError.value = err instanceof Error ? err.message : 'Erro na extração.'
  } finally {
    extracting.value = false
  }
}

// ─── Section / Discipline / Topic helpers ───
function addSection() {
  sections.value.push({ name: 'Nova Seção', is_eliminatory: false, min_score: null })
}
function removeSection(i: number) { sections.value.splice(i, 1) }

function addDiscipline() {
  disciplines.value.push({ name: 'Nova Disciplina', section_name: '', topics: [] })
}
function removeDiscipline(i: number) { disciplines.value.splice(i, 1) }

function addTopic(dIdx: number) {
  disciplines.value[dIdx].topics.push({ title: 'Novo Tópico', detail: '', weight: null, subtopics: [] })
}
function removeTopic(dIdx: number, tIdx: number) { disciplines.value[dIdx].topics.splice(tIdx, 1) }

function addSubtopic(dIdx: number, tIdx: number) {
  disciplines.value[dIdx].topics[tIdx].subtopics.push({ title: 'Sub-tópico', detail: '' })
}
function removeSubtopic(dIdx: number, tIdx: number, sIdx: number) {
  disciplines.value[dIdx].topics[tIdx].subtopics.splice(sIdx, 1)
}

// ─── Step 3: confirm & persist ───
const confirming = ref(false)
const confirmError = ref<string | null>(null)

const totalTopics = () => disciplines.value.reduce(
  (sum, d) => sum + d.topics.length + d.topics.reduce((s, t) => s + (t.subtopics?.length || 0), 0),
  0
)

async function confirmCreation() {
  confirming.value = true
  confirmError.value = null

  try {
    const payload = {
      name: contestName.value,
      role: contestRole.value,
      board: contestBoard.value || examProfile.value.board,
      institution: contestInstitution.value,
      status: contestStatus.value,
      examDate: contestExamDate.value ? contestExamDate.value.toISOString() : null,
      keepEdital: keepEdital.value,
      tmpFilename: tmpFilename.value,
      extracted: {
        contest_sections: sections.value,
        disciplines: disciplines.value,
        exam_profile: examProfile.value
      }
    }

    const res = await fetch('/api/wizard/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Falha ao criar concurso.')
    }

    const data = await res.json()

    // Reload programs list and navigate to the new program
    await programStore.fetchPrograms()
    programStore.setActiveProgramId(data.programId)

    toast.add({ severity: 'success', summary: 'Concurso criado!', detail: contestName.value, life: 4000 })
    router.push(`/programs/${data.programId}/plan`)

  } catch (err) {
    confirmError.value = err instanceof Error ? err.message : 'Erro ao criar concurso.'
  } finally {
    confirming.value = false
  }
}

async function cancelAndCleanup() {
  if (tmpFilename.value) {
    await fetch(`/api/wizard/tmp/${encodeURIComponent(tmpFilename.value)}`, { method: 'DELETE' }).catch(() => {})
  }
  router.push('/contests')
}
</script>

<template>
  <div class="wizard-page">
    <div class="wizard-header">
      <button class="btn-back" @click="cancelAndCleanup" aria-label="Voltar">
        <i class="pi pi-arrow-left" aria-hidden="true"></i>
        Voltar
      </button>
      <h1 class="wizard-title">Novo Concurso</h1>
    </div>

    <Stepper v-model:value="activeStep" class="wizard-stepper">
      <StepList>
        <Step :value="1">Dados básicos</Step>
        <Step :value="2">Revisão do programa</Step>
        <Step :value="3">Confirmação</Step>
      </StepList>

      <StepPanels>
        <!-- ─── STEP 1: Basic metadata ─── -->
        <StepPanel :value="1">
          <div class="step-content">
            <div class="form-grid">
              <div class="form-field full-width">
                <label for="wz-name">Nome do concurso *</label>
                <InputText
                  id="wz-name"
                  v-model="contestName"
                  placeholder="Ex: Petrobras — Engenharia de Software 2026"
                />
              </div>

              <div class="form-field">
                <label for="wz-institution">Instituição</label>
                <InputText id="wz-institution" v-model="contestInstitution" placeholder="Ex: Petrobras" />
              </div>

              <div class="form-field">
                <label for="wz-role">Cargo / Perfil</label>
                <InputText id="wz-role" v-model="contestRole" placeholder="Ex: Profissional Júnior" />
              </div>

              <div class="form-field">
                <label for="wz-board">Banca examinadora</label>
                <InputText id="wz-board" v-model="contestBoard" placeholder="Ex: Cesgranrio, CEBRASPE" />
              </div>

              <div class="form-field">
                <label for="wz-status">Status</label>
                <Select
                  id="wz-status"
                  v-model="contestStatus"
                  :options="statusOptions"
                  optionLabel="label"
                  optionValue="value"
                />
              </div>

              <div class="form-field" v-if="contestStatus === 'pos_edital'">
                <label for="wz-date">Data da prova</label>
                <DatePicker id="wz-date" v-model="contestExamDate" dateFormat="dd/mm/yy" showIcon />
              </div>
            </div>

            <!-- Edital upload -->
            <div class="upload-section">
              <div class="upload-label">
                <i class="pi pi-file-pdf" aria-hidden="true"></i>
                PDF do edital <span class="optional">(opcional — usado para extração automática de tópicos)</span>
              </div>

              <label
                v-if="!editalFile"
                class="upload-drop-area"
                for="wz-file-input"
                @dragover.prevent
                @drop.prevent="(e) => { editalFile = e.dataTransfer?.files[0] || null }"
              >
                <i class="pi pi-upload upload-icon" aria-hidden="true"></i>
                <span>Clique ou arraste o PDF aqui</span>
                <span class="upload-hint">Máximo 30 MB</span>
                <input
                  id="wz-file-input"
                  ref="editalFileInput"
                  type="file"
                  accept="application/pdf"
                  class="sr-only"
                  @change="onFileChange"
                />
              </label>

              <div v-else class="upload-file-selected">
                <i class="pi pi-file-pdf file-icon" aria-hidden="true"></i>
                <span class="file-name">{{ editalFile.name }}</span>
                <button class="btn-remove-file" @click="removeFile" aria-label="Remover arquivo">
                  <i class="pi pi-times" aria-hidden="true"></i>
                </button>
              </div>
            </div>

            <Message v-if="extractError" severity="error" :closable="false">{{ extractError }}</Message>

            <div class="step-actions">
              <Button
                label="Extrair estrutura com IA"
                icon="pi pi-sparkles"
                :loading="extracting"
                :disabled="!contestName.trim()"
                @click="goToStep2"
              />
              <span class="step-actions-hint" v-if="!editalFile">
                Sem PDF, avançará com estrutura vazia para preenchimento manual.
              </span>
            </div>
          </div>
        </StepPanel>

        <!-- ─── STEP 2: Review extracted structure ─── -->
        <StepPanel :value="2">
          <div class="step-content">
            <p class="step-intro">
              Revise e edite a estrutura extraída do edital. Você pode adicionar, remover ou renomear seções, disciplinas e tópicos.
            </p>

            <!-- Sections -->
            <section class="review-section" aria-label="Seções da prova">
              <div class="review-section-header">
                <h2 class="review-section-title">
                  <i class="pi pi-th-large" aria-hidden="true"></i>
                  Seções da Prova
                </h2>
                <Button size="small" icon="pi pi-plus" label="Adicionar" outlined @click="addSection" />
              </div>

              <div v-for="(sec, i) in sections" :key="i" class="review-item">
                <InputText v-model="sec.name" class="review-item-name" :aria-label="`Nome da seção ${i+1}`" />
                <label class="review-check">
                  <input type="checkbox" v-model="sec.is_eliminatory" />
                  Eliminatória
                </label>
                <button class="btn-icon-danger" @click="removeSection(i)" :aria-label="`Remover seção ${sec.name}`">
                  <i class="pi pi-trash" aria-hidden="true"></i>
                </button>
              </div>
              <p v-if="sections.length === 0" class="empty-hint">Nenhuma seção. Clique em "Adicionar" para criar.</p>
            </section>

            <!-- Disciplines and topics -->
            <section class="review-section" aria-label="Disciplinas e tópicos">
              <div class="review-section-header">
                <h2 class="review-section-title">
                  <i class="pi pi-list" aria-hidden="true"></i>
                  Disciplinas e Tópicos <span class="badge">{{ disciplines.length }} disciplinas · {{ totalTopics() }} tópicos</span>
                </h2>
                <Button size="small" icon="pi pi-plus" label="Adicionar disciplina" outlined @click="addDiscipline" />
              </div>

              <details v-for="(disc, di) in disciplines" :key="di" class="discipline-block" open>
                <summary class="discipline-header">
                  <div class="discipline-meta">
                    <InputText v-model="disc.name" class="disc-name-input" :aria-label="`Nome da disciplina ${di+1}`" @click.stop />
                    <Select
                      v-model="disc.section_name"
                      :options="sections.map(s => s.name)"
                      placeholder="Seção"
                      class="disc-section-select"
                      @click.stop
                    />
                  </div>
                  <button class="btn-icon-danger" @click.prevent="removeDiscipline(di)" :aria-label="`Remover disciplina ${disc.name}`">
                    <i class="pi pi-trash" aria-hidden="true"></i>
                  </button>
                </summary>

                <div class="topic-list">
                  <div v-for="(topic, ti) in disc.topics" :key="ti" class="topic-item">
                    <div class="topic-main">
                      <InputText v-model="topic.title" class="topic-title-input" :aria-label="`Tópico ${ti+1}`" />
                      <button class="btn-icon-sm" @click="addSubtopic(di, ti)" title="Adicionar sub-tópico">
                        <i class="pi pi-plus" aria-hidden="true"></i>
                      </button>
                      <button class="btn-icon-danger-sm" @click="removeTopic(di, ti)" :aria-label="`Remover tópico ${topic.title}`">
                        <i class="pi pi-times" aria-hidden="true"></i>
                      </button>
                    </div>

                    <div v-if="topic.subtopics.length > 0" class="subtopic-list">
                      <div v-for="(sub, si) in topic.subtopics" :key="si" class="subtopic-item">
                        <i class="pi pi-angle-right" aria-hidden="true"></i>
                        <InputText v-model="sub.title" class="subtopic-input" :aria-label="`Sub-tópico ${si+1}`" />
                        <button class="btn-icon-danger-sm" @click="removeSubtopic(di, ti, si)" :aria-label="`Remover sub-tópico ${sub.title}`">
                          <i class="pi pi-times" aria-hidden="true"></i>
                        </button>
                      </div>
                    </div>
                  </div>
                  <Button size="small" text icon="pi pi-plus" label="Adicionar tópico" @click="addTopic(di)" />
                </div>
              </details>
              <p v-if="disciplines.length === 0" class="empty-hint">Nenhuma disciplina. Clique em "Adicionar disciplina" para criar.</p>
            </section>

            <!-- Exam profile -->
            <section class="review-section" aria-label="Perfil da prova">
              <h2 class="review-section-title">
                <i class="pi pi-sliders-h" aria-hidden="true"></i>
                Perfil da Prova
              </h2>
              <div class="exam-profile-grid">
                <div class="form-field">
                  <label>Banca</label>
                  <InputText v-model="examProfile.board" placeholder="Ex: Cesgranrio" />
                </div>
                <div class="form-field">
                  <label>Nº de alternativas</label>
                  <input
                    class="p-inputtext p-component"
                    type="number"
                    min="2"
                    max="10"
                    :value="examProfile.alternatives_count"
                    @input="examProfile.alternatives_count = Number(($event.target as HTMLInputElement).value)"
                  />
                </div>
                <div class="form-field">
                  <label class="review-check">
                    <input type="checkbox" v-model="examProfile.has_negative_marking" />
                    Pontuação negativa (anulação por chute)
                  </label>
                </div>
              </div>
            </section>

            <div class="step-actions">
              <Button label="Voltar" icon="pi pi-arrow-left" outlined @click="activeStep = 1" />
              <Button label="Confirmar estrutura" icon="pi pi-check" @click="activeStep = 3" />
            </div>
          </div>
        </StepPanel>

        <!-- ─── STEP 3: Confirm & persist ─── -->
        <StepPanel :value="3">
          <div class="step-content">
            <div class="confirm-summary">
              <div class="confirm-icon" aria-hidden="true">🏆</div>
              <h2 class="confirm-title">{{ contestName }}</h2>
              <p class="confirm-subtitle">{{ contestRole }} · {{ contestBoard || examProfile.board }}</p>

              <div class="confirm-stats">
                <div class="stat-card">
                  <span class="stat-value">{{ sections.length }}</span>
                  <span class="stat-label">Seções</span>
                </div>
                <div class="stat-card">
                  <span class="stat-value">{{ disciplines.length }}</span>
                  <span class="stat-label">Disciplinas</span>
                </div>
                <div class="stat-card">
                  <span class="stat-value">{{ totalTopics() }}</span>
                  <span class="stat-label">Tópicos</span>
                </div>
              </div>

              <div v-if="tmpFilename" class="confirm-edital-option">
                <label class="review-check">
                  <input type="checkbox" v-model="keepEdital" />
                  Salvar PDF do edital como material de estudo
                </label>
              </div>

              <Message v-if="confirmError" severity="error" :closable="false">{{ confirmError }}</Message>
            </div>

            <div class="step-actions centered">
              <Button label="Voltar e revisar" icon="pi pi-arrow-left" outlined @click="activeStep = 2" />
              <Button
                label="Criar concurso"
                icon="pi pi-check-circle"
                :loading="confirming"
                @click="confirmCreation"
              />
            </div>
          </div>
        </StepPanel>
      </StepPanels>
    </Stepper>
  </div>
</template>

<style scoped>
.wizard-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 24px 0;
}

.wizard-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 32px;
}

.btn-back {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  border-radius: 8px;
  padding: 8px 14px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}
.btn-back:hover { color: var(--text-primary); background: var(--bg-card-hover); }

.wizard-title {
  font-size: 22px;
  font-weight: 700;
  margin: 0;
  color: var(--text-primary);
}

.step-content {
  padding: 28px 0;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.step-intro {
  color: var(--text-secondary);
  font-size: 14px;
  margin: 0;
}

/* Form */
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.form-field { display: flex; flex-direction: column; gap: 6px; }
.form-field label { font-size: 13px; font-weight: 500; color: var(--text-secondary); }
.form-field.full-width { grid-column: 1 / -1; }
.optional { color: var(--text-muted, #6e7681); font-weight: 400; font-size: 12px; }

/* Upload */
.upload-section { display: flex; flex-direction: column; gap: 8px; }
.upload-label { font-size: 13px; font-weight: 500; color: var(--text-secondary); display: flex; align-items: center; gap: 8px; }

.upload-drop-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 2px dashed var(--border-color);
  border-radius: 12px;
  padding: 36px;
  cursor: pointer;
  transition: all 0.2s;
  color: var(--text-secondary);
}
.upload-drop-area:hover { border-color: var(--accent-blue, #638aff); background: var(--accent-blue-dim, rgba(99,138,255,0.06)); }

.upload-icon { font-size: 28px; margin-bottom: 4px; }
.upload-hint { font-size: 12px; color: var(--text-muted, #6e7681); }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }

.upload-file-selected {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 12px 16px;
}
.file-icon { color: #e05252; font-size: 20px; }
.file-name { flex: 1; font-size: 13px; color: var(--text-primary); }
.btn-remove-file { background: none; border: none; color: var(--text-secondary); cursor: pointer; padding: 4px; border-radius: 6px; }
.btn-remove-file:hover { color: #e05252; }

/* Review sections */
.review-section {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.review-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.review-section-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.badge {
  font-size: 11px;
  font-weight: 400;
  color: var(--text-secondary);
  background: var(--bg-base);
  border-radius: 20px;
  padding: 2px 8px;
}

.review-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-color);
}
.review-item:last-of-type { border-bottom: none; }
.review-item-name { flex: 1; }

.review-check { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-secondary); cursor: pointer; }
.review-check input[type="checkbox"] { accent-color: var(--accent-blue, #638aff); }

.btn-icon-danger {
  background: none;
  border: none;
  color: var(--text-muted, #6e7681);
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  transition: color 0.2s;
}
.btn-icon-danger:hover { color: #e05252; }

/* Disciplines */
.discipline-block {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  overflow: hidden;
}

.discipline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  cursor: pointer;
  background: var(--bg-base);
  list-style: none;
  gap: 12px;
}
.discipline-header::-webkit-details-marker { display: none; }

.discipline-meta { display: flex; align-items: center; gap: 10px; flex: 1; }
.disc-name-input { flex: 1; }
.disc-section-select { width: 180px; }

.topic-list {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.topic-item { display: flex; flex-direction: column; gap: 4px; }
.topic-main { display: flex; align-items: center; gap: 8px; }
.topic-title-input { flex: 1; }

.btn-icon-sm, .btn-icon-danger-sm {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-muted, #6e7681);
  transition: color 0.2s;
}
.btn-icon-sm:hover { color: var(--accent-blue, #638aff); }
.btn-icon-danger-sm:hover { color: #e05252; }

.subtopic-list { padding-left: 24px; display: flex; flex-direction: column; gap: 4px; }
.subtopic-item { display: flex; align-items: center; gap: 8px; }
.subtopic-input { flex: 1; font-size: 13px; }

/* Exam profile */
.exam-profile-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 16px;
  align-items: end;
}

.empty-hint { color: var(--text-muted, #6e7681); font-size: 13px; font-style: italic; margin: 0; }

/* Confirm */
.confirm-summary {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.confirm-icon { font-size: 48px; }
.confirm-title { font-size: 22px; font-weight: 700; color: var(--text-primary); margin: 0; }
.confirm-subtitle { font-size: 14px; color: var(--text-secondary); margin: 0; }

.confirm-stats {
  display: flex;
  gap: 24px;
  justify-content: center;
}

.stat-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 80px;
}

.stat-value { font-size: 28px; font-weight: 700; color: var(--accent-blue, #638aff); }
.stat-label { font-size: 12px; color: var(--text-secondary); }

.confirm-edital-option {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 14px 20px;
}

/* Step actions */
.step-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-top: 8px;
}
.step-actions.centered { justify-content: center; }
.step-actions-hint { font-size: 12px; color: var(--text-muted, #6e7681); }
</style>
