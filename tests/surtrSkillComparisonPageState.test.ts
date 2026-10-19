import assert from 'node:assert/strict'
import test from 'node:test'
import { parseSurtrSkillComparisonPageState, readSurtrSkillComparisonPageState, writeSurtrSkillComparisonPageState, SURTR_SKILL_COMPARISON_STATE_KEY } from '../src/lib/surtrSkillComparisonPageState.ts'

test('S2/S3 inputs survive reload independently of the S3 graph page', () => {
  const values = new Map<string, string>([['arknights-surtr-dps-page-state-v1', JSON.stringify({ settings: { potential: 6 } })]])
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
  assert.equal(readSurtrSkillComparisonPageState(storage).settings.potential, 1)
  const state = parseSurtrSkillComparisonPageState({ settings: { level: 60, trust: 70, potential: 4, skillLevelIndex: 6, blocking: true, remnantActive: true },
    s2LevelIndex: 8, enemyCount: 3, excluded: [''], moduleLevels: { uniequip_002_surtr: [1, 2] }, barStep: 7, resistanceRange: { min: 10, max: 80 },
    externalBuffs: { attackPercent: 150, attackAddition: 80.5, attackSpeed: 50 } })
  writeSurtrSkillComparisonPageState(state, storage)
  assert.deepEqual(readSurtrSkillComparisonPageState(storage), state)
  assert.ok(values.has(SURTR_SKILL_COMPARISON_STATE_KEY))
})

test('invalid saved enemy count, rank, range and custom step do not enter calculations', () => {
  for (const enemyCount of [0, 5, 1.5, '2', null]) {
    const state = parseSurtrSkillComparisonPageState({ enemyCount, s2LevelIndex: 100, barStep: 0, resistanceRange: { min: 50, max: 20 } })
    assert.equal(state.enemyCount, 1)
    assert.equal(state.s2LevelIndex, 9)
    assert.equal(state.barStep, 20)
    assert.deepEqual(state.resistanceRange, { min: 0, max: 100 })
  }
})

test('restricted or corrupt storage keeps S2/S3 calculation available', () => {
  const defaults = parseSurtrSkillComparisonPageState(null)
  assert.deepEqual(readSurtrSkillComparisonPageState({ getItem: () => '{broken' }), defaults)
  assert.deepEqual(readSurtrSkillComparisonPageState({ getItem: () => { throw new Error('blocked') } }), defaults)
  assert.doesNotThrow(() => writeSurtrSkillComparisonPageState(defaults, { setItem: () => { throw new Error('blocked') } }))
})

test('older saved conditions without external buffs retain their inputs and default each buff to zero', () => {
  const old = { settings: { potential: 5 }, s2LevelIndex: 6, enemyCount: 2 }
  const result = parseSurtrSkillComparisonPageState(old)
  assert.equal(result.settings.potential, 5)
  assert.equal(result.s2LevelIndex, 6)
  assert.equal(result.enemyCount, 2)
  assert.deepEqual(result.externalBuffs, { attackPercent: 0, attackAddition: 0, attackSpeed: 0 })
})

test('corrupt saved buff components fall back independently without discarding other valid conditions', () => {
  for (const invalid of [null, '10', -0.01, NaN, Infinity, -Infinity]) {
    const result = parseSurtrSkillComparisonPageState({ enemyCount: 3,
      externalBuffs: { attackPercent: invalid, attackAddition: 12.5, attackSpeed: 70 } })
    assert.equal(result.enemyCount, 3)
    assert.deepEqual(result.externalBuffs, { attackPercent: 0, attackAddition: 12.5, attackSpeed: 70 })
  }
  for (const externalBuffs of [null, [], '150', {}]) {
    assert.deepEqual(parseSurtrSkillComparisonPageState({ externalBuffs }).externalBuffs,
      { attackPercent: 0, attackAddition: 0, attackSpeed: 0 })
  }
  const result = parseSurtrSkillComparisonPageState({
    externalBuffs: { attackPercent: 500.5, attackAddition: Number.MAX_VALUE, attackSpeed: 75.25 },
  })
  assert.deepEqual(result.externalBuffs, { attackPercent: 500.5, attackAddition: Number.MAX_VALUE, attackSpeed: 75.25 })
})
