<template>
  <Transition name="modal">
    <div v-if="show" class="modal-overlay" @click.self="closeModal">
      <div class="modal-content card">
        <div class="modal-header">
          <h2 class="modal-title">My Recommendations</h2>
          <button class="close-button" @click="closeModal">&times;</button>
        </div>

        <!-- Loading State -->
        <div v-if="loading" class="modal-body loading-state">
          <p>Loading your feedback history...</p>
        </div>

        <!-- Error State -->
        <div v-else-if="error" class="modal-body error-state">
          <p>{{ error }}</p>
        </div>

        <!-- Feedback History List -->
        <div v-else-if="feedbackHistory.length > 0" class="modal-body">
          <TransitionGroup name="rec-fade" tag="div" class="feedback-list">
            <div v-for="item in feedbackHistory" :key="item.recommendationId" class="feedback-item">
              <!-- Source Item -->
              <div class="source-section">
                <div class="item-name">{{ item.sourceName || 'Unknown' }}</div>
              </div>

              <!-- Arrow -->
              <div class="arrow-section">
                <svg class="arrow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M13 7l5 5m0 0l-5 5m5-5H6"
                  />
                </svg>
              </div>

              <!-- Recommended Item -->
              <div class="recommended-section">
                <div class="item-name">{{ item.item }}</div>
              </div>

              <!-- Feedback Indicator & Delete -->
              <div class="actions-section">
                <div class="feedback-indicator" :class="{ positive: item.feedback }">
                  <CheckIcon v-if="item.feedback" class="indicator-icon" />
                  <XMarkIcon v-else class="indicator-icon" />
                </div>
                <button
                  class="delete-btn"
                  @click="handleDelete(item.recommendationId)"
                  :disabled="processingDelete[item.recommendationId]"
                  title="Delete this recommendation"
                >
                  <TrashIcon class="delete-icon" />
                </button>
              </div>

              <!-- Reasoning (below the main content) -->
              <div class="reasoning-section">
                <p class="reasoning-text">{{ item.reasoning }}</p>
              </div>
            </div>
          </TransitionGroup>
        </div>

        <!-- Empty State -->
        <div v-else class="modal-body empty-state">
          <p>You haven't provided feedback on any recommendations yet.</p>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { CheckIcon, XMarkIcon, TrashIcon } from '@heroicons/vue/24/outline'
import {
  getFeedbackHistory,
  deleteRecommendation,
  type FeedbackHistoryItem,
} from '../services/recommendations'
import { searchEntity } from '../services/musicbrainz'
import '../styles/MyRecommendations.css'

interface Props {
  show: boolean
  userId: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  close: []
}>()

interface EnrichedFeedbackItem extends FeedbackHistoryItem {
  sourceName?: string
  sourceImageUrl?: string | null
  recommendedImageUrl?: string | null
}

const feedbackHistory = ref<EnrichedFeedbackItem[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const processingDelete = ref<Record<string, boolean>>({})
const imageLoadedStates = ref<Record<string, boolean>>({})

const closeModal = () => {
  emit('close')
}

// Determine item type from MBID format and return cover URL
const parseItemAndGetCoverUrl = (mbid: string): { type: string; coverUrl: string | null } => {
  // MusicBrainz MBIDs are UUIDs, but we need to determine the type
  // For now, we'll try to fetch cover art for all types
  // Release groups use the Cover Art Archive
  // Artists don't have direct cover art
  // For this simplified version, we'll just try the release-group cover art endpoint

  // If it looks like an MBID (UUID format), try to get cover art
  if (mbid.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    // We'll optimistically try release-group cover art
    // If it fails, the image will just not load (handled by @error)
    return {
      type: 'unknown',
      coverUrl: `https://coverartarchive.org/release-group/${mbid}/front-250`,
    }
  }

  return { type: 'unknown', coverUrl: null }
}

const enrichFeedbackItem = async (item: FeedbackHistoryItem): Promise<EnrichedFeedbackItem> => {
  let sourceName = item.sourceItem
  let sourceImageUrl: string | null = null
  let recommendedImageUrl: string | null = null

  // Try to get source item name from MusicBrainz
  try {
    // Try all entity types to find the source item
    for (const entityType of ['artist', 'recording', 'release-group'] as const) {
      try {
        const results = await searchEntity(`mbid:${item.sourceItem}`, entityType, 1)
        if (results.length > 0 && results[0]) {
          sourceName = results[0].name ?? results[0].title ?? item.sourceItem
          // Only set cover URL for non-artist items
          if (entityType !== 'artist') {
            const { coverUrl } = parseItemAndGetCoverUrl(item.sourceItem)
            sourceImageUrl = coverUrl
          }
          break
        }
      } catch {
        // Continue to next type
      }
    }
  } catch (err) {
    console.error('Error fetching source item metadata:', err)
  }

  // Parse recommended item MBID for cover art
  const { coverUrl } = parseItemAndGetCoverUrl(item.sourceItem)
  recommendedImageUrl = coverUrl

  return {
    ...item,
    sourceName,
    sourceImageUrl,
    recommendedImageUrl,
  }
}

const fetchFeedbackHistory = async () => {
  loading.value = true
  error.value = null
  feedbackHistory.value = []
  processingDelete.value = {}
  imageLoadedStates.value = {}

  try {
    const history = await getFeedbackHistory(props.userId)

    // Enrich items with metadata
    const enrichedItems = await Promise.all(history.map((item) => enrichFeedbackItem(item)))

    feedbackHistory.value = enrichedItems
  } catch (err) {
    console.error('Error fetching feedback history:', err)
    error.value = err instanceof Error ? err.message : 'Failed to load feedback history'
  } finally {
    loading.value = false
  }
}

const handleDelete = async (recommendationId: string) => {
  processingDelete.value[recommendationId] = true

  try {
    await deleteRecommendation(recommendationId)

    // Wait for animation to complete
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Remove from list
    const index = feedbackHistory.value.findIndex(
      (item) => item.recommendationId === recommendationId,
    )
    if (index > -1) {
      feedbackHistory.value.splice(index, 1)
    }
  } catch (err) {
    console.error('Error deleting recommendation:', err)
    alert('Failed to delete recommendation. Please try again.')
  } finally {
    delete processingDelete.value[recommendationId]
  }
}

// Fetch when modal opens
watch(
  () => props.show,
  (newShow) => {
    if (newShow) {
      fetchFeedbackHistory()
    }
  },
)
</script>
