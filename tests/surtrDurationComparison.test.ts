import test from 'node:test'
import assert from 'node:assert/strict'
import type { SkillRecord } from '../src/types/skill.ts'
import type { EnemyRecord } from '../src/types/enemy.ts'
import { createSurtrDurationCondition } from '../src/lib/surtrDurationParticipants.ts'
import { describeSurtrDurationCondition, getSurtrDurationConditionName, getSurtrDurationFilenameParts } from '../src/lib/surtrDurationComparison.ts'
import { getSurtrDurationImageFilename } from '../src/lib/surtrDurationImageFilename.ts'

const record = { skillName: 'ラグナロク', skillLevels: Array.from({ length: 10 }, () => ({ name: 'ラグナロク' })),
  operatorProfile: { phases: [{}, {}, { maxLevel: 90 }], modules: [] } } as unknown as SkillRecord
const skills = [{ operatorId: 'char_298_susuro', operatorName: 'ススーロ', skillId: 's2', skillIndex: 2, skillName: 'ディープヒーリング' }] as SkillRecord[]
const enemies = [{ id: 'mage', name: '術師' }] as EnemyRecord[]

test('automatic line names distinguish target, first hit, skill use and explicit custom labels', () => {
  const config = createSurtrDurationCondition(record)
  assert.equal(getSurtrDurationConditionName(record, config, enemies, skills), '未装備・外部作用なし')
  config.enemies = [{ id: 'enemy', enemyId: 'mage', count: 2, firstTime: 1.25 }]
  config.healers = [{ id: 'healer', operatorId: 'char_298_susuro', phaseIndex: 2, level: 70, trust: 100, potential: 1,
    skillId: 's2', skillLevelIndex: 9, firstTime: 2.85, skillStart: 5, skillFirstTime: 6.4 }]
  const name = getSurtrDurationConditionName(record, config, enemies, skills)
  assert.match(name, /術師×2（初回1.25秒）/)
  assert.match(name, /ススーロ S2（発動5秒）/)
  config.healers[0].skillStart = 10
  assert.notEqual(getSurtrDurationConditionName(record, config, enemies, skills), name)
  config.name = '  回復あり  '
  assert.equal(getSurtrDurationConditionName(record, config, enemies, skills), '回復あり')
})

test('export metadata describes the saved build and timing without mutating it', () => {
  const config = createSurtrDurationCondition(record)
  config.settings.trust = 80
  config.enemies = [{ id: 'enemy', enemyId: 'mage', count: 2, firstTime: 2 }]
  config.healers = [{ id: 'healer', operatorId: 'char_298_susuro', phaseIndex: 2, level: 70, trust: 100, potential: 1,
    skillId: 's2', skillLevelIndex: 9, firstTime: 2.85, skillStart: 5, skillFirstTime: 6.4 }]
  const original = structuredClone(config)
  const details = describeSurtrDurationCondition(record, config, 60, enemies, skills).join(' ')
  assert.match(details, /信頼80/)
  assert.match(details, /術師 2体・初回命中2秒/)
  assert.match(details, /スキル中初回6.4秒/)
  assert.match(details, /計算上限60秒/)
  assert.doesNotMatch(details, /被ダメージなし|外部回復なし/)
  const filenameSettings = { ...config.settings, skillLevelLabel: '特化3', modules: ['未装備'],
    comparisonConditions: getSurtrDurationFilenameParts(record, config, 60, enemies, skills) }
  const filename = getSurtrDurationImageFilename(filenameSettings)
  assert.match(filename, /術師2体初回2秒/)
  assert.match(filename, /ススーロS2発動5秒初回6.4/)
  assert.doesNotMatch(filename, /外部回復なし|被ダメージなし/)
  const changed = structuredClone(config)
  changed.healers[0].skillStart = 10
  assert.notEqual(filename, getSurtrDurationImageFilename({ ...filenameSettings,
    comparisonConditions: getSurtrDurationFilenameParts(record, changed, 60, enemies, skills) }))
  assert.deepEqual(config, original)
})
