<script setup lang="ts">
import { ref } from 'vue'
import TopicItem from './TopicItem.vue'
import type { Topic } from '../../stores/studyPlan'

const props = defineProps<{
  phase: any,
  initiallyExpanded?: boolean
}>()

const emit = defineEmits<{
  (e: 'cycleStatus', id: string): void
  (e: 'openMaterial', topic: Topic, materialId: string, title: string): void
  (e: 'editNote', topic: Topic): void
  (e: 'openSummary', topic: Topic): void
  (e: 'openFlashcards', topic: Topic): void
}>()  

const isExpanded = ref(props.initiallyExpanded || false)
</script>

<template>
  <div class="phase-card">
    <div class="phase-header" @click="isExpanded = !isExpanded">
      <div class="phase-title">
        <i :class="isExpanded ? 'pi pi-chevron-down' : 'pi pi-chevron-right'"></i>
        <h3>{{ phase.title }}</h3>
      </div>
      <span class="phase-subtitle">{{ phase.subtitle }}</span>
    </div>

    <div v-show="isExpanded" class="phase-content">
      <div v-for="week in phase.weeks" :key="week.id" class="week-card">
        <div class="week-header">
          <h4>Semana {{ week.number }}: {{ week.title }}</h4>
          <p class="week-subtitle">{{ week.subtitle }}</p>
        </div>

        <div class="topics-list">
          <TopicItem 
            v-for="topic in week.topics" 
            :key="topic.id"
            :topic="topic"
            @cycleStatus="(id) => emit('cycleStatus', id)"
            @openMaterial="(t, mId, tTitle) => emit('openMaterial', t, mId, tTitle)"
            @editNote="(t) => emit('editNote', t)"
            @openSummary="(t) => emit('openSummary', t)"
            @openFlashcards="(t) => emit('openFlashcards', t)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
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
</style>
