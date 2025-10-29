<template>
  <Transition name="modal">
    <div v-if="show" class="modal-overlay" @click.self="closeModal">
      <div class="modal-content card">
        <div class="modal-header">
          <div class="header-content">
            <div v-if="sourceItemImageUrl" class="source-item-image-container">
              <div v-if="!sourceImageLoaded" class="image-loading">
                <div class="spinner"></div>
              </div>
              <img
                :src="sourceItemImageUrl"
                alt="Source cover"
                class="source-item-image"
                :class="{ 'image-hidden': !sourceImageLoaded }"
                @load="sourceImageLoaded = true"
                @error="sourceImageLoaded = true"
              />
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
import '../styles/RecommendationModal.css'

interface Props {
  show: boolean
  sourceItem: string
  sourceItemName: string
  sourceItemMbid: string | null
  sourceItemImageUrl?: string | null
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
const sourceImageLoaded = ref(false)

const closeModal = () => {
  emit('close')
}

const computeCoverUrl = (
  itemType: 'artist' | 'recording' | 'release-group',
  itemId: string,
): string | null => {
  // Note: itemId may be a generated recommendation ID (e.g., rec:user:name:timestamp)
  // Cover art will only work if itemId is an actual MusicBrainz ID
  if (itemType === 'release-group' && !itemId.startsWith('rec:')) {
    return `https://coverartarchive.org/release-group/${itemId}/front-250`
  }
  // For recordings and artists, we could enhance this later
  // LLM-generated recommendations won't have cover art
  return null
}

// Reset source image loaded state when modal opens
watch(
  () => props.show,
  (newShow) => {
    if (newShow) {
      sourceImageLoaded.value = false
      fetchRecommendations()
    }
  },
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

    const items = await getRecommendations(props.userId, props.sourceItemMbid, amount, false)

    if (items.length === 0) {
      // No existing recommendations, try to generate new ones
      console.log('No existing recommendations found, generating new ones...')
      await generateNewRecommendations(amount)
    } else {
      // Filter out items that already received feedback
      const filteredItems = items.filter((item) => !feedbackItems.value.has(item.item))
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

    // Get list of currently displayed item ids to ignore
    const currentItemIds = recommendations.value.map((rec) => rec.item)

    // Fetch only recommendations without feedback (feedbacked=false) and ignore currently displayed items
    const items = await getRecommendations(
      props.userId,
      props.sourceItemMbid,
      amount,
      false,
      currentItemIds,
    )

    // Map items with image URLs and add to recommendations list
    const newItems = items.map((item) => ({
      ...item,
      imageUrl: computeCoverUrl(props.itemType, item.item),
    }))

    // Add new items one by one to ensure TransitionGroup detects each addition
    for (const newItem of newItems) {
      recommendations.value.push(newItem)
      allFetchedItems.value.add(newItem.item)
    }
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

    // Wait for button animation to complete (400ms)
    await new Promise((resolve) => setTimeout(resolve, 400))

    // Remove the item from the list (will trigger slide-out animation)
    const index = recommendations.value.findIndex((rec) => rec.item === recommendedItem)
    if (index > -1) {
      recommendations.value.splice(index, 1)
    }

    // Wait for the slide-out animation to complete (500ms leave animation + buffer)
    await new Promise((resolve) => setTimeout(resolve, 600))

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
</script>
