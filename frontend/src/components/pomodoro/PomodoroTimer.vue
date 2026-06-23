<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { usePomodoroStore } from '../../stores/pomodoro'
import type { TimerMode } from '../../stores/pomodoro'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputNumber from 'primevue/inputnumber'
import ToggleSwitch from 'primevue/toggleswitch'

const pomodoroStore = usePomodoroStore()
const configDialogOpen = ref(false)

const tempFocus = ref(25)
const tempShort = ref(5)
const tempLong = ref(15)
const tempAutoBreaks = ref(false)
const tempAutoFocus = ref(false)

onMounted(() => {
  pomodoroStore.initTimer()
})

const openConfig = () => {
  tempFocus.value = pomodoroStore.config.focusDuration
  tempShort.value = pomodoroStore.config.shortBreakDuration
  tempLong.value = pomodoroStore.config.longBreakDuration
  tempAutoBreaks.value = pomodoroStore.config.autoStartBreaks
  tempAutoFocus.value = pomodoroStore.config.autoStartFocus
  configDialogOpen.value = true
}

const saveConfig = () => {
  pomodoroStore.saveConfig({
    focusDuration: tempFocus.value,
    shortBreakDuration: tempShort.value,
    longBreakDuration: tempLong.value,
    autoStartBreaks: tempAutoBreaks.value,
    autoStartFocus: tempAutoFocus.value
  })
  configDialogOpen.value = false
}

// Circular progress calculation
const strokeDasharray = 565.48 // 2 * pi * 90
const strokeDashoffset = computed(() => {
  const percent = pomodoroStore.progressPercent
  return strokeDasharray * (1 - percent / 100)
})

const changeMode = (newMode: TimerMode) => {
  pomodoroStore.setMode(newMode)
}
</script>

<template>
  <div class="pomodoro-card">
    <div class="pomodoro-title">
      <div class="pomodoro-icon">⏱️</div>
      <h2>Cronômetro Pomodoro</h2>
    </div>

    <!-- Mode Selector Tabs -->
    <div class="mode-tabs">
      <button 
        class="mode-btn" 
        :class="{ active: pomodoroStore.mode === 'focus' }"
        @click="changeMode('focus')"
      >
        Foco
      </button>
      <button 
        class="mode-btn" 
        :class="{ active: pomodoroStore.mode === 'short_break' }"
        @click="changeMode('short_break')"
      >
        Pausa Curta
      </button>
      <button 
        class="mode-btn" 
        :class="{ active: pomodoroStore.mode === 'long_break' }"
        @click="changeMode('long_break')"
      >
        Pausa Longa
      </button>
    </div>

    <!-- Timer Ring Display -->
    <div class="timer-display">
      <div class="timer-ring-container">
        <svg class="timer-ring" width="200" height="200" viewBox="0 0 200 200">
          <defs>
            <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#638aff" />
              <stop offset="100%" stop-color="#a78bfa" />
            </linearGradient>
            <linearGradient id="breakGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#34d399" />
              <stop offset="100%" stop-color="#06b6d4" />
            </linearGradient>
          </defs>
          <circle 
            class="timer-ring-bg" 
            cx="100" 
            cy="100" 
            r="90" 
          />
          <circle 
            class="timer-ring-progress" 
            :class="{ 'break-mode': pomodoroStore.mode !== 'focus' }"
            cx="100" 
            cy="100" 
            r="90" 
            :style="{ 
              strokeDasharray: strokeDasharray, 
              strokeDashoffset: strokeDashoffset 
            }"
          />
        </svg>
        <div class="timer-time">
          {{ pomodoroStore.formattedTime }}
        </div>
      </div>
      <div class="timer-label">
        {{ pomodoroStore.mode === 'focus' ? 'Foco Ativo' : 'Tempo de Pausa' }}
      </div>
    </div>

    <!-- Controls -->
    <div class="timer-controls">
      <Button 
        v-if="!pomodoroStore.isActive"
        label="Iniciar" 
        icon="pi pi-play" 
        severity="success"
        class="p-button-raised"
        @click="pomodoroStore.startTimer()"
      />
      <Button 
        v-else
        label="Pausar" 
        icon="pi pi-pause" 
        severity="warn"
        class="p-button-raised"
        @click="pomodoroStore.pauseTimer()"
      />
      
      <Button 
        icon="pi pi-refresh" 
        severity="secondary" 
        outlined
        @click="pomodoroStore.resetTimer()"
        title="Reiniciar"
      />
      
      <Button 
        icon="pi pi-cog" 
        severity="secondary" 
        outlined
        @click="openConfig"
        title="Configurações"
      />
    </div>

    <!-- Stats summary -->
    <div class="pomodoro-summary">
      Focos concluídos hoje: <span class="session-count">{{ pomodoroStore.totalFocusSessionsToday }}</span>
    </div>

    <!-- Configuration Dialog -->
    <Dialog 
      v-model:visible="configDialogOpen" 
      header="Configurações do Pomodoro" 
      :modal="true"
      class="config-dialog"
      :style="{ width: '400px' }"
    >
      <div class="config-fields">
        <div class="config-field">
          <label>Tempo de Foco (minutos)</label>
          <InputNumber v-model="tempFocus" :min="1" :max="120" showButtons />
        </div>
        <div class="config-field">
          <label>Pausa Curta (minutos)</label>
          <InputNumber v-model="tempShort" :min="1" :max="60" showButtons />
        </div>
        <div class="config-field">
          <label>Pausa Longa (minutos)</label>
          <InputNumber v-model="tempLong" :min="1" :max="60" showButtons />
        </div>
        
        <div class="config-toggle-field">
          <label for="auto-breaks">Auto-iniciar Pausas</label>
          <ToggleSwitch id="auto-breaks" v-model="tempAutoBreaks" />
        </div>
        <div class="config-toggle-field">
          <label for="auto-focus">Auto-iniciar Foco</label>
          <ToggleSwitch id="auto-focus" v-model="tempAutoFocus" />
        </div>
      </div>
      
      <template #footer>
        <Button label="Cancelar" icon="pi pi-times" text @click="configDialogOpen = false" />
        <Button label="Salvar" icon="pi pi-check" @click="saveConfig" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.pomodoro-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  padding: 24px;
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.pomodoro-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
  width: 100%;
}

.pomodoro-icon {
  font-size: 20px;
  background: var(--accent-red-dim);
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pomodoro-title h2 {
  font-size: 16px;
  font-weight: 700;
  margin: 0;
  color: var(--text-primary);
}

.mode-tabs {
  display: flex;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  padding: 4px;
  border-radius: var(--radius-sm);
  width: 100%;
  margin-bottom: 24px;
}

.mode-btn {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  padding: 6px 12px;
  border-radius: var(--radius-xs);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.mode-btn:hover {
  color: var(--text-primary);
}

.mode-btn.active {
  background: var(--bg-card);
  color: var(--text-primary);
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}

.timer-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 24px;
}

.timer-ring-container {
  position: relative;
  width: 200px;
  height: 200px;
  margin-bottom: 12px;
}

.timer-ring {
  transform: rotate(-90deg);
}

.timer-ring-bg {
  fill: none;
  stroke: var(--bg-primary);
  stroke-width: 6;
}

.timer-ring-progress {
  fill: none;
  stroke: url(#timerGradient);
  stroke-width: 6;
  stroke-linecap: round;
  stroke-dasharray: 565.48;
  stroke-dashoffset: 565.48;
  transition: stroke-dashoffset 0.3s linear;
}

.timer-ring-progress.break-mode {
  stroke: url(#breakGradient);
}

.timer-time {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 40px;
  font-weight: 800;
  letter-spacing: -1px;
  color: var(--text-primary);
  font-family: monospace;
}

.timer-label {
  font-size: 12px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 1.5px;
  font-weight: 600;
}

.timer-controls {
  display: flex;
  gap: 12px;
  justify-content: center;
  width: 100%;
  margin-bottom: 20px;
}

.pomodoro-summary {
  font-size: 12px;
  color: var(--text-secondary);
  border-top: 1px solid var(--border-color);
  width: 100%;
  padding-top: 12px;
  text-align: center;
}

.session-count {
  color: var(--accent-green);
  font-weight: 700;
}

/* Dialog fields */
.config-fields {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 10px 0;
}

.config-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.config-field label {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 500;
}

.config-toggle-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
}

.config-toggle-field label {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 500;
}
</style>
