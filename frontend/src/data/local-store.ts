import { SEED_REMINDERS, SEED_ROWS } from './seed'
import type { EntryRow, ReminderRow } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
const STORAGE_KEY = 'substation-protection:entries'
const REMINDER_KEY = 'substation-protection:reminders'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

// 同一编号只留一条，并保持首次出现的次序（样板记录在前，用户登记在后）。
// 历史版本反复装载样板时可能追加出同 id 的重复行，读取时统一收敛掉。
export function dedupeRows(rows: EntryRow[]): EntryRow[] {
  const seen = new Set<number>()
  const result: EntryRow[] = []
  for (const row of rows) {
    const id = Number(row.id)
    if (Number.isNaN(id) || seen.has(id)) {
      continue
    }
    seen.add(id)
    result.push(row)
  }
  return result
}

function readEntries(): Record<string, EntryRow[]> {
  const fallback = clone(SEED_ROWS)
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, EntryRow[]>
    // 以样板为底：补全新增模块，同时收敛可能混入的重复记录。
    const merged: Record<string, EntryRow[]> = { ...fallback }
    for (const key of Object.keys(parsed)) {
      merged[key] = dedupeRows(parsed[key] ?? [])
    }
    return merged
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
}

let cache: Record<string, EntryRow[]> | null = null
let reminderCache: ReminderRow[] | null = null

export function allRows(): Record<string, EntryRow[]> {
  if (cache === null) {
    cache = readEntries()
  }
  return cache
}

export function listRows(key: string): EntryRow[] {
  return allRows()[key] ?? []
}

export function saveRows(key: string, rows: EntryRow[]): void {
  const next = { ...allRows(), [key]: dedupeRows(rows) }
  cache = next
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
}

export function resetRows(key: string): EntryRow[] {
  const rows = clone(SEED_ROWS[key] ?? [])
  saveRows(key, rows)
  return rows
}

// 幂等装载样板：样板里有的按编号补回（已有记录不动用户数据），样板里没有的保留，
// 同一编号重复出现只留一条。反复调用结果一致，不会多出一份。
export function ensureSeedRows(key: string): EntryRow[] {
  const seeded = clone(SEED_ROWS[key] ?? [])
  const current = listRows(key)
  const byId = new Map<number, EntryRow>()
  for (const row of seeded) {
    byId.set(Number(row.id), row)
  }
  const merged: EntryRow[] = []
  const seededIds = new Set(byId.keys())
  // 先按样板次序补回样板记录：已有同 id 记录就沿用现有数据。
  for (const seedRow of seeded) {
    const existing = current.find((row) => Number(row.id) === Number(seedRow.id))
    merged.push(existing ?? seedRow)
  }
  // 再保留样板之外、用户自己登记的记录，顺手收敛重复行。
  for (const row of current) {
    const id = Number(row.id)
    if (!seededIds.has(id) && !merged.some((item) => Number(item.id) === id)) {
      merged.push(row)
    }
  }
  saveRows(key, merged)
  return listRows(key)
}

export function ensureAllSeedRows(): Record<string, EntryRow[]> {
  for (const key of Object.keys(SEED_ROWS)) {
    ensureSeedRows(key)
  }
  return allRows()
}

// 复位全部样板：设备清单与提醒都回到出厂底稿。
export function resetAll(): Record<string, EntryRow[]> {
  const fallback = clone(SEED_ROWS)
  cache = fallback
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
  }
  replaceReminders(clone(SEED_REMINDERS))
  return fallback
}

// ---- 保养提醒：独立存储，挂在设备身上，设备停用 / 复位时一起对账 ----

function readReminders(): ReminderRow[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return clone(SEED_REMINDERS)
  }
  const raw = window.localStorage.getItem(REMINDER_KEY)
  if (!raw) {
    const seeded = clone(SEED_REMINDERS)
    window.localStorage.setItem(REMINDER_KEY, JSON.stringify(seeded))
    return seeded
  }
  try {
    const parsed = JSON.parse(raw) as ReminderRow[]
    return dedupeReminders(parsed)
  } catch {
    const seeded = clone(SEED_REMINDERS)
    window.localStorage.setItem(REMINDER_KEY, JSON.stringify(seeded))
    return seeded
  }
}

function dedupeReminders(rows: ReminderRow[]): ReminderRow[] {
  const seen = new Set<string>()
  const result: ReminderRow[] = []
  for (const row of rows) {
    const key = `${row.module}:${row.refId}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    result.push(row)
  }
  return result
}

export function listReminders(module?: string): ReminderRow[] {
  if (reminderCache === null) {
    reminderCache = readReminders()
  }
  const rows = reminderCache
  return module ? rows.filter((row) => row.module === module) : rows
}

export function saveReminders(rows: ReminderRow[]): void {
  replaceReminders(dedupeReminders(rows))
}

function replaceReminders(rows: ReminderRow[]): void {
  reminderCache = rows
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(REMINDER_KEY, JSON.stringify(rows))
  }
}

export function storageKey(): string {
  return STORAGE_KEY
}

export function reminderStorageKey(): string {
  return REMINDER_KEY
}
