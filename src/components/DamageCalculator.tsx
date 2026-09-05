import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { writeClipboardText } from '../lib/clipboard'
import {
  DAMAGE_TYPE_LABELS,
  calculateAttackPipeline,
  calculateDamageBreakdown,
  calculateSkillDamageBreakdown,
  deriveSkillModel,
  getOperatorStats,
  type AttackPipelineInput,
  type AttackPipelineBreakdown,
  type BaseAttackBreakdown,
  type DamageCalculationBreakdown,
  type DamageType,
  type MitigationModifiers,
  type SkillDamageBreakdown,
  type SkillModelDefaults,
} from '../lib/damageCalculator'
import {
  DEFAULT_DAMAGE_SENSITIVITY_TARGET,
  getDamageSensitivityBreakdown,
  getDamageSensitivityMetricForTarget,
  getDamageSensitivityTableHeaders,
  getDamageSensitivityTablePoints,
  isDamageSensitivityMetricAvailable,
  selectDamageSensitivityType,
  selectDamageSensitivityValue,
  type DamageSensitivityBreakdown,
  type DamageSensitivityMetric,
  type DamageSensitivityTarget,
} from '../lib/damageSensitivity'
import {
  evaluateOperatorEffects,
  type EvaluatedOperatorEffect,
  type OperatorEffectStatus,
} from '../lib/operatorEffects'
import {
  MECH_ACCORD_ATTACK_COUNTS,
  calculateMechAccordDamageRows,
  calculateMechAccordResistanceTable,
  deriveMechAccordSkillOutput,
  getMechAccordMultiplierPercent,
  isMechAccordSubProfession,
  type MechAccordAttackCount,
  type MechAccordDamageRowsResult,
  type MechAccordResistanceTableResult,
} from '../lib/mechAccordDamage'
import {
  GOLDENGLOW_OPERATOR_ID,
  buildGoldenglowResistanceDamageRows,
  buildGoldenglowSkill3Output,
  calculateGoldenglowExplosion,
  calculateGoldenglowExpectedDpsFromModel,
  isGoldenglowSkill3,
  type GoldenglowExplosionDamageResult,
  type GoldenglowResistanceDamageRow,
  type GoldenglowSkill3Output,
} from '../lib/goldenglowExplosion'
import {
  DAMAGE_CALCULATOR_PANEL_DEFAULTS,
  DAMAGE_OUTPUT_PANELS,
  getDamageCalculatorPanelNumbers,
  getDamageOutputPanelState,
  getPrimaryDamageOutputKind,
  getPrimaryDamageOutputTitle,
} from '../lib/damageCalculatorPanels'
import {
  loadPreferredDefaultOperatorId,
  persistPreferredDefaultOperatorId,
  resolveDamageCalculatorDefaultOperatorId,
} from '../lib/damageCalculatorPreferences'
import {
  applyOperatorModule,
  getOperatorModuleId,
  getOperatorModuleLevels,
  getOperatorModuleTypeLabel,
  getOperatorModuleUnlockLabel,
  getOperatorModules,
  isOperatorModuleUnlocked,
  type OperatorModuleApplication,
  type OperatorModuleAttributeEffect,
} from '../lib/operatorModules'
import { getOperatorPassives } from '../lib/operatorProfile'
import {
  detectNormalAttackDamageType,
  detectSkillDamageType,
  getSkillDamageUnsupportedReasons as getUnsupportedReasons,
  getSkillTotalLabel as getTotalLabel,
  getSkillTotalMode as getTotalMode,
  type DamageTypeDetection,
} from '../lib/skillDamageModel'
import type { RawSkillLevel, SkillRecord } from '../types/skill'
import { EMPTY_OPERATOR_FILTERS, OperatorSearch } from './OperatorSearch'
import { OperatorDetailLink, type OpenOperatorDetail } from './OperatorDetailLink'
import './DamageCalculator.css'

interface Props {
  rows: SkillRecord[]
  loading: boolean
  onOpenOperatorDetail: OpenOperatorDetail
}

type ReflectionStatus = OperatorEffectStatus | 'PARTIAL'
type SensitivityMetric = DamageSensitivityMetric
type SensitivityTarget = DamageSensitivityTarget
type GoldenglowOperatorOutputMetric = 'EXPLOSION_DAMAGE' | 'EXPECTED_DPS' | 'EXPECTED_TOTAL_DAMAGE'

const GOLDENGLOW_OPERATOR_OUTPUT_OPTIONS: Array<{
  value: GoldenglowOperatorOutputMetric
  buttonLabel: string
  tableLabel: string
}> = [
  { value: 'EXPLOSION_DAMAGE', buttonLabel: '爆発1回', tableLabel: '爆発1回のダメージ' },
  { value: 'EXPECTED_DPS', buttonLabel: '期待DPS', tableLabel: '爆発込み期待DPS' },
  { value: 'EXPECTED_TOTAL_DAMAGE', buttonLabel: '期待総ダメージ', tableLabel: '爆発込み期待総ダメージ' },
]

interface CalculationStep {
  label: string
  formula: string
  result: string
  note?: string
}

interface SensitivityRow {
  point: number
  label: string
  value: number | null
  minimumReached: boolean
  breakdown: DamageSensitivityBreakdown | null
}

interface SensitivityData {
  damageType: DamageType | null
  tableRows: SensitivityRow[]
}

const ATTACK_MODIFIER_DESCRIPTIONS = {
  攻撃力補正A: '「攻撃力+n」「攻撃力−n」とある固定値を加算する補正です。',
  攻撃力補正B: '「攻撃力+n%」とある効果を合計し、攻撃力に「1+B÷100」を掛ける補正です。',
  攻撃力補正C: '鼓舞・奪取などの重複規則を適用したあと、固定値を加算する補正です。',
  攻撃力補正D: '「攻撃力−n%」などを係数として掛ける補正です。効果がなければ1です。',
  攻撃力補正E: '「攻撃力がn%まで上昇」「攻撃力のn%のダメージ」などを係数として掛ける補正です。効果がなければ100%（1倍）です。',
} as const

type AttackModifierTerm = keyof typeof ATTACK_MODIFIER_DESCRIPTIONS

const REFLECTION_STATUS_LABELS: Record<ReflectionStatus, string> = {
  APPLIED: '計算に反映',
  PARTIAL: '一部反映',
  NOT_APPLIED: '未反映',
  REQUIRES_INPUT: '条件入力が必要',
  NO_DIRECT_EFFECT: '直接影響なし',
  UNSUPPORTED: '未対応',
}

const REFERENCE_ENEMY_DEFENSE = 0
const REFERENCE_ENEMY_RESISTANCE = 0
const SENSITIVITY_TABLE_MAX_WIDTH_PER_COLUMN = 260

export function DamageCalculator({ rows, loading, onOpenOperatorDetail }: Props) {
  const operators = useMemo(() => [...new Map(rows.map((row) => [row.operatorId, row])).values()]
    .sort((a, b) => a.operatorName.localeCompare(b.operatorName, 'ja')), [rows])
  const [operatorId, setOperatorId] = useState('')
  const [skillId, setSkillId] = useState('')
  const [moduleId, setModuleId] = useState('')
  const [phaseIndex, setPhaseIndex] = useState(0)
  const [operatorLevel, setOperatorLevel] = useState(1)
  const [trust, setTrust] = useState(100)
  const [skillLevelIndex, setSkillLevelIndex] = useState(0)
  const [moduleLevel, setModuleLevel] = useState(1)
  const [operatorSearchPanelOpen, setOperatorSearchPanelOpen] = useState(DAMAGE_CALCULATOR_PANEL_DEFAULTS.operatorSearch)
  const [operatorSearchOpen, setOperatorSearchOpen] = useState(false)
  const [calculationConditionsOpen, setCalculationConditionsOpen] = useState(DAMAGE_CALCULATOR_PANEL_DEFAULTS.calculationConditions)
  const [operatorInfoOpen, setOperatorInfoOpen] = useState(DAMAGE_CALCULATOR_PANEL_DEFAULTS.operatorInfo)
  const [skillModelOpen, setSkillModelOpen] = useState(DAMAGE_CALCULATOR_PANEL_DEFAULTS.skillModel)
  const [damageResultOpen, setDamageResultOpen] = useState(DAMAGE_CALCULATOR_PANEL_DEFAULTS.damageResult)
  const [operatorOutputOpen, setOperatorOutputOpen] = useState(DAMAGE_CALCULATOR_PANEL_DEFAULTS.operatorOutput)
  const [skillOutputOpen, setSkillOutputOpen] = useState(DAMAGE_CALCULATOR_PANEL_DEFAULTS.skillOutput)
  const [normalCalculationProcessOpen, setNormalCalculationProcessOpen] = useState(DAMAGE_CALCULATOR_PANEL_DEFAULTS.normalCalculationProcess)
  const [skillCalculationProcessOpen, setSkillCalculationProcessOpen] = useState(DAMAGE_CALCULATOR_PANEL_DEFAULTS.skillCalculationProcess)
  const [sensitivityTarget, setSensitivityTarget] = useState<SensitivityTarget>(DEFAULT_DAMAGE_SENSITIVITY_TARGET)
  const [sensitivityMetric, setSensitivityMetric] = useState<SensitivityMetric>('DAMAGE')
  const [mechAccordAttackCount, setMechAccordAttackCount] = useState<MechAccordAttackCount>(1)
  const [mechAccordTarget, setMechAccordTarget] = useState<SensitivityTarget>(DEFAULT_DAMAGE_SENSITIVITY_TARGET)
  const [sensitivityCalculationPoint, setSensitivityCalculationPoint] = useState<number | null>(null)
  const [operatorFilters, setOperatorFilters] = useState(EMPTY_OPERATOR_FILTERS)
  const [preferredDefaultOperatorId, setPreferredDefaultOperatorId] = useState(loadPreferredDefaultOperatorId)
  const [buildNavigationStuck, setBuildNavigationStuck] = useState(false)
  const buildNavigationRef = useRef<HTMLDivElement | null>(null)

  const defaultOperatorId = resolveDamageCalculatorDefaultOperatorId(operators, preferredDefaultOperatorId)
  const effectiveOperatorId = operators.some((operator) => operator.operatorId === operatorId)
    ? operatorId
    : defaultOperatorId
  const selectedOperator = operators.find((operator) => operator.operatorId === effectiveOperatorId) ?? null
  const defaultOperator = operators.find((operator) => operator.operatorId === defaultOperatorId) ?? null
  const operatorSkills = useMemo(() => rows
    .filter((row) => row.operatorId === effectiveOperatorId)
    .sort((a, b) => a.skillIndex - b.skillIndex), [rows, effectiveOperatorId])
  const operatorModules = useMemo(() => selectedOperator
    ? getOperatorModules(selectedOperator.operatorProfile).map((module, index) => ({
        id: getOperatorModuleId(module, index),
        module,
      }))
    : [], [selectedOperator])
  const effectiveSkillId = operatorSkills.some((skill) => skill.id === skillId)
    ? skillId
    : operatorSkills[0]?.id ?? ''
  const selectedSkill = operatorSkills.find((skill) => skill.id === effectiveSkillId) ?? null

  const phases = selectedOperator?.operatorProfile.phases ?? []
  const safePhaseIndex = clamp(phaseIndex, 0, Math.max(0, phases.length - 1))
  const selectedPhase = phases[safePhaseIndex]
  const maxOperatorLevel = Math.max(1, selectedPhase?.maxLevel ?? 1)
  const safeOperatorLevel = clamp(operatorLevel, 1, maxOperatorLevel)
  const skillLevels = selectedSkill?.skillLevels ?? []
  const safeSkillLevelIndex = clamp(skillLevelIndex, 0, Math.max(0, skillLevels.length - 1))
  const selectedSkillLevel = skillLevels[safeSkillLevelIndex] ?? selectedSkill?.raw ?? null
  const selectedModuleChoice = operatorModules.find((choice) => choice.id === moduleId) ?? null
  const selectedModule = selectedModuleChoice
    && getOperatorModuleLevels(selectedModuleChoice.module).length > 0
    && isOperatorModuleUnlocked(selectedModuleChoice.module, safePhaseIndex, safeOperatorLevel)
      ? selectedModuleChoice.module
      : null
  const effectiveModuleId = selectedModule ? selectedModuleChoice?.id ?? '' : ''
  const moduleLevels = getOperatorModuleLevels(selectedModule)
  const safeModuleLevel = moduleLevels.includes(moduleLevel)
    ? moduleLevel
    : moduleLevels.at(-1) ?? 0

  useEffect(() => {
    if (!selectedOperator) return
    const nextPhaseIndex = Math.max(0, selectedOperator.operatorProfile.phases.length - 1)
    const nextMaxLevel = Math.max(1, selectedOperator.operatorProfile.phases[nextPhaseIndex]?.maxLevel ?? 1)
    setPhaseIndex(nextPhaseIndex)
    setOperatorLevel(nextMaxLevel)
    setTrust(100)
    setModuleId('')
    setModuleLevel(1)
    setSkillId((current) => operatorSkills.some((skill) => skill.id === current)
      ? current
      : operatorSkills[0]?.id ?? '')
  }, [effectiveOperatorId])

  useEffect(() => {
    setSkillLevelIndex(Math.max(0, (selectedSkill?.skillLevels.length ?? 1) - 1))
  }, [effectiveSkillId])

  useEffect(() => {
    if (!selectedModuleChoice) return
    const hasBattleData = getOperatorModuleLevels(selectedModuleChoice.module).length > 0
    if (!hasBattleData || !isOperatorModuleUnlocked(
      selectedModuleChoice.module,
      safePhaseIndex,
      safeOperatorLevel,
    )) {
      setModuleId('')
    }
  }, [selectedModuleChoice, safePhaseIndex, safeOperatorLevel])

  useEffect(() => {
    const navigation = buildNavigationRef.current
    if (!navigation) return
    let animationFrameId = 0
    const updateStuckState = () => {
      const stickyTop = Number.parseFloat(window.getComputedStyle(navigation).top) || 0
      const stuck = Math.abs(navigation.getBoundingClientRect().top - stickyTop) <= 0.5
      setBuildNavigationStuck((current) => current === stuck ? current : stuck)
    }
    const requestUpdate = () => {
      window.cancelAnimationFrame(animationFrameId)
      animationFrameId = window.requestAnimationFrame(updateStuckState)
    }

    updateStuckState()
    window.addEventListener('scroll', requestUpdate, { passive: true })
    window.addEventListener('resize', requestUpdate)
    const resizeObserver = new ResizeObserver(requestUpdate)
    resizeObserver.observe(navigation)
    if (navigation.parentElement) resizeObserver.observe(navigation.parentElement)
    if (navigation.previousElementSibling instanceof HTMLElement) {
      resizeObserver.observe(navigation.previousElementSibling)
    }
    return () => {
      window.cancelAnimationFrame(animationFrameId)
      window.removeEventListener('scroll', requestUpdate)
      window.removeEventListener('resize', requestUpdate)
      resizeObserver.disconnect()
    }
  }, [loading, rows.length])

  const baseOperatorPassives = useMemo(() => selectedOperator
    ? getOperatorPassives(selectedOperator.operatorProfile, safePhaseIndex, safeOperatorLevel)
    : { traitDescription: '', talents: [], sources: [] }, [selectedOperator, safePhaseIndex, safeOperatorLevel])
  const moduleApplication = useMemo(() => applyOperatorModule(
    baseOperatorPassives,
    selectedModule,
    safeModuleLevel,
  ), [baseOperatorPassives, selectedModule, safeModuleLevel])
  const operatorPassives = moduleApplication.passives
  const normalDamageTypeDetection = useMemo<DamageTypeDetection>(() => selectedOperator
    ? detectNormalAttackDamageType(selectedOperator.profession, operatorPassives.traitDescription)
    : unresolvedDamageType('通常攻撃のダメージ種別を自動判定できません。'), [selectedOperator, operatorPassives.traitDescription])
  const normalDamageType = normalDamageTypeDetection.damageType
  const skillDamageTypeDetection = useMemo<DamageTypeDetection>(() => selectedSkill
    ? detectSkillDamageType(
      selectedSkill,
      normalDamageType,
      selectedSkillLevel?.description ?? selectedSkill.description,
    )
    : unresolvedDamageType('スキルを選択してください。'), [selectedSkill, selectedSkillLevel, normalDamageType])
  const skillDamageType = skillDamageTypeDetection.damageType
  const normalOperatorEffects = useMemo(() => evaluateOperatorEffects(
    selectedOperator?.operatorId ?? '',
    operatorPassives,
    normalDamageType,
  ), [selectedOperator?.operatorId, operatorPassives, normalDamageType])
  const skillOperatorEffects = useMemo(() => evaluateOperatorEffects(
    selectedOperator?.operatorId ?? '',
    operatorPassives,
    skillDamageType,
  ), [selectedOperator?.operatorId, operatorPassives, skillDamageType])
  const moduleRelatedEffects = useMemo(() => normalOperatorEffects.effects.filter((effect) => (
    moduleApplication.affectedSources.some((source) => (
      source.sourceKind === effect.sourceKind
      && source.talentIndex === effect.talentIndex
      && source.sourceName === effect.sourceName
    ))
  )), [normalOperatorEffects.effects, moduleApplication.affectedSources])
  const moduleReflectionStatus = getModuleReflectionStatus(moduleApplication, moduleRelatedEffects)
  const normalAttackModifiers = useMemo(() => ({
    directAddition: normalOperatorEffects.modifiers.attackAddition,
    directMultiplierPercent: normalOperatorEffects.modifiers.attackMultiplierPercent,
  }), [normalOperatorEffects.modifiers.attackAddition, normalOperatorEffects.modifiers.attackMultiplierPercent])
  const skillAttackModifiers = useMemo(() => ({
    directAddition: skillOperatorEffects.modifiers.attackAddition,
    directMultiplierPercent: skillOperatorEffects.modifiers.attackMultiplierPercent,
  }), [skillOperatorEffects.modifiers.attackAddition, skillOperatorEffects.modifiers.attackMultiplierPercent])
  const normalMitigationModifiers = useMemo<MitigationModifiers>(() => ({
    defenseIgnoreFixed: normalOperatorEffects.modifiers.defenseIgnoreFixed,
    resistanceIgnoreFixed: normalOperatorEffects.modifiers.resistanceIgnoreFixed,
  }), [normalOperatorEffects.modifiers.defenseIgnoreFixed, normalOperatorEffects.modifiers.resistanceIgnoreFixed])
  const skillMitigationModifiers = useMemo<MitigationModifiers>(() => ({
    defenseIgnoreFixed: skillOperatorEffects.modifiers.defenseIgnoreFixed,
    resistanceIgnoreFixed: skillOperatorEffects.modifiers.resistanceIgnoreFixed,
  }), [skillOperatorEffects.modifiers.defenseIgnoreFixed, skillOperatorEffects.modifiers.resistanceIgnoreFixed])
  const operatorStats = useMemo(() => selectedOperator
    ? getOperatorStats(selectedOperator.operatorProfile, safePhaseIndex, safeOperatorLevel, trust, {
      attackSpeedBonus: normalOperatorEffects.modifiers.attackSpeedBonus + moduleApplication.attackSpeedBonus,
      moduleAttack: moduleApplication.moduleAttack,
    })
    : {
      attack: 0,
      baseAttackSpeed: 100,
      attackSpeedBonus: 0,
      attackSpeed: 100,
      baseAttackTime: 1,
      attackInterval: 1,
      baseAttackBreakdown: {
        levelAttack: 0,
        trustAttack: 0,
        potentialAttack: 0,
        moduleAttack: 0,
        beforeRounding: 0,
        result: 0,
      },
    }, [
      selectedOperator,
      safePhaseIndex,
      safeOperatorLevel,
      trust,
      normalOperatorEffects.modifiers.attackSpeedBonus,
      moduleApplication.attackSpeedBonus,
      moduleApplication.moduleAttack,
    ])
  const model = useMemo(() => selectedSkillLevel
    ? deriveSkillModel(selectedSkillLevel, operatorStats.attackInterval, operatorStats.attackSpeed)
    : null, [selectedSkillLevel, operatorStats.attackInterval, operatorStats.attackSpeed])

  const unsupportedReasons = [...new Set(selectedSkill
    ? [
      ...getUnsupportedReasons(selectedSkill),
      ...(model?.notes.some((note) => note.includes('初期版の計算対象外'))
        ? ['計算対象外の独立ダメージ倍率を含みます。']
        : []),
      ...(model?.notes.some((note) => note.includes('複数の攻撃力補正E'))
        ? ['複数の攻撃倍率を別々に扱うモデルが必要です。']
        : []),
      ...(skillDamageType === null ? [skillDamageTypeDetection.reason] : []),
    ]
    : ['スキルを選択してください。'])]
  const skillSupported = unsupportedReasons.length === 0
  const traitReflectionStatus = getEffectGroupStatus(normalOperatorEffects.effects.filter((effect) => effect.sourceKind === 'TRAIT'))
  const normalAttackPipeline = calculateAttackPipeline(operatorStats.attack, normalAttackModifiers)
  const referenceNormalBreakdown = normalDamageType
    ? calculateDamageBreakdown(
      normalAttackPipeline.finalAttack,
      normalDamageType,
      REFERENCE_ENEMY_DEFENSE,
      REFERENCE_ENEMY_RESISTANCE,
      normalMitigationModifiers,
    )
    : null
  const normalPerHit = referenceNormalBreakdown?.result ?? null
  const normalDps = normalPerHit !== null && operatorStats.attackInterval > 0
    ? normalPerHit / operatorStats.attackInterval
    : null
  const hasSubProfessionOutput = Boolean(
    selectedOperator && isMechAccordSubProfession(selectedOperator.subProfessionId),
  )
  const mechAccordSkillOutput = hasSubProfessionOutput && selectedSkill && selectedSkillLevel && model
    ? deriveMechAccordSkillOutput(selectedSkill, selectedSkillLevel, model)
    : null
  const mechAccordSkillAttackPipeline = model
    ? calculateAttackPipeline(operatorStats.attack, {
      ...skillAttackModifiers,
      directMultiplierPercent: skillAttackModifiers.directMultiplierPercent + model.directMultiplierPercent,
      attackScale: model.attackScalePercent / 100,
    })
    : null
  const mechAccordUnsupportedReasons = mechAccordTarget === 'NORMAL'
    ? normalDamageType === null ? [normalDamageTypeDetection.reason] : []
    : mechAccordSkillOutput?.unsupportedReasons ?? ['スキルを選択してください。']
  const mechAccordAttack = mechAccordTarget === 'NORMAL'
    ? normalAttackPipeline.finalAttack
    : mechAccordSkillAttackPipeline?.finalAttack ?? 0
  const mechAccordMitigationModifiers = mechAccordTarget === 'NORMAL'
    ? normalMitigationModifiers
    : skillMitigationModifiers
  const mechAccordAttackOptions = mechAccordTarget === 'SKILL'
    ? mechAccordSkillOutput ?? undefined
    : undefined
  const mechAccordTargetLabel = mechAccordTarget === 'NORMAL'
    ? '通常攻撃'
    : `S${selectedSkill?.skillIndex ?? ''} ${selectedSkill?.skillName ?? 'スキル'}`
  const mechAccordAttackCountDamage = hasSubProfessionOutput && mechAccordUnsupportedReasons.length === 0
    ? calculateMechAccordDamageRows(
      mechAccordAttack,
      REFERENCE_ENEMY_DEFENSE,
      REFERENCE_ENEMY_RESISTANCE,
      mechAccordMitigationModifiers,
      mechAccordAttackOptions,
    )
    : null
  const mechAccordResistanceDamage = mechAccordAttackCountDamage
    ? calculateMechAccordResistanceTable(
      mechAccordAttack,
      REFERENCE_ENEMY_DEFENSE,
      mechAccordAttackCount,
      mechAccordMitigationModifiers,
      mechAccordAttackOptions,
    )
    : null
  const goldenglowExplosionAttackPipeline = model
    ? calculateAttackPipeline(operatorStats.attack, {
      directAddition: skillAttackModifiers.directAddition,
      directMultiplierPercent: skillAttackModifiers.directMultiplierPercent + model.directMultiplierPercent,
    })
    : null
  const goldenglowExplosion = selectedOperator && goldenglowExplosionAttackPipeline
    ? calculateGoldenglowExplosion({
      operatorId: selectedOperator.operatorId,
      passives: operatorPassives,
      skillLevel: selectedSkillLevel,
      effectiveAttack: goldenglowExplosionAttackPipeline.afterFinalMultiplier,
      enemyDefense: REFERENCE_ENEMY_DEFENSE,
      enemyResistance: REFERENCE_ENEMY_RESISTANCE,
    })
    : null
  const goldenglowExpectedDps = goldenglowExplosion && selectedSkill && model
    ? calculateGoldenglowExpectedDpsFromModel({
      model: goldenglowExplosion.model,
      skillIndex: selectedSkill.skillIndex,
      effectiveAttack: goldenglowExplosion.effectiveAttack,
      attackInterval: model.attackInterval,
      duration: model.duration,
      enemyDefense: REFERENCE_ENEMY_DEFENSE,
      enemyResistance: REFERENCE_ENEMY_RESISTANCE,
    })
    : null
  const isGoldenglowSkill3Selected = Boolean(
    selectedOperator
    && selectedSkill
    && isGoldenglowSkill3(selectedOperator.operatorId, selectedSkill.skillIndex),
  )
  const goldenglowSkill3Output = selectedOperator && selectedSkill
    ? buildGoldenglowSkill3Output(
      selectedOperator.operatorId,
      selectedSkill.skillIndex,
      goldenglowExpectedDps,
    )
    : null
  const genericSkillSupported = skillSupported && !isGoldenglowSkill3Selected
  const primaryOutputKind = getPrimaryDamageOutputKind(hasSubProfessionOutput)
  const primaryOutputTitle = getPrimaryDamageOutputTitle(primaryOutputKind)
  const operatorOutputPanelState = getDamageOutputPanelState(
    goldenglowExplosion !== null,
    operatorOutputOpen,
  )
  const skillOutputPanelState = getDamageOutputPanelState(
    goldenglowSkill3Output !== null,
    skillOutputOpen,
  )
  const panelNumbers = getDamageCalculatorPanelNumbers()
  const skillOutputPanelLabel = `${panelNumbers.skillOutput} ${DAMAGE_OUTPUT_PANELS.skill.title}`
  const referenceSkillBreakdown = selectedSkill && model && genericSkillSupported && skillDamageType
    ? calculateSkillDamageBreakdown(
      operatorStats.attack,
      skillDamageType,
      REFERENCE_ENEMY_DEFENSE,
      REFERENCE_ENEMY_RESISTANCE,
      model,
      {
        canShowDps: selectedSkill.classification.outputCapabilities.canShowDps,
        totalMode: getTotalMode(selectedSkill),
        attackModifiers: skillAttackModifiers,
        mitigationModifiers: skillMitigationModifiers,
      },
    )
    : null
  const skillOutput = referenceSkillBreakdown
  const skillTotalMode = selectedSkill ? getTotalMode(selectedSkill) : 'NONE'
  const skillCapabilities = selectedSkill?.classification.outputCapabilities
  const canShowSkillTotal = skillOutput?.total !== null
    && skillOutput?.total !== undefined
    && (
      (skillTotalMode === 'DURATION' && Boolean(skillCapabilities?.canShowWindowTotal) && (model?.duration ?? 0) > 0)
      || (skillTotalMode === 'AMMO' && Boolean(skillCapabilities?.canShowWindowTotal) && (model?.ammoCount ?? 0) > 0)
      || (skillTotalMode === 'ACTIVATION' && Boolean(skillCapabilities?.canShowPerActivationTotal))
    )

  const sensitivityData = useMemo(() => buildSensitivityData({
    baseAttack: operatorStats.attack,
    normalAttack: normalAttackPipeline.finalAttack,
    normalAttackInterval: operatorStats.attackInterval,
    normalDamageType,
    skillDamageType,
    model,
    selectedSkill,
    skillSupported: genericSkillSupported,
    canShowSkillTotal,
    target: sensitivityTarget,
    metric: sensitivityMetric,
    skillAttackModifiers,
    normalMitigationModifiers,
    skillMitigationModifiers,
  }), [operatorStats.attack, normalAttackPipeline.finalAttack, operatorStats.attackInterval, normalDamageType, skillDamageType, model, selectedSkill, genericSkillSupported, canShowSkillTotal, sensitivityTarget, sensitivityMetric, skillAttackModifiers, normalMitigationModifiers, skillMitigationModifiers])

  if (loading && rows.length === 0) {
    return (
      <section className="damage-page calculator-page">
        <h1 className="visually-hidden">Damage Calculator</h1>
        <p className="calculator-loading" role="status">ゲームデータを読み込んでいます…</p>
      </section>
    )
  }

  if (!selectedOperator || !selectedSkill || !selectedSkillLevel || !model) {
    return (
      <section className="damage-page calculator-page">
        <h1 className="visually-hidden">Damage Calculator</h1>
        <p className="calculator-loading" role="status">計算できるオペレーターが見つかりません。</p>
      </section>
    )
  }

  const normalCalculationSteps: CalculationStep[] = referenceNormalBreakdown && normalDamageType ? [
    ...buildAttackPipelineSteps(operatorStats.baseAttackBreakdown, normalAttackPipeline, 'NORMAL'),
    buildMitigationStep(`${DAMAGE_TYPE_LABELS[normalDamageType]}ダメージ（1ヒット）`, referenceNormalBreakdown),
    {
      label: '攻撃間隔',
      formula: `${formatCalculationNumber(operatorStats.baseAttackTime)}秒 × 100 ÷ max(20, ${formatCalculationNumber(operatorStats.baseAttackSpeed)} + ${formatCalculationNumber(operatorStats.attackSpeedBonus)})`,
      result: `${formatCalculationNumber(operatorStats.attackInterval)}秒`,
      note: operatorStats.attackSpeedBonus === 0
        ? '反映済みの特性・素質・モジュールによる攻撃速度補正はありません'
        : `特性・素質・モジュールの攻撃速度 ${formatSignedNumber(operatorStats.attackSpeedBonus)} を反映`,
    },
    {
      label: 'DPS',
      formula: `${formatCalculationNumber(referenceNormalBreakdown.result)} ÷ ${formatCalculationNumber(operatorStats.attackInterval)}秒`,
      result: normalDps === null ? '—' : formatNumber(normalDps),
    },
  ]
    : []
  const skillCalculationSteps = referenceSkillBreakdown
    ? buildSkillCalculationSteps(operatorStats.baseAttackBreakdown, referenceSkillBreakdown)
    : []
  const sensitivityDamageType = sensitivityData.damageType
  const sensitivityStatLabel = getSensitivityStatLabel(sensitivityDamageType)
  const skillTotalLabel = getTotalLabel(selectedSkill)
  const sensitivityMetricLabel = getSensitivityMetricLabel(sensitivityMetric, skillTotalLabel)
  const sensitivityAttackLabel = sensitivityTarget === 'NORMAL' ? '通常攻撃' : 'スキル'
  const isGoldenglowSkill3DefaultOutput = sensitivityTarget === 'SKILL' && isGoldenglowSkill3Selected
  const sensitivityAxisHeader = sensitivityDamageType === 'TRUE' || sensitivityDamageType === null
    ? '補正'
    : sensitivityStatLabel
  const sensitivityTableHeaders = getDamageSensitivityTableHeaders({
    axisLabel: sensitivityAxisHeader,
    target: sensitivityTarget,
    metric: sensitivityMetric,
    skillTotalLabel,
    normalPrefix: mechAccordAttackCountDamage ? '本体 ' : '',
  })
  const sensitivityTableMaxWidth = sensitivityTableHeaders.length * SENSITIVITY_TABLE_MAX_WIDTH_PER_COLUMN
  const hasSensitivityResults = sensitivityData.tableRows.some((row) => (
    row.value !== null
  ))
  const sensitivityCalculationRow = selectSensitivityCalculationRow(
    sensitivityData.tableRows,
    sensitivityCalculationPoint,
  )
  const sensitivityAttackPipeline = sensitivityTarget === 'NORMAL'
    ? normalAttackPipeline
    : referenceSkillBreakdown?.attackPipeline ?? null
  const hasMinimumDamageResults = sensitivityData.tableRows.some((row) => row.minimumReached)
  const damageTypeMetricStatus: ReflectionStatus = normalDamageType !== null && skillDamageType !== null
    ? 'APPLIED'
    : normalDamageType !== null || skillDamageType !== null
      ? 'PARTIAL'
      : 'UNSUPPORTED'
  const changeSensitivityTarget = (target: SensitivityTarget) => {
    setSensitivityTarget(target)
    setSensitivityMetric((metric) => getDamageSensitivityMetricForTarget(target, metric))
  }

  return (
    <section className="damage-page calculator-page">
      <h1 className="visually-hidden">Damage Calculator</h1>

      <CollapsibleCalculatorPanel
        id="operator-search-panel"
        number="01"
        title="オペレーター検索"
        summary="計算対象を選択します"
        open={operatorSearchPanelOpen}
        onToggle={() => setOperatorSearchPanelOpen((open) => !open)}
        collapsedLabel="検索を表示"
        className="operator-search-panel"
      >
        <div className="operator-search-summary">
          <div className="calculator-field operator-picker-field">
            <span>選択中のオペレーター</span>
            <button
              className="operator-search-trigger"
              aria-expanded={operatorSearchOpen}
              aria-controls="damage-operator-search"
              onClick={() => setOperatorSearchOpen((open) => !open)}
            >
              <strong>{selectedOperator.operatorName}</strong>
              <small>★{selectedOperator.rarity} · {selectedOperator.professionLabel} / {selectedOperator.subProfessionName}</small>
              <em>{operatorSearchOpen ? '検索を閉じる' : '検索して変更'} ↗</em>
            </button>
          </div>
          <div className="default-operator-setting">
            <span>
              <OperatorDetailLink
                operatorId={selectedOperator.operatorId}
                onOpenOperatorDetail={onOpenOperatorDetail}
                className="damage-operator-detail-link"
                aria-label={`${selectedOperator.operatorName}の詳細を開く`}
              >
                {selectedOperator.operatorName}の詳細
              </OperatorDetailLink>
              {' · 起動時の初期オペレーター '}
              <strong>{defaultOperator?.operatorName ?? '未設定'}</strong>
            </span>
            <button
              type="button"
              disabled={effectiveOperatorId === defaultOperatorId}
              onClick={() => {
                persistPreferredDefaultOperatorId(effectiveOperatorId)
                setPreferredDefaultOperatorId(effectiveOperatorId)
              }}
            >
              {effectiveOperatorId === defaultOperatorId ? '初期値に設定済み' : '選択中を初期値に設定'}
            </button>
          </div>
        </div>
        {operatorSearchOpen && (
          <div id="damage-operator-search" className="calculator-operator-search">
            <div className="operator-search-heading">
              <div><strong>オペレーターを検索</strong><span>一覧画面と同じ条件で絞り込めます</span></div>
              <button onClick={() => setOperatorSearchOpen(false)}>閉じる</button>
            </div>
            <OperatorSearch
              rows={rows}
              filters={operatorFilters}
              loading={loading}
              onFiltersChange={setOperatorFilters}
              onSelect={(row) => {
                setOperatorId(row.operatorId)
                setSkillId(row.id)
                setOperatorSearchOpen(false)
              }}
              instruction="行を選択すると計算対象へ反映します"
              actionLabel="選択する →"
              className="damage-operator-search-results"
              selectedOperatorId={effectiveOperatorId}
            />
          </div>
        )}
      </CollapsibleCalculatorPanel>

      <div
        className={`damage-build-navigation${buildNavigationStuck ? ' is-stuck' : ''}`}
        aria-label="スキルとモジュールの選択"
        ref={buildNavigationRef}
      >
        <div className="damage-build-navigation-group">
          <span className="damage-build-navigation-label">スキル</span>
          <div className="skill-choice-group" role="group" aria-label="スキル">
            {operatorSkills.map((skill) => (
              <button
                type="button"
                className={effectiveSkillId === skill.id ? 'active' : ''}
                aria-pressed={effectiveSkillId === skill.id}
                aria-label={`S${skill.skillIndex} ${skill.skillName}`}
                onClick={() => setSkillId(skill.id)}
                key={skill.id}
              >
                <span>S{skill.skillIndex}</span>
                <strong>{skill.skillName}</strong>
              </button>
            ))}
          </div>
        </div>
        <div className="damage-build-navigation-group">
          <span className="damage-build-navigation-label">モジュール</span>
          <div className="skill-choice-group module-choice-group" role="group" aria-label="モジュール">
            <button
              type="button"
              className={effectiveModuleId === '' ? 'active' : ''}
              aria-pressed={effectiveModuleId === ''}
              aria-label="モジュール未装備"
              onClick={() => {
                setModuleId('')
                setModuleLevel(1)
              }}
            >
              <span>OFF</span>
              <strong>未装備</strong>
            </button>
            {operatorModules.map((choice, index) => {
              const levels = getOperatorModuleLevels(choice.module)
              const unlocked = isOperatorModuleUnlocked(choice.module, safePhaseIndex, safeOperatorLevel)
              const disabled = levels.length === 0 || !unlocked
              const active = effectiveModuleId === choice.id
              const unavailableReason = levels.length === 0
                ? '戦闘効果データを取得できません'
                : `${getOperatorModuleUnlockLabel(choice.module)}で解放`
              return (
                <button
                  type="button"
                  className={active ? 'active' : ''}
                  aria-pressed={active}
                  aria-label={`${choice.module.uniEquipName ?? '名称なし'}${disabled ? `（${unavailableReason}）` : ''}`}
                  title={disabled ? unavailableReason : undefined}
                  disabled={disabled}
                  onClick={() => {
                    setModuleId(choice.id)
                    setModuleLevel(levels.at(-1) ?? 1)
                  }}
                  key={choice.id}
                >
                  <span>MOD {index + 1}</span>
                  <strong>{choice.module.uniEquipName ?? '名称なし'}</strong>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <CollapsibleCalculatorPanel
        id="calculation-conditions-panel"
        number="02"
        title="ダメージ計算条件"
        summary="育成状態・スキル・モジュールを設定します"
        open={calculationConditionsOpen}
        onToggle={() => setCalculationConditionsOpen((open) => !open)}
        collapsedLabel="条件を表示"
        className="calculation-conditions-panel"
      >
        <div className="condition-subheading">育成状態</div>
        <div className="calculator-form-grid growth-form-grid">
          <SelectField label="昇進段階" value={String(safePhaseIndex)} onChange={(value) => {
            const nextPhase = Number(value)
            setPhaseIndex(nextPhase)
            setOperatorLevel(Math.max(1, phases[nextPhase]?.maxLevel ?? 1))
          }}>
            {phases.map((phase, index) => (
              <option value={index} key={index}>昇進{index}（最大Lv.{phase.maxLevel ?? 1}）</option>
            ))}
          </SelectField>
          <NumberField label="オペレーターレベル" value={safeOperatorLevel} min={1} max={maxOperatorLevel} onChange={setOperatorLevel} />
          <NumberField label="信頼度" value={trust} min={0} max={100} suffix="%" onChange={setTrust} />
          <SelectField label="スキルレベル" value={String(safeSkillLevelIndex)} onChange={(value) => setSkillLevelIndex(Number(value))}>
            {skillLevels.map((_, index) => (
              <option value={index} key={index}>{getSkillLevelLabel(index, skillLevels.length)}</option>
            ))}
          </SelectField>
        </div>
        <div className="selected-skill-summary">
          <div>
            <strong>S{selectedSkill.skillIndex} {selectedSkillLevel.name ?? selectedSkill.skillName}</strong>
            <span>基礎攻撃力 {formatNumber(operatorStats.attack)} · 攻撃間隔 {formatDecimal(operatorStats.attackInterval)}秒</span>
          </div>
          <p>{stripMarkup(selectedSkillLevel.description ?? selectedSkill.description)}</p>
        </div>
        {selectedModule && (
          <article className="selected-module-card">
            <header>
              <div>
                <span>選択中のモジュール</span>
                <strong>{moduleApplication.moduleName}</strong>
                <small>{getOperatorModuleTypeLabel(selectedModule)}</small>
              </div>
              <div className="module-level-picker">
                <span>レベル</span>
                <div role="group" aria-label="モジュールレベル">
                  {moduleLevels.map((level) => (
                    <button
                      type="button"
                      className={safeModuleLevel === level ? 'active' : ''}
                      aria-pressed={safeModuleLevel === level}
                      onClick={() => setModuleLevel(level)}
                      key={level}
                    >Lv.{level}</button>
                  ))}
                </div>
              </div>
            </header>
            {moduleApplication.attributeEffects.length > 0 && (
              <div className="module-attribute-list" aria-label="能力値補正">
                {moduleApplication.attributeEffects.map((effect, index) => (
                  <span key={`${effect.key}-${index}`}>
                    <small>{effect.label}</small>
                    <strong>{effect.valueLabel}</strong>
                  </span>
                ))}
              </div>
            )}
            <div className="module-change-list">
              {moduleApplication.changes.length > 0 ? moduleApplication.changes.map((change, index) => (
                <div key={`${change.label}-${index}`}>
                  <strong>{change.label}</strong>
                  <p>{change.description}</p>
                </div>
              )) : (
                <p className="module-no-change">特性・素質の変更はありません。</p>
              )}
            </div>
          </article>
        )}
        {selectedModule && moduleApplication.unsupportedReasons.length > 0 && (
          <div className="unsupported-model module-selection-warning" role="status">
            <strong>一部のモジュール効果は未反映です</strong>
            {moduleApplication.unsupportedReasons.map((reason) => <span key={reason}>{reason}</span>)}
          </div>
        )}
        <div className="condition-divider" />
        <div className="condition-subheading">ダメージ種別（自動判定）</div>
        <div className="damage-type-detection-grid" role="status" aria-live="polite">
          <div className={normalDamageType === null ? 'unresolved' : ''}>
            <span>通常攻撃</span>
            <strong>{formatDetectedDamageType(normalDamageType)}</strong>
            <small>{normalDamageTypeDetection.reason}</small>
          </div>
          <div className={skillDamageType === null ? 'unresolved' : ''}>
            <span>スキル</span>
            <strong>{formatDetectedDamageType(skillDamageType)}</strong>
            <small>{skillDamageTypeDetection.reason}</small>
          </div>
        </div>
      </CollapsibleCalculatorPanel>

      <CollapsibleCalculatorPanel
        id="operator-info-panel"
        number="03"
        title="オペレーター情報"
        summary={`基礎攻撃力 ${formatNumber(operatorStats.attack)} · 攻撃速度 ${formatNumber(operatorStats.attackSpeed)} · 攻撃間隔 ${formatDecimal(operatorStats.attackInterval)}秒`}
        open={operatorInfoOpen}
        onToggle={() => setOperatorInfoOpen((open) => !open)}
        collapsedLabel="詳細を表示"
        className="operator-info-panel"
        bodyClassName="operator-info-body"
      >
            <div className="operator-stat-grid">
              <OperatorMetric
                label="攻撃力"
                value={normalAttackPipeline.finalAttack === operatorStats.attack
                  ? formatNumber(operatorStats.attack)
                  : `${formatNumber(operatorStats.attack)} → ${formatNumber(normalAttackPipeline.finalAttack)}`}
                detail={normalAttackPipeline.finalAttack === operatorStats.attack
                  ? `レベル値 ${formatNumber(operatorStats.baseAttackBreakdown.levelAttack)} + 信頼度 ${formatSignedNumber(operatorStats.baseAttackBreakdown.trustAttack)} + モジュール ${formatSignedNumber(operatorStats.baseAttackBreakdown.moduleAttack)}`
                  : '基礎攻撃力 → 特性・素質・モジュール反映後の通常攻撃力'}
              />
              <OperatorMetric
                label="攻撃速度"
                value={formatNumber(operatorStats.attackSpeed)}
                detail={operatorStats.attackSpeedBonus === 0
                  ? '攻撃間隔の算出に使用'
                  : `基礎 ${formatNumber(operatorStats.baseAttackSpeed)} + 特性・素質・モジュール ${formatSignedNumber(operatorStats.attackSpeedBonus)}`}
              />
              <OperatorMetric
                label="基礎攻撃時間"
                value={`${formatDecimal(operatorStats.baseAttackTime)}秒`}
                detail="攻撃速度適用前"
              />
              <OperatorMetric
                label="実効攻撃間隔"
                value={`${formatDecimal(operatorStats.attackInterval)}秒`}
                detail="通常攻撃DPSの算出に使用"
              />
              <OperatorMetric
                label="ダメージ種別（自動）"
                value={`通常 ${formatDetectedDamageType(normalDamageType)} / スキル ${formatDetectedDamageType(skillDamageType)}`}
                detail="特性・職業・スキル説明から自動判定"
                status={damageTypeMetricStatus}
              />
            </div>
            <div className="operator-effect-grid">
              {selectedModule && (
                <ModuleEffectCard
                  application={moduleApplication}
                  relatedEffects={moduleRelatedEffects}
                  status={moduleReflectionStatus}
                />
              )}
              <article className="operator-effect-card">
                <header><span>特性</span><ReflectionBadge status={traitReflectionStatus} /></header>
                <p>{operatorPassives.traitDescription || '特性情報なし'}</p>
                <OperatorEffectValues effects={normalOperatorEffects.effects.filter((effect) => effect.sourceKind === 'TRAIT')} />
              </article>
              {operatorPassives.talents.length > 0 ? operatorPassives.talents.map((talent, index) => (
                <article className="operator-effect-card" key={`${talent.name}-${index}`}>
                  <header><span>素質</span><ReflectionBadge status={getEffectGroupStatus(normalOperatorEffects.effects.filter((effect) => effect.sourceKind === 'TALENT' && effect.talentIndex === index))} /></header>
                  <strong>{talent.name}</strong>
                  <p>{talent.description || '説明なし'}</p>
                  <OperatorEffectValues effects={normalOperatorEffects.effects.filter((effect) => effect.sourceKind === 'TALENT' && effect.talentIndex === index)} />
                </article>
              )) : (
                <article className="operator-effect-card muted-passive">
                  <header><span>素質</span><ReflectionBadge status="NO_DIRECT_EFFECT" /></header>
                  <p>現在の昇進段階で解放された素質はありません</p>
                </article>
              )}
            </div>
            <p className="operator-info-note">このパネルの効果状態は通常攻撃を基準に表示します。特性・素質・選択モジュールのスキル側の適用値と未反映理由は、スキルの計算過程に表示します。</p>
      </CollapsibleCalculatorPanel>

      <CollapsibleCalculatorPanel
        id="skill-model-panel"
        number="04"
        title="スキル計算モデル"
        summary="ダメージ計算条件とゲームデータから自動決定"
        open={skillModelOpen}
        onToggle={() => setSkillModelOpen((open) => !open)}
        collapsedLabel="モデルを表示"
      >
        <dl className="model-value-grid" aria-label="自動算出されたスキル計算モデル">
          <ModelValue label="攻撃力補正B" value={model.directMultiplierPercent} suffix="%" />
          <ModelValue label="攻撃力補正E" value={model.attackScalePercent} suffix="%" />
          <ModelValue label="1攻撃のヒット数" value={model.hitCount} />
          <ModelValue label="攻撃間隔" value={model.attackInterval} suffix="秒" />
          {selectedSkill.classification.effectWindow.value === 'FIXED_DURATION' && (
            <ModelValue label="効果時間" value={model.duration} suffix="秒" />
          )}
          {selectedSkill.classification.effectWindow.value === 'AMMO' && (
            <ModelValue label="弾数" value={model.ammoCount} />
          )}
        </dl>
        {model.notes.length > 0 && <ul className="model-notes">{model.notes.map((note) => <li key={note}>{note}</li>)}</ul>}
        {!skillSupported && <div className="unsupported-model" role="status"><strong>初期版では自動計算できません</strong>{unsupportedReasons.map((reason) => <span key={reason}>{reason}</span>)}</div>}
      </CollapsibleCalculatorPanel>

      <CollapsibleCalculatorPanel
        id="damage-result-panel"
        number={panelNumbers.damageResult}
        title={primaryOutputTitle}
        summary={primaryOutputKind === 'SUB_PROFESSION'
          ? mechAccordResistanceDamage
            ? `${selectedOperator.subProfessionName} · ${mechAccordTargetLabel} · 攻撃回数別 · ${mechAccordResistanceDamage.attackCountLabel}の術耐性別`
            : `${selectedOperator.subProfessionName} · ${mechAccordTargetLabel}`
          : `${sensitivityAttackLabel} · ${formatDetectedDamageType(sensitivityDamageType)} · ${sensitivityStatLabel}別 · ${sensitivityMetricLabel}`}
        open={damageResultOpen}
        onToggle={() => setDamageResultOpen((open) => !open)}
        collapsedLabel={`${primaryOutputTitle}を表示`}
        className="results-panel damage-result-panel"
      >
        {primaryOutputKind === 'SUB_PROFESSION' ? (
          <>
          <div className="sensitivity-results-header">
            <DamageOutputTargetSwitch target={mechAccordTarget} onChange={setMechAccordTarget} />
          </div>
          {mechAccordAttackCountDamage && mechAccordResistanceDamage
            ? (
              <>
                <MechAccordDamageTables
                  attackCountResult={mechAccordAttackCountDamage}
                  resistanceResult={mechAccordResistanceDamage}
                  attackLabel={mechAccordTargetLabel}
                  onAttackCountChange={setMechAccordAttackCount}
                />
                {mechAccordTarget === 'SKILL' && goldenglowExplosion && (
                  <p className="sensitivity-metric-note">
                    この表は浮遊ユニットの自爆を含みません。自爆を含む期待値は「{isGoldenglowSkill3Selected
                      ? skillOutputPanelLabel
                      : `${panelNumbers.operatorOutput} ${DAMAGE_OUTPUT_PANELS.operator.title}`}」で確認できます。
                  </p>
                )}
              </>
            )
            : (
              <div className="damage-output-empty" role="status">
                <strong>{mechAccordTarget === 'SKILL' ? '選択中のスキルは現在計算できません' : '職分固有出力を計算できません'}</strong>
                {mechAccordUnsupportedReasons.map((reason) => <p key={reason}>{reason}</p>)}
              </div>
            )}
          </>
        ) : (
          <>
        <div id="sensitivity-panel" className="sensitivity-results-section">
          <div className="sensitivity-results-header">
            <div className="sensitivity-toolbar">
              <DamageOutputTargetSwitch target={sensitivityTarget} onChange={changeSensitivityTarget} />
              <div className="sensitivity-control">
                <span>表示内容</span>
                <div className="sensitivity-metric-switch" role="group" aria-label="表の表示内容">
                  <button
                    type="button"
                    className={sensitivityMetric === 'DAMAGE' ? 'active' : ''}
                    aria-pressed={sensitivityMetric === 'DAMAGE'}
                    onClick={() => setSensitivityMetric('DAMAGE')}
                  >1攻撃</button>
                  <button
                    type="button"
                    className={sensitivityMetric === 'DPS' ? 'active' : ''}
                    aria-pressed={sensitivityMetric === 'DPS'}
                    onClick={() => setSensitivityMetric('DPS')}
                  >DPS</button>
                  <button
                    type="button"
                    className={sensitivityMetric === 'TOTAL' ? 'active' : ''}
                    aria-pressed={sensitivityMetric === 'TOTAL'}
                    disabled={!isDamageSensitivityMetricAvailable(sensitivityTarget, 'TOTAL')}
                    onClick={() => setSensitivityMetric('TOTAL')}
                  >総ダメージ</button>
                </div>
              </div>
            </div>
          </div>
          {sensitivityTarget === 'SKILL' && !skillSupported && (
            <div className="unsupported-model result-unsupported" role="status">
              <strong>選択中のスキルは現在計算できません</strong>
              {unsupportedReasons.map((reason) => <span key={reason}>{reason}</span>)}
            </div>
          )}
          {isGoldenglowSkill3DefaultOutput && (
            <p className="sensitivity-metric-note">
              {goldenglowSkill3Output
                ? `ゴールデングローS3は本体が攻撃しないため、汎用式によるスキル値は表示しません。正確な期待値は「${skillOutputPanelLabel}」で確認できます。`
                : 'ゴールデングローS3は専用期待値モデルの対象です。現在の育成状態では必要な素質データを取得できないため、スキル値を表示しません。'}
            </p>
          )}
          {!isGoldenglowSkill3DefaultOutput && sensitivityMetric === 'DPS' && !hasSensitivityResults && (
            <p className="sensitivity-metric-note">{sensitivityAttackLabel}のDPSを算出できません。</p>
          )}
          {sensitivityTarget === 'SKILL' && !isGoldenglowSkill3Selected && sensitivityMetric === 'TOTAL' && !canShowSkillTotal && (
            <p className="sensitivity-metric-note">選択中のスキルは{skillTotalLabel}を算出できません。</p>
          )}
          {!hasSensitivityResults ? (
            <p className="sensitivity-results-unavailable">
              {isGoldenglowSkill3DefaultOutput
                ? goldenglowSkill3Output
                  ? `この表示内容はデフォルト出力の対象外です。S3の期待DPS・期待総ダメージは「${skillOutputPanelLabel}」で確認できます。`
                  : 'この表示内容はデフォルト出力の対象外です。S3固有出力に必要な素質が解放される育成状態を選択してください。'
                : sensitivityDamageType === null
                  ? `${sensitivityAttackLabel}のダメージ種別を自動判定できないため、計算結果を表示できません。`
                  : `${sensitivityAttackLabel}の表示できる計算結果がありません。`}
            </p>
          ) : (
            <div className="sensitivity-output-layout">
              <div
                className="sensitivity-table-section"
                style={{ maxWidth: `${sensitivityTableMaxWidth}px` }}
              >
                {hasMinimumDamageResults && (
                  <div className="sensitivity-table-meta-row">
                    <span className="minimum-damage-legend"><span aria-hidden="true">※</span>{getMinimumDamageLegendLabel(sensitivityMetric)}</span>
                  </div>
                )}
                <div
                  className="sensitivity-table-wrap"
                  role="region"
                  aria-label={`${sensitivityAttackLabel}・${sensitivityStatLabel}別の${sensitivityMetricLabel}数値一覧`}
                  tabIndex={0}
                >
                  <table className="sensitivity-table">
                    <caption className="visually-hidden">{sensitivityAttackLabel}・{sensitivityStatLabel}別の{sensitivityMetricLabel}数値一覧</caption>
                    <thead><tr>
                      {sensitivityTableHeaders.map((header) => <th scope="col" key={header}>{header}</th>)}
                    </tr></thead>
                    <tbody>
                      {sensitivityData.tableRows.map((row) => {
                        const value = row.value === null ? '—' : formatNumber(row.value)
                        const calculationSelected = row.point === sensitivityCalculationRow?.point
                        return (
                          <tr className={calculationSelected ? 'sensitivity-calculation-selected-row' : undefined} key={row.label}>
                            <th scope="row">
                              {row.breakdown ? (
                                <button
                                  type="button"
                                  className="sensitivity-calculation-selector"
                                  aria-controls="sensitivity-calculation-process"
                                  aria-pressed={calculationSelected}
                                  aria-label={`${sensitivityStatLabel}${row.label}の計算過程を表示`}
                                  onClick={() => setSensitivityCalculationPoint(row.point)}
                                >
                                  <span>{row.label}</span>
                                  <span aria-hidden="true">計算</span>
                                </button>
                              ) : <span className="sensitivity-row-label">{row.label}</span>}
                            </th>
                            <td
                              className={row.minimumReached ? 'minimum-damage-cell' : undefined}
                              aria-label={row.minimumReached ? `${value}、${getMinimumDamageAriaLabel(sensitivityMetric)}` : undefined}
                            >{value}{row.minimumReached && <span className="minimum-damage-mark" aria-hidden="true">※</span>}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              {sensitivityCalculationRow?.breakdown && sensitivityAttackPipeline && (
                <SensitivityCalculationProcess
                  id="sensitivity-calculation-process"
                  row={sensitivityCalculationRow}
                  statLabel={sensitivityStatLabel}
                  valueLabel={sensitivityTableHeaders[1]}
                  baseAttackBreakdown={operatorStats.baseAttackBreakdown}
                  attackPipeline={sensitivityAttackPipeline}
                />
              )}
            </div>
          )}
        </div>

        <p className="result-disclaimer">表示値は単体への理論値です。物理・術ダメージには軽減前の攻撃力の5%を最低保証として適用します。計算過程と固有出力の単一値は敵防御力・術耐性0を基準にしています。確認済みの特性・素質と選択モジュールを反映し、条件入力が必要な効果と未対応効果は計算過程に明示します。潜在、外部バフ、敵デバフ、対象数は含みません。</p>
          </>
        )}
      </CollapsibleCalculatorPanel>

      <CollapsibleCalculatorPanel
        id="operator-output-panel"
        number={panelNumbers.operatorOutput}
        title={DAMAGE_OUTPUT_PANELS.operator.title}
        titleBadge={selectedOperator.operatorId === GOLDENGLOW_OPERATOR_ID ? '自爆ダメージ分析' : undefined}
        summary={goldenglowExplosion
          ? `爆発1回 ${formatNumber(goldenglowExplosion.damageAfterMitigation)} · 術耐性別`
          : `${selectedOperator.operatorName} · 固有出力なし`}
        open={operatorOutputPanelState.open}
        onToggle={() => setOperatorOutputOpen((open) => !open)}
        collapsedLabel="オペレーター固有出力を表示"
        disabled={operatorOutputPanelState.disabled}
        disabledLabel="出力なし"
        className={[
          'operator-output-panel',
          operatorOutputPanelState.disabled ? 'disabled-output-panel' : 'results-panel',
        ].join(' ')}
      >
        {goldenglowExplosion
          ? (
            <GoldenglowResistanceDamageOutput
              explosion={goldenglowExplosion}
              skillIndex={selectedSkill.skillIndex}
              attackInterval={model.attackInterval}
              duration={model.duration}
              skillLabel={`S${selectedSkill.skillIndex} ${selectedSkillLevel.name ?? selectedSkill.skillName}`}
            />
          )
          : <DamageOutputEmptyState subject={selectedOperator.operatorName} />}
      </CollapsibleCalculatorPanel>

      <CollapsibleCalculatorPanel
        id="skill-output-panel"
        number={panelNumbers.skillOutput}
        title={DAMAGE_OUTPUT_PANELS.skill.title}
        summary={goldenglowSkill3Output
          ? `S3 ${selectedSkill.skillName} · 浮遊${goldenglowSkill3Output.activeDroneCount}体集中時 期待DPS ${formatNumber(goldenglowSkill3Output.rows.at(-1)?.expectedDps ?? 0)}`
          : `S${selectedSkill.skillIndex} ${selectedSkill.skillName} · 固有出力なし`}
        open={skillOutputPanelState.open}
        onToggle={() => setSkillOutputOpen((open) => !open)}
        collapsedLabel="スキル固有出力を表示"
        disabled={skillOutputPanelState.disabled}
        disabledLabel="出力なし"
        className={[
          'skill-output-panel',
          skillOutputPanelState.disabled ? 'disabled-output-panel' : 'results-panel',
        ].join(' ')}
      >
        {goldenglowSkill3Output
          ? (
            <GoldenglowSkill3FocusOutput
              output={goldenglowSkill3Output}
              skillLabel={`S3 ${selectedSkillLevel.name ?? selectedSkill.skillName}`}
            />
          )
          : <DamageOutputEmptyState subject={`S${selectedSkill.skillIndex} ${selectedSkill.skillName}`} />}
      </CollapsibleCalculatorPanel>

      <CollapsibleCalculatorPanel
        id="normal-calculation-process-panel"
        number={panelNumbers.normalCalculationProcess}
        title="通常攻撃の計算過程"
        summary={`防御力0・術耐性0 · 1ヒット ${formatOptionalNumber(normalPerHit)} · DPS ${formatOptionalNumber(normalDps)}`}
        open={normalCalculationProcessOpen}
        onToggle={() => setNormalCalculationProcessOpen((open) => !open)}
        collapsedLabel="式と代入値を表示"
        className="calculation-process-panel"
        bodyClassName="calculation-process-body"
      >
        <CalculationTrace
          title="通常攻撃"
          steps={normalCalculationSteps}
          unavailableReasons={normalDamageType === null ? [normalDamageTypeDetection.reason] : []}
          passiveEffects={normalOperatorEffects.effects}
          moduleApplication={moduleApplication}
        />
        <p className="calculation-process-note">
          この式は敵防御力・術耐性0の基準値です。上の一覧で「計算に反映」とした特性・素質・モジュール効果だけを式へ適用します。潜在・外部バフは未反映です。式中の値は確認しやすい桁数に省略して表示し、計算自体は表示前の値で行います。
        </p>
      </CollapsibleCalculatorPanel>

      <CollapsibleCalculatorPanel
        id="skill-calculation-process-panel"
        number={panelNumbers.skillCalculationProcess}
        title="スキルの計算過程"
        summary={isGoldenglowSkill3Selected
          ? goldenglowSkill3Output
            ? `S3専用期待値モデル · ${skillOutputPanelLabel}を参照`
            : 'S3専用期待値モデル · 現在の育成状態では出力不可'
          : skillOutput
            ? `防御力0・術耐性0 · 1攻撃 ${formatNumber(skillOutput.perAttack)} · DPS ${skillOutput.dps === null ? '—' : formatNumber(skillOutput.dps)}`
            : '自動計算対象外'}
        open={skillCalculationProcessOpen}
        onToggle={() => setSkillCalculationProcessOpen((open) => !open)}
        collapsedLabel="式と代入値を表示"
        className="calculation-process-panel"
        bodyClassName="calculation-process-body"
      >
        {isGoldenglowSkill3Selected ? (
          <div className="calculation-unavailable goldenglow-s3-calculation-route">
            <strong>{goldenglowSkill3Output
              ? 'S3は専用の確率モデルで計算しています'
              : 'S3固有出力に必要な素質データを取得できません'}</strong>
            <span>{goldenglowSkill3Output
              ? `本体停止、浮遊ユニットの連続攻撃倍率、自爆の疑似ランダム分布をまとめた計算結果を「${skillOutputPanelLabel}」に表示します。`
              : '爆発素質が解放される昇進段階を選択すると、S3固有の期待値を計算できます。'}</span>
          </div>
        ) : (
          <>
            <CalculationTrace
              title="スキル"
              steps={skillCalculationSteps}
              unavailableReasons={skillOutput ? [] : unsupportedReasons}
              passiveEffects={skillOperatorEffects.effects}
              moduleApplication={moduleApplication}
            />
            <p className="calculation-process-note">
              この式は敵防御力・術耐性0の基準値です。反映済みの特性・素質・モジュール効果はスキル補正と同じA〜Eへ合流します。条件入力が必要・未対応の効果は数値へ加えません。固定時間の総ダメージは、DPS × 効果時間による連続値の理論値です。
            </p>
          </>
        )}
      </CollapsibleCalculatorPanel>
    </section>
  )
}

function CollapsibleCalculatorPanel({
  id,
  number,
  title,
  titleBadge,
  summary,
  open,
  onToggle,
  collapsedLabel,
  disabled = false,
  disabledLabel = '操作できません',
  className = '',
  bodyClassName = '',
  children,
}: {
  id: string
  number: string
  title: string
  titleBadge?: string
  summary: ReactNode
  open: boolean
  onToggle: () => void
  collapsedLabel: string
  disabled?: boolean
  disabledLabel?: string
  className?: string
  bodyClassName?: string
  children: ReactNode
}) {
  const headingId = `${id}-heading`
  const bodyId = `${id}-body`
  const effectiveOpen = !disabled && open

  return (
    <section className={`calculator-panel collapsible-calculator-panel ${effectiveOpen ? 'open' : ''} ${disabled ? 'disabled' : ''} ${className}`.trim()}>
      <h2 className="collapsible-panel-title">
        <button
          type="button"
          id={headingId}
          className={`panel-heading collapsible-panel-heading${titleBadge ? ' has-title-badge' : ''}`}
          aria-expanded={disabled ? undefined : effectiveOpen}
          aria-controls={disabled ? undefined : bodyId}
          disabled={disabled}
          onClick={onToggle}
        >
          <span className="collapsible-panel-heading-title">
            <span>{number}</span>
            <span className="collapsible-panel-heading-label">{title}</span>
            {titleBadge && <span className="collapsible-panel-heading-badge">{titleBadge}</span>}
          </span>
          <span className="collapsible-panel-heading-summary">
            <span>{summary}</span>
            <em>{disabled ? disabledLabel : `${effectiveOpen ? '閉じる' : collapsedLabel} ${effectiveOpen ? '−' : '+'}`}</em>
          </span>
        </button>
      </h2>
      <div
        id={bodyId}
        className={`collapsible-panel-body ${bodyClassName}`.trim()}
        role="region"
        aria-labelledby={headingId}
        hidden={!effectiveOpen}
      >
        {children}
      </div>
    </section>
  )
}

function DamageOutputEmptyState({ subject }: { subject: string }) {
  return (
    <div className="damage-output-empty">
      <strong>現在、専用出力はありません</strong>
      <p>{subject}に固有の追加成分が登録されると、この領域に表示されます。</p>
    </div>
  )
}

function SensitivityCalculationProcess({
  id,
  row,
  statLabel,
  valueLabel,
  baseAttackBreakdown,
  attackPipeline,
}: {
  id: string
  row: SensitivityRow
  statLabel: string
  valueLabel: string
  baseAttackBreakdown: BaseAttackBreakdown
  attackPipeline: AttackPipelineBreakdown
}) {
  const breakdown = row.breakdown
  if (!breakdown || row.value === null) return null

  const headingId = `${id}-heading`
  const conditionLabel = breakdown.mitigation.damageType === 'TRUE'
    ? '防御力・術耐性を適用しない'
    : `${statLabel} ${row.label}`
  const displayedValue = row.value
  const attackSteps = buildAttackPipelineSteps(
    baseAttackBreakdown,
    attackPipeline,
    breakdown.target,
  )
  const steps = buildSensitivityCalculationSteps(breakdown)
  const attackModifierSummary = getAttackModifierSummary(attackPipeline)

  return (
    <section className="sensitivity-calculation-process" id={id} aria-labelledby={headingId}>
      <header className="sensitivity-calculation-caption">
        <div className="sensitivity-calculation-heading">
          <h3 id={headingId}>選択行の計算過程</h3>
          <span>{conditionLabel}</span>
        </div>
        <div className="sensitivity-calculation-result">
          <span>{valueLabel}</span>
          <strong>{formatNumber(displayedValue)}</strong>
          {row.minimumReached && <small>最低保証</small>}
        </div>
      </header>
      <p className="visually-hidden" aria-live="polite" aria-atomic="true">
        {conditionLabel}、{valueLabel} {formatNumber(displayedValue)}の計算過程を表示中
      </p>
      <details className="sensitivity-attack-details">
        <summary>
          <span className="sensitivity-attack-disclosure" aria-hidden="true" />
          <span className="sensitivity-attack-summary-copy">
            <strong>最終攻撃力</strong>
            <small>全行共通 · {attackModifierSummary}</small>
          </span>
          <strong className="sensitivity-attack-summary-value">{formatNumber(attackPipeline.finalAttack)}</strong>
        </summary>
        <CalculationStepList steps={attackSteps} className="sensitivity-attack-step-list" compact />
      </details>
      <CalculationStepList steps={steps} className="sensitivity-calculation-step-list" compact />
    </section>
  )
}

function buildSensitivityCalculationSteps(breakdown: DamageSensitivityBreakdown): CalculationStep[] {
  const mitigation = breakdown.mitigation
  const attack = formatCalculationNumber(mitigation.attack)
  const steps: CalculationStep[] = []

  if (mitigation.damageType === 'TRUE') {
    steps.push({
      label: '確定ダメージ（1ヒット）',
      formula: `${attack}（防御力・術耐性を適用しない）`,
      result: formatNumber(breakdown.perHit),
      note: '確定ダメージには最低保証を適用しません',
    })
  } else {
    const isArts = mitigation.damageType === 'ARTS'
    const statLabel = isArts ? '術耐性' : '防御力'
    const statUnit = isArts ? '%' : ''
    const inputStat = isArts ? mitigation.inputResistance : mitigation.inputDefense
    const statBeforeIgnore = isArts ? mitigation.resistanceBeforeIgnore : mitigation.defenseBeforeIgnore
    const fixedIgnore = isArts ? mitigation.resistanceIgnoreFixed : mitigation.defenseIgnoreFixed
    const appliedStat = isArts ? mitigation.appliedResistance : mitigation.appliedDefense
    const normalizedInputNote = inputStat === statBeforeIgnore
      ? undefined
      : `入力値 ${formatCalculationNumber(inputStat)}${statUnit} を ${formatCalculationNumber(statBeforeIgnore)}${statUnit} に補正`
    steps.push({
      label: `適用${statLabel}`,
      formula: fixedIgnore > 0
        ? `max(0, ${formatCalculationNumber(statBeforeIgnore)}${statUnit} − ${formatCalculationNumber(fixedIgnore)}${statUnit})`
        : `${formatCalculationNumber(statBeforeIgnore)}${statUnit}（固定無視なし）`,
      result: `${formatNumber(appliedStat)}${statUnit}`,
      note: normalizedInputNote,
    })

    const afterMitigation = isArts ? mitigation.afterResistance ?? 0 : mitigation.afterDefense ?? 0
    steps.push({
      label: '軽減式の結果（最低保証前）',
      formula: isArts
        ? `${attack} × (1 − ${formatCalculationNumber(appliedStat)} ÷ 100)`
        : `${attack} − ${formatCalculationNumber(appliedStat)}`,
      result: formatNumber(afterMitigation),
    })

    const minimumDamage = mitigation.minimumDamage ?? 0
    const minimumNote = mitigation.minimumApplied
      ? '軽減後の計算値より大きいため、最低保証を採用'
      : breakdown.minimumReached
        ? '軽減後の計算値が最低保証と同値'
        : '軽減後の計算値を採用'
    steps.push({
      label: '1ヒットダメージ',
      formula: `max(${formatCalculationNumber(afterMitigation)}, ${formatCalculationNumber(minimumDamage)})`,
      result: formatNumber(breakdown.perHit),
      note: `最低保証 ${formatCalculationNumber(mitigation.attack)} × 5% = ${formatCalculationNumber(minimumDamage)}。${minimumNote}`,
    })
  }

  if (breakdown.target === 'SKILL') {
    steps.push({
      label: '1攻撃ダメージ',
      formula: `${formatCalculationNumber(breakdown.perHit)} × ${formatCalculationNumber(breakdown.hitCount)}ヒット`,
      result: formatNumber(breakdown.perAttack),
    })
  }

  const needsDps = breakdown.metric === 'DPS'
    || (breakdown.metric === 'TOTAL' && breakdown.totalMode === 'DURATION')
  if (needsDps) {
    steps.push({
      label: 'DPS',
      formula: `${formatCalculationNumber(breakdown.perAttack)} ÷ ${formatCalculationNumber(breakdown.attackInterval)}秒`,
      result: breakdown.dps === null ? '—' : formatNumber(breakdown.dps),
      note: breakdown.metric === 'TOTAL' ? '効果時間総ダメージの算出に使用' : undefined,
    })
  }

  if (breakdown.metric === 'TOTAL') {
    if (breakdown.totalMode === 'DURATION') {
      steps.push({
        label: '効果時間総ダメージ',
        formula: `${formatCalculationNumber(breakdown.dps ?? 0)} × ${formatCalculationNumber(breakdown.duration)}秒`,
        result: formatNumber(breakdown.finalValue),
        note: '端数の攻撃回数を含む連続値の理論量',
      })
    } else if (breakdown.totalMode === 'AMMO') {
      steps.push({
        label: '全弾総ダメージ',
        formula: `${formatCalculationNumber(breakdown.perAttack)} × ${formatCalculationNumber(breakdown.ammoCount)}発`,
        result: formatNumber(breakdown.finalValue),
      })
    } else if (breakdown.totalMode === 'ACTIVATION') {
      steps.push({
        label: '発動総ダメージ',
        formula: `${formatCalculationNumber(breakdown.perAttack)} × 1回`,
        result: formatNumber(breakdown.finalValue),
      })
    }
  }

  return steps
}

function getAttackModifierSummary(pipeline: AttackPipelineBreakdown): string {
  const modifiers: string[] = []
  if (pipeline.directAddition !== 0) modifiers.push(`A ${formatSignedNumber(pipeline.directAddition)}`)
  if (pipeline.directMultiplierPercent !== 0) modifiers.push(`B ${formatSignedNumber(pipeline.directMultiplierPercent)}%`)
  if (pipeline.finalAddition !== 0) modifiers.push(`C ${formatSignedNumber(pipeline.finalAddition)}`)
  if (pipeline.finalMultiplier !== 1) modifiers.push(`D ×${formatCalculationNumber(pipeline.finalMultiplier)}`)
  if (pipeline.attackScale !== 1) modifiers.push(`E ×${formatCalculationNumber(pipeline.attackScale)}`)
  return modifiers.length > 0 ? modifiers.join(' · ') : 'A〜E補正なし'
}

function selectSensitivityCalculationRow(
  rows: SensitivityRow[],
  selectedPoint: number | null,
): SensitivityRow | null {
  const availableRows = rows.filter((row) => row.breakdown !== null)
  return availableRows.find((row) => row.point === selectedPoint)
    ?? availableRows[Math.floor(availableRows.length / 2)]
    ?? null
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
}) {
  return (
    <label className="calculator-field">
      <span>{label}</span>
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>{children}</select>
    </label>
  )
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  onChange: (value: number) => void
}) {
  return (
    <label className="calculator-field">
      <span>{label}</span>
      <div className="number-input-wrap">
        <input
          aria-label={label}
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(clamp(Number(event.target.value), min, max))}
        />
        {suffix && <em>{suffix}</em>}
      </div>
    </label>
  )
}

function ModelValue({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="model-value">
      <dt><TermLabel label={label} /></dt>
      <dd><strong>{formatCalculationNumber(value)}</strong>{suffix && <span>{suffix}</span>}</dd>
    </div>
  )
}

function TermLabel({
  label,
  supplementalDescription,
}: {
  label: string
  supplementalDescription?: string
}) {
  const description = ATTACK_MODIFIER_DESCRIPTIONS[label as AttackModifierTerm]
  const tooltipDescription = [description, supplementalDescription].filter(Boolean).join(' ')
  if (!tooltipDescription) return label

  return <TermTooltip term={label} description={tooltipDescription} />
}

function TermTooltip({ term, description }: { term: string; description: string }) {
  const tooltipId = useId()

  return (
    <span className="term-tooltip" tabIndex={0} aria-describedby={tooltipId}>
      <span className="term-tooltip-label">{term}</span>
      <span className="term-tooltip-content" id={tooltipId} role="tooltip">{description}</span>
    </span>
  )
}

function OperatorMetric({
  label,
  value,
  detail,
  status = 'APPLIED',
}: {
  label: string
  value: string
  detail: string
  status?: ReflectionStatus
}) {
  return (
    <article className="operator-stat-card">
      <header><span>{label}</span><ReflectionBadge status={status} /></header>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  )
}

function ModuleEffectCard({
  application,
  relatedEffects,
  status,
}: {
  application: OperatorModuleApplication
  relatedEffects: EvaluatedOperatorEffect[]
  status: ReflectionStatus
}) {
  return (
    <article className="operator-effect-card module-effect-card">
      <header><span>モジュール Lv.{application.moduleLevel}</span><ReflectionBadge status={status} /></header>
      <strong>{application.moduleName}</strong>
      <p>{application.changes.length > 0
        ? application.changes.map((change) => `${change.label}：${change.description}`).join(' / ')
        : '特性・素質の変更はありません。'}</p>
      <ModuleAttributeValues effects={application.attributeEffects} />
      {relatedEffects.some((effect) => effect.status !== 'APPLIED' && effect.status !== 'NO_DIRECT_EFFECT') && (
        <small className="module-effect-note">条件付き・未登録の変更は数値へ加えていません。</small>
      )}
      {application.unsupportedReasons.length > 0 && (
        <ul className="module-warning-list">
          {application.unsupportedReasons.map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
      )}
    </article>
  )
}

function ModuleAttributeValues({ effects }: { effects: OperatorModuleAttributeEffect[] }) {
  if (effects.length === 0) return null
  return (
    <ul className="operator-effect-value-list">
      {effects.map((effect, index) => (
        <li key={`${effect.key}-${index}`}>
          <span>{effect.label}</span>
          <strong>{effect.valueLabel}</strong>
          <small>{effect.status === 'APPLIED' ? '適用' : effect.status === 'UNSUPPORTED' ? '未対応' : '対象外'}</small>
        </li>
      ))}
    </ul>
  )
}

function OperatorEffectValues({ effects }: { effects: EvaluatedOperatorEffect[] }) {
  const visibleEffects = effects.filter((effect) => effect.valueLabel !== '—')
  if (visibleEffects.length === 0) return null

  return (
    <ul className="operator-effect-value-list">
      {visibleEffects.map((effect, index) => (
        <li key={`${effect.label}-${index}`}>
          <span>{effect.label}</span>
          <strong>{effect.valueLabel}</strong>
          <small>{effect.status === 'APPLIED' ? '適用' : '候補'}</small>
        </li>
      ))}
    </ul>
  )
}

function ReflectionBadge({ status }: { status: ReflectionStatus }) {
  return <span className={`reflection-badge ${status.toLowerCase().replaceAll('_', '-')}`}>{REFLECTION_STATUS_LABELS[status]}</span>
}

function DamageOutputTargetSwitch({ target, onChange }: {
  target: SensitivityTarget
  onChange: (target: SensitivityTarget) => void
}) {
  return (
    <div className="sensitivity-control">
      <span>表示対象</span>
      <div className="sensitivity-target-switch" role="group" aria-label="表示する攻撃">
        <button
          type="button"
          className={target === 'NORMAL' ? 'active' : ''}
          aria-pressed={target === 'NORMAL'}
          onClick={() => onChange('NORMAL')}
        >通常攻撃</button>
        <button
          type="button"
          className={target === 'SKILL' ? 'active' : ''}
          aria-pressed={target === 'SKILL'}
          onClick={() => onChange('SKILL')}
        >スキル</button>
      </div>
    </div>
  )
}

function MechAccordDamageTables({
  attackCountResult,
  resistanceResult,
  attackLabel,
  onAttackCountChange,
}: {
  attackCountResult: MechAccordDamageRowsResult
  resistanceResult: MechAccordResistanceTableResult
  attackLabel: string
  onAttackCountChange: (attackCount: MechAccordAttackCount) => void
}) {
  const outputId = useId()
  const attackCountHeadingId = `${outputId}-attack-count-heading`
  const resistanceHeadingId = `${outputId}-resistance-heading`
  const attackCountSelectId = useId()
  const resistanceTableId = `${attackCountSelectId}-table`
  const hasAttackCountMinimumDamage = attackCountResult.rows.some((row) => row.minimumReached)
  const hasResistanceMinimumDamage = resistanceResult.rows.some((row) => row.combinedMinimumReached)
  const droneLabel = `浮遊${attackCountResult.droneCount}体`
  const mainLabel = attackCountResult.mainAttackEnabled ? '本体' : '本体（攻撃停止）'

  return (
    <section className="mech-accord-output" aria-label="操機術師固有出力">
      <div className="mech-accord-output-block">
        <div className="mech-accord-output-heading">
          <h3 id={attackCountHeadingId}>操機術師・攻撃回数別ダメージ</h3>
          <p>{attackLabel} · 1攻撃あたり · {mainLabel} {formatNumber(attackCountResult.mainDamage.result)} ＋ {droneLabel} · 術耐性0</p>
        </div>
        {hasAttackCountMinimumDamage && (
          <div className="mech-accord-table-meta-row">
            <span className="minimum-damage-legend"><span aria-hidden="true">※</span>最低保証ダメージ（合計は最低保証を含む）</span>
          </div>
        )}
        <div
          className="mech-accord-table-wrap"
          role="region"
          aria-labelledby={attackCountHeadingId}
          tabIndex={0}
        >
          <table className="mech-accord-table mech-accord-attack-count-table">
            <caption className="visually-hidden">{attackLabel}・術耐性0の操機術師・攻撃回数別ダメージ</caption>
            <thead>
              <tr>
                <th scope="col">攻撃回数</th>
                <th scope="col">{mainLabel}</th>
                <th scope="col">{droneLabel}</th>
                <th scope="col">本体＋浮遊</th>
              </tr>
            </thead>
            <tbody>
              {attackCountResult.rows.map((row) => {
                const minimumLabel = row.minimumReached ? '、最低保証ダメージ' : ''
                return (
                  <tr key={row.attackCount}>
                    <th scope="row">{row.attackCount === MECH_ACCORD_ATTACK_COUNTS.length ? '8回目以降' : `${row.attackCount}回目`}</th>
                    <td aria-label={`本体 ${formatNumber(attackCountResult.mainDamage.result)}`}>
                      <strong className="mech-accord-cell-value">{formatNumber(attackCountResult.mainDamage.result)}</strong>
                    </td>
                    <td
                      className={row.minimumReached ? 'mech-accord-minimum' : undefined}
                      aria-label={`${droneLabel} ${formatNumber(row.droneDamage)}、1体の攻撃倍率 ${row.multiplierPercent}%${minimumLabel}`}
                    >
                      <strong className="mech-accord-cell-value">
                        {formatNumber(row.droneDamage)}
                        {row.minimumReached && <span className="minimum-damage-mark" aria-hidden="true">※</span>}
                      </strong>
                      <small className="mech-accord-cell-meta">{row.multiplierPercent}%</small>
                    </td>
                    <td
                      className={row.minimumReached ? 'mech-accord-minimum' : undefined}
                      aria-label={`本体＋浮遊 ${formatNumber(row.combinedDamage)}${row.minimumReached ? '、最低保証ダメージを含む' : ''}`}
                    >
                      <strong className="mech-accord-cell-value">
                        {formatNumber(row.combinedDamage)}
                        {row.minimumReached && <span className="minimum-damage-mark" aria-hidden="true">※</span>}
                      </strong>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mech-accord-output-block">
        <div className="mech-accord-output-heading">
          <h3 id={resistanceHeadingId}>操機術師・術耐性別ダメージ</h3>
          <p aria-live="polite">{attackLabel} · 1攻撃あたり · {resistanceResult.attackCountLabel} · {droneLabel}（1体 {resistanceResult.multiplierPercent}%） · 術</p>
        </div>
        <div className="mech-accord-attack-count-control">
          <label htmlFor={attackCountSelectId}>攻撃回数</label>
          <select
            id={attackCountSelectId}
            value={resistanceResult.attackCount}
            aria-controls={resistanceTableId}
            onChange={(event) => onAttackCountChange(Number(event.target.value) as MechAccordAttackCount)}
          >
            {MECH_ACCORD_ATTACK_COUNTS.map((attackCount) => (
              <option value={attackCount} key={attackCount}>
                {attackCount === MECH_ACCORD_ATTACK_COUNTS.length ? '8回目以降' : `${attackCount}回目`}
                （{getMechAccordMultiplierPercent(attackCount)}%）
              </option>
            ))}
          </select>
        </div>
        {hasResistanceMinimumDamage && (
          <div className="mech-accord-table-meta-row">
            <span className="minimum-damage-legend"><span aria-hidden="true">※</span>最低保証ダメージ（合計は最低保証を含む）</span>
          </div>
        )}
        <div
          className="mech-accord-table-wrap"
          role="region"
          aria-label={`${resistanceResult.attackCountLabel}の術耐性別ダメージ表`}
          tabIndex={0}
        >
          <table className="mech-accord-table mech-accord-resistance-table" id={resistanceTableId}>
            <caption className="visually-hidden">{attackLabel}・{resistanceResult.attackCountLabel}の操機術師・術耐性別ダメージ</caption>
            <thead>
              <tr>
                <th scope="col">術耐性</th>
                <th scope="col">{mainLabel}</th>
                <th scope="col">{droneLabel}</th>
                <th scope="col">本体＋浮遊</th>
              </tr>
            </thead>
            <tbody>
              {resistanceResult.rows.map((row) => {
                const mainMinimumLabel = row.mainMinimumReached ? '、最低保証ダメージ' : ''
                const droneMinimumLabel = row.droneMinimumReached ? '、最低保証ダメージ' : ''
                const combinedMinimumLabel = row.combinedMinimumReached ? '、最低保証ダメージを含む' : ''
                return (
                  <tr key={row.resistance}>
                    <th scope="row">{formatNumber(row.resistance)}%</th>
                    <td
                      className={row.mainMinimumReached ? 'mech-accord-minimum' : undefined}
                      aria-label={`本体 ${formatNumber(row.mainDamage)}${mainMinimumLabel}`}
                    >
                      <strong className="mech-accord-cell-value">
                        {formatNumber(row.mainDamage)}
                        {row.mainMinimumReached && <span className="minimum-damage-mark" aria-hidden="true">※</span>}
                      </strong>
                    </td>
                    <td
                      className={row.droneMinimumReached ? 'mech-accord-minimum' : undefined}
                      aria-label={`${droneLabel} ${formatNumber(row.droneDamage)}、1体の攻撃倍率 ${resistanceResult.multiplierPercent}%${droneMinimumLabel}`}
                    >
                      <strong className="mech-accord-cell-value">
                        {formatNumber(row.droneDamage)}
                        {row.droneMinimumReached && <span className="minimum-damage-mark" aria-hidden="true">※</span>}
                      </strong>
                    </td>
                    <td
                      className={row.combinedMinimumReached ? 'mech-accord-minimum' : undefined}
                      aria-label={`本体＋浮遊 ${formatNumber(row.combinedDamage)}${combinedMinimumLabel}`}
                    >
                      <strong className="mech-accord-cell-value">
                        {formatNumber(row.combinedDamage)}
                        {row.combinedMinimumReached && <span className="minimum-damage-mark" aria-hidden="true">※</span>}
                      </strong>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mech-accord-note">
        同一対象に全ユニットが同じ回数だけ連続攻撃した場合の値です。対象変更時は1回目へ戻ります。選択モジュールの本体攻撃力補正を含みます。浮遊ユニット固有のモジュール補正、自爆などの追加ダメージ、攻撃速度によるDPSの変化は含みません。
      </p>
    </section>
  )
}

function GoldenglowResistanceDamageOutput({
  explosion,
  skillIndex,
  attackInterval,
  duration,
  skillLabel,
}: {
  explosion: GoldenglowExplosionDamageResult
  skillIndex: number
  attackInterval: number
  duration: number
  skillLabel: string
}) {
  const [selectedOutput, setSelectedOutput] = useState<GoldenglowOperatorOutputMetric>('EXPLOSION_DAMAGE')
  const [copyFeedback, setCopyFeedback] = useState<{
    state: 'COPIED' | 'FAILED'
    tableText: string
    outputLabel: string
  } | null>(null)
  const copyFeedbackTimerRef = useRef<number | null>(null)
  const { model } = explosion
  const totalDamageAvailable = skillIndex !== 2
  const effectiveOutput = selectedOutput === 'EXPECTED_TOTAL_DAMAGE' && !totalDamageAvailable
    ? 'EXPLOSION_DAMAGE'
    : selectedOutput
  const outputOption = GOLDENGLOW_OPERATOR_OUTPUT_OPTIONS.find((option) => option.value === effectiveOutput)
    ?? GOLDENGLOW_OPERATOR_OUTPUT_OPTIONS[0]
  const resistanceRows = useMemo(() => buildGoldenglowResistanceDamageRows({
    model,
    skillIndex,
    effectiveAttack: explosion.effectiveAttack,
    attackInterval,
    duration,
    enemyResistances: getDamageSensitivityTablePoints('ARTS'),
  }), [model, skillIndex, explosion.effectiveAttack, attackInterval, duration])
  const outputRows = resistanceRows.map((row) => ({
    ...row,
    value: selectGoldenglowResistanceOutputValue(row, effectiveOutput),
  }))
  const hasMinimumDamageResults = outputRows.some((row) => row.minimumReached)
  const tableHeaders = ['術耐性', outputOption.tableLabel]
  const tableText = [
    tableHeaders,
    ...outputRows.map((row) => [
      `${formatNumber(row.enemyResistance)}%`,
      row.value === null ? '—' : formatNumber(row.value),
    ]),
  ].map((row) => row.join('\t')).join('\r\n')
  const copyState = copyFeedback?.tableText === tableText ? copyFeedback.state : 'IDLE'
  const copyLabel = copyState === 'COPIED'
    ? 'コピー済み'
    : copyState === 'FAILED' ? 'コピー失敗' : '表をコピー'
  const copyOutputLabel = copyFeedback?.tableText === tableText
    ? copyFeedback.outputLabel
    : outputOption.buttonLabel
  const copyAnnouncement = copyState === 'COPIED'
    ? `ゴールデングローの${copyOutputLabel}表をコピーしました。`
    : copyState === 'FAILED' ? `ゴールデングローの${copyOutputLabel}表をコピーできませんでした。` : ''

  useEffect(() => {
    if (!totalDamageAvailable && selectedOutput === 'EXPECTED_TOTAL_DAMAGE') {
      setSelectedOutput('EXPLOSION_DAMAGE')
    }
  }, [selectedOutput, totalDamageAvailable])

  useEffect(() => {
    setCopyFeedback(null)
    return () => {
      if (copyFeedbackTimerRef.current !== null) {
        window.clearTimeout(copyFeedbackTimerRef.current)
        copyFeedbackTimerRef.current = null
      }
    }
  }, [tableText])

  const copyOutputTable = async () => {
    let nextState: 'COPIED' | 'FAILED' = 'COPIED'
    try {
      await writeClipboardText(tableText)
    } catch {
      nextState = 'FAILED'
    }

    setCopyFeedback({
      state: nextState,
      tableText,
      outputLabel: outputOption.buttonLabel,
    })
    if (copyFeedbackTimerRef.current !== null) {
      window.clearTimeout(copyFeedbackTimerRef.current)
    }
    copyFeedbackTimerRef.current = window.setTimeout(() => {
      setCopyFeedback(null)
      copyFeedbackTimerRef.current = null
    }, 2500)
  }

  return (
    <section className="goldenglow-output" aria-labelledby="goldenglow-output-heading" aria-live="off">
      <div className="goldenglow-output-heading">
        <h3 id="goldenglow-output-heading">ゴールデングロー・術耐性別ダメージ</h3>
        <p>
          {skillLabel} · 爆発倍率{formatNumber(model.attackScalePercent)}%
          {' '}· 術耐性固定無視{formatNumber(model.resistanceIgnoreFixed)}
        </p>
      </div>
      <div className="sensitivity-control goldenglow-output-control">
        <span>出力を選択</span>
        <div
          className="sensitivity-metric-switch"
          role="group"
          aria-label="術耐性別テーブルの出力"
          aria-describedby={!totalDamageAvailable ? 'goldenglow-output-unavailable-note' : undefined}
        >
          {GOLDENGLOW_OPERATOR_OUTPUT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={effectiveOutput === option.value ? 'active' : ''}
              aria-pressed={effectiveOutput === option.value}
              disabled={option.value === 'EXPECTED_TOTAL_DAMAGE' && !totalDamageAvailable}
              onClick={() => setSelectedOutput(option.value)}
            >
              {option.buttonLabel}
            </button>
          ))}
        </div>
      </div>
      {!totalDamageAvailable && (
        <p id="goldenglow-output-unavailable-note" className="goldenglow-output-unavailable-note">
          S2は永続スキルのため、期待総ダメージは算出しません。
        </p>
      )}
      {hasMinimumDamageResults && (
        <div className="sensitivity-table-meta-row goldenglow-table-meta-row">
          <span className="minimum-damage-legend"><span aria-hidden="true">※</span>術ダメージ最低保証</span>
        </div>
      )}
      <div className="goldenglow-copyable-table">
        <div
          className="goldenglow-table-wrap"
          role="region"
          aria-label={`術耐性別の${outputOption.tableLabel}`}
          tabIndex={0}
        >
          <table className="goldenglow-output-table" aria-labelledby="goldenglow-output-heading">
            <thead>
              <tr><th scope="col">術耐性</th><th scope="col">{outputOption.tableLabel}</th></tr>
            </thead>
            <tbody>
              {outputRows.map((row) => (
                <tr key={row.enemyResistance}>
                  <th scope="row">{formatNumber(row.enemyResistance)}%</th>
                  <td
                    className={row.minimumReached ? 'minimum-damage-cell' : undefined}
                    aria-label={row.minimumReached && row.value !== null
                      ? `${formatNumber(row.value)}、術ダメージ最低保証`
                      : undefined}
                  >
                    {row.value === null ? '—' : formatNumber(row.value)}
                    {row.minimumReached && <span className="minimum-damage-mark" aria-hidden="true">※</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          className={[
            'goldenglow-table-copy-button',
            copyState !== 'IDLE' ? 'is-visible' : '',
            copyState === 'COPIED' ? 'is-copied' : '',
            copyState === 'FAILED' ? 'is-failed' : '',
          ].filter(Boolean).join(' ')}
          aria-label={`ゴールデングローの${outputOption.buttonLabel}表をコピー`}
          title={copyLabel}
          onClick={() => void copyOutputTable()}
        >
          {copyState === 'COPIED'
            ? (
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
                <path d="m5 12 4 4L19 6" />
              </svg>
            )
            : copyState === 'FAILED'
              ? (
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
                  <path d="m7 7 10 10M17 7 7 17" />
                </svg>
              )
              : (
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
                  <rect x="8" y="8" width="11" height="11" rx="1.5" />
                  <path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" />
                </svg>
              )}
        </button>
        <span className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
          {copyAnnouncement}
        </span>
      </div>
      <p className="goldenglow-note">
        入力術耐性から固定無視を差し引き、術ダメージの5%最低保証を適用します。爆発1回は浮遊ユニット1体分、期待値は本体と全浮遊ユニットの合算です（S3は浮遊のみ）。
      </p>
    </section>
  )
}

function selectGoldenglowResistanceOutputValue(
  row: GoldenglowResistanceDamageRow,
  output: GoldenglowOperatorOutputMetric,
): number | null {
  if (output === 'EXPECTED_DPS') return row.expectedDps
  if (output === 'EXPECTED_TOTAL_DAMAGE') return row.expectedTotalDamage
  return row.explosionDamage
}

function GoldenglowSkill3FocusOutput({
  output,
  skillLabel,
}: {
  output: GoldenglowSkill3Output
  skillLabel: string
}) {
  const allDrones = output.rows.at(-1)

  return (
    <section className="goldenglow-output goldenglow-s3-output" aria-labelledby="goldenglow-s3-output-heading" aria-live="off">
      <div className="goldenglow-output-heading">
        <h3 id="goldenglow-s3-output-heading">全画面索敵・同一対象への集中期待値</h3>
        <p>
          {skillLabel} · {formatNumber(output.duration)}秒 · 浮遊{output.activeDroneCount}体
          {' '}· 全機の期待自爆{formatNumber(allDrones?.expectedExplosionCount ?? 0)}回 · 術耐性0
        </p>
      </div>
      <div
        className="goldenglow-table-wrap"
        role="region"
        aria-labelledby="goldenglow-s3-output-heading"
        tabIndex={0}
      >
        <table className="goldenglow-output-table goldenglow-s3-table">
          <caption className="visually-hidden">
            ゴールデングローS3で同じ敵を攻撃する浮遊ユニット数ごとの期待値
          </caption>
          <thead>
            <tr>
              <th scope="col">同一対象への浮遊</th>
              <th scope="col">浮遊通常攻撃の期待DPS</th>
              <th scope="col">自爆の期待DPS</th>
              <th scope="col">合計期待DPS</th>
              <th scope="col">期待総ダメージ</th>
            </tr>
          </thead>
          <tbody>
            {output.rows.map((row) => (
              <tr key={row.droneCount}>
                <th scope="row">
                  {row.droneCount}体{row.droneCount === output.activeDroneCount ? '（全機）' : ''}
                </th>
                <td>{formatNumber(row.normalDps)}</td>
                <td>{formatNumber(row.explosionDps)}</td>
                <td>{formatNumber(row.expectedDps)}</td>
                <td>{formatNumber(row.expectedTotalDamage)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="goldenglow-note">
        1〜{output.activeDroneCount}体が同じ単体を{formatNumber(output.duration)}秒間攻撃し続ける場合の理論期待値です。1体あたりの攻撃機会は{formatNumber(output.attackOpportunitiesPerDrone)}回として、本体攻撃は0、自爆は通常攻撃との置き換えで集計します。自爆の範囲巻き込みと0.5秒の足止めはダメージに含めず、攻撃位相を平均し、帰還・再索敵時間は0として計算します。
      </p>
    </section>
  )
}

function CalculationTrace({
  title,
  steps,
  unavailableReasons = [],
  passiveEffects,
  moduleApplication,
}: {
  title: string
  steps: CalculationStep[]
  unavailableReasons?: string[]
  passiveEffects: EvaluatedOperatorEffect[]
  moduleApplication: OperatorModuleApplication
}) {
  return (
    <article className="calculation-trace-card" aria-label={`${title}の計算過程`}>
      {moduleApplication.moduleName
        && (moduleApplication.attributeEffects.length > 0 || moduleApplication.unsupportedReasons.length > 0)
        && (
        <div className="passive-reflection-block">
          <strong>モジュール能力値の反映</strong>
          <ul className="passive-reflection-list">
            {moduleApplication.attributeEffects.map((effect, index) => (
              <li className="passive-reflection-item" key={`${effect.key}-${index}`}>
                <span>モジュール「{moduleApplication.moduleName}」 / {effect.label}</span>
                <ReflectionBadge status={effect.status} />
                <small>値：{effect.valueLabel}。{effect.reason}</small>
              </li>
            ))}
            {moduleApplication.unsupportedReasons.map((reason) => (
              <li className="passive-reflection-item" key={reason}>
                <span>モジュール「{moduleApplication.moduleName}」 / 未対応効果</span>
                <ReflectionBadge status="UNSUPPORTED" />
                <small>{reason}</small>
              </li>
            ))}
          </ul>
        </div>
      )}
      {steps.length > 0 && passiveEffects.length > 0 && (
        <div className="passive-reflection-block">
          <strong>特性・素質・モジュール変更の反映</strong>
          <ul className="passive-reflection-list">
            {passiveEffects.map((effect, index) => (
              <li className="passive-reflection-item" key={`${effect.sourceKind}-${effect.talentIndex ?? 'trait'}-${effect.label}-${index}`}>
                <span>{getPassiveSourceLabel(effect)} / {effect.label}</span>
                <ReflectionBadge status={effect.status} />
                <small>{effect.valueLabel === '—'
                  ? effect.reason
                  : `${effect.status === 'APPLIED' ? '適用値' : '候補値'}：${effect.valueLabel}。${effect.reason}`}</small>
              </li>
            ))}
          </ul>
        </div>
      )}
      {steps.length > 0 ? (
        <CalculationStepList steps={steps} />
      ) : (
        <div className="calculation-unavailable">
          <strong>{title}の計算過程は表示できません</strong>
          {unavailableReasons.map((reason) => <span key={reason}>{reason}</span>)}
        </div>
      )}
    </article>
  )
}

function CalculationStepList({
  steps,
  className = '',
  compact = false,
}: {
  steps: CalculationStep[]
  className?: string
  compact?: boolean
}) {
  return (
    <ol className={`calculation-step-list ${className}`.trim()}>
      {steps.map((step, index) => compact ? (
        <li className="calculation-step compact" key={`${step.label}-${index}`}>
          <strong className="calculation-step-label">
            <TermLabel label={step.label} supplementalDescription={step.note} />
          </strong>
          <span className="calculation-step-equation">
            <code>{step.formula}</code>
            <span className="calculation-step-result-tail">
              <span className="calculation-step-equals">＝</span>
              <em className="calculation-step-result">{step.result}</em>
            </span>
          </span>
        </li>
      ) : (
        <li className="calculation-step" key={`${step.label}-${index}`}>
          <div className="calculation-step-heading">
            <span>{String(index + 1).padStart(2, '0')}</span>
            <strong><TermLabel label={step.label} /></strong>
            <em className="calculation-step-result">{step.result}</em>
          </div>
          <code>{step.formula}</code>
          {step.note && <small>{step.note}</small>}
        </li>
      ))}
    </ol>
  )
}

function buildAttackPipelineSteps(
  base: BaseAttackBreakdown,
  pipeline: AttackPipelineBreakdown,
  mode: 'NORMAL' | 'SKILL',
): CalculationStep[] {
  const directMultiplierNote = mode === 'SKILL'
    ? pipeline.directMultiplierPercent === 0
      ? 'スキルと反映済み特性・素質・モジュールの攻撃力補正Bは0%'
      : 'スキルと反映済み特性・素質・モジュールの攻撃力補正Bを合算して適用'
    : pipeline.directMultiplierPercent === 0
      ? '反映済み特性・素質・モジュールの攻撃力補正Bはありません'
      : '反映済み特性・素質・モジュールの攻撃力補正Bを適用'
  const attackScaleNote = mode === 'SKILL'
    ? pipeline.attackScale === 1
      ? '現在のスキル計算モデルでは100%（係数1）'
      : 'スキルと反映済み特性・素質・モジュールの攻撃力補正Eを適用'
    : pipeline.attackScale === 1
      ? '反映済み特性・素質・モジュールの攻撃力補正Eはありません'
      : '反映済み特性・素質・モジュールの攻撃力補正Eを適用'

  return [
    {
      label: '基礎攻撃力',
      formula: `round(${formatCalculationNumber(base.levelAttack)} + ${formatCalculationNumber(base.trustAttack)} + ${formatCalculationNumber(base.potentialAttack)} + ${formatCalculationNumber(base.moduleAttack)})`,
      result: formatNumber(base.result),
      note: base.moduleAttack === 0
        ? 'レベル + 信頼度 + 潜在 + モジュール。潜在は未反映、モジュール攻撃力補正はありません'
        : `レベル + 信頼度 + 潜在 + モジュール。モジュール攻撃力 ${formatSignedNumber(base.moduleAttack)} を反映（潜在は未反映）`,
    },
    {
      label: '攻撃力補正A',
      formula: `${formatCalculationNumber(pipeline.baseAttack)} + ${formatCalculationNumber(pipeline.directAddition)}`,
      result: formatNumber(pipeline.afterDirectAddition),
      note: pipeline.directAddition === 0
        ? '反映済み特性・素質・モジュールの固定値加算はありません'
        : '反映済み特性・素質・モジュールの固定値加算を適用',
    },
    {
      label: '攻撃力補正B',
      formula: `${formatCalculationNumber(pipeline.afterDirectAddition)} × (1 + ${formatCalculationNumber(pipeline.directMultiplierPercent)}% ÷ 100)`,
      result: formatNumber(pipeline.afterDirectMultiplier),
      note: directMultiplierNote,
    },
    {
      label: '攻撃力補正C',
      formula: `${formatCalculationNumber(pipeline.afterDirectMultiplier)} + ${formatCalculationNumber(pipeline.finalAddition)}`,
      result: formatNumber(pipeline.afterFinalAddition),
      note: '重複規則を伴う最終加算は現在、自動取得未対応',
    },
    {
      label: '攻撃力補正D',
      formula: `max(0, floor(${formatCalculationNumber(pipeline.afterFinalAddition)} × ${formatCalculationNumber(pipeline.finalMultiplier)}))`,
      result: formatNumber(pipeline.afterFinalMultiplier),
      note: '攻撃力低下などの係数は現在、自動取得未対応。適用効果なしの場合は1',
    },
    {
      label: '攻撃力補正E',
      formula: `${formatCalculationNumber(pipeline.afterFinalMultiplier)} × ${formatCalculationNumber(pipeline.attackScale)}`,
      result: formatNumber(pipeline.finalAttack),
      note: attackScaleNote,
    },
  ]
}

function buildMitigationStep(label: string, breakdown: DamageCalculationBreakdown): CalculationStep {
  const attack = formatCalculationNumber(breakdown.attack)

  if (breakdown.damageType === 'TRUE') {
    return {
      label,
      formula: `${attack}（防御力・術耐性を無視）`,
      result: formatNumber(breakdown.result),
    }
  }

  if (breakdown.damageType === 'ARTS') {
    const afterResistance = breakdown.afterResistance ?? 0
    const minimumDamage = breakdown.minimumDamage ?? 0
    const notes: string[] = []
    if (breakdown.inputResistance !== breakdown.resistanceBeforeIgnore) {
      notes.push(`入力術耐性 ${formatCalculationNumber(breakdown.inputResistance)} を0〜100に補正`)
    }
    if (breakdown.resistanceIgnoreFixed > 0) {
      notes.push(`max(0, 術耐性 ${formatCalculationNumber(breakdown.resistanceBeforeIgnore)} − 固定無視 ${formatCalculationNumber(breakdown.resistanceIgnoreFixed)}) = ${formatCalculationNumber(breakdown.appliedResistance)}`)
    }
    notes.push(breakdown.minimumApplied
      ? `耐性適用後 ${formatCalculationNumber(afterResistance)} より大きい最低保証 ${formatCalculationNumber(minimumDamage)} を採用`
      : `耐性適用後 ${formatCalculationNumber(afterResistance)} を採用（最低保証 ${formatCalculationNumber(minimumDamage)}）`)
    return {
      label,
      formula: `max(${attack} × (1 − ${formatCalculationNumber(breakdown.appliedResistance)} ÷ 100), ${attack} × 5%)`,
      result: formatNumber(breakdown.result),
      note: notes.join('。'),
    }
  }

  const afterDefense = breakdown.afterDefense ?? 0
  const minimumDamage = breakdown.minimumDamage ?? 0
  const notes: string[] = []
  if (breakdown.inputDefense !== breakdown.defenseBeforeIgnore) {
    notes.push(`入力防御力 ${formatCalculationNumber(breakdown.inputDefense)} を0以上に補正`)
  }
  if (breakdown.defenseIgnoreFixed > 0) {
    notes.push(`max(0, 防御力 ${formatCalculationNumber(breakdown.defenseBeforeIgnore)} − 固定無視 ${formatCalculationNumber(breakdown.defenseIgnoreFixed)}) = ${formatCalculationNumber(breakdown.appliedDefense)}`)
  }
  notes.push(breakdown.minimumApplied
    ? `防御差し引き後 ${formatCalculationNumber(afterDefense)} より大きい最低保証 ${formatCalculationNumber(minimumDamage)} を採用`
    : `防御差し引き後 ${formatCalculationNumber(afterDefense)} を採用（最低保証 ${formatCalculationNumber(minimumDamage)}）`)
  return {
    label,
    formula: `max(${attack} − ${formatCalculationNumber(breakdown.appliedDefense)}, ${attack} × 5%)`,
    result: formatNumber(breakdown.result),
    note: notes.join('。'),
  }
}

function buildSkillCalculationSteps(base: BaseAttackBreakdown, breakdown: SkillDamageBreakdown): CalculationStep[] {
  const steps: CalculationStep[] = [
    ...buildAttackPipelineSteps(base, breakdown.attackPipeline, 'SKILL'),
    buildMitigationStep(`${DAMAGE_TYPE_LABELS[breakdown.mitigation.damageType]}ダメージ（1ヒット）`, breakdown.mitigation),
    {
      label: '1攻撃ダメージ',
      formula: `${formatCalculationNumber(breakdown.perHit)} × ${formatCalculationNumber(breakdown.hitCount)}ヒット`,
      result: formatNumber(breakdown.perAttack),
    },
  ]

  steps.push(breakdown.dps === null
    ? {
      label: 'DPS',
      formula: '算出対象外',
      result: '—',
      note: breakdown.canShowDps ? '攻撃間隔が0秒以下です' : 'このスキル分類ではDPSを表示しません',
    }
    : {
      label: 'DPS',
      formula: `${formatCalculationNumber(breakdown.perAttack)} ÷ ${formatCalculationNumber(breakdown.attackInterval)}秒`,
      result: formatNumber(breakdown.dps),
    })
  steps.push(buildSkillTotalStep(breakdown))
  return steps
}

function buildSkillTotalStep(breakdown: SkillDamageBreakdown): CalculationStep {
  if (breakdown.totalMode === 'DURATION') {
    return {
      label: '効果時間総ダメージ',
      formula: `${breakdown.dps === null ? 'DPS' : formatCalculationNumber(breakdown.dps)} × ${formatCalculationNumber(breakdown.duration)}秒`,
      result: breakdown.total === null ? '—' : formatNumber(breakdown.total),
      note: breakdown.total === null ? 'DPSまたは効果時間を確定できません' : '端数の攻撃回数を含む連続値の理論量',
    }
  }
  if (breakdown.totalMode === 'AMMO') {
    return {
      label: '全弾総ダメージ',
      formula: `${formatCalculationNumber(breakdown.perAttack)} × ${formatCalculationNumber(breakdown.ammoCount)}発`,
      result: breakdown.total === null ? '—' : formatNumber(breakdown.total),
      note: breakdown.total === null ? '弾数を入力してください' : undefined,
    }
  }
  if (breakdown.totalMode === 'ACTIVATION') {
    return {
      label: '発動総ダメージ',
      formula: `${formatCalculationNumber(breakdown.perAttack)} × 1回`,
      result: formatNumber(breakdown.total ?? breakdown.perAttack),
    }
  }
  return {
    label: 'スキル総ダメージ',
    formula: '算出対象外',
    result: '—',
    note: '終了条件を一意に決められないスキルです',
  }
}

function buildSensitivityData({
  baseAttack,
  normalAttack,
  normalAttackInterval,
  normalDamageType,
  skillDamageType,
  model,
  selectedSkill,
  skillSupported,
  canShowSkillTotal,
  target,
  metric,
  skillAttackModifiers,
  normalMitigationModifiers,
  skillMitigationModifiers,
}: {
  baseAttack: number
  normalAttack: number
  normalAttackInterval: number
  normalDamageType: DamageType | null
  skillDamageType: DamageType | null
  model: SkillModelDefaults | null
  selectedSkill: SkillRecord | null
  skillSupported: boolean
  canShowSkillTotal: boolean
  target: SensitivityTarget
  metric: SensitivityMetric
  skillAttackModifiers: AttackPipelineInput
  normalMitigationModifiers: MitigationModifiers
  skillMitigationModifiers: MitigationModifiers
}): SensitivityData {
  const calculateSkillAt = (defense: number, resistance: number): SkillDamageBreakdown | null => (
    model && selectedSkill && skillSupported && skillDamageType
      ? calculateSkillDamageBreakdown(baseAttack, skillDamageType, defense, resistance, model, {
        canShowDps: selectedSkill.classification.outputCapabilities.canShowDps,
        totalMode: getTotalMode(selectedSkill),
        attackModifiers: skillAttackModifiers,
        mitigationModifiers: skillMitigationModifiers,
      })
      : null
  )
  const referenceSkillBreakdown = target === 'SKILL'
    ? calculateSkillAt(REFERENCE_ENEMY_DEFENSE, REFERENCE_ENEMY_RESISTANCE)
    : null
  const tableDamageType = selectDamageSensitivityType(target, normalDamageType, skillDamageType)
  const normalDefenseIgnore = Math.max(0, normalMitigationModifiers.defenseIgnoreFixed ?? 0)
  const skillDefenseIgnore = Math.max(0, skillMitigationModifiers.defenseIgnoreFixed ?? 0)
  const physicalMinimumDamageBreakpoints = tableDamageType === 'PHYSICAL'
    ? target === 'NORMAL'
      ? [normalAttack * 0.95 + normalDefenseIgnore]
      : referenceSkillBreakdown
        ? [referenceSkillBreakdown.perHit * 0.95 + skillDefenseIgnore]
        : []
    : []
  const tablePoints = getDamageSensitivityTablePoints(tableDamageType, physicalMinimumDamageBreakpoints)
  const tableRows = tablePoints.map((point): SensitivityRow => {
    const defense = tableDamageType === 'PHYSICAL' ? point : REFERENCE_ENEMY_DEFENSE
    const resistance = tableDamageType === 'ARTS' ? point : REFERENCE_ENEMY_RESISTANCE
    const normalBreakdown = target === 'NORMAL' && normalDamageType
      ? calculateDamageBreakdown(
        normalAttack,
        normalDamageType,
        defense,
        resistance,
        normalMitigationModifiers,
      )
      : null
    const skillBreakdown = target === 'SKILL' ? calculateSkillAt(defense, resistance) : null
    const value = selectDamageSensitivityValue({
      target,
      metric,
      normalBreakdown,
      normalAttackInterval,
      skillBreakdown,
      canShowSkillTotal,
    })
    const breakdown = getDamageSensitivityBreakdown({
      target,
      metric,
      normalBreakdown,
      normalAttackInterval,
      skillBreakdown,
      canShowSkillTotal,
    })
    return {
      point,
      label: tableDamageType === 'ARTS'
        ? `${formatNumber(point)}%`
        : tableDamageType === 'TRUE'
          ? '軽減なし'
          : tableDamageType === null
            ? '判定不可'
            : formatNumber(point),
      value,
      minimumReached: breakdown?.minimumReached ?? false,
      breakdown,
    }
  })

  return {
    damageType: tableDamageType,
    tableRows,
  }
}

function getSkillLevelLabel(index: number, total: number): string {
  if (total >= 10 && index >= 7) return `特化${index - 6}`
  return `Lv.${index + 1}`
}

function getModuleReflectionStatus(
  application: OperatorModuleApplication,
  relatedEffects: EvaluatedOperatorEffect[],
): ReflectionStatus {
  const statuses: OperatorEffectStatus[] = [
    ...application.attributeEffects.map((effect) => effect.status),
    ...relatedEffects.map((effect) => effect.status),
  ]
  if (application.unsupportedReasons.length > 0) statuses.push('UNSUPPORTED')
  return getReflectionStatus(statuses)
}

function getEffectGroupStatus(effects: EvaluatedOperatorEffect[]): ReflectionStatus {
  return getReflectionStatus(effects.map((effect) => effect.status))
}

function getReflectionStatus(values: OperatorEffectStatus[]): ReflectionStatus {
  const statuses = new Set(values)
  const hasApplied = statuses.has('APPLIED')
  const hasUnapplied = statuses.has('NOT_APPLIED')
    || statuses.has('REQUIRES_INPUT')
    || statuses.has('UNSUPPORTED')
  if (hasApplied && hasUnapplied) return 'PARTIAL'
  if (statuses.has('UNSUPPORTED')) return 'UNSUPPORTED'
  if (statuses.has('REQUIRES_INPUT')) return 'REQUIRES_INPUT'
  if (statuses.has('NOT_APPLIED')) return 'NOT_APPLIED'
  if (hasApplied) return 'APPLIED'
  return 'NO_DIRECT_EFFECT'
}

function getPassiveSourceLabel(effect: EvaluatedOperatorEffect): string {
  if (effect.sourceKind === 'TRAIT') return '特性'
  if (effect.sourceKind === 'MODULE') return `モジュール「${effect.sourceName}」`
  return `素質「${effect.sourceName}」`
}

function stripMarkup(value: string): string {
  return value.replace(/<[^>]+>/g, '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
}

function unresolvedDamageType(reason: string): DamageTypeDetection {
  return { damageType: null, source: 'UNRESOLVED', reason }
}

function formatDetectedDamageType(damageType: DamageType | null): string {
  return damageType === null ? '自動判定不可' : DAMAGE_TYPE_LABELS[damageType]
}

function getSensitivityStatLabel(damageType: DamageType | null): string {
  if (damageType === 'ARTS') return '術耐性'
  if (damageType === 'PHYSICAL') return '防御力'
  return '敵ステータス'
}

function getSensitivityMetricLabel(metric: SensitivityMetric, totalLabel: string): string {
  if (metric === 'DPS') return 'DPS'
  if (metric === 'TOTAL') return totalLabel
  return '1攻撃ダメージ'
}

function getMinimumDamageLegendLabel(metric: SensitivityMetric): string {
  if (metric === 'TOTAL') return '最低保証ダメージを基に算出'
  if (metric === 'DPS') return '最低保証ダメージ時'
  return '最低保証ダメージ'
}

function getMinimumDamageAriaLabel(metric: SensitivityMetric): string {
  if (metric === 'TOTAL') return '最低保証ダメージを基に算出した総ダメージ'
  if (metric === 'DPS') return '最低保証ダメージ時のDPS'
  return '最低保証ダメージ'
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 1 }).format(value)
}

function formatOptionalNumber(value: number | null): string {
  return value === null ? '—' : formatNumber(value)
}

function formatDecimal(value: number): string {
  return new Intl.NumberFormat('ja-JP', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}

function formatCalculationNumber(value: number): string {
  return new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 4 }).format(value)
}

function formatSignedNumber(value: number): string {
  return `${value >= 0 ? '+' : ''}${formatNumber(value)}`
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}
