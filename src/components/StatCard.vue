<template>
  <div class="stat-card card">
    <div class="stat-content">
      <div class="stat-label">{{ label }}</div>
      <div v-if="loading" class="stat-value loading">Loading...</div>
      <div v-else-if="error" class="stat-value error">--</div>
      <div v-else class="stat-value">
        {{ formattedValue }}
        <span v-if="change !== null" :class="['stat-change', changeClass]">
          {{ changeText }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import '../styles/StatCard.css'

const props = defineProps<{
  label: string
  value: number | string
  loading?: boolean
  error?: boolean
  change?: number | null
  suffix?: string
}>()

const formattedValue = computed(() => {
  if (typeof props.value === 'string') {
    return props.value
  }
  return props.value.toLocaleString() + (props.suffix || '')
})

const changeClass = computed(() => {
  if (props.change === null || props.change === undefined) return ''
  return props.change >= 0 ? 'positive' : 'negative'
})

const changeText = computed(() => {
  if (props.change === null || props.change === undefined) return ''
  const sign = props.change >= 0 ? '↑' : '↓'
  return `${sign} ${Math.abs(props.change)}%`
})
</script>
