import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import StudyPlanView from '../views/StudyPlanView.vue'
import HistoryView from '../views/HistoryView.vue'
import ExercisesView from '../views/ExercisesView.vue'
import VideosView from '../views/VideosView.vue'
import SettingsView from '../views/SettingsView.vue'

const routes: RouteRecordRaw[] = [
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
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
