import {
  DAMAGE_TYPE_LABELS,
  calculateAttackPipeline,
  calculateDamageBreakdown,
  calculateSkillDamageBreakdown,
  deriveSkillModel,
  getOperatorStats,
  type AttackPipelineBreakdown,
  type DamageCalculationBreakdown,
  type DamageType,
  type OperatorStats,
  type SkillDamageBreakdown,
  type SkillModelDefaults,
} from './damageCalculator.ts'
import {
  evaluateOperatorEffects,
  type OperatorEffectsEvaluation,
} from './operatorEffects.ts'
import {
  applyOperatorModule,
  getOperatorModuleId,
  getOperatorModuleLevels,
  getOperatorModules,
  isOperatorModuleUnlocked,
  type OperatorModuleApplication,
} from './operatorModules.ts'
import { getOperatorPassives, type OperatorPassives } from './operatorProfile.ts'
import {
  detectNormalAttackDamageType,
  detectSkillDamageType,
  getSkillDamageUnsupportedReasons,
  getSkillTotalMode,
  type DamageTypeDetection,
} from './skillDamageModel.ts'
import type { RawOperatorModule, RawSkillLevel, SkillRecord } from '../types/skill.ts'

export const COMPARISON_BUILD_METRICS = [
  'NORMAL_PER_HIT',
  'NORMAL_DPS',
  'SKILL_PER_HIT',
  'SKILL_PER_ATTACK',
  'SKILL_DPS',
  'SKILL_TOTAL',
] as const

export type ComparisonBuildMetric = typeof COMPARISON_BUILD_METRICS[number]

export const COMPARISON_BUILD_METRIC_LABELS: Record<ComparisonBuildMetric, string> = {
  NORMAL_PER_HIT: '通常攻撃（1ヒット）',
  NORMAL_DPS: '通常攻撃DPS',
  SKILL_PER_HIT: 'スキル（1ヒット）',
  SKILL_PER_ATTACK: 'スキル（1攻撃）',
  SKILL_DPS: 'スキルDPS',
  SKILL_TOTAL: 'スキル総ダメージ',
}

export const COMPARISON_AXES = ['DEFENSE', 'RESISTANCE'] as const
export type ComparisonAxis = typeof COMPARISON_AXES[number]

export const COMPARISON_AXIS_LABELS: Record<ComparisonAxis, string> = {
  DEFENSE: '防御力',
  RESISTANCE: '術耐性',
}

export interface ComparisonBuildConfig {
  slotId: string
  label?: string | null
  colorIndex?: number
  operatorId: string
  skillRecordId: string
  phaseIndex: number
  operatorLevel: number
  trustPercent: number
  skillLevelIndex: number
  moduleId: string | null
  moduleLevel: number | null
}

export interface ComparisonEnemyCondition {
  defense: number
  resistance: number
}

export interface ComparisonBuildOutput {
  damageTypeDetection: DamageTypeDetection
  attackPipeline: AttackPipelineBreakdown | null
  damageBreakdown: DamageCalculationBreakdown | null
  skillBreakdown: SkillDamageBreakdown | null
  perHit: number | null
  perAttack: number | null
  dps: number | null
  total: number | null
  unavailableReasons: string[]
  warnings: string[]
}

export interface ComparisonModuleSelection {
  id: string | null
  module: RawOperatorModule | null
  level: number
  unlocked: boolean
  application: OperatorModuleApplication
}

export interface PreparedComparisonBuild {
  config: ComparisonBuildConfig
  skill: SkillRecord
  skillLevel: RawSkillLevel
  passives: OperatorPassives
  module: ComparisonModuleSelection
  operatorStats: OperatorStats
  skillModel: SkillModelDefaults
  normalDamageTypeDetection: DamageTypeDetection
  skillDamageTypeDetection: DamageTypeDetection
  normalEffects: OperatorEffectsEvaluation
  skillEffects: OperatorEffectsEvaluation
  normalAttackPipeline: AttackPipelineBreakdown
  normalUnavailableReasons: string[]
  skillUnavailableReasons: string[]
  normalWarnings: string[]
  skillWarnings: string[]
}

export interface ComparisonBuildEvaluation {
  config: ComparisonBuildConfig
  enemy: ComparisonEnemyCondition
  skill: SkillRecord
  skillLevel: RawSkillLevel
  passives: OperatorPassives
  module: ComparisonModuleSelection
  operatorStats: OperatorStats
  skillModel: SkillModelDefaults
  normalEffects: OperatorEffectsEvaluation
  skillEffects: OperatorEffectsEvaluation
  normalOutput: ComparisonBuildOutput
  skillOutput: ComparisonBuildOutput
  unavailableReasons: string[]
  warnings: string[]
}

export interface ComparisonMetricValue {
  value: number | null
  minimumApplied: boolean
  unavailableReasons: string[]
  warnings: string[]
}

export interface ComparisonAxisPoint extends ComparisonMetricValue {
  x: number
  current: boolean
}

export interface ComparisonAxisSeries {
  slotId: string
  label: string
  colorIndex: number
  operatorId: string
  operatorName: string
  skillRecordId: string
  skillName: string
  metric: ComparisonBuildMetric
  points: ComparisonAxisPoint[]
  unavailableReasons: string[]
  warnings: string[]
}

export const DEFAULT_COMPARISON_ENEMY: Readonly<ComparisonEnemyCondition> = {
  defense: 0,
  resistance: 0,
}

const DEFAULT_DEFENSE_POINTS = [0, 500, 1000, 1500, 2000]
const DEFAULT_RESISTANCE_POINTS = [0, 20, 40, 60, 80, 95, 100]

/**
 * Resolves all operator-dependent state once. Axis series should prepare a build
 * once and then evaluate it against each enemy point.
 */
export function prepareComparisonBuild(
  rows: SkillRecord[],
  requestedConfig: ComparisonBuildConfig,
): PreparedComparisonBuild {
  const skill = rows.find((row) => (
    row.id === requestedConfig.skillRecordId
    && row.operatorId === requestedConfig.operatorId
  ))
  if (!skill) {
    throw new Error(`比較対象のスキルが見つかりません: ${requestedConfig.skillRecordId}`)
  }

  const phases = skill.operatorProfile.phases
  const phaseIndex = clampInteger(requestedConfig.phaseIndex, 0, Math.max(0, phases.length - 1))
  const phase = phases[phaseIndex]
  const operatorLevel = clampInteger(
    requestedConfig.operatorLevel,
    1,
    Math.max(1, phase?.maxLevel ?? 1),
  )
  const trustPercent = clamp(finiteOr(requestedConfig.trustPercent, 100), 0, 100)
  const skillLevels = skill.skillLevels.length > 0 ? skill.skillLevels : [skill.raw]
  const skillLevelIndex = clampInteger(
    requestedConfig.skillLevelIndex,
    0,
    Math.max(0, skillLevels.length - 1),
  )
  const skillLevel = skillLevels[skillLevelIndex] ?? skill.raw
  const modules = getOperatorModules(skill.operatorProfile)
  const moduleResolution = resolveModuleSelection(
    modules,
    requestedConfig.moduleId,
    requestedConfig.moduleLevel,
    phaseIndex,
    operatorLevel,
  )
  const config: ComparisonBuildConfig = {
    ...requestedConfig,
    colorIndex: Math.max(0, clampInteger(requestedConfig.colorIndex ?? 0, 0, Number.MAX_SAFE_INTEGER)),
    phaseIndex,
    operatorLevel,
    trustPercent,
    skillLevelIndex,
    moduleId: moduleResolution.id,
    moduleLevel: moduleResolution.module ? moduleResolution.level : null,
  }

  const basePassives = getOperatorPassives(
    skill.operatorProfile,
    phaseIndex,
    operatorLevel,
  )
  const moduleApplication = applyOperatorModule(
    basePassives,
    moduleResolution.module,
    moduleResolution.level,
  )
  const passives = moduleApplication.passives
  const normalDamageTypeDetection = detectNormalAttackDamageType(
    skill.profession,
    getResolvedTraitDescription(passives),
  )
  const normalEffects = evaluateOperatorEffects(
    skill.operatorId,
    passives,
    normalDamageTypeDetection.damageType,
  )
  const operatorStats = getOperatorStats(
    skill.operatorProfile,
    phaseIndex,
    operatorLevel,
    trustPercent,
    {
      attackSpeedBonus: normalEffects.modifiers.attackSpeedBonus + moduleApplication.attackSpeedBonus,
      moduleAttack: moduleApplication.moduleAttack,
    },
  )
  const skillModel = deriveSkillModel(
    skillLevel,
    operatorStats.attackInterval,
    operatorStats.attackSpeed,
  )
  const skillDamageTypeDetection = detectSkillDamageType(
    skill,
    normalDamageTypeDetection.damageType,
    skillLevel.description ?? skill.description,
  )
  const skillEffects = evaluateOperatorEffects(
    skill.operatorId,
    passives,
    skillDamageTypeDetection.damageType,
  )
  const configurationErrors = getModuleConfigurationErrors(moduleResolution)
  const unmodeledDamageKeys = getUnmodeledDamageKeys(skillLevel)
  const normalUnavailableReasons = unique([
    ...configurationErrors,
    ...(normalDamageTypeDetection.damageType === null
      ? [normalDamageTypeDetection.reason]
      : []),
  ])
  const skillUnavailableReasons = unique([
    ...configurationErrors,
    ...getSkillDamageUnsupportedReasons(skill),
    ...(skillModel.notes.some((note) => note.includes('初期版の計算対象外'))
      ? ['計算対象外の独立ダメージ倍率を含みます。']
      : []),
    ...(skillModel.notes.some((note) => note.includes('複数の攻撃力補正E'))
      ? ['複数の攻撃倍率を別々に扱うモデルが必要です。']
      : []),
    ...(unmodeledDamageKeys.length > 0
      ? [`未対応の攻撃・ダメージ倍率を含みます（${unmodeledDamageKeys.join(', ')}）。`]
      : []),
    ...(skillDamageTypeDetection.damageType === null
      ? [skillDamageTypeDetection.reason]
      : []),
  ])
  const moduleWarnings = moduleApplication.unsupportedReasons
  const normalWarnings = unique([
    ...moduleWarnings,
    ...getEffectWarnings(normalEffects),
  ])
  const skillWarnings = unique([
    ...moduleWarnings,
    ...getModelWarnings(skillModel),
    ...getEffectWarnings(skillEffects),
  ])
  const normalAttackPipeline = calculateAttackPipeline(operatorStats.attack, {
    directAddition: normalEffects.modifiers.attackAddition,
    directMultiplierPercent: normalEffects.modifiers.attackMultiplierPercent,
  })

  return {
    config,
    skill,
    skillLevel,
    passives,
    module: {
      ...moduleResolution,
      application: moduleApplication,
    },
    operatorStats,
    skillModel,
    normalDamageTypeDetection,
    skillDamageTypeDetection,
    normalEffects,
    skillEffects,
    normalAttackPipeline,
    normalUnavailableReasons,
    skillUnavailableReasons,
    normalWarnings,
    skillWarnings,
  }
}

export function evaluatePreparedComparisonBuild(
  prepared: PreparedComparisonBuild,
  requestedEnemy: ComparisonEnemyCondition = DEFAULT_COMPARISON_ENEMY,
): ComparisonBuildEvaluation {
  const enemy = normalizeEnemyCondition(requestedEnemy)
  const normalDamageType = prepared.normalDamageTypeDetection.damageType
  const skillDamageType = prepared.skillDamageTypeDetection.damageType
  const normalBreakdown = prepared.normalUnavailableReasons.length === 0 && normalDamageType
    ? calculateDamageBreakdown(
        prepared.normalAttackPipeline.finalAttack,
        normalDamageType,
        enemy.defense,
        enemy.resistance,
        {
          defenseIgnoreFixed: prepared.normalEffects.modifiers.defenseIgnoreFixed,
          resistanceIgnoreFixed: prepared.normalEffects.modifiers.resistanceIgnoreFixed,
        },
      )
    : null
  const normalPerHit = normalBreakdown?.result ?? null
  const normalDps = normalPerHit !== null && prepared.operatorStats.attackInterval > 0
    ? normalPerHit / prepared.operatorStats.attackInterval
    : null
  const skillBreakdown = prepared.skillUnavailableReasons.length === 0 && skillDamageType
    ? calculateSkillDamageBreakdown(
        prepared.operatorStats.attack,
        skillDamageType,
        enemy.defense,
        enemy.resistance,
        prepared.skillModel,
        {
          canShowDps: prepared.skill.classification.outputCapabilities.canShowDps,
          totalMode: getSkillTotalMode(prepared.skill),
          attackModifiers: {
            directAddition: prepared.skillEffects.modifiers.attackAddition,
            directMultiplierPercent: prepared.skillEffects.modifiers.attackMultiplierPercent,
          },
          mitigationModifiers: {
            defenseIgnoreFixed: prepared.skillEffects.modifiers.defenseIgnoreFixed,
            resistanceIgnoreFixed: prepared.skillEffects.modifiers.resistanceIgnoreFixed,
          },
        },
      )
    : null
  const capabilities = prepared.skill.classification.outputCapabilities
  const totalAvailable = isSkillTotalAvailable(
    getSkillTotalMode(prepared.skill),
    capabilities,
    prepared.skillModel,
  )
  const normalizedSkillBreakdown = skillBreakdown
    ? { ...skillBreakdown, total: totalAvailable ? skillBreakdown.total : null }
    : null

  const normalOutput: ComparisonBuildOutput = {
    damageTypeDetection: prepared.normalDamageTypeDetection,
    attackPipeline: prepared.normalAttackPipeline,
    damageBreakdown: normalBreakdown,
    skillBreakdown: null,
    perHit: normalPerHit,
    perAttack: normalPerHit,
    dps: normalDps,
    total: null,
    unavailableReasons: prepared.normalUnavailableReasons,
    warnings: prepared.normalWarnings,
  }
  const skillOutput: ComparisonBuildOutput = {
    damageTypeDetection: prepared.skillDamageTypeDetection,
    attackPipeline: normalizedSkillBreakdown?.attackPipeline ?? null,
    damageBreakdown: normalizedSkillBreakdown?.mitigation ?? null,
    skillBreakdown: normalizedSkillBreakdown,
    perHit: capabilities.canShowPerHit ? normalizedSkillBreakdown?.perHit ?? null : null,
    perAttack: capabilities.canShowPerHit ? normalizedSkillBreakdown?.perAttack ?? null : null,
    dps: capabilities.canShowDps ? normalizedSkillBreakdown?.dps ?? null : null,
    total: totalAvailable ? normalizedSkillBreakdown?.total ?? null : null,
    unavailableReasons: prepared.skillUnavailableReasons,
    warnings: prepared.skillWarnings,
  }

  return {
    config: prepared.config,
    enemy,
    skill: prepared.skill,
    skillLevel: prepared.skillLevel,
    passives: prepared.passives,
    module: prepared.module,
    operatorStats: prepared.operatorStats,
    skillModel: prepared.skillModel,
    normalEffects: prepared.normalEffects,
    skillEffects: prepared.skillEffects,
    normalOutput,
    skillOutput,
    unavailableReasons: unique([
      ...normalOutput.unavailableReasons,
      ...skillOutput.unavailableReasons,
    ]),
    warnings: unique([
      ...normalOutput.warnings,
      ...skillOutput.warnings,
    ]),
  }
}

export function evaluateComparisonBuild(
  rows: SkillRecord[],
  config: ComparisonBuildConfig,
  enemy: ComparisonEnemyCondition = DEFAULT_COMPARISON_ENEMY,
): ComparisonBuildEvaluation {
  return evaluatePreparedComparisonBuild(prepareComparisonBuild(rows, config), enemy)
}

export function getComparisonMetricValue(
  evaluation: ComparisonBuildEvaluation,
  metric: ComparisonBuildMetric,
): ComparisonMetricValue {
  const normal = evaluation.normalOutput
  const skill = evaluation.skillOutput

  if (metric === 'NORMAL_PER_HIT') return metricValue(normal.perHit, normal)
  if (metric === 'NORMAL_DPS') return metricValue(normal.dps, normal)
  if (metric === 'SKILL_PER_HIT') {
    return metricValue(skill.perHit, skill, 'このスキルでは1ヒットのダメージを算出できません。')
  }
  if (metric === 'SKILL_PER_ATTACK') {
    return metricValue(skill.perAttack, skill, 'このスキルでは1攻撃のダメージを算出できません。')
  }
  if (metric === 'SKILL_DPS') {
    return metricValue(skill.dps, skill, 'このスキルではDPSを算出できません。')
  }
  return metricValue(
    skill.total,
    skill,
    '終了条件からスキル総ダメージを確定できません。',
  )
}

export function getDefaultComparisonAxisPoints(
  axis: ComparisonAxis,
  enemy: ComparisonEnemyCondition = DEFAULT_COMPARISON_ENEMY,
): number[] {
  const normalizedEnemy = normalizeEnemyCondition(enemy)
  const current = axis === 'DEFENSE' ? normalizedEnemy.defense : normalizedEnemy.resistance
  return normalizeAxisPoints(
    axis,
    axis === 'DEFENSE' ? DEFAULT_DEFENSE_POINTS : DEFAULT_RESISTANCE_POINTS,
    current,
  )
}

export function buildComparisonAxisSeries(
  rows: SkillRecord[],
  configs: ComparisonBuildConfig[],
  enemy: ComparisonEnemyCondition,
  axis: ComparisonAxis,
  metric: ComparisonBuildMetric,
  requestedPoints?: number[],
): ComparisonAxisSeries[] {
  const normalizedEnemy = normalizeEnemyCondition(enemy)
  const current = axis === 'DEFENSE' ? normalizedEnemy.defense : normalizedEnemy.resistance
  const preparedBuilds = configs.map((config) => prepareComparisonBuild(rows, config))
  const basePoints = requestedPoints ?? getDefaultComparisonAxisPoints(axis, normalizedEnemy)
  const displayMaximum = Math.max(current, ...basePoints)
  const breakpoints = requestedPoints === undefined
    ? preparedBuilds.flatMap((prepared) => (
        getPreparedAxisBreakpoints(prepared, axis, displayMaximum)
      ))
    : []
  const points = normalizeAxisPoints(
    axis,
    [...basePoints, ...breakpoints],
    current,
  )

  return preparedBuilds.map((prepared, seriesIndex) => {
    const seriesPoints = points.map((x) => {
      const pointEnemy = axis === 'DEFENSE'
        ? { ...normalizedEnemy, defense: x }
        : { ...normalizedEnemy, resistance: x }
      const value = getComparisonMetricValue(
        evaluatePreparedComparisonBuild(prepared, pointEnemy),
        metric,
      )
      return { x, current: x === current, ...value }
    })

    return {
      slotId: prepared.config.slotId,
      label: getComparisonAxisSeriesLabel(prepared, seriesIndex),
      colorIndex: prepared.config.colorIndex ?? 0,
      operatorId: prepared.skill.operatorId,
      operatorName: prepared.skill.operatorName,
      skillRecordId: prepared.skill.id,
      skillName: `S${prepared.skill.skillIndex} ${prepared.skill.skillName}`,
      metric,
      points: seriesPoints,
      unavailableReasons: unique(seriesPoints.flatMap((point) => point.unavailableReasons)),
      warnings: unique(seriesPoints.flatMap((point) => point.warnings)),
    }
  })
}

export function buildOperatorBuildComparisonCsv(
  evaluations: ComparisonBuildEvaluation[],
): string {
  const headers = [
    '比較名',
    'オペレーター',
    'スキル',
    '昇進',
    'レベル',
    '信頼度',
    'スキルレベル',
    'モジュール',
    '敵防御力',
    '敵術耐性',
    '通常攻撃種別',
    COMPARISON_BUILD_METRIC_LABELS.NORMAL_PER_HIT,
    COMPARISON_BUILD_METRIC_LABELS.NORMAL_DPS,
    '通常攻撃の計算状態',
    'スキル種別',
    COMPARISON_BUILD_METRIC_LABELS.SKILL_PER_HIT,
    COMPARISON_BUILD_METRIC_LABELS.SKILL_PER_ATTACK,
    COMPARISON_BUILD_METRIC_LABELS.SKILL_DPS,
    COMPARISON_BUILD_METRIC_LABELS.SKILL_TOTAL,
    'スキルの計算状態',
  ]
  const lines = [headers.map(escapeCsvCell).join(',')]

  for (const evaluation of evaluations) {
    const skill = evaluation.skill
    const config = evaluation.config
    const moduleLabel = evaluation.module.module
      ? `${evaluation.module.application.moduleName || '名称なし'} Lv.${evaluation.module.level}`
      : 'なし'
    const cells = [
      getComparisonBuildLabel(config, skill),
      skill.operatorName,
      `S${skill.skillIndex} ${skill.skillName}`,
      `昇進${config.phaseIndex}`,
      String(config.operatorLevel),
      `${formatCsvNumber(config.trustPercent)}%`,
      getSkillLevelLabel(config.skillLevelIndex, skill.skillLevels.length),
      moduleLabel,
      formatCsvNumber(evaluation.enemy.defense),
      formatCsvNumber(evaluation.enemy.resistance),
      formatDamageType(evaluation.normalOutput.damageTypeDetection.damageType),
      optionalCsvNumber(evaluation.normalOutput.perHit),
      optionalCsvNumber(evaluation.normalOutput.dps),
      formatOutputStatus(evaluation.normalOutput),
      formatDamageType(evaluation.skillOutput.damageTypeDetection.damageType),
      optionalCsvNumber(evaluation.skillOutput.perHit),
      optionalCsvNumber(evaluation.skillOutput.perAttack),
      optionalCsvNumber(evaluation.skillOutput.dps),
      optionalCsvNumber(evaluation.skillOutput.total),
      formatSkillOutputStatus(evaluation),
    ]
    lines.push(cells.map(escapeCsvCell).join(','))
  }

  return `\uFEFF${lines.join('\r\n')}`
}

export function buildOperatorBuildComparisonSeriesCsv(
  series: ComparisonAxisSeries[],
  axis: ComparisonAxis,
): string {
  const xValues = uniqueSorted(series.flatMap((item) => item.points.map((point) => point.x)))
  const headers = [
    COMPARISON_AXIS_LABELS[axis],
    ...series.map((item) => item.label),
  ]
  const lines = [headers.map(escapeCsvCell).join(',')]

  for (const x of xValues) {
    const cells = [
      formatCsvNumber(x),
      ...series.map((item) => optionalCsvNumber(
        item.points.find((point) => point.x === x)?.value ?? null,
      )),
    ]
    lines.push(cells.map(escapeCsvCell).join(','))
  }

  return `\uFEFF${lines.join('\r\n')}`
}

export function getComparisonBuildLabel(
  config: Pick<ComparisonBuildConfig, 'label'>,
  skill: Pick<SkillRecord, 'operatorName' | 'skillIndex' | 'skillName'>,
): string {
  return config.label?.trim() || `${skill.operatorName} · S${skill.skillIndex} ${skill.skillName}`
}

function resolveModuleSelection(
  modules: RawOperatorModule[],
  requestedId: string | null,
  requestedLevel: number | null,
  phaseIndex: number,
  operatorLevel: number,
): Omit<ComparisonModuleSelection, 'application'> {
  if (!requestedId) {
    return { id: null, module: null, level: 0, unlocked: true }
  }

  const entry = modules
    .map((module, index) => ({ module, id: getOperatorModuleId(module, index) }))
    .find((candidate) => candidate.id === requestedId)
  if (!entry) {
    return { id: requestedId, module: null, level: 0, unlocked: false }
  }

  const levels = getOperatorModuleLevels(entry.module)
  const level = resolveModuleLevel(levels, requestedLevel)
  return {
    id: entry.id,
    module: entry.module,
    level,
    unlocked: isOperatorModuleUnlocked(entry.module, phaseIndex, operatorLevel),
  }
}

function resolveModuleLevel(levels: number[], requestedLevel: number | null): number {
  if (levels.length === 0) return Math.max(1, clampInteger(requestedLevel ?? 1, 1, Number.MAX_SAFE_INTEGER))
  if (requestedLevel !== null && levels.includes(requestedLevel)) return requestedLevel
  return levels.at(-1) ?? 1
}

function getModuleConfigurationErrors(
  module: Omit<ComparisonModuleSelection, 'application'>,
): string[] {
  if (!module.id) return []
  if (!module.module) return ['選択したモジュールがこのオペレーターに存在しません。']
  if (!module.unlocked) return ['現在の昇進段階・レベルでは選択したモジュールを装備できません。']
  return []
}

function getResolvedTraitDescription(passives: OperatorPassives): string {
  return passives.sources.find((source) => source.sourceKind === 'TRAIT')?.description
    || passives.traitDescription
}

function getEffectWarnings(evaluation: OperatorEffectsEvaluation): string[] {
  return evaluation.effects
    .filter((effect) => effect.status === 'UNSUPPORTED' || effect.status === 'REQUIRES_INPUT')
    .map((effect) => `${effect.sourceName}「${effect.label}」: ${effect.reason}`)
}

function getPreparedAxisBreakpoints(
  prepared: PreparedComparisonBuild,
  axis: ComparisonAxis,
  maximum: number,
): number[] {
  const evaluationAtZero = evaluatePreparedComparisonBuild(prepared, {
    defense: 0,
    resistance: 0,
  })
  const breakpoints: number[] = []

  const add = (
    damageType: DamageType | null,
    attack: number | null,
    ignore: number,
  ) => {
    const matchesAxis = axis === 'DEFENSE'
      ? damageType === 'PHYSICAL'
      : damageType === 'ARTS'
    if (!matchesAxis || attack === null) return
    const normalizedIgnore = Math.max(0, ignore)
    if (normalizedIgnore > 0 && normalizedIgnore < maximum) breakpoints.push(normalizedIgnore)
    const minimumPoint = axis === 'DEFENSE'
      ? attack * 0.95 + normalizedIgnore
      : 95 + normalizedIgnore
    if (minimumPoint > 0 && minimumPoint <= maximum) breakpoints.push(minimumPoint)
  }

  add(
    prepared.normalDamageTypeDetection.damageType,
    prepared.normalAttackPipeline.finalAttack,
    axis === 'DEFENSE'
      ? prepared.normalEffects.modifiers.defenseIgnoreFixed
      : prepared.normalEffects.modifiers.resistanceIgnoreFixed,
  )
  add(
    prepared.skillDamageTypeDetection.damageType,
    evaluationAtZero.skillOutput.attackPipeline?.finalAttack ?? null,
    axis === 'DEFENSE'
      ? prepared.skillEffects.modifiers.defenseIgnoreFixed
      : prepared.skillEffects.modifiers.resistanceIgnoreFixed,
  )

  return breakpoints
}

function getComparisonAxisSeriesLabel(
  prepared: PreparedComparisonBuild,
  seriesIndex: number,
): string {
  const customLabel = prepared.config.label?.trim()
  if (customLabel) return customLabel
  const moduleLabel = prepared.module.module
    ? `${prepared.module.application.moduleName || '名称なし'} Lv.${prepared.module.level}`
    : 'モジュールなし'
  return `Build ${String.fromCharCode(65 + seriesIndex)} · ${getComparisonBuildLabel(prepared.config, prepared.skill)} · ${moduleLabel}`
}

function getModelWarnings(model: SkillModelDefaults): string[] {
  return model.notes.filter((note) => (
    !note.includes('初期版の計算対象外')
    && !note.includes('複数の攻撃力補正E')
  ))
}

function isSkillTotalAvailable(
  totalMode: ReturnType<typeof getSkillTotalMode>,
  capabilities: SkillRecord['classification']['outputCapabilities'],
  model: SkillModelDefaults,
): boolean {
  if (totalMode === 'DURATION') {
    return capabilities.canShowWindowTotal && capabilities.canShowDps && model.duration > 0
  }
  if (totalMode === 'AMMO') {
    return capabilities.canShowWindowTotal && model.ammoCount > 0
  }
  if (totalMode === 'ACTIVATION') return capabilities.canShowPerActivationTotal
  return false
}

function getUnmodeledDamageKeys(level: RawSkillLevel): string[] {
  return unique((level.blackboard ?? []).flatMap((entry) => {
    const key = entry.key?.toLowerCase()
    if (!key) return []
    const looksLikeDamageScale = /(?:atk|damage).*(?:scale|ratio)|(?:scale|ratio).*(?:atk|damage)/.test(key)
    const modeled = key === 'atk_scale' || key.endsWith('@atk_scale') || key.endsWith('.atk_scale')
    return looksLikeDamageScale && !modeled ? [key] : []
  }))
}

function metricValue(
  value: number | null,
  output: ComparisonBuildOutput,
  nullReason?: string,
): ComparisonMetricValue {
  const unavailableReasons = unique([
    ...output.unavailableReasons,
    ...(value === null && output.unavailableReasons.length === 0 && nullReason
      ? [nullReason]
      : []),
  ])
  return {
    value,
    minimumApplied: value !== null && Boolean(output.damageBreakdown?.minimumApplied),
    unavailableReasons,
    warnings: output.warnings,
  }
}

function normalizeEnemyCondition(enemy: ComparisonEnemyCondition): ComparisonEnemyCondition {
  return {
    defense: clamp(finiteOr(enemy.defense, 0), 0, 10000),
    resistance: clamp(finiteOr(enemy.resistance, 0), 0, 100),
  }
}

function normalizeAxisPoints(
  axis: ComparisonAxis,
  points: number[],
  current: number,
): number[] {
  const maximum = axis === 'DEFENSE' ? 10000 : 100
  return uniqueSorted([
    ...points.map((point) => clamp(finiteOr(point, 0), 0, maximum)),
    current,
  ])
}

function formatOutputStatus(output: ComparisonBuildOutput): string {
  if (output.unavailableReasons.length > 0) {
    return `計算不可: ${output.unavailableReasons.join(' / ')}`
  }
  if (output.warnings.length > 0) return `概算: ${output.warnings.join(' / ')}`
  return '計算可能'
}

function formatSkillOutputStatus(evaluation: ComparisonBuildEvaluation): string {
  if (evaluation.skillOutput.unavailableReasons.length > 0) {
    return formatOutputStatus(evaluation.skillOutput)
  }
  const missing = (['SKILL_PER_HIT', 'SKILL_PER_ATTACK', 'SKILL_DPS', 'SKILL_TOTAL'] as const)
    .flatMap((metric) => {
      const result = getComparisonMetricValue(evaluation, metric)
      return result.value === null
        ? [`${COMPARISON_BUILD_METRIC_LABELS[metric]}: ${result.unavailableReasons.join(' ') || '算出対象外です。'}`]
        : []
    })
  if (missing.length > 0) return `一部出力なし: ${missing.join(' / ')}`
  if (evaluation.skillOutput.warnings.length > 0) {
    return `概算: ${evaluation.skillOutput.warnings.join(' / ')}`
  }
  return '計算可能'
}

function formatDamageType(damageType: DamageType | null): string {
  return damageType === null ? '自動判定不可' : DAMAGE_TYPE_LABELS[damageType]
}

function getSkillLevelLabel(index: number, total: number): string {
  if (total >= 10 && index >= 7) return `特化${index - 6}`
  return `Lv.${index + 1}`
}

function escapeCsvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

function optionalCsvNumber(value: number | null): string {
  return value === null ? '' : formatCsvNumber(value)
}

function formatCsvNumber(value: number): string {
  return String(Math.round(value * 10000) / 10000)
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b)
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  return clamp(Math.round(finiteOr(value, minimum)), minimum, maximum)
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}
