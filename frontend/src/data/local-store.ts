import { SEED_ROWS } from './seed'
import type { EntryRow } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
const STORAGE_KEY = 'substation-protection:entries'
const DEACTIVATED_KEY = 'substation-protection:breaker-deactivated'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

// 同一台设备重复落两行时，保留首次出现的那条：列表总数必须与底稿对得上。
function dedupeRows(rows: EntryRow[]): EntryRow[] {
  const seen = new Set<number>()
  const result: EntryRow[] = []
  for (const row of rows) {
    const id = Number(row.id)
    if (Number.isNaN(id)) {
      result.push(row)
      continue
    }
    if (seen.has(id)) {
      continue
    }
    seen.add(id)
    result.push(row)
  }
  return result
}

function seedFallback(): Record<string, EntryRow[]> {
  const fallback: Record<string, EntryRow[]> = {}
  for (const [key, rows] of Object.entries(SEED_ROWS)) {
    fallback[key] = dedupeRows(clone(rows))
  }
  return fallback
}

function normalize(parsed: unknown): Record<string, EntryRow[]> {
  const fallback = seedFallback()
  if (!parsed || typeof parsed !== 'object') {
    return fallback
  }
  const stored = parsed as Record<string, unknown>
  const next: Record<string, EntryRow[]> = { ...fallback }
  for (const key of Object.keys(fallback)) {
    const value = stored[key]
    if (Array.isArray(value)) {
      next[key] = dedupeRows(value as EntryRow[])
    }
  }
  return next
}

function readStorage(): Record<string, EntryRow[]> {
  const fallback = seedFallback()
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    const next = normalize(JSON.parse(raw))
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    return next
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
}

let cache: Record<string, EntryRow[]> | null = null

export function allRows(): Record<string, EntryRow[]> {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

export function listRows(key: string): EntryRow[] {
  return allRows()[key] ?? []
}

export function saveRows(key: string, rows: EntryRow[]): void {
  const next = { ...allRows(), [key]: dedupeRows(rows) }
  cache = next
  persist()
}

function persist(): void {
  if (typeof window !== 'undefined' && window.localStorage && cache) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
  }
}

// 复位：整模块回到样板底稿，原有记录严格按底稿的次序补回。
export function resetRows(key: string): EntryRow[] {
  const rows = dedupeRows(clone(SEED_ROWS[key] ?? []))
  saveRows(key, rows)
  return rows
}

// 反复装载样板数据也不会多出一份：底稿已有编号按底稿覆盖，运行期新增的记录保留在末尾。
export function loadSeedRows(key: string): EntryRow[] {
  const seed = dedupeRows(clone(SEED_ROWS[key] ?? []))
  const seedIds = new Set(seed.map((row) => Number(row.id)))
  const extras = listRows(key).filter((row) => !seedIds.has(Number(row.id)))
  const rows = dedupeRows([...seed, ...extras])
  saveRows(key, rows)
  return rows
}

// 停用设备台账：复位样板数据后仍要记住哪些设备停用着，提醒该撤、缺陷该建都靠它。
export function listDeactivatedBreakers(): string[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return []
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DEACTIVATED_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

export function saveDeactivatedBreakers(codes: string[]): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(DEACTIVATED_KEY, JSON.stringify([...new Set(codes)]))
  }
}

export function storageKey(): string {
  return STORAGE_KEY
}
