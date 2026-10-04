import seed from './seed.json'
import type { EntryRow, ReminderRow } from './types'

// 示例数据：首次打开时播种，之后浏览器里的改动优先，重置才会回到这份。
// seed.json 是唯一数据源，npm run setup 会一并校验；这里只做类型收窄。
export const SEED_ROWS = seed as Record<string, EntryRow[]>

// 待保养的断路器身上默认挂一条保养提醒；停用设备时提醒要跟着撤掉。
export const MAINTENANCE_PENDING_STATUS = '待保养'

export function seedRemindersFor(rows: EntryRow[]): ReminderRow[] {
  return rows
    .filter((row) => String(row.status) === MAINTENANCE_PENDING_STATUS)
    .map((row) => ({
      id: Number(row.id),
      module: 'breaker',
      refId: Number(row.id),
      title: `${row['设备编号']} 待保养提醒`,
      status: '生效中',
      seeded: true,
    }))
}

export const SEED_REMINDERS: ReminderRow[] = seedRemindersFor(SEED_ROWS.breaker ?? [])
