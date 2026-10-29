import {
  formatSkillStructureActivationMethod, formatSkillStructureActivationTrigger, formatSkillStructureDuration,
  formatSkillStructureEffectItem, formatSkillStructureEffectOperation, formatSkillStructureEffectTarget,
  formatSkillStructureEffectTiming, formatSkillStructureEffectValue, formatSkillStructureEndCondition,
  formatSkillStructureMode, formatSkillStructurePredicate, formatSkillStructureSpRecovery,
  getSkillStructureEffectValueRows,
  type SkillStructure, type SkillStructureEffect, type SkillStructurePredicate, type SkillStructureStage,
} from './skillStructure.ts'
import type { GuardDamageAction, GuardInput, GuardSkillRecipe, GuardStage, GuardValue } from './guardCombatTypes.ts'
import { resolveGuardValue } from './guardCombatValues.ts'

export interface FlowField { label: string; value: string }
export interface FlowCondition { label: string; yesLabel: string; noLabel: string }
export interface FlowStep {
  id: string
  title: string
  fields: FlowField[]
  condition?: FlowCondition
  skipLabel?: string
}
/** Layers express a verified partial order. Steps within a layer have no asserted order. */
export interface FlowGroup { id: string; label: string; layers: FlowStep[][] }
export interface FlowStage {
  id: string
  label: string
  condition?: FlowCondition
  fields: FlowField[]
  groups: FlowGroup[]
  warnings?: string[]
}
export interface SkillEffectFlowModel { activation: FlowField[]; trigger: string; stages: FlowStage[] }

const number = (value: number) => String(Math.round(value * 1e8) / 1e8)
const percent = (value: number) => `${number(value * 100)}%`
const damageTypes = { PHYSICAL: '物理', ARTS: '術', TRUE: '確定' } as const
const comparisons = { EQ: '＝', LT: '＜', LTE: '≦', GT: '＞', GTE: '≧' } as const
const branch = (label: string): FlowCondition => ({ label, yesLabel: '成立', noLabel: '不成立' })

export function buildSkillEffectFlow(structure: SkillStructure): SkillEffectFlowModel {
  const a = structure.activationSettings
  const activation: FlowField[] = [
    { label: 'SP回復', value: formatSkillStructureSpRecovery(a.spRecovery) },
    { label: '発動', value: formatSkillStructureActivationMethod(a.activationMethod) },
    { label: '初期SP', value: number(a.initialSp) },
    { label: '必要SP', value: number(a.spCost) },
    { label: '蓄積上限', value: number(a.maxCharges) },
  ]
  if (structure.effectStructure.modeTransitions?.length) activation.push({ label: '発動時の状態切替',
    value: structure.effectStructure.modeTransitions.map(t => `${formatSkillStructureMode(t.from)} → ${formatSkillStructureMode(t.to)}`).join(' / ') })
  return { activation, trigger: formatSkillStructureActivationTrigger(a.activationTrigger),
    // The generated effectStructure is a lossy numeric preview of a guard recipe.
    stages: structure.guardRecipe ? guardStages(structure, structure.guardRecipe)
      : structure.effectStructure.stages.map(stage => nativeStage(structure, stage)) }
}

function nativeCondition(condition: SkillStructurePredicate | null): FlowCondition | undefined {
  if (!condition) return undefined
  if (condition.metric === 'targetCanBeLevitated' && condition.comparison === 'EQ' && condition.value) {
    return { label: '対象は浮遊可能', yesLabel: '可能', noLabel: '不可' }
  }
  return branch(formatSkillStructurePredicate(condition))
}

function nativeStage(structure: SkillStructure, stage: SkillStructureStage): FlowStage {
  const fields: FlowField[] = [
    { label: '持続', value: formatSkillStructureDuration(stage.duration) },
    { label: '終了', value: formatSkillStructureEndCondition(stage.endCondition) },
  ]
  const target = structure.effectStructure.targetSelection
  if (target) {
    fields.push({ label: '対象の初期状態', value: target.initialState === 'GROUND' ? '地上' : '地上・飛行' })
    if (target.maxTargets !== undefined) fields.push({ label: '対象数上限', value: target.maxTargets === null ? '上限なし' : `${number(target.maxTargets)}体` })
  }
  const warnings: string[] = []
  const ids = new Map(stage.effects.map(effect => [effect.id, effect]))
  const invalid = ids.size !== stage.effects.length || stage.effects.some(effect =>
    effect.afterEffects?.some(id => !ids.has(id)))
  const ordered = invalid ? null : topologicalLayers(stage.effects)
  if (!ordered) warnings.push('効果の依存関係を確認できません。')
  const titles = new Map(stage.effects.map(effect => [effect.id, effectTitle(effect)]))
  if (ordered) {
    const attacks = ordered.flat().filter(effect => effect.item === 'DIRECT_DAMAGE')
    if (attacks.length > 1 && attacks.slice(1).every((effect, index) => dependsOn(effect, attacks[index].id, ids))) {
      attacks.forEach((effect, index) => titles.set(effect.id,
        index === 0 ? '初撃' : effect.item === 'DIRECT_DAMAGE' && effect.value.count > 1 ? '連続攻撃' : attacks.length === 2 ? '追撃' : `第${index + 1}撃`))
    }
  }
  const toStep = (effect: SkillStructureEffect): FlowStep => nativeStep(effect, titles.get(effect.id)!)
  const groups: FlowGroup[] = []
  if (!ordered) {
    groups.push({ id: `${stage.id}-effects`, label: '効果', layers: [stage.effects.map(toStep)] })
  } else {
    // Dependencies can cross timing groups (e.g. maximum HP before an entry heal).
    // Keep each connected dependency component separate from unrelated effects.
    const visited = new Set<string>(), independent = new Map<string, SkillStructureEffect[]>()
    for (const effect of stage.effects) {
      if (visited.has(effect.id)) continue
      const component = new Set([effect.id]), pending = [effect.id]
      while (pending.length) {
        const current = pending.pop()!
        for (const candidate of stage.effects) if (ids.get(current)!.afterEffects?.includes(candidate.id)
          || candidate.afterEffects?.includes(current)) {
          if (!component.has(candidate.id)) { component.add(candidate.id); pending.push(candidate.id) }
        }
      }
      for (const id of component) visited.add(id)
      const effects = stage.effects.filter(candidate => component.has(candidate.id))
      if (effects.length === 1) {
        const key = formatSkillStructureEffectTiming(effect.timing)
        independent.set(key, [...(independent.get(key) ?? []), effect])
      } else {
        const layers = topologicalLayers(effects)!
        // A plain layer-to-layer arrow must not invent edges in a non-layered DAG.
        const layerOrderIsExact = layers.slice(1).every((layer, index) => layer.every(next =>
          layers[index].every(previous => dependsOn(next, previous.id, ids))))
        const steps = layerOrderIsExact ? layers.map(layer => layer.map(toStep)) : [layers.flat().map(effect => ({
          ...toStep(effect), fields: [...toStep(effect).fields,
            ...(effect.afterEffects?.length ? [{ label: '先行効果', value: effect.afterEffects.map(id => titles.get(id)!).join(' / ') }] : [])],
        }))]
        const timings = [...new Set(effects.map(entry => formatSkillStructureEffectTiming(entry.timing)))]
        if (timings.length > 1) for (const step of steps.flat()) step.fields.unshift({
          label: 'タイミング', value: formatSkillStructureEffectTiming(ids.get(step.id)!.timing),
        })
        groups.push({ id: `${stage.id}-sequence-${effect.id}`, label: timings.length === 1 ? timings[0] : '効果の適用順', layers: steps })
      }
    }
    for (const [label, effects] of independent) groups.push({ id: `${stage.id}-timing-${effects[0].id}`, label, layers: [effects.map(toStep)] })
  }
  return { id: stage.id, label: stage.label, condition: nativeCondition(stage.applicability), fields, groups,
    ...(warnings.length ? { warnings } : {}) }
}

function topologicalLayers(effects: readonly SkillStructureEffect[]): SkillStructureEffect[][] | null {
  const pending = new Map(effects.map(effect => [effect.id, effect])), done = new Set<string>()
  const layers: SkillStructureEffect[][] = []
  while (pending.size) {
    const layer = [...pending.values()].filter(effect => effect.afterEffects?.every(id => done.has(id)) ?? true)
    if (!layer.length) return null
    layers.push(layer)
    for (const effect of layer) { pending.delete(effect.id); done.add(effect.id) }
  }
  return layers
}

function dependsOn(effect: SkillStructureEffect, id: string, effects: Map<string, SkillStructureEffect>, visited = new Set<string>()): boolean {
  if (visited.has(effect.id)) return false
  visited.add(effect.id)
  return effect.afterEffects?.some(parent => parent === id || dependsOn(effects.get(parent)!, id, effects, visited)) ?? false
}

function effectTitle(effect: SkillStructureEffect): string {
  if (effect.item === 'DIRECT_DAMAGE') return `${damageTypes[effect.value.damageType]}ダメージ`
  if (effect.item === 'APPLY_STATUS') return '浮遊'
  return formatSkillStructureEffectItem(effect.item)
}

function nativeStep(effect: SkillStructureEffect, title: string): FlowStep {
  const fields: FlowField[] = [{ label: '対象', value: formatSkillStructureEffectTarget(effect.target) }]
  if (effect.item === 'DIRECT_DAMAGE') {
    fields.push({ label: 'ダメージ', value: damageTypes[effect.value.damageType] },
      { label: '倍率', value: `攻撃力の${percent(effect.value.attackScale)}` },
      { label: '打撃回数', value: `${number(effect.value.count)}回` })
    if (effect.value.targeting) fields.push({ label: '対象選択', value: effect.value.targeting.selection === 'ALL' ? '全対象' : 'ランダム' })
    if (effect.value.targeting?.splashRadius !== undefined) fields.push({ label: '範囲半径', value: `${number(effect.value.targeting.splashRadius)}マス` })
    if (effect.value.intervalSeconds !== undefined) fields.push({ label: '打撃間隔', value: `${number(effect.value.intervalSeconds)}秒` })
  } else if (effect.item === 'APPLY_STATUS') {
    fields.push({ label: '持続', value: `${number(effect.value.durationSeconds)}秒` })
    if (effect.value.maxWeight !== undefined) fields.push({ label: '重量条件', value: `重量ランク${number(effect.value.maxWeight)}以下` })
    if (effect.value.durationWeightScaling) {
      const scaling = effect.value.durationWeightScaling
      fields.push({ label: `重量ランク${number(scaling.threshold)}超`, value: `持続時間×${number(scaling.multiplier)}` })
    }
  } else {
    fields.push({ label: '演算', value: formatSkillStructureEffectOperation(effect) },
      { label: '値', value: formatSkillStructureEffectValue(effect) })
    if (effect.unit === 'HP_LOSS_PROFILE' || effect.unit === 'ATTACK_ACTION') {
      fields.push(...getSkillStructureEffectValueRows(effect).map(([label, value]) => ({ label, value: String(value) })))
    }
  }
  let condition = nativeCondition(effect.condition)
  if (effect.item === 'APPLY_STATUS' && effect.value.maxWeight !== undefined) condition = branch([
    condition?.label, `重量ランク≦${number(effect.value.maxWeight)}`,
  ].filter(Boolean).join('・'))
  // A skipped conditional effect still completes its processing dependency.
  return { id: effect.id, title, fields,
    ...(condition ? { condition, skipLabel: effect.item === 'APPLY_STATUS' ? `${title}なし` : '変更なし' } : {}) }
}

function guardStages(structure: SkillStructure, recipe: GuardSkillRecipe): FlowStage[] {
  const board = new Map(structure.source.blackboard.map(entry => [entry.key.toLowerCase(), entry.value]))
  const inputs = new Map(recipe.inputs.map(input => [input.key, input]))
  return recipe.stages.map(stage => {
    const warnings = [...new Set([...(stage.unresolved ?? []), ...(stage.calculationIssues?.map(issue => issue.reason) ?? [])])]
    const expression = (value: GuardValue) => guardExpression(value, board, inputs, warnings)
    const formatted = (value: GuardValue, unit = '', ratio = false) => {
      const raw = expression(value), numeric = Number(raw)
      return ratio ? raw !== '' && Number.isFinite(numeric) ? percent(numeric) : `（${raw}）×100%` : `${raw}${unit}`
    }
    const fields: FlowField[] = [{ label: '攻撃の単位', value: { NORMAL: '通常攻撃', NEXT_ATTACK: '次の通常攻撃', SKILL_ACTION: '選択段階1回' }[stage.kind] }]
    if (stage.duration === 'UNTIL_EXIT') fields.push({ label: '持続', value: '退場まで' })
    else if (stage.duration !== undefined) fields.push({ label: '持続', value: formatted(stage.duration, '秒') })
    else if (stage.kind === 'NORMAL' && structure.source.duration > 0) fields.push({ label: '持続', value: `${number(structure.source.duration)}秒` })
    if (stage.maxTargets !== undefined) fields.push({ label: '対象数上限', value: stage.maxTargets === null ? '上限なし' : formatted(stage.maxTargets, '体') })
    const modifiers: FlowStep[] = []
    for (const [key, label, unit, ratio] of [
      ['atk', '攻撃力増加', '', true], ['aspd', '攻撃速度', '', false],
      ['intervalScale', '攻撃間隔の倍率', '倍', false], ['intervalAdd', '攻撃間隔の加算', '秒', false],
      ['defenseIgnoreRatio', '防御力の無視割合', '', true], ['defenseIgnoreFixed', '防御力の固定値無視', '', false],
      ['resistanceIgnoreFixed', '術耐性の固定値無視', '', false],
    ] as const) if (stage[key] !== undefined) modifiers.push({ id: `${stage.id}-${key}`, title: label,
      fields: [{ label: '値', value: formatted(stage[key]!, unit, ratio) }] })
    const groups: FlowGroup[] = []
    if (modifiers.length) groups.push({ id: `${stage.id}-modifiers`, label: '段階中', layers: [modifiers] })
    const actions = new Map<string, FlowStep[]>()
    stage.actions.forEach((action, index) => {
      const label = action.timing === 'PER_SECOND' ? '毎秒' : action.timing === 'ON_DEPLOY' ? '配置時'
        : stage.kind === 'NEXT_ATTACK' ? '次の通常攻撃時' : stage.kind === 'SKILL_ACTION' ? '選択段階1回' : '攻撃時'
      actions.set(label, [...(actions.get(label) ?? []), guardAction(action, `${stage.id}-action-${index}`, formatted)])
    })
    for (const [label, steps] of actions) groups.push({ id: `${stage.id}-actions-${steps[0].id}`, label, layers: [steps] })
    return { id: stage.id, label: stage.label, fields, groups,
      ...(stage.when ? { condition: branch(guardWhen(stage.when, inputs)) } : {}),
      ...(warnings.length ? { warnings: [...new Set(warnings)] } : {}) }
  })
}

function guardAction(action: GuardDamageAction, id: string,
  format: (value: GuardValue, unit?: string, ratio?: boolean) => string): FlowStep {
  const fields: FlowField[] = [{ label: 'ダメージ', value: damageTypes[action.damageType] }]
  // Fixed damage is independent of the zero attack scale used in these recipes.
  if (!(typeof action.scale === 'number' && action.scale === 0 && action.flatDamage !== undefined)) {
    fields.push({ label: '基準', value: action.basis === 'TARGET_CURRENT_HP' ? '対象の現在HP' : '自身の攻撃力' },
      { label: '倍率', value: format(action.scale, '', true) })
  }
  fields.push({ label: '打撃回数', value: format(action.hits ?? 1, '回') })
  for (const [key, label, unit, ratio] of [
    ['targets', '合計命中対象数', '体', false], ['attackBonus', '攻撃力増加割合', '', true],
    ['probability', '発動確率', '', true], ['flatDamage', '固定ダメージ', '', false],
    ['minimumAttackScale', '最低攻撃倍率', '倍', false],
  ] as const) if (action[key] !== undefined) fields.push({ label, value: format(action[key]!, unit, ratio) })
  return { id, title: action.label, fields }
}

function guardInputValue(input: GuardInput | undefined, value: string | number | boolean): string {
  return input?.options?.find(option => option.value === value)?.label
    ?? (typeof value === 'boolean' ? value ? 'あり' : 'なし' : String(value))
}

function guardWhen(when: NonNullable<GuardStage['when']>, inputs: Map<string, GuardInput>): string {
  const input = inputs.get(when.input)
  return `${input?.label ?? when.input}${comparisons[when.comparison]}${guardInputValue(input, when.value)}`
}

function hasGuardInput(value: GuardValue): boolean {
  if (typeof value === 'number' || 'key' in value) return false
  if ('input' in value) return true
  return value.args.some(hasGuardInput)
}

function guardExpression(value: GuardValue, board: Map<string, number>, inputs: Map<string, GuardInput>, warnings: string[]): string {
  if (!hasGuardInput(value)) {
    try { return number(resolveGuardValue(value, board, {})) }
    catch (error) { warnings.push(error instanceof Error ? error.message : '効果の値を取得できません。'); return '未取得' }
  }
  if (typeof value === 'number') return number(value)
  if ('key' in value) return guardExpression(value, board, inputs, warnings)
  if (!('op' in value)) return inputs.get(value.input)?.label ?? value.input
  if (value.op === 'if') return `（${guardWhen(value, inputs)}：${guardExpression(value.yes, board, inputs, warnings)}／それ以外：${guardExpression(value.no, board, inputs, warnings)}）`
  const args = value.args.map(arg => guardExpression(arg, board, inputs, warnings))
  return value.op === 'min' || value.op === 'max' ? `${value.op === 'min' ? '最小' : '最大'}（${args.join('、')}）`
    : `（${args.join(value.op === 'add' ? '＋' : '×')}）`
}
