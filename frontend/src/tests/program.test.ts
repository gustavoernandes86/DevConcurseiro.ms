import { describe, beforeEach, it, expect, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useProgramStore } from '../stores/program'

describe('Program Pinia Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    global.fetch = vi.fn()
  })

  it('should initialize with default activeProgramId or load from localStorage', () => {
    localStorage.setItem('activeProgramId', 'cached-prog-id')
    const store = useProgramStore()
    expect(store.activeProgramId).toBe('cached-prog-id')
    expect(store.programs).toEqual([])
    expect(store.loading).toBe(false)
  })

  it('should change activeProgramId and save to localStorage on setActiveProgramId', () => {
    const store = useProgramStore()
    store.setActiveProgramId('new-program-id')
    expect(store.activeProgramId).toBe('new-program-id')
    expect(localStorage.getItem('activeProgramId')).toBe('new-program-id')
  })

  it('should toggle loading state and set programs list on fetchPrograms success', async () => {
    const mockPrograms = [
      { id: 'prog-1', name: 'Program 1', type: 'contest', active: 1 },
      { id: 'prog-2', name: 'Program 2', type: 'course', active: 0 }
    ]

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockPrograms)
    })

    const store = useProgramStore()
    const fetchPromise = store.fetchPrograms()
    
    // loading should be true while request is in flight
    expect(store.loading).toBe(true)
    
    await fetchPromise
    
    expect(store.loading).toBe(false)
    expect(store.programs).toEqual(mockPrograms)
    expect(store.error).toBeNull()
  })

  it('should set activeProgramId to first fetched program if current is not in the list', async () => {
    const mockPrograms = [
      { id: 'prog-1', name: 'Program 1', type: 'contest', active: 1 }
    ]

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockPrograms)
    })

    const store = useProgramStore()
    // Current active program id doesn't match mockPrograms list
    store.activeProgramId = 'non-matching-id'

    await store.fetchPrograms()

    expect(store.activeProgramId).toBe('prog-1')
    expect(localStorage.getItem('activeProgramId')).toBe('prog-1')
  })

  it('should handle fetch errors gracefully', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false
    })

    const store = useProgramStore()
    await store.fetchPrograms()

    expect(store.loading).toBe(false)
    expect(store.programs).toEqual([])
    expect(store.error).toBe('Falha ao buscar programas de estudo')
  })
})
