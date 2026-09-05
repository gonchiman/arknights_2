import { NUMBER, NUMBER_END, BARE_NUMBER_START, numericEffect, type EffectValue, type Rule } from './skillDescriptionRuleTypes.ts'

const N = NUMBER
const END = NUMBER_END
const STAT = '(?:攻撃力|防御力|最大HP|HP最大値|術耐性|攻撃速度|移動速度)'
const SEPARATOR = '(?:と|・|および|及び|、)'
const STATS = `${STAT}(?:${SEPARATOR}${STAT})*`
const STAT_INFO: Record<string, [string, string]> = {
  攻撃力: ['attackPower', '攻撃力'], 防御力: ['defense', '防御力'],
  最大HP: ['maxHp', '最大HP'], HP最大値: ['maxHp', '最大HP'],
  術耐性: ['resistance', '術耐性'], 攻撃速度: ['attackSpeed', '攻撃速度'], 移動速度: ['moveSpeed', '移動速度'],
}
const HEAL = '(?:回復|治療)(?!しな|させな|することができな)'
const LOSE = '(?:減少|失う|失い|失って|消費)(?!しな|させな|することがな)'
// Names and targets remain in sourceText/context. These phrases specify the
// numeric basis; neither a character name nor a blackboard name is interpreted.
const NAMED = '(?:[^\n、。:：()（）「」]{1,24}?の)?'
const HP_MAX = '(?:最大HP|HP最大値)'

function statValues(names: string, suffix: string, label: string, value: number, unit: string, groups: number[]): EffectValue[] {
  return names.split(/と|・|および|及び|、/).flatMap((name) => {
    const [key, title] = STAT_INFO[name]
    return numericEffect(`${key}${suffix}`, `${title}${label}`, value, unit, groups)
  })
}

function periodic(values: EffectValue[], interval: string | undefined, key = 'hpRecoveryIntervalSeconds', group = 1): EffectValue[] {
  return interval === undefined ? values : [
    ...numericEffect(key, key === 'hpLossIntervalSeconds' ? 'HP減少の発生間隔' : key === 'spRecoveryIntervalSeconds' ? 'SP回復の発生間隔' : 'HP回復の発生間隔', Number(interval), 'seconds', [group]),
    ...values,
  ]
}

// A numeric loss may describe a trigger instead of an applied effect.
function notLossTrigger(match: RegExpMatchArray, description: string): boolean {
  return !/^(?:たび|度|ごと|時|とき|場合|する(?:と|時|たび|度|ごと|とき|場合))/.test(description.slice((match.index ?? 0) + match[0].length))
}

const rules: Rule[] = [
  {
    pattern: new RegExp(String.raw`(${STATS})(?:が|を)\s*(${N})\s*秒間\s*([+-])\s*(${N})\s*(%)?${END}`, 'g'),
    convert: (m) => [
      ...numericEffect('statChangeDurationSeconds', '能力値変化の持続時間', Number(m[2]), 'seconds', [2]),
      ...statValues(m[1], m[5] ? 'BonusRatio' : 'Bonus', m[5] ? 'の加算割合' : 'の加算値', Number(`${m[3]}${m[4]}`) / (m[5] ? 100 : 1), m[5] ? 'ratio' : 'points', [3, 4]),
    ],
  },
  {
    pattern: new RegExp(String.raw`(${STATS})(?:が|を)?(?:さらに|更に|も)?\s*([+-])\s*(${N})\s*%${END}`, 'g'),
    convert: (m) => statValues(m[1], 'BonusRatio', 'の加算割合', Number(`${m[2]}${m[3]}`) / 100, 'ratio', [2, 3]),
  },
  {
    pattern: new RegExp(String.raw`(${STATS})(?:が|を)?(?:さらに|更に|も)?\s*([+-])\s*(${N})${END}`, 'g'),
    convert: (m) => statValues(m[1], 'Bonus', 'の加算値', Number(`${m[2]}${m[3]}`), 'points', [2, 3]),
  },
  {
    pattern: new RegExp(String.raw`(${STATS})(?:が|を)?\s*(${N})\s*%(?:分)?(上昇|増加|低下|減少|下げる)(?:する|し|させる)?`, 'g'),
    convert: (m) => statValues(m[1], 'BonusRatio', 'の加算割合', Number(m[2]) / 100 * (/低下|減少|下げる/.test(m[3]) ? -1 : 1), 'ratio', [2]),
  },
  {
    pattern: new RegExp(String.raw`(${STATS})(?:が|は)(?:更に|さらに)?\s*(${N})\s*(%|倍)(?:まで|に)(?:上昇|低下|増加|減少|なる|なり)(?:する|し)?`, 'g'),
    convert: (m) => statValues(m[1], 'Multiplier', 'の倍率', Number(m[2]) / (m[3] === '%' ? 100 : 1), 'multiplier', [2]),
  },
  {
    pattern: new RegExp(String.raw`(${STATS})(?:が|を)\s*(${N})${END}(?:にする|になる|になり)`, 'g'),
    convert: (m) => statValues(m[1], 'SetValue', 'の変更後の値', Number(m[2]), 'points', [2]),
  },
  {
    pattern: new RegExp(String.raw`(${STATS})が徐々に\s*\+(${N})\s*%まで上昇`, 'g'),
    convert: (m) => statValues(m[1], 'BonusRatioLimit', 'の加算割合の上限', Number(m[2]) / 100, 'ratio', [2]),
  },
  {
    pattern: new RegExp(String.raw`(${STATS})が\s*\+(${N})\s*%になるまで徐々に上昇`, 'g'),
    convert: (m) => statValues(m[1], 'BonusRatioLimit', 'の加算割合の上限', Number(m[2]) / 100, 'ratio', [2]),
  },
  {
    pattern: new RegExp(String.raw`(${STATS})が徐々に\s*(${N})\s*%まで上昇`, 'g'),
    convert: (m) => statValues(m[1], 'MultiplierLimit', 'の倍率の上限', Number(m[2]) / 100, 'multiplier', [2]),
  },
  {
    pattern: new RegExp(String.raw`(${STATS})が\s*(${N})\s*%から\s*(${N})\s*%まで徐々に(上昇|減少)`, 'g'),
    convert: (m) => [
      ...statValues(m[1], 'InitialMultiplier', 'の初期倍率', Number(m[2]) / 100, 'multiplier', [2]),
      ...statValues(m[1], 'FinalMultiplier', 'の最終倍率', Number(m[3]) / 100, 'multiplier', [3]),
    ],
  },
  {
    pattern: new RegExp(String.raw`攻撃速度が\s*\+(${N})から\s*\+(${N})まで徐々に減衰`, 'g'),
    convert: (m) => [
      ...numericEffect('attackSpeedInitialBonus', '攻撃速度の初期加算値', Number(m[1]), 'points', [1]),
      ...numericEffect('attackSpeedFinalBonus', '攻撃速度の最終加算値', Number(m[2]), 'points', [2]),
    ],
  },
  {
    pattern: new RegExp(String.raw`(${STATS})上昇値が\s*\+(${N})\s*%にな(?:る|り)`, 'g'),
    convert: (m) => statValues(m[1], 'BonusRatio', 'の加算割合', Number(m[2]) / 100, 'ratio', [2]),
  },
  {
    pattern: new RegExp(String.raw`(${STATS})を(?:即座に)?\s*(${N})(?:ずつ)?奪取(?:[（(]最大(?:で)?\s*(${N})まで奪取可能)?`, 'g'),
    convert: (m) => [
      ...statValues(m[1], 'StealAmount', 'の奪取量', Number(m[2]), 'points', [2]),
      ...(m[3] ? statValues(m[1], 'StealLimit', 'の奪取量の上限', Number(m[3]), 'points', [3]) : []),
    ],
  },
  {
    pattern: new RegExp(String.raw`(${STATS})(?:の)?\s*(${N})\s*%の鼓舞(?:状態)?`, 'g'),
    convert: (m) => statValues(m[1], 'InspirationRatio', 'を基準とする鼓舞の割合', Number(m[2]) / 100, 'fraction', [2]),
  },
  {
    pattern: new RegExp(String.raw`(?:通常攻撃の間隔|攻撃間隔)(?:が|を|は)\s*(${N})\s*秒(?:になる|になり|にする|に短縮|に延長)`, 'g'),
    convert: (m) => numericEffect('attackIntervalSeconds', '変更後の攻撃間隔', Number(m[1]), 'seconds'),
  },
  {
    pattern: new RegExp(String.raw`(?:通常攻撃の間隔|攻撃間隔)(?:が|を|は)?\s*([+-])\s*(${N})\s*%${END}`, 'g'),
    convert: (m) => numericEffect('attackIntervalBonusRatio', '攻撃間隔の増減割合', Number(`${m[1]}${m[2]}`) / 100, 'ratio', [1, 2]),
  },
  {
    pattern: new RegExp(String.raw`(?:通常攻撃の間隔|攻撃間隔)(?:が|を|は)\s*(${N})\s*(%|倍)(?:まで|に)(?:なる|なり|短縮|延長)`, 'g'),
    convert: (m) => numericEffect('attackIntervalMultiplier', '攻撃間隔の倍率', Number(m[1]) / (m[2] === '%' ? 100 : 1), 'multiplier'),
  },
  {
    pattern: new RegExp(String.raw`(?:通常攻撃の間隔|攻撃間隔)(?:が|を)?\s*(${N})\s*%(短縮|延長)`, 'g'),
    convert: (m) => numericEffect('attackIntervalBonusRatio', '攻撃間隔の増減割合', Number(m[1]) / 100 * (m[2] === '短縮' ? -1 : 1), 'ratio'),
  },
  {
    pattern: new RegExp(String.raw`(防御力|術耐性)を\s*(${N})\s*(%)?${END}無視`, 'g'),
    convert: (m) => statValues(m[1], m[3] ? 'IgnoreRatio' : 'IgnoreAmount', m[3] ? 'の無視割合' : 'の無視量', Number(m[2]) / (m[3] ? 100 : 1), m[3] ? 'fraction' : 'points', [2]),
  },
  {
    pattern: new RegExp(String.raw`(物理回避(?:と術回避)?|物理(?:・|と)術回避|術回避|物理回避率|術回避率)\s*([+-])\s*(${N})\s*%${END}`, 'g'),
    convert: (m) => [
      ...(/物理/.test(m[1]) ? numericEffect('physicalEvasionBonusRatio', '物理回避率の加算割合', Number(`${m[2]}${m[3]}`) / 100, 'ratio', [2, 3]) : []),
      ...(/術/.test(m[1]) ? numericEffect('artsEvasionBonusRatio', '術回避率の加算割合', Number(`${m[2]}${m[3]}`) / 100, 'ratio', [2, 3]) : []),
    ],
  },
  {
    pattern: new RegExp(String.raw`近接攻撃を受けると\s*(${N})\s*%の確率で回避`, 'g'),
    convert: (m) => numericEffect('meleeEvasionChance', '近接攻撃の回避確率', Number(m[1]) / 100, 'fraction'),
  },
  {
    pattern: new RegExp(String.raw`${BARE_NUMBER_START}(${N})\s*%の確率で(遠距離攻撃による)?(物理|術)(?:の)?被ダメージを無効化`, 'g'),
    convert: (m) => numericEffect(`${m[2] ? 'ranged' : ''}${m[2] ? (m[3] === '物理' ? 'Physical' : 'Arts') : (m[3] === '物理' ? 'physical' : 'arts')}DamageNullificationChance`, `${m[2] ? '遠距離攻撃による' : ''}${m[3]}被ダメージの無効化確率`, Number(m[1]) / 100, 'fraction'),
  },
  {
    pattern: new RegExp(String.raw`((?:物理(?:・|と|/|／)術|物理|術)(?:の)?)?被ダメージ\s*([+-])\s*(${N})\s*(%)?${END}`, 'g'),
    convert: (m) => damageTakenValues(m[1], m[4] ? 'BonusRatio' : 'Delta', m[4] ? 'の増減割合' : 'の増減量', Number(`${m[2]}${m[3]}`) / (m[4] ? 100 : 1), m[4] ? 'ratio' : 'points', [2, 3]),
  },
  {
    pattern: new RegExp(String.raw`((?:物理|術)(?:の)?)?被ダメージを\s*(${N})\s*%に軽減`, 'g'),
    convert: (m) => damageTakenValues(m[1], 'Multiplier', 'の倍率', Number(m[2]) / 100, 'multiplier', [2]),
  },
  {
    pattern: new RegExp(String.raw`((?:物理|術)(?:の)?)?被ダメージを\s*(${N})\s*%(?:軽減|減少)`, 'g'),
    convert: (m) => damageTakenValues(m[1], 'ReductionRatio', 'の軽減割合', Number(m[2]) / 100, 'fraction', [2]),
  },
  {
    pattern: new RegExp(String.raw`${BARE_NUMBER_START}(${N})の被ダメージ軽減(?:状態)?を獲得`, 'g'),
    convert: (m) => numericEffect('damageTakenReductionAmount', '被ダメージの軽減量', Number(m[1]), 'points'),
  },
  {
    pattern: new RegExp(String.raw`(?:致命的なダメージを受けても)?HP(?:が|は)\s*(${N})${END}(?:残る|以下になら(?:ない|ず))`, 'g'),
    convert: (m) => numericEffect('minimumHp', '致命傷を受けた際に維持するHP', Number(m[1]), 'hp'),
  },
]

// Read qualified changes (limits, time ramps) before the simple signed forms.
const simpleStatRules = rules.splice(1, 3)

function damageTakenValues(type: string | undefined, suffix: string, label: string, value: number, unit: string, groups: number[]): EffectValue[] {
  const types = type ? [
    ...(/物理/.test(type) ? [['physicalDamageTaken', '物理被ダメージ']] : []),
    ...(/術/.test(type) ? [['artsDamageTaken', '術被ダメージ']] : []),
  ] : [['damageTaken', '被ダメージ']]
  return types.flatMap(([key, name]) => numericEffect(`${key}${suffix}`, `${name}${label}`, value, unit, groups))
}

// Periodic effects precede their one-off counterparts so a tick amount is not
// mistaken for a total recovery. A rate is never computed from an unknown interval.
for (const [verb, stem, label] of [[HEAL, 'Recovery', '回復'], [LOSE, 'Loss', '減少']] as const) {
  rules.push({
    pattern: new RegExp(String.raw`(?:HP(?:が|を))?\s*${BARE_NUMBER_START}(${N})\s*秒ごと(?:に)?(?:HP(?:が|を))?(?:さらに|更に)?(最大値|最大HP|HP最大値|現在値)(?:の)?\s*(${N})\s*%(?:のHP)?(?:を)?${verb}`, 'g'),
    convert: (m) => periodic(numericEffect(`${m[2] === '現在値' ? 'currentHp' : 'maxHp'}${stem}Ratio`, `${m[2] === '現在値' ? '現在HP' : '最大HP'}を基準とするHP${label}割合`, Number(m[3]) / 100, 'fraction', [3]), m[1], `hp${stem}IntervalSeconds`),
    accepts: stem === 'Loss' ? notLossTrigger : undefined,
  }, {
    pattern: new RegExp(String.raw`(?:HP(?:が|を))?\s*${BARE_NUMBER_START}(${N})\s*秒ごと(?:に)?HP(?:が|を)\s*(${N})${END}${verb}`, 'g'),
    convert: (m) => periodic(numericEffect(`hp${stem}Amount`, `HP${label}量`, Number(m[2]), 'hp', [2]), m[1], `hp${stem}IntervalSeconds`),
    accepts: stem === 'Loss' ? notLossTrigger : undefined,
  }, {
    pattern: new RegExp(String.raw`HP(?:が|を)\s*(${N})\s*秒ごと(?:に)?\s*(${N})${END}${verb}`, 'g'),
    convert: (m) => periodic(numericEffect(`hp${stem}Amount`, `HP${label}量`, Number(m[2]), 'hp', [2]), m[1], `hp${stem}IntervalSeconds`),
    accepts: stem === 'Loss' ? notLossTrigger : undefined,
  }, {
    pattern: new RegExp(String.raw`HP(?:が|を)毎秒(最大値|最大HP|HP最大値|現在値)(?:の)?\s*(${N})\s*%${verb}`, 'g'),
    convert: (m) => numericEffect(`${m[1] === '現在値' ? 'currentHp' : 'maxHp'}${stem}RatioPerSecond`, `${m[1] === '現在値' ? '現在HP' : '最大HP'}を基準とする毎秒のHP${label}割合`, Number(m[2]) / 100, 'fractionPerSecond', [2]),
    accepts: stem === 'Loss' ? notLossTrigger : undefined,
  }, {
    pattern: new RegExp(String.raw`(?:HP(?:が|を)(?:追加で)?(最大値|現在値)(?:の)?\s*(${N})\s*%|(${HP_MAX})(?:の)?\s*(${N})\s*%(?:のHP)?(?:を)?)${verb}`, 'g'),
    convert: (m) => numericEffect(`${m[1] === '現在値' ? 'currentHp' : 'maxHp'}${stem}Ratio`, `${m[1] === '現在値' ? '現在HP' : '最大HP'}を基準とするHP${label}割合`, Number(m[2] ?? m[4]) / 100, 'fraction', m[2] ? [2] : [4]),
    accepts: stem === 'Loss' ? notLossTrigger : undefined,
  }, {
    pattern: new RegExp(String.raw`HP(?:が|を)(?:追加で)?\s*(${N})${END}${verb}`, 'g'),
    convert: (m) => numericEffect(`hp${stem}Amount`, `HP${label}量`, Number(m[1]), 'hp'),
    accepts: stem === 'Loss' ? notLossTrigger : undefined,
  })
}

rules.push(
  {
    pattern: new RegExp(String.raw`再配置時間(?:が|を)?\s*([+-])\s*(${N})\s*%${END}`, 'g'),
    convert: (m) => numericEffect('redeployTimeBonusRatio', '再配置時間の増減割合', Number(`${m[1]}${m[2]}`) / 100, 'ratio', [1, 2]),
  },
  {
    pattern: new RegExp(String.raw`再配置時間(?:が|を)\s*(${N})\s*%まで(?:短縮|延長)`, 'g'),
    convert: (m) => numericEffect('redeployTimeMultiplier', '再配置時間の倍率', Number(m[1]) / 100, 'multiplier'),
  },
  {
    pattern: new RegExp(String.raw`再配置時間(?:が|を)\s*(${N})\s*秒(?:になる|になり|にする|に短縮|に延長)`, 'g'),
    convert: (m) => numericEffect('redeployTimeSeconds', '変更後の再配置時間', Number(m[1]), 'seconds'),
  },
  {
    pattern: /再配置時間が(0)になる/g,
    convert: (m) => numericEffect('redeployTimeSeconds', '変更後の再配置時間', Number(m[1]), 'seconds'),
  },
  {
    pattern: new RegExp(String.raw`(物理(?:・|と|/|／)術|物理|術)攻撃の命中率\s*([+-])\s*(${N})\s*%${END}`, 'g'),
    convert: (m) => [
      ...(/物理/.test(m[1]) ? numericEffect('physicalAccuracyBonusRatio', '物理攻撃の命中率の増減割合', Number(`${m[2]}${m[3]}`) / 100, 'ratio', [2, 3]) : []),
      ...(/術/.test(m[1]) ? numericEffect('artsAccuracyBonusRatio', '術攻撃の命中率の増減割合', Number(`${m[2]}${m[3]}`) / 100, 'ratio', [2, 3]) : []),
    ],
  },
  {
    pattern: new RegExp(String.raw`魔力を(?:追加で)?\s*(${N})${END}消費`, 'g'),
    convert: (m) => numericEffect('manaConsumedAmount', '魔力消費量', Number(m[1]), 'points'),
    accepts: notLossTrigger,
  },
  {
    pattern: new RegExp(String.raw`${BARE_NUMBER_START}(${N})秒ごとに${NAMED}攻撃力(?:の)?\s*(${N})\s*%[（(]対象のHPが\s*(${N})\s*%以下の時\s*(${N})\s*%[）)]のHPを回復`, 'g'),
    convert: (m) => periodic([
      ...numericEffect('attackBasedHealingMultiplier', '攻撃力に対するHP回復倍率', Number(m[2]) / 100, 'multiplier', [2]),
      ...numericEffect('lowHpHealingThresholdRatio', '回復倍率が変わる対象のHP割合', Number(m[3]) / 100, 'fraction', [3]),
      ...numericEffect('lowHpAttackBasedHealingMultiplier', 'HP条件を満たす対象への攻撃力に対するHP回復倍率', Number(m[4]) / 100, 'multiplier', [4]),
    ], m[1]),
  },
  {
    pattern: new RegExp(String.raw`HP(?:が|を)(?:\s*(${N})\s*秒ごとに|毎秒)?${NAMED}攻撃力(?:の)?\s*(${N})\s*%(?:分|で|を)?${HEAL}`, 'g'),
    convert: (m) => periodic(numericEffect(m[0].includes('毎秒') ? 'attackBasedHealingMultiplierPerSecond' : 'attackBasedHealingMultiplier', m[0].includes('毎秒') ? '攻撃力に対する毎秒のHP回復倍率' : '攻撃力に対するHP回復倍率', Number(m[2]) / 100, m[0].includes('毎秒') ? 'multiplierPerSecond' : 'multiplier', [2]), m[1]),
  },
  {
    pattern: new RegExp(String.raw`(?:${BARE_NUMBER_START}(${N})\s*秒ごとに)?${NAMED}攻撃力(?:の)?\s*(${N})\s*%の(?:HPを回復|継続回復効果)`, 'g'),
    convert: (m) => periodic(numericEffect('attackBasedHealingMultiplier', '攻撃力に対するHP回復倍率', Number(m[2]) / 100, 'multiplier', [2]), m[1]),
  },
  {
    pattern: new RegExp(String.raw`攻撃力(?:の)?\s*(${N})\s*%で(?:対象のHPを回復|治療行動を行う|治療行動を行い)`, 'g'),
    convert: (m) => numericEffect('attackBasedHealingMultiplier', '攻撃力に対するHP回復倍率', Number(m[1]) / 100, 'multiplier'),
  },
  {
    pattern: new RegExp(String.raw`攻撃力(?:の)?\s*(${N})\s*%の治療効果を与える`, 'g'),
    convert: (m) => numericEffect('attackBasedHealingMultiplier', '攻撃力に対するHP回復倍率', Number(m[1]) / 100, 'multiplier'),
  },
  {
    pattern: new RegExp(String.raw`(?:HPを)?(?:与ダメージ|ダメージ)の\s*(${N})\s*%(?:のHPを|分)?回復`, 'g'),
    convert: (m) => numericEffect('damageBasedHealingRatio', '与ダメージを基準とするHP回復割合', Number(m[1]) / 100, 'fraction'),
  },
  {
    pattern: new RegExp(String.raw`(?<!と)(?:元素損傷に対する治療値|元素損傷の治療値)が\s*(${N})\s*%まで上昇`, 'g'),
    convert: (m) => numericEffect('elementalHealingMultiplier', '元素損傷の治療倍率', Number(m[1]) / 100, 'multiplier'),
  },
  {
    pattern: new RegExp(String.raw`(?:HP回復量|治療量)と元素損傷に対する治療値が\s*(${N})\s*%まで上昇`, 'g'),
    convert: (m) => [
      ...numericEffect('healingMultiplier', 'HP回復量の倍率', Number(m[1]) / 100, 'multiplier'),
      ...numericEffect('elementalHealingMultiplier', '元素損傷の治療倍率', Number(m[1]) / 100, 'multiplier'),
    ],
  },
  {
    pattern: new RegExp(String.raw`治療量が攻撃力の\s*(${N})\s*%まで上昇`, 'g'),
    convert: (m) => numericEffect('attackBasedHealingMultiplier', '攻撃力に対するHP回復倍率', Number(m[1]) / 100, 'multiplier'),
  },
  {
    pattern: new RegExp(String.raw`HP(?:治療効果|回復量)(?:が|は)(?:本来の)?\s*(${N})\s*%(?:まで上昇|になる)`, 'g'),
    convert: (m) => numericEffect('healingMultiplier', 'HP回復量の倍率', Number(m[1]) / 100, 'multiplier'),
  },
  {
    pattern: new RegExp(String.raw`受ける治療と回復効果を\s*([+-])\s*(${N})\s*%`, 'g'),
    convert: (m) => numericEffect('healingReceivedBonusRatio', '受ける治療・回復効果の増減割合', Number(`${m[1]}${m[2]}`) / 100, 'ratio', [1, 2]),
  },
  {
    pattern: new RegExp(String.raw`元素損傷を\s*(${N})秒ごとに${NAMED}攻撃力の\s*(${N})\s*%治療`, 'g'),
    convert: (m) => [
      ...numericEffect('elementalHealingIntervalSeconds', '元素損傷治療の発生間隔', Number(m[1]), 'seconds', [1]),
      ...numericEffect('attackBasedElementalHealingMultiplier', '攻撃力に対する元素損傷の治療倍率', Number(m[2]) / 100, 'multiplier', [2]),
    ],
  },
  {
    pattern: new RegExp(String.raw`元素損傷を\s*(${N})秒間\s*(${N})秒ごとに${NAMED}攻撃力の\s*(${N})\s*%の値分治療`, 'g'),
    convert: (m) => [
      ...numericEffect('elementalHealingDurationSeconds', '元素損傷治療の継続時間', Number(m[1]), 'seconds', [1]),
      ...numericEffect('elementalHealingIntervalSeconds', '元素損傷治療の発生間隔', Number(m[2]), 'seconds', [2]),
      ...numericEffect('attackBasedElementalHealingMultiplier', '攻撃力に対する元素損傷の治療倍率', Number(m[3]) / 100, 'multiplier', [3]),
    ],
  },
  {
    pattern: new RegExp(String.raw`神経損傷を\s*(${N})${END}回復`, 'g'),
    convert: (m) => numericEffect('nervousImpairmentRecoveryAmount', '神経損傷の回復量', Number(m[1]), 'points'),
  },
  {
    pattern: new RegExp(String.raw`SP(?:自然)?回復速度\s*([+-])\s*(${N})\s*sp/秒`, 'gi'),
    convert: (m) => numericEffect('spRecoveryRateBonus', 'SP回復速度の加算値', Number(`${m[1]}${m[2]}`), 'spPerSecond', [1, 2]),
  },
  {
    pattern: new RegExp(String.raw`${BARE_NUMBER_START}(${N})秒ごと(?:に)?(?:自身の)?SP(?:が|を)(?:追加で)?\s*(${N})${END}回復`, 'g'),
    convert: (m) => periodic(numericEffect('spRecoveryAmount', 'SP回復量', Number(m[2]), 'sp', [2]), m[1], 'spRecoveryIntervalSeconds'),
  },
  {
    pattern: new RegExp(String.raw`SP(?:が|を)\s*(${N})秒ごとに\s*(${N})${END}回復`, 'g'),
    convert: (m) => periodic(numericEffect('spRecoveryAmount', 'SP回復量', Number(m[2]), 'sp', [2]), m[1], 'spRecoveryIntervalSeconds'),
  },
  {
    pattern: new RegExp(String.raw`SP(?:が|を)最大値の\s*(${N})\s*%回復`, 'g'),
    convert: (m) => numericEffect('maxSpRecoveryRatio', '最大SPを基準とするSP回復割合', Number(m[1]) / 100, 'fraction'),
  },
  {
    pattern: new RegExp(String.raw`SP(?:が|を)\s*(${N})${END}回復(?!しな|することがな)`, 'g'),
    convert: (m) => numericEffect('spRecoveryAmount', 'SP回復量', Number(m[1]), 'sp'),
  },
  {
    pattern: new RegExp(String.raw`(?<!ストック)SP\s*\+\s*(${N})${END}`, 'g'),
    convert: (m) => numericEffect('spRecoveryAmount', 'SP回復量', Number(m[1]), 'sp'),
  },
  {
    pattern: new RegExp(String.raw`ストックSP\s*\+\s*(${N})${END}`, 'g'),
    convert: (m) => numericEffect('stockSpBonus', 'ストックSPの加算値', Number(m[1]), 'sp'),
  },
  {
    pattern: new RegExp(String.raw`SPの回復量が\s*(${N})\s*倍になる`, 'g'),
    convert: (m) => numericEffect('spRecoveryMultiplier', 'SP回復量の倍率', Number(m[1]), 'multiplier'),
  },
  {
    pattern: new RegExp(String.raw`(?:所持)?コストを\s*(${N})${END}消費`, 'g'),
    convert: (m) => numericEffect('deploymentCostConsumed', '所持コスト消費量', Number(m[1]), 'cost'),
  },
  {
    pattern: new RegExp(String.raw`(?:合計\s*)?(${N})の(?:所持)?コストを(?:徐々に)?消費`, 'g'),
    convert: (m) => numericEffect('deploymentCostConsumed', '所持コスト消費量', Number(m[1]), 'cost'),
  },
  {
    pattern: new RegExp(String.raw`配置コスト\s*([+-])\s*(${N})${END}`, 'g'),
    convert: (m) => numericEffect('deploymentCostBonus', '配置コストの増減', Number(`${m[1]}${m[2]}`), 'cost', [1, 2]),
  },
  {
    pattern: new RegExp(String.raw`配置コストを\s*(${N})${END}にする`, 'g'),
    convert: (m) => numericEffect('deploymentCostSetValue', '変更後の配置コスト', Number(m[1]), 'cost'),
  },
  {
    pattern: new RegExp(String.raw`${BARE_NUMBER_START}(${N})秒ごとに追加でコスト\s*\+\s*(${N})${END}`, 'g'),
    convert: (m) => [
      ...numericEffect('deploymentCostRecoveryIntervalSeconds', '所持コスト回復の発生間隔', Number(m[1]), 'seconds', [1]),
      ...numericEffect('deploymentCostRecovery', '所持コスト回復量', Number(m[2]), 'cost', [2]),
    ],
  },
  {
    pattern: new RegExp(String.raw`所持コストがさらに\s*\+\s*(${N})${END}`, 'g'),
    convert: (m) => numericEffect('deploymentCostRecovery', '所持コスト回復量', Number(m[1]), 'cost'),
  },
  {
    pattern: new RegExp(String.raw`魔力を\s*(${N})${END}回復`, 'g'),
    convert: (m) => numericEffect('manaRecoveryAmount', '魔力回復量', Number(m[1]), 'points'),
  },
)

for (const [basis, key, label, unit] of [[HP_MAX, 'maxHp', '最大HP', 'fraction'], ['攻撃力', 'attack', '攻撃力', 'multiplier']] as const) {
  rules.push({
    pattern: new RegExp(String.raw`${basis}(?:の)?\s*(${N})\s*%までの(物理(?:の)?|術(?:の)?)?被ダメージ(?:が|を)吸収可能(?:なバリア)?`, 'g'),
    convert: (m) => numericEffect(`${m[2] ? (m[2].includes('物理') ? 'physical' : 'arts') : 'general'}Barrier${key === 'maxHp' ? 'MaxHpRatio' : 'AttackMultiplier'}`, `${m[2] ?? ''}バリアの${label}に対する吸収量`, Number(m[1]) / 100, unit),
  }, {
    pattern: new RegExp(String.raw`${basis}(?:の)?\s*(${N})\s*%の(?:耐久値を持つ)?バリアを(?:獲得|付与)`, 'g'),
    convert: (m) => numericEffect(`barrier${key === 'maxHp' ? 'MaxHpRatio' : 'AttackMultiplier'}`, `バリアの${label}に対する量`, Number(m[1]) / 100, unit),
  })
}
rules.push(
  {
    pattern: new RegExp(String.raw`バリア(?:の最大値は自身の|は)最大HPの\s*(${N})\s*(%|倍)まで`, 'g'),
    convert: (m) => numericEffect('barrierMaxHpLimitRatio', '最大HPを基準とするバリアの上限', Number(m[1]) / (m[2] === '%' ? 100 : 1), 'fraction'),
  },
  {
    pattern: new RegExp(String.raw`${BARE_NUMBER_START}(${N})までの被ダメージを吸収可能なバリア`, 'g'),
    convert: (m) => numericEffect('barrierCapacity', 'バリアの吸収量', Number(m[1]), 'hp'),
  },
  {
    pattern: new RegExp(String.raw`受ける元素損傷を\s*(${N})まで吸収可能な元素損傷バリア`, 'g'),
    convert: (m) => numericEffect('elementalBarrierCapacity', '元素損傷バリアの吸収量', Number(m[1]), 'points'),
  },
  {
    pattern: new RegExp(String.raw`受ける元素損傷を攻撃力の\s*(${N})\s*%吸収`, 'g'),
    convert: (m) => numericEffect('elementalBarrierAttackMultiplier', '元素損傷バリアの攻撃力に対する吸収量', Number(m[1]) / 100, 'multiplier'),
  },
)

const COMPOSITE_RULES: Rule[] = [
  {
    pattern: new RegExp(String.raw`SPを\s*(${N})${END}[、,]\s*HPを最大値の\s*(${N})\s*%回復`, 'g'),
    convert: (m) => [
      ...numericEffect('spRecoveryAmount', 'SP回復量', Number(m[1]), 'sp', [1]),
      ...numericEffect('maxHpRecoveryRatio', '最大HPを基準とするHP回復割合', Number(m[2]) / 100, 'fraction', [2]),
    ],
  },
  {
    pattern: new RegExp(String.raw`(${STAT})(?:の)?\s*(${N})\s*%と(${STAT})(?:の)?\s*(${N})\s*%の鼓舞(?:状態)?`, 'g'),
    convert: (m) => [
      ...statValues(m[1], 'InspirationRatio', 'を基準とする鼓舞の割合', Number(m[2]) / 100, 'fraction', [2]),
      ...statValues(m[3], 'InspirationRatio', 'を基準とする鼓舞の割合', Number(m[4]) / 100, 'fraction', [4]),
    ],
  },
  {
    pattern: new RegExp(String.raw`HPを回復[（(]\s*(${N})\s*秒ごと(?:に)?${NAMED}攻撃力(?:の)?\s*(${N})\s*%[）)]`, 'g'),
    convert: (m) => periodic(numericEffect('attackBasedHealingMultiplier', '攻撃力に対するHP回復倍率', Number(m[2]) / 100, 'multiplier', [2]), m[1]),
  },
  {
    pattern: new RegExp(String.raw`(?:${BARE_NUMBER_START}(${N})秒ごとに)${NAMED}${HP_MAX}(?:の)?\s*(${N})\s*%のバリアを(?:獲得|付与)`, 'g'),
    convert: (m) => [
      ...numericEffect('barrierGenerationIntervalSeconds', 'バリアの獲得間隔', Number(m[1]), 'seconds', [1]),
      ...numericEffect('barrierMaxHpRatio', 'バリアの最大HPに対する量', Number(m[2]) / 100, 'fraction', [2]),
    ],
  },
  {
    pattern: new RegExp(String.raw`${BARE_NUMBER_START}(${N})秒ごとに${HP_MAX}(?:の)?\s*(${N})\s*%までの被ダメージを吸収できるバリア`, 'g'),
    convert: (m) => [
      ...numericEffect('barrierGenerationIntervalSeconds', 'バリアの獲得間隔', Number(m[1]), 'seconds', [1]),
      ...numericEffect('generalBarrierMaxHpRatio', 'バリアの最大HPに対する吸収量', Number(m[2]) / 100, 'fraction', [2]),
    ],
  },
  {
    pattern: new RegExp(String.raw`HPが\s*(${N})秒間\s*(${N})${END}残る効果`, 'g'),
    convert: (m) => [
      ...numericEffect('minimumHpDurationSeconds', 'HPを維持する効果の時間', Number(m[1]), 'seconds', [1]),
      ...numericEffect('minimumHp', '致命傷を受けた際に維持するHP', Number(m[2]), 'hp', [2]),
    ],
  },
  {
    pattern: new RegExp(String.raw`(?:SP・HP|SPとHP)回復効果が\s*(${N})倍になる`, 'g'),
    convert: (m) => [
      ...numericEffect('spRecoveryMultiplier', 'SP回復量の倍率', Number(m[1]), 'multiplier'),
      ...numericEffect('healingMultiplier', 'HP回復量の倍率', Number(m[1]), 'multiplier'),
    ],
  },
]

rules.push(
  {
    pattern: new RegExp(String.raw`ランダムで\s*(${N})\s*[-～〜~]\s*(${N})のコストを獲得`, 'g'),
    convert: (m) => Number(m[1]) <= Number(m[2]) ? [
      ...numericEffect('deploymentCostRecoveryMinimum', 'ランダムな所持コスト獲得量の下限', Number(m[1]), 'cost', [1]),
      ...numericEffect('deploymentCostRecoveryMaximum', 'ランダムな所持コスト獲得量の上限', Number(m[2]), 'cost', [2]),
    ] : [],
  },
  {
    pattern: new RegExp(String.raw`SPをランダムで最大\s*(${N})${END}回復`, 'g'),
    convert: (m) => numericEffect('spRecoveryMaximum', 'ランダムなSP回復量の上限', Number(m[1]), 'sp'),
  },
  {
    pattern: new RegExp(String.raw`コスト\s*(${N})${END}で使用可能`, 'g'),
    convert: (m) => numericEffect('activationCost', '使用に必要なコスト', Number(m[1]), 'cost'),
  },
  {
    pattern: new RegExp(String.raw`所持コスト\s*-\s*(${N})${END}`, 'g'),
    convert: (m) => numericEffect('deploymentCostConsumed', '所持コスト消費量', Number(m[1]), 'cost'),
  },
  {
    pattern: new RegExp(String.raw`治療量は治療主対象の\s*(${N})\s*%${END}`, 'g'),
    convert: (m) => numericEffect('secondaryHealingMultiplier', '治療主対象を基準とする追加治療の倍率', Number(m[1]) / 100, 'multiplier'),
  },
  {
    pattern: new RegExp(String.raw`HPを\s*(${N})秒ごとに回復させる`, 'g'),
    convert: (m) => numericEffect('hpRecoveryIntervalSeconds', 'HP回復の発生間隔', Number(m[1]), 'seconds'),
  },
  {
    pattern: new RegExp(String.raw`軽減したダメージ分のHPを\s*(${N})秒間にかけて継続的に失う`, 'g'),
    convert: (m) => numericEffect('deferredDamageDurationSeconds', '軽減したダメージ分のHPを失う時間', Number(m[1]), 'seconds'),
  },
  {
    pattern: new RegExp(String.raw`${BARE_NUMBER_START}(${N})秒間にかけてスキル効果によって軽減したダメージ分のHPを継続的に失う`, 'g'),
    convert: (m) => numericEffect('deferredDamageDurationSeconds', '軽減したダメージ分のHPを失う時間', Number(m[1]), 'seconds'),
  },
  {
    pattern: new RegExp(String.raw`神経損傷が爆発してから再度爆発可能になるまでの回復速度\s*([+-])\s*(${N})\s*%${END}`, 'g'),
    convert: (m) => numericEffect('nervousImpairmentRecoveryRateBonusRatio', '神経損傷が再び爆発可能になるまでの回復速度の増減割合', Number(`${m[1]}${m[2]}`) / 100, 'ratio', [1, 2]),
  },
  {
    pattern: new RegExp(String.raw`HP減少速度\s*([+-])\s*(${N})\s*%${END}`, 'g'),
    convert: (m) => numericEffect('hpLossRateBonusRatio', 'HP減少速度の増減割合', Number(`${m[1]}${m[2]}`) / 100, 'ratio', [1, 2]),
  },
  {
    pattern: new RegExp(String.raw`${BARE_NUMBER_START}(${N})秒後に${HP_MAX}(?:の)?\s*(${N})\s*%/秒になる`, 'g'),
    convert: (m) => [
      ...numericEffect('hpLossRateRampDurationSeconds', 'HP減少速度が最終値に達する時間', Number(m[1]), 'seconds', [1]),
      ...numericEffect('maxHpLossRatioPerSecond', '最大HPを基準とする毎秒のHP減少割合', Number(m[2]) / 100, 'fractionPerSecond', [2]),
    ],
    accepts: (m, d) => /HP[^。\n]*(?:減少|失う|失い)/.test(d.slice(0, m.index)),
  },
  {
    pattern: new RegExp(String.raw`移動速度を徐々に\s*(${N})\s*%まで低下`, 'g'),
    convert: (m) => numericEffect('moveSpeedFinalMultiplier', '移動速度の最終倍率', Number(m[1]) / 100, 'multiplier'),
  },
  {
    pattern: new RegExp(String.raw`受ける(物理|術|確定)ダメージ\s*([+-])\s*(${N})\s*%${END}`, 'g'),
    convert: (m) => numericEffect(`${m[1] === '物理' ? 'physical' : m[1] === '術' ? 'arts' : 'true'}DamageTakenBonusRatio`, `受ける${m[1]}ダメージの増減割合`, Number(`${m[2]}${m[3]}`) / 100, 'ratio', [2, 3]),
  },
  {
    pattern: new RegExp(String.raw`(?:この)?バリア(?:の効果)?(?:は|が)\s*(${N})\s*秒(?:間)?持続`, 'g'),
    convert: (m) => numericEffect('barrierDurationSeconds', 'バリアの持続時間', Number(m[1]), 'seconds'),
  },
  {
    pattern: new RegExp(String.raw`(?:継続)?\s*${BARE_NUMBER_START}(${N})\s*秒(?:間)?(?:持続可能な|の)バリアを付与`, 'g'),
    convert: (m) => numericEffect('barrierDurationSeconds', 'バリアの持続時間', Number(m[1]), 'seconds'),
  },
  {
    pattern: new RegExp(String.raw`${BARE_NUMBER_START}(${N})\s*秒(?:間)?の継続回復効果`, 'g'),
    convert: (m) => numericEffect('hpRecoveryDurationSeconds', '継続回復効果の時間', Number(m[1]), 'seconds'),
  },
  {
    pattern: new RegExp(String.raw`バリアの上限は最大HPの\s*(${N})\s*%まで`, 'g'),
    convert: (m) => numericEffect('barrierMaxHpLimitRatio', '最大HPを基準とするバリアの上限', Number(m[1]) / 100, 'fraction'),
  },
  {
    pattern: new RegExp(String.raw`(?:SP回復効果|SPの回復量)が\s*(${N})\s*倍になる`, 'g'),
    convert: (m) => numericEffect('spRecoveryMultiplier', 'SP回復量の倍率', Number(m[1]), 'multiplier'),
  },
  {
    pattern: new RegExp(String.raw`素質のSP回復効果が\s*(${N})秒ごとに\s*(${N})${END}回復になる`, 'g'),
    convert: (m) => [
      ...numericEffect('talentSpRecoveryIntervalSeconds', '素質によるSP回復の発生間隔', Number(m[1]), 'seconds', [1]),
      ...numericEffect('talentSpRecoveryAmount', '素質によるSP回復量', Number(m[2]), 'sp', [2]),
    ],
  },
  {
    pattern: new RegExp(String.raw`(素質|特性)のHP回復効果が\s*(${N})\s*(%|倍)まで上昇`, 'g'),
    convert: (m) => numericEffect(`${m[1] === '素質' ? 'talent' : 'trait'}HpRecoveryMultiplier`, `${m[1]}によるHP回復量の倍率`, Number(m[2]) / (m[3] === '%' ? 100 : 1), 'multiplier', [2]),
  },
  {
    pattern: new RegExp(String.raw`素質によるバリア付与の効果が\s*(${N})\s*%まで上昇`, 'g'),
    convert: (m) => numericEffect('talentBarrierMultiplier', '素質によるバリア付与量の倍率', Number(m[1]) / 100, 'multiplier'),
  },
  {
    pattern: new RegExp(String.raw`バリアの効果値\s*([+-])\s*(${N})\s*%${END}`, 'g'),
    convert: (m) => numericEffect('barrierCapacityBonusRatio', 'バリア効果値の増減割合', Number(`${m[1]}${m[2]}`) / 100, 'ratio', [1, 2]),
  },
  {
    pattern: new RegExp(String.raw`回復量の\s*(${N})\s*倍に値するバリアを獲得`, 'g'),
    convert: (m) => numericEffect('healingConvertedBarrierMultiplier', 'HP回復量に対するバリア変換倍率', Number(m[1]), 'multiplier'),
  },
  {
    pattern: new RegExp(String.raw`(?:反撃の発動最短間隔が攻撃間隔|反撃の最小間隔は通常攻撃間隔)の\s*(${N})\s*%${END}`, 'g'),
    convert: (m) => numericEffect('counterattackIntervalMultiplier', '攻撃間隔を基準とする反撃の最短間隔の倍率', Number(m[1]) / 100, 'multiplier'),
  },
)

export const STAT_RULES: Rule[] = [...COMPOSITE_RULES, ...rules, ...simpleStatRules]
