// 样板数据自检：不依赖浏览器、不依赖额外构建工具，直接读取 seed.ts 校验断路器底稿。
// seed.ts 除了一行 `import type` 外就是普通对象字面量，剥掉类型导入后可直接作为 ESM 执行。
// `npm run setup` 装完依赖后会顺带跑一遍，确认本机示例数据可用。
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const seedSource = await readFile(join(root, 'src/data/seed.ts'), 'utf8')
const jsSource = seedSource
  .replace(/^import\s+type\s+[^\n]*\n/m, '')
  .replace(/export\s+const\s+SEED_ROWS\s*:\s*[^=]+=/, 'export const SEED_ROWS =')
const dataUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(jsSource)}`
const { SEED_ROWS } = await import(dataUrl)

const failures = []
function check(condition, message) {
  if (!condition) {
    failures.push(message)
  }
}

check(SEED_ROWS && typeof SEED_ROWS === 'object', 'SEED_ROWS 不是对象')
const moduleKeys = Object.keys(SEED_ROWS)
check(moduleKeys.length === 18, `业务模块数量应为 18，实际 ${moduleKeys.length}`)

for (const [key, rows] of Object.entries(SEED_ROWS)) {
  check(Array.isArray(rows), `${key} 不是数组`)
  const ids = new Set()
  for (const row of rows) {
    check(row.id !== undefined, `${key} 存在缺少编号的记录`)
    check(!ids.has(row.id), `${key} 存在重复编号 ${row.id}`)
    ids.add(row.id)
  }
}

const breakers = SEED_ROWS.breaker ?? []
check(breakers.length === 3, `断路器样板应为 3 台，实际 ${breakers.length} 台`)
for (const row of breakers) {
  check(typeof row['断路器型号'] === 'string' && row['断路器型号'] !== '', `断路器 ${row.id} 缺少型号`)
  check(typeof row['设备编号'] === 'string' && row['设备编号'] !== '', `断路器 ${row.id} 缺少设备编号`)
  check(/^\d+s$/.test(String(row['储能时间'])), `断路器 ${row.id} 的储能时间格式应为「15s」这类秒数`)
  check(row['储能时间'] !== row['上次保养日'], `断路器 ${row.id} 的储能时间误填成了日期`)
}
const maintained = breakers.filter((row) => row.status === '已保养')
check(maintained.length >= 1, '样板里应包含已保养的断路器')
for (const row of maintained) {
  check(row.pending === false, `已保养的断路器 ${row.id} 不应再挂待保养提醒`)
}

const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
check(pkg.scripts && pkg.scripts.setup, 'package.json 缺少 setup 脚本')

if (failures.length > 0) {
  console.error('样板数据自检未通过：')
  for (const message of failures) {
    console.error(` - ${message}`)
  }
  process.exit(1)
}

console.log(
  `样板数据自检通过：${moduleKeys.length} 个模块，断路器底稿 ${breakers.length} 台，编号无重复。`,
)
