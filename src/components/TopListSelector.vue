<template>
  <div class="top-list-selector">
    <!-- Chip Selection -->
    <div class="chip-container">
      <button
        v-for="category in categories"
        :key="category"
        :class="['chip', { active: selectedCategory === category }]"
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
      :user-id="userId"
      :item-type="currentItemType"
      @close="closeModal"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { buildUrl } from '../services/apiRequests'
import RecommendationModal from './RecommendationModal.vue'

interface ListItem {
  name: string
  artist?: string
  plays: number
  imageUrl?: string | null
  mbid?: string | null
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

type ApiItem = Recording | Artist | Release

const props = defineProps<{
  userId: string
  scrobbleToken: string
  timeRange?: string
}>()

const categories = ['Tracks', 'Artists', 'Albums']
const selectedCategory = ref<string>('Tracks')
const items = ref<ListItem[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const showModal = ref(false)
const selectedItem = ref<ListItem | null>(null)
const imageLoadedStates = ref<Record<number, boolean>>({})

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

const fetchTopItems = async () => {
  loading.value = true
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
        endpoint = '/api/ListenBrainzAPI/getTopReleases'
        responseKey = 'releases'
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
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || 'Failed to fetch data')
    }

    const rawItems: ApiItem[] = data[responseKey] || []
    // Reset image loaded states for new list
    imageLoadedStates.value = {}
    items.value = rawItems.map((item: ApiItem) => {
      if (selectedCategory.value === 'Tracks' && 'track_name' in item) {
        const mbid = item.caa_release_mbid || item.release_mbid
        const imageUrl = mbid ? `https://coverartarchive.org/release/${mbid}/front-250` : null
        return {
          name: item.track_name,
          artist: item.artist_name,
          plays: item.listen_count,
          imageUrl,
          mbid: item.recording_mbid,
        }
      } else if (selectedCategory.value === 'Artists' && 'artist_name' in item && !('track_name' in item) && !('release_name' in item)) {
        return {
          name: item.artist_name,
          plays: item.listen_count,
          imageUrl: null,
          mbid: item.artist_mbid,
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
        }
      }
      return {
        name: 'artist_name' in item ? item.artist_name : 'Unknown',
        plays: item.listen_count,
        imageUrl: null,
        mbid: null,
      }
    })
  } catch (err) {
    console.error('Error fetching top items:', err)
    error.value = err instanceof Error ? err.message : 'Failed to load data'
  } finally {
    loading.value = false
  }
}

// Watch for category changes
watch(selectedCategory, () => {
  fetchTopItems()
})

// Watch for time range changes (if implemented later)
watch(() => props.timeRange, () => {
  fetchTopItems()
})

// Initial fetch
onMounted(() => {
  fetchTopItems()
})
</script>

<style scoped>
.top-list-selector {
  width: 100%;
}

.chip-container {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 2rem;
  flex-wrap: wrap;
  justify-content: space-around;
}

.chip {
  font-family: 'Lexend', sans-serif;
  padding: 0.625rem 1.5rem;
  background-color: transparent;
  color: var(--text-secondary);
  border: 2px solid var(--text-secondary);
  border-radius: 24px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  text-transform: capitalize;
  width: 300px;
}

.chip:hover {
  color: var(--accent-primary);
  border-color: var(--accent-primary);
  transform: translateY(-2px);
}

.chip.active {
  background-color: var(--accent-primary);
  color: var(--bg-primary);
  border-color: var(--accent-primary);
}

.loading-state,
.error-state,
.empty-state {
  text-align: center;
  padding: 3rem 2rem;
  color: var(--text-secondary);
}

.error-state {
  color: #e06c75;
}

.list-container {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.list-item {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 1.25rem 1.5rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.list-item:hover {
  transform: translateX(8px);
  box-shadow: 0 6px 24px rgba(129, 163, 142, 0.2);
}

.item-image-container {
  width: 64px;
  height: 64px;
  flex-shrink: 0;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--bg-primary);
  border-radius: 6px;
}

.item-image {
  width: 64px;
  height: 64px;
  border-radius: 6px;
  object-fit: cover;
  transition: opacity 0.3s ease;
}

.item-image.image-hidden {
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

.item-rank {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--accent-primary);
  min-width: 3rem;
  text-align: center;
}

.item-info {
  flex: 1;
  min-width: 0;
}

.item-name {
  font-size: 1rem;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 0.25rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-artist {
  font-size: 0.875rem;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-plays {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--accent-primary);
  white-space: nowrap;
}

@media (max-width: 768px) {
  .list-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.75rem;
  }

  .item-rank {
    min-width: auto;
  }

  .item-plays {
    align-self: flex-end;
  }
}

/* Fade transition */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
