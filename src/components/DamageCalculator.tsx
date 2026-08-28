import { useEffect, useMemo, useState } from 'react'
import {
  DAMAGE_TYPE_LABELS,
  calculateAttackPipeline,
  calculateDamage,
  calculateDamageBreakdown,
  calculateSkillDamage,
  calculateSkillDamageBreakdown,
  deriveSkillModel,
  getDefaultDamageType,
  getOperatorStats,
  type AttackPipelineBreakdown,
  type BaseAttackBreakdown,
  type DamageCalculationBreakdown,
  type DamageType,
  type SkillDamageBreakdown,
  type SkillModelDefaults,
  type SkillTotalMode,
} from '../lib/damageCalculator'
import { getOperatorPassives } from '../lib/operatorProfile'
import type { RawSkillLevel, SkillRecord } from '../types/skill'
import { EMPTY_OPERATOR_FILTERS, OperatorSearch } from './OperatorSearch'
import './DamageCalculator.css'

interface Props {
  rows: SkillRecord[]
  loading: boolean
}

type ReflectionStatus = 'APPLIED' | 'NOT_APPLIED' | 'NO_DIRECT_EFFECT'

interface CalculationStep {
  label: string
  formula: string
  result: string
  note?: string
}

const REFLECTION_STATUS_LABELS: Record<ReflectionStatus, string> = {
  APPLIED: '計算に反映',
  NOT_APPLIED: '未反映',
  NO_DIRECT_EFFECT: '直接影響なし',
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
  const [damageType, setDamageType] = useState<DamageType>('PHYSICAL')
  const [enemyDefense, setEnemyDefense] = useState(0)
  const [enemyResistance, setEnemyResistance] = useState(0)
  const [operatorSearchOpen, setOperatorSearchOpen] = useState(false)
  const [operatorInfoOpen, setOperatorInfoOpen] = useState(false)
  const [normalCalculationProcessOpen, setNormalCalculationProcessOpen] = useState(false)
  const [skillCalculationProcessOpen, setSkillCalculationProcessOpen] = useState(false)
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
    const passives = getOperatorPassives(selectedOperator.operatorProfile, nextPhaseIndex, nextMaxLevel)
    setDamageType(getDefaultDamageType(selectedOperator.profession, passives.traitDescription))
  }, [effectiveOperatorId])

  useEffect(() => {
    setSkillLevelIndex(Math.max(0, (selectedSkill?.skillLevels.length ?? 1) - 1))
  }, [effectiveSkillId])

  const operatorStats = useMemo(() => selectedOperator
    ? getOperatorStats(selectedOperator.operatorProfile, safePhaseIndex, safeOperatorLevel, trust)
    : {
      attack: 0,
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
    ])
  const model = useMemo(() => selectedSkillLevel
    ? deriveSkillModel(selectedSkillLevel, operatorStats.attackInterval)
    : null, [selectedSkillLevel, operatorStats.attackInterval])

  const unsupportedReasons = selectedSkill
    ? getUnsupportedReasons(selectedSkill)
    : ['スキルを選択してください。']
  const skillSupported = unsupportedReasons.length === 0
  const operatorPassives = selectedOperator
    ? getOperatorPassives(selectedOperator.operatorProfile, safePhaseIndex, safeOperatorLevel)
    : { traitDescription: '', talents: [] }
  const traitReflectionStatus = getTraitReflectionStatus(operatorPassives.traitDescription, damageType)
  const normalAttackPipeline = calculateAttackPipeline(operatorStats.attack)
  const normalBreakdown = calculateDamageBreakdown(
    normalAttackPipeline.finalAttack,
    damageType,
    enemyDefense,
    enemyResistance,
  )
  const normalPerHit = normalBreakdown.result
  const normalDps = operatorStats.attackInterval > 0 ? normalPerHit / operatorStats.attackInterval : 0
  const skillBreakdown = selectedSkill && model && skillSupported
    ? calculateSkillDamageBreakdown(
      operatorStats.attack,
      damageType,
      enemyDefense,
      enemyResistance,
      model,
      {
        canShowDps: selectedSkill.classification.outputCapabilities.canShowDps,
        totalMode: getTotalMode(selectedSkill),
      },
    )
    : null
  const skillOutput = skillBreakdown
  const sensitivityRows = useMemo(() => buildSensitivityRows({
    attack: operatorStats.attack,
    damageType,
    enemyDefense,
    enemyResistance,
    model,
    selectedSkill,
    skillSupported,
  }), [operatorStats.attack, damageType, enemyDefense, enemyResistance, model, selectedSkill, skillSupported])

  if (loading && rows.length === 0) {
    return <section className="damage-page calculator-page"><p className="calculator-loading" role="status">ゲームデータを読み込んでいます…</p></section>
  }

  if (!selectedOperator || !selectedSkill || !selectedSkillLevel || !model) {
    return <section className="damage-page calculator-page"><p className="calculator-loading" role="status">計算できるオペレーターが見つかりません。</p></section>
  }

  const normalCalculationSteps: CalculationStep[] = [
    ...buildAttackPipelineSteps(operatorStats.baseAttackBreakdown, normalAttackPipeline, 'NORMAL'),
    buildMitigationStep(`${DAMAGE_TYPE_LABELS[damageType]}ダメージ（1ヒット）`, normalBreakdown),
    {
      label: '攻撃間隔',
      formula: `${formatCalculationNumber(operatorStats.baseAttackTime)}秒 × 100 ÷ max(20, ${formatCalculationNumber(operatorStats.attackSpeed)})`,
      result: `${formatCalculationNumber(operatorStats.attackInterval)}秒`,
    },
    {
      label: 'DPS',
      formula: `${formatCalculationNumber(normalPerHit)} ÷ ${formatCalculationNumber(operatorStats.attackInterval)}秒`,
      result: formatNumber(normalDps),
    },
  ]
  const skillCalculationSteps = skillBreakdown
    ? buildSkillCalculationSteps(operatorStats.baseAttackBreakdown, skillBreakdown)
    : []

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

      <section className="calculator-panel operator-search-panel">
        <div className="panel-heading">
          <div><span>01</span><h2>オペレーター検索</h2></div>
          <p>計算対象を選択します</p>
        </div>
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
      </section>

      <section className="calculator-panel calculation-conditions-panel">
        <div className="panel-heading">
          <div><span>02</span><h2>ダメージ計算条件</h2></div>
          <p>潜在・モジュール・味方バフはまだ含みません</p>
        </div>
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
            <span>攻撃力 {formatNumber(operatorStats.attack)} · 攻撃間隔 {formatDecimal(operatorStats.attackInterval)}秒</span>
          </div>
          <p>{stripMarkup(selectedSkillLevel.description ?? selectedSkill.description)}</p>
        </div>
        <div className="condition-divider" />
        <div className="condition-subheading">敵とダメージ種別</div>
        <div className="enemy-condition-row">
          <div>
            <span className="condition-field-label">ダメージ種別</span>
            <div className="damage-type-switch" role="group" aria-label="ダメージ種別">
              {(Object.entries(DAMAGE_TYPE_LABELS) as Array<[DamageType, string]>).map(([type, label]) => (
                <button type="button" className={damageType === type ? 'active' : ''} aria-pressed={damageType === type} onClick={() => setDamageType(type)} key={type}>{label}</button>
              ))}
            </div>
          </div>
          <div className="calculator-form-grid enemy-form-grid">
            <NumberField label="敵の防御力" value={enemyDefense} min={0} max={10000} onChange={setEnemyDefense} />
            <NumberField label="敵の術耐性" value={enemyResistance} min={0} max={100} suffix="%" onChange={setEnemyResistance} />
          </div>
        </div>
        <p className="panel-note">物理・術ダメージには、軽減前の攻撃力の5%を最低保証として適用しています。</p>
      </section>

      <section className={`calculator-panel operator-info-panel ${operatorInfoOpen ? 'open' : ''}`}>
        <h2 className="collapsible-panel-title">
          <button
            type="button"
            id="operator-info-heading"
            className="panel-heading operator-info-heading"
            aria-expanded={operatorInfoOpen}
            aria-controls="operator-info-body"
            onClick={() => setOperatorInfoOpen((open) => !open)}
          >
            <span className="operator-info-heading-title">
              <span>03</span>
              <span className="operator-info-heading-label">オペレーター情報</span>
            </span>
            <span className="operator-info-heading-summary">
              <span>攻撃力 {formatNumber(operatorStats.attack)} · 攻撃速度 {formatNumber(operatorStats.attackSpeed)} · 攻撃間隔 {formatDecimal(operatorStats.attackInterval)}秒</span>
              <em>{operatorInfoOpen ? '閉じる' : '詳細を表示'} {operatorInfoOpen ? '−' : '+'}</em>
            </span>
          </button>
        </h2>
        {operatorInfoOpen && (
          <div id="operator-info-body" className="operator-info-body" role="region" aria-labelledby="operator-info-heading">
            <div className="operator-stat-grid">
              <OperatorMetric
                label="実効攻撃力"
                value={formatNumber(operatorStats.attack)}
                detail={`レベル値 ${formatNumber(operatorStats.baseAttackBreakdown.levelAttack)} + 信頼度 ${formatSignedNumber(operatorStats.baseAttackBreakdown.trustAttack)}`}
              />
              <OperatorMetric
                label="攻撃速度"
                value={formatNumber(operatorStats.attackSpeed)}
                detail="攻撃間隔の算出に使用"
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
                label="計算上のダメージ種別"
                value={DAMAGE_TYPE_LABELS[damageType]}
                detail="計算条件で変更可能"
              />
            </div>
            <div className="operator-effect-grid">
              <article className="operator-effect-card">
                <header><span>特性</span><ReflectionBadge status={traitReflectionStatus} /></header>
                <p>{operatorPassives.traitDescription || '特性情報なし'}</p>
              </article>
              {operatorPassives.talents.length > 0 ? operatorPassives.talents.map((talent, index) => (
                <article className="operator-effect-card" key={`${talent.name}-${index}`}>
                  <header><span>素質</span><ReflectionBadge status={getTalentReflectionStatus(talent.description)} /></header>
                  <strong>{talent.name}</strong>
                  <p>{talent.description || '説明なし'}</p>
                </article>
              )) : (
                <article className="operator-effect-card muted-passive">
                  <header><span>素質</span><ReflectionBadge status="NO_DIRECT_EFFECT" /></header>
                  <p>現在の昇進段階で解放された素質はありません</p>
                </article>
              )}
            </div>
            <p className="operator-info-note">「未反映」の効果は表示のみで、現在の計算結果には含まれません。</p>
          </div>
        )}
      </section>

      <section className="calculator-panel">
        <div className="panel-heading">
          <div><span>04</span><h2>スキル計算モデル</h2></div>
          <p>ダメージ計算条件とゲームデータから自動決定</p>
        </div>
        <dl className="model-value-grid" aria-label="自動算出されたスキル計算モデル">
          <ModelValue label="攻撃力補正 B" value={model.directMultiplierPercent} suffix="%" />
          <ModelValue label="攻撃倍率 E" value={model.attackScalePercent} suffix="%" />
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
      </section>

      <section className="calculator-panel results-panel" aria-live="polite">
        <div className="panel-heading">
          <div><span>05</span><h2>計算結果</h2></div>
          <p>{DAMAGE_TYPE_LABELS[damageType]} · 防御 {formatNumber(enemyDefense)} · 術耐性 {formatNumber(enemyResistance)}%</p>
        </div>
        <div className="result-section-label">通常攻撃</div>
        <div className="damage-result-grid normal-results">
          <ResultCard label="1ヒット" value={normalPerHit} />
          <ResultCard label="DPS" value={normalDps} />
        </div>
        <div className="result-section-label">スキル</div>
        <div className="damage-result-grid skill-results">
          <ResultCard label="1ヒット" value={skillOutput?.perHit ?? null} />
          <ResultCard label={`1攻撃（${model.hitCount}ヒット）`} value={skillOutput?.perAttack ?? null} />
          <ResultCard label="DPS" value={skillOutput?.dps ?? null} />
          <ResultCard label={getTotalLabel(selectedSkill)} value={skillOutput?.total ?? null} />
        </div>
        <p className="result-disclaimer">表示値は単体への理論値です。素質、潜在、モジュール、バフ、敵へのデバフ、攻撃モーション、対象数は含みません。</p>
      </section>

      <section className={`calculator-panel calculation-process-panel ${normalCalculationProcessOpen ? 'open' : ''}`}>
        <h2 className="collapsible-panel-title">
          <button
            type="button"
            id="normal-calculation-process-heading"
            className="panel-heading operator-info-heading calculation-process-heading"
            aria-expanded={normalCalculationProcessOpen}
            aria-controls="normal-calculation-process-body"
            onClick={() => setNormalCalculationProcessOpen((open) => !open)}
          >
            <span className="operator-info-heading-title">
              <span>06</span>
              <span className="operator-info-heading-label">通常攻撃の計算過程</span>
            </span>
            <span className="operator-info-heading-summary">
              <span>1ヒット {formatNumber(normalPerHit)} · DPS {formatNumber(normalDps)}</span>
              <em>{normalCalculationProcessOpen ? '閉じる' : '式と代入値を表示'} {normalCalculationProcessOpen ? '−' : '+'}</em>
            </span>
          </button>
        </h2>
        {normalCalculationProcessOpen && (
          <div id="normal-calculation-process-body" className="calculation-process-body" role="region" aria-labelledby="normal-calculation-process-heading">
            <CalculationTrace
              title="通常攻撃"
              steps={normalCalculationSteps}
            />
            <p className="calculation-process-note">
              特性・素質・潜在・モジュール・外部バフに由来するA〜Eは未反映です。式中の値は確認しやすい桁数に省略して表示し、計算自体は表示前の値で行います。
            </p>
          </div>
        )}
      </section>

      <section className={`calculator-panel calculation-process-panel ${skillCalculationProcessOpen ? 'open' : ''}`}>
        <h2 className="collapsible-panel-title">
          <button
            type="button"
            id="skill-calculation-process-heading"
            className="panel-heading operator-info-heading calculation-process-heading"
            aria-expanded={skillCalculationProcessOpen}
            aria-controls="skill-calculation-process-body"
            onClick={() => setSkillCalculationProcessOpen((open) => !open)}
          >
            <span className="operator-info-heading-title">
              <span>07</span>
              <span className="operator-info-heading-label">スキルの計算過程</span>
            </span>
            <span className="operator-info-heading-summary">
              <span>{skillOutput
                ? `1攻撃 ${formatNumber(skillOutput.perAttack)} · DPS ${skillOutput.dps === null ? '—' : formatNumber(skillOutput.dps)}`
                : '自動計算対象外'}</span>
              <em>{skillCalculationProcessOpen ? '閉じる' : '式と代入値を表示'} {skillCalculationProcessOpen ? '−' : '+'}</em>
            </span>
          </button>
        </h2>
        {skillCalculationProcessOpen && (
          <div id="skill-calculation-process-body" className="calculation-process-body" role="region" aria-labelledby="skill-calculation-process-heading">
            <CalculationTrace
              title="スキル"
              steps={skillCalculationSteps}
              unavailableReasons={skillOutput ? [] : unsupportedReasons}
            />
            <p className="calculation-process-note">
              A・C・Dと、特性・素質・外部効果に由来するB・Eは未反映です。固定時間の総ダメージは、DPS × 効果時間による連続値の理論値です。
            </p>
          </div>
        )}
      </section>

      <section className="calculator-panel sensitivity-panel">
        <div className="panel-heading">
          <div><span>08</span><h2>{damageType === 'ARTS' ? '術耐性' : damageType === 'PHYSICAL' ? '防御力' : '敵ステータス'}別の比較</h2></div>
          <p>敵ステータスを変えたときの単体ダメージ</p>
        </div>
        <div className="sensitivity-table-wrap">
          <table className="sensitivity-table">
            <thead><tr><th>{damageType === 'ARTS' ? '術耐性' : damageType === 'PHYSICAL' ? '防御力' : '補正'}</th><th>通常攻撃 1ヒット</th><th>スキル 1攻撃</th></tr></thead>
            <tbody>
              {sensitivityRows.map((row) => (
                <tr className={row.current ? 'current' : ''} key={row.label}>
                  <td>{row.label}{row.current && <small>現在値</small>}</td>
                  <td>{formatNumber(row.normal)}</td>
                  <td>{row.skill === null ? '—' : formatNumber(row.skill)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
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
      <dt>{label}</dt>
      <dd><strong>{formatCalculationNumber(value)}</strong>{suffix && <span>{suffix}</span>}</dd>
    </div>
  )
}

function OperatorMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="operator-stat-card">
      <header><span>{label}</span><ReflectionBadge status="APPLIED" /></header>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  )
}

function ReflectionBadge({ status }: { status: ReflectionStatus }) {
  return <span className={`reflection-badge ${status.toLowerCase().replaceAll('_', '-')}`}>{REFLECTION_STATUS_LABELS[status]}</span>
}

function ResultCard({ label, value }: { label: string; value: number | null }) {
  return (
    <article className="damage-result-card">
      <span>{label}</span>
      <strong>{value === null ? '—' : formatNumber(value)}</strong>
      <small>damage</small>
    </article>
  )
}

function CalculationTrace({
  title,
  steps,
  unavailableReasons = [],
}: {
  title: string
  steps: CalculationStep[]
  unavailableReasons?: string[]
}) {
  return (
    <article className="calculation-trace-card" aria-label={`${title}の計算過程`}>
      {steps.length > 0 ? (
        <ol className="calculation-step-list">
          {steps.map((step, index) => (
            <li className="calculation-step" key={`${step.label}-${index}`}>
              <div className="calculation-step-heading">
                <span>{String(index + 1).padStart(2, '0')}</span>
                <strong>{step.label}</strong>
                <em>{step.result}</em>
              </div>
              <code>{step.formula}</code>
              {step.note && <small>{step.note}</small>}
            </li>
          ))}
        </ol>
      ) : (
        <div className="calculation-unavailable">
          <strong>このスキルの計算過程は表示できません</strong>
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
      ? '現在のスキル計算モデルでは0%。素質・外部バフは未反映'
      : 'スキル計算モデルの攻撃力補正B（自動算出値）を適用'
    : '通常攻撃へ影響する特性・素質・外部バフは未反映'
  const attackScaleNote = mode === 'SKILL'
    ? pipeline.attackScale === 1
      ? '現在のスキル計算モデルでは100%（係数1）'
      : 'スキル計算モデルの攻撃倍率E（自動算出値）を適用'
    : '現在の通常攻撃モデルでは1。特性由来の攻撃倍率Eは未反映'

  return [
    {
      label: '基礎攻撃力',
      formula: `round(${formatCalculationNumber(base.levelAttack)} + ${formatCalculationNumber(base.trustAttack)} + ${formatCalculationNumber(base.potentialAttack)} + ${formatCalculationNumber(base.moduleAttack)})`,
      result: formatNumber(base.result),
      note: 'レベル + 信頼度 + 潜在 + モジュール。潜在・モジュールの固定値は現行版では未反映',
    },
    {
      label: '直接加算項 A',
      formula: `${formatCalculationNumber(pipeline.baseAttack)} + ${formatCalculationNumber(pipeline.directAddition)}`,
      result: formatNumber(pipeline.afterDirectAddition),
      note: '固定値加算は現在、自動取得未対応',
    },
    {
      label: '直接乗算項 B',
      formula: `${formatCalculationNumber(pipeline.afterDirectAddition)} × (1 + ${formatCalculationNumber(pipeline.directMultiplierPercent)}% ÷ 100)`,
      result: formatNumber(pipeline.afterDirectMultiplier),
      note: directMultiplierNote,
    },
    {
      label: '最終加算項 C',
      formula: `${formatCalculationNumber(pipeline.afterDirectMultiplier)} + ${formatCalculationNumber(pipeline.finalAddition)}`,
      result: formatNumber(pipeline.afterFinalAddition),
      note: '重複規則を伴う最終加算は現在、自動取得未対応',
    },
    {
      label: '最終乗算項 D',
      formula: `max(0, floor(${formatCalculationNumber(pipeline.afterFinalAddition)} × ${formatCalculationNumber(pipeline.finalMultiplier)}))`,
      result: formatNumber(pipeline.afterFinalMultiplier),
      note: '攻撃力低下などの係数は現在、自動取得未対応。適用効果なしの場合は1',
    },
    {
      label: '攻撃倍率 E',
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
    const resistanceWasClamped = breakdown.inputResistance !== breakdown.appliedResistance
    const afterResistance = breakdown.afterResistance ?? 0
    const minimumDamage = breakdown.minimumDamage ?? 0
    return {
      label,
      formula: `max(${attack} × (1 − ${formatCalculationNumber(breakdown.appliedResistance)}% ÷ 100), ${attack} × 5%)`,
      result: formatNumber(breakdown.result),
      note: resistanceWasClamped
        ? `入力術耐性 ${formatCalculationNumber(breakdown.inputResistance)}% を0〜100%に補正`
        : breakdown.minimumApplied
          ? `耐性適用後 ${formatCalculationNumber(afterResistance)} より大きい最低保証 ${formatCalculationNumber(minimumDamage)} を採用`
          : `耐性適用後 ${formatCalculationNumber(afterResistance)} を採用（最低保証 ${formatCalculationNumber(minimumDamage)}）`,
    }
  }

  const afterDefense = breakdown.afterDefense ?? 0
  const minimumDamage = breakdown.minimumDamage ?? 0
  return {
    label,
    formula: `max(${attack} − ${formatCalculationNumber(breakdown.appliedDefense)}, ${attack} × 5%)`,
    result: formatNumber(breakdown.result),
    note: breakdown.minimumApplied
      ? `防御差し引き後 ${formatCalculationNumber(afterDefense)} より大きい最低保証 ${formatCalculationNumber(minimumDamage)} を採用`
      : `防御差し引き後 ${formatCalculationNumber(afterDefense)} を採用（最低保証 ${formatCalculationNumber(minimumDamage)}）`,
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

function getUnsupportedReasons(skill: SkillRecord): string[] {
  const components = new Set(skill.classification.damageComponents.value)
  const reasons: string[] = []
  if (components.has('NO_DIRECT_DAMAGE')) reasons.push('直接ダメージを持たないスキルです。')
  if (components.has('UNKNOWN')) reasons.push('ダメージ構成が未確定です。')
  if (components.has('SUMMON')) reasons.push('召喚物の独立ステータスが必要です。')
  if (components.has('DEPLOYED_OBJECT')) reasons.push('設置物の個別モデルが必要です。')
  if (components.has('PERIODIC') || components.has('DAMAGE_OVER_TIME')) reasons.push('周期・継続ダメージの間隔モデルが必要です。')
  if (skill.classification.outputCapabilities.requiresModeSelection) reasons.push('段階・モードごとの値を選択する必要があります。')
  if (!components.has('BASIC_ATTACK_MODIFIER') && !components.has('BURST') && reasons.length === 0) {
    reasons.push('単純な通常攻撃変化・瞬間攻撃以外のモデルです。')
  }
  return reasons
}

function getTotalMode(skill: SkillRecord): SkillTotalMode {
  const window = skill.classification.effectWindow.value
  if (window === 'FIXED_DURATION') return 'DURATION'
  if (window === 'AMMO') return 'AMMO'
  if (window === 'NONE') return 'ACTIVATION'
  return 'NONE'
}

function getTotalLabel(skill: SkillRecord): string {
  const window = skill.classification.effectWindow.value
  if (window === 'FIXED_DURATION') return '効果時間総ダメージ'
  if (window === 'AMMO') return '全弾総ダメージ'
  if (window === 'NONE') return '発動総ダメージ'
  return 'スキル総ダメージ'
}

function buildSensitivityRows({
  attack,
  damageType,
  enemyDefense,
  enemyResistance,
  model,
  selectedSkill,
  skillSupported,
}: {
  attack: number
  damageType: DamageType
  enemyDefense: number
  enemyResistance: number
  model: SkillModelDefaults | null
  selectedSkill: SkillRecord | null
  skillSupported: boolean
}) {
  const points = damageType === 'PHYSICAL'
    ? uniqueSorted([0, 500, 1000, 1500, 2000, enemyDefense])
    : damageType === 'ARTS'
      ? uniqueSorted([0, 20, 40, 60, 80, 95, enemyResistance])
      : [0]

  return points.map((point) => {
    const defense = damageType === 'PHYSICAL' ? point : enemyDefense
    const resistance = damageType === 'ARTS' ? point : enemyResistance
    const normal = calculateDamage(attack, damageType, defense, resistance)
    const skill = model && selectedSkill && skillSupported
      ? calculateSkillDamage(attack, damageType, defense, resistance, model, {
        canShowDps: selectedSkill.classification.outputCapabilities.canShowDps,
        totalMode: getTotalMode(selectedSkill),
      }).perAttack
      : null
    const current = damageType === 'PHYSICAL'
      ? point === enemyDefense
      : damageType === 'ARTS'
        ? point === enemyResistance
        : true
    return {
      label: damageType === 'ARTS' ? `${formatNumber(point)}%` : damageType === 'TRUE' ? '軽減なし' : formatNumber(point),
      normal,
      skill,
      current,
    }
  })
}

function getSkillLevelLabel(index: number, total: number): string {
  if (total >= 10 && index >= 7) return `特化${index - 6}`
  return `Lv.${index + 1}`
}

function getTraitReflectionStatus(description: string, damageType: DamageType): ReflectionStatus {
  const impliedDamageType = inferDamageTypeFromText(description)
  if (impliedDamageType) return impliedDamageType === damageType ? 'APPLIED' : 'NOT_APPLIED'
  return hasDirectDamageEffect(description) ? 'NOT_APPLIED' : 'NO_DIRECT_EFFECT'
}

function getTalentReflectionStatus(description: string): ReflectionStatus {
  return hasDirectDamageEffect(description) ? 'NOT_APPLIED' : 'NO_DIRECT_EFFECT'
}

function inferDamageTypeFromText(description: string): DamageType | null {
  if (/確定ダメージ/.test(description)) return 'TRUE'
  if (/術ダメージ/.test(description)) return 'ARTS'
  if (/物理ダメージ/.test(description)) return 'PHYSICAL'
  return null
}

function hasDirectDamageEffect(description: string): boolean {
  return /攻撃力|攻撃速度|攻撃間隔|防御力.{0,16}無視|術耐性.{0,16}無視|追加.{0,16}ダメージ|与えるダメージ|連撃|会心/.test(description)
}

function stripMarkup(value: string): string {
  return value.replace(/<[^>]+>/g, '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values.map((value) => Math.max(0, value)))].sort((a, b) => a - b)
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 1 }).format(value)
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
