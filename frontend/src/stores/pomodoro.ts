import { defineStore } from 'pinia'
import { useProgramStore } from './program'
import { ref, computed } from 'vue'

export type TimerMode = 'focus' | 'short_break' | 'long_break'

export interface PomodoroConfig {
  focusDuration: number // in minutes
  shortBreakDuration: number
  longBreakDuration: number
  autoStartBreaks: boolean
  autoStartFocus: boolean
}

export const usePomodoroStore = defineStore('pomodoro', () => {
  const mode = ref<TimerMode>('focus')
  const minutes = ref(25)
  const seconds = ref(0)
  const isActive = ref(false)
  const config = ref<PomodoroConfig>({
    focusDuration: 25,
    shortBreakDuration: 5,
    longBreakDuration: 15,
    autoStartBreaks: false,
    autoStartFocus: false
  })
  const intervalId = ref<number | null>(null)
  const startedAt = ref<number | null>(null)
  const totalFocusSessionsToday = ref(0)

  // Getters (Computeds)
  const formattedTime = computed(() => {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${pad(minutes.value)}:${pad(seconds.value)}`
  })

  const progressPercent = computed(() => {
    const totalSecs = totalSecondsForMode(mode.value)
    if (totalSecs === 0) return 0
    const currentSeconds = minutes.value * 60 + seconds.value
    return Math.round(((totalSecs - currentSeconds) / totalSecs) * 100)
  })

  // Helper/Action
  const totalSecondsForMode = (tMode: TimerMode): number => {
    switch (tMode) {
      case 'focus': return config.value.focusDuration * 60
      case 'short_break': return config.value.shortBreakDuration * 60
      case 'long_break': return config.value.longBreakDuration * 60
    }
  }

  const getDurationForMode = (tMode: TimerMode): number => {
    switch (tMode) {
      case 'focus': return config.value.focusDuration
      case 'short_break': return config.value.shortBreakDuration
      case 'long_break': return config.value.longBreakDuration
    }
  }

  const initTimer = () => {
    const savedConfig = localStorage.getItem('pomodoroConfig')
    if (savedConfig) {
      try {
        config.value = JSON.parse(savedConfig)
      } catch (e) {
        console.error(e)
      }
    }
    if (!isActive.value && startedAt.value === null) {
      resetTimer()
    }
  }

  const saveConfig = (newConfig: PomodoroConfig) => {
    config.value = { ...newConfig }
    localStorage.setItem('pomodoroConfig', JSON.stringify(config.value))
    resetTimer()
  }

  const startTimer = () => {
    if (isActive.value) return
    isActive.value = true
    if (!startedAt.value) {
      startedAt.value = Date.now()
    }
    
    // Request notifications permission if not granted
    if (Notification.permission === 'default') {
      Notification.requestPermission()
    }

    intervalId.value = window.setInterval(() => {
      if (seconds.value > 0) {
        seconds.value--
      } else if (minutes.value > 0) {
        minutes.value--
        seconds.value = 59
      } else {
        // Timer finished
        timerFinished()
      }
    }, 1000)
  }

  const pauseTimer = () => {
    isActive.value = false
    if (intervalId.value) {
      clearInterval(intervalId.value)
      intervalId.value = null
    }
  }

  const resetTimer = () => {
    pauseTimer()
    startedAt.value = null
    minutes.value = getDurationForMode(mode.value)
    seconds.value = 0
  }

  const setMode = (newMode: TimerMode) => {
    mode.value = newMode
    resetTimer()
  }

  const playAlarmSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
      const playBeep = (startTime: number, frequency: number, duration: number) => {
        const osc = audioCtx.createOscillator()
        const gain = audioCtx.createGain()
        osc.connect(gain)
        gain.connect(audioCtx.destination)
        
        osc.frequency.setValueAtTime(frequency, startTime)
        gain.gain.setValueAtTime(0, startTime)
        gain.gain.linearRampToValueAtTime(0.3, startTime + 0.05)
        gain.gain.setValueAtTime(0.3, startTime + duration - 0.05)
        gain.gain.linearRampToValueAtTime(0, startTime + duration)
        
        osc.start(startTime)
        osc.stop(startTime + duration)
      }

      const now = audioCtx.currentTime
      playBeep(now, 880, 0.15)
      playBeep(now + 0.25, 880, 0.15)
      playBeep(now + 0.5, 1200, 0.35)
    } catch (e) {
      console.error('AudioContext falhou:', e)
    }
  }

  const sendDesktopNotification = () => {
    if (Notification.permission === 'granted') {
      const title = mode.value === 'focus' ? 'Hora de descansar! ☕' : 'De volta ao trabalho! 🚀'
      const body = mode.value === 'focus' 
        ? 'Você concluiu seu período de foco. Aproveite sua pausa!'
        : 'Pausa concluída. Pronto para começar um novo período de foco?'
      
      new Notification(title, { body })
    }
  }

  const timerFinished = async () => {
    pauseTimer()
    playAlarmSound()
    sendDesktopNotification()

    const finishedMode = mode.value
    const start = startedAt.value || Date.now()
    const end = Date.now()
    const durationSeconds = Math.round((end - start) / 1000)

    startedAt.value = null

    // Save focus session to server
    if (finishedMode === 'focus') {
      totalFocusSessionsToday.value++
      const programStore = useProgramStore()
      const activeProgramId = programStore.activeProgramId || 'petrobras-eng-software-2026'
      try {
        await fetch(`/api/programs/${activeProgramId}/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            startedAt: start,
            endedAt: end,
            type: 'focus',
            duration: durationSeconds,
            source: 'pomodoro'
          })
        })
      } catch (e) {
        console.error('Falha ao salvar sessão pomodoro:', e)
      }
    }

    // Switch mode automatically
    if (finishedMode === 'focus') {
      if (totalFocusSessionsToday.value % 4 === 0) {
        mode.value = 'long_break'
      } else {
        mode.value = 'short_break'
      }
      resetTimer()
      if (config.value.autoStartBreaks) {
        startTimer()
      }
    } else {
      mode.value = 'focus'
      resetTimer()
      if (config.value.autoStartFocus) {
        startTimer()
      }
    }
  }

  return {
    mode,
    minutes,
    seconds,
    isActive,
    config,
    intervalId,
    startedAt,
    totalFocusSessionsToday,
    formattedTime,
    progressPercent,
    initTimer,
    saveConfig,
    startTimer,
    pauseTimer,
    resetTimer,
    setMode
  }
})
