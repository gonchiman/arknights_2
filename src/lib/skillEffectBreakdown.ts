import type { RawBlackboardEntry, RawSkillLevel } from '../types/skill.ts'
import { convertSkillDescription, type SkillDescriptionEffect } from './skillDescriptionEffects.ts'
import { formatSkillDescriptionEffectValue } from './skillDescriptionEffectFormat.ts'
import { classifySkill } from './classifier.ts'

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

export interface SkillEffectBreakdownOptions {
  metadata?: Pick<RawSkillLevel, 'duration' | 'durationType' | 'skillType'>
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
  evidenceEnd: number
  consumedRanges: Array<[number, number]>
  unknownCondition: boolean
  /** All text before this effect is accounted for by known scope grammar. */
  scopeSafe: boolean
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

function scopeStart(description: string, start: number, all: LocatedEffect[]): number {
  const prefix = description.slice(0, start)
  const boundary = /\r\n|[。！？\n\r;；（）()]/g
  let base = 0
  for (const match of prefix.matchAll(boundary)) base = match.index! + match[0].length
  // A line containing only a scope heading has not completed an effect block.
  // Do not discard that heading simply because the effects wrap to a new line.
  while (base > 0 && /[\n\r]/.test(description[base - 1])) {
    const lineBreak = /(?:\r\n|\r|\n)$/.exec(description.slice(0, base))![0]
    const previousEnd = base - lineBreak.length
    const previousText = description.slice(0, previousEnd)
    let previousStart = 0
    for (const match of previousText.matchAll(boundary)) previousStart = match.index! + match[0].length
    if (!description.slice(previousStart, previousEnd).trim()) break
    if (all.some(item => item.start >= previousStart && item.end <= previousEnd)) break
    base = previousStart
  }
  // A rejected negative ability clause is independent of a following ability.
  // It remains an unparsed row; it is not reused as affirmative context.
  const negatives = /(?:^|[、,])\s*攻撃対象数\s*[+]?\d+(?:\.\d+)?にはならない[、,]/g
  const initialBase = base
  for (const match of prefix.slice(initialBase).matchAll(negatives)) base = initialBase + match.index! + match[0].length
  return base
}

// Conditions are copied as source text; these patterns do not execute them.
const CONDITION_PATTERN = /(?:スタン|凍結|睡眠)状態の敵を攻撃する(?:時|とき)|(?:自身の|対象の)?HPが\d+(?:\.\d+)?%(?:以上|以下|未満)(?:の)?(?:時|とき|場合)|攻撃対象が1体のみの場合/g
const TARGET_PATTERN = /(?:範囲内の味方全員|範囲内の味方|味方全員|敵全員|召喚物|自身|味方|敵|対象)(?:の|が|に|を)/g
const TIMING_PATTERN = /(?:次の通常攻撃時|次回の?通常攻撃時|次の攻撃時|次回攻撃時|スキル発動時|発動時|配置後\d+(?:\.\d+)?秒間|配置時|配置後|攻撃時)/g
const SEPARATORS = /^[\s、，,：:]*$/

function maskRange(text: string, start: number, end: number): string {
  return text.slice(0, start) + ' '.repeat(end - start) + text.slice(end)
}

function contextFor(description: string, found: LocatedEffect, all: LocatedEffect[]): ContextFields {
  const base = scopeStart(description, found.start, all)
  const prefix = description.slice(base, found.start)
  const result: ContextFields = {
    timing: UNKNOWN, condition: UNKNOWN, target: UNKNOWN,
    evidenceStart: found.start, evidenceEnd: found.end,
    consumedRanges: [], unknownCondition: false, scopeSafe: false,
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
  let unexplainedPrefix = prefix
  // A preceding effect can be part of the same comma list, but its numeric
  // meaning is never reinterpreted as a condition for the next effect.
  for (const before of all) {
    if (before.start >= base && before.end <= found.start) {
      unexplainedPrefix = maskRange(unexplainedPrefix, before.start - base, before.end - base)
    }
  }
  for (const match of [...conditions].reverse()) {
    const start = match.index!
    unexplainedPrefix = maskRange(unexplainedPrefix, start, start + match[0].length)
  }
  for (const [start, end] of result.consumedRanges) {
    unexplainedPrefix = maskRange(unexplainedPrefix, start - base, end - base)
  }
  // Only a target directly attached to an extracted effect establishes scope.
  // This avoids confusing an attack condition's enemy with the owner of ATK.
  const targets: Array<{ text: string; start: number; end: number }> = []
  for (const item of all.filter(item => item.start >= base && item.start <= found.start)) {
    const ownTarget = new RegExp(`^(${TARGET_PATTERN.source})`).exec(item.effect.sourceText)
    if (ownTarget) targets.push({ text: ownTarget[1].slice(0, -1), start: item.start, end: item.start + ownTarget[1].length })
    const beforeItem = description.slice(base, item.start)
    const attached = new RegExp(`(${TARGET_PATTERN.source})\\s*$`).exec(beforeItem)
    if (attached) targets.push({ text: attached[1].slice(0, -1), start: base + attached.index, end: base + attached.index + attached[1].length })
  }
  const conditionCutoff = latest ? base + latest.index! + latest[0].length : base
  const target = targets.filter(target => target.start >= conditionCutoff).at(-1)
  if (target) {
    result.target = target.text
    result.evidenceStart = Math.min(result.evidenceStart, target.start)
    if (target.start < found.start) result.consumedRanges.push([target.start, target.end])
  }
  for (const target of targets) {
    if (target.end <= found.start) unexplainedPrefix = maskRange(unexplainedPrefix, target.start - base, target.end - base)
  }
  const timings = [...prefix.matchAll(TIMING_PATTERN)]
  const timing = timings.at(-1)
  if (timing) {
    const start = base + timing.index!
    result.timing = timing[0]
    result.evidenceStart = Math.min(result.evidenceStart, start)
    result.consumedRanges.push([start, start + timing[0].length])
  }
  for (const match of [...timings].reverse()) {
    unexplainedPrefix = maskRange(unexplainedPrefix, match.index!, match.index! + match[0].length)
  }
  // This closed healing grammar provides a unique referent for "対象".
  // Other mentions of 対象 are retained rather than guessing an antecedent.
  const healingTarget = /^(範囲内の味方全員|味方全員)を治療し[、,]\s*対象の$/.exec(prefix.trim())
  if (found.effect.key === 'attackBasedHealingMultiplier' && healingTarget) {
    const start = base + prefix.indexOf(healingTarget[0])
    result.target = healingTarget[1]
    result.evidenceStart = start
    result.consumedRanges.push([start, found.start])
    unexplainedPrefix = ' '.repeat(prefix.length)
  }
  // A recognizable condition inside unfamiliar text is not the whole condition.
  // Unknown targets, phases and modes likewise prevent unconditional defaults.
  result.scopeSafe = !ambiguousConditionJoin && SEPARATORS.test(unexplainedPrefix)
  if (!result.scopeSafe) {
    result.unknownCondition = true
    result.condition = UNKNOWN
    result.evidenceStart = base + (prefix.length - prefix.trimStart().length)
    result.consumedRanges = result.consumedRanges.filter(([start, end]) => !conditions.some(match =>
      start <= base + match.index! && end >= base + match.index! + match[0].length))
  }
  return result
}

function guardUnexplainedSuffix(description: string, found: LocatedEffect, all: LocatedEffect[], context: ContextFields): void {
  const tail = description.slice(found.end)
  const opening = /^\s*[（(]/.exec(tail)
  if (!opening) return
  const start = found.end + opening[0].length - 1
  let depth = 0
  let end = description.length
  for (let index = start; index < description.length; index += 1) {
    if (/[（(]/.test(description[index])) depth += 1
    if (/[）)]/.test(description[index])) depth -= 1
    if (depth === 0) { end = index + 1; break }
  }
  let content = description.slice(start + 1, end - 1)
  // A separately parsed parenthesized ability is its own block. Any leftover
  // condition or qualifier may restrict this effect and blocks defaults.
  for (const item of all) {
    if (item.start > start && item.end < end) content = maskRange(content, item.start - start - 1, item.end - start - 1)
  }
  if (SEPARATORS.test(content)) return
  context.scopeSafe = false
  context.unknownCondition = true
  context.condition = UNKNOWN
  context.evidenceEnd = end
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

const SELF_STAT_KEYS = new Set([
  'attackPowerBonusRatio', 'attackPowerBonus', 'attackPowerMultiplier',
  'defenseBonusRatio', 'defenseBonus', 'attackSpeedBonus',
  'maxHpBonus', 'maxHpBonusRatio', 'attackRangeExtension', 'targetCountBonus',
])
const ATTACK_SCOPE_KEYS = new Set(['attackRangeExtension', 'targetCountBonus'])

interface InferenceSettings {
  activeWindow: boolean
  instantActivation: boolean
  activationAllowed: boolean
  unknownIntroStart: number | null
  unknownIntroEnd: number
}

function inferenceSettings(
  description: string, all: LocatedEffect[], options: SkillEffectBreakdownOptions,
): InferenceSettings {
  const classification = classifySkill({ ...options.metadata, description })
  const trigger = classification.activationTrigger.value
  const window = classification.effectWindow.value
  const activationAllowed = !['NEXT_ATTACK', 'PASSIVE', 'ON_DEPLOY'].includes(trigger)
    && (!options.metadata || ['MANUAL', 'AUTO'].includes(options.metadata.skillType ?? ''))
  // The classifier supplies window/trigger only. Row-level scope still needs
  // a closed source grammar; fixed duration alone is not sufficient evidence.
  const hasRetirementRule = all.some(found => found.effect.key === 'skillDurationMode'
    && contextFor(description, found, all).scopeSafe)
  const activeWindow = activationAllowed && ((window === 'FIXED_DURATION'
    && ['MANUAL', 'AUTO_SP'].includes(trigger)) || (window === 'PERMANENT' && hasRetirementRule))
  const first = all[0]
  const firstContext = first ? contextFor(description, first, all) : null
  const intro = first ? description.slice(0, first.start) : ''
  const unknownIntroStart = firstContext?.unknownCondition && /(?:条件|前提|場合|とき|なら|限り)/.test(intro)
    ? intro.length - intro.trimStart().length : null
  const sentenceEnd = first ? description.slice(first.end).search(/[。！？]/) : -1
  return {
    activeWindow, activationAllowed,
    instantActivation: activationAllowed && window === 'NONE' && ['MANUAL', 'AUTO_SP'].includes(trigger),
    unknownIntroStart,
    unknownIntroEnd: first && sentenceEnd >= 0 ? first.end + sentenceEnd : description.length,
  }
}

function applyCommonContext(found: LocatedEffect, context: ContextFields, settings: InferenceSettings): void {
  if (settings.unknownIntroStart !== null && found.start < settings.unknownIntroEnd) {
    context.scopeSafe = false
    context.unknownCondition = true
    context.condition = UNKNOWN
    // Preserve explicit source targets/timing, but do not infer new defaults.
    return
  }
  if (!context.scopeSafe || context.unknownCondition) return
  const key = found.effect.key
  if (SELF_STAT_KEYS.has(key) && settings.activeWindow) {
    if (context.timing === UNKNOWN) context.timing = 'スキル中'
    if (context.condition === UNKNOWN) context.condition = '—'
    if (context.target === UNKNOWN) context.target = ATTACK_SCOPE_KEYS.has(key) ? '自身の攻撃' : '自身'
  }
  if (key === 'hpRecoveryToMaximum' && settings.activationAllowed) {
    if (context.timing === UNKNOWN) context.timing = '発動時'
    if (context.condition === UNKNOWN) context.condition = '—'
    // The qualitative phrase already states 自身; no metadata-derived target.
  }
  if (key === 'attackBasedHealingMultiplier' && settings.instantActivation && context.target !== UNKNOWN) {
    if (context.timing === UNKNOWN) context.timing = '発動時'
    if (context.condition === UNKNOWN) context.condition = '—'
  }
  if (key === 'skillDurationMode' && settings.activationAllowed && context.condition === '退場するまで') {
    context.timing = 'スキル中'
    context.condition = '—'
    context.target = 'スキル全体'
  }
}

interface HpLossRamp {
  start: number
  end: number
  context: ContextFields
}

/** Only the qualitative ramp is common; its progression function stays unknown. */
function hpLossRamps(description: string, all: LocatedEffect[], settings: InferenceSettings): HpLossRamp[] {
  const pattern = /HPが徐々に減少[（(]減少割合は時間と共に増加し、\d+(?:\.\d+)?秒後に最大HPの\d+(?:\.\d+)?%\/秒になる[）)]/g
  return [...description.matchAll(pattern)].flatMap(match => {
    const start = match.index!
    const end = start + match[0].length
    if (!positivePhrase(description, end)) return []
    const pseudo: LocatedEffect = {
      start, end,
      effect: { key: 'hpLossRamp', label: '', value: '', unit: '', sourceKey: null, sourceText: match[0], context: null },
    }
    const context = contextFor(description, pseudo, all)
    const unknownIntro = settings.unknownIntroStart !== null && start < settings.unknownIntroEnd
    if (unknownIntro) {
      context.scopeSafe = false
      context.unknownCondition = true
      context.condition = UNKNOWN
    }
    if (context.scopeSafe && !unknownIntro && settings.activeWindow) {
      if (context.timing === UNKNOWN) context.timing = 'スキル中'
      if (context.condition === UNKNOWN) context.condition = '—'
      if (context.target === UNKNOWN) context.target = '自身'
    }
    return [{ start, end, context }]
  })
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
  options: SkillEffectBreakdownOptions = {},
): SkillEffectBreakdown {
  const converted = convertSkillDescription(description, blackboard)
  const plain = converted.description
  const consumed = new Uint8Array(plain.length)
  const located = locateEffects(plain, converted.effects)
  for (const found of located) consumed.fill(1, found.start, found.end)
  const qualitative = qualitativeEffects(plain, consumed)
  const all = [...located, ...qualitative].sort((a, b) => a.start - b.start)
  const settings = inferenceSettings(plain, all, options)
  const ramps = hpLossRamps(plain, all, settings)
  const rows: SkillEffectBreakdownRow[] = []
  for (const [index, found] of all.entries()) {
    // A reached-after value describes the HP-loss row's condition, not an independent duration.
    if (found.effect.key === 'hpLossRateRampDurationSeconds'
      && all.some(other => other.start === found.start && other.end === found.end && other.effect.key === 'maxHpLossRatioPerSecond')) continue
    const context = contextFor(plain, found, all)
    const ramp = found.effect.key === 'maxHpLossRatioPerSecond'
      ? ramps.find(ramp => ramp.start <= found.start && found.end <= ramp.end) : undefined
    if (ramp) {
      Object.assign(context, {
        timing: ramp.context.timing, target: ramp.context.target,
        condition: UNKNOWN, evidenceStart: found.start, consumedRanges: [],
        unknownCondition: ramp.context.unknownCondition, scopeSafe: ramp.context.scopeSafe,
      })
    }
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
    guardUnexplainedSuffix(plain, found, all, context)
    applyCommonContext(found, context, settings)
    if (ramp && ramp.context.scopeSafe && !ramp.context.unknownCondition) {
      if (ramp.context.timing !== UNKNOWN) context.timing = ramp.context.timing
      if (![UNKNOWN, '—'].includes(ramp.context.condition)) {
        context.condition = `${ramp.context.condition}／${context.condition}`
      }
    }
    consumed.fill(1, found.start, found.end)
    for (const [start, end] of context.consumedRanges) consumed.fill(1, start, end)
    const sourceStart = context.evidenceStart
    const sourceEnd = context.evidenceEnd
    rows.push({
      id: `effect:${found.start}:${found.effect.key}:${index}`,
      sourceText: plain.slice(sourceStart, sourceEnd), sourceStart, sourceEnd,
      timing: context.timing, condition: context.condition, target: context.target,
      label: SHORT_LABELS[found.effect.key] ?? found.effect.label, operation: operationFor(found.effect), valueText: formatSkillDescriptionEffectValue(found.effect),
      effect: { ...found.effect },
      status: [context.timing, context.condition, context.target].includes(UNKNOWN) ? 'partial' : 'parsed',
    })
  }
  for (const ramp of ramps) {
    consumed.fill(1, ramp.start, ramp.end)
    rows.push({
      id: `partial:${ramp.start}:hpLossRamp`, sourceStart: ramp.start, sourceEnd: ramp.end,
      sourceText: plain.slice(ramp.start, ramp.end), timing: ramp.context.timing, condition: ramp.context.condition, target: ramp.context.target,
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
