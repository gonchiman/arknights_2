import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
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
  selectDamageSensitivityType,
  selectDamageSensitivityValues,
  type DamageSensitivityMetric,
} from '../lib/damageSensitivity'
import {
  evaluateOperatorEffects,
  type EvaluatedOperatorEffect,
  type OperatorEffectStatus,
} from '../lib/operatorEffects'
import {
  calculateMechAccordDamageRows,
  isMechAccordSubProfession,
  type MechAccordDamageRowsResult,
} from '../lib/mechAccordDamage'
import { DAMAGE_CALCULATOR_PANEL_DEFAULTS, getDamageCalculatorPanelNumbers } from '../lib/damageCalculatorPanels'
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
import './DamageCalculator.css'

interface Props {
  rows: SkillRecord[]
  loading: boolean
}

type ReflectionStatus = OperatorEffectStatus | 'PARTIAL'
type SensitivityMetric = DamageSensitivityMetric

interface CalculationStep {
  label: string
  formula: string
  result: string
  note?: string
}

interface SensitivityRow {
  point: number
  label: string
  normal: number | null
  skill: number | null
  normalMinimumReached: boolean
  skillMinimumReached: boolean
  current: boolean
}

interface SensitivityData {
  axisDamageType: DamageType | null
  tableRows: SensitivityRow[]
  chartRows: SensitivityRow[]
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

const DEFAULT_OPERATOR_NAME = 'スルト'

export function DamageCalculator({ rows, loading }: Props) {
  const operators = useMemo(() => [...new Map(rows.map((row) => [row.operatorId, row])).values()]
    .sort((a, b) => a.operatorName.localeCompare(b.operatorName, 'ja')), [rows])
  const [operatorId, setOperatorId] = useState('')
  const [skillId, setSkillId] = useState('')
  const [phaseIndex, setPhaseIndex] = useState(0)
  const [operatorLevel, setOperatorLevel] = useState(1)
  const [trust, setTrust] = useState(100)
  const [skillLevelIndex, setSkillLevelIndex] = useState(0)
  const [enemyDefense, setEnemyDefense] = useState(0)
  const [enemyResistance, setEnemyResistance] = useState(0)
  const [operatorSearchPanelOpen, setOperatorSearchPanelOpen] = useState(DAMAGE_CALCULATOR_PANEL_DEFAULTS.operatorSearch)
  const [operatorSearchOpen, setOperatorSearchOpen] = useState(false)
  const [calculationConditionsOpen, setCalculationConditionsOpen] = useState(DAMAGE_CALCULATOR_PANEL_DEFAULTS.calculationConditions)
  const [operatorInfoOpen, setOperatorInfoOpen] = useState(DAMAGE_CALCULATOR_PANEL_DEFAULTS.operatorInfo)
  const [skillModelOpen, setSkillModelOpen] = useState(DAMAGE_CALCULATOR_PANEL_DEFAULTS.skillModel)
  const [resultsOpen, setResultsOpen] = useState(DAMAGE_CALCULATOR_PANEL_DEFAULTS.results)
  const [uniqueOutputOpen, setUniqueOutputOpen] = useState(DAMAGE_CALCULATOR_PANEL_DEFAULTS.uniqueOutput)
  const [normalCalculationProcessOpen, setNormalCalculationProcessOpen] = useState(DAMAGE_CALCULATOR_PANEL_DEFAULTS.normalCalculationProcess)
  const [skillCalculationProcessOpen, setSkillCalculationProcessOpen] = useState(DAMAGE_CALCULATOR_PANEL_DEFAULTS.skillCalculationProcess)
  const [sensitivityMetric, setSensitivityMetric] = useState<SensitivityMetric>('DAMAGE')
  const [operatorFilters, setOperatorFilters] = useState(EMPTY_OPERATOR_FILTERS)

  const defaultOperatorId = operators.find((operator) => operator.operatorName === DEFAULT_OPERATOR_NAME)?.operatorId
    ?? operators[0]?.operatorId
    ?? ''
  const effectiveOperatorId = operators.some((operator) => operator.operatorId === operatorId)
    ? operatorId
    : defaultOperatorId
  const selectedOperator = operators.find((operator) => operator.operatorId === effectiveOperatorId) ?? null
  const operatorSkills = useMemo(() => rows
    .filter((row) => row.operatorId === effectiveOperatorId)
    .sort((a, b) => a.skillIndex - b.skillIndex), [rows, effectiveOperatorId])
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

  useEffect(() => {
    if (!selectedOperator) return
    const nextPhaseIndex = Math.max(0, selectedOperator.operatorProfile.phases.length - 1)
    const nextMaxLevel = Math.max(1, selectedOperator.operatorProfile.phases[nextPhaseIndex]?.maxLevel ?? 1)
    setPhaseIndex(nextPhaseIndex)
    setOperatorLevel(nextMaxLevel)
    setTrust(100)
    setSkillId((current) => operatorSkills.some((skill) => skill.id === current)
      ? current
      : operatorSkills[0]?.id ?? '')
  }, [effectiveOperatorId])

  useEffect(() => {
    setSkillLevelIndex(Math.max(0, (selectedSkill?.skillLevels.length ?? 1) - 1))
  }, [effectiveSkillId])

  const operatorPassives = useMemo(() => selectedOperator
    ? getOperatorPassives(selectedOperator.operatorProfile, safePhaseIndex, safeOperatorLevel)
    : { traitDescription: '', talents: [], sources: [] }, [selectedOperator, safePhaseIndex, safeOperatorLevel])
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
      attackSpeedBonus: normalOperatorEffects.modifiers.attackSpeedBonus,
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
  const normalBreakdown = normalDamageType
    ? calculateDamageBreakdown(
      normalAttackPipeline.finalAttack,
      normalDamageType,
      enemyDefense,
      enemyResistance,
      normalMitigationModifiers,
    )
    : null
  const normalPerHit = normalBreakdown?.result ?? null
  const normalDps = normalPerHit !== null && operatorStats.attackInterval > 0
    ? normalPerHit / operatorStats.attackInterval
    : null
  const mechAccordDamage = selectedOperator
    && normalDamageType !== null
    && isMechAccordSubProfession(selectedOperator.subProfessionId)
    ? calculateMechAccordDamageRows(
      normalAttackPipeline.finalAttack,
      enemyDefense,
      enemyResistance,
      normalMitigationModifiers,
    )
    : null
  const panelNumbers = getDamageCalculatorPanelNumbers(mechAccordDamage !== null)
  const skillBreakdown = selectedSkill && model && skillSupported && skillDamageType
    ? calculateSkillDamageBreakdown(
      operatorStats.attack,
      skillDamageType,
      enemyDefense,
      enemyResistance,
      model,
      {
        canShowDps: selectedSkill.classification.outputCapabilities.canShowDps,
        totalMode: getTotalMode(selectedSkill),
        attackModifiers: skillAttackModifiers,
        mitigationModifiers: skillMitigationModifiers,
      },
    )
    : null
  const skillOutput = skillBreakdown
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
    enemyDefense,
    enemyResistance,
    model,
    selectedSkill,
    skillSupported,
    canShowSkillTotal,
    metric: sensitivityMetric,
    skillAttackModifiers,
    normalMitigationModifiers,
    skillMitigationModifiers,
  }), [operatorStats.attack, normalAttackPipeline.finalAttack, operatorStats.attackInterval, normalDamageType, skillDamageType, enemyDefense, enemyResistance, model, selectedSkill, skillSupported, canShowSkillTotal, sensitivityMetric, skillAttackModifiers, normalMitigationModifiers, skillMitigationModifiers])

  if (loading && rows.length === 0) {
    return <section className="damage-page calculator-page"><p className="calculator-loading" role="status">ゲームデータを読み込んでいます…</p></section>
  }

  if (!selectedOperator || !selectedSkill || !selectedSkillLevel || !model) {
    return <section className="damage-page calculator-page"><p className="calculator-loading" role="status">計算できるオペレーターが見つかりません。</p></section>
  }

  const normalCalculationSteps: CalculationStep[] = normalBreakdown && normalDamageType ? [
    ...buildAttackPipelineSteps(operatorStats.baseAttackBreakdown, normalAttackPipeline, 'NORMAL'),
    buildMitigationStep(`${DAMAGE_TYPE_LABELS[normalDamageType]}ダメージ（1ヒット）`, normalBreakdown),
    {
      label: '攻撃間隔',
      formula: `${formatCalculationNumber(operatorStats.baseAttackTime)}秒 × 100 ÷ max(20, ${formatCalculationNumber(operatorStats.baseAttackSpeed)} + ${formatCalculationNumber(operatorStats.attackSpeedBonus)})`,
      result: `${formatCalculationNumber(operatorStats.attackInterval)}秒`,
      note: operatorStats.attackSpeedBonus === 0
        ? '反映済みの特性・素質による攻撃速度補正はありません'
        : `特性・素質の攻撃速度 ${formatSignedNumber(operatorStats.attackSpeedBonus)} を反映`,
    },
    {
      label: 'DPS',
      formula: `${formatCalculationNumber(normalBreakdown.result)} ÷ ${formatCalculationNumber(operatorStats.attackInterval)}秒`,
      result: normalDps === null ? '—' : formatNumber(normalDps),
    },
  ]
    : []
  const skillCalculationSteps = skillBreakdown
    ? buildSkillCalculationSteps(operatorStats.baseAttackBreakdown, skillBreakdown)
    : []
  const sensitivityDamageType = sensitivityData.axisDamageType
  const sensitivityStatLabel = getSensitivityStatLabel(sensitivityDamageType)
  const skillTotalLabel = getTotalLabel(selectedSkill)
  const sensitivityMetricLabel = getSensitivityMetricLabel(sensitivityMetric, skillTotalLabel)
  const normalSensitivitySeriesLabel = getSensitivitySeriesLabel('NORMAL', sensitivityMetric, skillTotalLabel)
  const skillSensitivitySeriesLabel = getSensitivitySeriesLabel('SKILL', sensitivityMetric, skillTotalLabel)
  const currentSensitivityRow = sensitivityData.tableRows.find((row) => row.current) ?? null
  const damageTypesDiffer = normalDamageType !== null
    && skillDamageType !== null
    && normalDamageType !== skillDamageType
  const hasSensitivitySeries = sensitivityData.chartRows.some((row) => (
    row.normal !== null || row.skill !== null
  ))
  const damageTypeMetricStatus: ReflectionStatus = normalDamageType !== null && skillDamageType !== null
    ? 'APPLIED'
    : normalDamageType !== null || skillDamageType !== null
      ? 'PARTIAL'
      : 'UNSUPPORTED'

  return (
    <section className="damage-page calculator-page">
      <header className="calculator-header">
        <div>
          <span className="calculator-kicker">INITIAL RELEASE</span>
          <h1>Damage Calculator</h1>
          <p>通常攻撃とスキルの理論値を、オペレーターの育成状態と敵ステータスから計算します。</p>
        </div>
        <span className="calculator-status">初期版</span>
      </header>

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

      <CollapsibleCalculatorPanel
        id="calculation-conditions-panel"
        number="02"
        title="ダメージ計算条件"
        summary="潜在・モジュール効果・味方バフはまだ含みません"
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
        <div className="calculator-field skill-picker-field">
          <span>スキル</span>
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
        <div className="selected-skill-summary">
          <div>
            <strong>{selectedOperator.operatorName} · S{selectedSkill.skillIndex} {selectedSkillLevel.name ?? selectedSkill.skillName}</strong>
            <span>基礎攻撃力 {formatNumber(operatorStats.attack)} · 攻撃間隔 {formatDecimal(operatorStats.attackInterval)}秒</span>
          </div>
          <p>{stripMarkup(selectedSkillLevel.description ?? selectedSkill.description)}</p>
        </div>
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
        <div className="condition-divider" />
        <div className="condition-subheading">敵ステータス</div>
        <div className="calculator-form-grid enemy-form-grid">
          <NumberField label="敵の防御力" value={enemyDefense} min={0} max={10000} onChange={setEnemyDefense} />
          <NumberField label="敵の術耐性" value={enemyResistance} min={0} max={100} onChange={setEnemyResistance} />
        </div>
        <p className="panel-note">物理・術ダメージには、軽減前の攻撃力の5%を最低保証として適用しています。</p>
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
                  ? `レベル値 ${formatNumber(operatorStats.baseAttackBreakdown.levelAttack)} + 信頼度 ${formatSignedNumber(operatorStats.baseAttackBreakdown.trustAttack)}`
                  : '基礎攻撃力 → 特性・素質反映後の通常攻撃力'}
              />
              <OperatorMetric
                label="攻撃速度"
                value={formatNumber(operatorStats.attackSpeed)}
                detail={operatorStats.attackSpeedBonus === 0
                  ? '攻撃間隔の算出に使用'
                  : `基礎 ${formatNumber(operatorStats.baseAttackSpeed)} + 特性・素質 ${formatSignedNumber(operatorStats.attackSpeedBonus)}`}
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
            <p className="operator-info-note">このパネルの効果状態は通常攻撃を基準に表示します。スキル側の適用値と未反映理由は、スキルの計算過程に表示します。</p>
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
        id="results-panel"
        number={panelNumbers.results}
        title="計算結果"
        summary={`${formatDamageTypeSummary(normalDamageType, skillDamageType)} · 防御 ${formatNumber(enemyDefense)} · 術耐性 ${formatNumber(enemyResistance)}`}
        open={resultsOpen}
        onToggle={() => setResultsOpen((open) => !open)}
        collapsedLabel="結果を表示"
        className="results-panel"
      >
        <section id="sensitivity-panel" className="result-graph-section" aria-labelledby="sensitivity-panel-heading">
          <header className="result-graph-header">
            <div className="result-graph-heading-copy">
              <h3 id="sensitivity-panel-heading">{sensitivityStatLabel}別の計算結果</h3>
              <p>敵ステータスを変えたときの{sensitivityMetricLabel}を表示します。</p>
            </div>
            <div className="sensitivity-toolbar">
              <span>表示内容</span>
              <div className="sensitivity-metric-switch" role="group" aria-label="比較の表示内容">
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
                  onClick={() => setSensitivityMetric('TOTAL')}
                >総ダメージ</button>
              </div>
            </div>
          </header>
          <div className="sensitivity-current-values" role="status" aria-live="polite" aria-atomic="true">
            <span>現在の条件</span>
            {sensitivityMetric !== 'TOTAL' && (
              <strong>{mechAccordDamage ? `本体 ${normalSensitivitySeriesLabel}` : normalSensitivitySeriesLabel} {formatOptionalNumber(currentSensitivityRow?.normal ?? null)}</strong>
            )}
            <strong>{skillSensitivitySeriesLabel} {formatOptionalNumber(currentSensitivityRow?.skill ?? null)}</strong>
          </div>
          {!skillSupported && (
            <div className="unsupported-model result-unsupported" role="status">
              <strong>選択中のスキルは現在計算できません</strong>
              {unsupportedReasons.map((reason) => <span key={reason}>{reason}</span>)}
            </div>
          )}
          {sensitivityMetric === 'DPS' && sensitivityData.tableRows.every((row) => row.skill === null) && (
            <p className="sensitivity-metric-note">選択中のスキルはDPSを算出できないため、スキル欄は「—」で表示します。</p>
          )}
          {sensitivityMetric === 'TOTAL' && !canShowSkillTotal && (
            <p className="sensitivity-metric-note">選択中のスキルは{skillTotalLabel}を算出できません。</p>
          )}
          {sensitivityMetric !== 'TOTAL' && damageTypesDiffer && (
            <p className="sensitivity-metric-note">
              通常攻撃とスキルの種別が異なるため、{sensitivityStatLabel}だけを変化させ、もう一方の敵ステータスは入力値で固定します。
            </p>
          )}
          {sensitivityDamageType === null || sensitivityDamageType === 'TRUE' || !hasSensitivitySeries ? (
            <p className="sensitivity-chart-unavailable">
              {sensitivityDamageType === 'TRUE'
                ? '比較対象が確定ダメージのため、防御力・術耐性による推移は表示しません。'
                : sensitivityDamageType === null
                  ? '比較軸となるダメージ種別を自動判定できないため、推移は表示しません。'
                  : '比較できる計算結果がないため、推移は表示しません。'}
            </p>
          ) : (
            <SensitivityChart
              rows={sensitivityData.chartRows}
              tickRows={sensitivityData.tableRows}
              axisLabel={getSensitivityAxisLabel(sensitivityDamageType)}
              metric={sensitivityMetric}
              totalLabel={skillTotalLabel}
              normalSeriesLabel={mechAccordDamage ? `本体 ${normalSensitivitySeriesLabel}` : normalSensitivitySeriesLabel}
              skillSeriesLabel={skillSensitivitySeriesLabel}
            />
          )}
          <details className="sensitivity-table-disclosure">
            <summary><span>数値一覧</span><em>{sensitivityStatLabel}ごとの正確な値を表示</em></summary>
            <div className="sensitivity-table-disclosure-body">
              {sensitivityDamageType !== null && sensitivityDamageType !== 'TRUE' && (
                <div className="sensitivity-table-meta-row">
                  <span className="minimum-damage-legend"><i aria-hidden="true" />{getMinimumDamageLegendLabel(sensitivityMetric)}</span>
                </div>
              )}
              <div className="sensitivity-table-wrap">
                <table className={`sensitivity-table ${sensitivityMetric === 'TOTAL' ? 'total-metric' : ''}`.trim()} aria-label={`${sensitivityStatLabel}別の${sensitivityMetricLabel}数値一覧`}>
                  <thead><tr>
                    <th>{sensitivityDamageType === 'TRUE' || sensitivityDamageType === null ? '補正' : sensitivityStatLabel}</th>
                    {sensitivityMetric !== 'TOTAL' && <th>{mechAccordDamage ? `本体 ${normalSensitivitySeriesLabel}` : normalSensitivitySeriesLabel}</th>}
                    <th>{skillSensitivitySeriesLabel}</th>
                  </tr></thead>
                  <tbody>
                    {sensitivityData.tableRows.map((row) => {
                      const normalValue = row.normal === null ? '—' : formatNumber(row.normal)
                      const skillValue = row.skill === null ? '—' : formatNumber(row.skill)
                      return (
                        <tr className={row.current ? 'current' : ''} key={row.label}>
                          <td>{row.label}{row.current && <small>現在値</small>}</td>
                          {sensitivityMetric !== 'TOTAL' && (
                            <td
                              className={row.normalMinimumReached ? 'minimum-damage-cell' : undefined}
                              aria-label={row.normalMinimumReached ? `${normalValue}、${getMinimumDamageAriaLabel(sensitivityMetric)}` : undefined}
                            >{normalValue}</td>
                          )}
                          <td
                            className={row.skillMinimumReached ? 'minimum-damage-cell' : undefined}
                            aria-label={row.skillMinimumReached ? `${skillValue}、${getMinimumDamageAriaLabel(sensitivityMetric)}` : undefined}
                          >{skillValue}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </details>
        </section>

        <p className="result-disclaimer">表示値は単体への理論値です。確認済みの特性・素質だけを反映し、条件入力が必要な効果と未対応効果は計算過程に明示します。潜在、モジュール効果、外部バフ、敵デバフ、対象数は含みません。</p>
      </CollapsibleCalculatorPanel>

      {mechAccordDamage && (
        <CollapsibleCalculatorPanel
          id="unique-output-panel"
          number={panelNumbers.uniqueOutput}
          title="固有出力"
          summary={`${selectedOperator.subProfessionName} · 通常攻撃`}
          open={uniqueOutputOpen}
          onToggle={() => setUniqueOutputOpen((open) => !open)}
          collapsedLabel="固有出力を表示"
          className="unique-output-panel"
        >
          <MechAccordDamageTable result={mechAccordDamage} />
        </CollapsibleCalculatorPanel>
      )}

      <CollapsibleCalculatorPanel
        id="normal-calculation-process-panel"
        number={panelNumbers.normalCalculationProcess}
        title="通常攻撃の計算過程"
        summary={`1ヒット ${formatOptionalNumber(normalPerHit)} · DPS ${formatOptionalNumber(normalDps)}`}
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
        />
        <p className="calculation-process-note">
          上の一覧で「計算に反映」とした効果だけを式へ適用します。潜在・モジュール・外部バフは未反映です。式中の値は確認しやすい桁数に省略して表示し、計算自体は表示前の値で行います。
        </p>
      </CollapsibleCalculatorPanel>

      <CollapsibleCalculatorPanel
        id="skill-calculation-process-panel"
        number={panelNumbers.skillCalculationProcess}
        title="スキルの計算過程"
        summary={skillOutput
          ? `1攻撃 ${formatNumber(skillOutput.perAttack)} · DPS ${skillOutput.dps === null ? '—' : formatNumber(skillOutput.dps)}`
          : '自動計算対象外'}
        open={skillCalculationProcessOpen}
        onToggle={() => setSkillCalculationProcessOpen((open) => !open)}
        collapsedLabel="式と代入値を表示"
        className="calculation-process-panel"
        bodyClassName="calculation-process-body"
      >
        <CalculationTrace
          title="スキル"
          steps={skillCalculationSteps}
          unavailableReasons={skillOutput ? [] : unsupportedReasons}
          passiveEffects={skillOperatorEffects.effects}
        />
        <p className="calculation-process-note">
          反映済みの特性・素質はスキル補正と同じA〜Eへ合流します。条件入力が必要・未対応の効果は数値へ加えません。固定時間の総ダメージは、DPS × 効果時間による連続値の理論値です。
        </p>
      </CollapsibleCalculatorPanel>
    </section>
  )
}

function CollapsibleCalculatorPanel({
  id,
  number,
  title,
  summary,
  open,
  onToggle,
  collapsedLabel,
  className = '',
  bodyClassName = '',
  children,
}: {
  id: string
  number: string
  title: string
  summary: ReactNode
  open: boolean
  onToggle: () => void
  collapsedLabel: string
  className?: string
  bodyClassName?: string
  children: ReactNode
}) {
  const headingId = `${id}-heading`
  const bodyId = `${id}-body`

  return (
    <section className={`calculator-panel collapsible-calculator-panel ${open ? 'open' : ''} ${className}`.trim()}>
      <h2 className="collapsible-panel-title">
        <button
          type="button"
          id={headingId}
          className="panel-heading collapsible-panel-heading"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={onToggle}
        >
          <span className="collapsible-panel-heading-title">
            <span>{number}</span>
            <span className="collapsible-panel-heading-label">{title}</span>
          </span>
          <span className="collapsible-panel-heading-summary">
            <span>{summary}</span>
            <em>{open ? '閉じる' : collapsedLabel} {open ? '−' : '+'}</em>
          </span>
        </button>
      </h2>
      <div
        id={bodyId}
        className={`collapsible-panel-body ${bodyClassName}`.trim()}
        role="region"
        aria-labelledby={headingId}
        hidden={!open}
      >
        {children}
      </div>
    </section>
  )
}

function SensitivityChart({
  rows,
  tickRows,
  axisLabel,
  metric,
  totalLabel,
  normalSeriesLabel,
  skillSeriesLabel,
}: {
  rows: SensitivityRow[]
  tickRows: SensitivityRow[]
  axisLabel: string
  metric: SensitivityMetric
  totalLabel: string
  normalSeriesLabel: string
  skillSeriesLabel: string
}) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [chartWidth, setChartWidth] = useState(720)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return

    const updateWidth = () => setChartWidth(Math.max(240, Math.round(frame.getBoundingClientRect().width)))
    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  const hasNormal = rows.some((row) => row.normal !== null)
  const hasSkill = rows.some((row) => row.skill !== null)
  const chartHeight = chartWidth < 520 ? 260 : 320
  const margin = chartWidth < 520
    ? { top: 28, right: 12, bottom: 46, left: 56 }
    : { top: 30, right: 18, bottom: 48, left: 64 }
  const plotLeft = margin.left
  const plotRight = chartWidth - margin.right
  const plotTop = margin.top
  const plotBottom = chartHeight - margin.bottom
  const plotWidth = Math.max(1, plotRight - plotLeft)
  const plotHeight = Math.max(1, plotBottom - plotTop)
  const xMin = rows[0]?.point ?? 0
  const xMax = rows.at(-1)?.point ?? xMin
  const values = rows.flatMap((row) => [row.normal, row.skill])
    .filter((value): value is number => value !== null)
  const { maximum: yMaximum, ticks: yTicks } = getChartScale(Math.max(0, ...values))
  const getX = (point: number) => xMax === xMin
    ? plotLeft + plotWidth / 2
    : plotLeft + ((point - xMin) / (xMax - xMin)) * plotWidth
  const getY = (value: number) => plotBottom - (value / yMaximum) * plotHeight
  const xTicks = selectChartTicks(tickRows, chartWidth < 520 ? 4 : 6, (row) => getX(row.point))
  const currentRow = rows.find((row) => row.current)
  const currentX = currentRow ? getX(currentRow.point) : null
  const currentText = currentRow ? `現在 ${currentRow.label}` : ''
  const currentLabelWidth = Math.max(58, currentText.length * 8 + 14)
  const currentLabelX = currentX === null
    ? 0
    : clamp(currentX - currentLabelWidth / 2, plotLeft, plotRight - currentLabelWidth)
  const normalRows = rows.filter((row): row is SensitivityRow & { normal: number } => row.normal !== null)
  const normalPath = buildChartPath(normalRows.map((row) => ({ x: getX(row.point), y: getY(row.normal) })))
  const skillRows = rows.filter((row): row is SensitivityRow & { skill: number } => row.skill !== null)
  const skillPath = buildChartPath(skillRows.map((row) => ({ x: getX(row.point), y: getY(row.skill) })))
  const chartValueLabel = getSensitivityMetricLabel(metric, totalLabel)
  const chartTitle = metric === 'DPS'
    ? 'DPS推移'
    : metric === 'TOTAL'
      ? `${totalLabel}推移`
      : '1攻撃ダメージ推移'

  return (
    <figure className="sensitivity-chart">
      <figcaption className="sensitivity-chart-caption">
        <strong>{chartTitle}</strong>
        <span className="sensitivity-chart-legend" aria-label="凡例">
          {hasNormal && <span><i className="normal" aria-hidden="true" />{normalSeriesLabel}</span>}
          {hasSkill && <span><i className="skill" aria-hidden="true" />{skillSeriesLabel}</span>}
        </span>
      </figcaption>
      <div className="sensitivity-chart-frame" ref={frameRef}>
        <svg
          className="sensitivity-chart-svg"
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          width="100%"
          height={chartHeight}
          role="img"
          aria-labelledby={`${titleId} ${descriptionId}`}
        >
          <title id={titleId}>{axisLabel}別の{chartValueLabel}推移</title>
          <desc id={descriptionId}>
            {axisLabel}を変えたときの{[
              hasNormal ? normalSeriesLabel : '',
              hasSkill ? skillSeriesLabel : '',
            ].filter(Boolean).join('と')}を示します。正確な値は数値一覧を開くと確認できます。
          </desc>

          {yTicks.map((tick) => {
            const y = getY(tick)
            return (
              <g key={tick}>
                <line className="sensitivity-chart-grid" x1={plotLeft} x2={plotRight} y1={y} y2={y} />
                <text className="sensitivity-chart-tick" x={plotLeft - 8} y={y + 3} textAnchor="end">{formatNumber(tick)}</text>
              </g>
            )
          })}

          <rect className="sensitivity-chart-plot-frame" x={plotLeft} y={plotTop} width={plotWidth} height={plotHeight} />

          {currentRow && currentX !== null && (
            <g className="sensitivity-chart-current">
              <line x1={currentX} x2={currentX} y1={plotTop} y2={plotBottom} />
              <rect x={currentLabelX} y={4} width={currentLabelWidth} height={18} />
              <text x={currentLabelX + currentLabelWidth / 2} y={17} textAnchor="middle">{currentText}</text>
            </g>
          )}

          {hasNormal && <path className="sensitivity-chart-line normal" d={normalPath} />}
          {hasSkill && <path className="sensitivity-chart-line skill" d={skillPath} />}

          {normalRows.map((row) => (
            <circle
              className={`sensitivity-chart-point normal ${row.current ? 'current' : ''}`}
              cx={getX(row.point)}
              cy={getY(row.normal)}
              r={row.current ? 4 : 3}
              key={`normal-${row.point}`}
              aria-hidden="true"
            />
          ))}
          {skillRows.map((row) => {
            const size = row.current ? 8 : 6
            return (
              <rect
                className={`sensitivity-chart-point skill ${row.current ? 'current' : ''}`}
                x={getX(row.point) - size / 2}
                y={getY(row.skill) - size / 2}
                width={size}
                height={size}
                key={`skill-${row.point}`}
                aria-hidden="true"
              />
            )
          })}

          {xTicks.map((row) => {
            const x = getX(row.point)
            const anchor = x <= plotLeft + 12 ? 'start' : x >= plotRight - 12 ? 'end' : 'middle'
            return (
              <g key={`tick-${row.point}`}>
                <line className="sensitivity-chart-axis-mark" x1={x} x2={x} y1={plotBottom} y2={plotBottom + 4} />
                <text className={`sensitivity-chart-tick ${row.current ? 'current' : ''}`} x={x} y={plotBottom + 17} textAnchor={anchor}>{row.label}</text>
              </g>
            )
          })}

          <text className="sensitivity-chart-axis-title" x={(plotLeft + plotRight) / 2} y={chartHeight - 5} textAnchor="middle">{axisLabel}</text>
          <text className="sensitivity-chart-axis-title" transform={`translate(14 ${(plotTop + plotBottom) / 2}) rotate(-90)`} textAnchor="middle">{chartValueLabel}</text>
        </svg>
      </div>
    </figure>
  )
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

function TermLabel({ label }: { label: string }) {
  const description = ATTACK_MODIFIER_DESCRIPTIONS[label as AttackModifierTerm]
  if (!description) return label

  return <TermTooltip term={label} description={description} />
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

function MechAccordDamageTable({ result }: { result: MechAccordDamageRowsResult }) {
  return (
    <section className="mech-accord-output" aria-labelledby="mech-accord-output-heading" aria-live="off">
      <div className="mech-accord-output-heading">
        <h3 id="mech-accord-output-heading">操機術師・攻撃回数別ダメージ</h3>
        <p>本体 {formatNumber(result.mainDamage.result)} ＋ 浮遊ユニット1体 · 術</p>
      </div>
      <div className="mech-accord-table-wrap">
        <table className="mech-accord-table" aria-labelledby="mech-accord-output-heading">
          <thead>
            <tr>
              <th scope="col">攻撃回数</th>
              <th scope="col">本体＋浮遊</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => {
              const minimumLabel = row.minimumReached ? '、最低保証ダメージ' : ''
              return (
                <tr key={row.attackCount}>
                  <th scope="row">{row.attackCount === 8 ? '8回目以降' : `${row.attackCount}回目`}</th>
                  <td
                    className={row.minimumReached ? 'mech-accord-minimum' : undefined}
                    aria-label={`合計 ${formatNumber(row.combinedDamage)}、浮遊ユニット ${formatNumber(row.droneDamage)}、攻撃倍率 ${row.multiplierPercent}%${minimumLabel}`}
                  >
                    <strong className="mech-accord-cell-value">{formatNumber(row.combinedDamage)}</strong>
                    <small className="mech-accord-cell-meta">浮遊 {formatNumber(row.droneDamage)} · {row.multiplierPercent}%</small>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mech-accord-note">
        同一対象への連続攻撃を想定し、対象変更時は1回目へ戻ります。モジュールと複数の浮遊ユニットは含みません。赤字は最低保証到達時です。
      </p>
    </section>
  )
}

function CalculationTrace({
  title,
  steps,
  unavailableReasons = [],
  passiveEffects,
}: {
  title: string
  steps: CalculationStep[]
  unavailableReasons?: string[]
  passiveEffects: EvaluatedOperatorEffect[]
}) {
  return (
    <article className="calculation-trace-card" aria-label={`${title}の計算過程`}>
      {steps.length > 0 && passiveEffects.length > 0 && (
        <div className="passive-reflection-block">
          <strong>特性・素質の反映</strong>
          <ul className="passive-reflection-list">
            {passiveEffects.map((effect, index) => (
              <li className="passive-reflection-item" key={`${effect.sourceKind}-${effect.talentIndex ?? 'trait'}-${effect.label}-${index}`}>
                <span>{effect.sourceKind === 'TRAIT' ? '特性' : `素質「${effect.sourceName}」`} / {effect.label}</span>
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
        <ol className="calculation-step-list">
          {steps.map((step, index) => (
            <li className="calculation-step" key={`${step.label}-${index}`}>
              <div className="calculation-step-heading">
                <span>{String(index + 1).padStart(2, '0')}</span>
                <strong><TermLabel label={step.label} /></strong>
                <em>{step.result}</em>
              </div>
              <code>{step.formula}</code>
              {step.note && <small>{step.note}</small>}
            </li>
          ))}
        </ol>
      ) : (
        <div className="calculation-unavailable">
          <strong>{title}の計算過程は表示できません</strong>
          {unavailableReasons.map((reason) => <span key={reason}>{reason}</span>)}
        </div>
      )}
    </article>
  )
}

function buildAttackPipelineSteps(
  base: BaseAttackBreakdown,
  pipeline: AttackPipelineBreakdown,
  mode: 'NORMAL' | 'SKILL',
): CalculationStep[] {
  const directMultiplierNote = mode === 'SKILL'
    ? pipeline.directMultiplierPercent === 0
      ? 'スキルと反映済み特性・素質の攻撃力補正Bは0%'
      : 'スキルと反映済み特性・素質の攻撃力補正Bを合算して適用'
    : pipeline.directMultiplierPercent === 0
      ? '反映済み特性・素質の攻撃力補正Bはありません'
      : '反映済み特性・素質の攻撃力補正Bを適用'
  const attackScaleNote = mode === 'SKILL'
    ? pipeline.attackScale === 1
      ? '現在のスキル計算モデルでは100%（係数1）'
      : 'スキルと反映済み特性・素質の攻撃力補正Eを適用'
    : pipeline.attackScale === 1
      ? '反映済み特性・素質の攻撃力補正Eはありません'
      : '反映済み特性・素質の攻撃力補正Eを適用'

  return [
    {
      label: '基礎攻撃力',
      formula: `round(${formatCalculationNumber(base.levelAttack)} + ${formatCalculationNumber(base.trustAttack)} + ${formatCalculationNumber(base.potentialAttack)} + ${formatCalculationNumber(base.moduleAttack)})`,
      result: formatNumber(base.result),
      note: 'レベル + 信頼度 + 潜在 + モジュール。潜在・モジュール効果は現行版では未反映',
    },
    {
      label: '攻撃力補正A',
      formula: `${formatCalculationNumber(pipeline.baseAttack)} + ${formatCalculationNumber(pipeline.directAddition)}`,
      result: formatNumber(pipeline.afterDirectAddition),
      note: pipeline.directAddition === 0
        ? '反映済み特性・素質の固定値加算はありません'
        : '反映済み特性・素質の固定値加算を適用',
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
  enemyDefense,
  enemyResistance,
  model,
  selectedSkill,
  skillSupported,
  canShowSkillTotal,
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
  enemyDefense: number
  enemyResistance: number
  model: SkillModelDefaults | null
  selectedSkill: SkillRecord | null
  skillSupported: boolean
  canShowSkillTotal: boolean
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
  const currentSkillBreakdown = calculateSkillAt(enemyDefense, enemyResistance)
  const skillSeriesAvailable = metric === 'DPS'
    ? currentSkillBreakdown?.dps !== null && currentSkillBreakdown?.dps !== undefined
    : metric === 'TOTAL'
      ? canShowSkillTotal && currentSkillBreakdown?.total !== null && currentSkillBreakdown?.total !== undefined
      : currentSkillBreakdown?.perAttack !== null && currentSkillBreakdown?.perAttack !== undefined
  const axisDamageType = selectDamageSensitivityType(normalDamageType, skillDamageType, metric, skillSeriesAvailable)
  const tablePoints = axisDamageType === 'PHYSICAL'
    ? uniqueSorted([0, 500, 1000, 1500, 2000, enemyDefense])
    : axisDamageType === 'ARTS'
      ? uniqueSorted([0, 20, 40, 60, 80, 95, 100, enemyResistance])
      : [0]
  let chartPoints = tablePoints

  if (axisDamageType === 'PHYSICAL') {
    const maximumDefense = Math.max(...tablePoints)
    const skillAtZeroDefense = calculateSkillAt(0, enemyResistance)?.perHit ?? null
    const normalDefenseIgnore = Math.max(0, normalMitigationModifiers.defenseIgnoreFixed ?? 0)
    const skillDefenseIgnore = Math.max(0, skillMitigationModifiers.defenseIgnoreFixed ?? 0)
    const minimumDamageBreakpoints = [
      metric !== 'TOTAL' && normalDamageType === 'PHYSICAL'
        ? normalAttack * 0.95 + normalDefenseIgnore
        : null,
      skillDamageType === 'PHYSICAL' && skillAtZeroDefense !== null
        ? skillAtZeroDefense * 0.95 + skillDefenseIgnore
        : null,
    ]
      .filter((point): point is number => point !== null && point > 0 && point < maximumDefense)
    const ignoreBreakpoints = [
      metric !== 'TOTAL' && normalDamageType === 'PHYSICAL' ? normalDefenseIgnore : 0,
      skillDamageType === 'PHYSICAL' ? skillDefenseIgnore : 0,
    ].filter((point) => point > 0 && point < maximumDefense)
    chartPoints = uniqueSorted([...tablePoints, ...ignoreBreakpoints, ...minimumDamageBreakpoints])
  } else if (axisDamageType === 'ARTS') {
    const resistanceIgnoreValues = [
      metric !== 'TOTAL' && normalDamageType === 'ARTS'
        ? Math.max(0, normalMitigationModifiers.resistanceIgnoreFixed ?? 0)
        : null,
      skillDamageType === 'ARTS'
        ? Math.max(0, skillMitigationModifiers.resistanceIgnoreFixed ?? 0)
        : null,
    ].filter((value): value is number => value !== null)
    const ignoreBreakpoints = resistanceIgnoreValues.filter((point) => point > 0 && point < 100)
    const minimumDamageBreakpoints = resistanceIgnoreValues
      .map((value) => 95 + value)
      .filter((point) => point > 0 && point <= 100)
    chartPoints = uniqueSorted([
      ...tablePoints,
      ...ignoreBreakpoints,
      ...minimumDamageBreakpoints,
      100,
    ])
  }

  const rowByPoint = new Map<number, SensitivityRow>()
  for (const point of uniqueSorted([...tablePoints, ...chartPoints])) {
    const defense = axisDamageType === 'PHYSICAL' ? point : enemyDefense
    const resistance = axisDamageType === 'ARTS' ? point : enemyResistance
    const normalBreakdown = normalDamageType
      ? calculateDamageBreakdown(
        normalAttack,
        normalDamageType,
        defense,
        resistance,
        normalMitigationModifiers,
      )
      : null
    const skillBreakdown = calculateSkillAt(defense, resistance)
    const { normal, skill } = selectDamageSensitivityValues({
      metric,
      normalBreakdown,
      normalAttackInterval,
      skillBreakdown,
      canShowSkillTotal,
    })
    const current = axisDamageType === 'PHYSICAL'
      ? point === enemyDefense
      : axisDamageType === 'ARTS'
        ? point === enemyResistance
        : true
    rowByPoint.set(point, {
      point,
      label: axisDamageType === 'ARTS'
        ? `${formatNumber(point)}%`
        : axisDamageType === 'TRUE'
          ? '軽減なし'
          : axisDamageType === null
            ? '判定不可'
            : formatNumber(point),
      normal,
      skill,
      normalMinimumReached: normalBreakdown ? isMinimumDamageReached(normalBreakdown) : false,
      skillMinimumReached: skill !== null && skillBreakdown ? isMinimumDamageReached(skillBreakdown.mitigation) : false,
      current,
    })
  }

  return {
    axisDamageType,
    tableRows: tablePoints.map((point) => rowByPoint.get(point) as SensitivityRow),
    chartRows: chartPoints.map((point) => rowByPoint.get(point) as SensitivityRow),
  }
}

function isMinimumDamageReached(breakdown: DamageCalculationBreakdown): boolean {
  const minimum = breakdown.minimumDamage
  if (minimum === null || minimum <= 0) return false
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(breakdown.attack), Math.abs(minimum), Math.abs(breakdown.result)) * 32
  return breakdown.result <= minimum + tolerance
}

function buildChartPath(points: Array<{ x: number; y: number }>): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
}

function getChartScale(maximumValue: number): { maximum: number; ticks: number[] } {
  if (maximumValue <= 0) return { maximum: 1, ticks: [0, 0.25, 0.5, 0.75, 1] }
  const roughStep = maximumValue / 4
  const magnitude = 10 ** Math.floor(Math.log10(roughStep))
  const fraction = roughStep / magnitude
  const niceFraction = fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10
  const step = niceFraction * magnitude
  const maximum = Math.ceil(maximumValue / step) * step
  const ticks = Array.from({ length: Math.round(maximum / step) + 1 }, (_, index) => index * step)
  return { maximum, ticks }
}

function selectChartTicks(
  rows: SensitivityRow[],
  maximumTicks: number,
  getX: (row: SensitivityRow) => number,
): SensitivityRow[] {
  if (rows.length <= 1) return rows
  const minimumSpacing = 48
  const selected: SensitivityRow[] = []
  const addIfSpaced = (row: SensitivityRow | undefined) => {
    if (!row || selected.includes(row)) return
    if (selected.every((candidate) => Math.abs(getX(candidate) - getX(row)) >= minimumSpacing)) selected.push(row)
  }

  addIfSpaced(rows.find((row) => row.current))
  addIfSpaced(rows[0])
  addIfSpaced(rows.at(-1))

  while (selected.length < maximumTicks) {
    const candidates = rows.filter((row) => !selected.includes(row))
    const best = candidates
      .map((row) => ({
        row,
        distance: selected.length === 0
          ? Number.POSITIVE_INFINITY
          : Math.min(...selected.map((candidate) => Math.abs(getX(candidate) - getX(row)))),
      }))
      .sort((a, b) => b.distance - a.distance)[0]
    if (!best || best.distance < minimumSpacing) break
    selected.push(best.row)
  }

  return selected.sort((a, b) => a.point - b.point)
}

function getSkillLevelLabel(index: number, total: number): string {
  if (total >= 10 && index >= 7) return `特化${index - 6}`
  return `Lv.${index + 1}`
}

function getEffectGroupStatus(effects: EvaluatedOperatorEffect[]): ReflectionStatus {
  const statuses = new Set(effects.map((effect) => effect.status))
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

function stripMarkup(value: string): string {
  return value.replace(/<[^>]+>/g, '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
}

function unresolvedDamageType(reason: string): DamageTypeDetection {
  return { damageType: null, source: 'UNRESOLVED', reason }
}

function formatDetectedDamageType(damageType: DamageType | null): string {
  return damageType === null ? '自動判定不可' : DAMAGE_TYPE_LABELS[damageType]
}

function formatDamageTypeSummary(
  normalDamageType: DamageType | null,
  skillDamageType: DamageType | null,
): string {
  if (normalDamageType !== null && normalDamageType === skillDamageType) {
    return DAMAGE_TYPE_LABELS[normalDamageType]
  }
  return `通常 ${formatDetectedDamageType(normalDamageType)} / スキル ${formatDetectedDamageType(skillDamageType)}`
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

function getSensitivitySeriesLabel(
  series: 'NORMAL' | 'SKILL',
  metric: SensitivityMetric,
  totalLabel: string,
): string {
  if (metric === 'TOTAL') return `スキル ${totalLabel}`
  if (metric === 'DPS') return series === 'NORMAL' ? '通常攻撃 DPS' : 'スキル DPS'
  return series === 'NORMAL' ? '通常攻撃 1ヒット' : 'スキル 1攻撃'
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

function getSensitivityAxisLabel(damageType: Exclude<DamageType, 'TRUE'>): string {
  return damageType === 'ARTS' ? '敵の術耐性（RES）' : '敵の防御力'
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values.map((value) => Math.max(0, value)))].sort((a, b) => a - b)
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
