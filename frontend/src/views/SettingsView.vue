<script setup lang="ts">
import { ref } from 'vue'
import Card from 'primevue/card'
import Button from 'primevue/button'
import Toast from 'primevue/toast'
import { useToast } from 'primevue/usetoast'

const toast = useToast()
const fileInput = ref<HTMLInputElement | null>(null)
const importing = ref(false)
const exporting = ref(false)

const triggerImportClick = () => {
  fileInput.value?.click()
}

const handleImport = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  importing.value = true
  const reader = new FileReader()
  
  reader.onload = async (e) => {
    try {
      const content = e.target?.result as string
      const backupData = JSON.parse(content)

      const response = await fetch('/api/backup/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backupData)
      })

      if (response.ok) {
        toast.add({
          severity: 'success',
          summary: 'Importação Concluída',
          detail: 'Seu progresso e configurações foram restaurados. Recarregando...',
          life: 3000
        })
        setTimeout(() => {
          window.location.reload()
        }, 1500)
      } else {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Erro na resposta do servidor')
      }
    } catch (err: any) {
      toast.add({
        severity: 'error',
        summary: 'Falha na Importação',
        detail: err.message || 'Arquivo de backup inválido.',
        life: 5000
      })
    } finally {
      importing.value = false
      if (target) target.value = '' // clear input
    }
  }

  reader.readAsText(file)
}

const handleExport = async () => {
  exporting.value = true
  try {
    const response = await fetch('/api/backup/export')
    if (!response.ok) throw new Error('Falha ao exportar backup do servidor')

    const data = await response.json()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    
    const dateStr = new Date().toISOString().split('T')[0]
    link.href = url
    link.download = `devconcurseiro-backup-${dateStr}.json`
    link.click()
    
    URL.revokeObjectURL(url)
    
    toast.add({
      severity: 'success',
      summary: 'Exportação Concluída',
      detail: 'Arquivo de backup baixado com sucesso.',
      life: 3000
    })
  } catch (err: any) {
    toast.add({
      severity: 'error',
      summary: 'Erro na Exportação',
      detail: err.message || 'Não foi possível baixar o backup.',
      life: 4000
    })
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <div class="settings-container">
    <Toast />
    
    <div class="header-section">
      <h1 class="page-title">Configurações Gerais</h1>
      <p class="page-subtitle">Gerencie backups locais, restaurações de dados e configurações de preferência.</p>
    </div>

    <div class="settings-grid">
      <!-- Card Backup -->
      <Card class="settings-card">
        <template #title>
          <div class="card-title">
            <i class="pi pi-database db-icon"  aria-hidden="true"></i>
            <span>Backup e Restauração de Progresso</span>
          </div>
        </template>
        
        <template #content>
          <p class="card-desc">
            Como a aplicação é local-first, todos os seus dados de progresso de estudo, Pomodoros concluidos, bookmarks de PDFs, notas e histórico de simulados são mantidos no seu banco de dados local. Recomendamos exportar backups periodicamente.
          </p>

          <div class="backup-actions">
            <div class="action-item">
              <div class="action-info">
                <h4>Exportar Backup</h4>
                <p>Gera um arquivo JSON com todo o seu progresso para você armazenar em local seguro.</p>
              </div>
              <Button 
                label="Exportar (.json)" 
                icon="pi pi-download" 
                :loading="exporting"
                class="p-button-outlined"
                @click="handleExport" 
              />
            </div>

            <div class="action-item">
              <div class="action-info">
                <h4>Importar Backup</h4>
                <p>Substitui o banco de dados atual com o conteúdo de um arquivo de backup (.json). Suporta também os backups do modelo antigo.</p>
              </div>
              <input 
                ref="fileInput" 
                type="file" 
                accept=".json" 
                style="display: none" 
                aria-label="Importar arquivo de backup"
                @change="handleImport" 
              />
              <Button 
                label="Importar (.json)" 
                icon="pi pi-upload" 
                :loading="importing"
                severity="warn"
                class="p-button-outlined"
                @click="triggerImportClick" 
              />
            </div>
          </div>
        </template>
      </Card>

      <!-- Card Informações -->
      <Card class="settings-card">
        <template #title>
          <div class="card-title">
            <i class="pi pi-info-circle info-icon"  aria-hidden="true"></i>
            <span>Sobre o DevConcurseiro</span>
          </div>
        </template>

        <template #content>
          <div class="about-list">
            <div class="about-item">
              <span class="label">Versão do App:</span>
              <span class="val">2.0.0 (Vue SPA Edition)</span>
            </div>
            <div class="about-item">
              <span class="label">Ambiente:</span>
              <span class="val">Local Development</span>
            </div>
            <div class="about-item">
              <span class="label">Banco de Dados:</span>
              <span class="val">SQLite (WAL Mode)</span>
            </div>
            <div class="about-item">
              <span class="label">AI Generator:</span>
              <span class="val">Gemini API (Google)</span>
            </div>
          </div>

          <div class="notes-tips-card">
            <h4>💡 Dica de Segurança</h4>
            <p>Seus arquivos de livros e resumos em PDF devem ser adicionados diretamente no diretório do projeto, dentro de <code>public/pdfs/</code>. Eles são escaneados de forma totalmente offline pelo backend da aplicação.</p>
          </div>
        </template>
      </Card>
    </div>
  </div>
</template>

<style scoped>
.settings-container {
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

.settings-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  align-items: start;
}

@media (max-width: 1024px) {
  .settings-grid {
    grid-template-columns: 1fr;
  }
}

.settings-card {
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
}

.card-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.db-icon {
  color: var(--accent-yellow);
}

.info-icon {
  color: var(--accent-blue);
}

.card-desc {
  font-size: 12.5px;
  color: var(--text-secondary);
  line-height: 1.5;
  margin-top: 0;
  margin-bottom: 24px;
}

.backup-actions {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.action-item {
  display: flex;
  justify-content: flex-between;
  align-items: center;
  border: 1px solid var(--border-color);
  background-color: var(--bg-primary);
  border-radius: var(--radius-sm);
  padding: 16px;
  gap: 16px;
}

.action-info {
  flex-grow: 1;
}

.action-info h4 {
  font-size: 13.5px;
  font-weight: 700;
  margin: 0;
  color: var(--text-primary);
}

.action-info p {
  font-size: 11px;
  color: var(--text-secondary);
  margin: 4px 0 0 0;
  line-height: 1.4;
}

.about-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 24px;
}

.about-item {
  display: flex;
  justify-content: space-between;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 8px;
  font-size: 13px;
}

.about-item .label {
  color: var(--text-secondary);
  font-weight: 500;
}

.about-item .val {
  color: var(--text-primary);
  font-weight: 600;
}

.notes-tips-card {
  background-color: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 14px;
}

.notes-tips-card h4 {
  font-size: 12px;
  color: var(--text-primary);
  margin: 0 0 6px 0;
}

.notes-tips-card p {
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.4;
  margin: 0;
}
</style>
