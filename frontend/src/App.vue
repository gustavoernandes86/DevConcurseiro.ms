<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useProgramStore } from './stores/program'
import { useAuthStore } from './stores/auth'
import Select from 'primevue/select'
import Toast from 'primevue/toast'
import ConfirmDialog from 'primevue/confirmdialog'

const programStore = useProgramStore()
const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()

onMounted(() => {
  programStore.fetchPrograms()
})

// Watch activeProgramId to update route when program selection changes
watch(
  () => programStore.activeProgramId,
  (newId) => {
    if (route.params.programId && route.params.programId !== newId) {
      const segments = route.path.split('/')
      // Find the index of "programs" and replace the next segment (programId)
      const progIdx = segments.indexOf('programs')
      if (progIdx !== -1 && progIdx + 1 < segments.length) {
        segments[progIdx + 1] = newId
        router.push(segments.join('/'))
      }
    }
  }
)
</script>

<template>
  <div class="app-layout">
    <!-- Header -->
    <header class="app-header">
      <div class="header-content">
        <!-- Logo -->
        <router-link to="/" class="logo">
          <div class="logo-icon" role="img" aria-label="Foguete">🚀</div>
          <div class="logo-text">
            <h1>DevConcurseiro</h1>
            <span>Estudos Inteligentes local-first</span>
          </div>
        </router-link>

        <!-- Program Selector -->
        <div class="program-selector-container">
          <label for="program-select" class="selector-label">Programa Ativo:</label>
          <Select
            id="program-select"
            v-model="programStore.activeProgramId"
            :options="programStore.programs"
            optionLabel="name"
            optionValue="id"
            placeholder="Selecione um programa"
            class="program-dropdown"
          />
        </div>

        <!-- Navigation Menu -->
        <nav class="nav-menu">
          <router-link
            v-if="programStore.activeProgramId"
            :to="`/programs/${programStore.activeProgramId}/dashboard`"
            class="nav-item"
            active-class="active"
          >
            <i class="pi pi-chart-bar" aria-hidden="true"></i>
            <span>Dashboard</span>
          </router-link>

          <router-link
            v-if="programStore.activeProgramId"
            :to="`/programs/${programStore.activeProgramId}/plan`"
            class="nav-item"
            active-class="active"
          >
            <i class="pi pi-home"  aria-hidden="true"></i>
            <span>Início</span>
          </router-link>

          <router-link
            v-if="programStore.activeProgramId"
            :to="`/programs/${programStore.activeProgramId}/exercises`"
            class="nav-item"
            active-class="active"
          >
            <i class="pi pi-book"  aria-hidden="true"></i>
            <span>Exercícios IA</span>
          </router-link>

          <router-link
            v-if="programStore.activeProgramId"
            :to="`/programs/${programStore.activeProgramId}/videos`"
            class="nav-item"
            active-class="active"
          >
            <i class="pi pi-video"  aria-hidden="true"></i>
            <span>Vídeos</span>
          </router-link>

          <router-link
            v-if="programStore.activeProgramId"
            :to="`/programs/${programStore.activeProgramId}/history`"
            class="nav-item"
            active-class="active"
          >
            <i class="pi pi-history"  aria-hidden="true"></i>
            <span>Histórico</span>
          </router-link>

          <router-link to="/contests" class="nav-item" active-class="active">
            <i class="pi pi-list" aria-hidden="true"></i>
            <span>Concursos</span>
          </router-link>

          <router-link to="/settings" class="nav-item" active-class="active">
            <i class="pi pi-cog"  aria-hidden="true"></i>
            <span>Configurações</span>
          </router-link>
        </nav>
        <!-- User Avatar + Logout -->
        <div v-if="authStore.user" class="user-area">
          <img
            v-if="authStore.user.picture"
            :src="authStore.user.picture"
            :alt="authStore.user.name"
            class="user-avatar"
            :title="authStore.user.name + ' (' + authStore.user.email + ')'"
          />
          <span class="user-name">{{ authStore.user.name?.split(' ')[0] }}</span>
          <button class="btn-logout" @click="authStore.logout" title="Sair" aria-label="Sair da conta">
            <i class="pi pi-sign-out" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    </header>

    <!-- Main Container -->
    <main class="main-content">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>

    <!-- Global Elements -->
    <Toast />
    <ConfirmDialog />
  </div>
</template>

<style scoped>
.app-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-header {
  background: var(--bg-glass);
  backdrop-filter: blur(20px);
  border-bottom: 1px solid var(--border-color);
  position: sticky;
  top: 0;
  z-index: 100;
  padding: 12px 24px;
}

.header-content {
  max-width: 1300px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
}

.logo {
  display: flex;
  align-items: center;
  gap: 12px;
  text-decoration: none;
  color: var(--text-primary);
}

.logo-icon {
  font-size: 24px;
  width: 40px;
  height: 40px;
  background: var(--gradient-primary);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 15px rgba(99, 138, 255, 0.3);
}

.logo-text h1 {
  font-size: 16px;
  font-weight: 800;
  margin: 0;
  line-height: 1.2;
}

.logo-text span {
  font-size: 10px;
  color: var(--text-secondary);
}

.program-selector-container {
  display: flex;
  align-items: center;
  gap: 10px;
}

.selector-label {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 500;
}

.program-dropdown {
  min-width: 250px;
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
}

.nav-menu {
  display: flex;
  gap: 8px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s ease;
}

.nav-item i {
  font-size: 16px;
}

.nav-item:hover {
  color: var(--text-primary);
  background-color: var(--bg-card-hover);
}

.nav-item.active {
  color: var(--text-primary);
  background: var(--accent-blue-dim);
  border: 1px solid var(--border-color);
}

.main-content {
  flex-grow: 1;
  max-width: 1300px;
  width: 100%;
  margin: 0 auto;
  padding: 24px;
  box-sizing: border-box;
}

/* Route transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (max-width: 1024px) {
  .header-content {
    flex-direction: column;
    align-items: stretch;
  }
  
  .nav-menu {
    overflow-x: auto;
    padding-bottom: 8px;
    justify-content: flex-start;
  }
  
  .program-selector-container {
    justify-content: space-between;
  }
}

/* User area */
.user-area {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 8px;
  padding-left: 12px;
  border-left: 1px solid var(--border-color);
}

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid var(--border-color);
}

.user-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.btn-logout {
  background: none;
  border: none;
  color: var(--text-muted, #6e7681);
  cursor: pointer;
  padding: 6px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  transition: all 0.2s;
  font-size: 14px;
}

.btn-logout:hover {
  color: #e05252;
  background: rgba(224, 82, 82, 0.1);
}
</style>
