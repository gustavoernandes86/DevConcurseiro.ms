<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()

const error = ref(route.query.error as string | null)

onMounted(async () => {
  const isAuth = await authStore.checkAuth()
  if (isAuth) {
    router.replace('/')
  }
})
</script>

<template>
  <div class="login-page">
    <!-- Background animated gradient -->
    <div class="bg-orb orb-1" aria-hidden="true"></div>
    <div class="bg-orb orb-2" aria-hidden="true"></div>

    <main class="login-card" role="main">
      <!-- Logo -->
      <div class="brand" aria-label="DevConcurseiro">
        <div class="brand-icon">🚀</div>
        <h1 class="brand-name">DevConcurseiro</h1>
        <p class="brand-tagline">Estudos inteligentes, local-first</p>
      </div>

      <div class="divider" aria-hidden="true"></div>

      <!-- Error message -->
      <div v-if="error" class="error-banner" role="alert">
        <i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
        <span v-if="error === 'not_allowed'">
          Acesso negado. Seu e-mail não está na lista de acesso.
        </span>
        <span v-else>
          Falha na autenticação. Tente novamente.
        </span>
      </div>

      <!-- Login action -->
      <div class="login-body">
        <p class="login-description">
          Esta é uma ferramenta pessoal de estudos para concursos públicos.<br>
          Faça login com sua conta Google para continuar.
        </p>

        <a
          id="btn-google-login"
          href="/api/auth/google"
          class="btn-google"
          :class="{ disabled: authStore.loading }"
          aria-label="Entrar com Google"
        >
          <svg class="google-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          <span v-if="authStore.loading">
            <i class="pi pi-spin pi-spinner" aria-hidden="true"></i>
            Verificando...
          </span>
          <span v-else>Entrar com Google</span>
        </a>
      </div>

      <p class="login-footer">
        Acesso restrito por lista de e-mails autorizados.
      </p>
    </main>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-base, #0d1117);
  position: relative;
  overflow: hidden;
  font-family: 'Inter', system-ui, sans-serif;
}

/* Animated background orbs */
.bg-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  animation: float 8s ease-in-out infinite alternate;
  pointer-events: none;
}

.orb-1 {
  width: 500px;
  height: 500px;
  background: radial-gradient(circle, rgba(99, 138, 255, 0.15) 0%, transparent 70%);
  top: -100px;
  left: -100px;
}

.orb-2 {
  width: 400px;
  height: 400px;
  background: radial-gradient(circle, rgba(168, 85, 247, 0.12) 0%, transparent 70%);
  bottom: -80px;
  right: -80px;
  animation-delay: -4s;
}

@keyframes float {
  from { transform: translate(0, 0) scale(1); }
  to   { transform: translate(20px, 20px) scale(1.05); }
}

/* Card */
.login-card {
  background: rgba(22, 27, 34, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(24px);
  border-radius: 20px;
  padding: 48px 40px;
  width: 100%;
  max-width: 420px;
  text-align: center;
  box-shadow:
    0 0 0 1px rgba(99, 138, 255, 0.08),
    0 24px 64px rgba(0, 0, 0, 0.5);
  position: relative;
  z-index: 1;
}

/* Brand */
.brand {
  margin-bottom: 28px;
}

.brand-icon {
  font-size: 42px;
  width: 72px;
  height: 72px;
  background: linear-gradient(135deg, #638aff 0%, #a855f7 100%);
  border-radius: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
  box-shadow: 0 8px 32px rgba(99, 138, 255, 0.35);
}

.brand-name {
  font-size: 24px;
  font-weight: 800;
  color: #e6edf3;
  margin: 0 0 6px;
  letter-spacing: -0.5px;
}

.brand-tagline {
  font-size: 13px;
  color: #8b949e;
  margin: 0;
}

/* Divider */
.divider {
  height: 1px;
  background: linear-gradient(to right, transparent, rgba(255,255,255,0.08), transparent);
  margin: 24px 0;
}

/* Error */
.error-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(248, 81, 73, 0.12);
  border: 1px solid rgba(248, 81, 73, 0.3);
  border-radius: 10px;
  padding: 12px 16px;
  color: #f85149;
  font-size: 13px;
  margin-bottom: 20px;
  text-align: left;
}

/* Body */
.login-body {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.login-description {
  font-size: 14px;
  color: #8b949e;
  line-height: 1.6;
  margin: 0;
}

/* Google button */
.btn-google {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 14px 24px;
  background: #fff;
  color: #1a1a1a;
  font-size: 15px;
  font-weight: 600;
  border-radius: 12px;
  text-decoration: none;
  transition: all 0.2s ease;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
}

.btn-google:hover:not(.disabled) {
  background: #f0f0f0;
  box-shadow: 0 4px 20px rgba(99, 138, 255, 0.25);
  transform: translateY(-1px);
}

.btn-google.disabled {
  opacity: 0.6;
  pointer-events: none;
}

.google-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

/* Footer */
.login-footer {
  margin-top: 24px;
  font-size: 12px;
  color: #484f58;
}
</style>
