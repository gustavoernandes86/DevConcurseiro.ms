<script setup lang="ts">
import { ref } from 'vue'
import { usePdfStore } from '../../stores/pdf'
import { usePomodoroStore } from '../../stores/pomodoro'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import PdfReaderPanel from '../pdf/PdfReaderPanel.vue'

const pdfStore = usePdfStore()
const pomodoroStore = usePomodoroStore()

const pdfModalMaximized = ref(true)
</script>

<template>
  <Dialog 
    v-model:visible="pdfStore.pdfViewerOpen" 
    v-model:maximized="pdfModalMaximized"
    :modal="true"
    maximizable
    class="pdf-viewer-dialog"
    contentClass="pdf-viewer-dialog-content"
    @hide="pdfStore.closePdf()"
  >
    <template #header>
      <div class="pdf-modal-header">
        <i class="pi pi-file-pdf pdf-icon"  aria-hidden="true"></i>
        <h3 class="pdf-title" :title="pdfStore.activeMaterialTitle">{{ pdfStore.activeMaterialTitle }}</h3>
        <span class="page-badge">
          Pág. {{ pdfStore.currentPage }} de {{ pdfStore.totalPages }}
        </span>
      </div>
    </template>

    <div class="pdf-modal-container">
      <!-- Floating Mini Pomodoro in the Top Left Corner -->
      <div class="floating-pomodoro-wrapper">
        <div class="mini-pomodoro-card" :class="pomodoroStore.mode">
          <div class="mini-pomodoro-header">
            <span class="mini-mode-tag" :class="pomodoroStore.mode">
              {{ pomodoroStore.mode === 'focus' ? 'Foco' : 'Pausa' }}
            </span>
            <span class="mini-status-dot" :class="{ active: pomodoroStore.isActive }"></span>
          </div>
          <div class="mini-pomodoro-body">
            <div class="mini-timer-time">
              {{ pomodoroStore.formattedTime }}
            </div>
            <div class="mini-controls">
              <Button 
                v-if="!pomodoroStore.isActive"
                icon="pi pi-play" 
                class="p-button-rounded p-button-success p-button-sm mini-btn" 
                @click="pomodoroStore.startTimer()"
                title="Continuar" aria-label="Continuar Timer Pomodoro"
              />
              <Button 
                v-else
                icon="pi pi-pause" 
                class="p-button-rounded p-button-warn p-button-sm mini-btn" 
                @click="pomodoroStore.pauseTimer()"
                title="Pausar" aria-label="Pausar Timer Pomodoro"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- PDF Reader component -->
      <PdfReaderPanel hideHeader />
    </div>
  </Dialog>
</template>

<style scoped>
/* PDF Dialog Modal Styling */

/* Estilo base do modal (estado restaurado/normal, não maximizado) */
:deep(.pdf-viewer-dialog) {
  background-color: var(--bg-secondary) !important;
  border: 1px solid var(--border-color) !important;
  border-radius: var(--radius) !important;
  width: 92vw !important;
  height: 90vh !important;
  max-width: 1400px !important;
  max-height: 90vh !important;
  display: flex !important;
  flex-direction: column !important;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5) !important;
}

/* Estilo aplicado SOMENTE quando o PrimeVue maximiza o dialog */
:deep(.pdf-viewer-dialog.p-dialog-maximized) {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  max-width: 100vw !important;
  max-height: 100vh !important;
  margin: 0 !important;
  border: none !important;
  border-radius: 0 !important;
}

:deep(.pdf-viewer-dialog .p-dialog-header) {
  background-color: var(--bg-card) !important;
  border-bottom: 1px solid var(--border-color) !important;
  padding: 12px 24px !important;
  color: var(--text-primary) !important;
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  flex-shrink: 0 !important;
}

:deep(.pdf-viewer-dialog .p-dialog-content) {
  padding: 0 !important;
  background-color: #525659 !important; /* PDF.js default dark viewer background */
  flex: 1 1 0% !important;
  min-height: 0 !important;
  display: flex !important;
  flex-direction: column !important;
}

:deep(.pdf-viewer-dialog .p-dialog-header-actions) {
  margin-left: auto !important;
  display: flex !important;
  align-items: center !important;
  gap: 4px !important;
}

/* Botão de maximizar/restaurar */
:deep(.pdf-viewer-dialog .p-dialog-header-icon) {
  color: var(--text-secondary) !important;
  background: transparent !important;
  border: none !important;
  width: 32px !important;
  height: 32px !important;
  border-radius: 50% !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  transition: all 0.2s !important;
  cursor: pointer !important;
}

:deep(.pdf-viewer-dialog .p-dialog-header-icon:hover) {
  background-color: var(--bg-card-hover) !important;
  color: var(--text-primary) !important;
}

.pdf-modal-header {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-grow: 1;
}

.pdf-modal-header .pdf-icon {
  color: var(--accent-red);
  font-size: 20px;
}

.pdf-modal-header .pdf-title {
  font-size: 15px;
  font-weight: 700;
  margin: 0;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 60%;
}

.pdf-modal-header .page-badge {
  font-size: 11px;
  background-color: var(--bg-primary);
  border: 1px solid var(--border-color);
  padding: 4px 8px;
  border-radius: var(--radius-xs);
  color: var(--text-secondary);
  font-weight: 600;
}

.pdf-modal-container {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.floating-pomodoro-wrapper {
  position: absolute;
  top: 60px; /* Below the PDF reader header */
  left: 20px;
  z-index: 1000; /* Over the iframe and other content */
  pointer-events: none; /* Let clicks pass through outside the card */
}

.mini-pomodoro-card {
  pointer-events: auto; /* Enable clicks inside the card */
  background: rgba(26, 34, 54, 0.85);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(99, 138, 255, 0.3);
  border-radius: var(--radius-sm);
  padding: 10px 14px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 140px;
  transition: all 0.3s ease;
}

.mini-pomodoro-card:hover {
  background: rgba(26, 34, 54, 0.95);
  border-color: rgba(99, 138, 255, 0.5);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.6);
}

.mini-pomodoro-card.focus {
  border-left: 3px solid var(--accent-red);
}

.mini-pomodoro-card.short_break,
.mini-pomodoro-card.long_break {
  border-left: 3px solid var(--accent-green);
}

.mini-pomodoro-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.mini-mode-tag {
  font-size: 9px;
  text-transform: uppercase;
  font-weight: 700;
  letter-spacing: 0.5px;
  padding: 1px 4px;
  border-radius: 3px;
}

.mini-mode-tag.focus {
  background-color: var(--accent-red-dim);
  color: var(--accent-red);
}

.mini-mode-tag.short_break,
.mini-mode-tag.long_break {
  background-color: var(--accent-green-dim);
  color: var(--accent-green);
}

.mini-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--text-muted);
}

.mini-status-dot.active {
  background-color: var(--accent-green);
  box-shadow: 0 0 8px var(--accent-green);
  animation: pulse-dot 1.5s infinite;
}

@keyframes pulse-dot {
  0% { opacity: 0.4; }
  50% { opacity: 1; }
  100% { opacity: 0.4; }
}

.mini-pomodoro-body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.mini-timer-time {
  font-size: 18px;
  font-weight: 800;
  font-family: monospace;
  color: var(--text-primary);
  line-height: 1;
}

.mini-controls {
  display: flex;
  align-items: center;
  gap: 4px;
}

.mini-btn {
  width: 24px !important;
  height: 24px !important;
  padding: 0 !important;
  font-size: 10px !important;
}
</style>
