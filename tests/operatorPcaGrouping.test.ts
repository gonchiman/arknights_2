import test from 'node:test'
import assert from 'node:assert/strict'
import type { OperatorDatabaseRecord } from '../src/lib/operatorDatabase.ts'
import { getProfessionColor } from '../src/lib/operatorFilters.ts'
import { buildOperatorPcaGroups, getOperatorPcaGroupId } from '../src/lib/operatorPcaGrouping.ts'

function operator(id: string, overrides: Partial<OperatorDatabaseRecord> = {}): OperatorDatabaseRecord {
  return {
    operatorId: id, name: id, nameInitial: 'OTHER', affiliation: null, rarity: 6,
    profession: 'WARRIOR', professionLabel: '前衛', subProfessionId: 'artsfghter', subProfessionName: '術戦士',
    stats: { maxHp: 1000, attack: 300, defense: 200, magicResistance: 10, deploymentCost: 20,
      blockCount: 1, redeployTime: 70, attackSpeed: 100, attackInterval: 1.25 },
    statsCondition: '', traitDescription: '', potentials: [], talents: [], skills: [], modules: [],
    ...overrides,
  }
}

test('職業分類は既存の職業順・配色・形状を維持する', () => {
  const groups = buildOperatorPcaGroups([
    operator('special', { profession: 'SPECIAL' }),
    operator('warrior'),
    operator('support', { profession: 'SUPPORT' }),
    operator('pioneer', { profession: 'PIONEER' }),
    operator('warrior-2'),
  ], 'profession')
  assert.deepEqual(groups.map(group => group.label), ['先鋒', '前衛', '補助', '特殊'])
  for (const group of groups) assert.equal(group.color, getProfessionColor(group.id.slice('profession:'.length))?.main)
  assert.deepEqual(groups.map(group => group.shape), ['circle', 'circle', 'square', 'square'])
})

test('レアリティは職業・職分によらずまとめ、数値順で表示する', () => {
  const six = operator('six')
  const groups = buildOperatorPcaGroups([
    six,
    operator('three', { rarity: 3 }),
    operator('six-special', { profession: 'SPECIAL', subProfessionId: 'executor', rarity: 6 }),
    operator('five', { rarity: 5 }),
  ], 'rarity')
  assert.deepEqual(groups.map(group => group.label), ['★3', '★5', '★6'])
  assert.equal(new Set(groups.map(group => group.color)).size, 3)
  assert.deepEqual(buildOperatorPcaGroups([six], 'rarity'), [groups[2]])
})

test('職分は同名でも異なる職業・IDを統合せず、順序や絞り込みで色を変えない', () => {
  const rows = [
    operator('arts'),
    operator('arts-2'),
    operator('guard', { subProfessionId: 'lord', subProfessionName: '領主' }),
    operator('same-id-other-profession', { profession: 'SPECIAL' }),
    operator('same-name-other-id', { subProfessionId: 'other-branch' }),
  ]
  const before = JSON.stringify(rows)
  const groups = buildOperatorPcaGroups(rows, 'subProfession')
  assert.equal(groups.length, 4)
  assert.deepEqual(buildOperatorPcaGroups([...rows].reverse(), 'subProfession'), groups)
  assert.equal(new Set(groups.map(group => group.color)).size, groups.length)
  for (const row of rows) {
    const expected = groups.find(group => group.id === getOperatorPcaGroupId(row, 'subProfession'))
    assert.deepEqual(buildOperatorPcaGroups([row], 'subProfession'), [expected])
  }
  assert.equal(JSON.stringify(rows), before)
})

test('欠損した職分や未知の職業・レアリティにも識別できる凡例を作る', () => {
  const empty = operator('empty', { profession: '', subProfessionId: '', subProfessionName: '', rarity: NaN })
  const unknown = operator('unknown', { profession: 'NEW', subProfessionId: 'new-branch', subProfessionName: '' })
  assert.equal(buildOperatorPcaGroups([empty], 'rarity')[0].label, '不明')
  assert.equal(buildOperatorPcaGroups([empty], 'profession')[0].color, 'var(--text-muted)')
  assert.equal(buildOperatorPcaGroups([unknown], 'subProfession')[0].label, 'new-branch')
  assert.equal(buildOperatorPcaGroups([empty], 'subProfession')[0].label, '不明')
  assert.deepEqual(buildOperatorPcaGroups([], 'subProfession'), [])
})
