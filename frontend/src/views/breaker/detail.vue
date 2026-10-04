<template>
  <section class="page" data-module="breaker-detail">
    <header class="page-head">
      <div>
        <h2>断路器详情</h2>
        <p class="page-desc">设备型号、储能时间与设备列表取同一处数据，两处读到的内容保持一致。</p>
      </div>
      <div class="page-actions">
        <RouterLink class="btn" to="/breaker">返回列表</RouterLink>
        <button class="btn primary" type="button" @click="runAction('提出检修')">停用并提出检修</button>
      </div>
    </header>

    <article v-if="detail" class="detail-card">
      <dl class="detail-grid">
        <template v-for="item in detailItems" :key="item.label">
          <dt>{{ item.label }}</dt>
          <dd>{{ item.value || '—' }}</dd>
        </template>
        <dt>当前状态</dt>
        <dd>{{ detail.status }}</dd>
      </dl>
      <p v-if="infoMessage" class="info-text">{{ infoMessage }}</p>
      <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
    </article>

    <article v-if="linkedDefect" class="detail-card">
      <h3>关联缺陷待办</h3>
      <p>停用后判定需检修，结论已进入缺陷处置待办清单：{{ linkedDefect['缺陷编号'] }}（{{ linkedDefect.status }}）</p>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
  getEntry,
  listEntries,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import { breakerChargeTime, breakerCode, breakerModel, findOpenBreakerDefect } from '@/data/breaker-domain'
import type { EntryRow } from '@/data/types'

const route = useRoute()
const router = useRouter()
const meta = moduleMeta('breaker')

const detail = ref<EntryRow | null>(null)
const errorMessage = ref('')
const infoMessage = ref('')
const linkedDefect = ref<EntryRow | null>(null)

const detailItems = computed(() => {
  if (!detail.value) {
    return []
  }
  const row = detail.value
  return [
    { label: '设备编号', value: breakerCode(row) },
    { label: '所属间隔', value: String(row['所属间隔'] ?? '') },
    { label: '断路器型号', value: breakerModel(row) },
    { label: '操作次数', value: String(row['操作次数'] ?? '') },
    { label: '储能时间', value: breakerChargeTime(row) },
    { label: '保养周期', value: String(row['保养周期'] ?? '') },
    { label: '上次保养日', value: String(row['上次保养日'] ?? '') },
    { label: '设备状态', value: String(row['设备状态'] ?? '') },
  ]
})

function loadDetail() {
  errorMessage.value = ''
  infoMessage.value = ''
  try {
    const row = getEntry(meta.key, Number(route.params.id))
    detail.value = row
    const defects = listEntries('defect').items
    linkedDefect.value = findOpenBreakerDefect(defects, breakerCode(row)) ?? null
  } catch (error) {
    detail.value = null
    errorMessage.value = error instanceof Error ? error.message : '断路器详情读取失败'
  }
}

function runAction(action: string) {
  if (!detail.value) {
    return
  }
  const result = applyAction(meta.key, Number(detail.value.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  infoMessage.value = result.message
  loadDetail()
}

watch(() => route.params.id, (value) => {
  if (!value) {
    router.replace('/breaker')
    return
  }
  loadDetail()
})

onMounted(loadDetail)
</script>

<style scoped>
.detail-card {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 12px;
}
.detail-grid {
  display: grid;
  grid-template-columns: 120px 1fr 120px 1fr;
  gap: 8px 16px;
  margin: 0;
}
.detail-grid dt { color: var(--muted); font-size: 13px; }
.detail-grid dd { margin: 0; font-size: 13px; }
</style>
