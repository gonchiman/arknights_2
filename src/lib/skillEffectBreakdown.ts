import type { RawBlackboardEntry } from '../types/skill.ts'
import { convertSkillDescription, type SkillDescriptionEffect } from './skillDescriptionEffects.ts'
import { formatSkillDescriptionEffectValue } from './skillDescriptionEffectFormat.ts'

export type SkillEffectBreakdownStatus = 'parsed' | 'partial' | 'unparsed'

export interface SkillEffectBreakdownRow {
  id: string
  sourceText: string
  sourceStart: number
  sourceEnd: number
  timing: string
  condition: string
  target: string
  label: string
  operation: string
  valueText: string
  effect: SkillDescriptionEffect | null
  status: SkillEffectBreakdownStatus
}

export interface SkillEffectBreakdown {
  description: string
  rows: SkillEffectBreakdownRow[]
  unresolvedPlaceholders: string[]
  /** Original converter outputs, including values used as another row's condition. */
  effects: SkillDescriptionEffect[]
  unconvertedText: string[]
}

const UNKNOWN = '未解析'

interface LocatedEffect {
  effect: SkillDescriptionEffect
  start: number
  end: number
}

interface ContextFields {
  timing: string
  condition: string
  target: string
  evidenceStart: number
  consumedRanges: Array<[number, number]>
  unknownCondition: boolean
}

/** One match may yield multiple effects. Repeated matches must advance even when values are equal. */
function locateEffects(description: string, effects: SkillDescriptionEffect[]): LocatedEffect[] {
  const located: LocatedEffect[] = []
  let previous: LocatedEffect | undefined
  let keysAtPreviousSpan = new Set<string>()
  for (const effect of effects) {
    const signature = `${effect.key}:${effect.unit}`
    const sameMatch = previous && previous.effect.sourceText === effect.sourceText && !keysAtPreviousSpan.has(signature)
    const start = sameMatch && previous ? previous.start : description.indexOf(effect.sourceText, previous?.end ?? 0)
    if (start < 0 || !effect.sourceText) continue
    if (!sameMatch) keysAtPreviousSpan = new Set()
    keysAtPreviousSpan.add(signature)
    const found = { effect, start, end: start + effect.sourceText.length }
    located.push(found)
    previous = found
  }
  return located
}

function sentenceStart(description: string, start: number): number {
  const prefix = description.slice(0, start)
  return Math.max(prefix.lastIndexOf('。'), prefix.lastIndexOf('！'), prefix.lastIndexOf('？')) + 1
}

// Conditions are copied as source text; these patterns do not execute them.
// A newline alone does not terminate an inherited condition.
const CONDITION_PATTERN = /(?:スタン|凍結|睡眠)状態の敵を攻撃する(?:時|とき)|(?:自身の|対象の)?HPが\d+(?:\.\d+)?%(?:以上|以下|未満)(?:の)?(?:時|とき|場合)/g

function contextFor(description: string, found: LocatedEffect): ContextFields {
  const base = sentenceStart(description, found.start)
  const prefix = description.slice(base, found.start)
  const ownText = found.effect.sourceText
  const result: ContextFields = {
    timing: UNKNOWN, condition: UNKNOWN, target: UNKNOWN,
    evidenceStart: found.start, consumedRanges: [], unknownCondition: false,
  }
  const conditions = [...prefix.matchAll(CONDITION_PATTERN)]
  let ambiguousConditionJoin = false
  const latest = conditions.at(-1)
  if (latest) {
    const adjacent = [latest]
    for (let index = conditions.length - 2; index >= 0; index -= 1) {
      const before = conditions[index]
      const after = adjacent[0]
      const gap = prefix.slice(before.index! + before[0].length, after.index!)
      if (!/^(?:[\s、，,]+|かつ|および|及び|且つ)+$/.test(gap)) {
        // A prior effect can separate scopes. An unfamiliar link between two
        // conditions cannot turn the final condition into the whole condition.
        ambiguousConditionJoin = convertSkillDescription(gap).effects.length === 0
        break
      }
      adjacent.unshift(before)
    }
    const conditionStart = base + adjacent[0].index!
    const conditionEnd = base + latest.index! + latest[0].length
    result.condition = description.slice(conditionStart, conditionEnd)
    result.timing = adjacent.some(match => /敵を攻撃する/.test(match[0])) ? '攻撃時' : '条件成立時'
    result.evidenceStart = conditionStart
    result.consumedRanges.push([conditionStart, conditionEnd])
  }
  const target = /^(自身|味方全員|味方|敵全員|敵|対象)(?:の|が|に|を)/.exec(ownText)
    ?? /(自身|味方全員|味方|敵全員|敵|対象)(?:の|が|に|を)\s*$/.exec(prefix)
  if (target) {
    result.target = target[1]
    if (!ownText.startsWith(target[0])) {
      const start = base + target.index
      result.evidenceStart = Math.min(result.evidenceStart, start)
      result.consumedRanges.push([start, start + target[0].length])
    }
  }
  const timing = /(?:スキル発動時|発動時|配置時|配置後|攻撃時)[、,\s]*$/.exec(prefix)
  if (timing) {
    const start = base + timing.index
    result.timing = timing[0].replace(/[、,\s]+$/g, '')
    result.evidenceStart = Math.min(result.evidenceStart, start)
    result.consumedRanges.push([start, start + timing[0].length])
  }
  // A recognizable condition inside an unfamiliar compound condition does not
  // make the entire condition known. Keep the compound source visible instead.
  let unexplainedPrefix = prefix
  for (const match of [...conditions].reverse()) {
    const start = match.index!
    unexplainedPrefix = unexplainedPrefix.slice(0, start) + ' '.repeat(match[0].length)
      + unexplainedPrefix.slice(start + match[0].length)
  }
  unexplainedPrefix = unexplainedPrefix.replace(/(?:スキル発動時|発動時|配置時|配置後|攻撃時)/g, '')
  if (ambiguousConditionJoin || /(?:条件|前提|場合|とき|(?:の|た|する)時|なら|限り)/.test(unexplainedPrefix)) {
    result.unknownCondition = true
    result.condition = UNKNOWN
    result.evidenceStart = base + (prefix.length - prefix.trimStart().length)
    result.consumedRanges = result.consumedRanges.filter(([start, end]) => !conditions.some(match =>
      start <= base + match.index! && end >= base + match.index! + match[0].length))
  }
  return result
}

function operationFor(effect: SkillDescriptionEffect): string {
  if (effect.key === 'maxHpLossRatioPerSecond') return '毎秒減少'
  if (effect.key === 'skillAmmoCount') return '終了条件'
  if (effect.key === 'skillDurationMode') return '継続'
  if (effect.key === 'manualSkillStop') return '停止'
  if (effect.key === 'hpRecoveryToMaximum') return '回復'
  if (effect.key === 'firstTalentActivation' || effect.key === 'secondTalentActivation') return '発動'
  if (effect.key === 'attackIntervalChange') return '変化'
  if (effect.unit === 'ratio' || /Bonus$|BonusRatio$|Delta|Extension$/.test(effect.key)) return '加算'
  if (effect.unit === 'multiplier') return '乗算'
  if (/PerSecond$/.test(effect.unit)) return '毎秒'
  return typeof effect.value === 'number' ? '設定' : '状態'
}

function positivePhrase(description: string, end: number): boolean {
  return !/^(?:ない|なく|なかった|しない|しなく|しません|ません|せず|されない|できない|できなく|できません|(?:する)?こと(?:が|は)ない|わけではない|ではない|とは限ら|の場合|場合|した場合|た場合|と仮定)/.test(description.slice(end).trimStart())
}

const SHORT_LABELS: Record<string, string> = {
  attackPowerBonusRatio: '攻撃力', attackPowerBonus: '攻撃力', attackPowerMultiplier: '攻撃力',
  defenseBonusRatio: '防御力', defenseBonus: '防御力',
  attackRangeExtension: '攻撃範囲', targetCountBonus: '同時攻撃対象数', targetCount: '同時攻撃対象数',
  maxHpBonus: '最大HP', maxHpBonusRatio: '最大HP', maxHpLossRatioPerSecond: 'HP減少速度',
  skillDurationMode: '効果の持続',
}

/** A closed, source-visible grammar: additional unknown conditions prevent these self-scope defaults. */
function knownSelfHpRamp(description: string): { rampStart: number; rampEnd: number } | null {
  const n = String.raw`\d+(?:\.\d+)?`
  const pattern = new RegExp(String.raw`^自身のHPを最大値まで回復\n攻撃力\+${n}%、攻撃範囲\+${n}マス、攻撃対象数\+${n}、最大HP\+${n}、(HPが徐々に減少（減少割合は時間と共に増加し、${n}秒後に最大HPの${n}%/秒になる）)\n退場まで効果継続$`)
  const match = pattern.exec(description)
  if (!match) return null
  const rampStart = description.indexOf(match[1])
  return { rampStart, rampEnd: rampStart + match[1].length }
}

function selfHpRampContext(found: LocatedEffect): Partial<ContextFields> | null {
  if (found.effect.key === 'hpRecoveryToMaximum') return { timing: '発動時', condition: '—', target: '自身' }
  if (['attackPowerBonusRatio', 'maxHpBonus'].includes(found.effect.key)) return { timing: 'スキル中', condition: '—', target: '自身' }
  if (['attackRangeExtension', 'targetCountBonus'].includes(found.effect.key)) return { timing: 'スキル中', condition: '—', target: '自身の攻撃' }
  if (found.effect.key === 'maxHpLossRatioPerSecond') return { timing: 'スキル中', target: '自身' }
  if (found.effect.key === 'skillDurationMode') return { timing: 'スキル中', condition: '—', target: 'スキル全体' }
  return null
}

function qualitativeEffects(description: string, occupied: Uint8Array): LocatedEffect[] {
  const definitions = [
    {
      pattern: /自身のHPを最大値まで回復(?:する|し)?/g,
      key: 'hpRecoveryToMaximum', label: 'HP回復', value: '最大値まで',
    },
    {
      pattern: /直ちに第一素質を発動(?:する|し)?/g,
      key: 'firstTalentActivation', label: '第一素質の発動', value: '発動',
    },
    {
      pattern: /直ちに第二素質を発動(?:する|し)?/g,
      key: 'secondTalentActivation', label: '第二素質の発動', value: '発動',
    },
    {
      pattern: /通常攻撃の間隔を大幅に短縮する/g,
      key: 'attackIntervalChange', label: '攻撃間隔の変化', value: '大幅に短縮',
    },
  ]
  return definitions.flatMap(definition => [...description.matchAll(definition.pattern)].flatMap(match => {
    const start = match.index!
    const end = start + match[0].length
    if (occupied.slice(start, end).some(Boolean) || !positivePhrase(description, end)) return []
    return [{
      start, end,
      effect: {
        key: definition.key, label: definition.label, value: definition.value, unit: '', sourceKey: null,
        sourceText: match[0], context: description === match[0] ? null : description,
      },
    }]
  }))
}

function specialContext(found: LocatedEffect, related: LocatedEffect[]): Partial<ContextFields> | null {
  const { effect } = found
  if (effect.key === 'maxHpLossRatioPerSecond') {
    const duration = related.find(other => other.start === found.start && other.end === found.end
      && other.effect.key === 'hpLossRateRampDurationSeconds')
    if (duration) {
      const after = /^\d+(?:\.\d+)?秒後/.exec(effect.sourceText)?.[0]
      return { timing: after ?? UNKNOWN, condition: after ? `${after}に最終減少速度へ到達` : UNKNOWN }
    }
  }
  if (effect.key === 'skillAmmoCount') {
    return { timing: '撃ち切った時', condition: effect.sourceText.replace(/とスキルが終了$/, ''), target: 'スキル' }
  }
  if (effect.key === 'skillDurationMode') return { timing: '退場まで', condition: '退場するまで', target: 'スキル効果' }
  if (effect.key === 'manualSkillStop') return { timing: '手動操作時', condition: '手動で停止', target: 'スキル' }
  if (effect.key === 'firstTalentActivation' || effect.key === 'secondTalentActivation') {
    return { timing: '直ちに', target: effect.key === 'firstTalentActivation' ? '第一素質' : '第二素質' }
  }
  return null
}

function residualRows(description: string, consumed: Uint8Array): SkillEffectBreakdownRow[] {
  const rows: SkillEffectBreakdownRow[] = []
  let start = 0
  const append = (from: number, to: number) => {
    const source = description.slice(from, to)
    const leading = /^[\s、，,;；。！？（）()]+/.exec(source)?.[0].length ?? 0
    const trailing = /[\s、，,;；。！？（）()]+$/.exec(source)?.[0].length ?? 0
    const sourceStart = from + leading
    const sourceEnd = to - trailing
    const sourceText = description.slice(sourceStart, sourceEnd)
    if (sourceEnd <= sourceStart || /^(?:し|する|かつ|さらに|および|そして|に|と)$/.test(sourceText)) return
    rows.push({
      id: `unparsed:${sourceStart}:${sourceEnd}`, sourceText, sourceStart, sourceEnd,
      timing: UNKNOWN, condition: UNKNOWN, target: UNKNOWN, label: '未解析の記述', operation: UNKNOWN,
      valueText: sourceText, effect: null, status: 'unparsed',
    })
  }
  for (let index = 0; index <= description.length; index += 1) {
    const boundary = index === description.length || consumed[index] || /[\n\r、，,;；。！？]/.test(description[index])
    if (boundary) {
      append(start, index)
      start = index + 1
    }
  }
  return rows
}

/**
 * Presentation-only breakdown. Unknown scope is visible and no row is an executable calculation.
 * Every span refers to the expanded, normalized description returned alongside these rows.
 */
export function buildSkillEffectBreakdown(
  description: string,
  blackboard: RawBlackboardEntry[] = [],
): SkillEffectBreakdown {
  const converted = convertSkillDescription(description, blackboard)
  const plain = converted.description
  const consumed = new Uint8Array(plain.length)
  const located = locateEffects(plain, converted.effects)
  for (const found of located) consumed.fill(1, found.start, found.end)
  const qualitative = qualitativeEffects(plain, consumed)
  const all = [...located, ...qualitative].sort((a, b) => a.start - b.start)
  const selfHpRamp = knownSelfHpRamp(plain)
  const rows: SkillEffectBreakdownRow[] = []
  for (const [index, found] of all.entries()) {
    // A reached-after value describes the HP-loss row's condition, not an independent duration.
    if (found.effect.key === 'hpLossRateRampDurationSeconds'
      && all.some(other => other.start === found.start && other.end === found.end && other.effect.key === 'maxHpLossRatioPerSecond')) continue
    const context = contextFor(plain, found)
    const special = specialContext(found, all)
    if (special) {
      const inheritedCondition = context.condition
      const contextStart = context.evidenceStart
      const beforeEffect = plain.slice(contextStart, found.start).replace(CONDITION_PATTERN, '')
      const directCondition = inheritedCondition !== UNKNOWN && /^[\s、，,]*$/.test(beforeEffect)
      // Skill-level ending rules do not inherit an attack-specific enemy condition.
      if (['skillAmmoCount', 'skillDurationMode', 'manualSkillStop'].includes(found.effect.key)) {
        if (!directCondition && !context.unknownCondition) {
          context.evidenceStart = found.start
          context.consumedRanges = []
        }
      }
      Object.assign(context, special)
      if (context.unknownCondition) context.condition = UNKNOWN
      else if (directCondition && special.condition && special.condition !== inheritedCondition) {
        context.condition = `${inheritedCondition}／${special.condition}`
      }
    }
    if (selfHpRamp) Object.assign(context, selfHpRampContext(found))
    consumed.fill(1, found.start, found.end)
    for (const [start, end] of context.consumedRanges) consumed.fill(1, start, end)
    const sourceStart = context.evidenceStart
    const sourceEnd = found.end
    rows.push({
      id: `effect:${found.start}:${found.effect.key}:${index}`,
      sourceText: plain.slice(sourceStart, sourceEnd), sourceStart, sourceEnd,
      timing: context.timing, condition: context.condition, target: context.target,
      label: SHORT_LABELS[found.effect.key] ?? found.effect.label, operation: operationFor(found.effect), valueText: formatSkillDescriptionEffectValue(found.effect),
      effect: { ...found.effect },
      status: [context.timing, context.condition, context.target].includes(UNKNOWN) ? 'partial' : 'parsed',
    })
  }
  if (selfHpRamp) {
    consumed.fill(1, selfHpRamp.rampStart, selfHpRamp.rampEnd)
    rows.push({
      id: `partial:${selfHpRamp.rampStart}:hpLossRamp`, sourceStart: selfHpRamp.rampStart, sourceEnd: selfHpRamp.rampEnd,
      sourceText: plain.slice(selfHpRamp.rampStart, selfHpRamp.rampEnd), timing: 'スキル中', condition: '—', target: '自身',
      label: 'HP減少速度の変化', operation: UNKNOWN, valueText: '時間と共に増加（詳細未解析）', effect: null, status: 'partial',
    })
  }
  rows.push(...residualRows(plain, consumed))
  rows.sort((a, b) => a.sourceStart - b.sourceStart || a.sourceEnd - b.sourceEnd)
  return {
    description: plain, rows, unresolvedPlaceholders: converted.unresolvedPlaceholders,
    effects: converted.effects, unconvertedText: converted.unconvertedText,
  }
}
