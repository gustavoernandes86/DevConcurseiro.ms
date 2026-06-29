import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import StudyPlanView from '../views/StudyPlanView.vue'
import HistoryView from '../views/HistoryView.vue'
import ExercisesView from '../views/ExercisesView.vue'
import VideosView from '../views/VideosView.vue'
import SettingsView from '../views/SettingsView.vue'
import LoginView from '../views/LoginView.vue'
import ContestsListView from '../views/ContestsListView.vue'
import ContestWizardView from '../views/ContestWizardView.vue'
import { useAuthStore } from '../stores/auth'

// Public routes that don't require authentication
const PUBLIC_ROUTES = new Set(['/login'])

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: LoginView,
    meta: { public: true }
  },
  {
    path: '/',
    redirect: () => {
      const activeProgramId = localStorage.getItem('activeProgramId') || 'petrobras-eng-software-2026'
      return `/programs/${activeProgramId}/plan`
    }
  },
  {
    path: '/programs/:programId/dashboard',
    redirect: (to) => `/programs/${to.params.programId}/plan`
  },
  {
    path: '/programs/:programId/plan',
    name: 'StudyPlan',
    component: StudyPlanView,
    props: true
  },
  {
    path: '/programs/:programId/history',
    name: 'History',
    component: HistoryView,
    props: true
  },
  {
    path: '/programs/:programId/exercises',
    name: 'Exercises',
    component: ExercisesView,
    props: true
  },
  {
    path: '/programs/:programId/videos',
    name: 'Videos',
    component: VideosView,
    props: true
  },
  {
    path: '/settings',
    name: 'Settings',
    component: SettingsView
  },
  {
    path: '/contests',
    name: 'ContestsList',
    component: ContestsListView
  },
  {
    path: '/contests/new',
    name: 'ContestWizard',
    component: ContestWizardView
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// ─── Auth Guard ───
router.beforeEach(async (to) => {
  // Public routes skip auth check
  if (to.meta.public || PUBLIC_ROUTES.has(to.path)) return true

  try {
    const authStore = useAuthStore()
    const isAuthenticated = await authStore.checkAuth()
    if (!isAuthenticated) {
      return { path: '/login' }
    }
  } catch {
    return { path: '/login' }
  }

  return true
})

export default router

