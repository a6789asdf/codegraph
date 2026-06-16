<template>
  <a-card :bordered="false" class="stat-card" :body-style="bodyStyle">
    <div class="stat-icon" :style="{ color: color }">
      <component :is="icon" />
    </div>
    <div class="stat-content">
      <div class="stat-value">{{ formattedValue }}</div>
      <div class="stat-label">{{ label }}</div>
      <div v-if="suffix" class="stat-suffix">{{ suffix }}</div>
    </div>
  </a-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  icon: any
  color: string
  label: string
  value: number | string
  suffix?: string
  format?: 'number' | 'bytes' | 'raw'
}>()

const bodyStyle = { padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '16px' }

const formattedValue = computed(() => {
  const v = props.value
  if (props.format === 'bytes') {
    if (typeof v === 'number') {
      if (v > 1_000_000) return (v / 1_000_000).toFixed(1) + ' MB'
      if (v > 1_000) return (v / 1_000).toFixed(1) + ' KB'
      return v + ' B'
    }
    return v
  }
  if (props.format === 'number' && typeof v === 'number') {
    return v.toLocaleString()
  }
  return v
})
</script>

<style scoped>
.stat-card {
  border-radius: 8px;
  transition: box-shadow 0.2s;
}
.stat-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}
.stat-icon {
  font-size: 32px;
  flex-shrink: 0;
}
.stat-value {
  font-size: 28px;
  font-weight: 700;
  line-height: 1.2;
  color: rgba(0, 0, 0, 0.85);
}
.stat-label {
  font-size: 13px;
  color: rgba(0, 0, 0, 0.45);
  margin-top: 2px;
}
.stat-suffix {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.35);
  margin-top: 2px;
}
</style>
