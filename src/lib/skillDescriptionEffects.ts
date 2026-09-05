import type { RawBlackboardEntry } from '../types/skill'
import { analyzeDescriptionPlaceholders } from './skillJsonAnalysis.ts'
import { BARE_NUMBER_START, NUMBER, NUMBER_END, numericEffect, type EffectValue, type Rule } from './skillDescriptionRuleTypes.ts'
import { MECHANIC_RULES } from './skillDescriptionMechanicRules.ts'
import { BEHAVIOR_RULES } from './skillDescriptionBehaviorRules.ts'
import { STAT_RULES } from './skillDescriptionStatRules.ts'
import { COMBAT_RULES } from './skillDescriptionCombatRules.ts'

export interface SkillDescriptionEffect {
  key: string
  label: string
  value: number | string | boolean
  unit: string
  sourceKey: string | null
  sourceText: string
  context: string | null
}

export interface SkillDescriptionConversion {
  description: string
  effects: SkillDescriptionEffect[]
  unconvertedText: string[]
  unresolvedPlaceholders: string[]
}

interface TrackedDescription {
  text: string
  sourceKeys: string[][]
}

interface LocatedEffect extends SkillDescriptionEffect {
  index: number
}

const STAT = '(?:攻撃力|防御力|最大HP)'
const STAT_GROUP = `${STAT}(?:(?:と|・|および)${STAT})*`
const STAT_KEYS: Record<string, [string, string]> = {
  攻撃力: ['attackPowerBonusRatio', '攻撃力の加算割合'],
  防御力: ['defenseBonusRatio', '防御力の加算割合'],
  最大HP: ['maxHpBonusRatio', '最大HPの加算割合'],
}
const DAMAGE_TYPES: Record<string, string> = { 物理: 'physical', 術: 'arts', 確定: 'true' }

function statEffects(names: string, value: number): EffectValue[] {
  if (!Number.isFinite(value)) return []
  return names.split(/と|・|および/).map((name) => ({
    key: STAT_KEYS[name][0], label: STAT_KEYS[name][1], value, unit: 'ratio', sourceGroups: [2, 3],
  }))
}

function damageTypeEffect(type: string, sourceGroup = 1): EffectValue {
  return { key: 'damageType', label: 'ダメージ種別', value: DAMAGE_TYPES[type], unit: '', sourceGroups: [sourceGroup] }
}

// Each key has one meaning: bonus ratios are additive fractions (50% = 0.5),
// damage multipliers are factors (150% = 1.5), and point/count changes stay separate
// from absolute values. Rules use the visible description, never blackboard key names.
const RULES: Rule[] = [
  ...STAT_RULES,
  ...COMBAT_RULES,
  ...MECHANIC_RULES,
  {
    pattern: new RegExp(`(${STAT_GROUP})\\s*([+-])\\s*(${NUMBER})\\s*%`, 'g'),
    convert: (match) => statEffects(match[1], Number(`${match[2]}${match[3]}`) / 100),
  },
  {
    pattern: new RegExp(`(${STAT_GROUP})(?:が|を)?\\s*(${NUMBER})\\s*%(上昇|増加|低下|減少)(?:する|し)?`, 'g'),
    convert: (match) => statEffects(match[1], Number(match[2]) / 100 * (/低下|減少/.test(match[3]) ? -1 : 1)),
  },
  {
    pattern: new RegExp(`攻撃速度\\s*([+-])\\s*(${NUMBER})${NUMBER_END}`, 'g'),
    convert: (match) => numericEffect('attackSpeedBonus', '攻撃速度の加算値', Number(`${match[1]}${match[2]}`), 'points', [1, 2]),
  },
  {
    pattern: new RegExp(`(?:通常攻撃の間隔|攻撃間隔)\\s*([+-])\\s*(${NUMBER})\\s*秒`, 'g'),
    convert: (match) => numericEffect('attackIntervalDeltaSeconds', '攻撃間隔の増減', Number(`${match[1]}${match[2]}`), 'seconds', [1, 2]),
  },
  {
    pattern: new RegExp(`(?:通常攻撃の間隔|攻撃間隔)(?:が|を)?\\s*(${NUMBER})\\s*秒(?:間)?(短縮|延長)(?:する|し)?`, 'g'),
    convert: (match) => numericEffect('attackIntervalDeltaSeconds', '攻撃間隔の増減', Number(match[1]) * (match[2] === '短縮' ? -1 : 1), 'seconds', [1, 2]),
  },
  {
    pattern: new RegExp(`攻撃力(?:の)?\\s*(${NUMBER})\\s*%の(?:範囲)?(物理|術|確定)?ダメージ(?:を与える|を与え)?`, 'g'),
    convert: (match) => {
      const values = numericEffect('attackDamageMultiplier', '攻撃力に対するダメージ倍率', Number(match[1]) / 100, 'multiplier')
      if (values.length && match[2]) values.push(damageTypeEffect(match[2], 2))
      return values
    },
  },
  {
    pattern: /(?:通常)?攻撃が(?:範囲)?(物理|術|確定)(?:攻撃|ダメージ)(?:になり|になる|に変化する|に変化|を与える)/g,
    convert: (match) => [damageTypeEffect(match[1])],
  },
  {
    pattern: new RegExp(`(?:次の通常攻撃時[、,\\s]*|通常攻撃(?:が|は)\\s*)(${NUMBER})回連続(?:で)?(?=攻撃)`, 'g'),
    convert: (match) => positiveCount('hitsPerAttack', '1回の攻撃のヒット数', match[1]),
  },
  {
    pattern: new RegExp(`通常攻撃(?:が|は)\\s*(${NUMBER})連撃(?:になる|になり)?`, 'g'),
    convert: (match) => positiveCount('hitsPerAttack', '1回の攻撃のヒット数', match[1]),
  },
  {
    pattern: new RegExp(`(?:攻撃対象数|同時攻撃対象数)(?:が|は|を)?\\s*(${NUMBER})${NUMBER_END}(?:体)?(?:になる|になり|に増加する|に増加)?`, 'g'),
    convert: (match) => positiveCount('targetCount', '攻撃対象数', match[1]),
  },
  {
    pattern: new RegExp(`(?:攻撃対象数|同時攻撃対象数)\\s*([+-])\\s*(${NUMBER})${NUMBER_END}`, 'g'),
    convert: (match) => integerChange('targetCountBonus', '攻撃対象数の加算値', Number(`${match[1]}${match[2]}`)),
  },
  {
    pattern: new RegExp(`敵(?:最大)?\\s*(${NUMBER})体を同時に攻撃`, 'g'),
    convert: (match) => positiveCount('targetCount', '攻撃対象数', match[1]),
  },
  {
    pattern: new RegExp(`同時に(?:敵)?\\s*(${NUMBER})体(?:の敵)?を攻撃`, 'g'),
    convert: (match) => positiveCount('targetCount', '攻撃対象数', match[1]),
  },
  {
    pattern: new RegExp(`敵最大\\s*(${NUMBER})体(?=に攻撃力)`, 'g'),
    convert: (match) => positiveCount('targetCount', '攻撃対象数', match[1]),
  },
  {
    pattern: new RegExp(`${BARE_NUMBER_START}(${NUMBER})\\s*秒(?:間)?スタン(?:状態にする|状態になる|させる|させ|する)?`, 'g'),
    convert: (match) => numericEffect('stunDurationSeconds', 'スタン時間', Number(match[1]), 'seconds'),
  },
  {
    pattern: new RegExp(`所持コスト\\s*\\+\\s*(${NUMBER})${NUMBER_END}`, 'g'),
    convert: (match) => numericEffect('deploymentCostRecovery', '所持コスト回復量', Number(match[1]), 'cost'),
  },
  {
    pattern: new RegExp(`所持コスト(?:を|が)?\\s*(${NUMBER})${NUMBER_END}(?:回復|増加)(?:する|し)?`, 'g'),
    convert: (match) => numericEffect('deploymentCostRecovery', '所持コスト回復量', Number(match[1]), 'cost'),
  },
  {
    pattern: new RegExp(`所持コストが徐々に増加[（(]合計\\s*(${NUMBER})[）)]`, 'g'),
    convert: (match) => numericEffect('deploymentCostRecovery', '所持コスト回復量', Number(match[1]), 'cost'),
  },
  {
    pattern: new RegExp(`(?:スキルの)?(?:効果時間|持続時間|継続時間)(?:は|が|:)?\\s*(${NUMBER})\\s*秒(?:間)?`, 'g'),
    convert: (match) => numericEffect('durationSeconds', '効果の持続時間', Number(match[1]), 'seconds'),
  },
  ...BEHAVIOR_RULES,
]

function positiveCount(key: string, label: string, text: string): EffectValue[] {
  const value = Number(text)
  return Number.isSafeInteger(value) && value > 0 ? numericEffect(key, label, value, 'count') : []
}

function integerChange(key: string, label: string, value: number): EffectValue[] {
  return Number.isSafeInteger(value) ? numericEffect(key, label, value, 'count', [1, 2]) : []
}

/**
 * Conservatively extracts explicit effect phrases. Context remains source text,
 * not an executable condition: consumers must not apply every row to the caster.
 * Unconverted text includes conditions/targets that have no structured rule yet.
 */
export function convertSkillDescription(
  description: string,
  blackboard: RawBlackboardEntry[] = [],
): SkillDescriptionConversion {
  const entries = (Array.isArray(blackboard) ? blackboard : [])
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => (
      typeof entry.value === 'number' && !Number.isFinite(entry.value)
        ? { ...entry, value: undefined, valueStr: undefined }
        : entry
    ))
  const analysis = analyzeDescriptionPlaceholders(description, entries)
  const unresolvedPlaceholders: string[] = []
  // Rebuild by occurrence so invalid numeric expansions remain visibly unresolved.
  const expanded: TrackedDescription = { text: '', sourceKeys: [] }
  let occurrence = 0
  let cursor = 0
  for (const match of description.matchAll(/\{(-?[^{}:]+)(?::([^{}]+))?\}/g)) {
    const index = match.index ?? 0
    appendTrackedText(expanded, description.slice(cursor, index), [])
    const placeholder = match[0]
    const resolution = analysis.placeholders[occurrence++]
    const value = resolution?.expandedValue
    if (value == null || /(?:NaN|Infinity)/.test(value)) {
      unresolvedPlaceholders.push(placeholder)
      appendTrackedText(expanded, placeholder, [])
    } else {
      const sourceKey = resolution.blackboardIndex === null ? null : entries[resolution.blackboardIndex]?.key
      appendTrackedText(expanded, value, sourceKey ? [sourceKey] : [])
    }
    cursor = index + placeholder.length
  }
  appendTrackedText(expanded, description.slice(cursor), [])
  const normalized = stripDescriptionMarkup(expanded)
  const plainDescription = normalized.text
  // Mask entire placeholders before matching, including numeric text inside keys.
  const searchable = plainDescription.replace(/\{[^{}]*\}/g, (value) => '\ufffc'.repeat(value.length))
  const consumed = new Uint8Array(plainDescription.length)
  const effects: LocatedEffect[] = []

  for (const rule of RULES) {
    // Capture positions distinguish equal values and independently sourced outputs
    // such as a damage multiplier and the damage type in the same phrase.
    const pattern = new RegExp(rule.pattern, `${rule.pattern.flags}d`)
    for (const match of searchable.matchAll(pattern)) {
      const index = match.index ?? 0
      const end = index + match[0].length
      if (consumed.slice(index, end).some(Boolean)) continue
      // A positive-looking prefix of a negation or hypothetical is not an effect.
      if (/^(?:ない|なく|なかった|ません|しない|せず|されない|ではない|ではなく|とは限ら|の場合|した場合|た場合|た時|たとき|する(?:たび|度|ごと|時|とき|場合)|している場合|耐性|への耐性|に(?:は)?なら|にしない|以上|以下|未満|程度|ほど|[~〜～])/.test(searchable.slice(end).trimStart())) continue
      if (/(?:約|およそ|[~〜～])[^\S\r\n]*$/.test(searchable.slice(Math.max(0, index - 8), index))) continue
      if (rule.accepts && !rule.accepts(match, searchable)) continue
      const values = rule.convert(match)
      if (!values.length) continue
      consumed.fill(1, index, end)
      const sourceText = plainDescription.slice(index, end)
      for (const { sourceGroups, ...value } of values) {
        const sourceKey = findSourceKey(match, sourceGroups, normalized.sourceKeys)
        effects.push({ ...value, sourceKey, sourceText, context: null, index })
      }
    }
  }

  const unconvertedText = collectUnconvertedText(plainDescription, consumed)
  return {
    description: plainDescription,
    effects: effects.sort((a, b) => a.index - b.index).map(({ index: _index, ...effect }) => ({
      ...effect,
      // The full description retains inherited conditions across commas/newlines,
      // subsequent duration clauses, named targets and mutually exclusive stages.
      context: plainDescription === effect.sourceText ? null : plainDescription,
    })),
    unconvertedText,
    unresolvedPlaceholders,
  }
}

function appendTrackedText(target: TrackedDescription, text: string, sourceKeys: string[]): void {
  target.text += text
  for (let index = 0; index < text.length; index += 1) target.sourceKeys.push(sourceKeys)
}

function replaceTrackedText(
  source: TrackedDescription,
  pattern: RegExp,
  replacement: string | ((text: string) => string),
): TrackedDescription {
  const result: TrackedDescription = { text: '', sourceKeys: [] }
  let cursor = 0
  for (const match of source.text.matchAll(pattern)) {
    const index = match.index ?? 0
    result.text += source.text.slice(cursor, index)
    result.sourceKeys.push(...source.sourceKeys.slice(cursor, index))
    const end = index + match[0].length
    const keys = [...new Set(source.sourceKeys.slice(index, end).flat())]
    appendTrackedText(result, typeof replacement === 'string' ? replacement : replacement(match[0]), keys)
    cursor = end
  }
  result.text += source.text.slice(cursor)
  result.sourceKeys.push(...source.sourceKeys.slice(cursor))
  return result
}

function stripDescriptionMarkup(description: TrackedDescription): TrackedDescription {
  let result = replaceTrackedText(description, /<br\s*\/?\s*>/gi, '\n')
  result = replaceTrackedText(result, /<(?:\/?[A-Za-z@$][^>]*|\/)>/g, '')
  result = replaceTrackedText(result, /\\n/g, '\n')
  result = replaceTrackedText(result, /[０-９]/g, (digit) => String(digit.charCodeAt(0) - 0xff10))
  result = replaceTrackedText(result, /．/g, '.')
  result = replaceTrackedText(result, /[＋]/g, '+')
  result = replaceTrackedText(result, /[－−]/g, '-')
  result = replaceTrackedText(result, /％/g, '%')
  result = replaceTrackedText(result, /：/g, ':')
  result = replaceTrackedText(result, /｢/g, '「')
  result = replaceTrackedText(result, /｣/g, '」')
  return replaceTrackedText(result, /^\s+|\s+$/g, '')
}

function findSourceKey(match: RegExpMatchArray, groups: number[], sourceKeys: string[][]): string | null {
  const keys = new Set<string>()
  for (const group of groups) {
    const span = match.indices?.[group]
    if (!span) continue
    for (const origins of sourceKeys.slice(span[0], span[1])) {
      for (const key of origins) keys.add(key)
    }
  }
  return keys.size === 1 ? [...keys][0] : null
}

function collectUnconvertedText(description: string, consumed: Uint8Array): string[] {
  let remainder = ''
  for (let index = 0; index < description.length; index += 1) {
    // A separator avoids joining unrelated remnants on either side of an effect.
    remainder += consumed[index] ? '\n' : description[index]
  }
  return remainder.split(/[\n\r、。，,;；]+/)
    .map((text) => text.trim().replace(/^[\s（()）]+|[\s（()）]+$/g, ''))
    .filter((text) => text.length > 0 && !/^(?:し|する|かつ|さらに|および|そして)$/.test(text))
}
