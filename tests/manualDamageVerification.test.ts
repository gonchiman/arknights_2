import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateManualDamage,
  createEmptyManualDamageInputs,
  type ManualDamageInputs,
  type ManualDamageResult,
} from '../src/lib/manualDamageVerification.ts'

function entered(overrides: Partial<ManualDamageInputs> = {}): ManualDamageInputs {
  return {
    base: '672', trust: '100', module: '60', skill: '330', attackRound: 'floor',
    res: '50', ignore: '20', modIgnore: '6', minimum: '5', multiplier: '1',
    damageRound: 'none', interval: '1.25', speed: '100', speedAdd: '8',
    ...overrides,
  }
}

function simple(overrides: Partial<ManualDamageInputs> = {}): ManualDamageInputs {
  return entered({
    base: '1', trust: '0', module: '0', skill: '0', attackRound: 'none',
    res: '0', ignore: '0', modIgnore: '0', minimum: '0', multiplier: '1',
    damageRound: 'none', interval: '1', speed: '100', speedAdd: '0',
    ...overrides,
  })
}

function stage(result: ManualDamageResult, id: string) {
  const found = result.stages.find(value => value.id === id)
  assert.ok(found)
  return found.steps
}

test('初期値は数値も端数処理もすべて空欄で、結果を補完しない', () => {
  const inputs = createEmptyManualDamageInputs()
  assert.equal(Object.keys(inputs).length, 14)
  assert.ok(Object.values(inputs).every(value => value === ''))
  const result = calculateManualDamage(inputs)
  assert.deepEqual(result.errors, {})
  assert.equal(result.damage, null)
  assert.equal(result.dps, null)
  assert.deepEqual(result.stages.map(value => value.id), ['base', 'attack', 'resistance', 'damage', 'interval'])
  assert.deepEqual(result.stages.map(value => value.steps.length), [1, 4, 5, 6, 4])
  assert.ok(result.stages.flatMap(value => value.steps).every(value => value.status === 'pending' && value.expression === null))
})

test('手入力例の全段階と、丸めていない攻撃間隔を使うDPSを厳密に計算する', () => {
  const result = calculateManualDamage(entered())
  assert.deepEqual(result.errors, {})
  assert.equal(result.damage, '2718.52')
  assert.equal(result.dps, '2348.80128')
  assert.deepEqual(result.stages.flatMap(value => value.steps).map(value => value.expression), [
    '672 ＋ 100 ＋ 60 ＝ 832',
    '330 ÷ 100 ＝ 3.3',
    '1 ＋ 3.3 ＝ 4.3',
    '832 × 4.3 ＝ 3577.6',
    '小数点以下を切り捨て(3577.6) ＝ 3577',
    '20 ＋ 6 ＝ 26',
    '50 − 26 ＝ 24',
    '0 と 24 の大きい方 ＝ 24',
    '24 ÷ 100 ＝ 0.24',
    '1 − 0.24 ＝ 0.76',
    '3577 × 0.76 ＝ 2718.52',
    '5 ÷ 100 ＝ 0.05',
    '3577 × 0.05 ＝ 178.85',
    '2718.52 と 178.85 の大きい方 ＝ 2718.52',
    '2718.52 × 1 ＝ 2718.52',
    '丸めない(2718.52) ＝ 2718.52',
    '100 ＋ 8 ＝ 108',
    '108 ÷ 100 ＝ 1.08',
    '1.25 ÷ 1.08 ＝ 125 / 108',
    '2718.52 ÷ (1.25 ÷ 1.08) ＝ 2348.80128',
  ])
  assert.ok(result.stages.flatMap(value => value.steps).every(value => value.status === 'ready'))
})

test('空欄と0を区別し、未入力の項目を使わない計算だけ進める', () => {
  const inputs = { ...createEmptyManualDamageInputs(), base: '0', skill: '0' }
  const result = calculateManualDamage(inputs)
  assert.equal(stage(result, 'base')[0].status, 'pending')
  assert.deepEqual(stage(result, 'attack').map(value => value.status), ['ready', 'ready', 'pending', 'pending'])
  assert.equal(stage(result, 'attack')[0].expression, '0 ÷ 100 ＝ 0')
  assert.equal(stage(result, 'attack')[1].expression, '1 ＋ 0 ＝ 1')
  assert.equal(result.damage, null)
  assert.equal(calculateManualDamage(simple({ base: '0' })).damage, '0')
  assert.equal(calculateManualDamage(simple({ base: '0' })).dps, '0')
})

test('1項目を消すと依存する結果だけ未計算へ戻る', () => {
  const result = calculateManualDamage(entered({ trust: '' }))
  assert.equal(result.damage, null)
  assert.equal(result.dps, null)
  assert.equal(stage(result, 'base')[0].status, 'pending')
  assert.ok(stage(result, 'resistance').every(value => value.status === 'ready'))
  assert.deepEqual(stage(result, 'interval').map(value => value.status), ['ready', 'ready', 'ready', 'pending'])
})

test('端数処理を選ぶまで攻撃力または一撃のダメージを確定しない', () => {
  const withoutAttackRound = calculateManualDamage(entered({ attackRound: '' }))
  assert.equal(stage(withoutAttackRound, 'attack')[2].status, 'ready')
  assert.equal(stage(withoutAttackRound, 'attack')[3].status, 'pending')
  assert.equal(withoutAttackRound.damage, null)
  const withoutDamageRound = calculateManualDamage(entered({ damageRound: '' }))
  assert.equal(stage(withoutDamageRound, 'damage')[4].status, 'ready')
  assert.equal(stage(withoutDamageRound, 'damage')[5].status, 'pending')
  assert.equal(withoutDamageRound.damage, null)
  assert.equal(withoutDamageRound.dps, null)
})

test('高い術耐性では明示した最低保証を採用してから倍率を掛ける', () => {
  const result = calculateManualDamage(simple({ base: '200', res: '99', minimum: '5', multiplier: '1.5' }))
  assert.equal(result.damage, '15')
  assert.equal(stage(result, 'damage')[0].expression, '200 × 0.01 ＝ 2')
  assert.equal(stage(result, 'damage')[2].expression, '200 × 0.05 ＝ 10')
  assert.equal(stage(result, 'damage')[3].expression, '2 と 10 の大きい方 ＝ 10')
  assert.equal(calculateManualDamage(simple({ res: '100', minimum: '100' })).damage, '1')
})

test('術耐性の下限0を計算過程に表示し、無視する値を暗黙に制限しない', () => {
  const result = calculateManualDamage(simple({ base: '200', res: '10', ignore: '20', modIgnore: '6' }))
  assert.equal(result.damage, '200')
  assert.equal(stage(result, 'resistance')[1].expression, '10 − 26 ＝ -16')
  assert.equal(stage(result, 'resistance')[2].expression, '0 と -16 の大きい方 ＝ 0')
})

test('小数の積が整数になる境界で浮動小数点誤差による切り捨てを起こさない', () => {
  const result = calculateManualDamage(simple({ base: '0.29', skill: '9900', attackRound: 'floor' }))
  assert.equal(result.damage, '29')
  assert.equal(stage(result, 'attack')[2].expression, '0.29 × 100 ＝ 29')
  assert.equal(calculateManualDamage(simple({ base: '0.29', multiplier: '100', damageRound: 'floor' })).damage, '29')
})

test('攻撃力とダメージの丸めをそれぞれ指定した位置で実行する', () => {
  assert.equal(calculateManualDamage(simple({ base: '100.5', attackRound: 'floor' })).damage, '100')
  assert.equal(calculateManualDamage(simple({ base: '100.5', attackRound: 'round' })).damage, '101')
  assert.equal(calculateManualDamage(simple({ base: '100.5', attackRound: 'none' })).damage, '100.5')
  assert.equal(calculateManualDamage(simple({ base: '1.005', skill: '9900', attackRound: 'round' })).damage, '101')
  assert.equal(calculateManualDamage(simple({ base: '1.005', multiplier: '100', damageRound: 'round' })).damage, '101')
  assert.equal(calculateManualDamage(simple({ base: '100.49', damageRound: 'round' })).damage, '100')
})

test('有限小数はそのまま表示し、循環小数は正確な分数で表示する', () => {
  const result = calculateManualDamage(simple({ interval: '3' }))
  assert.equal(result.dps, '1 / 3')
  assert.equal(stage(result, 'interval')[3].expression, '1 ÷ (3 ÷ 1) ＝ 1 / 3')
  assert.equal(calculateManualDamage(simple({ base: '9007199254740993.123456789' })).damage, '9007199254740993.123456789')
  assert.equal(calculateManualDamage(simple({ base: '0.000000000001' })).damage, '0.000000000001')
})

test('指数表記と小数点から始まる数値も厳密に読み取る', () => {
  assert.equal(calculateManualDamage(simple({ base: '5.8e-1', skill: '9.9e3', attackRound: 'floor' })).damage, '58')
  assert.equal(calculateManualDamage(simple({ base: '.5', multiplier: '+2.' })).damage, '1')
})

test('0の倍率を1に補完せず、攻撃速度にも自動の上限・下限を適用しない', () => {
  assert.equal(calculateManualDamage(simple({ multiplier: '0' })).damage, '0')
  assert.equal(calculateManualDamage(simple({ speed: '1' })).dps, '0.01')
  assert.equal(calculateManualDamage(simple({ speed: '1000' })).dps, '10')
})

test('負数・非数・不正な文字列をエラーにして依存する計算を止める', () => {
  for (const base of ['-1', 'NaN', 'Infinity', '-Infinity', '12abc', '0x10', '1,000', '1e999999']) {
    const result = calculateManualDamage(entered({ base }))
    assert.ok(result.errors.base, base)
    assert.equal(result.damage, null, base)
    assert.equal(result.dps, null, base)
    assert.equal(stage(result, 'base')[0].status, 'invalid', base)
    assert.equal(stage(result, 'attack')[2].status, 'invalid', base)
    assert.ok(stage(result, 'resistance').every(value => value.status === 'ready'), base)
  }
  const whitespace = calculateManualDamage(entered({ base: '  ' }))
  assert.equal(whitespace.errors.base, undefined)
  assert.equal(stage(whitespace, 'base')[0].status, 'pending')
})

test('術耐性と最低保証の範囲、およびゼロ除算になる間隔・合計速度を検証する', () => {
  for (const field of ['res', 'minimum'] as const) {
    assert.ok(calculateManualDamage(entered({ [field]: '100.001' })).errors[field])
    assert.ok(calculateManualDamage(entered({ [field]: '-0.001' })).errors[field])
  }
  const noInterval = calculateManualDamage(entered({ interval: '0' }))
  assert.ok(noInterval.errors.interval)
  assert.equal(noInterval.damage, '2718.52')
  assert.equal(noInterval.dps, null)
  const noSpeed = calculateManualDamage(entered({ speed: '0', speedAdd: '0' }))
  assert.ok(noSpeed.errors.speed)
  assert.ok(noSpeed.errors.speedAdd)
  assert.equal(noSpeed.damage, '2718.52')
  assert.equal(noSpeed.dps, null)
  assert.ok(stage(noSpeed, 'interval').every(value => value.status === 'invalid'))
  assert.equal(calculateManualDamage(entered({ speed: '0', speedAdd: '' })).errors.speed, undefined)
})

test('不明な端数処理は暗黙に採用しない', () => {
  for (const rule of ['ceil', 'toString', 'constructor', 'FLOOR']) {
    const result = calculateManualDamage(entered({ attackRound: rule }))
    assert.ok(result.errors.attackRound)
    assert.equal(result.damage, null)
    assert.equal(stage(result, 'attack')[3].status, 'invalid')
  }
  assert.ok(calculateManualDamage(entered({ damageRound: 'ceil' })).errors.damageRound)
})

test('入力を変更せず、空欄の初期値を呼び出しごとに独立して返す', () => {
  const inputs = Object.freeze(entered())
  const snapshot = { ...inputs }
  calculateManualDamage(inputs)
  assert.deepEqual(inputs, snapshot)
  const first = createEmptyManualDamageInputs()
  first.base = '100'
  assert.equal(createEmptyManualDamageInputs().base, '')
})
