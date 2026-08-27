import { useEffect, useMemo, useState } from 'react'
import {
  DAMAGE_TYPE_LABELS,
  calculateDamage,
  calculateSkillDamage,
  deriveSkillModel,
  getDefaultDamageType,
  getOperatorStats,
  type DamageType,
  type SkillModelDefaults,
} from '../lib/damageCalculator'
import type { RawSkillLevel, SkillRecord } from '../types/skill'
import { EMPTY_OPERATOR_FILTERS, OperatorSearch } from './OperatorSearch'
import './DamageCalculator.css'

interface Props {
  rows: SkillRecord[]
  loading: boolean
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
  const [model, setModel] = useState<SkillModelDefaults | null>(null)
  const [operatorSearchOpen, setOperatorSearchOpen] = useState(false)
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
    setDamageType(getDefaultDamageType(selectedOperator.profession))
  }, [effectiveOperatorId])

  useEffect(() => {
    setSkillLevelIndex(Math.max(0, (selectedSkill?.skillLevels.length ?? 1) - 1))
  }, [effectiveSkillId])

  const operatorStats = useMemo(() => selectedOperator
    ? getOperatorStats(selectedOperator.operatorProfile, safePhaseIndex, safeOperatorLevel, trust)
    : { attack: 0, attackSpeed: 100, baseAttackTime: 1, attackInterval: 1 }, [
      selectedOperator,
      safePhaseIndex,
      safeOperatorLevel,
      trust,
    ])
  const autoModel = useMemo(() => selectedSkillLevel
    ? deriveSkillModel(selectedSkillLevel, operatorStats.attackInterval)
    : null, [selectedSkillLevel, operatorStats.attackInterval])

  useEffect(() => {
    setModel(autoModel)
  }, [effectiveSkillId, safeSkillLevelIndex, autoModel])

  const unsupportedReasons = selectedSkill
    ? getUnsupportedReasons(selectedSkill)
    : ['スキルを選択してください。']
  const skillSupported = unsupportedReasons.length === 0
  const normalPerHit = calculateDamage(operatorStats.attack, damageType, enemyDefense, enemyResistance)
  const normalDps = operatorStats.attackInterval > 0 ? normalPerHit / operatorStats.attackInterval : 0
  const skillOutput = selectedSkill && model && skillSupported
    ? calculateSkillDamage(
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
    return <section className="damage-page calculator-page"><p className="calculator-loading">ゲームデータを読み込んでいます…</p></section>
  }

  if (!selectedOperator || !selectedSkill || !selectedSkillLevel || !model) {
    return <section className="damage-page calculator-page"><p className="calculator-loading">計算できるオペレーターが見つかりません。</p></section>
  }

  const updateModel = (field: keyof SkillModelDefaults, value: number) => {
    setModel((current) => current ? { ...current, [field]: value } : current)
  }

  return (
    <section className="damage-page calculator-page">
      <header className="calculator-header">
        <div>
          <span className="calculator-kicker">INITIAL RELEASE</span>
          <h2>Damage Calculator</h2>
          <p>通常攻撃とスキルの理論値を、オペレーターの育成状態と敵ステータスから計算します。</p>
        </div>
        <span className="calculator-status">初期版</span>
      </header>

      <section className="calculator-panel">
        <div className="panel-heading">
          <div><span>01</span><h3>オペレーターとスキル</h3></div>
          <p>潜在・モジュール・味方バフはまだ含みません</p>
        </div>
        <div className="calculator-form-grid operator-form-grid">
          <div className="calculator-field operator-picker-field">
            <span>オペレーター</span>
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
          <SelectField label="スキル" value={effectiveSkillId} onChange={setSkillId}>
            {operatorSkills.map((skill) => (
              <option value={skill.id} key={skill.id}>S{skill.skillIndex} {skill.skillName}</option>
            ))}
          </SelectField>
          <SelectField label="スキルレベル" value={String(safeSkillLevelIndex)} onChange={(value) => setSkillLevelIndex(Number(value))}>
            {skillLevels.map((_, index) => (
              <option value={index} key={index}>{getSkillLevelLabel(index, skillLevels.length)}</option>
            ))}
          </SelectField>
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
            />
          </div>
        )}
        <div className="selected-skill-summary">
          <div>
            <strong>{selectedOperator.operatorName} · S{selectedSkill.skillIndex} {selectedSkillLevel.name ?? selectedSkill.skillName}</strong>
            <span>攻撃力 {formatNumber(operatorStats.attack)} · 攻撃間隔 {formatDecimal(operatorStats.attackInterval)}秒</span>
          </div>
          <p>{stripMarkup(selectedSkillLevel.description ?? selectedSkill.description)}</p>
        </div>
      </section>

      <div className="calculator-two-column">
        <section className="calculator-panel">
          <div className="panel-heading">
            <div><span>02</span><h3>敵とダメージ種別</h3></div>
          </div>
          <div className="damage-type-switch" aria-label="ダメージ種別">
            {(Object.entries(DAMAGE_TYPE_LABELS) as Array<[DamageType, string]>).map(([type, label]) => (
              <button className={damageType === type ? 'active' : ''} onClick={() => setDamageType(type)} key={type}>{label}</button>
            ))}
          </div>
          <div className="calculator-form-grid enemy-form-grid">
            <NumberField label="敵の防御力" value={enemyDefense} min={0} max={10000} onChange={setEnemyDefense} />
            <NumberField label="敵の術耐性" value={enemyResistance} min={0} max={100} suffix="%" onChange={setEnemyResistance} />
          </div>
          <p className="panel-note">物理ダメージには攻撃力の5%の最低保証、術耐性には95%の上限を適用しています。</p>
        </section>

        <section className="calculator-panel">
          <div className="panel-heading">
            <div><span>03</span><h3>スキル計算モデル</h3></div>
            <button className="model-reset" onClick={() => setModel(autoModel)}>自動値に戻す</button>
          </div>
          <div className="calculator-form-grid model-form-grid">
            <NumberField label="攻撃倍率" value={model.attackMultiplierPercent} min={0} max={10000} step={1} suffix="%" onChange={(value) => updateModel('attackMultiplierPercent', value)} />
            <NumberField label="1攻撃のヒット数" value={model.hitCount} min={1} max={100} step={1} onChange={(value) => updateModel('hitCount', value)} />
            <NumberField label="攻撃間隔" value={model.attackInterval} min={0.05} max={60} step={0.01} suffix="秒" onChange={(value) => updateModel('attackInterval', value)} />
            {selectedSkill.classification.effectWindow.value === 'FIXED_DURATION' && (
              <NumberField label="効果時間" value={model.duration} min={0} max={999} step={0.1} suffix="秒" onChange={(value) => updateModel('duration', value)} />
            )}
            {selectedSkill.classification.effectWindow.value === 'AMMO' && (
              <NumberField label="弾数" value={model.ammoCount} min={0} max={999} step={1} onChange={(value) => updateModel('ammoCount', value)} />
            )}
          </div>
          {model.notes.length > 0 && <ul className="model-notes">{model.notes.map((note) => <li key={note}>{note}</li>)}</ul>}
          {!skillSupported && <div className="unsupported-model"><strong>初期版では自動計算できません</strong>{unsupportedReasons.map((reason) => <span key={reason}>{reason}</span>)}</div>}
        </section>
      </div>

      <section className="calculator-panel results-panel">
        <div className="panel-heading">
          <div><span>04</span><h3>計算結果</h3></div>
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

      <section className="calculator-panel sensitivity-panel">
        <div className="panel-heading">
          <div><span>05</span><h3>{damageType === 'ARTS' ? '術耐性' : damageType === 'PHYSICAL' ? '防御力' : '敵ステータス'}別の比較</h3></div>
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

function ResultCard({ label, value }: { label: string; value: number | null }) {
  return (
    <article className="damage-result-card">
      <span>{label}</span>
      <strong>{value === null ? '—' : formatNumber(value)}</strong>
      <small>damage</small>
    </article>
  )
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

function getTotalMode(skill: SkillRecord): 'DURATION' | 'AMMO' | 'ACTIVATION' | 'NONE' {
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

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}
