import { randomUUID } from 'node:crypto'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadSkillRecords } from '../src/lib/arknightsData.ts'
import { getOrderedDamageThreeAttributeEntries } from '../src/lib/damageCalculatorThreeAttributeComparison.ts'
import { getEnemySpawnSkillDataHash } from '../src/lib/damageThreeEnemySpawnInputs.ts'
import { buildEnemySpawnPopulation, summarizeEnemySpawnAdvantage, summarizeOperatorVotes } from '../src/lib/damageThreeEnemySpawnAdvantage.ts'
import { evaluateSkillRankStatisticsStage } from '../src/lib/damageThreeSkillRankStatistics.ts'
import { createEnemyAggregationClient, getEnemyMainStoryScope } from '../src/lib/enemyAggregationData.ts'
import { LOCAL_GAME_DATA_RUNTIME_FILES } from '../src/lib/localGameDataContract.ts'
import { readActiveLocalDataSnapshot } from './refreshLocalGameData.mjs'
import { getEnemySpawnCalculationHash } from './lib/enemySpawnCalculationHash.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const output = resolve(root, 'src/data/damageThreeEnemySpawnDefault.json')
const calculationSha256 = getEnemySpawnCalculationHash()

const game = await readActiveLocalDataSnapshot(root)
if (!game || !game.files.includes(LOCAL_GAME_DATA_RUNTIME_FILES.character)) {
  throw new Error('日本版のローカルデータを開発サーバーで更新してから再実行してください。')
}
const skills = await loadSkillRecords({
  readTable: async key => JSON.parse(await readFile(resolve(game.directory, LOCAL_GAME_DATA_RUNTIME_FILES[key]), 'utf8')),
})

// Read the checked-in archive through the same integrity checks and parser as the page.
const client = createEnemyAggregationClient({
  fetch: async path => new Response(await readFile(resolve(root, 'public', path.slice(1)))),
})
const index = await client.loadIndex()
const version = index.versions.find(v => v.id === index.currentVersionId)
const scope = getEnemyMainStoryScope(await client.loadVersion(version))
if (!scope.spawnCountsAvailable) throw new Error('メインストーリーの出現回数がありません。')
const population = buildEnemySpawnPopulation(scope.rows, scope.counts)
const entries = getOrderedDamageThreeAttributeEntries(skills)
console.log(`${version.id}のメインストーリーを集計します（防御力・術耐性 ${population.pairs.length}組）。`)
const stages = []
for (const entry of entries) {
  const cells = evaluateSkillRankStatisticsStage(entry, population.pairs, 'excludeAttributeEffects')
  if (cells) stages.push({ skill: entry.skill, stageLabel: entry.stageLabel, cells })
}
const { operators, ...statistics } = summarizeEnemySpawnAdvantage(population.pairs, stages)
const { rows, skillCount } = statistics
if (!population.spawnCount || !skillCount || !rows[0]?.meanDamage) throw new Error('標準条件の集計結果が空です。')
if (getEnemySpawnCalculationHash() !== calculationSha256) throw new Error('計算コードが変更されました。再実行してください。')
const snapshot = {
  aggregationVersion: version.id,
  aggregationPayloadSha256: version.payloadSha256,
  gameDataRevision: game.revision,
  skillDataSha256: await getEnemySpawnSkillDataHash(skills),
  calculationSha256,
  statistics: { ...statistics, operatorVotes: operators.map(summarizeOperatorVotes) },
}
const temporary = output + '.' + randomUUID() + '.tmp'
try {
  await writeFile(temporary, JSON.stringify(snapshot, null, 2) + '\n', { flag: 'wx' })
  await rename(temporary, output)
} finally {
  await rm(temporary, { force: true })
}
console.log(`${version.id}・${population.spawnCount.toLocaleString('ja-JP')}回・${skillCount}スキルの事前集計を保存しました。`)
