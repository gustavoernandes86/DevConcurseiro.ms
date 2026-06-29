<script setup lang="ts">
import { computed } from 'vue'
import Button from 'primevue/button'
import { useStudyPlanStore } from '../../stores/studyPlan'
import type { Topic } from '../../stores/studyPlan'

const props = defineProps<{
  topic: Topic
}>()

const emit = defineEmits<{
  (e: 'cycleStatus', id: string): void
  (e: 'openMaterial', topic: Topic, materialId: string, title: string): void
  (e: 'editNote', topic: Topic): void
  (e: 'openSummary', topic: Topic): void
  (e: 'openFlashcards', topic: Topic): void
}>()  

const planStore = useStudyPlanStore()

const status = computed(() => planStore.progress[props.topic.id]?.status || 'todo')
const hasNote = computed(() => !!planStore.notes[props.topic.id])
</script>

<template>
  <div class="topic-item" :class="status">
    <!-- Status Icon Button (Cycles on click) -->
    <button 
      class="status-indicator" 
      @click="emit('cycleStatus', topic.id)"
      :title="'Clique para alterar o progresso. Status atual: ' + status"
    >
      <i v-if="status === 'done'" class="pi pi-check-circle status-icon done"></i>
      <i v-else-if="status === 'studying'" class="pi pi-bolt status-icon studying"></i>
      <i v-else-if="status === 'review'" class="pi pi-star-fill status-icon review"></i>
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
          @click="emit('openMaterial', topic, m.materialId, m.title)"
          :title="`Abrir ${m.title} (Págs ${m.startPage}-${m.endPage})`"
        >
          <i class="pi pi-file-pdf"  aria-hidden="true"></i>
          <span>{{ m.title }}</span>
        </button>
      </div>
    </div>

    <!-- Topic Actions (Notes + Summary + Anki buttons) -->
    <div class="topic-actions">
      <Button 
        icon="pi pi-clone" 
        class="p-button-rounded p-button-text"
        @click="emit('openFlashcards', topic)"
        title="Ver/Gerar Revisão Anki"
        v-if="topic.materials.length > 0"
        aria-label="Revisão Anki"
      />
      <Button 
        icon="pi pi-align-left" 
        class="p-button-rounded p-button-text"
        @click="emit('openSummary', topic)"
        title="Ver/Gerar Resumo IA"
        v-if="topic.materials.length > 0"
        aria-label="Resumo IA"
      />
      <Button 
        icon="pi pi-pencil" 
        class="p-button-rounded p-button-text" 
        :class="{ 'note-active': hasNote }"
        @click="emit('editNote', topic)"
        title="Escrever Anotações"
        aria-label="Anotações"
      />
    </div>
  </div>
</template>

<style scoped>
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
  overflow-y: auto;
}

.default-side-workspace {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
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
</style>
