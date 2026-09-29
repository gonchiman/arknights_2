import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getGoldenglowTargetSwitchImageFilename,
  type GoldenglowTargetSwitchImageOptions,
  type GoldenglowTargetSwitchImageRequest,
} from '../src/lib/goldenglowTargetSwitchImageFilename.ts'

const request: GoldenglowTargetSwitchImageRequest = {
  build: { skillLevelLabel: '特化3', moduleType: 'X', moduleLevel: 3 },
  input: {
    skillIndex: 3, effectiveAttack: 703, attackInterval: 1.3, duration: 30,
    enemyDefense: 0, enemyHps: [500, 1000, 1500], enemyResistances: [0, 20, 40, 60, 80, 100],
    switchDelay: 0.1, retargetRemainingDrones: true, trials: 10000, seed: 20260908,
    model: {
      talentName: '電流暴走', talentDescription: '', damageType: 'ARTS',
      attackScale: 3, attackScalePercent: 300, nominalChancePercent: 10,
      prdStep: 0.015, prdMaxStack: 40, additionalDroneCount: 0, activeDroneCount: 3,
      resistanceIgnoreFixed: 15, droneInitialAttackScale: 0.2, droneInitialAttackScalePercent: 20,
      droneAttackScaleStep: 0.15, droneAttackScaleStepPercent: 15,
      droneMaxAttackScale: 1.1, droneMaxAttackScalePercent: 110, droneMaxStack: 6,
    },
  },
}
const options: GoldenglowTargetSwitchImageOptions = {
  chartType: 'bar', visibleResistances: request.input.enemyResistances,
  showDecimals: false, barPalette: 'blue', customColor: '#3e80af',
}
const filename = (changes: Partial<GoldenglowTargetSwitchImageOptions> = {}) => (
  getGoldenglowTargetSwitchImageFilename(request, { ...options, ...changes })
)

test('ターゲット切替１の画像名に計算済み条件と表示設定を読める形で含める', () => {
  assert.equal(filename(), 'GG_S3特化3_総ダメージ_切替1集合棒_MODX3_30秒_HP500-1500刻み500_術耐性0-100刻み20_小数0桁_配色青_切替0.1秒_残り浮遊切替あり_試行10000_抽選20260908_比率自動.png')
  assert.equal(filename(), filename())
  assert.doesNotMatch(filename(), /[a-f0-9]{64}/)
})

test('計算時のスキル・練度・MOD・時間・試行条件を区別する', () => {
  const variants: GoldenglowTargetSwitchImageRequest[] = [
    { ...request, build: { ...request.build, skillLevelLabel: '特化2' } },
    { ...request, build: { ...request.build, moduleType: 'Y' } },
    { ...request, build: { ...request.build, moduleLevel: 2 } },
    { ...request, build: { ...request.build, moduleType: null } },
    ...[
      { skillIndex: 2 }, { duration: 60 }, { switchDelay: 0.2 },
      { retargetRemainingDrones: false }, { trials: 20000 }, { seed: 20260909 },
      { enemyHps: [5000, 7500, 10000] },
    ].map((input) => ({ ...request, input: { ...request.input, ...input } })),
  ]
  const names = [filename(), ...variants.map((value) => getGoldenglowTargetSwitchImageFilename(value, options))]
  assert.equal(new Set(names).size, names.length)
})

test('グラフで表示している術耐性だけを表示順で命名する', () => {
  const name = filename({ visibleResistances: [100, 0, 40] })
  assert.match(name, /_術耐性100-0-40_/)
  assert.doesNotMatch(name, /術耐性0-100刻み20/)
})

test('非表示の配色設定や未装備時のMODレベルは名前を変えない', () => {
  assert.equal(filename(), filename({ customColor: '#ff0000' }))
  assert.equal(filename({ chartType: 'line' }), filename({ chartType: 'line', barPalette: 'green', customColor: '#ff0000' }))
  const noModule = { ...request, build: { ...request.build, moduleType: null } }
  assert.equal(getGoldenglowTargetSwitchImageFilename(noModule, options), getGoldenglowTargetSwitchImageFilename({
    ...noModule, build: { ...noModule.build, moduleLevel: 1 },
  }, options))
})

test('棒の有効な配色・グラフ形式・桁数を区別する', () => {
  const names = [filename(), filename({ barPalette: 'green' }), filename({ barPalette: 'custom' }),
    filename({ chartType: 'line' }), filename({ showDecimals: true })]
  assert.equal(new Set(names).size, names.length)
  assert.match(filename({ barPalette: 'custom', customColor: '#FF8800' }), /配色#ff8800/)
  assert.match(filename({ showDecimals: true }), /小数3桁/)
})
