import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { getEnemySpawnSkillDataHash } from '../src/lib/damageThreeEnemySpawnInputs.ts'
import { parseEnemyAggregationIndex } from '../src/lib/enemyAggregationContract.ts'
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
