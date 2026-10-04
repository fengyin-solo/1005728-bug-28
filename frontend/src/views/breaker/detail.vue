<template>
  <section class="page" data-module="breaker-detail">
    <header class="page-head">
      <div>
        <h2>断路器详情</h2>
        <p class="page-desc">详情字段与设备列表读的是同一份台账数据，型号、储能时间两处保持一致。</p>
      </div>
      <div class="page-actions">
        <RouterLink class="btn" to="/breaker">返回设备列表</RouterLink>
      </div>
    </header>

    <template v-if="row">
      <table class="data-table">
        <tbody>
          <tr v-for="column in columns" :key="column">
            <th style="width: 160px">{{ column }}</th>
            <td>{{ row[column] ?? '—' }}</td>
          </tr>
          <tr>
            <th>当前状态</th>
            <td>{{ row.status }}</td>
          </tr>
        </tbody>
      </table>

      <p v-if="reminder" class="status-legend" style="margin-top: 12px">
        <span class="legend-item">{{ reminder.title }}</span>
      </p>

      <div class="page-actions" style="margin-top: 12px">
        <button
          v-for="action in actions"
          :key="action"
          class="btn"
          :class="{ primary: action === '完成保养' }"
          type="button"
          @click="runAction(action)"
        >
          {{ action }}
        </button>
      </div>

      <footer class="page-foot">
        <span v-if="notice" :class="noticeOk ? '' : 'error-text'">{{ notice }}</span>
      </footer>
    </template>

    <p v-else class="empty-state">没有找到这台断路器，可能已被复位移除。</p>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import {
  activeReminders,
  getEntry,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import type { EntryRow, ReminderRow } from '@/data/types'

const meta = moduleMeta('breaker')
// 列与设备列表完全相同，且都取自同一份台账，保证两处读到的型号、储能时间一致
const columns = ["设备编号", "所属间隔", "断路器型号", "操作次数", "储能时间", "保养周期", "上次保养日", "设备状态"]
const actions = ["登记运行", "完成保养", "提出检修", "停用"]

const route = useRoute()
const entryId = Number(route.params.id)
const row = ref<EntryRow | undefined>()
const reminder = ref<ReminderRow | undefined>()
const notice = ref('')
const noticeOk = ref(true)

function runAction(action: string) {
  notice.value = ''
  const result = applyAction(meta.key, entryId, action)
  noticeOk.value = result.ok
  notice.value = result.message
  reload()
}

function reload() {
  row.value = getEntry(meta.key, entryId)
  reminder.value = activeReminders('breaker').find((item) => item.refId === entryId)
}

onMounted(reload)
</script>
