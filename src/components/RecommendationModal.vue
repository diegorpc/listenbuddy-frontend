<template>
  <Transition name="modal">
    <div v-if="show" class="modal-overlay" @click.self="closeModal">
      <div class="modal-content card">
        <div class="modal-header">
          <div class="header-content">
            <div v-if="sourceItemImageUrl" class="source-item-image-container">
              <img :src="sourceItemImageUrl" alt="Source cover" class="source-item-image" />
            </div>
            <h2 class="modal-title">Recommendations for "{{ sourceItemName }}"</h2>
          </div>
          <button class="close-button" @click="closeModal">&times;</button>
        </div>

        <!-- Loading State -->
        <div v-if="loading" class="modal-body loading-state">
          <p>Finding recommendations...</p>
        </div>

        <!-- Error State -->
        <div v-else-if="error" class="modal-body error-state">
          <p>{{ error }}</p>
        </div>

        <!-- Recommendations List -->
        <div v-else-if="recommendations.length > 0" class="modal-body">
          <TransitionGroup name="rec-fade" tag="div" class="recommendations-list">
            <div v-for="rec in recommendations" :key="rec.item" class="recommendation-item">
              <div v-if="rec.imageUrl" class="rec-image-container">
                <div v-if="!imageLoadedStates[rec.item]" class="image-loading">
                  <div class="spinner"></div>
                </div>
                <img
                  :src="rec.imageUrl"
                  alt="cover"
                  class="rec-image"
                  :class="{ 'image-hidden': !imageLoadedStates[rec.item] }"
                  @load="imageLoadedStates[rec.item] = true"
                  @error="imageLoadedStates[rec.item] = true"
                />
              </div>
              <div class="rec-info">
                <div class="rec-header">
                  <div class="rec-name">{{ rec.itemName }}</div>
                  <div class="rec-confidence">{{ Math.round(rec.confidence * 100) }}%</div>
                </div>
                <div class="rec-reasoning">{{ rec.reasoning }}</div>
              </div>
              <div
                class="feedback-buttons"
                :class="{
                  'centered-positive': feedbackGiven[rec.item] === 'positive',
                  'centered-negative': feedbackGiven[rec.item] === 'negative',
                }"
              >
                <button
                  v-if="feedbackGiven[rec.item] !== 'negative'"
                  class="feedback-btn positive"
                  @click="handleFeedback(rec.item, true)"
                  :disabled="processingFeedback[rec.item]"
                  :title="'Like this recommendation'"
                >
                  <CheckCircleIcon class="icon" />
                </button>
                <button
                  v-if="feedbackGiven[rec.item] !== 'positive'"
                  class="feedback-btn negative"
                  @click="handleFeedback(rec.item, false)"
                  :disabled="processingFeedback[rec.item]"
                  :title="'Dislike this recommendation'"
                >
                  <XCircleIcon class="icon" />
                </button>
              </div>
            </div>
          </TransitionGroup>
        </div>

        <!-- Empty State -->
        <div v-else class="modal-body empty-state">
          <p>No recommendations available for this item.</p>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { CheckCircleIcon, XCircleIcon } from '@heroicons/vue/24/outline'
import {
  getRecommendations,
  provideFeedback as submitFeedback,
  generateRecommendationsWithMetadata,
} from '../services/recommendations'

interface Props {
  show: boolean
  sourceItem: string
  sourceItemName: string
  sourceItemMbid: string | null
  userId: string
  itemType: 'artist' | 'recording' | 'release-group'
}

const props = defineProps<Props>()
const emit = defineEmits<{
  close: []
}>()

interface RecommendationWithImage {
  item: string
  itemName: string
  reasoning: string
  confidence: number
  imageUrl?: string | null
}

const recommendations = ref<RecommendationWithImage[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const processingFeedback = ref<Record<string, boolean>>({})
const feedbackGiven = ref<Record<string, 'positive' | 'negative' | null>>({})
const allFetchedItems = ref<Set<string>>(new Set())
const feedbackItems = ref<Set<string>>(new Set()) // Track items that received feedback
const imageLoadedStates = ref<Record<string, boolean>>({})
const sourceItemImageUrl = ref<string | null>(null)

const closeModal = () => {
  emit('close')
}

const computeCoverUrl = (
  itemType: 'artist' | 'recording' | 'release-group',
  mbid: string,
): string | null => {
  if (itemType === 'release-group') {
    return `https://coverartarchive.org/release-group/${mbid}/front-250`
  }
  // For recordings and artists, we could enhance this later
  return null
}

// Compute source item cover art URL
watch(
  () => props.sourceItemMbid,
  (mbid) => {
    if (mbid) {
      sourceItemImageUrl.value = computeCoverUrl(props.itemType, mbid)
    }
  },
  { immediate: true },
)

const fetchRecommendations = async (amount: number = 3) => {
  loading.value = true
  error.value = null
  recommendations.value = []
  processingFeedback.value = {}
  feedbackGiven.value = {}
  allFetchedItems.value = new Set()
  feedbackItems.value = new Set() // Reset feedback tracking
  imageLoadedStates.value = {}

  try {
    // If we don't have an MBID, generate new recommendations first
    if (!props.sourceItemMbid) {
      console.log('No MBID available, generating new recommendations...')
      await generateNewRecommendations(amount)
      return
    }

    const items = await getRecommendations(props.userId, props.sourceItemMbid, amount)

    if (items.length === 0) {
      // No existing recommendations, try to generate new ones
      console.log('No existing recommendations found, generating new ones...')
      await generateNewRecommendations(amount)
    } else {
      // Filter out items that already received feedback
      const filteredItems = items.filter(item => !feedbackItems.value.has(item.item))
      recommendations.value = filteredItems.map((item) => ({
        ...item,
        imageUrl: computeCoverUrl(props.itemType, item.item),
      }))
      filteredItems.forEach((item) => allFetchedItems.value.add(item.item))
    }
  } catch (err) {
    console.error('Error fetching recommendations:', err)
    error.value = err instanceof Error ? err.message : 'Failed to load recommendations'
  } finally {
    loading.value = false
  }
}

const generateNewRecommendations = async (amount: number = 3) => {
  try {
    // Fetch MusicBrainz metadata and generate recommendations (backend handles rate limiting)
    await generateRecommendationsWithMetadata(
      props.userId,
      props.sourceItemName,
      props.itemType,
      amount,
      props.sourceItemMbid,
    )

    // Now fetch the recommendations with reasoning
    // The generateRecommendationsWithMetadata function uses the MBID internally
    // We need to use the same MBID to fetch recommendations
    if (!props.sourceItemMbid) {
      throw new Error('Source item MBID is required to fetch recommendations')
    }

    const items = await getRecommendations(props.userId, props.sourceItemMbid, amount)
    // Filter out items that already received feedback or are already in the list
    const filteredItems = items.filter(
      item => !feedbackItems.value.has(item.item) && 
              !recommendations.value.some(rec => rec.item === item.item)
    )
    recommendations.value.push(
      ...filteredItems.map((item) => ({
        ...item,
        imageUrl: computeCoverUrl(props.itemType, item.item),
      })),
    )
    filteredItems.forEach((item) => allFetchedItems.value.add(item.item))
  } catch (err) {
    console.error('Error generating recommendations:', err)
    throw err
  }
}

const handleFeedback = async (recommendedItem: string, feedback: boolean) => {
  // Mark as processing to disable buttons
  processingFeedback.value[recommendedItem] = true
  feedbackGiven.value[recommendedItem] = feedback ? 'positive' : 'negative'

  try {
    // Submit feedback
    await submitFeedback(props.userId, recommendedItem, feedback)

    // Add to feedback items to exclude from future fetches
    feedbackItems.value.add(recommendedItem)

    // Wait for button animation to complete (300ms)
    await new Promise((resolve) => setTimeout(resolve, 300))

    // Remove the item from the list (will trigger slide-out animation)
    const index = recommendations.value.findIndex((rec) => rec.item === recommendedItem)
    if (index > -1) {
      recommendations.value.splice(index, 1)
    }

    // Wait a bit for the slide-out animation to start
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Generate 1 new recommendation to replace the removed item
    console.log('Generating 1 new recommendation...')
    try {
      await generateNewRecommendations(1)
    } catch (genErr) {
      console.error('Failed to generate new recommendation:', genErr)
      // Continue without showing error to user
    }
  } catch (err) {
    console.error('Error providing feedback:', err)
    alert('Failed to submit feedback. Please try again.')
    // Reset feedback state on error
    delete feedbackGiven.value[recommendedItem]
    feedbackItems.value.delete(recommendedItem)
  } finally {
    delete processingFeedback.value[recommendedItem]
  }
}

// Fetch recommendations when modal is shown
watch(
  () => props.show,
  (newShow) => {
    if (newShow) {
      fetchRecommendations()
    }
  },
  { immediate: true },
)
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.modal-content {
  width: 100%;
  max-width: 800px;
  max-height: 80vh;
  overflow-y: auto;
  background-color: var(--bg-secondary);
  border: 2px solid var(--accent-primary);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-bottom: 1px solid rgba(168, 153, 132, 0.2);
}

.header-content {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex: 1;
}

.source-item-image-container {
  flex-shrink: 0;
}

.source-item-image {
  width: 60px;
  height: 60px;
  border-radius: 8px;
  object-fit: cover;
  border: 2px solid var(--accent-primary);
}

.modal-title {
  font-family: 'Lexend', sans-serif;
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  flex: 1;
  padding-right: 1rem;
}

.close-button {
  background: none;
  border: none;
  font-size: 2rem;
  color: var(--text-secondary);
  cursor: pointer;
  line-height: 1;
  padding: 0;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s ease;
}

.close-button:hover {
  color: var(--text-primary);
}

.modal-body {
  padding: 1.5rem;
}

.loading-state,
.error-state,
.empty-state {
  text-align: center;
  padding: 2rem;
  color: var(--text-secondary);
}

.error-state {
  color: #e06c75;
}

.recommendations-list {
  display: flex;
  flex-direction: column;
}

.recommendation-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  margin-bottom: 0.75rem;
  background-color: var(--bg-primary);
  border-radius: 8px;
  border: 1px solid rgba(168, 153, 132, 0.2);
  transition: all 0.2s ease;
}

.recommendation-item:hover {
  border-color: var(--accent-primary);
  box-shadow: 0 4px 12px rgba(129, 163, 142, 0.15);
}

.rec-image-container {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  margin-right: 0.75rem;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--bg-primary);
  border-radius: 6px;
}

.rec-image {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  object-fit: cover;
  transition: opacity 0.3s ease;
}

.rec-image.image-hidden {
  opacity: 0;
  position: absolute;
}

.image-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(129, 163, 142, 0.3);
  border-top-color: var(--accent-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.rec-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.rec-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.rec-name {
  font-family: 'Lexend', sans-serif;
  font-size: 1rem;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.rec-confidence {
  font-family: 'Lexend', sans-serif;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--bg-primary);
  background-color: var(--accent-primary);
  padding: 0.25rem 0.5rem;
  border-radius: 12px;
  white-space: nowrap;
}

.rec-reasoning {
  font-size: 0.875rem;
  color: var(--text-secondary);
  line-height: 1.4;
}

.feedback-buttons {
  display: flex;
  gap: 0.5rem;
  margin-left: 1rem;
  transition: all 0.3s ease;
  position: relative;
  width: 5.5rem; /* 2 buttons + gap */
}

.feedback-buttons.centered-positive {
  justify-content: center;
}

.feedback-buttons.centered-negative {
  justify-content: center;
}

.feedback-btn {
  background: none;
  border: 2px solid currentColor;
  border-radius: 50%;
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s ease;
  padding: 0;
}

.feedback-btn .icon {
  width: 1.25rem;
  height: 1.25rem;
  pointer-events: none;
}

.feedback-btn.positive {
  color: var(--accent-primary);
}

.feedback-btn.positive:hover:not(:disabled) {
  background-color: var(--accent-primary);
  color: var(--bg-primary);
  transform: scale(1.1);
}

.feedback-btn.positive:disabled {
  background-color: var(--accent-primary);
  color: var(--bg-primary);
  opacity: 0.8;
}

.feedback-btn.negative {
  color: #e06c75;
}

.feedback-btn.negative:hover:not(:disabled) {
  background-color: #e06c75;
  color: var(--bg-primary);
  transform: scale(1.1);
}

.feedback-btn.negative:disabled {
  background-color: #e06c75;
  color: var(--bg-primary);
  opacity: 0.8;
}

.feedback-btn:disabled {
  cursor: not-allowed;
}

/* Modal transition */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .modal-content,
.modal-leave-active .modal-content {
  transition: transform 0.3s ease;
}

.modal-enter-from .modal-content,
.modal-leave-to .modal-content {
  transform: scale(0.9);
}

/* Recommendation item transitions */
.rec-fade-move {
  transition: all 0.4s ease;
}

.rec-fade-enter-active {
  transition: all 0.4s ease;
}

.rec-fade-leave-active {
  transition: all 0.3s ease;
  position: absolute;
  width: calc(100% - 3rem);
}

.rec-fade-enter-from {
  opacity: 0;
  transform: translateX(30px) scale(0.9);
}

.rec-fade-leave-to {
  opacity: 0;
  transform: translateX(-30px) scale(0.9);
}

@media (max-width: 768px) {
  .modal-content {
    max-height: 90vh;
  }

  .modal-title {
    font-size: 1rem;
  }

  .header-content {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.75rem;
  }

  .source-item-image {
    width: 50px;
    height: 50px;
  }

  .recommendation-item {
    flex-wrap: wrap;
  }

  .rec-image-container {
    width: 100%;
    height: auto;
    aspect-ratio: 1;
    margin-right: 0;
    margin-bottom: 0.75rem;
  }

  .rec-image {
    width: 100%;
    height: 100%;
  }

  .rec-info {
    width: 100%;
  }

  .feedback-buttons {
    margin-left: 0;
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
