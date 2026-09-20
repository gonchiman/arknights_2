import test from 'node:test'
import assert from 'node:assert/strict'
import { removePotentialBonusAnnotations, splitOperatorEffectChanges } from '../src/lib/operatorEffectHighlights.ts'

const explosion = (value: number) => `攻撃力の${value}%の術ダメージを与える`
const resistance = (value: number) => `敵の術耐性を${value}無視する`
const changed = (descriptions: Parameters<typeof splitOperatorEffectChanges>[0]) => splitOperatorEffectChanges(descriptions).filter((part) => part.source)

test('GG explosion identifies MOD, potential, and their overlap from four builds', () => {
  for (const [moduleValue, potentialValue, currentValue, source] of [
    [360, 300, 360, 'module'],
    [300, 315, 315, 'potential'],
    [360, 315, 375, 'both'],
  ] as const) {
    assert.deepEqual(changed({
      base: explosion(300), withoutModule: explosion(potentialValue), withoutPotential: explosion(moduleValue), current: explosion(currentValue),
    }), [{ text: `${currentValue}%`, source, values: {
      base: '300%', withoutModule: `${potentialValue}%`, withoutPotential: `${moduleValue}%`, current: `${currentValue}%`,
    } }])
  }
})

test('GG resistance changes are potential-only for X and overlap for Y', () => {
  for (const [moduleValue, currentValue, source] of [[15, 18, 'potential'], [20, 23, 'both']] as const) {
    assert.deepEqual(changed({ base: resistance(15), withoutModule: resistance(18), withoutPotential: resistance(moduleValue), current: resistance(currentValue) }), [
      { text: `${currentValue}`, source, values: { base: '15', withoutModule: '18', withoutPotential: `${moduleValue}`, current: `${currentValue}` } },
    ])
  }
})

test('unchanged descriptions and empty text have no highlights', () => {
  assert.deepEqual(splitOperatorEffectChanges({ base: '未変更', withoutModule: '未変更', withoutPotential: '未変更', current: '未変更' }), [{ text: '未変更', source: null }])
  assert.deepEqual(splitOperatorEffectChanges({ base: '', withoutModule: '', withoutPotential: '', current: '' }), [])
})

test('MOD additions remain contiguous and do not claim an unrelated numeric correspondence', () => {
  const base = '浮遊ユニットを操作し、敵に術ダメージを与える。'
  const addition = '浮遊ユニットの初期攻撃力が上昇し、'
  const current = `浮遊ユニットを操作し、${addition}敵に術ダメージを与える。`
  assert.deepEqual(changed({ base, withoutModule: base, withoutPotential: current, current }), [{ text: addition, source: 'module' }])
})

test('independent changes preserve prose, Unicode characters, and exact text', () => {
  const base = '⚡𠮷野：攻撃＋１０．５％、防御２０。'
  const withoutModule = '⚡𠮷野：攻撃＋１０．５％、防御２３。'
  const withoutPotential = '⚡𠮷野：攻撃＋１２．５％、防御２０。'
  const current = '⚡𠮷野：攻撃＋１２．５％、防御２３。'
  const result = splitOperatorEffectChanges({ base, withoutModule, withoutPotential, current })
  assert.equal(result.map((part) => part.text).join(''), current)
  assert.deepEqual(result.filter((part) => part.source).map(({ text, source }) => ({ text, source })), [
    { text: '＋１２．５％', source: 'module' }, { text: '２３', source: 'potential' },
  ])
})

test('removes GG potential annotations from all four relevant descriptions', () => {
  for (const [before, after, expected] of [
    [explosion(300), '攻撃力の315%（+15%）の術ダメージを与える', explosion(315)],
    [explosion(360), '攻撃力の375%(+15%)の術ダメージを与える', explosion(375)],
    [resistance(15), '敵の術耐性を18（+3）無視する', resistance(18)],
    [resistance(20), '敵の術耐性を23(+3)無視する', resistance(23)],
  ]) assert.equal(removePotentialBonusAnnotations(after, before), expected)
})

test('removes verifiable signed decimal and full-width annotations without losing Unicode prose', () => {
  assert.equal(removePotentialBonusAnnotations('⚡＋１２．５％（＋２．５％）上昇', '⚡＋１０％上昇'), '⚡＋１２．５％上昇')
  assert.equal(removePotentialBonusAnnotations('再配置時間−５．５（−１．５）秒', '再配置時間−４秒'), '再配置時間−５．５秒')
  assert.equal(removePotentialBonusAnnotations('効果0.3(+0.1)', '効果0.2'), '効果0.3')
})

test('preserves gameplay parentheses, unsigned values, malformed annotations, and unrelated signed values', () => {
  for (const after of ['攻撃力315%（最大15%）', '攻撃力315%（15%）', '攻撃力315%（+15%追加）', '攻撃力315%（+15%)', '攻撃力315%(+15%）', '攻撃力315%(+20%)', '攻撃力315%(+15)', '攻撃力315% (+15%)']) {
    assert.equal(removePotentialBonusAnnotations(after, '攻撃力300%'), after)
  }
  const prose = '攻撃力315%（+15%）、10秒間（最大3回）発動'
  assert.equal(removePotentialBonusAnnotations(prose, '攻撃力300%、10秒間（最大3回）発動'), '攻撃力315%、10秒間（最大3回）発動')
})

test('preserves annotations already present at the corresponding base value', () => {
  const before = '攻撃力300%（+15%）、術耐性15'
  const current = '攻撃力315%（+15%）、術耐性18(+3)'
  assert.equal(removePotentialBonusAnnotations(current, before), '攻撃力315%（+15%）、術耐性18')
})

test('ambiguous inserted values keep annotations and omit numeric tooltip values', () => {
  assert.equal(removePotentialBonusAnnotations('新規効果18(+3)', ''), '新規効果18(+3)')
  const result = splitOperatorEffectChanges({ base: '', withoutModule: '', withoutPotential: '追加効果15', current: '追加効果18' })
  assert.equal(result.some((part) => part.values), false)
  assert.equal(result.map((part) => part.text).join(''), '追加効果18')
})
