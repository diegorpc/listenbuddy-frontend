<template>
  <div class="top-list-selector">
    <!-- Chip Selection -->
    <div class="chip-container">
      <button
        v-for="category in categories"
        :key="category"
        :class="[
          'chip',
          { active: selectedCategory === category, disabled: loading || loadingMore },
        ]"
        :disabled="loading || loadingMore"
        @click="selectCategory(category)"
      >
        {{ category }}
      </button>
    </div>

    <!-- Loading/Error/List/Empty wrapped in transition -->
    <Transition name="fade" mode="out-in">
      <!-- Loading State -->
      <div v-if="loading" key="loading" class="loading-state">
        <p>Loading {{ selectedCategory.toLowerCase() }}...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="error" key="error" class="error-state">
        <p>{{ error }}</p>
      </div>

      <!-- List Display -->
      <div v-else-if="items.length > 0" key="list" class="list-container">
        <div
          v-for="(item, index) in items"
          :key="index"
          class="list-item card"
          :class="{ 'fade-in-item': item.isNew }"
          @click="openRecommendationModal(item)"
        >
          <div class="item-image-container" v-if="item.imageUrl">
            <div v-if="!imageLoadedStates[index]" class="image-loading">
              <div class="spinner"></div>
            </div>
            <img
              :src="item.imageUrl"
              alt="cover"
              class="item-image"
              :class="{ 'image-hidden': !imageLoadedStates[index] }"
              @load="imageLoadedStates[index] = true"
              @error="imageLoadedStates[index] = true"
            />
          </div>
          <div class="item-rank">#{{ index + 1 }}</div>
          <div class="item-info">
            <div class="item-name">{{ item.name }}</div>
            <div class="item-artist" v-if="item.artist">{{ item.artist }}</div>
          </div>
          <div class="item-plays">{{ item.plays }} plays</div>
        </div>

        <!-- Loading More Indicator -->
        <div v-if="loadingMore" class="loading-more">
          <div class="spinner"></div>
          <p>Loading more...</p>
        </div>

        <!-- End of List Indicator -->
        <div v-else-if="!hasMore && items.length > 0" class="end-of-list">
          <p>That's all your {{ selectedCategory.toLowerCase() }}!</p>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else key="empty" class="empty-state">
        <p>No {{ selectedCategory.toLowerCase() }} found for this time period.</p>
      </div>
    </Transition>

    <!-- Recommendation Modal -->
    <RecommendationModal
      :show="showModal"
      :source-item="selectedItem?.name || ''"
      :source-item-name="selectedItem?.name || ''"
      :source-item-mbid="selectedItem?.mbid || null"
      :source-item-image-url="selectedItem?.imageUrl || null"
      :user-id="userId"
      :item-type="currentItemType"
      @close="closeModal"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from 'vue'
import { buildUrl } from '../services/apiRequests'
import RecommendationModal from './RecommendationModal.vue'
import '../styles/TopListSelector.css'

interface ListItem {
  name: string
  artist?: string
  plays: number
  imageUrl?: string | null
  mbid?: string | null
  isNew?: boolean
}

interface Recording {
  track_name: string
  artist_name: string
  listen_count: number
  caa_release_mbid?: string | null
  release_mbid?: string | null
  recording_mbid?: string | null
}

interface Artist {
  artist_name: string
  listen_count: number
  artist_mbid?: string | null
}

interface Release {
  release_name: string
  artist_name: string
  listen_count: number
  caa_release_mbid?: string | null
  release_mbid?: string | null
  release_group_mbid?: string | null
}

interface ReleaseGroup {
  release_group_name: string
  artist_name: string
  listen_count: number
  caa_release_mbid?: string | null
  release_group_mbid?: string | null
}

type ApiItem = Recording | Artist | Release | ReleaseGroup

const props = defineProps<{
  userId: string
  scrobbleToken: string
  timeRange?: string
}>()

const categories = ['Tracks', 'Artists', 'Albums']
const selectedCategory = ref<string>('Tracks')
const items = ref<ListItem[]>([])
const loading = ref(false)
const loadingMore = ref(false)
const error = ref<string | null>(null)
const showModal = ref(false)
const selectedItem = ref<ListItem | null>(null)
const imageLoadedStates = ref<Record<number, boolean>>({})
const offset = ref(0)
const hasMore = ref(true)

// Extract userId from props
const userId = props.userId

// Compute item type based on selected category
const currentItemType = ref<'artist' | 'recording' | 'release-group'>('recording')

const updateItemType = () => {
  switch (selectedCategory.value) {
    case 'Tracks':
      currentItemType.value = 'recording'
      break
    case 'Artists':
      currentItemType.value = 'artist'
      break
    case 'Albums':
      currentItemType.value = 'release-group'
      break
  }
}

const selectCategory = (category: string) => {
  if (loading.value || loadingMore.value) return
  selectedCategory.value = category
  updateItemType()
}

const openRecommendationModal = (item: ListItem) => {
  selectedItem.value = item
  showModal.value = true
}

const closeModal = () => {
  showModal.value = false
  selectedItem.value = null
}

const fetchTopItems = async (append = false) => {
  if (append) {
    loadingMore.value = true
  } else {
    loading.value = true
    offset.value = 0
    hasMore.value = true
    items.value = []
    imageLoadedStates.value = {}
  }
  error.value = null

  try {
    let endpoint = ''
    let responseKey = ''

    switch (selectedCategory.value) {
      case 'Tracks':
        endpoint = '/api/ListenBrainzAPI/getTopRecordings'
        responseKey = 'recordings'
        break
      case 'Artists':
        endpoint = '/api/ListenBrainzAPI/getTopArtists'
        responseKey = 'artists'
        break
      case 'Albums':
        endpoint = '/api/ListenBrainzAPI/getTopReleaseGroups'
        responseKey = 'releaseGroups'
        break
    }

    const response = await fetch(buildUrl(endpoint), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user: props.userId,
        scrobbleToken: props.scrobbleToken,
        timeRange: props.timeRange || 'this_month',
        count: 10,
        offset: append ? offset.value : 0,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || 'Failed to fetch data')
    }

    const rawItems: ApiItem[] = data[responseKey] || []

    // Check if we have more items to load
    if (rawItems.length < 10) {
      hasMore.value = false
    }

    const newItems: ListItem[] = rawItems.map((item: ApiItem) => {
      if (selectedCategory.value === 'Tracks' && 'track_name' in item) {
        const mbid = item.caa_release_mbid || item.release_mbid
        const imageUrl = mbid ? `https://coverartarchive.org/release/${mbid}/front-250` : null
        return {
          name: item.track_name,
          artist: item.artist_name,
          plays: item.listen_count,
          imageUrl,
          mbid: item.recording_mbid,
          isNew: append,
        }
      } else if (
        selectedCategory.value === 'Artists' &&
        'artist_name' in item &&
        !('track_name' in item) &&
        !('release_name' in item) &&
        !('release_group_name' in item)
      ) {
        return {
          name: item.artist_name,
          plays: item.listen_count,
          imageUrl: null,
          mbid: item.artist_mbid,
          isNew: append,
        }
      } else if ('release_group_name' in item) {
        const mbid = item.caa_release_mbid
        const imageUrl = mbid ? `https://coverartarchive.org/release/${mbid}/front-250` : null
        return {
          name: item.release_group_name,
          artist: item.artist_name,
          plays: item.listen_count,
          imageUrl,
          mbid: item.release_group_mbid,
          isNew: append,
        }
      } else if ('release_name' in item) {
        const mbid = item.caa_release_mbid || item.release_mbid
        const imageUrl = mbid ? `https://coverartarchive.org/release/${mbid}/front-250` : null
        return {
          name: item.release_name,
          artist: item.artist_name,
          plays: item.listen_count,
          imageUrl,
          mbid: item.release_group_mbid,
          isNew: append,
        }
      }
      return {
        name: 'artist_name' in item ? item.artist_name : 'Unknown',
        plays: item.listen_count,
        imageUrl: null,
        mbid: null,
        isNew: append,
      }
    })

    if (append) {
      items.value = [...items.value, ...newItems]
      offset.value += newItems.length

      // Remove isNew flag after animation
      await nextTick()
      setTimeout(() => {
        items.value = items.value.map((item) => ({ ...item, isNew: false }))
      }, 50)
    } else {
      items.value = newItems
      offset.value = newItems.length
    }
  } catch (err) {
    console.error('Error fetching top items:', err)
    error.value = err instanceof Error ? err.message : 'Failed to load data'
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

const loadMore = () => {
  if (loadingMore.value || !hasMore.value) return
  fetchTopItems(true)
}

// Expose loadMore function to parent
defineExpose({
  loadMore,
  hasMore,
  loadingMore,
})

// Watch for category changes
watch(selectedCategory, () => {
  fetchTopItems(false)
})

// Watch for time range changes (if implemented later)
watch(
  () => props.timeRange,
  () => {
    fetchTopItems(false)
  },
)

// Initial fetch
onMounted(() => {
  fetchTopItems(false)
})
</script>
