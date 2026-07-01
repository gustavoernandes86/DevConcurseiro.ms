<script setup lang="ts">
import { useExerciseStore } from '../../stores/exercise'
import { useProgramStore } from '../../stores/program'
import { useNotification } from '../../composables/useNotification'
import Card from 'primevue/card'
import Tag from 'primevue/tag'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'

const exerciseStore = useExerciseStore()
const programStore = useProgramStore()
const { showSuccess, showError } = useNotification()

const emit = defineEmits<{
  (e: 'showDetail', data: any): void
}>()

const formatDate = (dateNum?: number | null) => {
  if (!dateNum) return '-'
  const d = new Date(dateNum)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const handleDelete = async (sessionId: string) => {
  if (confirm('Deseja realmente remover este simulado do seu histórico?')) {
    try {
      await exerciseStore.deleteSession(programStore.activeProgramId, sessionId)
      showSuccess('Removido', 'Simulado excluído com sucesso.')
    } catch (err: any) {
      showError('Erro', err.message || 'Erro ao remover simulado.')
    }
  }
}
</script>

<template>
  <Card class="history-card">
    <template #title>
      <div class="card-title">
        <i class="pi pi-history"  aria-hidden="true"></i>
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
              :value="slotProps.data.score !== null ? `${slotProps.data.score}/${slotProps.data.questions ? slotProps.data.questions.length : 10}` : 'Incompleto'"
              :severity="slotProps.data.score === null ? 'warning' : (slotProps.data.score >= ((slotProps.data.questions ? slotProps.data.questions.length : 10) * 0.6) ? 'success' : 'danger')" 
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
            <div style="display: flex; gap: 0.25rem; align-items: center;">
              <Button 
                icon="pi pi-eye" 
                class="p-button-text p-button-rounded p-button-sm" 
                @click="emit('showDetail', slotProps.data)"
                title="Visualizar respostas e gabarito" aria-label="Visualizar respostas e gabarito"
              />
              <Button 
                icon="pi pi-trash" 
                class="p-button-text p-button-rounded p-button-sm p-button-danger" 
                @click="handleDelete(slotProps.data.id)"
                title="Excluir simulado" aria-label="Excluir simulado"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </template>
  </Card>
</template>
