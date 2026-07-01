import { describe, beforeEach, it, expect, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePomodoroStore } from '../stores/pomodoro'

// Mocking useProgramStore behavior if needed
vi.mock('../stores/program', () => {
  return {
    useProgramStore: vi.fn(() => ({
      activeProgramId: 'program-123'
    }))
  }
})

describe('Pomodoro Timer Pinia Store', () => {
  beforeEach(() => {
    // Sets up a clean Pinia instance for each test
    setActivePinia(createPinia())

    // Mock browser's Notification API
    global.Notification = {
      permission: 'granted',
      requestPermission: vi.fn(() => Promise.resolve('granted'))
    } as any
  })

  it('should initialize with default Pomodoro values', () => {
    const store = usePomodoroStore()
    expect(store.isActive).toBe(false)
    expect(store.mode).toBe('focus')
    expect(store.minutes).toBe(25)
    expect(store.seconds).toBe(0)
    expect(store.formattedTime).toBe('25:00')
  })

  it('should format values correctly', () => {
    const store = usePomodoroStore()
    
    store.minutes = 1
    store.seconds = 5
    expect(store.formattedTime).toBe('01:05')

    store.minutes = 0
    store.seconds = 9
    expect(store.formattedTime).toBe('00:09')
  })

  it('should toggle and pause properly', () => {
    const store = usePomodoroStore()
    expect(store.isActive).toBe(false)
    
    store.startTimer()
    expect(store.isActive).toBe(true)
    
    store.pauseTimer()
    expect(store.isActive).toBe(false)
  })

  it('should reset timer for the current mode when resetTimer is called', () => {
    const store = usePomodoroStore()
    store.mode = 'short_break'
    store.minutes = 3 // altered
    store.seconds = 12 // altered
    store.isActive = true

    store.resetTimer()
    expect(store.mode).toBe('short_break') // remains same
    expect(store.minutes).toBe(5) // reset to break duration config
    expect(store.seconds).toBe(0)
    expect(store.isActive).toBe(false)
  })

  it('should switch mode and reset when setMode is called', () => {
    const store = usePomodoroStore()
    store.mode = 'focus'
    store.minutes = 20

    store.setMode('long_break')
    expect(store.mode).toBe('long_break')
    expect(store.minutes).toBe(15) // default long break
    expect(store.seconds).toBe(0)
  })
})
