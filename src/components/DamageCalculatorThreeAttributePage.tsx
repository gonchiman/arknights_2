import { useMemo, useState } from 'react'
import {
  getDamageThreeAttributeEntries, type DamageThreeAttributeEntry,
} from '../lib/damageCalculatorThreeAttributeComparison'
import { evaluateDamageThreeAttributeTables, type DamageThreeAttributeTableRow } from '../lib/damageCalculatorThreeAttributeTables'
import type { DamageThreeComparisonOverrides } from '../lib/damageCalculatorThreeComparison'
import { buildDamageCalculatorThreeSkillInformation } from '../lib/damageCalculatorThreeSkillInformation'
import type { GuardInput } from '../lib/guardCombatTypes'
import type { SkillStructureSelection } from '../lib/skillStructure'
import type { SkillRecord } from '../types/skill'
import { AnalysisTabs } from './AnalysisTabs'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { GuardConditionFields } from './DamageCalculatorThree'
import {
  DamageCalculatorThreeAttributeImageDialog, type DamageCalculatorThreeAttributeImageSnapshot,
} from './DamageCalculatorThreeAttributeImageDialog'
import { DamageCalculatorThreeAttributeRangeChart } from './DamageCalculatorThreeAttributeRangeChart'
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

type Metric = 'perAttack' | 'dps'
type ResultView = 'table' | 'chart'
const METRIC_LABELS: Record<Metric, string> = { perAttack: '1回の攻撃ダメージ', dps: 'DPS' }
const NUMBER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 })
const TABLE_NUMBER = new Intl.NumberFormat('ja-JP', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
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
  const [enemyCount, setEnemyCount] = useState(1)
  const [overrides, setOverrides] = useState<DamageThreeComparisonOverrides>({})
  const [metric, setMetric] = useState<Metric>('dps')
  const [resultView, setResultView] = useState<ResultView>('table')
  const [image, setImage] = useState<DamageCalculatorThreeAttributeImageSnapshot | null>(null)
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
  const comparison = useMemo(() => selected ? evaluateDamageThreeAttributeTables({
    entry: selected, enemyCount, overrides, operatorLevel: level, trust,
  }) : null, [selected, enemyCount, overrides, level, trust])
  const output = comparison?.reference.output
  const conditionInputs: GuardInput[] = (comparison?.reference.fields ?? []).filter(field => !field.locked)
    .map(field => ({ ...field, defaultValue: field.value ?? (field.kind === 'number' ? Number.NaN : '') }))
  const hasDps = comparison?.canShowDps ?? false
  const activeMetric = hasDps ? metric : 'perAttack'
  const growthConditions = selected ? [`昇進${selected.phaseIndex} Lv.${formatNumber(level)}`,
    `信頼${formatNumber(trust)}`, '潜在1', '未装備'] : []

  function openImage() {
    if (!selected || !comparison || comparison.errors.length > 0) return
    const { reference, physical, arts } = comparison
    const conditions = [selected.structure.basicInfo.skillLevel, ...growthConditions, `敵${enemyCount}体`]
    if (reference.actualTargetCount !== null && reference.actualTargetCount !== enemyCount) {
      conditions.push(`攻撃対象${reference.actualTargetCount}体`)
    }
    if (stages.length > 1) conditions.push(selected.stageLabel)
    for (const field of conditionInputs) {
      const value = field.defaultValue
      const label = field.options?.find(option => option.value === value)?.label
        ?? (typeof value === 'boolean' ? value ? 'あり' : 'なし' : String(value))
      conditions.push(`${field.label} ${label}`)
    }
    conditions.push('ゲーム内評価', '仮想比較', '主攻撃のみ', '1体あたり')
    setImage({
      title: `${selected.skill.operatorName} S${selected.skill.skillIndex} 属性比較（${METRIC_LABELS[activeMetric]}）`,
      conditions,
      table: <DamageCalculatorThreeAttributeTable {...structuredClone({ physical, arts })} metric={activeMetric} forImage />,
    })
  }

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
          <label className="calculator-field"><span>敵の数</span>
            <input type="number" aria-label="敵の数" min={1} max={10000} step={1} value={Number.isFinite(enemyCount) ? enemyCount : ''}
              aria-invalid={!Number.isSafeInteger(enemyCount) || enemyCount < 1 || enemyCount > 10000 || undefined}
              onChange={event => setEnemyCount(event.target.valueAsNumber)} /></label>
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
      titleBadge="仮想比較 · 主攻撃のみ" summary={`${METRIC_LABELS[activeMetric]} · 1体あたり`} collapsedLabel="比較を表示">
      <div className="damage-three-attribute-context">
        <strong>{selected.skill.operatorName} S{selected.skill.skillIndex} · {selected.structure.basicInfo.skillLevel}</strong>
        <span>{growthConditions.join(' · ')}</span>
      </div>
      <div className="damage-three-attribute-toolbar">
        <AttributeButtons label="表示形式" options={[["table", "表"], ["chart", "グラフ"]]}
          value={resultView} onChange={setResultView} />
        {hasDps ? <AttributeButtons label="表示指標" options={[["dps", "DPS"], ["perAttack", "1回の攻撃ダメージ"]]}
          value={activeMetric} onChange={setMetric} /> : <strong className="damage-three-attribute-fixed-metric">1回の攻撃ダメージ</strong>}
        <span className="damage-three-attribute-target">1体あたり</span>
        {resultView === 'table' && <button type="button" className="button secondary damage-three-attribute-image-button"
          aria-label="属性比較表をPNG画像で保存" aria-haspopup="dialog"
          disabled={comparison.errors.length > 0} onClick={openImage}>画像を保存</button>}
      </div>
      {comparison.errors.length > 0 && <div className="damage-two-unavailable damage-three-attribute-error" role="status">
        {comparison.errors.map(reason => <div key={reason}>{reason}</div>)}
      </div>}
      {resultView === 'table'
        ? <DamageCalculatorThreeAttributeTable physical={comparison.physical} arts={comparison.arts}
          metric={activeMetric} invalid={comparison.errors.length > 0} />
        : <DamageCalculatorThreeAttributeRangeChart physical={comparison.physical} arts={comparison.arts}
          metric={activeMetric} invalid={comparison.errors.length > 0} />}
    </CollapsibleCalculatorPanel>}
    {image && <DamageCalculatorThreeAttributeImageDialog snapshot={image} onClose={() => setImage(null)} />}
  </section>
}

function AttributeButtons<T extends string>({ label, options, value, onChange }: {
  label: string; options: readonly (readonly [T, string])[]; value: T; onChange: (value: T) => void
}) {
  return <div className="damage-three-attribute-segment" role="group" aria-label={label}>
    {options.map(([id, text]) => <button key={id} type="button" aria-pressed={value === id}
      onClick={() => onChange(id)}>{text}</button>)}
  </div>
}

function formatNumber(value: number | null) {
  return value === null || !Number.isFinite(value) ? '—' : NUMBER.format(value)
}

export function DamageCalculatorThreeAttributeTable({ physical, arts, metric, invalid = false, forImage = false }: {
  physical: readonly DamageThreeAttributeTableRow[]; arts: readonly DamageThreeAttributeTableRow[]
  metric: Metric; invalid?: boolean; forImage?: boolean
}) {
  const artsByRating = new Map(arts.map(row => [row.rating, row]))
  const table = <table className={`damage-two-table damage-three-attribute-table${forImage ? ' damage-three-attribute-table-image' : ''}`}
    aria-label={`${METRIC_LABELS[metric]}の属性比較（1体あたり）`}>
      <colgroup><col className="damage-three-attribute-rating-column" /></colgroup>
      <colgroup><col className="damage-three-attribute-axis-column" /><col /><col /></colgroup>
      <colgroup><col className="damage-three-attribute-axis-column" /><col /><col /></colgroup>
      <thead>
        <tr>
          <th className="damage-three-attribute-rating-cell" scope="col" rowSpan={2}>評価</th>
          <th scope="colgroup" colSpan={3}>物理</th><th scope="colgroup" colSpan={3}>術</th>
        </tr>
        <tr>
          <th scope="col">防御力</th><th scope="col">最小</th><th scope="col">最大</th>
          <th scope="col">術耐性</th><th scope="col">最小</th><th scope="col">最大</th>
        </tr>
      </thead>
      <tbody>{physical.map(row => <tr key={row.rating}>
        <th className="damage-three-attribute-rating-cell" scope="row">{row.rating}</th>
        <AttributeGradeCells row={row} metric={metric} invalid={invalid} />
        <AttributeGradeCells row={artsByRating.get(row.rating)} metric={metric} invalid={invalid} />
      </tr>)}</tbody>
    </table>
  return forImage ? table : <div className="damage-two-table-wrap" role="region" aria-label="属性比較表（1体あたり）" tabIndex={0}>
    {table}
  </div>
}

function AttributeGradeCells({ row, metric, invalid }: {
  row?: DamageThreeAttributeTableRow; metric: Metric; invalid: boolean
}) {
  if (!row) return <><td>—</td><td>—</td><td>—</td></>
  const { minStat, maxStat } = row
  const min = formatNumber(minStat)
  const axisRange = maxStat === null ? `${min}以上` : minStat === maxStat ? min : `${min}〜${formatNumber(maxStat)}`
  const range = row[metric]
  const damage = !invalid && range && Number.isFinite(range.min) && Number.isFinite(range.max) ? range : null
  const minimum = damage ? TABLE_NUMBER.format(damage.min) : '—'
  return <>
    <td>{axisRange}</td>
    {damage && damage.min === damage.max ? <td colSpan={2} data-table-image-number="true">{minimum}</td> : <>
      <td data-table-image-number="true">{minimum}</td>
      <td data-table-image-number="true">{damage ? TABLE_NUMBER.format(damage.max) : '—'}</td>
    </>}
  </>
}

export default DamageCalculatorThreeAttributePage
