import { MODULE_BY_KEY } from '@/data/modules'
import {
  allRows,
  ensureAllSeedRows,
  ensureSeedRows,
  listReminders,
  listRows,
  resetAll as resetAllRows,
  resetRows,
  saveReminders,
  saveRows,
} from '@/data/local-store'
import { seedRemindersFor } from '@/data/seed'
import type {
  ActionResult,
  EntryRow,
  ModuleMeta,
  OverviewResult,
  PageResult,
  ReminderRow,
} from '@/data/types'

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']

export function moduleMeta(key: string): ModuleMeta {
  const meta = MODULE_BY_KEY.get(key)
  if (!meta) {
    throw new Error(`没有登记名为 ${key} 的业务模块`)
  }
  return meta
}

export function filterRows(rows: EntryRow[], filters: Record<string, string>): EntryRow[] {
  const pairs = Object.entries(filters).filter(([, value]) => value.trim() !== '')
  if (pairs.length === 0) {
    return rows
  }
  return rows.filter((row) =>
    pairs.every(([field, value]) => String(row[field] ?? '').includes(value.trim())),
  )
}

export function listEntries(key: string, filters: Record<string, string> = {}): PageResult {
  const matched = filterRows(listRows(key), filters)
  return { items: matched, total: matched.length, page: 1, size: matched.length }
}

export function getEntry(key: string, id: number): EntryRow | undefined {
  return listRows(key).find((row) => Number(row.id) === id)
}

export function runAction(key: string, id: number, action: string): ActionResult {
  const meta = moduleMeta(key)
  const target = meta.actionTargets[action]
  if (!target) {
    return { ok: false, message: `${meta.entity}没有登记「${action}」这个动作` }
  }
  const rows = listRows(key)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的${meta.entity}` }
  }
  const current = String(rows[index].status)
  if (current === target) {
    return { ok: false, message: `${meta.entity}已经是「${target}」，不用重复操作` }
  }
  const lastStatus = meta.statuses[meta.statuses.length - 1]
  const updated: EntryRow = {
    ...rows[index],
    status: target,
    pending: target !== lastStatus,
    abnormal: NEGATIVE_ACTIONS.some((verb) => action.startsWith(verb)),
  }
  const next = [...rows]
  next[index] = updated
  saveRows(key, next)

  if (key === 'breaker') {
    return applyBreakerSideEffects(updated, action)
  }
  return { ok: true, message: `${meta.entity}已${action}，当前状态「${target}」` }
}

// ---- 断路器专属流转副作用：保养提醒跟着设备状态走，需检修结论进缺陷待办 ----

function syncMaintenanceReminder(breaker: EntryRow): void {
  const refId = Number(breaker.id)
  const reminders = listReminders('breaker')
  const others = reminders.filter((row) => row.refId !== refId)
  if (String(breaker.status) === '待保养') {
    // 回到待保养：提醒重新挂上，同一设备始终只有一条
    const previous = reminders.find((row) => row.refId === refId)
    const reminder: ReminderRow = {
      id: refId,
      module: 'breaker',
      refId,
      title: `${breaker['设备编号']} 待保养提醒`,
      status: '生效中',
      seeded: previous?.seeded ?? false,
    }
    saveReminders([...others, reminder])
  } else {
    // 停用（或离开待保养）：设备身上的提醒一起撤掉
    saveReminders(others)
  }
}

// 由断路器流转派生的缺陷记录打标，复位与去重都靠它辨认。
const DEFECT_SOURCE_MODULE = 'breaker'

function bookMaintenanceDefect(breaker: EntryRow): boolean {
  const defects = listRows('defect')
  const refId = Number(breaker.id)
  // 同一台设备无论重复提交几次，缺陷清单只入账一笔
  const existing = defects.find(
    (row) =>
      String(row['来源模块']) === DEFECT_SOURCE_MODULE && Number(row['来源编号']) === refId,
  )
  if (existing) {
    return false
  }
  const nextId = defects.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
  const code = `断路器 ${breaker['设备编号']}`
  const defect: EntryRow = {
    id: nextId,
    status: '待处理',
    pending: true,
    abnormal: false,
    缺陷编号: `DEFE-${String(nextId).padStart(4, '0')}`,
    缺陷设备: code,
    缺陷等级: '需检修',
    缺陷描述: `${code}（${breaker['断路器型号']}）停用后判定需要检修，请安排检修`,
    发现人: '系统流转',
    处理期限: '',
    处理人: '',
    缺陷状态: '待处理',
    来源模块: DEFECT_SOURCE_MODULE,
    来源编号: refId,
  }
  saveRows('defect', [...defects, defect])
  return true
}

function applyBreakerSideEffects(breaker: EntryRow, action: string): ActionResult {
  syncMaintenanceReminder(breaker)
  let message = `断路器已${action}，当前状态「${breaker.status}」`
  // 提出检修、停用之后需要检修的结论都落到缺陷处置的待办清单；同一设备只入账一笔
  if (breaker.status === '需检修' || breaker.status === '已停用') {
    const booked = bookMaintenanceDefect(breaker)
    if (booked) {
      message += '，需检修结论已登记到缺陷处置待办清单'
    }
  }
  return { ok: true, message }
}

// 复位断路器：设备底稿按样板次序补回、停用设备的提醒一并撤掉、
// 由流转派生的缺陷待办随之清掉，反复复位不会多出一份。
function resetBreaker(): void {
  const seeded = resetRows('breaker')
  // 提醒只保留样板里待保养设备那几条，且恢复样板次序
  saveReminders(seedRemindersFor(seeded))
  // 流转期间派生的缺陷待办不属于样板，复位时清掉
  const defects = listRows('defect').filter(
    (row) => String(row['来源模块']) !== DEFECT_SOURCE_MODULE,
  )
  saveRows('defect', defects)
}

export function resetModule(key: string): PageResult {
  if (key === 'breaker') {
    resetBreaker()
  } else {
    resetRows(key)
  }
  return listEntries(key)
}

// 幂等装载样板数据：缺的按原次序补回，已有的保留，重复装载不会多出一份。
export function loadSeedModule(key: string): PageResult {
  ensureSeedRows(key)
  return listEntries(key)
}

export function loadSeedData(): Record<string, number> {
  ensureAllSeedRows()
  const result: Record<string, number> = {}
  for (const [key, rows] of Object.entries(allRows())) {
    result[key] = rows.length
  }
  return result
}

export function resetAllModules(): void {
  resetAllRows()
}

export function activeReminders(module = 'breaker'): ReminderRow[] {
  return listReminders(module).filter((row) => row.status === '生效中')
}

export function exportEntries(key: string): { filename: string; content: string } {
  const meta = moduleMeta(key)
  const header = ['编号', ...meta.fields, '当前状态']
  const lines = [header.join(',')]
  for (const row of listRows(key)) {
    lines.push([row.id, ...meta.fields.map((field) => row[field] ?? ''), row.status].join(','))
  }
  return { filename: `${meta.name}-清单.csv`, content: `﻿${lines.join('\n')}` }
}

export function downloadEntries(key: string): void {
  const { filename, content } = exportEntries(key)
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function loadOverview(): OverviewResult {
  const rows = allRows()
  const modules = [...MODULE_BY_KEY.values()].map((meta) => {
    const entries = rows[meta.key] ?? []
    return {
      name: meta.name,
      created: entries.length,
      pending: entries.filter((row) => row.pending).length,
      abnormal: entries.filter((row) => row.abnormal).length,
    }
  })
  const cards = [
    { label: '业务模块', value: modules.length },
    { label: '登记总量', value: modules.reduce((sum, item) => sum + item.created, 0) },
    { label: '待处理', value: modules.reduce((sum, item) => sum + item.pending, 0) },
    { label: '异常量', value: modules.reduce((sum, item) => sum + item.abnormal, 0) },
  ]
  return { cards, modules }
}
