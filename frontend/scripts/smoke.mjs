// 数据层冒烟验证：用 localStorage 垫片在 Node 里跑真实业务代码。
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

async function loadService(storage = {}) {
  const result = await build({
    entryPoints: [join(root, 'src/api/local-service.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    alias: { '@': join(root, 'src') },
    logLevel: 'silent',
  })
  const code = result.outputFiles[0].text
  const store = new Map(Object.entries(storage))
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  }
  // 唯一注释让 URL 不同：保证每个用例拿到全新的数据层模块实例与缓存
  const unique = `\n// instance-${Date.now()}-${Math.random()}\n`
  const url = 'data:text/javascript,' + encodeURIComponent(code + unique)
  const mod = await import(url)
  return { mod, store, localStorage }
}

let passed = 0
function check(name, cond, detail = '') {
  if (!cond) throw new Error(`${name} 失败${detail ? `：${detail}` : ''}`)
  passed += 1
  console.log(`✓ ${name}`)
}

const ids = (rows) => rows.map((r) => Number(r.id))

// --- 1. 首开播种：3 台断路器，按 1/2/3 次序，id1 待保养且挂提醒 ---
{
  const { mod, localStorage } = await loadService()
  globalThis.window = { localStorage }
  const page = mod.listEntries('breaker')
  check('初始装载 3 台断路器', page.total === 3, `实际 ${page.total}`)
  check('初始次序为 1,2,3', ids(page.items).join() === '1,2,3', ids(page.items).join())
  check('样板 id1 为待保养', page.items[0].status === '待保养')
  const reminders = mod.activeReminders('breaker')
  check('待保养设备挂 1 条保养提醒', reminders.length === 1 && reminders[0].refId === 1)
}

// --- 2. 停用：提醒撤掉、缺陷待办入账 ---
{
  const { mod, localStorage } = await loadService()
  globalThis.window = { localStorage }
  const res = mod.runAction('breaker', 1, '停用')
  check('停用动作成功', res.ok, res.message)
  check('停用后状态为已停用', mod.getEntry('breaker', 1).status === '已停用')
  check('停用设备身上的提醒被撤掉', mod.activeReminders('breaker').length === 0)
  const defects = mod.listEntries('defect').items
  const booked = defects.filter((d) => d['来源模块'] === 'breaker' && Number(d['来源编号']) === 1)
  check('停用需检修结论落入缺陷待办（待处理）', booked.length === 1 && booked[0].status === '待处理')
}

// --- 3. 同一台设备重复提交，只入账一笔 ---
{
  const { mod, localStorage } = await loadService()
  globalThis.window = { localStorage }
  mod.runAction('breaker', 1, '提出检修')
  // 再停用、再次提出检修（状态来回切换），缺陷始终只有一笔
  mod.runAction('breaker', 1, '停用')
  mod.runAction('breaker', 1, '提出检修')
  const count = mod
    .listEntries('defect')
    .items.filter((d) => d['来源模块'] === 'breaker' && Number(d['来源编号']) === 1).length
  check('同设备重复提交只入账一笔缺陷', count === 1, `实际 ${count}`)
}

// --- 4. 复位断路器：底稿原次序、提醒对账、派生缺陷清除、不重复 ---
{
  const { mod, localStorage } = await loadService()
  globalThis.window = { localStorage }
  mod.runAction('breaker', 1, '停用')
  mod.runAction('breaker', 2, '提出检修')
  check('流转后有 2 条派生缺陷',
    mod.listEntries('defect').items.filter((d) => d['来源模块'] === 'breaker').length === 2)
  const page = mod.resetModule('breaker')
  check('复位后仍为 3 台', page.total === 3)
  check('复位后次序恢复 1,2,3', ids(page.items).join() === '1,2,3')
  check('上月保养批次回到样板状态（id1 待保养）', page.items[0].status === '待保养')
  check('id2 回到运行中', page.items[1].status === '运行中')
  const reminders = mod.activeReminders('breaker')
  check('复位后提醒恢复为 id1 一条', reminders.length === 1 && reminders[0].refId === 1)
  check('复位清掉流转派生的缺陷待办',
    mod.listEntries('defect').items.filter((d) => d['来源模块'] === 'breaker').length === 0)
  mod.resetModule('breaker')
  check('反复复位不会多出一份', mod.listEntries('breaker').total === 3)
}

// --- 5. 反复装载样板幂等，不追加重复行 ---
{
  const { mod, localStorage } = await loadService()
  globalThis.window = { localStorage }
  mod.loadSeedModule('breaker')
  mod.loadSeedModule('breaker')
  const count = mod.loadSeedData()['breaker']
  check('反复装载样板仍为 3 台', count === 3, `实际 ${count}`)
  check('编号不重复', new Set(ids(mod.listEntries('breaker').items)).size === 3)
}

// --- 6. 存储里混入同 id 重复行（老版本 bug）时读取自动收敛，数字对得上底稿 ---
{
  // 先用一个实例完成播种，再往存储里塞一条重复 id，用新实例冷启动读取
  const seeded = await loadService()
  globalThis.window = { localStorage: seeded.localStorage }
  seeded.mod.listEntries('breaker')
  const dirtyStorage = {}
  for (const [k, v] of seeded.store) dirtyStorage[k] = v
  const entries = JSON.parse(dirtyStorage['substation-protection:entries'])
  entries.breaker.push({ ...entries.breaker[0] }) // 复制一台 id=1
  dirtyStorage['substation-protection:entries'] = JSON.stringify(entries)
  check('脏数据含 4 行（1 条重复）', entries.breaker.length === 4)

  const { mod, localStorage } = await loadService(dirtyStorage)
  globalThis.window = { localStorage }
  const page = mod.listEntries('breaker')
  check('读取收敛后仍是 3 台，与底稿一致', page.total === 3, `实际 ${page.total}`)
  check('收敛后次序仍是 1,2,3', ids(page.items).join() === '1,2,3')
}

// --- 7. 列表与详情读到的型号/储能时间一致 ---
{
  const { mod, localStorage } = await loadService()
  globalThis.window = { localStorage }
  const listRow = mod.listEntries('breaker').items.find((r) => Number(r.id) === 2)
  const detailRow = mod.getEntry('breaker', 2)
  check('列表与详情断路器型号一致', listRow['断路器型号'] === detailRow['断路器型号'])
  check('列表与详情储能时间一致', listRow['储能时间'] === detailRow['储能时间'])
  check('储能时间仍为既有样板值（兼容旧示例数据）', detailRow['储能时间'] === '2026-09-02')
}

console.log(`\n全部 ${passed} 项验证通过`)
