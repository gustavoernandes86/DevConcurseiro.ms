<script setup lang="ts">
import { ref, watch, onUnmounted, onMounted } from 'vue'
import { usePdfStore } from '../../stores/pdf'
import { useProgramStore } from '../../stores/program'
import Button from 'primevue/button'

defineProps({
  hideHeader: {
    type: Boolean,
    default: false
  }
})

const pdfStore = usePdfStore()
const programStore = useProgramStore()
const iframeRef = ref<HTMLIFrameElement | null>(null)
const iframeUrl = ref('')

const updateIframeUrl = () => {
  if (!pdfStore.activeMaterialId) {
    iframeUrl.value = ''
    return
  }
  const fileUrl = `/api/materials/${pdfStore.activeMaterialId}/file`
  iframeUrl.value = `/pdfjs/web/viewer.html?file=${encodeURIComponent(fileUrl)}#page=${pdfStore.currentPage}`
}

// Watch active material to reload iframe URL
watch(
  () => pdfStore.activeMaterialId,
  () => {
    updateIframeUrl()
  },
  { immediate: true }
)

// Setup communication with PDF.js viewer
const onIframeLoad = () => {
  try {
    const iframeWin = iframeRef.value?.contentWindow as any
    if (iframeWin && iframeWin.PDFViewerApplication) {
      const app = iframeWin.PDFViewerApplication
      
      app.initializedPromise.then(() => {
        if (app.pagesCount) {
          pdfStore.totalPages = app.pagesCount
          pdfStore.saveCurrentBookmark(programStore.activeProgramId)
        }
      })

      // Bind scroll or page events
      app.eventBus.on('pagechanging', (evt: any) => {
        if (evt.pageNumber && evt.pageNumber !== pdfStore.currentPage) {
          pdfStore.updatePage(programStore.activeProgramId, evt.pageNumber)
        }
      })
    }
  } catch (e) {
    console.warn('Erro ao conectar ao eventBus do PDFJS (carregamento assíncrono em andamento):', e)
  }
}

// Keep checking for PDFViewerApplication load since initialization is async
let checkInterval: number | null = null
onMounted(() => {
  checkInterval = window.setInterval(() => {
    try {
      const iframeWin = iframeRef.value?.contentWindow as any
      if (iframeWin && iframeWin.PDFViewerApplication && iframeWin.PDFViewerApplication.eventBus) {
        onIframeLoad()
        if (checkInterval) {
          clearInterval(checkInterval)
          checkInterval = null
        }
      }
    } catch (e) {
      // Safe to ignore cross-origin errors if any
    }
  }, 1000)
})

onUnmounted(() => {
  if (checkInterval) {
    clearInterval(checkInterval)
  }
  pdfStore.clearReadingTimer()
})
</script>

<template>
  <div class="pdf-panel">
    <div v-if="!hideHeader" class="pdf-header">
      <div class="pdf-title-container">
        <i class="pi pi-file-pdf pdf-icon"></i>
        <h3 class="pdf-title" :title="pdfStore.activeMaterialTitle">{{ pdfStore.activeMaterialTitle }}</h3>
      </div>
      
      <div class="pdf-controls">
        <span class="page-badge">
          Pág. {{ pdfStore.currentPage }} de {{ pdfStore.totalPages }}
        </span>
        <Button 
          icon="pi pi-times" 
          class="p-button-rounded p-button-text p-button-secondary" 
          @click="pdfStore.closePdf()"
          title="Fechar PDF"
        />
      </div>
    </div>

    <div class="pdf-body">
      <iframe
        v-if="iframeUrl"
        ref="iframeRef"
        :src="iframeUrl"
        class="pdf-iframe"
        @load="onIframeLoad"
      ></iframe>
      <div v-else class="no-pdf">
        <i class="pi pi-file pdf-placeholder-icon"></i>
        <p>Nenhum PDF carregado.</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pdf-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--bg-secondary);
  border-left: 1px solid var(--border-color);
}

.pdf-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background-color: var(--bg-card);
  border-bottom: 1px solid var(--border-color);
}

.pdf-title-container {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 60%;
}

.pdf-icon {
  color: var(--accent-red);
  font-size: 18px;
}

.pdf-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-primary);
}

.pdf-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-badge {
  font-size: 12px;
  background-color: var(--bg-primary);
  border: 1px solid var(--border-color);
  padding: 4px 8px;
  border-radius: var(--radius-xs);
  color: var(--text-secondary);
  font-weight: 500;
}

.pdf-body {
  flex-grow: 1;
  position: relative;
  background-color: #525659; /* PDF.js default dark viewer background */
}

.pdf-iframe {
  width: 100%;
  height: 100%;
  border: none;
}

.no-pdf {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
  gap: 12px;
}

.pdf-placeholder-icon {
  font-size: 48px;
}
</style>
