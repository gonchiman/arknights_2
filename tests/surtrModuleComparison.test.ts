import assert from 'node:assert/strict'
import test from 'node:test'
import { getSurtrModuleChoices, getSelectedSurtrModuleStages } from '../src/lib/surtrModuleComparison.ts'
import { createDefaultSurtrDpsPageState, parseSurtrDpsPageState } from '../src/lib/surtrDpsPageState.ts'
import type { OperatorCombatProfile, RawOperatorModule } from '../src/types/skill.ts'

test('共有MOD候補は未装備と標準のX/Yを既存の順番・実在Lv・解放条件で返す', () => {
  const profile = createProfile()
  profile.modules!.splice(1, 0, { type: 'INITIAL', uniEquipName: '記章', typeName2: 'X' })
  profile.modules!.push({ type: 'ADVANCED', uniEquipId: 'z', uniEquipName: '対象外', typeName2: 'Z' })
  profile.modules!.push({ type: 'ADVANCED', uniEquipId: 'unnamed', typeName2: 'X' })
  const choices = getSurtrModuleChoices(profile, 60)
  assert.deepEqual(choices, [
    { id: '', type: null, label: '未装備', levels: [], unlocked: true },
    { id: 'surtr-x', type: 'X', label: 'MOD X', levels: [1, 2, 3], unlocked: true },
    { id: 'surtr-y', type: 'Y', label: 'MOD Y', levels: [1, 2, 3], unlocked: false },
  ])
  assert.deepEqual(getSurtrModuleChoices(profile, 80).map(choice => choice.unlocked), [true, true, true])
})

test('既存S3の初期状態は未装備と各MODの最大Lvを同じID・ラベル・線種で選ぶ', () => {
  const state = createDefaultSurtrDpsPageState()
  const stages = getSelectedSurtrModuleStages(getSurtrModuleChoices(createProfile(), state.settings.level), state.excluded, state.moduleLevels)
  assert.deepEqual(stages.map(({ moduleId, id, label, level, lineStyle }) => ({ moduleId, id, label, level, lineStyle })), [
    { moduleId: '', id: 'none', label: '未装備', level: 0, lineStyle: 'solid' },
    { moduleId: 'surtr-x', id: 'surtr-x:lv3', label: 'MOD X Lv.3', level: 3, lineStyle: 'solid' },
    { moduleId: 'surtr-y', id: 'surtr-y:lv3', label: 'MOD Y Lv.3', level: 3, lineStyle: 'solid' },
  ])
  const profile = createProfile()
  profile.modules![0].phases = profile.modules![0].phases!.filter(phase => phase.equipLevel !== 3)
  assert.deepEqual(getSelectedSurtrModuleStages(getSurtrModuleChoices(profile, 90)).map(stage => stage.level), [0, 2, 3])
})

test('複数段階はMOD順・取得済みLv順に展開し、重複や存在しない段階を採用しない', () => {
  const stages = getSelectedSurtrModuleStages(getSurtrModuleChoices(createProfile(), 90), [], {
    'surtr-y': [3, 1], 'surtr-x': [3, 1, 2, 1, -1, 1.5, 99, Number.NaN], unknown: [1],
  })
  assert.deepEqual(stages.map(stage => [stage.id, stage.lineStyle]), [
    ['none', 'solid'], ['surtr-x:lv1', 'dotted'], ['surtr-x:lv2', 'dashed'], ['surtr-x:lv3', 'solid'],
    ['surtr-y:lv1', 'dotted'], ['surtr-y:lv3', 'solid'],
  ])
  assert.equal(new Set(stages.map(stage => stage.id)).size, stages.length)
})

test('モジュール除外と明示的な空配列を保持し、未装備も独立して除外できる', () => {
  const choices = getSurtrModuleChoices(createProfile(), 90)
  assert.deepEqual(getSelectedSurtrModuleStages(choices, ['surtr-x'], { 'surtr-x': [1, 2, 3] }).map(stage => stage.id),
    ['none', 'surtr-y:lv3'])
  assert.deepEqual(getSelectedSurtrModuleStages(choices, [''], { 'surtr-x': [], 'surtr-y': [2] }).map(stage => stage.id),
    ['surtr-y:lv2'])
  assert.deepEqual(getSelectedSurtrModuleStages(choices, ['', 'surtr-y'], { 'surtr-x': [] }), [])
  assert.deepEqual(getSelectedSurtrModuleStages(getSurtrModuleChoices(undefined, 90)).map(stage => stage.id), ['none'])
  assert.deepEqual(getSelectedSurtrModuleStages(getSurtrModuleChoices(null, 90), ['']), [])
})

test('Lv未解放では保存済み段階を表示せず、解放後に同じ段階選択を復元する', () => {
  const profile = createProfile()
  const selection = { 'surtr-x': [1, 3], 'surtr-y': [2] }
  assert.deepEqual(getSelectedSurtrModuleStages(getSurtrModuleChoices(profile, 59), [], selection).map(stage => stage.id), ['none'])
  assert.deepEqual(getSelectedSurtrModuleStages(getSurtrModuleChoices(profile, 60), [], selection).map(stage => stage.id),
    ['none', 'surtr-x:lv1', 'surtr-x:lv3'])
  assert.deepEqual(getSelectedSurtrModuleStages(getSurtrModuleChoices(profile, 80), [], selection).map(stage => stage.id),
    ['none', 'surtr-x:lv1', 'surtr-x:lv3', 'surtr-y:lv2'])
  assert.deepEqual(selection, { 'surtr-x': [1, 3], 'surtr-y': [2] })
})

test('段階の濃淡と線種は選択数や順番によらずS3共通配色のままになる', () => {
  const choices = getSurtrModuleChoices(createProfile(), 90)
  const selection = { 'surtr-x': [1, 2, 3], 'surtr-y': [1, 2, 3] }
  const stages = getSelectedSurtrModuleStages(choices, [], selection)
  assert.deepEqual(stages.map(stage => stage.color), [
    '#737982', '#82a6bd', '#608daa', '#3f7699', '#cea682', '#c18d5f', '#b4763e',
  ])
  const reversed = getSelectedSurtrModuleStages([...choices].reverse(), [], selection)
  assert.deepEqual(reversed.map(stage => stage.color), reversed.map(stage => stages.find(original => original.id === stage.id)!.color))
  for (const stage of stages) {
    const excluded = choices.filter(choice => choice.id !== stage.moduleId).map(choice => choice.id)
    const alone = getSelectedSurtrModuleStages(choices, excluded, { [stage.moduleId]: [stage.level] })
    assert.equal(alone.length, 1)
    assert.deepEqual(alone[0], stage)
  }
})

test('S3の保存状態から復元した単一Lv・複数Lv・除外をそのまま使える', () => {
  const state = parseSurtrDpsPageState({ moduleLevels: { 'surtr-x': 1, 'surtr-y': [3, 1] }, excluded: [''] })
  const stages = getSelectedSurtrModuleStages(getSurtrModuleChoices(createProfile(), 90), state.excluded, state.moduleLevels)
  assert.deepEqual(stages.map(stage => stage.id), ['surtr-x:lv1', 'surtr-y:lv1', 'surtr-y:lv3'])
  const emptyState = parseSurtrDpsPageState({ moduleLevels: { 'surtr-x': [], 'surtr-y': [] }, excluded: [''] })
  assert.deepEqual(getSelectedSurtrModuleStages(getSurtrModuleChoices(createProfile(), 90), emptyState.excluded, emptyState.moduleLevels), [])
})

test('候補生成と段階展開は元のプロファイル・候補・保存状態を書き換えない', () => {
  const profile = createProfile()
  const original = structuredClone(profile)
  const choices = getSurtrModuleChoices(profile, 90)
  const originalChoices = structuredClone(choices)
  const moduleLevels = { 'surtr-x': [3, 1], 'surtr-y': [2] }
  const excluded = ['']
  getSelectedSurtrModuleStages(choices, excluded, moduleLevels)
  assert.deepEqual(profile, original)
  assert.deepEqual(choices, originalChoices)
  assert.deepEqual(moduleLevels, { 'surtr-x': [3, 1], 'surtr-y': [2] })
  assert.deepEqual(excluded, [''])
})

function createProfile(): OperatorCombatProfile {
  const module = (type: 'X' | 'Y', unlockLevel: number): RawOperatorModule => ({
    type: 'ADVANCED', uniEquipId: `surtr-${type.toLowerCase()}`, uniEquipName: `MOD ${type}`,
    typeName2: type === 'X' ? ' x ' : 'y', unlockEvolvePhase: 'PHASE_2', unlockLevel,
    phases: [3, 1, 2].map(equipLevel => ({ equipLevel, attributeBlackboard: { atk: equipLevel * 10 } })),
  })
  return { phases: [], favorKeyFrames: [], modules: [module('X', 60), module('Y', 80)] }
}
