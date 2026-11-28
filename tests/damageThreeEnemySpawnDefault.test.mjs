import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { normalizePath } from 'vite'
import { getEnemySpawnSkillDataHash } from '../src/lib/damageThreeEnemySpawnInputs.ts'
import { projectEnemyAttackQuartiles } from '../src/lib/damageThreeEnemyAttackQuartiles.ts'
import { parseEnemyAggregationIndex } from '../src/lib/enemyAggregationContract.ts'
import { enemySpawnDefaultPlugin } from '../scripts/enemySpawnDefaultPlugin.mjs'
import { getEnemySpawnCalculationHash } from '../scripts/lib/enemySpawnCalculationHash.mjs'

test('事前集計のスキル照合は並び順によらず、同数のスキルでも効果や育成データの変更を検出する', async () => {
  const skill = {
    operatorId: 'char_a', skillIndex: 1, skillId: 's1',
    operatorProfile: { phases: [{ attributesKeyFrames: [{ data: { atk: 500 } }] }] },
    skillLevels: [{ blackboard: [{ key: 'atk', value: 1 }] }],
  }
  const other = { ...skill, skillIndex: 2, skillId: 's2' }
  const hash = await getEnemySpawnSkillDataHash([skill, other])
  assert.equal(await getEnemySpawnSkillDataHash([other, structuredClone(skill)]), hash)
  assert.equal(await getEnemySpawnSkillDataHash([{ ...skill, classification: { conditions: ['manual'] } }, other]), hash)
  for (const category of [{ profession: 'MEDIC' }, { rarity: 5 }]) {
    assert.notEqual(await getEnemySpawnSkillDataHash([{ ...skill, ...category }, other]), hash)
  }
  assert.notEqual(await getEnemySpawnSkillDataHash([other, { ...skill,
    skillLevels: [{ blackboard: [{ key: 'atk', value: 2 }] }],
  }]), hash)
  const updatedProfile = { phases: [{ attributesKeyFrames: [{ data: { atk: 501 } }] }] }
  assert.notEqual(await getEnemySpawnSkillDataHash([skill, other].map(row => ({
    ...row, operatorProfile: updatedProfile,
  }))), hash)
})

test('同梱の事前集計が敵の集計版と整合し、全体・防御力帯の平均と票数が一致する', async () => {
  const [saved, rawIndex] = await Promise.all([
    '../src/data/damageThreeEnemySpawnDefault.json',
    '../public/data/enemy-aggregation/index.json',
  ].map(async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'))))
  const index = parseEnemyAggregationIndex(rawIndex)
  assert.equal(saved.aggregationVersion, index.currentVersionId)
  const version = index.versions.find(version => version.id === saved.aggregationVersion)
  assert.equal(saved.aggregationPayloadSha256, version?.payloadSha256)
  assert.match(saved.skillDataSha256, /^[0-9a-f]{64}$/)
  assert.equal(saved.calculationSha256, getEnemySpawnCalculationHash())
  const { rows: [overall, ...bands], professionRows, rarityRows, skillCount, stageCount, skillPhysicalRateBins, operatorVotes } = saved.statistics
  assert.ok(skillCount > 0 && stageCount >= skillCount)
  assert.equal(skillPhysicalRateBins.reduce((total, bin) => total + bin.count, 0), skillCount)
  assert.equal(bands.reduce((total, row) => total + row.spawnCount, 0), overall.spawnCount)
  assert.deepEqual(professionRows.map(row => row.key), ['PIONEER', 'WARRIOR', 'TANK', 'SNIPER', 'CASTER', 'MEDIC', 'SUPPORT', 'SPECIAL'])
  assert.deepEqual(rarityRows.map(row => row.key), ['6', '5', '4', '3', '2', '1'])
  for (const rows of [professionRows, rarityRows]) {
    assert.equal(rows.reduce((total, row) => total + row.skillCount, 0), skillCount)
    assert.equal(rows.reduce((total, row) => total + row.stageCount, 0), stageCount)
    for (const unit of ['skill', 'stage']) {
      for (const key of ['physicalWins', 'ties', 'artsWins', 'count']) {
        const total = rows.reduce((sum, row) => sum + row[unit][key], 0)
        assert.ok(Math.abs(total - overall[unit][key]) < 1e-6)
      }
    }
  }
  const skills = operatorVotes.flatMap(op => op.skills)
  assert.equal(new Set(operatorVotes.map(op => op.operatorId)).size, operatorVotes.length)
  assert.equal(new Set(skills.map(skill => skill.key)).size, skillCount)
  assert.equal(skills.length, skillCount)
  assert.ok(skills.every(skill => skill.votes.count > 0 && !('stages' in skill)))
  for (const key of ['physicalWins', 'ties', 'artsWins', 'count']) {
    for (const op of operatorVotes) {
      assert.equal(op.votes[key], op.skills.reduce((total, skill) => total + skill.votes[key], 0))
    }
    const sum = operatorVotes.reduce((total, op) => total + op.votes[key], 0)
    assert.ok(Math.abs(sum - overall.skill[key]) < 1e-6)
  }
  for (const unit of ['skill', 'stage']) {
    const votes = overall[unit]
    const sum = votes.physicalWins + votes.ties + votes.artsWins
    assert.ok(votes.count > 0 && Math.abs(sum - votes.count) < votes.count * 1e-8)
  }
  const means = bands.flatMap(row => row.meanDamage ? [row.meanDamage] : [])
  const count = means.reduce((total, mean) => total + mean.spawnCount, 0)
  assert.ok(count > 0)
  assert.equal(count, overall.meanDamage.spawnCount)
  for (const type of ['physical', 'arts']) {
    const weightedMean = means.reduce((total, mean) => total + mean[type] * mean.spawnCount, 0) / count
    assert.ok(Math.abs(weightedMean - overall.meanDamage[type]) < 1e-8)
  }
})

test('標準条件の四分位群と段階別の保存値から同じ集計を再現できる', async () => {
  const saved = JSON.parse(await readFile(new URL('../src/data/damageThreeEnemySpawnDefault.json', import.meta.url), 'utf8'))
  const { attackQuartiles, attackQuartileStages, stageCount } = saved.statistics
  assert.equal(attackQuartileStages.length, stageCount)
  assert.equal(new Set(attackQuartileStages.map(stage => stage.key)).size, stageCount)
  assert.deepEqual(projectEnemyAttackQuartiles(attackQuartileStages, attackQuartileStages), attackQuartiles)
  if (saved.aggregationVersion === 'v12' && saved.gameDataRevision.startsWith('270115d3')) {
    assert.deepEqual([attackQuartiles.includedStageCount, attackQuartiles.excludedStageCount], [786, 61])
    assert.deepEqual(attackQuartiles.rows.map(row =>
      [row.stageCount, Number(row.minAttack.toFixed(1)), row.maxAttack, Number((row.meanPhysicalRate * 100).toFixed(2))]), [
      [197, 90.9, 839, 35.94], [196, 844, 1364, 54.83], [196, 1364.4, 2104, 60.58], [197, 2111.4, 9497.6, 64.33],
    ])
  }
})

test('標準条件の外れ値4区分が対象敵の出現と得票を過不足なく分ける', async () => {
  const saved = JSON.parse(await readFile(new URL('../src/data/damageThreeEnemySpawnDefault.json', import.meta.url), 'utf8'))
  const { outliers, rows: [overall] } = saved.statistics
  const totals = ['physicalWins', 'ties', 'artsWins', 'count']
  for (const scope of ['all', 'eliteBoss']) {
    const [total, ...groups] = outliers[scope]
    assert.equal(groups.length, 4)
    assert.equal(groups.reduce((sum, group) => sum + group.spawnCount, 0), total.spawnCount)
    for (const row of [total, ...groups]) {
      assert.equal(row.spawnShare, total.spawnCount ? row.spawnCount / total.spawnCount : null)
    }
    for (const unit of ['skill', 'stage']) {
      for (const key of totals) {
        const sum = groups.reduce((sum, group) => sum + group[unit][key], 0)
        assert.ok(Math.abs(sum - total[unit][key]) < 1e-6)
        if (scope === 'all') assert.ok(Math.abs(total[unit][key] - overall[unit][key]) < 1e-6)
      }
    }
  }
  if (saved.aggregationVersion === 'v12') {
    assert.equal(outliers.defenseFence, 422.5)
    assert.equal(outliers.resistanceFence, 75)
    assert.deepEqual(outliers.all.map(row => row.spawnCount), [11409, 114, 1143, 0, 10152])
    assert.deepEqual(outliers.eliteBoss.map(row => row.spawnCount), [1756, 51, 924, 0, 781])
  }
})

test('外れ値内訳が欠けた事前集計は同じ計算ハッシュでも開発時に無効にし、公開ビルドを止める', async () => {
  const file = new URL('../src/data/damageThreeEnemySpawnDefault.json', import.meta.url)
  const root = fileURLToPath(new URL('../', import.meta.url))
  const id = normalizePath(fileURLToPath(file))
  const saved = JSON.parse(await readFile(file, 'utf8'))
  const plugin = enemySpawnDefaultPlugin()
  const warnings = []
  const context = { addWatchFile() {}, warn: message => warnings.push(message), error: message => { throw new Error(message) } }
  const transform = () => plugin.transform.call(context, JSON.stringify(saved), id)
  plugin.configResolved({ root, command: 'serve' })
  assert.equal(transform(), undefined)
  const { outliers } = saved.statistics
  delete saved.statistics.outliers
  assert.equal(JSON.parse(transform().code).skillDataSha256, '')
  assert.equal(warnings.length, 1)
  plugin.configResolved({ root, command: 'build' })
  saved.statistics.outliers = outliers
  delete outliers.eliteBoss[2].skill
  assert.throws(transform, /generate:dc3-enemy-default/)
})
