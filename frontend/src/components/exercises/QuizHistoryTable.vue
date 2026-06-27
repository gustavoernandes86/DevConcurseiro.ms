<script setup lang="ts">
import { useExerciseStore } from '../../stores/exercise'
import Card from 'primevue/card'
import Tag from 'primevue/tag'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'

const exerciseStore = useExerciseStore()

const emit = defineEmits<{
  (e: 'showDetail', data: any): void
}>()

const formatDate = (dateNum?: number | null) => {
  if (!dateNum) return '-'
  const d = new Date(dateNum)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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
            <Button 
              icon="pi pi-eye" 
              class="p-button-text p-button-rounded p-button-sm" 
              @click="emit('showDetail', slotProps.data)"
              title="Visualizar respostas e gabarito" aria-label="Visualizar respostas e gabarito"
            />
          </template>
        </Column>
      </DataTable>
    </template>
  </Card>
</template>
