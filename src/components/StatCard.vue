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

<style scoped>
.stat-card {
  padding: 1rem;
  min-height: 100px;
  display: flex;
  align-items: center;
  transition: all 0.2s ease;
  border-left: 4px solid var(--accent-primary);
}

.stat-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(129, 163, 142, 0.25);
}

.stat-content {
  width: 100%;
  padding-left: 0.5rem;
}

.stat-label {
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin-bottom: 0.75rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.stat-value {
  font-size: 2rem;
  font-weight: 700;
  color: var(--text-primary);
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
}

.stat-value.loading {
  font-size: 1rem;
  color: var(--text-secondary);
}

.stat-value.error {
  color: var(--text-secondary);
}

.stat-change {
  font-size: 0.875rem;
  font-weight: 600;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}

.stat-change.positive {
  color: #98c379;
  background-color: rgba(152, 195, 121, 0.1);
}

.stat-change.negative {
  color: #e06c75;
  background-color: rgba(224, 108, 117, 0.1);
}
</style>
