import test from 'node:test'
import assert from 'node:assert/strict'
import { convertSkillDescription } from '../src/lib/skillDescriptionEffects.ts'
import type { RawBlackboardEntry } from '../src/types/skill.ts'

test('説明文の変数を展開し装飾を除いて共通の効果キーと値へ変換する', () => {
  const result = convertSkillDescription(
    '攻撃力<@ba.vup>+{atk:0%}</>、防御力<@ba.vup>+{def:0%}</>',
    [{ key: 'atk', value: 0.5 }, { key: 'def', value: 0.3 }],
  )

  assert.match(result.description, /攻撃力\s*\+50%/)
  assert.match(result.description, /防御力\s*\+30%/)
  assert.doesNotMatch(result.description, /<[^>]*>|\{[^}]*\}/)
  assertEffect(result, 'attackPowerBonusRatio', 0.5, 'ratio')
  assertEffect(result, 'defenseBonusRatio', 0.3, 'ratio')
  assert.deepEqual(result.unresolvedPlaceholders, [])
  for (const effect of result.effects) {
    assert.ok(effect.label.trim().length > 0)
    assert.ok(effect.sourceText.trim().length > 0)
    assert.ok(result.description.includes(effect.sourceText))
  }
})

test('攻撃力の加算割合と与えるダメージの倍率を別のキーとして表す', () => {
  const result = convertSkillDescription('攻撃力+50%、攻撃時、攻撃力の150%の物理ダメージを与える')

  assertEffect(result, 'attackPowerBonusRatio', 0.5, 'ratio')
  assertEffect(result, 'attackDamageMultiplier', 1.5, 'multiplier')
  assertEffect(result, 'damageType', 'physical', '')
  assert.equal(result.effects.filter((effect) => effect.key === 'attackPowerBonusRatio').length, 1)
})

test('術ダメージと確定ダメージを異なる値で表す', () => {
  assertEffect(convertSkillDescription('攻撃力の180%の術ダメージを与える'), 'damageType', 'arts', '')
  assertEffect(convertSkillDescription('攻撃力の180%の確定ダメージを与える'), 'damageType', 'true', '')
})

test('負数・ゼロ・小数を有効な効果値として保持する', () => {
  const result = convertSkillDescription('攻撃間隔-0.35秒、攻撃速度+0、防御力-25.5%、最大HP+12.5%')

  assertEffect(result, 'attackIntervalDeltaSeconds', -0.35, 'seconds')
  assertEffect(result, 'attackSpeedBonus', 0, 'points')
  assertEffect(result, 'defenseBonusRatio', -0.255, 'ratio')
  assertEffect(result, 'maxHpBonusRatio', 0.125, 'ratio')
})

test('負号付き変数の展開後の数値で効果を解釈する', () => {
  const result = convertSkillDescription(
    '攻撃間隔{-interval:0.0}秒、攻撃力+{atk:0%}',
    [{ key: 'interval', value: 0.5 }, { key: 'atk', value: 0 }],
  )

  assertEffect(result, 'attackIntervalDeltaSeconds', -0.5, 'seconds')
  assertEffect(result, 'attackPowerBonusRatio', 0, 'ratio')
})

test('条件ごとに同じ効果キーを保持し一つの値へ上書きしない', () => {
  const result = convertSkillDescription('HPが50%以上の時、攻撃力+50%。HPが50%未満の時、攻撃力+20%。')
  const bonuses = result.effects.filter((effect) => effect.key === 'attackPowerBonusRatio')

  assert.equal(bonuses.length, 2)
  const highHp = bonuses.find((effect) => effect.value === 0.5)
  const lowHp = bonuses.find((effect) => effect.value === 0.2)
  assert.ok(highHp)
  assert.ok(lowHp)
  assert.match(highHp.context ?? '', /HPが50%以上/)
  assert.match(lowHp.context ?? '', /HPが50%未満/)
})

test('自身以外を対象とする効果の対象情報を文脈に残す', () => {
  const result = convertSkillDescription('攻撃範囲内の味方の攻撃力+30%')
  const bonus = result.effects.find((effect) => effect.key === 'attackPowerBonusRatio')

  assert.ok(bonus)
  assert.equal(bonus.value, 0.3)
  assert.match(bonus.context ?? '', /攻撃範囲内の味方/)
})

test('不明な変数は推測で数値化せず未解決と未変換の情報に残す', () => {
  const result = convertSkillDescription('攻撃力+{unknown:0%}、防御力+20%')

  assertEffect(result, 'defenseBonusRatio', 0.2, 'ratio')
  assert.equal(result.effects.some((effect) => effect.key === 'attackPowerBonusRatio'), false)
  assert.match(result.description, /\{unknown:0%\}/)
  assert.ok(result.unresolvedPlaceholders.some((placeholder) => placeholder.includes('unknown')))
  assert.match(result.unconvertedText.join('\n'), /unknown/)
})

test('一部だけを変換できる説明文でも未対応の効果を落とさない', () => {
  const result = convertSkillDescription('攻撃力+50%、攻撃範囲拡大、敵をかなりの力で突き飛ばす')

  assertEffect(result, 'attackPowerBonusRatio', 0.5, 'ratio')
  assertEffect(result, 'attackRangeChange', '拡大', '')
  assert.match(result.unconvertedText.join('\n'), /突き飛ばす/)
})

test('blackboardのtimesや説明文の単なる回数を攻撃ヒット数にしない', () => {
  const blackboard: RawBlackboardEntry[] = [{ key: 'times', value: 4 }, { key: 'atk', value: 3 }]
  const withCount = convertSkillDescription('発動可能回数は{times}回。', blackboard)
  const withoutCount = convertSkillDescription('攻撃範囲拡大', blackboard)

  assert.equal(withCount.effects.some((effect) => effect.key === 'hitsPerAttack'), false)
  assertEffect(withCount, 'skillUseLimit', 4, 'count')
  assert.equal(withoutCount.effects.some((effect) => effect.key === 'hitsPerAttack'), false)
  assert.equal(withoutCount.effects.some((effect) => effect.key === 'attackPowerBonusRatio'), false)
})

test('明記された攻撃回数はヒット数として変換する', () => {
  for (const description of [
    '通常攻撃が2回連続攻撃になる',
    '次の通常攻撃時、2回連続で攻撃する',
    '通常攻撃が2連撃になる',
  ]) {
    assertEffect(convertSkillDescription(description), 'hitsPerAttack', 2, 'count')
  }
})

test('スキル発動時の連続攻撃回数を通常攻撃一回のヒット数へ置き換えない', () => {
  for (const description of [
    '前方に5回連続攻撃を行う',
    'スキル発動時、敵に3回連続で攻撃する',
    '範囲内の敵に4連撃を行う',
  ]) {
    const result = convertSkillDescription(description)

    assert.equal(result.effects.some((effect) => effect.key === 'hitsPerAttack'), false, description)
    assertEffect(result, 'attackSequenceHitCount', Number(description.match(/[345]/)?.[0]), 'count')
  }
})

test('攻撃速度の割合表記を速度ポイントの加算値へ読み替えない', () => {
  for (const description of ['攻撃速度+50%', '攻撃速度+50 %', '攻撃速度+50　％']) {
    const result = convertSkillDescription(description)

    assert.equal(result.effects.some((effect) => effect.key === 'attackSpeedBonus'), false, description)
    assertEffect(result, 'attackSpeedBonusRatio', 0.5, 'ratio')
  }
})

test('単位なし加算値で分数・科学表記・桁区切りの一部だけを数値化しない', () => {
  for (const description of [
    '攻撃速度+1/2',
    '攻撃速度+1 / 2',
    '攻撃速度+2e3',
    '攻撃速度+2 e3',
    '攻撃速度+1,000',
    '所持コスト+1/2',
    '所持コスト+1 / 2',
    '所持コスト+2e3',
    '所持コスト+2 e3',
    '所持コスト+1,000',
  ]) {
    const result = convertSkillDescription(description)

    assert.deepEqual(result.effects, [], description)
    assert.ok(result.unconvertedText.length > 0)
  }
})

test('対象数やコストの割合・分数を整数の効果として部分抽出しない', () => {
  for (const description of [
    '攻撃対象数2/3',
    '攻撃対象数2 / 3',
    '攻撃対象数2e3',
    '攻撃対象数2 e3',
    '攻撃対象数2 %',
    '攻撃対象数+2/3',
    '攻撃対象数+2 / 3',
    '攻撃対象数+50 %',
    '所持コスト+50 %',
  ]) {
    const result = convertSkillDescription(description)

    assert.deepEqual(result.effects, [], description)
    assert.ok(result.unconvertedText.length > 0)
  }
})

test('文中のスタン時間で分数の分母や科学表記の指数だけを抽出しない', () => {
  for (const description of [
    '対象を1/2秒間スタンさせる',
    '対象を1 / 2秒間スタンさせる',
    '対象を1e2秒間スタンさせる',
    '対象を1e+2秒間スタンさせる',
    '対象を1,000秒間スタンさせる',
  ]) {
    const result = convertSkillDescription(description)

    assert.equal(result.effects.some((effect) => effect.key === 'stunDurationSeconds'), false, description)
    assert.ok(result.unconvertedText.length > 0)
  }
})

test('数値境界の検証後も句読点で区切った効果と空白付き割合を変換できる', () => {
  const result = convertSkillDescription('攻撃速度+30、2秒間スタンさせる。攻撃力+50 %、攻撃対象数2。')

  assertEffect(result, 'attackSpeedBonus', 30, 'points')
  assertEffect(result, 'stunDurationSeconds', 2, 'seconds')
  assertEffect(result, 'attackPowerBonusRatio', 0.5, 'ratio')
  assertEffect(result, 'targetCount', 2, 'count')
})

test('攻撃対象数・スタン時間・コスト回復・効果時間の単位を区別する', () => {
  const result = convertSkillDescription('敵3体を同時に攻撃。対象を2.5秒間スタンさせる。所持コスト+12。効果時間30秒。')

  assertEffect(result, 'targetCount', 3, 'count')
  assertEffect(result, 'stunDurationSeconds', 2.5, 'seconds')
  assertEffect(result, 'deploymentCostRecovery', 12, 'cost')
  assertEffect(result, 'durationSeconds', 30, 'seconds')
  assert.equal(result.effects.some((effect) => effect.key === 'durationSeconds' && effect.value === 2.5), false)
})

test('徐々に回復する所持コストは合計値と回復方法の文脈を保持する', () => {
  const result = convertSkillDescription('所持コストが徐々に増加（合計14）')

  assertEffect(result, 'deploymentCostRecovery', 14, 'cost')
  const recovery = result.effects.find((effect) => effect.key === 'deploymentCostRecovery')
  assert.match([recovery?.sourceText, recovery?.context].join('\n'), /徐々に増加/)
})

test('攻撃間隔の設定値を増減量へ誤変換しない', () => {
  const result = convertSkillDescription('攻撃間隔を1秒に短縮')

  assert.equal(result.effects.some((effect) => effect.key === 'attackIntervalDeltaSeconds'), false)
  assertEffect(result, 'attackIntervalSeconds', 1, 'seconds')
})

test('無効な数値を効果として出力せず有効な残りの効果は変換する', () => {
  for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const result = convertSkillDescription(
      '攻撃力+{atk:0%}、防御力+20%',
      [{ key: 'atk', value: invalid }],
    )

    assert.equal(result.effects.some((effect) => effect.key === 'attackPowerBonusRatio'), false)
    assertEffect(result, 'defenseBonusRatio', 0.2, 'ratio')
    assert.ok(result.effects.every((effect) => typeof effect.value !== 'number' || Number.isFinite(effect.value)))
    assert.ok(result.unconvertedText.length > 0)
  }
})

test('変換によって呼び出し元のblackboardを書き換えない', () => {
  const blackboard: RawBlackboardEntry[] = [
    { key: 'atk', value: 0.5 },
    { key: 'times', value: 2 },
    { key: 'label', valueStr: '特殊効果' },
  ]
  const before = structuredClone(blackboard)
  for (const entry of blackboard) Object.freeze(entry)
  Object.freeze(blackboard)

  const result = convertSkillDescription('攻撃力+{atk:0%}、{label}', blackboard)

  assertEffect(result, 'attackPowerBonusRatio', 0.5, 'ratio')
  assert.deepEqual(blackboard, before)
})

test('空の説明文は効果や未解決情報を生成しない', () => {
  const result = convertSkillDescription('  \n  ')

  assert.equal(result.description.trim(), '')
  assert.deepEqual(result.effects, [])
  assert.deepEqual(result.unconvertedText, [])
  assert.deepEqual(result.unresolvedPlaceholders, [])
})

test('同じ値の効果も変数の出現位置で元キーを区別し静的値には紐付けない', () => {
  const result = convertSkillDescription(
    '攻撃力+{atk_a:0%}、攻撃力+50%、攻撃力+{atk_b:0%}、攻撃力+{atk_a:0%}',
    [{ key: 'atk_a', value: 0.5 }, { key: 'atk_b', value: 0.5 }, { key: 'unused', value: 0.5 }],
  )

  assert.deepEqual(result.effects.map((effect) => [effect.value, effect.sourceKey]), [
    [0.5, 'atk_a'], [0.5, null], [0.5, 'atk_b'], [0.5, 'atk_a'],
  ])
})

test('同じ文から抽出するダメージ倍率と種別はそれぞれの変数を追跡する', () => {
  const blackboard: RawBlackboardEntry[] = [
    { key: 'fk', value: 3.7 },
    { key: 'atk_scale', value: 1.85 },
    { key: 'type', valueStr: '術' },
  ]
  const literalType = convertSkillDescription('敵に攻撃力の<@ba.vup>{fk:0%}</>の術ダメージ', blackboard)
  const variableType = convertSkillDescription('攻撃力の{fk:0%}の{type}ダメージ', blackboard)

  assert.deepEqual(literalType.effects.map((effect) => [effect.key, effect.value, effect.sourceKey]), [
    ['attackDamageMultiplier', 3.7, 'fk'], ['damageType', 'arts', null],
  ])
  assert.deepEqual(variableType.effects.map((effect) => [effect.key, effect.value, effect.sourceKey]), [
    ['attackDamageMultiplier', 3.7, 'fk'], ['damageType', 'arts', 'type'],
  ])
})

test('負号付き変数は実際に解決されたblackboardのキー表記を保持する', () => {
  for (const key of ['Interval', '-Interval']) {
    const result = convertSkillDescription('攻撃間隔{-Interval:0.0}秒', [{ key, value: 0.5 }])

    assert.equal(result.effects[0]?.value, -0.5)
    assert.equal(result.effects[0]?.sourceKey, key)
  }
})

test('装飾・改行・全角文字・前後空白を正規化しても元キーの位置を保持する', () => {
  const result = convertSkillDescription(
    ' \n🌟<@ba.rem>条件</><br>攻撃力<@ba.vup>＋{atk:0%}</>\\n防御力＋<b>{def}</>％\n攻撃速度＋{speed} \n',
    [{ key: 'atk', value: 0.5 }, { key: 'def', valueStr: '３０' }, { key: 'speed', value: 20 }],
  )

  assert.equal(result.description, '🌟条件\n攻撃力+50%\n防御力+30%\n攻撃速度+20')
  assert.deepEqual(result.effects.map((effect) => [effect.key, effect.sourceKey]), [
    ['attackPowerBonusRatio', 'atk'], ['defenseBonusRatio', 'def'], ['attackSpeedBonus', 'speed'],
  ])
  assert.deepEqual(result.unconvertedText, ['🌟条件'])
})

test('一つの値に複数の元キーを使う場合は特定キーへ帰属させない', () => {
  const result = convertSkillDescription(
    '攻撃力+{tens}{ones}%、攻撃速度{sign}{speed}、攻撃力と防御力+{shared:0%}',
    [
      { key: 'tens', value: 5 }, { key: 'ones', value: 0 },
      { key: 'sign', valueStr: '+' }, { key: 'speed', value: 30 },
      { key: 'shared', value: 0.2 },
    ],
  )

  assert.deepEqual(result.effects.map((effect) => [effect.key, effect.value, effect.sourceKey]), [
    ['attackPowerBonusRatio', 0.5, null], ['attackSpeedBonus', 30, null],
    ['attackPowerBonusRatio', 0.2, 'shared'], ['defenseBonusRatio', 0.2, 'shared'],
  ])
})

test('未解決変数や同値のblackboardから静的な効果の元キーを推測しない', () => {
  const result = convertSkillDescription(
    '攻撃力+{missing:0%}、防御力+20%、通常攻撃が術攻撃になる',
    [{ key: 'def', value: 0.2 }, { key: 'kind', valueStr: '術' }],
  )

  assert.deepEqual(result.effects.map((effect) => effect.sourceKey), [null, null])
  assert.deepEqual(result.unresolvedPlaceholders, ['{missing:0%}'])
  assert.match(result.unconvertedText.join('\n'), /missing/)
})

test('異なる値キャプチャを持つ効果でも元キーを追跡して内部情報を出力しない', () => {
  const result = convertSkillDescription(
    '攻撃速度+{speed}、攻撃対象数+{target}、対象を{stun}秒間スタンさせる。'
      + '所持コスト+{cost}。効果時間{duration}秒。通常攻撃が{hits}連撃になる。攻撃間隔を{interval}秒短縮',
    [
      { key: 'speed', value: 30 }, { key: 'target', value: 2 }, { key: 'stun', value: 1.5 },
      { key: 'cost', value: 12 }, { key: 'duration', value: 20 }, { key: 'hits', value: 3 },
      { key: 'interval', value: 0.2 },
    ],
  )

  assert.deepEqual(result.effects.map((effect) => effect.sourceKey), [
    'speed', 'target', 'stun', 'cost', 'duration', 'hits', 'interval',
  ])
  for (const effect of result.effects) {
    assert.deepEqual(Object.keys(effect).sort(), ['context', 'key', 'label', 'sourceKey', 'sourceText', 'unit', 'value'])
  }
})

function assertEffect(
  result: ReturnType<typeof convertSkillDescription>,
  key: string,
  value: number | string | boolean,
  unit: string,
) {
  const effect = result.effects.find((candidate) => candidate.key === key && candidate.value === value)
  assert.ok(effect, `${key} = ${String(value)} が変換結果に存在すること: ${JSON.stringify(result.effects)}`)
  assert.equal(effect.unit, unit)
}
