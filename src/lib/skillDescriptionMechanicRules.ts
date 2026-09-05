import { BARE_NUMBER_START, NUMBER, NUMBER_END, countEffect, numericEffect, type Rule } from './skillDescriptionRuleTypes.ts'

const CHANGE_COUNTS: Record<string, [string, string]> = {
  浮遊ユニットの数: ['floatingUnitCountBonus', '浮遊ユニットの追加数'],
  ブロック数: ['blockCountBonus', 'ブロック数の増減'],
  治療対象数: ['healingTargetCountBonus', '治療対象数の増減'],
  同時治療人数: ['healingTargetCountBonus', '治療対象数の増減'],
  治療の跳躍回数: ['healingBounceCountBonus', '治療の跳躍回数の増減'],
}
const EXACT_COUNTS: Record<string, [string, string]> = {
  浮遊ユニットの数: ['floatingUnitCount', '浮遊ユニット数'],
  ブロック数: ['blockCount', 'ブロック数'],
  治療対象数: ['healingTargetCount', '治療対象数'],
  同時治療人数: ['healingTargetCount', '治療対象数'],
  治療の跳躍回数: ['healingBounceCount', '治療の跳躍回数'],
}
const TALENTS: Record<string, string> = { 第一素質: 'firstTalent', 第二素質: 'secondTalent', 素質: 'talent', 特性: 'trait' }
const countNames = Object.keys(CHANGE_COUNTS).join('|')
const probability = (key: string, label: string, text: string, groups = [1]) => Number(text) <= 100
  ? numericEffect(key, label, Number(text) / 100, 'fraction', groups) : []

export const MECHANIC_RULES: Rule[] = [
  {
    pattern: new RegExp(`(${countNames})(?:が|は)?(?:さらに)?\\s*([+-])\\s*(${NUMBER})${NUMBER_END}(?:体|人)?`, 'g'),
    convert: (m) => countEffect(...CHANGE_COUNTS[m[1]], Number(`${m[2]}${m[3]}`), [2, 3], -Number.MAX_SAFE_INTEGER),
  },
  {
    pattern: new RegExp(`(${countNames})(?:が|は|を)\\s*(${NUMBER})${NUMBER_END}(?:体|人)?(?:になる|になり|に変更|に増加|に減少|まで増加|まで減少)`, 'g'),
    convert: (m) => countEffect(...EXACT_COUNTS[m[1]], Number(m[2]), [2]),
  },
  {
    pattern: new RegExp(`(${countNames})(?:が|を)?\\s*(${NUMBER})${NUMBER_END}(?:体|人)?(増加|減少)`, 'g'),
    convert: (m) => countEffect(...CHANGE_COUNTS[m[1]], Number(m[2]) * (m[3] === '減少' ? -1 : 1), [2], -Number.MAX_SAFE_INTEGER),
  },
  {
    pattern: new RegExp(`${BARE_NUMBER_START}(${NUMBER})回(?:まで)?チャージ可能`, 'g'),
    convert: (m) => countEffect('skillChargeCount', 'スキルのチャージ可能回数', Number(m[1]), [1], 1),
  },
  {
    pattern: new RegExp(`(?:発動可能回数|使用可能回数)(?:は|が)?\\s*(${NUMBER})回`, 'g'),
    convert: (m) => countEffect('skillUseLimit', 'スキルの使用可能回数', Number(m[1])),
  },
  {
    pattern: new RegExp(`${BARE_NUMBER_START}(${NUMBER})回まで(?:使用|発動)可能`, 'g'),
    convert: (m) => countEffect('skillUseLimit', 'スキルの使用可能回数', Number(m[1])),
  },
  {
    pattern: new RegExp(`合計\\s*(${NUMBER})(?:発|本)の(?:弾薬|銃弾|水弾|矢)を撃ち切るとスキルが終了`, 'g'),
    convert: (m) => countEffect('skillAmmoCount', 'スキルの弾薬数', Number(m[1]), [1], 1),
  },
  {
    pattern: new RegExp(`${BARE_NUMBER_START}(?:最大)?(${NUMBER})回まで(?:効果)?(?:重複可能|重複する|重複し)`, 'g'),
    convert: (m) => countEffect('effectStackLimit', '効果の重複上限', Number(m[1]), [1], 1),
  },
  {
    pattern: new RegExp(`(?:攻撃範囲|攻撃距離)\\s*([+-])\\s*(${NUMBER})${NUMBER_END}(?:マス)?`, 'g'),
    convert: (m) => Number.isSafeInteger(Number(m[2]))
      ? numericEffect('attackRangeExtension', '攻撃範囲の増減', Number(`${m[1]}${m[2]}`), 'cells', [1, 2]) : [],
  },
  {
    pattern: new RegExp(`(罠|召喚物|支援装置|装置|ウェルカムマット|碁石|高信頼性バッテリー|鉱石「[^」]+」|「[^」]+」)を\\s*(${NUMBER})(個|体)獲得(?:する|し)?`, 'g'),
    convert: (m) => countEffect('resourceCountGained', `${m[1]}の獲得数`, Number(m[2]), [2]),
  },
  {
    pattern: new RegExp(`シールド(?:を)?\\s*(${NUMBER})枚獲得(?:する|し)?`, 'g'),
    convert: (m) => countEffect('shieldCountGained', 'シールドの獲得枚数', Number(m[1])),
  },
  {
    pattern: new RegExp(`(第一素質|第二素質|素質|特性)の効果(?:が|を)\\s*(${NUMBER})倍まで上昇(?:する|し)?`, 'g'),
    convert: (m) => numericEffect(`${TALENTS[m[1]]}EffectMultiplier`, `${m[1]}の効果倍率`, Number(m[2]), 'multiplier', [2]),
  },
  {
    pattern: new RegExp(`(第一素質|第二素質|素質|特性)の効果(?:が|を)\\s*(${NUMBER})%まで上昇(?:する|し)?`, 'g'),
    convert: (m) => numericEffect(`${TALENTS[m[1]]}EffectScale`, `${m[1]}の効果割合`, Number(m[2]) / 100, 'fraction', [2]),
  },
  {
    pattern: new RegExp(`使用上限\\s*(${NUMBER})回`, 'g'),
    convert: (m) => countEffect('skillUseLimit', 'スキルの使用可能回数', Number(m[1])),
  },
  {
    pattern: new RegExp(`コインの所持上限[:：]\\s*(${NUMBER})${NUMBER_END}`, 'g'),
    convert: (m) => countEffect('coinCapacity', 'コインの所持上限', Number(m[1])),
  },
  {
    pattern: new RegExp(`コインを\\s*(${NUMBER})枚消費(?:する|し)?`, 'g'),
    convert: (m) => countEffect('coinCost', '消費するコインの枚数', Number(m[1])),
  },
  {
    pattern: new RegExp(`(第一素質|第二素質)を即座に\\s*(${NUMBER})回発動(?:する|し)?`, 'g'),
    convert: (m) => countEffect(`${TALENTS[m[1]]}ActivationCount`, `${m[1]}の発動回数`, Number(m[2]), [2]),
  },
  {
    pattern: new RegExp(`(第一素質|第二素質)の効果対象が\\s*(${NUMBER})体追加され(?:る)?`, 'g'),
    convert: (m) => countEffect(`${TALENTS[m[1]]}TargetCountBonus`, `${m[1]}の追加対象数`, Number(m[2]), [2]),
  },
  {
    pattern: new RegExp(`${BARE_NUMBER_START}(${NUMBER})%の確率で発動失敗(?:になる|になり)?`, 'g'),
    convert: (m) => probability('activationFailureChance', '発動の失敗確率', m[1]),
  },
  {
    pattern: new RegExp(`${BARE_NUMBER_START}(${NUMBER})%の確率で`, 'g'),
    convert: (m) => probability('effectProbability', '説明文に明記された発生確率', m[1]),
  },
  {
    pattern: new RegExp(`(第一素質|第二素質|素質|特性)の(?:発動率|発動確率)(?:が|を)\\s*(${NUMBER})(倍|%)まで上昇(?:する|し)?`, 'g'),
    convert: (m) => numericEffect(`${TALENTS[m[1]]}${m[3] === '倍' ? 'TriggerChanceMultiplier' : 'TriggerChance'}`,
      `${m[1]}の発動確率${m[3] === '倍' ? '倍率' : ''}`, Number(m[2]) / (m[3] === '%' ? 100 : 1), m[3] === '%' ? 'fraction' : 'multiplier', [2]),
  },
  {
    pattern: new RegExp(`(第一素質|第二素質|素質)(?:の|による)(攻撃力上昇|防御力無視確率|足止めの継続時間|足止めの発動確率|被ダメージ上昇|加護)(?:の)?(?:効果)?(?:が|を)\\s*(${NUMBER})倍まで上昇(?:する|し)?`, 'g'),
    convert: (m) => numericEffect('talentModifierMultiplier', `${m[1]}の${m[2]}の倍率`, Number(m[3]), 'multiplier', [3]),
  },
  {
    pattern: new RegExp(`攻撃範囲が(前方|自身の隣接)\\s*(${NUMBER})マス(?:になる|になり)`, 'g'),
    convert: (m) => Number.isSafeInteger(Number(m[2]))
      ? numericEffect(m[1] === '前方' ? 'forwardAttackRangeCells' : 'adjacentAttackRangeCells', `${m[1]}の攻撃範囲`, Number(m[2]), 'cells', [2]) : [],
  },
  {
    pattern: new RegExp(`(?:通常攻撃が)?最大\\s*(${NUMBER})回まで跳躍(?:する|し)?`, 'g'),
    convert: (m) => countEffect('chainBounceLimit', '跳躍回数の上限', Number(m[1])),
  },
  {
    pattern: new RegExp(`${BARE_NUMBER_START}(?:最大)?\\s*(${NUMBER})体までの敵を貫通(?:する|し)?`, 'g'),
    convert: (m) => countEffect('piercingTargetLimit', '貫通する敵の上限', Number(m[1])),
  },
  {
    pattern: new RegExp(`味方(?:最大)?\\s*(${NUMBER})(?:人|体|名)(?=のHPを|に対する治療行動|を同時に(?:治療|回復))`, 'g'),
    convert: (m) => countEffect('healingTargetCount', '治療対象数', Number(m[1]), [1], 1),
  },
  {
    pattern: new RegExp(`(?:この)?バリア(?:の効果)?(?:は|が)\\s*(${NUMBER})秒(?:間)?持続(?:する|し)?`, 'g'),
    convert: (m) => numericEffect('barrierDurationSeconds', 'バリアの持続時間', Number(m[1]), 'seconds'),
  },
  {
    pattern: new RegExp(`(?:詠唱を|詠唱時間(?:は|が)?)\\s*(${NUMBER})秒(?:間)?(?:行った|になる|になり)`, 'g'),
    convert: (m) => numericEffect('castTimeSeconds', '詠唱時間', Number(m[1]), 'seconds'),
  },
  {
    pattern: new RegExp(`${BARE_NUMBER_START}(${NUMBER})秒(?:間)?(?:攻撃停止|攻撃できなくな(?:る|り)|攻撃しなくな(?:る|り))`, 'g'),
    convert: (m) => numericEffect('attackDisabledDurationSeconds', '攻撃を停止する時間', Number(m[1]), 'seconds'),
  },
  {
    pattern: new RegExp(`追加でもう\\s*(${NUMBER})回治療`, 'g'),
    convert: (m) => countEffect('additionalHealingCount', '追加の治療回数', Number(m[1])),
  },
  {
    pattern: new RegExp(`跳躍治療を追加で\\s*(${NUMBER})回`, 'g'),
    convert: (m) => countEffect('additionalHealingBounceCount', '追加の跳躍治療回数', Number(m[1])),
  },
  {
    pattern: new RegExp(`治療対象の周囲最大\\s*(${NUMBER})体`, 'g'),
    convert: (m) => countEffect('secondaryHealingTargetCount', '治療対象の周囲への追加治療対象数', Number(m[1])),
  },
  {
    pattern: new RegExp(`追加で離陸したオペレーター\\s*(${NUMBER})名を治療`, 'g'),
    convert: (m) => countEffect('additionalAirborneHealingTargetCount', '離陸したオペレーターへの追加治療対象数', Number(m[1])),
  },
  {
    pattern: new RegExp(`コーティングデバイスのチャージを\\s*(${NUMBER})回回復`, 'g'),
    convert: (m) => countEffect('coatingDeviceChargeRecovery', 'コーティングデバイスのチャージ回復数', Number(m[1])),
  },
  {
    pattern: new RegExp(`(第一素質|第二素質)の効果を\\s*(${NUMBER})回分失う`, 'g'),
    convert: (m) => countEffect(`${TALENTS[m[1]]}ChargeLoss`, `${m[1]}の効果の消費回数`, Number(m[2]), [2]),
  },
  {
    pattern: new RegExp(`(${countNames})(?:が|は)\\s*(${NUMBER})(?=[、。\\n]|$)`, 'g'),
    convert: (m) => countEffect(...EXACT_COUNTS[m[1]], Number(m[2]), [2]),
  },
  {
    pattern: new RegExp(`「([^」]+)」(?:の数)?(?:が|を)?(?:追加で)?\\s*(${NUMBER})体(?:増加|追加)`, 'g'),
    convert: (m) => countEffect('namedUnitCountBonus', `${m[1]}の追加数`, Number(m[2]), [2]),
  },
  {
    pattern: new RegExp(`「([^」]+)」(?:を)?(?:追加で)?\\s*(${NUMBER})体召喚(?:する|し)?`, 'g'),
    convert: (m) => countEffect('summonedUnitCount', `${m[1]}の召喚数`, Number(m[2]), [2]),
  },
  {
    pattern: new RegExp(`「([^」]+)」\\s*(${NUMBER})体(?:が|を)(?:配置可能にな(?:る|り)|退場させ)`, 'g'),
    convert: (m) => countEffect(m[0].includes('退場') ? 'retreatedUnitCount' : 'deployableUnitCount', `${m[1]}の${m[0].includes('退場') ? '退場数' : '配置可能数'}`, Number(m[2]), [2]),
  },
  {
    pattern: new RegExp(`「([^」]+)」の上限\\s*([+-])\\s*(${NUMBER})${NUMBER_END}`, 'g'),
    convert: (m) => countEffect('resourceCapacityBonus', `${m[1]}の上限の増減`, Number(`${m[2]}${m[3]}`), [2, 3], -Number.MAX_SAFE_INTEGER),
  },
  {
    pattern: new RegExp(`配置可能数(?:は|が|を)\\s*(${NUMBER})${NUMBER_END}(消費|返還)`, 'g'),
    convert: (m) => countEffect(m[2] === '消費' ? 'deploymentSlotCost' : 'deploymentSlotReturn', `配置枠の${m[2]}数`, Number(m[1])),
  },
  {
    pattern: new RegExp(`${BARE_NUMBER_START}(${NUMBER})回の作戦につき発動上限\\s*(${NUMBER})回`, 'g'),
    convert: (m) => [
      ...countEffect('useLimitBattleCount', '使用上限の対象となる作戦数', Number(m[1]), [1], 1),
      ...countEffect('skillUseLimit', 'スキルの使用可能回数', Number(m[2]), [2]),
    ],
  },
  {
    pattern: new RegExp(`${BARE_NUMBER_START}(${NUMBER})秒(?:内発動上限|間に最大)\\s*(${NUMBER})回(?:まで発動)?`, 'g'),
    convert: (m) => [
      ...numericEffect('activationLimitWindowSeconds', '発動回数の上限を数える期間', Number(m[1]), 'seconds'),
      ...countEffect('activationLimitCount', '期間内の発動回数の上限', Number(m[2]), [2]),
    ],
  },
  {
    pattern: new RegExp(`スキル発動中\\s*(${NUMBER})回限り`, 'g'),
    convert: (m) => countEffect('activationEffectLimitCount', 'スキル発動中の効果回数の上限', Number(m[1])),
  },
  {
    pattern: new RegExp(`スキル発動時間を\\s*(${NUMBER})秒延長可能`, 'g'),
    convert: (m) => numericEffect('skillDurationExtensionLimitSeconds', 'スキル時間の延長上限', Number(m[1]), 'seconds'),
  },
  {
    pattern: new RegExp(`(?:配置(?:して|から)|${BARE_NUMBER_START})\\s*(${NUMBER})秒後(?:に)?(?:強制退場(?:となる)?|自動撤退|消滅する)`, 'g'),
    convert: (m) => numericEffect('forcedRetreatDelaySeconds', '自動退場までの時間', Number(m[1]), 'seconds'),
  },
  {
    pattern: new RegExp(`${BARE_NUMBER_START}(${NUMBER})秒間スキル効果を保持(?:する|し)?`, 'g'),
    convert: (m) => numericEffect('retainedSkillEffectDurationSeconds', 'スキル効果の保持時間', Number(m[1]), 'seconds'),
  },
  {
    pattern: new RegExp(`(機動防盾)の継続時間\\s*([+-])\\s*(${NUMBER})秒`, 'g'),
    convert: (m) => numericEffect('deployableDurationDeltaSeconds', `${m[1]}の継続時間の増減`, Number(`${m[2]}${m[3]}`), 'seconds', [2, 3]),
  },
]
