<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useVideoStore } from '../stores/video'
import { useProgramStore } from '../stores/program'
import Card from 'primevue/card'
import ProgressBar from 'primevue/progressbar'
import Button from 'primevue/button'

const videoStore = useVideoStore()
const programStore = useProgramStore()

// Local collapsible state for modules and subjects
const openModules = ref<Record<string, boolean>>({})
const openSubjects = ref<Record<string, boolean>>({})

const fetchVideoData = async () => {
  if (programStore.activeProgramId) {
    await videoStore.fetchVideos(programStore.activeProgramId)
    
    // Auto expand first module and its subjects on load
    if (videoStore.modules.length > 0) {
      openModules.value[videoStore.modules[0].id] = true
      if (videoStore.modules[0].subjects.length > 0) {
        openSubjects.value[videoStore.modules[0].subjects[0].id] = true
      }
    }
  }
}

onMounted(() => {
  fetchVideoData()
})

const toggleModule = (modId: string) => {
  openModules.value[modId] = !openModules.value[modId]
}

const toggleSubject = (subId: string) => {
  openSubjects.value[subId] = !openSubjects.value[subId]
}

// Global course progress calculations
const progressStats = computed(() => {
  let total = 0
  let completed = 0
  
  videoStore.modules.forEach(mod => {
    mod.subjects.forEach(sub => {
      sub.videos.forEach(vid => {
        total++
        if (vid.progress.status === 'done') {
          completed++
        }
      })
    })
  })

  return {
    total,
    completed,
    percent: total > 0 ? Math.round((completed / total) * 100) : 0
  }
})

const toggleVideoStatus = async (videoId: string, currentStatus: string) => {
  if (!programStore.activeProgramId) return
  const newStatus = currentStatus === 'done' ? 'todo' : 'done'
  await videoStore.updateVideoProgress(programStore.activeProgramId, videoId, newStatus)
}

const formatDuration = (seconds?: number | null) => {
  if (!seconds) return 'Duração não informada'
  const minutes = Math.floor(seconds / 60)
  return `${minutes} minutos`
}
</script>

<template>
  <div class="videos-view-container">
    <div class="header-section">
      <h1 class="page-title">Grade de Aulas em Vídeo</h1>
      <p class="page-subtitle">Acompanhe as aulas teóricas da pós-graduação e marque as assistidas para computar progresso.</p>
    </div>

    <!-- Overall Course Progress Header Card -->
    <Card class="progress-banner-card">
      <template #content>
        <div class="progress-banner-inner">
          <div class="progress-banner-info">
            <h3>Progresso do Curso</h3>
            <p>{{ progressStats.completed }} de {{ progressStats.total }} vídeos concluídos ({{ progressStats.percent }}%)</p>
          </div>
          <ProgressBar :value="progressStats.percent" class="banner-progressbar" />
        </div>
      </template>
    </Card>

    <div v-if="videoStore.loading" class="loading-state">
      <i class="pi pi-spin pi-spinner spinner-icon"></i>
      <p>Carregando grade curricular e progresso...</p>
    </div>

    <div v-else-if="videoStore.modules.length === 0" class="no-modules-state">
      <i class="pi pi-video no-video-icon"></i>
      <p>Este programa de estudos não possui grade de vídeos cadastrada.</p>
    </div>

    <!-- Curriculum Modules Tree -->
    <div v-else class="modules-tree">
      <div v-for="mod in videoStore.modules" :key="mod.id" class="module-node">
        <!-- Module Header Row -->
        <div class="module-header-row" @click="toggleModule(mod.id)">
          <div class="module-title-container">
            <i :class="openModules[mod.id] ? 'pi pi-chevron-down' : 'pi pi-chevron-right'" class="chevron-icon"></i>
            <span class="module-number-badge">Módulo {{ mod.moduleNumber }}</span>
            <h3 class="module-title">{{ mod.title }}</h3>
          </div>
        </div>

        <!-- Module Content: Subjects List -->
        <div v-show="openModules[mod.id]" class="module-subjects">
          <div v-for="sub in mod.subjects" :key="sub.id" class="subject-node">
            <!-- Subject Header Row -->
            <div class="subject-header-row" @click="toggleSubject(sub.id)">
              <div class="subject-title-container">
                <i :class="openSubjects[sub.id] ? 'pi pi-chevron-down' : 'pi pi-chevron-right'" class="chevron-icon sub-chev"></i>
                <h4 class="subject-title">{{ sub.name }}</h4>
              </div>
            </div>

            <!-- Subject Content: Videos List -->
            <div v-show="openSubjects[sub.id]" class="subject-videos-list">
              <div 
                v-for="vid in sub.videos" 
                :key="vid.id" 
                class="video-item-row"
                :class="{ 'is-completed': vid.progress.status === 'done' }"
              >
                <!-- Video Completion Checkbox Button -->
                <button 
                  class="completion-btn" 
                  @click="toggleVideoStatus(vid.id, vid.progress.status)"
                  :title="vid.progress.status === 'done' ? 'Desmarcar como assistido' : 'Marcar como assistido'"
                >
                  <i 
                    class="pi" 
                    :class="vid.progress.status === 'done' ? 'pi-check-square checked' : 'pi-stop unchecked'"
                  ></i>
                </button>

                <!-- Video Metadata -->
                <div class="video-info">
                  <span class="video-number">Aula {{ vid.videoNumber }}</span>
                  <h5 class="video-title">{{ vid.title }}</h5>
                  <span class="video-duration">{{ formatDuration(vid.durationSeconds) }}</span>
                </div>

                <!-- Video Action link (Optional player url) -->
                <div class="video-action" v-if="vid.url">
                  <a :href="vid.url" target="_blank" class="watch-link">
                    <Button label="Assistir" icon="pi pi-external-link" size="small" outlined />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.videos-view-container {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.header-section {
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 16px;
}

.page-title {
  font-size: 24px;
  font-weight: 800;
  margin: 0;
  color: var(--text-primary);
}

.page-subtitle {
  font-size: 13.5px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.progress-banner-card {
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
}

.progress-banner-inner {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.progress-banner-info h3 {
  font-size: 16px;
  font-weight: 700;
  margin: 0;
  color: var(--text-primary);
}

.progress-banner-info p {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 4px 0 0 0;
}

.banner-progressbar {
  height: 8px;
}

.loading-state,
.no-modules-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  gap: 16px;
  padding: 60px 0;
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
}

.spinner-icon,
.no-video-icon {
  font-size: 40px;
}

.spinner-icon {
  color: var(--accent-blue);
}

.no-modules-state p,
.loading-state p {
  font-size: 14px;
  margin: 0;
}

.modules-tree {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.module-node {
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  overflow: hidden;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
}

.module-header-row {
  padding: 16px 20px;
  background-color: rgba(26, 34, 54, 0.4);
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
  transition: background-color 0.2s;
}

.module-header-row:hover {
  background-color: rgba(26, 34, 54, 0.8);
}

.module-title-container {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text-primary);
}

.chevron-icon {
  font-size: 14px;
  color: var(--text-secondary);
}

.module-number-badge {
  background-color: var(--accent-blue-dim);
  color: var(--accent-blue);
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 4px;
  text-transform: uppercase;
}

.module-title {
  font-size: 15px;
  font-weight: 700;
  margin: 0;
}

.module-subjects {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.subject-node {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background-color: var(--bg-primary);
  overflow: hidden;
}

.subject-header-row {
  padding: 12px 16px;
  background-color: rgba(26, 34, 54, 0.2);
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
  transition: background-color 0.2s;
}

.subject-header-row:hover {
  background-color: rgba(26, 34, 54, 0.4);
}

.subject-title-container {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-primary);
}

.sub-chev {
  font-size: 12px;
}

.subject-title {
  font-size: 13.5px;
  font-weight: 600;
  margin: 0;
}

.subject-videos-list {
  display: flex;
  flex-direction: column;
}

.video-item-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  transition: background-color 0.2s;
}

.video-item-row:last-child {
  border-bottom: none;
}

.video-item-row:hover {
  background-color: var(--bg-card-hover);
}

.video-item-row.is-completed {
  background-color: rgba(52, 211, 153, 0.02);
}

.completion-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.completion-btn i {
  font-size: 20px;
  transition: transform 0.15s;
}

.completion-btn i:hover {
  transform: scale(1.15);
}

.completion-btn i.checked {
  color: var(--accent-green);
}

.completion-btn i.unchecked {
  color: var(--text-muted);
}

.video-info {
  flex-grow: 1;
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
}

.video-number {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 600;
}

.video-title {
  font-size: 13px;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary);
}

.video-duration {
  font-size: 11px;
  color: var(--text-secondary);
}

.video-item-row.is-completed .video-title {
  color: var(--text-secondary);
  text-decoration: line-through;
}

.watch-link {
  text-decoration: none;
}
</style>
