import type { DamageCalculatorThreeInput, DamageCalculatorThreeOutput } from './damageCalculatorThree.ts'
import type { EffectApplicationRow } from './effectApplication.ts'
import type { GuardConditions, GuardInput, GuardStage, GuardValue } from './guardCombatTypes.ts'
import { getGuardRegisteredTalentNames } from './guardCombatPassives.ts'
import { guardConditionMatches, resolveGuardValue } from './guardCombatValues.ts'
import { evaluateGuardTraits } from './guardTraitEvaluation.ts'

const number = (value: number) => new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 6 }).format(value)
const percent = (value: number) => `${number(value * 100)}%`
const signed = (value: number) => `${value >= 0 ? '＋' : '−'}${number(Math.abs(value))}`
const signedPercent = (value: number) => `${value >= 0 ? '＋' : '−'}${percent(Math.abs(value))}`
const message = (error: unknown) => error instanceof Error ? error.message : '値を確認できません。'
const TYPE_LABELS = { PHYSICAL: '物理', ARTS: '術', TRUE: '確定' }

function inputLabel(key: string, value: number | string | boolean | undefined, inputs: readonly GuardInput[]): string {
  const definition = inputs.find(input => input.key === key)
  const valueLabel = definition?.options?.find(option => option.value === value)?.label
    ?? (typeof value === 'boolean' ? value ? 'あり' : 'なし' : value === undefined ? '未確認' : String(value))
  return `${definition?.label ?? key}：${valueLabel}`
}

function dependencies(expression: GuardValue | undefined, conditions: GuardConditions): string[] {
  if (expression === undefined || typeof expression === 'number' || 'key' in expression) return []
  if ('op' in expression && expression.op === 'if') {
    let branches: readonly GuardValue[] = [expression.yes, expression.no]
    try { branches = [guardConditionMatches(expression, conditions) ? expression.yes : expression.no] } catch { /* Keep unknown branches visible. */ }
    return [expression.input, ...branches.flatMap(value => dependencies(value, conditions))]
  }
  if ('input' in expression) return [expression.input]
  return expression.args.flatMap(value => dependencies(value, conditions))
}

function stageTiming(stage: GuardStage): string {
  return stage.kind === 'NORMAL' ? '通常攻撃時' : stage.kind === 'NEXT_ATTACK' ? '強化攻撃1回内' : '選択した段階の1回内'
}

/** Display the actual recipe with the same inputs used by the calculator, never its preview values. */
export function buildGuardSkillApplicationRows(input: DamageCalculatorThreeInput, output: DamageCalculatorThreeOutput): EffectApplicationRow[] {
  const recipe = output.structure?.guardRecipe
  const evaluation = output.guard
  if (!recipe || !evaluation) return []
  const { conditions, inputs } = evaluation
  const board = new Map((input.skill.skillLevels[input.skillLevelIndex]?.blackboard ?? []).flatMap(entry =>
    entry.key && typeof entry.value === 'number' ? [[entry.key.toLowerCase(), entry.value] as const] : []))
  const rows: EffectApplicationRow[] = []
  let selected: GuardStage | undefined
  try {
    const candidates = recipe.stages.filter(stage => !stage.when || guardConditionMatches(stage.when, conditions))
    if (candidates.length === 1) selected = candidates[0]
  } catch { /* Output already retains the input error. */ }
  const calculationReason = output.unsupportedReasons.join(' ')

  for (const stage of recipe.stages) {
    const inactive = selected !== undefined && selected !== stage
    const blocked = selected === stage && Boolean(stage.unresolved?.length)
    const baseStatus: EffectApplicationRow['status'] = inactive ? 'INACTIVE_STAGE' : blocked ? 'UNSUPPORTED'
      : !selected || !output.model || output.unsupportedReasons.length ? 'UNVERIFIED' : 'APPLIED'
    const baseReason = inactive ? '現在選択している段階では使用しません。'
      : blocked ? stage.unresolved!.join(' ') : baseStatus === 'UNVERIFIED' ? calculationReason || '計算する段階を確認できません。' : ''
    const stageCondition = stage.when ? (() => {
      const comparison = { EQ: '＝', LT: '＜', LTE: '≦', GT: '＞', GTE: '≧' }[stage.when.comparison]
      const definition = inputs.find(item => item.key === stage.when!.input)
      const expected = definition?.options?.find(option => option.value === stage.when!.value)?.label ?? String(stage.when.value)
      return `${definition?.label ?? stage.when.input} ${comparison} ${expected}`
    })() : ''
    const condition = (...expressions: (GuardValue | undefined)[]) => [...new Set([
      ...(stageCondition ? [stageCondition] : []),
      ...expressions.flatMap(expression => dependencies(expression, conditions))
        .filter(key => key !== stage.when?.input).map(key => inputLabel(key, conditions[key], inputs)),
    ])].join('、') || '—'
    const add = (key: string, item: string, readValue: () => string, expressions: (GuardValue | undefined)[] = [],
      options: Partial<Pick<EffectApplicationRow, 'status' | 'reason' | 'timing' | 'probability'>> = {}) => {
      let value = '未確認', status = options.status ?? baseStatus, reason = options.reason ?? baseReason
      try { value = readValue() } catch (error) {
        if (!inactive) status = 'UNVERIFIED'
        reason = [reason, message(error)].filter(Boolean).join(' ')
      }
      rows.push({ id: `guard-skill:${stage.id}:${key}`, category: 'SKILL', name: input.skill.skillName,
        item, value, timing: options.timing ?? (stage.kind === 'NORMAL' ? 'スキル中' : stageTiming(stage)), condition: condition(...expressions),
        status, reason, ...(recipe.stages.length > 1 ? { stage: stage.label } : {}),
        ...(options.probability === undefined ? {} : { probability: options.probability }) })
    }
    const value = (expression: GuardValue | undefined, fallback = 0) => expression === undefined
      ? fallback : resolveGuardValue(expression, board, conditions)
    // Base-attack values belong to the trait rows; do not present recipe fallback
    // values as skill changes when structured traits actually provide them.
    let inherited: ReturnType<typeof evaluateGuardTraits>['evaluation'] | undefined
    try {
      inherited = evaluateGuardTraits(input.operator, stage, conditions, board,
        { phaseIndex: input.phaseIndex, operatorLevel: input.operatorLevel }).evaluation
    } catch { /* The existing calculation status carries invalid input/data errors. */ }
    const numeric = (key: string, item: string, expression: GuardValue | undefined, format: (n: number) => string,
      options: Parameters<typeof add>[4] = {}) => {
      if (expression !== undefined) add(key, item, () => format(value(expression)), [expression], options)
    }
    numeric('atk', '攻撃力', stage.atk, signedPercent)
    numeric('block-count-add', 'ブロック数', stage.blockCountAdd, n => `${signed(n)}体`)
    numeric('trait-attack-ratio-scale', '特性の攻撃力上昇倍率', stage.traitAttackRatioScale, n => `×${number(n)}`)
    const intervalOptions = stage.kind === 'NORMAL' || inactive ? {} : {
      status: 'NOT_RELEVANT' as const, reason: '選択した段階は1回分のダメージを計算し、攻撃間隔を使用しません。',
    }
    numeric('aspd', '攻撃速度', stage.aspd, signed, intervalOptions)
    numeric('interval-scale', '攻撃間隔倍率', stage.intervalScale, n => `×${number(n)}`, intervalOptions)
    numeric('interval-add', '攻撃間隔の加算', stage.intervalAdd, n => `${signed(n)}秒`, intervalOptions)
    if (stage.maxTargets !== undefined) add('max-targets', '攻撃対象数上限',
      () => stage.maxTargets === null ? '上限なし' : `${number(value(stage.maxTargets))}体`, [stage.maxTargets ?? undefined])
    const mitigationOptions = (damageType: 'PHYSICAL' | 'ARTS') => inactive || !output.model
      || (damageType === 'PHYSICAL' ? output.axisLabel === '敵の防御力' : output.damageType === 'ARTS' || output.damageType === null) ? {} : {
        status: 'NOT_RELEVANT' as const, reason: damageType === 'PHYSICAL'
          ? '選択した攻撃に物理ダメージがありません。' : '選択した攻撃に術ダメージがありません。',
      }
    numeric('defense-ignore-ratio', '防御力無視率', stage.defenseIgnoreRatio, percent, mitigationOptions('PHYSICAL'))
    numeric('defense-ignore-fixed', '防御力無視', stage.defenseIgnoreFixed, number, mitigationOptions('PHYSICAL'))
    numeric('resistance-ignore-fixed', '術耐性無視', stage.resistanceIgnoreFixed, number, mitigationOptions('ARTS'))
    if (stage.duration !== undefined) add('duration', '持続時間', () => stage.duration === 'UNTIL_EXIT' ? '退場まで' : `${number(value(stage.duration))}秒`,
      stage.duration === 'UNTIL_EXIT' ? [] : [stage.duration], inactive ? {} : {
        status: 'NOT_RELEVANT', reason: '1攻撃のダメージと攻撃中のDPSには、持続時間を乗算しません。', timing: 'スキル中',
      })

    stage.actions.forEach((action, index) => {
      const prefix = `action-${index}`
      let actionStatus: EffectApplicationRow['status'] = baseStatus
      let actionReason = baseReason, probability: string | undefined
      try {
        const chance = value(action.probability, 1), hits = value(action.hits, 1), targets = value(action.targets, output.actualTargetCount)
        if (action.probability !== undefined) probability = percent(chance)
        if (baseStatus === 'APPLIED' && (chance === 0 || hits === 0 || targets === 0)) {
          actionStatus = 'CONDITION_FALSE'
          actionReason = chance === 0 ? '発動確率が0です。' : hits === 0 ? '攻撃回数が0です。' : '命中対象数が0です。'
        }
      } catch (error) {
        if (!inactive) actionStatus = 'UNVERIFIED'
        actionReason = [actionReason, message(error)].filter(Boolean).join(' ')
        if (action.probability !== undefined) probability = '未確認'
      }
      if (action.timing === 'ON_DEPLOY' && !inactive) {
        actionStatus = 'NOT_RELEVANT'
        actionReason = '配置時の攻撃は選択したスキルの攻撃に加算しません。'
      }
      const timing = action.timing === 'PER_SECOND' ? '毎秒' : action.timing === 'ON_DEPLOY' ? '配置時'
        : action.timing === 'PER_ATTACK' ? '攻撃時' : stageTiming(stage)
      const options = { status: actionStatus, reason: actionReason, timing, probability }
      const actionExpressions: (GuardValue | undefined)[] = [action.hits, action.targets, action.probability,
        ...(action.basis === 'TARGET_CURRENT_HP' ? [{ input: 'targetCurrentHp' }] : [])]
      const actionRow = (key: string, item: string, read: () => string, expression?: GuardValue) =>
        add(`${prefix}:${key}`, `${action.label}：${item}`, read, [...actionExpressions, expression], options)
      if (inherited?.damageType === undefined || action.traitOverrides?.includes('DAMAGE_TYPE'))
        actionRow('type', 'ダメージ属性', () => TYPE_LABELS[action.damageType])
      if (action.basis !== undefined) actionRow('basis', '計算基準', () => action.basis === 'TARGET_CURRENT_HP' ? '対象の現在HP' : '自身の攻撃力')
      actionRow('scale', action.basis === 'TARGET_CURRENT_HP' ? '対象の現在HP倍率' : '攻撃倍率',
        () => `×${number(value(action.scale, 1))}`, action.scale)
      if (inherited?.hitCount === undefined || action.traitOverrides?.includes('HIT_COUNT'))
        actionRow('hits', action.timing === 'PER_SECOND' ? '毎秒の判定回数' : '攻撃回数',
          () => `${number(value(action.hits, 1))}回`, action.hits)
      actionRow('targets', '命中対象数', () => `${number(value(action.targets, output.actualTargetCount))}体`, action.targets)
      for (const [key, item, expression, format] of [
        ['attack-bonus', '攻撃力加算', action.attackBonus, signedPercent],
        ['flat-damage', '固定ダメージ', action.flatDamage, number],
        ['minimum-scale', '下限の攻撃倍率', action.minimumAttackScale, (n: number) => `×${number(n)}`],
      ] as const) if (expression !== undefined) actionRow(key, item, () => format(value(expression)), expression)
    })
    for (const [index, reason] of (stage.unresolved ?? []).entries()) add(`unresolved-${index}`, '未対応の処理', () => '未確認', [], {
      status: inactive ? 'INACTIVE_STAGE' : 'UNSUPPORTED', reason,
    })
  }
  return rows
}

/** Reuse evaluated talent statuses; never infer the source category from its Japanese name. */
export function buildGuardTalentApplicationRows(input: DamageCalculatorThreeInput, output: DamageCalculatorThreeOutput): EffectApplicationRow[] {
  if (!output.guard) return []
  const calculationBlocked = !output.model || output.unsupportedReasons.length > 0
  const rows: EffectApplicationRow[] = output.guard.evaluations.filter(row => row.sourceKind === 'TALENT').map((row, index) => {
    const blockedApplied = calculationBlocked && row.status === 'APPLIED'
    const speedOutsideDps = row.status === 'APPLIED' && row.item === '攻撃速度' && output.attackKind !== 'NORMAL'
    const defenseWithoutPhysical = row.status === 'APPLIED' && !calculationBlocked
      && ['防御力無視', '防御力低下'].includes(row.item) && output.axisLabel !== '敵の防御力'
    const resistanceWithoutArts = row.status === 'APPLIED' && !calculationBlocked && row.item === '術耐性無視'
      && (output.damageType === 'PHYSICAL' || output.damageType === 'TRUE')
    const irrelevantReason = speedOutsideDps ? '選択した段階は1回分のダメージを計算し、攻撃速度を使用しません。'
      : defenseWithoutPhysical ? '選択した攻撃に物理ダメージがありません。'
        : resistanceWithoutArts ? '選択した攻撃に術ダメージがありません。' : ''
    return { id: `guard-talent:${row.talentIndex ?? 'unknown'}:${index}`, category: 'TALENT',
      categoryLabel: row.talentIndex === undefined ? '素質' : `素質${row.talentIndex + 1}`,
      name: row.source, item: row.item, value: row.value, timing: row.timing ?? '未確認', condition: row.condition ?? '未確認',
      status: irrelevantReason ? 'NOT_RELEVANT' : blockedApplied ? 'UNVERIFIED' : row.status,
      reason: irrelevantReason ? irrelevantReason
        : blockedApplied ? [row.reason, ...output.unsupportedReasons].filter(Boolean).join(' ') : row.reason,
      ...(row.probability === undefined ? {} : { probability: Number.isFinite(row.probability) ? percent(row.probability) : '未確認' }) }
  })
  const present = new Set(output.guard.evaluations.filter(row => row.sourceKind === 'TALENT').map(row => row.talentIndex))
  for (const [index, name] of getGuardRegisteredTalentNames(input.operator.operatorId).entries()) if (!present.has(index)) {
    rows.push({ id: `guard-talent:${index}:unverified`, category: 'TALENT', categoryLabel: `素質${index + 1}`,
      name, item: '効果の評価', value: '未確認', timing: '未確認', condition: '未確認', status: 'UNVERIFIED',
      reason: output.unsupportedReasons.join(' ') || '素質の評価結果を取得できません。' })
  }
  return rows
}
