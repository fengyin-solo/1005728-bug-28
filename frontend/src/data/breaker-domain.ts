import type { EntryRow } from './types'

// 断路器维护领域的统一口径：列表页与详情页都从这里读型号、储能时间等字段，
// 任何一处改名都不会出现两个页面读不到一起的情况。
export const BREAKER_MODULE_KEY = 'breaker'
export const DEFECT_MODULE_KEY = 'defect'

const MODEL_FIELDS = ['断路器型号', '型号']
const CODE_FIELDS = ['设备编号', '编号']

// 停用后等待检修的状态：身上的保养提醒在复位样板数据时必须一并撤掉。
export const DEACTIVATED_STATUSES = ['需检修', '已停用']

export function firstField(row: EntryRow, fields: string[]): string {
  for (const field of fields) {
    const value = row[field]
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim()
    }
  }
  return ''
}

export function breakerCode(row: EntryRow): string {
  return firstField(row, CODE_FIELDS)
}

export function breakerModel(row: EntryRow): string {
  return firstField(row, MODEL_FIELDS)
}

// 储能时间在历史示例数据里出现过「储能时长」的别名，也混入过日期写法；
// 统一归一化：主字段是合法值时用主字段，主字段是脏值（日期）时回退到别名，
// 保证设备列表与详情页读到的是同一个值。
export function breakerChargeTime(row: EntryRow): string {
  const primary = String(row['储能时间'] ?? '').trim()
  if (primary && !/^\d{4}-\d{2}-\d{2}$/.test(primary)) {
    return primary
  }
  const alias = String(row['储能时长'] ?? '').trim()
  if (alias && !/^\d{4}-\d{2}-\d{2}$/.test(alias)) {
    return alias
  }
  return ''
}

export function isBreakerDeactivated(row: EntryRow): boolean {
  return DEACTIVATED_STATUSES.includes(String(row.status ?? ''))
}

// 缺陷处置待办与断路器停用记录之间的对账标记：靠它保证同一台设备反复复位也只入一笔。
export const DEFECT_SOURCE_FIELD = '来源模块'
export const DEFECT_SOURCE_VALUE = 'breaker'
export const DEFECT_SOURCE_CODE_FIELD = '来源设备编号'

const OPEN_DEFECT_STATUSES = ['待处理', '处理中']
const DEFECT_NUMBER_FIELD = '缺陷编号'

export function isOpenBreakerDefect(row: EntryRow): boolean {
  return (
    String(row[DEFECT_SOURCE_FIELD] ?? '') === DEFECT_SOURCE_VALUE &&
    OPEN_DEFECT_STATUSES.includes(String(row.status ?? ''))
  )
}

export function findOpenBreakerDefect(defects: EntryRow[], code: string): EntryRow | undefined {
  return defects.find(
    (row) => isOpenBreakerDefect(row) && String(row[DEFECT_SOURCE_CODE_FIELD] ?? '') === code,
  )
}

function nextDefectNumber(defects: EntryRow[]): string {
  let max = 0
  for (const row of defects) {
    const match = /^DEFE-(\d+)$/.exec(String(row[DEFECT_NUMBER_FIELD] ?? ''))
    if (match) {
      max = Math.max(max, Number(match[1]))
    }
  }
  return `DEFE-${String(max + 1).padStart(4, '0')}`
}

function toDateText(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

// 停用且判定需检修时落成一条「待处理」缺陷；调用方负责先查 findOpenBreakerDefect 去重。
export function buildBreakerDefect(defects: EntryRow[], breaker: EntryRow): EntryRow {
  const code = breakerCode(breaker)
  const model = breakerModel(breaker)
  const deadline = new Date()
  deadline.setDate(deadline.getDate() + 7)
  return {
    id: defects.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1,
    status: '待处理',
    pending: true,
    abnormal: false,
    [DEFECT_NUMBER_FIELD]: nextDefectNumber(defects),
    缺陷设备: code,
    缺陷等级: '危急',
    缺陷描述: `断路器${model ? `${model}（${code}）` : code}停用后判定需检修，请安排停电检修`,
    发现人: '系统',
    处理期限: toDateText(deadline),
    处理人: '',
    缺陷状态: '待处理',
    [DEFECT_SOURCE_FIELD]: DEFECT_SOURCE_VALUE,
    [DEFECT_SOURCE_CODE_FIELD]: code,
  }
}
