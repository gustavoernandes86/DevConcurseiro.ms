import { useToast } from 'primevue/usetoast'

export function useNotification() {
  const toast = useToast()

  const showSuccess = (title: string, message: string, duration = 3000) => {
    toast.add({
      severity: 'success',
      summary: title,
      detail: message,
      life: duration
    })
  }

  const showError = (title: string, message: string, duration = 5000) => {
    toast.add({
      severity: 'error',
      summary: title,
      detail: message,
      life: duration
    })
  }

  const showWarning = (title: string, message: string, duration = 4000) => {
    toast.add({
      severity: 'warn',
      summary: title,
      detail: message,
      life: duration
    })
  }

  const showInfo = (title: string, message: string, duration = 3000) => {
    toast.add({
      severity: 'info',
      summary: title,
      detail: message,
      life: duration
    })
  }

  return {
    showSuccess,
    showError,
    showWarning,
    showInfo
  }
}
