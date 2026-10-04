#!/usr/bin/env node
// 本机开发环境备齐示例数据：校验 src/data/seed.json 的结构与编号，
// 反复执行结果一致（幂等），不会往样板里追加重复记录。
// 由 `npm run setup` 在依赖安装完成后自动带上。
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const seedPath = join(here, '..', 'src', 'data', 'seed.json')

async function main() {
  const raw = await readFile(seedPath, 'utf8')
  const seed = JSON.parse(raw)
  const modules = Object.keys(seed)
  if (modules.length === 0) {
    throw new Error('示例数据为空，请检查 src/data/seed.json')
  }
  let total = 0
  for (const key of modules) {
    const rows = seed[key]
    if (!Array.isArray(rows)) {
      throw new Error(`模块 ${key} 的样板不是数组`)
    }
    const ids = new Set()
    for (const row of rows) {
      const id = Number(row.id)
      if (!Number.isInteger(id)) {
        throw new Error(`模块 ${key} 存在缺少合法 id 的样板记录`)
      }
      if (ids.has(id)) {
        throw new Error(`模块 ${key} 的样板数据里编号 ${id} 重复`)
      }
      ids.add(id)
      if (typeof row.status !== 'string' || !row.status) {
        throw new Error(`模块 ${key} 编号 ${id} 缺少状态`)
      }
      total += 1
    }
  }
  console.log(`示例数据已备齐：${modules.length} 个业务模块，共 ${total} 条样板记录`)
}

main().catch((error) => {
  console.error(`示例数据校验失败：${error.message}`)
  process.exitCode = 1
})
