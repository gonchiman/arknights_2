import { useMemo, useState } from 'react'
import {
  evaluateDamageThreeAttributeComparison, getDamageThreeAttributeChangeRate, getDamageThreeAttributeEntries,
  type DamageThreeAttributeAxis, type DamageThreeAttributeComparison,
  type DamageThreeAttributeEntry, type DamageThreeAttributeType,
} from '../lib/damageCalculatorThreeAttributeComparison'
import type { DamageThreeComparisonOverrides } from '../lib/damageCalculatorThreeComparison'
import { buildDamageCalculatorThreeSkillInformation } from '../lib/damageCalculatorThreeSkillInformation'
import type { GuardInput } from '../lib/guardCombatTypes'
import type { SkillStructureSelection } from '../lib/skillStructure'
import type { SkillRecord } from '../types/skill'
import { AnalysisTabs } from './AnalysisTabs'
import { ElementalBuildupTable } from './ElementalBuildupTable'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { ComparisonChart } from './ComparisonChart'
import { GuardConditionFields } from './DamageCalculatorThree'
import { EMPTY_OPERATOR_FILTERS, OperatorSearch } from './OperatorSearch'
import { OperatorDetailLink } from './OperatorDetailLink'
import { PersistentDetails } from './PersistentDetails'
import { SkillInformationTable } from './SkillInformationTable'
import './DamageCalculator.css'
import './DamageCalculatorTwo.css'
import './DamageCalculatorThree.css'
import './DamageCalculatorThreeAttributePage.css'

interface Props {
  rows: SkillRecord[]
  loading: boolean
  initialSelection?: SkillStructureSelection
}

type Metric = 'perAttack' | 'dps' | 'combinedDps'
const METRIC_LABELS: Record<Metric, string> = { perAttack: '1回の攻撃ダメージ', dps: 'DPS', combinedDps: '合計DPS' }
const TYPE_LABELS: Record<DamageThreeAttributeType, string> = { PHYSICAL: '物理', ARTS: '術' }
const NUMBER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 })
const SKILL_TAB_ID = 'damage-three-attribute-skill'

function sameSkill(entry: DamageThreeAttributeEntry, selection: SkillStructureSelection) {
  const info = entry.structure.basicInfo
  return info.operatorId === selection.operatorId && info.skillId === selection.skillId
    && info.skillIndex === selection.skillIndex && info.levelIndex === selection.levelIndex
}

function uniqueSkills(entries: DamageThreeAttributeEntry[]) {
  const skills = new Map<string, DamageThreeAttributeEntry>()
  for (const entry of entries) {
    const previous = skills.get(entry.skill.skillId)
    if (!previous || (!previous.capability.supported && entry.capability.supported)) skills.set(entry.skill.skillId, entry)
  }
  return [...skills.values()].sort((a, b) => a.skill.skillIndex - b.skill.skillIndex)
}

export function DamageCalculatorThreeAttributePage({ rows, loading, initialSelection }: Props) {
  const entries = useMemo(() => getDamageThreeAttributeEntries(rows), [rows])
  const [selection, setSelection] = useState<SkillStructureSelection | null>(initialSelection ?? null)
  const [stageId, setStageId] = useState<string | null>(null)
  const [operatorLevel, setOperatorLevel] = useState<number | null>(null)
  const [trust, setTrust] = useState(100)
  const [common, setCommon] = useState({ defense: 1000, resistance: 40, enemyCount: 1 })
  const [overrides, setOverrides] = useState<DamageThreeComparisonOverrides>({})
  const [targetType, setTargetType] = useState<DamageThreeAttributeType>('ARTS')
  const [axis, setAxis] = useState<DamageThreeAttributeAxis>('defense')
  const [metric, setMetric] = useState<Metric>('dps')
  const [searchOpen, setSearchOpen] = useState(false)
  const [filters, setFilters] = useState({ ...EMPTY_OPERATOR_FILTERS })
  const requested = selection ?? (entries.find(entry => entry.capability.supported) ?? entries[0])?.structure.basicInfo
  const stages = requested ? entries.filter(entry => sameSkill(entry, requested)) : []
  const selected = stages.find(entry => entry.stageId === stageId)
    ?? stages.find(entry => entry.capability.supported) ?? stages[0]
  const operator = selected?.skill
  const operatorSkills = uniqueSkills(entries.filter(entry => entry.skill.operatorId === requested?.operatorId))
  const level = operatorLevel ?? selected?.operatorLevel ?? 1
  const levelInvalid = !Number.isSafeInteger(level) || level < 1 || level > (selected?.operatorLevel ?? 1)
  const trustInvalid = !Number.isFinite(trust) || trust < 0 || trust > 100
  const comparison = useMemo(() => selected ? evaluateDamageThreeAttributeComparison({
    entry: selected, common, overrides, operatorLevel: level, trust, targetType, axis,
  }) : null, [selected, common, overrides, level, trust, targetType, axis])
  const output = comparison?.original.output
  const conditionInputs: GuardInput[] = (comparison?.original.fields ?? []).filter(field => !field.locked)
    .map(field => ({ ...field, defaultValue: field.value ?? (field.kind === 'number' ? Number.NaN : '') }))
  const hasPeriodicDamage = !!comparison && [comparison.original, comparison.changed]
    .some(result => result?.damageOverTimeDps !== null && result?.damageOverTimeDps !== undefined && result.damageOverTimeDps > 0)
  const hasDps = output?.canShowDps ?? selected?.kind === 'NORMAL'
  const activeMetric = !hasDps ? 'perAttack' : metric === 'combinedDps' && !hasPeriodicDamage ? 'dps' : metric
  const mainType = output?.mainAttackType
  const originalLabel = mainType === 'PHYSICAL' || mainType === 'ARTS' ? TYPE_LABELS[mainType]
    : mainType === 'TRUE' ? '確定' : mainType === 'ELEMENTAL' ? '元素' : output?.rows.length ? '混合' : '未確定'
  const changedLabel = TYPE_LABELS[targetType]

  function chooseSkill(entry: DamageThreeAttributeEntry) {
    setSelection(entry.structure.basicInfo)
    setStageId(entry.stageId)
    setOperatorLevel(entry.operatorLevel)
    setOverrides({})
    setSearchOpen(false)
  }

  function selectOperator(row: SkillRecord) {
    const candidates = entries.filter(entry => entry.skill.operatorId === row.operatorId)
    const next = candidates.find(entry => entry.capability.supported) ?? candidates[0]
    if (next) chooseSkill(next)
  }

  if (!rows.length) return <p className="calculator-loading" role="status">
    {loading ? 'オペレーターデータを読み込み中…' : 'オペレーターデータを取得できません。'}
  </p>

  return <section className="calculator-page damage-two-page damage-three-page damage-three-attribute-page">
    <h1 className="visually-hidden">攻撃属性の比較</h1>
    <nav className="damage-three-page-actions" aria-label="計算機3の関連ページ">
      <a className="button secondary" href="#/damage-3">計算機3</a>
      <a className="button secondary" href="#/damage-3/comparison">スキル比較</a>
      <a className="button secondary" href="#/damage-3/coverage">実装範囲</a>
    </nav>
    <CollapsibleCalculatorPanel id="damage-three-attribute-conditions" number="01" title="スキル・共通条件"
      summary={operator ? `${operator.operatorName} · S${operator.skillIndex}` : '未選択'} collapsedLabel="条件を表示">
      <div className="damage-three-attribute-selection-row">
        <div className="calculator-field">
          <span>オペレーター</span>
          <div className="damage-three-operator-summary">
            <div className="damage-three-operator-meta">
              {operator ? <><OperatorDetailLink operatorId={operator.operatorId} source="damage-three"
                className="damage-three-operator-name" aria-label={`${operator.operatorName}のオペレーター情報を開く`}>
                {operator.operatorName}<span aria-hidden="true">→</span></OperatorDetailLink>
                <small>★{operator.rarity} · {operator.professionLabel} / {operator.subProfessionName}</small></> : <strong>未選択</strong>}
            </div>
            <button type="button" className="damage-three-operator-change" aria-expanded={searchOpen}
              aria-controls="damage-three-attribute-search" onClick={() => setSearchOpen(!searchOpen)}>
              {searchOpen ? '検索を閉じる' : '検索して変更'}</button>
          </div>
        </div>
        {selected && <div className="damage-three-skills damage-three-attribute-skills">
          <AnalysisTabs tabs={operatorSkills.map(entry => [entry.skill.skillId,
            `S${entry.skill.skillIndex} ${entry.structure.basicInfo.skillName}`] as const)}
            activeTab={selected.skill.skillId} idPrefix={SKILL_TAB_ID} label="スキル選択"
            onChange={id => {
              const entry = operatorSkills.find(item => item.skill.skillId === id)
              if (entry && id !== selected.skill.skillId) chooseSkill(entry)
            }} />
        </div>}
      </div>
      {searchOpen && <div id="damage-three-attribute-search" className="damage-three-attribute-search">
        <OperatorSearch rows={entries.map(entry => entry.skill)} loading={loading} filters={filters}
          onFiltersChange={setFilters} onSelect={selectOperator} instruction="" actionLabel="選択する →"
          className="damage-operator-search-results" selectedOperatorId={operator?.operatorId} />
      </div>}
      {!selected ? <div className="damage-two-unavailable" role="status">
        {entries.length ? '指定されたスキル・レベルは属性比較の対象外です。' : '属性比較の対象スキルを取得できません。'}
      </div> : <>
        <div className="calculator-form-grid damage-three-attribute-condition-grid">
          <label className="calculator-field"><span>敵の防御力</span>
            <input type="number" aria-label="敵の防御力" min={0} step={100} value={Number.isFinite(common.defense) ? common.defense : ''}
              aria-invalid={!Number.isFinite(common.defense) || common.defense < 0 || undefined}
              onChange={event => setCommon(previous => ({ ...previous, defense: event.target.valueAsNumber }))} /></label>
          <label className="calculator-field"><span>敵の術耐性</span>
            <input type="number" aria-label="敵の術耐性" min={0} max={100} step={5} value={Number.isFinite(common.resistance) ? common.resistance : ''}
              aria-invalid={!Number.isFinite(common.resistance) || common.resistance < 0 || common.resistance > 100 || undefined}
              onChange={event => setCommon(previous => ({ ...previous, resistance: event.target.valueAsNumber }))} /></label>
          <label className="calculator-field"><span>敵の数</span>
            <input type="number" aria-label="敵の数" min={1} max={10000} step={1} value={Number.isFinite(common.enemyCount) ? common.enemyCount : ''}
              aria-invalid={!Number.isSafeInteger(common.enemyCount) || common.enemyCount < 1 || common.enemyCount > 10000 || undefined}
              onChange={event => setCommon(previous => ({ ...previous, enemyCount: event.target.valueAsNumber }))} /></label>
        </div>
        {operatorSkills.map(entry => <div key={entry.skill.skillId} id={`${SKILL_TAB_ID}-panel-${entry.skill.skillId}`}
          role="tabpanel" aria-labelledby={`${SKILL_TAB_ID}-tab-${entry.skill.skillId}`}
          hidden={selected.skill.skillId !== entry.skill.skillId} className="damage-three-skill-panel">
          {selected.skill.skillId === entry.skill.skillId && <>
            {(stages.length > 1 || conditionInputs.length > 0) && <div className="calculator-form-grid damage-three-attribute-condition-grid damage-three-attribute-skill-conditions">
              {stages.length > 1 && <label className="calculator-field"><span>スキルの段階</span>
                <select aria-label="スキルの段階" value={selected.stageId} onChange={event => { setStageId(event.target.value); setOverrides({}) }}>
                  {stages.map(stage => <option key={stage.stageId} value={stage.stageId}>{stage.stageLabel}</option>)}
                </select></label>}
              <GuardConditionFields inputs={conditionInputs} values={{}}
                onChange={(key, value) => setOverrides(previous => ({ ...previous, [key]: value }))} />
            </div>}
            <PersistentDetails persistenceId="damage-three-attribute-growth" defaultOpen={false} className="damage-three-attribute-growth">
              <summary><strong>育成・スキル情報</strong><span className="damage-three-attribute-growth-summary">
                昇進{selected.phaseIndex} · Lv.{formatNumber(level)} · 信頼{formatNumber(trust)} · {selected.structure.basicInfo.skillLevel}
              </span>{(levelInvalid || trustInvalid) && <span className="damage-three-attribute-growth-error">入力エラー</span>}</summary>
              <div className="damage-three-attribute-growth-content">
                <div className="calculator-form-grid damage-three-attribute-growth-grid">
                  <label className="calculator-field"><span>オペレーターレベル</span>
                    <input type="number" aria-label="オペレーターレベル" min={1} max={selected.operatorLevel} step={1}
                      value={Number.isFinite(level) ? level : ''} aria-invalid={levelInvalid || undefined}
                      onChange={event => setOperatorLevel(event.target.valueAsNumber)} /></label>
                  <label className="calculator-field"><span>信頼度（%）</span>
                    <input type="number" aria-label="信頼度（%）" min={0} max={100} step={1}
                      value={Number.isFinite(trust) ? trust : ''} aria-invalid={trustInvalid || undefined}
                      onChange={event => setTrust(event.target.valueAsNumber)} /></label>
                </div>
                <SkillInformationTable information={buildDamageCalculatorThreeSkillInformation(selected.structure, selected.skill, output ?? null)} />
              </div>
            </PersistentDetails>
          </>}
        </div>)}
      </>}
    </CollapsibleCalculatorPanel>

    {selected && comparison && <CollapsibleCalculatorPanel id="damage-three-attribute-results" number="02" title="属性比較"
      titleBadge="仮想比較 · 主攻撃" summary={`${originalLabel} → ${changedLabel}`} collapsedLabel="比較を表示">
      <div className="damage-three-attribute-toolbar">
        <div className="calculator-field"><span>本来の主攻撃</span><div className="damage-three-fixed-value">{originalLabel}</div></div>
        <AttributeButtons label="変更後の主攻撃" options={[["PHYSICAL", "物理"], ["ARTS", "術"]]}
          value={targetType} onChange={setTargetType} />
        <AttributeButtons label="横軸" options={[["defense", "防御力"], ["resistance", "術耐性"]]}
          value={axis} onChange={setAxis} />
        <label className="calculator-field"><span>指標（1体）</span>
          <select aria-label="指標（1体）" value={activeMetric} onChange={event => setMetric(event.target.value as Metric)}>
            {hasDps && <option value="dps">DPS</option>}<option value="perAttack">1回の攻撃ダメージ</option>
            {hasDps && hasPeriodicDamage && <option value="combinedDps">合計DPS</option>}
          </select></label>
      </div>
      {comparison.errors.length > 0 && <div className="damage-two-unavailable damage-three-attribute-error" role="status">
        {comparison.errors.map(reason => <div key={reason}>{reason}</div>)}
      </div>}
      {comparison.samples.length > 0 && <ComparisonChart axisLabel={axis === 'defense' ? '敵の防御力' : '敵の術耐性'}
        metricLabel={`${METRIC_LABELS[activeMetric]}（1体）`} currentX={common[axis]} showPoints={false}
        showEndLabels={false} minHeight={270} fitYAxisLabels
        captionDetail={axis === 'defense' ? `敵の術耐性 ${NUMBER.format(common.resistance)} 固定` : `敵の防御力 ${NUMBER.format(common.defense)} 固定`}
        series={[
          { id: 'original', label: `本来（${originalLabel}）`, color: '#417b8c', points: comparison.samples.map(sample => ({ x: sample.x, value: sample.original[activeMetric] })) },
          { id: 'changed', label: `変更後（${changedLabel}）`, color: '#b4763e', points: comparison.samples.map(sample => ({ x: sample.x, value: sample.changed[activeMetric] })) },
        ]} />}
      <div className="damage-three-attribute-result-heading">
        <h3>現在の条件（1体）</h3><span>防御力 {formatNumber(common.defense)} · 術耐性 {formatNumber(common.resistance)} · 攻撃対象 {formatNumber(comparison.original.actualTargetCount)}体</span>
      </div>
      <DamageCalculatorThreeAttributeResultTable comparison={comparison} originalLabel={originalLabel} changedLabel={changedLabel} />
      <ElementalBuildupTable groups={[
        { label: `本来（${originalLabel}）`, values: comparison.original.errors.length ? [] : comparison.original.elementalBuildups },
        { label: `変更後（${changedLabel}）`, values: comparison.errors.length || comparison.changed?.errors.length ? [] : comparison.changed?.elementalBuildups ?? [] },
      ]} />
    </CollapsibleCalculatorPanel>}
  </section>
}

function AttributeButtons<T extends string>({ label, options, value, onChange }: {
  label: string; options: readonly (readonly [T, string])[]; value: T; onChange: (value: T) => void
}) {
  return <div className="calculator-field"><span>{label}</span>
    <div className="damage-three-attribute-segment" role="group" aria-label={label}>
      {options.map(([id, text]) => <button key={id} type="button" aria-pressed={value === id}
        onClick={() => onChange(id)}>{text}</button>)}
    </div>
  </div>
}

function formatNumber(value: number | null) {
  return value === null || !Number.isFinite(value) ? '—' : NUMBER.format(value)
}

export function DamageCalculatorThreeAttributeResultTable({ comparison, originalLabel, changedLabel }: {
  comparison: DamageThreeAttributeComparison; originalLabel: string; changedLabel: string
}) {
  const hasPeriodic = [comparison.original, comparison.changed].some(result => (result?.damageOverTimeDps ?? 0) > 0)
  const hasDps = comparison.original.output?.canShowDps ?? true
  const metrics: Metric[] = !hasDps ? ['perAttack'] : hasPeriodic ? ['perAttack', 'dps', 'combinedDps'] : ['perAttack', 'dps']
  return <div className="damage-two-table-wrap" role="region" aria-label="攻撃属性の比較結果（1体）" tabIndex={0}>
    <table className="damage-two-table damage-three-attribute-table"><thead><tr>
      <th scope="col">指標</th><th scope="col">本来（{originalLabel}）</th><th scope="col">変更後（{changedLabel}）</th><th scope="col">増減率</th>
    </tr></thead><tbody>{metrics.map(metric => {
      const original = comparison.original.errors.length ? null : comparison.original[metric]
      const changed = comparison.errors.length || !comparison.changed || comparison.changed.errors.length ? null : comparison.changed[metric]
      const rate = getDamageThreeAttributeChangeRate(original, changed)
      return <tr key={metric}><th scope="row">{METRIC_LABELS[metric]}</th><td>{formatNumber(original)}</td><td>{formatNumber(changed)}</td>
        <td>{rate === null ? '—' : `${rate > 0 ? '+' : ''}${NUMBER.format(rate)}%`}</td></tr>
    })}</tbody></table>
  </div>
}

export default DamageCalculatorThreeAttributePage
