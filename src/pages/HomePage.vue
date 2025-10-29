<template>
  <div class="home-container">
    <!-- Token Input View -->
    <div v-if="!hasScrobbleToken" class="token-input-section">
      <div class="token-card card">
        <h2>Connect Your ListenBrainz Account</h2>
        <p>
          Enter your ListenBrainz token to view your listening statistics. You can find your token
          in your ListenBrainz account settings.
        </p>
        <form @submit.prevent="handleTokenSubmit" class="token-form">
          <div class="input-group">
            <label for="token">ListenBrainz Token</label>
            <input
              id="token"
              v-model="tokenInput"
              type="text"
              placeholder="Enter your token here"
              required
            />
          </div>
          <button type="submit" class="submit-btn" :disabled="submitting">
            {{ submitting ? 'Validating...' : 'Connect' }}
          </button>
          <p v-if="tokenError" class="error-message">{{ tokenError }}</p>
        </form>
      </div>
    </div>

    <!-- Stats View -->
    <div v-else>
      <header class="home-header">
        <div class="header-title">
          <MusicalNoteIcon class="header-icon" />
          <h1>{{ listenBrainzName }}'s ListenBrainz Stats</h1>
        </div>
        <div class="header-actions">
          <button class="recommendations-btn" @click="showMyRecommendations = true">
            My Recommendations
          </button>
          <button class="logout-btn" @click="handleLogout">Log Out</button>
        </div>
      </header>

      <div class="home-content">
        <!-- Time Range Filter -->
        <div class="time-filter-section">
          <label for="time-range" class="filter-label">Time Period:</label>
          <select id="time-range" v-model="timeRange" class="time-filter">
            <option value="this_week">This Week</option>
            <option value="this_month">This Month</option>
            <option value="this_year">This Year</option>
            <option value="all_time">All Time</option>
          </select>
        </div>

        <!-- Stat Cards -->
        <div class="stats-grid">
          <StatCard
            label="Listen Hours"
            :value="listenHours"
            :loading="statsLoading"
            :error="statsError"
            suffix=" hrs"
            :change="listenHoursChange"
          />
          <StatCard
            label="Avg Daily Plays"
            :value="avgDailyPlays"
            :loading="statsLoading"
            :error="statsError"
            :change="dailyPlaysChange"
          />
        </div>

        <!-- Weekly Activity Chart -->
        <WeeklyActivityBarChart
          :user-id="userId"
          :scrobble-token="scrobbleToken"
          :time-range="timeRange"
        />

        <!-- Top Lists -->
        <div class="top-lists-section">
          <TopListSelector
            ref="topListSelector"
            :user-id="userId"
            :scrobble-token="scrobbleToken"
            :time-range="timeRange"
          />
        </div>
      </div>

      <!-- My Recommendations Modal -->
      <MyRecommendations
        :show="showMyRecommendations"
        :user-id="userId"
        @close="showMyRecommendations = false"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { authService } from '../services/auth'
import { buildUrl } from '../services/apiRequests'
import TopListSelector from '../components/TopListSelector.vue'
import StatCard from '../components/StatCard.vue'
import WeeklyActivityBarChart from '../components/WeeklyActivityBarChart.vue'
import MyRecommendations from '../components/MyRecommendations.vue'
import { MusicalNoteIcon } from '@heroicons/vue/24/outline'
interface DailyActivityResponse {
  dailyActivity: Record<string, Array<{ hour: number; listen_count: number }>>
  from_ts: number
  to_ts: number
}

interface ListeningActivityItem {
  from_ts: number
  to_ts: number
  listen_count: number
}

const router = useRouter()
const userId = ref('')
const username = ref('')
const listenBrainzName = ref('')
const scrobbleToken = ref('')
const tokenInput = ref('')
const tokenError = ref('')
const submitting = ref(false)
const timeRange = ref('this_week')

// Stats data
const listenHours = ref(0)
const avgDailyPlays = ref(0)
const listenHoursChange = ref<number | null>(null)
const dailyPlaysChange = ref<number | null>(null)
const statsLoading = ref(false)
const statsError = ref(false)
const topListSelector = ref<InstanceType<typeof TopListSelector> | null>(null)
const showMyRecommendations = ref(false)

const hasScrobbleToken = computed(() => {
  return scrobbleToken.value !== ''
})

onMounted(() => {
  const user = authService.getUser()
  if (user) {
    userId.value = user.userID
    username.value = user.username
    listenBrainzName.value = user.listenBrainzName || ''
    scrobbleToken.value = user.scrobbleToken || ''
  } else {
    // If not authenticated at all, redirect to welcome page
    router.push('/')
  }
})

const handleTokenSubmit = async () => {
  tokenError.value = ''
  submitting.value = true

  try {
    const result = await authService.updateScrobbleToken(tokenInput.value)
    if (result) {
      listenBrainzName.value = result.username
      scrobbleToken.value = tokenInput.value
      tokenInput.value = ''
    }
  } catch (error) {
    tokenError.value =
      error instanceof Error ? error.message : 'Failed to validate token. Please try again.'
  } finally {
    submitting.value = false
  }
}

const fetchActivityStats = async () => {
  if (!userId.value || !scrobbleToken.value) return

  statsLoading.value = true
  statsError.value = false

  try {
    const response = await fetch(buildUrl('/api/ListenBrainzAPI/getDailyActivity'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user: userId.value,
        scrobbleToken: scrobbleToken.value,
        timeRange: timeRange.value,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || 'Failed to fetch stats')
    }

    const resp: DailyActivityResponse = data

    // Compute total listens across all weekdays and hours
    let totalListens = 0
    const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    weekdays.forEach((wd) => {
      const hours = resp.dailyActivity?.[wd] || []
      totalListens += hours.reduce((sum, h) => sum + (h.listen_count || 0), 0)
    })

    // Compute time span from timestamps
    let effectiveFrom = resp.from_ts

    // If all_time, refine the starting point using getListeningActivity first nonzero period
    if (timeRange.value === 'all_time') {
      try {
        const laResp = await fetch(buildUrl('/api/ListenBrainzAPI/getListeningActivity'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user: userId.value,
            scrobbleToken: scrobbleToken.value,
            timeRange: 'all_time',
          }),
        })
        const laData = await laResp.json()
        if (laResp.ok && Array.isArray(laData.activity)) {
          const firstNonZero: ListeningActivityItem | undefined = laData.activity.find(
            (a: ListeningActivityItem) => a.listen_count > 0,
          )
          if (firstNonZero && typeof firstNonZero.from_ts === 'number') {
            effectiveFrom = firstNonZero.from_ts
          }
        }
      } catch {
        // ignore, fallback to resp.from_ts
      }
    }

    const timeSpanSeconds = Math.max(resp.to_ts - effectiveFrom, 0)
    const timeSpanDays = Math.max(timeSpanSeconds / (60 * 60 * 24), 1)

    // Assuming average song length of 3.5 minutes
    const avgSongMinutes = 3.5
    const totalMinutes = totalListens * avgSongMinutes
    listenHours.value = Math.round(totalMinutes / 60)

    // Calculate average daily plays
    avgDailyPlays.value = Math.round(totalListens / timeSpanDays)

    // For now, set change to null (can be calculated if we fetch previous period data)
    listenHoursChange.value = null
    dailyPlaysChange.value = null
  } catch (err) {
    console.error('Error fetching activity stats:', err)
    statsError.value = true
  } finally {
    statsLoading.value = false
  }
}

const handleLogout = async () => {
  await authService.logout()
  router.push('/')
}

const handleScroll = () => {
  if (!topListSelector.value) return

  const scrollPosition = window.scrollY + window.innerHeight
  const scrollThreshold = document.documentElement.scrollHeight - 300

  if (scrollPosition >= scrollThreshold) {
    topListSelector.value.loadMore()
  }
}

// Watch for time range changes
watch(timeRange, () => {
  if (hasScrobbleToken.value) {
    fetchActivityStats()
  }
})

// Watch for scrobble token changes
watch(hasScrobbleToken, (newVal) => {
  if (newVal) {
    fetchActivityStats()
  }
})

// Add scroll listener when component mounts
watch(hasScrobbleToken, (newVal) => {
  if (newVal) {
    window.addEventListener('scroll', handleScroll)
  } else {
    window.removeEventListener('scroll', handleScroll)
  }
})

// Cleanup scroll listener
onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
})
</script>

<style scoped>
@import '../styles/HomePage.css';
</style>
