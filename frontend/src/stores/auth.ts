import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface AuthUser {
  id: number
  email: string
  name: string
  picture: string
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null)
  const loading = ref(false)
  const checked = ref(false) // true once we've made at least one /me call

  const isAuthenticated = computed(() => !!user.value)

  async function checkAuth(): Promise<boolean> {
    if (checked.value) return isAuthenticated.value
    loading.value = true
    try {
      const res = await fetch('/api/auth/me')
      if (res.ok) {
        const data = await res.json()
        user.value = data.user
      } else {
        user.value = null
      }
    } catch {
      user.value = null
    } finally {
      loading.value = false
      checked.value = true
    }
    return isAuthenticated.value
  }

  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch { /* ignore */ }
    user.value = null
    checked.value = false
    window.location.href = '/login'
  }

  return { user, loading, checked, isAuthenticated, checkAuth, logout }
})
