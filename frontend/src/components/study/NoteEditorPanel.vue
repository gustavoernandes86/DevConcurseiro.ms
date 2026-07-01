<script setup lang="ts">
import { ref, watch } from 'vue'
import Button from 'primevue/button'
import Textarea from 'primevue/textarea'
import type { Topic } from '../../stores/studyPlan'

const props = defineProps<{
  topic: Topic,
  initialContent: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', content: string): void
}>()

const content = ref(props.initialContent)
const noteSaved = ref(false)

watch(() => props.topic, () => {
  content.value = props.initialContent
  noteSaved.value = false
})

const save = () => {
  emit('save', content.value)
  noteSaved.value = true
  setTimeout(() => {
    noteSaved.value = false
  }, 2000)
}
</script>

<template>
  <div class="note-editor-panel">
    <div class="note-header">
      <h3>Anotações: {{ topic.title }}</h3>
      <Button 
        icon="pi pi-times" 
        class="p-button-rounded p-button-text p-button-secondary" @click="emit('close')" title="Fechar" aria-label="Fechar painel de anota��es"
      />
    </div>
    <div class="note-body">
      <Textarea 
        v-model="content" 
        rows="12" 
        class="note-textarea"
        placeholder="Digite suas notas de estudo para este tópico aqui..."
      />
      <div class="note-footer">
        <span v-if="noteSaved" class="saved-message">
          <i class="pi pi-check"  aria-hidden="true"></i> Anotações salvas!
        </span>
        <Button label="Salvar" icon="pi pi-save" @click="save" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.note-editor-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-card);
}

.note-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
}

.note-header h3 {
  margin: 0;
  font-size: 16px;
  color: var(--text-primary);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-right: 12px;
}

.note-body {
  display: flex;
  flex-direction: column;
  padding: 20px;
  flex-grow: 1;
  gap: 16px;
}

.note-textarea {
  width: 100%;
  flex-grow: 1;
  resize: none;
  font-family: var(--font-family);
  background-color: var(--bg-main);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}

.note-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 16px;
}

.saved-message {
  color: var(--success-color);
  font-size: 14px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
}
</style>
