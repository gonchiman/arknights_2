import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, extname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSync } from 'vite'

// Follow the actual calculator and aggregation imports, including data-driven recipes.
// Presentation changes do not require running the damage calculation again.
const entryPoints = [
  'src/lib/damageCalculatorThreeAttributeComparison.ts', 'src/lib/damageThreeSkillRankStatistics.ts',
  'src/lib/damageThreeEnemySpawnAdvantage.ts', 'src/lib/enemyAggregationData.ts',
]

export function getEnemySpawnCalculationHash(root = fileURLToPath(new URL('../../', import.meta.url)), watch = () => {}) {
  const sources = new Map()
  function collect(file) {
    const key = relative(root, file).replaceAll('\\', '/')
    if (sources.has(key)) return
    const source = readFileSync(file, 'utf8').replaceAll('\r\n', '\n')
    sources.set(key, createHash('sha256').update(source).digest('hex'))
    watch(file)
    if (extname(file) !== '.ts') return
    const parsed = parseSync(file, source)
    if (parsed.errors.length) throw new Error(`Cannot read calculator imports in ${key}`)
    for (const declaration of parsed.program.body) {
      const specifier = declaration.source?.value
      if (specifier?.startsWith('.')) collect(resolve(dirname(file), extname(specifier) ? specifier : specifier + '.ts'))
    }
  }
  for (const entry of entryPoints) collect(resolve(root, entry))
  return createHash('sha256').update(JSON.stringify([...sources].sort(([a], [b]) => a < b ? -1 : 1))).digest('hex')
}
