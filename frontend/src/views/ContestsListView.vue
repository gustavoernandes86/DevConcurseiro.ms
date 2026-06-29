<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useProgramStore } from '../stores/program'
import type { LearningProgram } from '../stores/program'
import Button from 'primevue/button'
import Tag from 'primevue/tag'

const programStore = useProgramStore()
const router = useRouter()

onMounted(() => {
  programStore.fetchPrograms()
})

function activate(program: LearningProgram) {
  programStore.setActiveProgramId(program.id)
  router.push(`/programs/${program.id}/plan`)
}

function goToWizard() {
  router.push('/contests/new')
}
</script>

<template>
  <div class="contests-page">
    <header class="contests-header">
      <div class="contests-header-text">
        <h1 class="contests-title">Programas de Estudo</h1>
        <p class="contests-subtitle">Gerencie seus concursos e trilhas de aprendizado</p>
      </div>
      <Button
        id="btn-new-contest"
        label="Novo Concurso"
        icon="pi pi-plus"
        @click="goToWizard"
      />
    </header>

    <div v-if="programStore.loading" class="loading-state">
      <i class="pi pi-spin pi-spinner" aria-hidden="true"></i>
      <span>Carregando programas...</span>
    </div>

    <div v-else-if="programStore.programs.length === 0" class="empty-state">
      <div class="empty-icon" aria-hidden="true">📋</div>
      <p class="empty-text">Nenhum programa de estudo cadastrado ainda.</p>
      <Button label="Criar primeiro concurso" icon="pi pi-plus" @click="goToWizard" />
    </div>

    <div v-else class="program-grid">
      <article
        v-for="program in programStore.programs"
        :key="program.id"
        class="program-card"
        :class="{ active: program.id === programStore.activeProgramId }"
      >
        <div class="program-card-header">
          <div class="program-type-badge">
            <Tag
              :value="program.type === 'contest' ? 'Concurso' : 'Curso'"
              :severity="program.type === 'contest' ? 'info' : 'success'"
            />
            <Tag
              v-if="program.id === programStore.activeProgramId"
              value="Ativo"
              severity="contrast"
            />
          </div>
        </div>

        <div class="program-card-body">
          <h2 class="program-name">{{ program.name }}</h2>
          <p v-if="program.description" class="program-description">{{ program.description }}</p>
        </div>

        <div class="program-card-footer">
          <Button
            v-if="program.id !== programStore.activeProgramId"
            label="Ativar"
            icon="pi pi-check"
            size="small"
            outlined
            @click="activate(program)"
          />
          <Button
            v-else
            label="Ver plano"
            icon="pi pi-arrow-right"
            size="small"
            @click="router.push(`/programs/${program.id}/plan`)"
          />
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.contests-page {
  padding: 8px 0;
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.contests-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.contests-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 6px;
}

.contests-subtitle {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 60px 24px;
  color: var(--text-secondary);
  font-size: 14px;
}

.loading-state i { font-size: 28px; }
.empty-icon { font-size: 48px; }
.empty-text { margin: 0; }

.program-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}

.program-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  transition: all 0.2s ease;
}

.program-card:hover {
  border-color: var(--accent-blue-dim, rgba(99,138,255,0.3));
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.2);
}

.program-card.active {
  border-color: var(--accent-blue, #638aff);
  box-shadow: 0 0 0 1px rgba(99,138,255,0.3);
}

.program-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.program-type-badge { display: flex; align-items: center; gap: 8px; }

.program-card-body { flex: 1; }

.program-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 6px;
  line-height: 1.4;
}

.program-description {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0;
}

.program-card-footer {
  display: flex;
  justify-content: flex-end;
}
</style>
