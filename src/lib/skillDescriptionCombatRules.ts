import { BARE_NUMBER_START, NUMBER, NUMBER_END, countEffect, numericEffect, type EffectValue, type Rule } from './skillDescriptionRuleTypes.ts'

const DAMAGE_TYPE = '(物理|術|確定|元素)'
const DAMAGE_TYPES: Record<string, string> = { 物理: 'physical', 術: 'arts', 確定: 'true', 元素: 'elemental' }
const BASIS = '(攻撃力|防御力|最大HP|HP最大値|現在HP|治療量)'
const BASIS_EFFECTS: Record<string, [string, string, string]> = {
  攻撃力: ['attackDamageMultiplier', '攻撃力に対するダメージ倍率', 'multiplier'],
  防御力: ['defenseDamageMultiplier', '防御力に対するダメージ倍率', 'multiplier'],
  最大HP: ['maxHpDamageRatio', '最大HPに対するダメージ割合', 'fraction'],
  HP最大値: ['maxHpDamageRatio', '最大HPに対するダメージ割合', 'fraction'],
  現在HP: ['currentHpDamageRatio', '現在HPに対するダメージ割合', 'fraction'],
  治療量: ['healingDamageMultiplier', '治療量に対するダメージ倍率', 'multiplier'],
}
const CONTROL = '(スタン|足止め|バインド|寒冷|凍結|浮遊|睡眠|沈黙|恐怖|戦慄|レジスト)'
const CONTROL_KEYS: Record<string, [string, string]> = {
  スタン: ['stunDurationSeconds', 'スタン時間'], 足止め: ['slowDurationSeconds', '足止め時間'],
  バインド: ['bindDurationSeconds', 'バインド時間'], 寒冷: ['coldDurationSeconds', '寒冷時間'],
  凍結: ['freezeDurationSeconds', '凍結時間'], 浮遊: ['levitateDurationSeconds', '浮遊時間'],
  睡眠: ['sleepDurationSeconds', '睡眠時間'], 沈黙: ['silenceDurationSeconds', '特殊能力の無効化時間'],
  恐怖: ['fearDurationSeconds', '恐怖時間'], 戦慄: ['trembleDurationSeconds', '戦慄時間'],
  レジスト: ['resistDurationSeconds', 'レジスト時間'],
}
// Do not extract a number from a range, formula, approximation, or negative value.
const START = `${BARE_NUMBER_START}(?<![~〜～]\s*)`
const NEGATIVE = /^(?:ない|なく|ず|ません|させない|させず|しない|せず|になら|にはなら|を無効|無効|耐性|への耐性|を解除|を軽減|を吸収)/

function typeEffect(type: string, group: number): EffectValue {
  return { key: 'damageType', label: 'ダメージ種別', value: DAMAGE_TYPES[type], unit: '', sourceGroups: [group] }
}

function damageEffects(basis: string, amount: string, type: string | undefined, amountGroup: number, typeGroup: number): EffectValue[] {
  const [key, label, unit] = BASIS_EFFECTS[basis]
  const values = numericEffect(key, label, Number(amount) / 100, unit, [amountGroup])
  if (values.length && type) values.push(typeEffect(type, typeGroup))
  return values
}

function controlEffect(type: string, amount: string, group: number): EffectValue[] {
  const [key, label] = CONTROL_KEYS[type]
  return numericEffect(key, label, Number(amount), 'seconds', [group])
}

function notNegated(match: RegExpMatchArray, description: string): boolean {
  const start = match.index ?? 0
  return !NEGATIVE.test(description.slice(start + match[0].length))
    && !/(?:約|およそ|最大|最低|以上|未満|[~〜～])\s*$/.test(description.slice(Math.max(0, start - 8), start))
}

// A cadence is retained separately from damage per tick. Only bridge target or
// owner phrases; do not borrow a later damage clause after a recovery/charge action.
function hasFollowingDamage(match: RegExpMatchArray, description: string): boolean {
  const rest = description.slice((match.index ?? 0) + match[0].length)
  const damage = /^(?<prefix>[^。\n;；]{0,100}?)(?:(?:攻撃力|防御力|最大HP|HP最大値|現在HP)(?:の)?\s*\d+(?:\.\d+)?\s*%(?:分)?の?(?:範囲)?(?:物理|術|確定|元素)?(?:範囲)?ダメージ|\d+(?:\.\d+)?(?:の)?(?:物理|術|確定|元素)(?:範囲)?ダメージ)/.exec(rest)
  if (!damage) return false
  return !/(?:回復|治療|失|消費|獲得|SP|弾薬|チャージ|蓄積|上限|秒|効果時間終了|スキル終了)/.test(damage.groups?.prefix ?? '')
    && !NEGATIVE.test(rest.slice(damage[0].length))
}

function nextNormalAttack(match: RegExpMatchArray, description: string): boolean {
  const start = match.index ?? 0
  const sentence = description.slice(0, start).split(/[。\n]/).at(-1) ?? ''
  return /(?:次の通常攻撃時|(?:通常)?攻撃時)[^。\n]*$/.test(sentence)
}

export const COMBAT_RULES: Rule[] = [
  {
    pattern: new RegExp(`${START}(?:(${NUMBER})秒間)?(${NUMBER})%の(?:【)?(対術脆弱|脆弱|加護)(?:】)?(?:状態)?(?:を(${NUMBER})秒間)?(?:を)?(?:付与する|付与し|付与|獲得する|獲得し|獲得)?`, 'g'),
    accepts: notNegated,
    convert: (match) => {
      const prefix = match[3] === '加護' ? 'shelter' : match[3] === '対術脆弱' ? 'artsVulnerability' : 'vulnerability'
      const result = numericEffect(`${prefix}Ratio`, `${match[3]}の効果値`, Number(match[2]) / 100, 'fraction', [2])
      const duration = match[1] ?? match[4]
      if (duration !== undefined) result.push(...numericEffect(`${prefix}DurationSeconds`, `${match[3]}の持続時間`, Number(duration), 'seconds', [1, 4]))
      return result
    },
  },
  {
    pattern: new RegExp(`加護(?:の効果)?が(${NUMBER})倍(?:まで上昇|になる|になり)`, 'g'),
    accepts: notNegated,
    convert: (match) => numericEffect('shelterEffectMultiplier', '加護の効果倍率', Number(match[1]), 'multiplier'),
  },
  {
    pattern: new RegExp(`余震がさらに(${NUMBER})回発生(?:する|し)`, 'g'),
    accepts: notNegated,
    convert: (match) => countEffect('aftershockCountBonus', '追加の余震回数', Number(match[1]), [1]),
  },
  {
    pattern: new RegExp(`(?:装弾数が(${NUMBER})発になる|弾薬数は(${NUMBER})発)`, 'g'),
    accepts: notNegated,
    convert: (match) => countEffect('skillAmmoCount', 'スキルの弾薬数', Number(match[1] ?? match[2]), [1, 2]),
  },
  {
    pattern: new RegExp(`合計(${NUMBER})発の弾薬が尽きるとスキル(?:が)?終了`, 'g'),
    accepts: notNegated,
    convert: (match) => countEffect('skillAmmoCount', 'スキルの弾薬数', Number(match[1]), [1], 1),
  },
  {
    pattern: new RegExp(`攻撃するたびに(?:水弾|弾薬)が(${NUMBER})発消費され(?:る)?`, 'g'),
    accepts: notNegated,
    convert: (match) => countEffect('ammoConsumedPerAttack', '攻撃ごとの弾薬消費数', Number(match[1]), [1]),
  },
  {
    pattern: new RegExp(`${START}(${NUMBER})発の弾薬を追加で獲得(?:する)?`, 'g'),
    accepts: notNegated,
    convert: (match) => countEffect('ammoRecoveryCount', '弾薬の補充数', Number(match[1]), [1]),
  },
  {
    pattern: new RegExp(`弾薬を(${NUMBER})発(?:補充|獲得)(?:する)?`, 'g'),
    accepts: notNegated,
    convert: (match) => countEffect('ammoRecoveryCount', '弾薬の補充数', Number(match[1]), [1]),
  },
  {
    pattern: new RegExp(`同時に(${NUMBER})個の旋回投擲物を放(?:つ|ち)`, 'g'),
    accepts: notNegated,
    convert: (match) => countEffect('rotatingProjectileCount', '同時に放つ旋回投擲物の数', Number(match[1]), [1], 1),
  },
  {
    pattern: new RegExp(`攻撃時に旋回投擲物を追加で(${NUMBER})個放(?:つ|ち)`, 'g'),
    accepts: notNegated,
    convert: (match) => countEffect('rotatingProjectileCountBonus', '追加の旋回投擲物の数', Number(match[1]), [1]),
  },
  {
    pattern: new RegExp(`攻撃するたびに矢を(${NUMBER})本放(?:つ|ち)`, 'g'),
    accepts: notNegated,
    convert: (match) => countEffect('arrowsPerAttack', '攻撃ごとに放つ矢の数', Number(match[1]), [1], 1),
  },
  {
    pattern: new RegExp(`攻撃の最大跳躍回数が(${NUMBER})(?:回)?になる`, 'g'),
    accepts: notNegated,
    convert: (match) => countEffect('maximumChainCount', '攻撃の最大跳躍回数', Number(match[1]), [1]),
  },
  {
    pattern: new RegExp(`攻撃の回数が(${NUMBER})回になる`, 'g'),
    accepts: notNegated,
    convert: (match) => countEffect('attackSequenceHitCount', '攻撃回数', Number(match[1]), [1], 1),
  },
  {
    pattern: new RegExp(`前方に(${NUMBER})回斬撃を繰り出(?:す|し)`, 'g'),
    accepts: notNegated,
    convert: (match) => countEffect('slashCount', '斬撃回数', Number(match[1]), [1], 1),
  },
  {
    pattern: new RegExp(`(物理|術|確定|元素)?(?:の)?与ダメージ\\s*([+-])\\s*(${NUMBER})%`, 'g'),
    accepts: notNegated,
    convert: (match) => numericEffect(match[1] ? `${DAMAGE_TYPES[match[1]]}DamageDealtBonusRatio` : 'damageDealtBonusRatio', `${match[1] ?? ''}与ダメージの増減割合`, Number(`${match[2]}${match[3]}`) / 100, 'ratio', [2, 3]),
  },
  {
    pattern: new RegExp(`与(?:える)?(物理|術|確定|元素)?ダメージ(?:が|は)?\\s*(${NUMBER})%(?:上昇|増加)(?:する|し)?`, 'g'),
    accepts: notNegated,
    convert: (match) => numericEffect(match[1] ? `${DAMAGE_TYPES[match[1]]}DamageDealtBonusRatio` : 'damageDealtBonusRatio', `${match[1] ?? ''}与ダメージの増加割合`, Number(match[2]) / 100, 'ratio', [2]),
  },
  {
    pattern: new RegExp(`与(?:える)?(物理|術|確定|元素)?ダメージ(?:が|は)?\\s*(${NUMBER})%(?:まで上昇|になる|になり)`, 'g'),
    accepts: notNegated,
    convert: (match) => numericEffect(match[1] ? `${DAMAGE_TYPES[match[1]]}DamageDealtMultiplier` : 'damageDealtMultiplier', `${match[1] ?? ''}与ダメージの倍率`, Number(match[2]) / 100, 'multiplier', [2]),
  },
  {
    pattern: new RegExp(`与ダメージ(?:が|は)(徐々に)?\\s*(${NUMBER})倍(?:まで上昇|になる|になり|に上昇)`, 'g'),
    accepts: notNegated,
    convert: (match) => numericEffect(match[1] ? 'maximumDamageDealtMultiplier' : 'damageDealtMultiplier', match[1] ? '与ダメージ倍率の上限' : '与ダメージの倍率', Number(match[2]), 'multiplier', [2]),
  },
  {
    pattern: new RegExp(`与ダメージ(?:が|は)攻撃力(?:の)?\\s*(${NUMBER})%まで上昇`, 'g'),
    accepts: notNegated,
    convert: (match) => numericEffect('attackDamageMultiplier', '攻撃力に対するダメージ倍率', Number(match[1]) / 100, 'multiplier'),
  },
  {
    pattern: new RegExp(`余震のダメージが攻撃力の\\s*(${NUMBER})%(?:になる|になり)`, 'g'),
    accepts: notNegated,
    convert: (match) => numericEffect('aftershockAttackDamageMultiplier', '攻撃力に対する余震のダメージ倍率', Number(match[1]) / 100, 'multiplier'),
  },
  {
    pattern: new RegExp(`最後の一撃のダメージ係数は\\s*(${NUMBER})倍`, 'g'),
    accepts: notNegated,
    convert: (match) => numericEffect('lastHitDamageMultiplier', '最後の一撃のダメージ倍率', Number(match[1]), 'multiplier'),
  },
  {
    pattern: /ダメージ計算係数(?:が)?倍増(?:する|し)?/g,
    accepts: notNegated,
    convert: () => numericEffect('damageCoefficientMultiplier', 'ダメージ計算係数の倍率', 2, 'multiplier', []),
  },
  {
    pattern: /周囲の敵に半分のダメージを与え(?:る)?/g,
    accepts: notNegated,
    convert: () => numericEffect('secondaryDamageMultiplier', '周囲の敵に与えるダメージの倍率', 0.5, 'multiplier', []),
  },
  {
    pattern: new RegExp(`${START}(${NUMBER})秒(?:間|の間)[、,\\s]*(?=毎秒|${NUMBER}秒ごと)`, 'g'),
    accepts: (match, text) => {
      const rest = text.slice((match.index ?? 0) + match[0].length)
      const cadence = /^(?:毎秒|\d+(?:\.\d+)?秒ごと(?:に)?)/.exec(rest)
      if (!cadence) return false
      const located = Object.assign(cadence, { index: (match.index ?? 0) + match[0].length })
      return hasFollowingDamage(located, text) && notNegated(match, text)
    },
    convert: (match) => numericEffect('damageDurationSeconds', '継続ダメージの持続時間', Number(match[1]), 'seconds'),
  },
  {
    pattern: new RegExp(`${START}(${NUMBER})秒ごと(?:に)?`, 'g'),
    accepts: (match, text) => notNegated(match, text) && hasFollowingDamage(match, text),
    convert: (match) => numericEffect('damageIntervalSeconds', 'ダメージの発生間隔', Number(match[1]), 'seconds'),
  },
  {
    pattern: /毎秒/g,
    accepts: hasFollowingDamage,
    convert: () => numericEffect('damageIntervalSeconds', 'ダメージの発生間隔', 1, 'seconds', []),
  },
  {
    pattern: new RegExp(`攻撃力(?:の)?\\s*(${NUMBER})\\s*%以上の(?:範囲)?${DAMAGE_TYPE}?ダメージ(?:を与える|を与え)`, 'g'),
    accepts: notNegated,
    convert: (match) => {
      const values = numericEffect('minimumAttackDamageMultiplier', '攻撃力に対する最低ダメージ倍率', Number(match[1]) / 100, 'multiplier')
      if (values.length && match[2]) values.push(typeEffect(match[2], 2))
      return values
    },
  },
  {
    pattern: new RegExp(`${BASIS}(?:の)?\\s*(${NUMBER})\\s*%(?:分)?の?(?:範囲)?${DAMAGE_TYPE}?(?:範囲)?ダメージ(?:を与える|を与え|を受ける|を受け)?`, 'g'),
    accepts: notNegated,
    convert: (match) => damageEffects(match[1], match[2], match[3], 2, 3),
  },
  {
    pattern: new RegExp(`攻撃力(?:の)?\\s*(${NUMBER})\\s*%(?:で)?の(?=${NUMBER}(?:回連続(?:術)?攻撃|連撃))`, 'g'),
    accepts: notNegated,
    convert: (match) => numericEffect('attackDamageMultiplier', '攻撃力に対するダメージ倍率', Number(match[1]) / 100, 'multiplier'),
  },
  {
    pattern: new RegExp(`攻撃力(?:の)?\\s*(${NUMBER})\\s*%の${DAMAGE_TYPE}攻撃(?=を(?:順番に行|行|与え))`, 'g'),
    accepts: notNegated,
    convert: (match) => damageEffects('攻撃力', match[1], match[2], 1, 2),
  },
  {
    pattern: new RegExp(`${START}(${NUMBER})(?:の)?${DAMAGE_TYPE}(?:範囲)?ダメージ(?:を与える|を与え|を受ける|を受け)`, 'g'),
    accepts: notNegated,
    convert: (match) => [...numericEffect('damageAmount', 'ダメージ量', Number(match[1]), 'damage'), typeEffect(match[2], 2)],
  },
  {
    pattern: new RegExp(`(攻撃力|術ダメージ|与えた術ダメージ|与ダメージ)の\\s*(${NUMBER})\\s*%の(壊死|灼熱|神経|侵蝕)損傷(?:を追加で与える|を与える|を与え|を受ける|を受け)?`, 'g'),
    accepts: notNegated,
    convert: (match) => {
      const base = match[1] === '攻撃力' ? 'Attack' : /術/.test(match[1]) ? 'ArtsDamage' : 'Damage'
      const kind = ({ 壊死: 'necrosis', 灼熱: 'burn', 神経: 'neural', 侵蝕: 'corrosion' } as Record<string, string>)[match[3]]
      return numericEffect(`${kind}Buildup${base}Ratio`, `${match[1]}に対する${match[3]}損傷の割合`, Number(match[2]) / 100, 'fraction', [2])
    },
  },
  {
    pattern: new RegExp(`${START}(${NUMBER})秒(?:間)?(?:の)?${CONTROL}(?:状態)?(?:を付与する|を付与|にさせる|にする|になる|にし|させる|させ|する|し)?`, 'g'),
    accepts: (match, text) => notNegated(match, text) && !/^(?:になら|にしない|状態を無効)/.test(text.slice((match.index ?? 0) + match[0].length)),
    convert: (match) => controlEffect(match[2], match[1], 1),
  },
  {
    pattern: new RegExp(`${CONTROL}(?:状態)?を\\s*(${NUMBER})秒(?:間)?(?:付与する|付与|与える)`, 'g'),
    accepts: (match, text) => notNegated(match, text) && !/^(?:延長|短縮|増加|減少)/.test(text.slice((match.index ?? 0) + match[0].length)),
    convert: (match) => controlEffect(match[1], match[2], 2),
  },
  {
    pattern: new RegExp(`${CONTROL}(?:の)?(?:効果時間|継続時間|持続時間)(?:が|は|を)?\\s*(${NUMBER})秒(?:間)?(?:になる|になり|に延長|に短縮)?`, 'g'),
    accepts: (match, text) => notNegated(match, text) && !/^(?:延長|短縮|増加|減少)/.test(text.slice((match.index ?? 0) + match[0].length)),
    convert: (match) => controlEffect(match[1], match[2], 2),
  },
  {
    pattern: new RegExp(`${CONTROL}\\s*(${NUMBER})秒(?:間)?(?=[/／、,。\\n]|$)`, 'g'),
    accepts: notNegated,
    convert: (match) => controlEffect(match[1], match[2], 2),
  },
  {
    pattern: new RegExp(`(?:一部の)?特殊能力を\\s*(${NUMBER})秒(?:間)?無効化(?:する)?`, 'g'),
    accepts: notNegated,
    convert: (match) => controlEffect('沈黙', match[1], 1),
  },
  {
    pattern: new RegExp(`${START}(${NUMBER})(?:回(?:連続)?(?:${DAMAGE_TYPE})?攻撃|連撃)(?:になる|になり|となる|となり|に変化し|に変化する)`, 'g'),
    accepts: notNegated,
    convert: (match) => {
      const result = countEffect('hitsPerAttack', '1回の攻撃のヒット数', Number(match[1]), [1], 1)
      if (result.length && match[2]) result.push(typeEffect(match[2], 2))
      return result
    },
  },
  {
    pattern: new RegExp(`${START}(${NUMBER})回連続(?:で)?(?=(?:自身の)?攻撃力|攻撃する)`, 'g'),
    accepts: (match, text) => notNegated(match, text) && nextNormalAttack(match, text),
    convert: (match) => countEffect('hitsPerAttack', '1回の攻撃のヒット数', Number(match[1]), [1], 1),
  },
  {
    pattern: new RegExp(`${START}(${NUMBER})回連続(?:で)?(?=(?:自身の)?攻撃力|攻撃する)`, 'g'),
    accepts: (match, text) => notNegated(match, text) && !nextNormalAttack(match, text),
    convert: (match) => countEffect('attackSequenceHitCount', '連続攻撃のヒット数', Number(match[1]), [1], 1),
  },
  {
    pattern: new RegExp(`通常攻撃が(?:敵に)?(${NUMBER})回ダメージを与え(?:る)?`, 'g'),
    accepts: notNegated,
    convert: (match) => countEffect('hitsPerAttack', '1回の攻撃のヒット数', Number(match[1]), [1], 1),
  },
  {
    pattern: new RegExp(`追加で(?:もう|さらに)?(${NUMBER})回ダメージを与え(?:る)?`, 'g'),
    accepts: notNegated,
    convert: (match) => countEffect('damageHitCountBonus', 'ダメージ発生回数の加算値', Number(match[1]), [1], 1),
  },
  {
    pattern: new RegExp(`${START}(${NUMBER})(?:回連続攻撃|連撃)(?:を行う|を行い|で(?=ブロック))`, 'g'),
    accepts: notNegated,
    convert: (match) => countEffect('attackSequenceHitCount', '連続攻撃のヒット数', Number(match[1]), [1], 1),
  },
  {
    pattern: new RegExp(`(?<=ダメージ)を(${NUMBER})回与え(?:る)?`, 'g'),
    accepts: (match, text) => notNegated(match, text) && nextNormalAttack(match, text),
    convert: (match) => countEffect('hitsPerAttack', '1回の攻撃のヒット数', Number(match[1]), [1], 1),
  },
  {
    pattern: new RegExp(`(?<=ダメージ)を(${NUMBER})回与え(?:る)?`, 'g'),
    accepts: (match, text) => notNegated(match, text) && !nextNormalAttack(match, text),
    convert: (match) => countEffect('attackSequenceHitCount', '連続攻撃のヒット数', Number(match[1]), [1], 1),
  },
  {
    pattern: new RegExp(`${START}(${NUMBER})回砲撃を行(?:う|い)`, 'g'),
    accepts: notNegated,
    convert: (match) => countEffect('bombardmentCount', '砲撃回数', Number(match[1]), [1], 1),
  },
  {
    pattern: new RegExp(`合計(${NUMBER})回の斬撃を発動`, 'g'),
    accepts: notNegated,
    convert: (match) => countEffect('slashCount', '斬撃回数', Number(match[1]), [1], 1),
  },
  {
    pattern: new RegExp(`${START}(${NUMBER})回の斬撃を行(?:う|い)`, 'g'),
    accepts: notNegated,
    convert: (match) => countEffect('slashCount', '斬撃回数', Number(match[1]), [1], 1),
  },
  {
    pattern: new RegExp(`斬撃回数(?:が|は)(${NUMBER})回(?:になる|になり)`, 'g'),
    accepts: notNegated,
    convert: (match) => countEffect('slashCount', '斬撃回数', Number(match[1]), [1], 1),
  },
  {
    pattern: new RegExp(`(?:遠距離攻撃を(${NUMBER})回行う|(${NUMBER})回反撃を行う)`, 'g'),
    accepts: notNegated,
    convert: (match) => countEffect(match[1] ? 'attackSequenceHitCount' : 'counterattackHitCount', match[1] ? '連続攻撃のヒット数' : '反撃時の攻撃回数', Number(match[1] ?? match[2]), [1, 2], 1),
  },
  {
    pattern: new RegExp(`ダメージ発生回数\\s*([+-])\\s*(${NUMBER})${NUMBER_END}`, 'g'),
    accepts: notNegated,
    convert: (match) => Number.isInteger(Number(match[2])) ? numericEffect('damageHitCountBonus', 'ダメージ発生回数の加算値', Number(`${match[1]}${match[2]}`), 'count', [1, 2]) : [],
  },
  {
    pattern: new RegExp(`${START}(${NUMBER})体を同時に攻撃(?:する|できる|可能)?`, 'g'),
    accepts: notNegated,
    convert: (match) => countEffect('targetCount', '攻撃対象数', Number(match[1]), [1], 1),
  },
  {
    pattern: new RegExp(`(?:同時に)?最大\\s*(${NUMBER})体の敵を同時に攻撃(?:する|できる|可能)?`, 'g'),
    accepts: notNegated,
    convert: (match) => countEffect('targetCount', '攻撃対象数', Number(match[1]), [1], 1),
  },
  {
    pattern: new RegExp(`同時に最大\\s*(${NUMBER})体の敵を攻撃(?:する|できる|可能)?`, 'g'),
    accepts: notNegated,
    convert: (match) => countEffect('targetCount', '攻撃対象数', Number(match[1]), [1], 1),
  },
  {
    pattern: new RegExp(`攻撃目標数最大\\s*(${NUMBER})体`, 'g'),
    accepts: notNegated,
    convert: (match) => countEffect('targetCount', '攻撃対象数', Number(match[1]), [1], 1),
  },
  {
    pattern: new RegExp(`(?:敵(?:最大)?\\s*(${NUMBER})体|最大\\s*(${NUMBER})体の(?:地上の)?敵)(?=(?:に(?:対して)?|を対象に|を優先して)[、,\\s]*(?:${NUMBER}秒ごとに|${NUMBER}回連続で)?(?:攻撃力|防御力|最大HP|治療量|(?:術|物理|確定|元素)(?:攻撃|ダメージ)|${NUMBER}回(?:の斬撃|反撃)|遠距離攻撃))`, 'g'),
    accepts: notNegated,
    convert: (match) => countEffect('targetCount', '攻撃対象数', Number(match[1] ?? match[2]), [1, 2], 1),
  },
  {
    pattern: new RegExp(`敵(?:最大)?(${NUMBER})体を(?:ロックオンして)?攻撃(?:する|し続ける)?`, 'g'),
    accepts: (match, text) => notNegated(match, text) && !/追加で$/.test(text.slice(0, match.index ?? 0)),
    convert: (match) => countEffect('targetCount', '攻撃対象数', Number(match[1]), [1], 1),
  },
  {
    pattern: new RegExp(`追加で敵(${NUMBER})体を攻撃(?:する)?`, 'g'),
    accepts: notNegated,
    convert: (match) => countEffect('targetCountBonus', '攻撃対象数の加算値', Number(match[1]), [1], 1),
  },
  {
    pattern: new RegExp(`追加で空中にいる敵を(${NUMBER})体攻撃(?:する)?`, 'g'),
    accepts: notNegated,
    convert: (match) => countEffect('additionalAirborneTargetCount', '追加で攻撃する空中の敵の数', Number(match[1]), [1], 1),
  },
  {
    pattern: new RegExp(`敵(?:最大)?(${NUMBER})体(?:を|に)(?=${NUMBER}秒(?:間)?${CONTROL})`, 'g'),
    accepts: notNegated,
    convert: (match) => countEffect(CONTROL_KEYS[match[2]][0].replace('DurationSeconds', 'TargetCount'), `${match[2]}の対象数`, Number(match[1]), [1], 1),
  },
  {
    pattern: new RegExp(`跳躍の最大対象数(?:が|は)?\\s*(${NUMBER})体(?:になる|になり)?`, 'g'),
    accepts: notNegated,
    convert: (match) => countEffect('chainTargetCount', '跳躍の最大対象数', Number(match[1]), [1], 1),
  },
]
