import { useMemo, useState } from 'react'
import {
  getDamageThreeAttributeEntries, type DamageThreeAttributeEntry,
} from '../lib/damageCalculatorThreeAttributeComparison'
import {
  evaluateDamageThreeAttributeRankTable, evaluateDamageThreeAttributeTables,
  type DamageThreeAttributeRankRow, type DamageThreeAttributeTableRow,
} from '../lib/damageCalculatorThreeAttributeTables'
import type { DamageThreeComparisonOverrides } from '../lib/damageCalculatorThreeComparison'
import { buildDamageCalculatorThreeSkillInformation } from '../lib/damageCalculatorThreeSkillInformation'
import { buildEnemyDefenseResistanceBands } from '../lib/enemyDefenseResistance'
import { getEnemyRatingRanges } from '../lib/enemyStatRatings'
import type { GuardInput } from '../lib/guardCombatTypes'
import type { SkillStructureSelection } from '../lib/skillStructure'
import { useEnemyAggregation } from '../lib/useEnemyAggregation'
import type { SkillRecord } from '../types/skill'
import { AnalysisTabs } from './AnalysisTabs'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { GuardConditionFields } from './DamageCalculatorThree'
import {
  ComparisonTableImageDialog, type ComparisonTableImageSnapshot,
} from './ComparisonTableImageDialog'
import {
  DamageCalculatorThreeAttributeChartImageDialog, type DamageCalculatorThreeAttributeChartImageSnapshot,
} from './DamageCalculatorThreeAttributeChartImageDialog'
import { DamageCalculatorThreeAttributeRangeChart, DamageCalculatorThreeAttributeRangeLegend } from './DamageCalculatorThreeAttributeRangeChart'
import { DamageCalculatorThreeAttributeRankChart, DamageCalculatorThreeAttributeRankLegend } from './DamageCalculatorThreeAttributeRankChart'
import { EnemyAggregationSelector, EnemyAggregationStatus } from './EnemyAggregationSelector'
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
type ResultImage =
  | { view: 'table'; snapshot: ComparisonTableImageSnapshot }
  | { view: 'chart'; snapshot: DamageCalculatorThreeAttributeChartImageSnapshot }
const METRIC_LABELS: Record<Metric, string> = { perAttack: '1回の攻撃ダメージ', dps: 'DPS' }
const NUMBER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 })
const TABLE_NUMBER = new Intl.NumberFormat('ja-JP', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const TABLE_RATINGS = getEnemyRatingRanges('defense').map(({ rating }) => rating)
const COMPARISON_BASES = [['rating', 'ゲーム内評価'], ['rank', '出現順位']] as const
const RESULT_VIEWS = [['table', '表'], ['chart', 'グラフ']] as const
const RANK_CHART_TYPES = [['line', '折れ線グラフ'], ['bar', '集合棒グラフ']] as const
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
  const [applyPenetration, setApplyPenetration] = useState(true)
  const [overrides, setOverrides] = useState<DamageThreeComparisonOverrides>({})
  const [basis, setBasis] = useState<typeof COMPARISON_BASES[number][0]>('rating')
  const [resultView, setResultView] = useState<typeof RESULT_VIEWS[number][0]>('table')
  const [rankChartType, setRankChartType] = useState<typeof RANK_CHART_TYPES[number][0]>('line')
  const [image, setImage] = useState<ResultImage | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [filters, setFilters] = useState({ ...EMPTY_OPERATOR_FILTERS })
  const aggregation = useEnemyAggregation({ enabled: basis === 'rank' })
  const rankPairs = useMemo(() => aggregation.data
    ? buildEnemyDefenseResistanceBands(aggregation.data.rows, aggregation.data.counts).resistanceThresholds
    : null, [aggregation.data])
  const requested = selection ?? (entries.find(entry => entry.capability.supported) ?? entries[0])?.structure.basicInfo
  const stages = requested ? entries.filter(entry => sameSkill(entry, requested)) : []
  const selected = stages.find(entry => entry.stageId === stageId)
    ?? stages.find(entry => entry.capability.supported) ?? stages[0]
  const operator = selected?.skill
  const operatorSkills = uniqueSkills(entries.filter(entry => entry.skill.operatorId === requested?.operatorId))
  const level = operatorLevel ?? selected?.operatorLevel ?? 1
  const levelInvalid = !Number.isSafeInteger(level) || level < 1 || level > (selected?.operatorLevel ?? 1)
  const trustInvalid = !Number.isFinite(trust) || trust < 0 || trust > 100
  const comparison = useMemo(() => {
    if (!selected) return null
    const input = { entry: selected, enemyCount, overrides, operatorLevel: level, trust, disablePenetration: !applyPenetration }
    return basis === 'rank'
      ? { basis, result: evaluateDamageThreeAttributeRankTable(input, rankPairs ?? []) }
      : { basis, result: evaluateDamageThreeAttributeTables(input) }
  }, [selected, enemyCount, overrides, level, trust, applyPenetration, basis, rankPairs])
  const reference = comparison?.result.reference
  const output = reference?.output
  const errors = comparison?.result.errors ?? []
  const invalid = errors.length > 0
  const canSaveImage = comparison !== null && errors.length === 0
    && (comparison.basis === 'rating' || (resultView === 'chart'
      ? comparison.result.rows.some(row => row.physical !== null || row.arts !== null)
      : comparison.result.rows.length > 0))
  const conditionInputs: GuardInput[] = (reference?.fields ?? []).filter(field => !field.locked)
    .map(field => ({ ...field, defaultValue: field.value ?? (field.kind === 'number' ? Number.NaN : '') }))
  const growthConditions = selected ? [`昇進${selected.phaseIndex} Lv.${formatNumber(level)}`,
    `信頼${formatNumber(trust)}`, '潜在1', '未装備'] : []

  function openImage() {
    if (!selected || !comparison || !reference || !canSaveImage) return
    const penetrationConditions = applyPenetration ? [] : ['防御力・術耐性無視オフ']
    const conditions = [selected.structure.basicInfo.skillLevel, ...penetrationConditions, ...growthConditions, `敵${enemyCount}体`]
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
    const basisConditions = comparison.basis === 'rank' ? ['出現順位', `集計版 ${aggregation.selectedId}`] : ['ゲーム内評価']
    const notes = ['仮想比較', '主攻撃のみ', '1体あたり']
    const subject = `${selected.skill.operatorName} S${selected.skill.skillIndex}`
    if (resultView === 'chart') {
      const { skillLevel } = selected.structure.basicInfo
      const chartConditions = [skillLevel, ...basisConditions, ...(stages.length > 1 ? [selected.stageLabel] : []),
        ...(enemyCount > 1 ? [`敵${enemyCount}体`] : []), ...penetrationConditions, '主攻撃（1体あたり）']
      const title = `${subject} 属性比較グラフ（${METRIC_LABELS.perAttack}）`
      if (comparison.basis === 'rank') {
        const rows = structuredClone(comparison.result.rows)
        const chartType = rankChartType
        const chartLabel = chartType === 'bar' ? '集合棒グラフ' : '折れ線グラフ'
        setImage({ view: 'chart', snapshot: {
          title, axisTitle: '', conditions: chartConditions,
          filenameParts: [skillLevel, ...basisConditions, chartLabel, ...conditions.slice(1), ...notes],
          legend: <DamageCalculatorThreeAttributeRankLegend chartType={chartType} forImage />,
          chart: ({ height }) => <DamageCalculatorThreeAttributeRankChart rows={rows} chartType={chartType} imageHeight={height} />,
        } })
      } else {
        const { physical, arts } = structuredClone(comparison.result)
        setImage({ view: 'chart', snapshot: {
          title, conditions: chartConditions,
          filenameParts: [skillLevel, ...basisConditions, ...conditions.slice(1), ...notes],
          legend: <DamageCalculatorThreeAttributeRangeLegend forImage />,
          chart: ({ height }) => <DamageCalculatorThreeAttributeRangeChart physical={physical} arts={arts} imageHeight={height} />,
        } })
      }
      return
    }
    const table = comparison.basis === 'rank'
      ? <DamageCalculatorThreeAttributeRankTable rows={structuredClone(comparison.result.rows)} forImage />
      : <DamageCalculatorThreeAttributeTable physical={structuredClone(comparison.result.physical)}
          arts={structuredClone(comparison.result.arts)} metric="perAttack" forImage />
    setImage({ view: 'table', snapshot: {
      title: `${subject} 属性比較（${METRIC_LABELS.perAttack}）`,
      conditions: [...conditions, ...basisConditions, ...notes],
      filenameConditions: comparison.basis === 'rank' ? [...basisConditions, ...conditions, ...notes] : undefined,
      table,
    } })
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
      titleBadge="仮想比較 · 主攻撃のみ" summary={`${METRIC_LABELS.perAttack} · 1体あたり`} collapsedLabel="比較を表示">
      <div className="damage-three-attribute-context">
        <strong>{selected.skill.operatorName} S{selected.skill.skillIndex} · {selected.structure.basicInfo.skillLevel}</strong>
        <span>{growthConditions.join(' · ')}</span>
      </div>
      <div className="damage-three-attribute-toolbar">
        <AttributeButtons label="対応基準" options={COMPARISON_BASES} value={basis} onChange={setBasis} />
        {basis === 'rank' && <EnemyAggregationSelector state={aggregation} />}
        <AttributeButtons label="表示形式" options={RESULT_VIEWS} value={resultView} onChange={setResultView} />
        {basis === 'rank' && resultView === 'chart' && <AttributeButtons label="グラフの種類"
          options={RANK_CHART_TYPES} value={rankChartType} onChange={setRankChartType} />}
      </div>
      <div className="damage-three-attribute-toolbar">
        <strong className="damage-three-attribute-fixed-metric">{METRIC_LABELS.perAttack}</strong>
        <span className="damage-three-attribute-target">1体あたり</span>
        <label className="damage-three-attribute-penetration-toggle">
          <input type="checkbox" checked={applyPenetration} onChange={event => setApplyPenetration(event.target.checked)} />
          防御力・術耐性無視を適用
        </label>
        <button type="button" className="button secondary damage-three-attribute-image-button"
          aria-label={resultView === 'chart' ? '属性比較グラフをPNG画像で保存' : '属性比較表をPNG画像で保存'}
          aria-haspopup="dialog" disabled={!canSaveImage} onClick={openImage}>画像を保存</button>
      </div>
      {errors.length > 0 && <div className="damage-two-unavailable damage-three-attribute-error" role="status">
        {errors.map(reason => <div key={reason}>{reason}</div>)}
      </div>}
      {comparison.basis === 'rating' && (resultView === 'chart'
        ? <DamageCalculatorThreeAttributeRangeChart physical={comparison.result.physical} arts={comparison.result.arts} invalid={invalid} />
        : <DamageCalculatorThreeAttributeTable physical={comparison.result.physical} arts={comparison.result.arts}
          metric="perAttack" invalid={invalid} />)}
      {comparison.basis === 'rank' && <>
        <EnemyAggregationStatus state={aggregation} />
        {comparison.result.rows.length > 0 && (resultView === 'chart'
          ? <DamageCalculatorThreeAttributeRankChart rows={comparison.result.rows} chartType={rankChartType} />
          : <DamageCalculatorThreeAttributeRankTable rows={comparison.result.rows} />)}
        {rankPairs?.length === 0 && <p role="status">集計対象の出現データがありません。</p>}
      </>}
    </CollapsibleCalculatorPanel>}
    {image?.view === 'table' && <ComparisonTableImageDialog snapshot={image.snapshot} onClose={() => setImage(null)} />}
    {image?.view === 'chart' && <DamageCalculatorThreeAttributeChartImageDialog snapshot={image.snapshot} onClose={() => setImage(null)} />}
  </section>
}

export function AttributeButtons<T extends string>({ label, options, value, onChange }: {
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

function DamageCalculatorThreeAttributeRankTable({ rows, forImage = false }: {
  rows: readonly DamageThreeAttributeRankRow[]; forImage?: boolean
}) {
  const label = '出現順位で対応した1回の攻撃ダメージ（1体あたり）'
  const table = <table className={`damage-two-table damage-three-attribute-table damage-three-attribute-rank-table${forImage ? ' damage-three-attribute-table-image' : ''}`}
    aria-label={label}>
    <thead><tr>
      <th scope="col">術耐性</th><th scope="col">対応する防御力</th><th scope="col">物理</th><th scope="col">術</th>
    </tr></thead>
    <tbody>{rows.map(({ resistance, defense, physical, arts }) => <tr key={resistance}>
      <th scope="row" className="damage-three-attribute-rating-cell" data-table-image-number>{formatNumber(resistance)}</th>
      <td data-table-image-number>{formatNumber(defense)}</td>
      <td data-table-image-number>{physical === null ? '—' : TABLE_NUMBER.format(physical)}</td>
      <td data-table-image-number>{arts === null ? '—' : TABLE_NUMBER.format(arts)}</td>
    </tr>)}</tbody>
  </table>
  return forImage ? table : <div className="damage-two-table-wrap" role="region" aria-label="出現順位の属性比較表" tabIndex={0}>
    {table}
  </div>
}

export function DamageCalculatorThreeAttributeTable({ physical, arts, metric, invalid = false, forImage = false }: {
  physical: readonly DamageThreeAttributeTableRow[]; arts: readonly DamageThreeAttributeTableRow[]
  metric: Metric; invalid?: boolean; forImage?: boolean
}) {
  const physicalByRating = new Map(physical.map(row => [row.rating, row]))
  const artsByRating = new Map(arts.map(row => [row.rating, row]))
  const ratings = TABLE_RATINGS.filter(rating => physicalByRating.has(rating) || artsByRating.has(rating))
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
      <tbody>{ratings.map(rating => <tr key={rating}>
        <th className="damage-three-attribute-rating-cell" scope="row">{rating}</th>
        <AttributeGradeCells row={physicalByRating.get(rating)} metric={metric} invalid={invalid} />
        <AttributeGradeCells row={artsByRating.get(rating)} metric={metric} invalid={invalid} />
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
