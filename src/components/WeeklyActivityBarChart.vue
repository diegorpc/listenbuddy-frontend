<template>
  <div class="activity-chart card">
    <h3 class="chart-title">{{ title }}</h3>
    
    <div v-if="loading" class="chart-loading">
      <p>Loading activity data...</p>
    </div>
    
    <div v-else-if="error" class="chart-error">
      <p>{{ error }}</p>
    </div>
    
    <div v-else class="chart-container">
      <div class="chart-bars">
        <div
          v-for="day in days"
          :key="day.name"
          class="bar-wrapper"
        >
          <div class="bar-container">
            <div
              class="bar"
              :style="{ height: getBarHeight(day.count) + '%' }"
            >
              <span class="bar-label">{{ day.count }}</span>
            </div>
          </div>
          <div class="day-label">{{ day.name }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import { buildUrl } from '../services/apiRequests'
import '../styles/WeeklyActivityBarChart.css'

interface DayActivity {
  name: string
  count: number
}

interface DailyActivityResponse {
  dailyActivity: Record<string, Array<{ hour: number; listen_count: number }>>
  from_ts: number
  to_ts: number
}

const props = defineProps<{
  userId: string
  scrobbleToken: string
  timeRange: string
}>()

const days = ref<DayActivity[]>([
  { name: 'Mon', count: 0 },
  { name: 'Tue', count: 0 },
  { name: 'Wed', count: 0 },
  { name: 'Thu', count: 0 },
  { name: 'Fri', count: 0 },
  { name: 'Sat', count: 0 },
  { name: 'Sun', count: 0 },
])

const loading = ref(false)
const error = ref<string | null>(null)
const maxCount = computed(() => Math.max(...days.value.map(d => d.count), 1))

const title = computed(() => {
  const timeRangeMap: Record<string, string> = {
    'this_week': "This Week's Activity",
    'this_month': "This Month's Activity",
    'this_year': "This Year's Activity",
    'all_time': "All Time Activity",
  }
  return timeRangeMap[props.timeRange] || "Weekly Activity"
})

const getBarHeight = (count: number): number => {
  if (maxCount.value === 0) return 0
  return (count / maxCount.value) * 100
}

const fetchActivityData = async () => {
  loading.value = true
  error.value = null

  try {
    const response = await fetch(buildUrl('/api/ListenBrainzAPI/getDailyActivity'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user: props.userId,
        scrobbleToken: props.scrobbleToken,
        timeRange: props.timeRange,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || 'Failed to fetch activity data')
    }

    const resp: DailyActivityResponse = data

    // Sum listens per weekday across all hours
    const weekdayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    const totalsPerWeekday = new Map<string, number>()
    weekdayOrder.forEach(d => totalsPerWeekday.set(d, 0))

    weekdayOrder.forEach((weekday) => {
      const hours = resp.dailyActivity?.[weekday] || []
      const total = hours.reduce((sum, h) => sum + (h.listen_count || 0), 0)
      totalsPerWeekday.set(weekday, total)
    })

    // Determine effective from_ts. If all_time, refine via getListeningActivity first nonzero period
    let effectiveFromTs = resp.from_ts
    if (props.timeRange === 'all_time') {
      try {
        const laResp = await fetch(buildUrl('/api/ListenBrainzAPI/getListeningActivity'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user: props.userId,
            scrobbleToken: props.scrobbleToken,
            timeRange: 'all_time',
          }),
        })
        const laData = await laResp.json()
        if (laResp.ok && Array.isArray(laData.activity)) {
          const firstNonZero = laData.activity.find((a: { listen_count: number; from_ts: number }) => a.listen_count > 0)
          if (firstNonZero && typeof firstNonZero.from_ts === 'number') {
            effectiveFromTs = firstNonZero.from_ts
          }
        }
      } catch {
        // ignore, fallback to resp.from_ts
      }
    }

    // Compute how many occurrences of each weekday are in the [effectiveFromTs, to_ts] range
    const from = new Date(effectiveFromTs * 1000)
    const to = new Date(resp.to_ts * 1000)
    const occurrencesPerWeekday = new Map<string, number>()
    weekdayOrder.forEach(d => occurrencesPerWeekday.set(d, 0))

    const cursor = new Date(from)
    while (cursor <= to) {
      const jsDay = cursor.getUTCDay() // 0=Sun..6=Sat
      const name = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][jsDay]
      occurrencesPerWeekday.set(name, (occurrencesPerWeekday.get(name) || 0) + 1)
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }

    // Map to our display days (Mon..Sun) with averages
    const dayIndexMap: Record<string, number> = {
      'Monday': 0,
      'Tuesday': 1,
      'Wednesday': 2,
      'Thursday': 3,
      'Friday': 4,
      'Saturday': 5,
      'Sunday': 6,
    }

    weekdayOrder.forEach((weekday) => {
      const total = totalsPerWeekday.get(weekday) || 0
      const occ = Math.max(occurrencesPerWeekday.get(weekday) || 1, 1)
      const avg = Math.round(total / occ)
      const idx = dayIndexMap[weekday]
      days.value[idx].count = avg
    })

  } catch (err) {
    console.error('Error fetching activity data:', err)
    error.value = err instanceof Error ? err.message : 'Failed to load activity data'
  } finally {
    loading.value = false
  }
}

watch(() => props.timeRange, () => {
  fetchActivityData()
})

onMounted(() => {
  fetchActivityData()
})
</script>
