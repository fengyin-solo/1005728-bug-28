import { MODULE_BY_KEY } from '@/data/modules'
import {
  allRows,
  listDeactivatedBreakers,
  listRows,
  loadSeedRows,
  resetRows,
  saveDeactivatedBreakers,
  saveRows,
} from '@/data/local-store'
import {
  BREAKER_MODULE_KEY,
  DEFECT_MODULE_KEY,
  breakerCode,
  buildBreakerDefect,
  findOpenBreakerDefect,
  isBreakerDeactivated,
} from '@/data/breaker-domain'
import type { ActionResult, EntryRow, ModuleMeta, OverviewResult, PageResult } from '@/data/types'

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

// 停用后需要检修的断路器，往缺陷处置待办清单里落一笔；同一台设备只落一笔。
export function bookBreakerDefect(breaker: EntryRow): ActionResult | null {
  const code = breakerCode(breaker)
  if (!code) {
    return null
  }
  const defects = listRows(DEFECT_MODULE_KEY)
  if (findOpenBreakerDefect(defects, code)) {
    return null
  }
  const next = [...defects, buildBreakerDefect(defects, breaker)]
  saveRows(DEFECT_MODULE_KEY, next)
  const registry = listDeactivatedBreakers()
  if (!registry.includes(code)) {
    saveDeactivatedBreakers([...registry, code])
  }
  return { ok: true, message: '需要检修的结论已进入缺陷处置待办清单' }
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
    // 已经是停用待检修状态时，也要保证缺陷待办没有漏登记：反复提交只入一笔。
    if (key === BREAKER_MODULE_KEY && isBreakerDeactivated(rows[index])) {
      return bookBreakerDefect(rows[index]) ?? {
        ok: false,
        message: `${meta.entity}已经是「${target}」，不用重复操作`,
      }
    }
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
  if (key === BREAKER_MODULE_KEY && isBreakerDeactivated(updated)) {
    const booked = bookBreakerDefect(updated)
    if (booked) {
      return { ok: true, message: `${meta.entity}已${action}，当前状态「${target}」，${booked.message}` }
    }
  }
  return { ok: true, message: `${meta.entity}已${action}，当前状态「${target}」` }
}

export function resetModule(key: string): PageResult {
  if (key === BREAKER_MODULE_KEY) {
    return resetBreakerModule()
  }
  resetRows(key)
  return listEntries(key)
}

// 复位断路器样板数据：
// 1) 原有记录严格按样板底稿的次序补回；
// 2) 停用设备身上的提醒（待保养）随停用结论一并撤掉，停用态保持为「需检修」；
// 3) 停用待检修的设备在缺陷处置待办里各挂一笔，反复复位只挂一笔。
export function resetBreakerModule(): PageResult {
  const deactivated = new Set(listDeactivatedBreakers())
  const restored = resetRows(BREAKER_MODULE_KEY).map((row) => {
    if (isBreakerDeactivated(row) || deactivated.has(breakerCode(row))) {
      return { ...row, status: '需检修', 设备状态: '需检修', pending: false, abnormal: false }
    }
    return row
  })
  saveRows(BREAKER_MODULE_KEY, restored)

  const defects = listRows(DEFECT_MODULE_KEY)
  const additions: EntryRow[] = []
  for (const row of restored.filter(isBreakerDeactivated)) {
    const code = breakerCode(row)
    if (!findOpenBreakerDefect([...defects, ...additions], code)) {
      additions.push(buildBreakerDefect([...defects, ...additions], row))
    }
  }
  if (additions.length > 0) {
    saveRows(DEFECT_MODULE_KEY, [...defects, ...additions])
  }
  return listEntries(BREAKER_MODULE_KEY)
}

// 装载样板数据（不覆盖运行期改动）：按底稿次序补齐缺失记录，反复装载不会多出一份。
export function loadSampleModule(key: string): PageResult {
  loadSeedRows(key)
  return listEntries(key)
}

export function getEntry(key: string, id: number): EntryRow {
  const target = listRows(key).find((row) => Number(row.id) === id)
  if (!target) {
    throw new Error(`没有找到编号为 ${id} 的${moduleMeta(key).entity}`)
  }
  return target
}

export function exportEntries(key: string): { filename: string; content: string } {
  const meta = moduleMeta(key)
  const header = ['编号', ...meta.fields, '当前状态']
  const lines = [header.join(',')]
  for (const row of listRows(key)) {
    lines.push([row.id, ...meta.fields.map((field) => row[field] ?? ''), row.status].join(','))
  }
  return { filename: `${meta.name}-清单.csv`, content: `\uFEFF${lines.join('\n')}` }
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
