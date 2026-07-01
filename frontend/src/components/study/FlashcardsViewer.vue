<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { Flashcard } from '../../stores/flashcard'

const props = defineProps<{
  cards: Flashcard[]
}>()

const currentIndex = ref(0)
const isFlipped = ref(false)

const currentCard = computed(() => props.cards[currentIndex.value] || null)

// Reset state when cards list changes or active card changes
watch(() => props.cards, () => {
  currentIndex.value = 0
  isFlipped.value = false
})

function toggleFlip() {
  isFlipped.value = !isFlipped.value
}

function nextCard() {
  if (currentIndex.value < props.cards.length - 1) {
    isFlipped.value = false
    // Delay slightly to allow flip back animation before changing text
    setTimeout(() => {
      currentIndex.value++
    }, 200)
  }
}

function prevCard() {
  if (currentIndex.value > 0) {
    isFlipped.value = false
    setTimeout(() => {
      currentIndex.value--
    }, 200)
  }
}

function restartDeck() {
  isFlipped.value = false
  setTimeout(() => {
    currentIndex.value = 0
  }, 200)
}
</script>

<template>
  <div class="flashcard-viewer" v-if="currentCard">
    <!-- Progress Indicator -->
    <div class="deck-progress">
      <span class="progress-text">Cartão {{ currentIndex + 1 }} de {{ cards.length }}</span>
      <div class="progress-bar-container">
        <div 
          class="progress-bar-fill" 
          :style="{ width: ((currentIndex + 1) / cards.length) * 100 + '%' }"
        ></div>
      </div>
    </div>

    <!-- 3D Flip Card -->
    <div 
      class="card-container" 
      @click="toggleFlip"
      :class="{ flipped: isFlipped }"
    >
      <div class="card-inner">
        <!-- Front of the Card -->
        <div class="card-face card-front">
          <div class="card-badge">PERGUNTA</div>
          <div class="card-content-text">{{ currentCard.front }}</div>
          <div class="card-hint">
            <i class="pi pi-refresh" aria-hidden="true"></i>
            Clique para revelar a resposta
          </div>
        </div>

        <!-- Back of the Card -->
        <div class="card-face card-back">
          <div class="card-badge back-badge">RESPOSTA</div>
          <div class="card-content-text">{{ currentCard.back }}</div>
          <div class="card-hint">
            <i class="pi pi-refresh" aria-hidden="true"></i>
            Clique para ver a pergunta
          </div>
        </div>
      </div>
    </div>

    <!-- Study Controls -->
    <div class="deck-controls">
      <button 
        class="btn-control" 
        @click="prevCard" 
        :disabled="currentIndex === 0"
        title="Cartão anterior"
      >
        <i class="pi pi-chevron-left" aria-hidden="true"></i>
      </button>

      <button class="btn-flip" @click="toggleFlip">
        <i class="pi pi-refresh" aria-hidden="true"></i>
        Flippar
      </button>

      <button 
        class="btn-control" 
        @click="nextCard" 
        :disabled="currentIndex === cards.length - 1"
        title="Próximo cartão"
      >
        <i class="pi pi-chevron-right" aria-hidden="true"></i>
      </button>
    </div>

    <!-- Restart Option at the End -->
    <div class="deck-footer" v-if="currentIndex === cards.length - 1">
      <button class="btn-restart" @click="restartDeck">
        <i class="pi pi-replay" aria-hidden="true"></i>
        Reiniciar Baralho
      </button>
    </div>
  </div>
</template>

<style scoped>
.flashcard-viewer {
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
}

/* Progress */
.deck-progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.progress-text {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.progress-bar-container {
  height: 6px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 3px;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #638aff, #a855f7);
  border-radius: 3px;
  transition: width 0.3s ease;
}

/* 3D Flip Card Container */
.card-container {
  perspective: 1000px;
  width: 100%;
  height: 220px;
  cursor: pointer;
}

.card-inner {
  position: relative;
  width: 100%;
  height: 100%;
  text-align: center;
  transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
  transform-style: preserve-3d;
}

.card-container.flipped .card-inner {
  transform: rotateY(180deg);
}

.card-face {
  position: absolute;
  width: 100%;
  height: 100%;
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
  border-radius: 16px;
  border: 1px solid var(--border-color);
  padding: 24px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  box-sizing: border-box;
}

.card-front {
  background: linear-gradient(135deg, rgba(22, 27, 34, 0.9) 0%, rgba(30, 36, 45, 0.9) 100%);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.card-back {
  background: linear-gradient(135deg, rgba(30, 22, 45, 0.9) 0%, rgba(22, 27, 34, 0.9) 100%);
  transform: rotateY(180deg);
  box-shadow: 0 8px 32px rgba(168, 85, 247, 0.15);
  border-color: rgba(168, 85, 247, 0.25);
}

.card-badge {
  align-self: center;
  font-size: 10px;
  font-weight: 700;
  color: var(--accent-blue, #638aff);
  background: rgba(99, 138, 255, 0.15);
  padding: 4px 10px;
  border-radius: 20px;
  letter-spacing: 0.5px;
}

.back-badge {
  color: #a855f7;
  background: rgba(168, 85, 247, 0.15);
}

.card-content-text {
  font-size: 15px;
  font-weight: 500;
  line-height: 1.6;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  padding: 10px 0;
  overflow-y: auto;
}

.card-hint {
  font-size: 11px;
  color: var(--text-muted, #6e7681);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

/* Controls */
.deck-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.btn-control {
  background: var(--bg-card-hover, rgba(255, 255, 255, 0.05));
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  width: 44px;
  height: 44px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.btn-control:hover:not(:disabled) {
  background: rgba(99, 138, 255, 0.1);
  border-color: var(--accent-blue, #638aff);
  transform: scale(1.05);
}

.btn-control:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.btn-flip {
  flex: 1;
  background: none;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  border-radius: 12px;
  padding: 12px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.2s;
}

.btn-flip:hover {
  background: rgba(255, 255, 255, 0.03);
  color: var(--text-primary);
}

.btn-restart {
  width: 100%;
  background: rgba(168, 85, 247, 0.1);
  border: 1px solid rgba(168, 85, 247, 0.3);
  color: #c084fc;
  border-radius: 12px;
  padding: 12px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.2s;
}

.btn-restart:hover {
  background: rgba(168, 85, 247, 0.15);
  box-shadow: 0 4px 12px rgba(168, 85, 247, 0.25);
}
</style>
