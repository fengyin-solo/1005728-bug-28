// 断路器样板数据复位链路的业务逻辑验证。
// 不依赖浏览器构建工具：用项目自带的 typescript 把 src 下的 TS 转成 ESM，
// 重写依赖说明符后在注入 window/localStorage 的 Node 环境里跑完整流程。
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname as dirName, join, relative, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const scriptsDir = dirName(new URL(import.meta.url).pathname)
const srcRoot = resolve(scriptsDir, '..', 'src')

const buildDir = join(tmpdir(), `breaker-reset-check-${process.pid}`)
rmSync(buildDir, { recursive: true, force: true })
mkdirSync(buildDir, { recursive: true })
process.on('exit', () => rmSync(buildDir, { recursive: true, force: true }))

// 每个用例编一套全新的模块图到独立临时目录，模块级缓存因此天然隔离。
function buildGraph() {
  const outDir = join(buildDir, `graph-${Math.random().toString(36).slice(2)}`)
  mkdirSync(outDir, { recursive: true })
  const built = new Set()

  function resolveSpecifier(specifier, importer) {
    let path
    if (specifier.startsWith('@/')) {
      path = join(srcRoot, specifier.slice(2))
    } else if (specifier.startsWith('.')) {
      path = join(dirName(importer), specifier)
    } else {
      return null
    }
    if (!/\.[cm]?[jt]s$/.test(path)) {
      path += '.ts'
    }
    // 输出目录保持 src 内的相对结构，按两个输出文件之间的相对路径改写。
    const rel = relative(dirName(outPath(importer)), outPath(path)).replaceAll('\\', '/')
    return { path, depFromImporter: rel.startsWith('.') ? rel : `./${rel}` }
  }

  function outPath(absPath) {
    const rel = absPath.slice(srcRoot.length + 1).replace(/\.ts$/, '.mjs')
    return join(outDir, 'src', rel)
  }

  function build(absPath) {
    if (built.has(absPath)) {
      return
    }
    built.add(absPath)
    const source = readFileSync(absPath, 'utf8')
    let code = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
      fileName: absPath,
    }).outputText

    const deps = []
    code = code.replace(/(from\s*["'])([^"']+)(["'])/g, (full, prefix, specifier, suffix) => {
      const resolved = resolveSpecifier(specifier, absPath)
      if (!resolved) {
        return full
      }
      deps.push(resolved.path)
      return `${prefix}${resolved.depFromImporter}${suffix}`
    })

    const target = outPath(absPath)
    mkdirSync(dirName(target), { recursive: true })
    writeFileSync(target, code)
    for (const dep of deps) {
      build(dep)
    }
  }

  return {
    async import(absPath) {
      build(absPath)
      return import(outPath(absPath))
    },
  }
}

let storage = new Map()
globalThis.window = {
  get localStorage() {
    return {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    }
  },
}

async function loadService() {
  storage = new Map()
  const graph = buildGraph()
  return graph.import(join(srcRoot, 'api/local-service.ts'))
}

async function loadDomain() {
  storage = new Map()
  const graph = buildGraph()
  return graph.import(join(srcRoot, 'data/breaker-domain.ts'))
}

async function loadSeed() {
  storage = new Map()
  const graph = buildGraph()
  return graph.import(join(srcRoot, 'data/seed.ts'))
}

const assertions = []
function check(name, condition, detail = '') {
  assertions.push({ name, ok: Boolean(condition), detail })
  if (!condition) {
    console.error(`✗ ${name}${detail ? `：${detail}` : ''}`)
  }
}

// —— 用例 1：完整复位链路 ——
{
  const svc = await loadService()
  // 先把 2 号断路器停用并提出检修
  const action = svc.runAction('breaker', 2, '提出检修')
  check('停用后动作成功', action.ok, action.message)
  let defects = svc.listEntries('defect').items
  check('停用待检修落入缺陷待办', defects.some((r) => r['缺陷设备'] === 'BREA-0002' && r.status === '待处理'))

  // 同一台设备反复提交只入账一笔
  const again = svc.runAction('breaker', 2, '提出检修')
  defects = svc.listEntries('defect').items
  check(
    '重复提交不报错也不重复入账',
    defects.filter((r) => r['缺陷设备'] === 'BREA-0002').length === 1,
    `实际 ${defects.filter((r) => r['缺陷设备'] === 'BREA-0002').length} 笔，ok=${again.ok}`,
  )

  // 复位样板数据
  const page = svc.resetModule('breaker')
  const breakers = page.items
  check('复位后数量回到底稿 3 台', breakers.length === 3, `实际 ${breakers.length}`)
  check(
    '复位后按底稿次序排列',
    breakers.map((r) => r['设备编号']).join(',') === 'BREA-0001,BREA-0002,BREA-0003',
  )
  const b2 = breakers.find((r) => r['设备编号'] === 'BREA-0002')
  check('停用设备复位后保持需检修', b2.status === '需检修', b2.status)
  check('停用设备身上的提醒已撤销', b2.pending === false)
  check('其他设备恢复底稿状态', breakers.find((r) => r['设备编号'] === 'BREA-0003').status === '已保养')
  check('待保养设备的提醒按底稿保留', breakers.find((r) => r['设备编号'] === 'BREA-0001').pending === true)

  defects = svc.listEntries('defect').items
  check('复位后缺陷待办保留该笔', defects.some((r) => r['缺陷设备'] === 'BREA-0002' && r.status === '待处理'))
  check(
    '复位没有重复入账',
    defects.filter((r) => r['缺陷设备'] === 'BREA-0002').length === 1,
    `实际 ${defects.filter((r) => r['缺陷设备'] === 'BREA-0002').length} 笔`,
  )

  // 再复位一次：仍然只有一笔
  svc.resetModule('breaker')
  defects = svc.listEntries('defect').items
  check('反复复位也只入账一笔', defects.filter((r) => r['缺陷设备'] === 'BREA-0002').length === 1)
  check('反复复位总数仍为 3 台', svc.listEntries('breaker').total === 3)
}

// —— 用例 2：反复装载样板数据不会多出一份 ——
{
  const svc = await loadService()
  svc.loadSampleModule('breaker')
  svc.loadSampleModule('breaker')
  const third = svc.loadSampleModule('breaker')
  check('反复装载不产生重复行', third.items.length === 3, `实际 ${third.items.length}`)
  check('反复装载编号唯一', new Set(third.items.map((r) => r.id)).size === third.items.length)
}

// —— 用例 3：型号 / 储能时间两处口径一致，并兼容旧示例数据 ——
{
  const { breakerModel, breakerChargeTime } = await loadDomain()
  const svc = await loadService()
  const b1 = svc.getEntry('breaker', 1)
  check('型号可统一读取', breakerModel(b1) === b1['断路器型号'])
  check('储能时间可统一读取', breakerChargeTime(b1) === '15s', breakerChargeTime(b1))
  // 旧底稿里的别名与误填日期
  const legacy = {
    id: 99,
    status: '运行中',
    设备编号: 'BREA-9999',
    型号: 'VD4-12',
    储能时长: '20s',
    储能时间: '2026-09-01',
  }
  check('兼容「型号」别名字段', breakerModel(legacy) === 'VD4-12')
  check('优先取储能时间字段且过滤误填日期', breakerChargeTime(legacy) === '20s', breakerChargeTime(legacy))
}

// —— 用例 4：脏数据（重复 id）在首次读出时被收敛 ——
{
  storage = new Map()
  const { SEED_ROWS } = await loadSeed()
  const dirty = JSON.parse(JSON.stringify(SEED_ROWS))
  dirty.breaker.push(dirty.breaker[0])
  dirty.breaker.push({ ...dirty.breaker[0], id: 4, 设备编号: 'BREA-0004' })
  storage.set('substation-protection:entries', JSON.stringify(dirty))

  const graph = buildGraph()
  const svc = await graph.import(join(srcRoot, 'api/local-service.ts'))
  const rows = svc.listEntries('breaker').items
  check('同 id 重复行只保留一条', rows.filter((r) => r.id === 1).length === 1)
  check('非重复行保留', rows.some((r) => r['设备编号'] === 'BREA-0004'))
  check('脏数据收敛后总条数正确', rows.length === 4, `实际 ${rows.length}`)
}

const failed = assertions.filter((a) => !a.ok)
console.log(`\n${assertions.length - failed.length}/${assertions.length} 项通过`)
if (failed.length > 0) {
  process.exit(1)
}
