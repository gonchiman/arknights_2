import { useId, useMemo, useRef, useState, useTransition, type FormEvent } from 'react'
import type { SkillRecord } from '../types/skill'
import type { NumericStatistics } from '../lib/enemyStatistics'
import { getProfessionLabel, PROFESSION_ORDER } from '../lib/operatorFilters'
import { formatSkillStructureSpRecovery } from '../lib/skillStructure'
import { buildSkillNumericScatter } from '../lib/skillNumericScatter'
import {
  buildSkillNumericDataset, DEFAULT_SKILL_NUMERIC_CONFIG, SKILL_NUMERIC_DURATION_LABELS, SKILL_NUMERIC_METRICS, SKILL_NUMERIC_SP_RECOVERIES,
  summarizeSkillNumericMetric,
  type SkillNumericConfig, type SkillNumericDataset, type SkillNumericMetric, type SkillNumericObservation,
} from '../lib/skillNumericStatistics'
import { AnalysisTabPanel } from './AnalysisTabs'
import { NumericDistributionChart } from './NumericDistributionChart'
import { NumericScatterChart } from './NumericScatterChart'
import { PageLayout, PageOutputHeader, PageOutputTabs } from './PageLayout'
import { PageViewSwitch, viewLabel } from './PageViewSwitch'
import { SkillEffectModal } from './SkillEffectModal'
import { TableSortHeader, type TableSort } from './TableSortHeader'
import './SkillNumericStatisticsPage.css'

interface Props {
  rows: readonly SkillRecord[]
  loading: boolean
  error?: string | null
}

const TABS = [['summary', '統計量'], ['distribution', '分布'], ['scatter', '散布図'], ['skills', 'スキル一覧']] as const
const VIEWS = [['histogram', 'ヒストグラム'], ['boxplot', '箱ひげ図'], ['qq', '正規Q–Qプロット']] as const
const POINT_MODES = [['count', '件数を大きさで表示'], ['overplot', '半透明の点を重ねる']] as const
const STAT_COLUMNS = [
  ['minimum', '最小'], ['firstQuartile', 'Q1'], ['median', '中央値'], ['mean', '平均'],
  ['thirdQuartile', 'Q3'], ['maximum', '最大'], ['standardDeviation', '標準偏差'],
] as const
const NUMBER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 })
const COUNT = new Intl.NumberFormat('ja-JP')
const ESTIMATE = new Intl.NumberFormat('ja-JP', { maximumSignificantDigits: 4 })
type Tab = typeof TABS[number][0]
type DistributionView = typeof VIEWS[number][0]
type ScatterPointMode = typeof POINT_MODES[number][0]
type Summary = ReturnType<typeof summarizeSkillNumericMetric>
type SortKey = 'operator' | 'skillIndex' | 'skillName' | 'durationSeconds' | 'spCost' | 'initialSp' | 'spGap'

function formatNumber(value: number | null | undefined) {
  return value !== null && value !== undefined && Number.isFinite(value) ? NUMBER.format(value) : '—'
}

function sameConfig(left: SkillNumericConfig, right: SkillNumericConfig) {
  return left.profession === right.profession && left.rarity === right.rarity
    && left.spRecovery === right.spRecovery && left.skillLevel === right.skillLevel
}

function getSkillName(observation: SkillNumericObservation) {
  return observation.skill.skillLevels[observation.skillLevelIndex]?.name ?? observation.skill.skillName
}

export function SkillNumericStatisticsPage({ rows, loading, error }: Props) {
  const id = useId()
  const [tab, setTab] = useState<Tab>('summary')
  const [metric, setMetric] = useState<SkillNumericMetric>('duration')
  const [view, setView] = useState<DistributionView>('histogram')
  const [scatterAxes, setScatterAxes] = useState<{ x: SkillNumericMetric; y: SkillNumericMetric }>({ x: 'spCost', y: 'duration' })
  const [pointMode, setPointMode] = useState<ScatterPointMode>('count')
  const [showFit, setShowFit] = useState(true)
  const [draft, setDraft] = useState<SkillNumericConfig>(() => ({ ...DEFAULT_SKILL_NUMERIC_CONFIG }))
  const [applied, setApplied] = useState<SkillNumericConfig>(() => ({ ...DEFAULT_SKILL_NUMERIC_CONFIG }))
  const [busy, startTransition] = useTransition()
  const [selectedSkill, setSelectedSkill] = useState<SkillNumericObservation | null>(null)
  const skillOpener = useRef<HTMLButtonElement | null>(null)
  const pending = !sameConfig(draft, applied)
  const calculation = useMemo(() => {
    if (loading || error) return { dataset: null, error: null }
    try { return { dataset: buildSkillNumericDataset(rows, applied), error: null } }
    catch (caught) {
      return { dataset: null, error: caught instanceof Error ? caught.message : 'スキルの数値を集計できませんでした。' }
    }
  }, [rows, applied, loading, error])
  const dataset = calculation.dataset
  const summaries = useMemo(() => dataset
    ? SKILL_NUMERIC_METRICS.map(definition => summarizeSkillNumericMetric(dataset, definition.key)) : [], [dataset])
  const activeSummary = summaries.find(summary => summary.metric === metric)
  const activeMetric = SKILL_NUMERIC_METRICS.find(definition => definition.key === metric)!
  const sourceError = error || calculation.error
  const professions = PROFESSION_ORDER.filter(profession => rows.some(row => row.profession === profession))
  const rarities = [...new Set(rows.map(row => row.rarity))].sort((left, right) => right - left)
  const status = loading ? '読み込み中…' : busy ? '集計中…' : pending ? '未反映' : dataset ? '集計済み' : ''
  const durationCounts = useMemo(() => {
    if (!dataset) return []
    return Object.entries(SKILL_NUMERIC_DURATION_LABELS)
      .filter(([state]) => state !== 'FIXED_DURATION')
      .map(([state, label]) => ({ label, count: dataset.observations.filter(observation => observation.durationState === state).length }))
      .filter(item => item.count > 0)
  }, [dataset])

  function changeDraft<Key extends keyof SkillNumericConfig>(key: Key, value: SkillNumericConfig[Key]) {
    setDraft(current => ({ ...current, [key]: value }))
  }

  function applyConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    startTransition(() => setApplied({ ...draft }))
  }

  function closeSkill() {
    setSelectedSkill(null)
    requestAnimationFrame(() => {
      if (skillOpener.current?.isConnected) skillOpener.current.focus()
    })
  }

  const settings = <form className="skill-numeric-settings" onSubmit={applyConfig}>
    <section aria-labelledby={`${id}-conditions`}>
      <PageOutputHeader segments={['集計条件']}><h2 id={`${id}-conditions`}>集計条件</h2></PageOutputHeader>
      <div className="skill-numeric-fields">
        <label><span>職業</span><select value={draft.profession} disabled={loading || busy}
          onChange={event => changeDraft('profession', event.target.value)}>
          <option value="ALL">すべて</option>
          {professions.map(profession => <option value={profession} key={profession}>{getProfessionLabel(profession)}</option>)}
        </select></label>
        <label><span>レアリティ</span><select value={draft.rarity} disabled={loading || busy}
          onChange={event => changeDraft('rarity', event.target.value === 'ALL' ? 'ALL' : Number(event.target.value))}>
          <option value="ALL">すべて</option>
          {rarities.map(rarity => <option value={rarity} key={rarity}>★{rarity}</option>)}
        </select></label>
        <label><span>SP回復</span><select value={draft.spRecovery} disabled={loading || busy}
          onChange={event => changeDraft('spRecovery', event.target.value as SkillNumericConfig['spRecovery'])}>
          {SKILL_NUMERIC_SP_RECOVERIES.map(recovery => <option value={recovery} key={recovery}>{formatSkillStructureSpRecovery(recovery)}</option>)}
        </select></label>
        <label><span>スキルLv</span><select value={draft.skillLevel} disabled={loading || busy}
          onChange={event => changeDraft('skillLevel', event.target.value as SkillNumericConfig['skillLevel'])}>
          <option value="MAX">最高Lv</option><option value="RANK_7">Lv.7</option>
        </select></label>
      </div>
      <div className="skill-numeric-actions">
        <button type="submit" className="button" disabled={loading || busy || Boolean(error)}>{busy ? '集計中…' : '集計する'}</button>
        <span className="skill-numeric-condition">1スキル1件・スキルデータ値</span>
        <span className={`skill-numeric-status${pending ? ' pending' : ''}`} role="status">{status}</span>
      </div>
    </section>
  </form>

  return <PageLayout page="skill-numeric-statistics" settings={settings} className="skill-numeric-page">
    {sourceError && <p role="alert" className="skill-numeric-error">{sourceError}</p>}
    {dataset && <>
      <PageOutputTabs idPrefix={id} tabs={TABS} activeTab={tab} onChange={setTab} label="分析項目"
        format={tab === 'distribution' ? viewLabel(VIEWS, view) : undefined} />
      <AnalysisTabPanel idPrefix={id} tab={tab} activeTab={tab}>
        <div className="skill-numeric-result" aria-busy={busy}>
          {tab === 'summary' && <>
            <div className="skill-numeric-toolbar"><span className="skill-numeric-count">対象 {COUNT.format(dataset.observations.length)}件</span></div>
            <SkillNumericSummaryTable summaries={summaries} />
          </>}
          {tab === 'distribution' && activeSummary && <>
            <div className="skill-numeric-toolbar">
              <label className="skill-numeric-inline-label">指標<select value={metric}
                onChange={event => setMetric(event.target.value as SkillNumericMetric)}>
                {SKILL_NUMERIC_METRICS.map(definition => <option value={definition.key} key={definition.key}>{definition.label}</option>)}
              </select></label>
              <PageViewSwitch views={VIEWS} selected={view} onChange={setView} label="分布の表示形式" />
              <span className="skill-numeric-count">有効 {COUNT.format(activeSummary.validCount)}件 ／ 対象外 {COUNT.format(activeSummary.excludedCount)}件</span>
            </div>
            <SkillNumericStatisticStrip statistics={activeSummary.statistics} label={activeMetric.label} />
            <NumericDistributionChart statistics={activeSummary.statistics} boxPlot={activeSummary.boxPlot} values={activeSummary.values}
              metricLabel={activeMetric.label} unit={view === 'qq' || activeMetric.unit === '秒' ? activeMetric.unit : undefined} view={view} />
            {metric === 'duration' && durationCounts.length > 0 && <dl className="skill-numeric-exclusions" aria-label="持続時間の対象外">
              {durationCounts.map(item => <div key={item.label}><dt>{item.label}</dt><dd>{COUNT.format(item.count)}件</dd></div>)}
            </dl>}
          </>}
          {tab === 'scatter' && <SkillNumericScatterPanel dataset={dataset} xMetric={scatterAxes.x} yMetric={scatterAxes.y}
            pointMode={pointMode} showFit={showFit} onShowFitChange={setShowFit} onAxisChange={(axis, nextMetric) => setScatterAxes(current => {
              const other = axis === 'x' ? 'y' : 'x'
              return current[other] === nextMetric ? current : { ...current, [axis]: nextMetric }
            })} onSwap={() => setScatterAxes(current => ({ x: current.y, y: current.x }))} onPointModeChange={setPointMode} />}
          {tab === 'skills' && <>
            <div className="skill-numeric-toolbar"><span className="skill-numeric-count">対象 {COUNT.format(dataset.observations.length)}件</span></div>
            <SkillNumericObservationTable observations={dataset.observations} onOpenSkill={(observation, opener) => {
              skillOpener.current = opener
              setSelectedSkill(observation)
            }} />
          </>}
          {dataset.unavailableLevelCount > 0 && <p className="skill-numeric-unavailable" role="status">
            指定Lvなし（SP回復絞り込み前） {COUNT.format(dataset.unavailableLevelCount)}件
          </p>}
        </div>
      </AnalysisTabPanel>
    </>}
    {selectedSkill && <SkillEffectModal skill={selectedSkill.skill} skillLevelIndex={selectedSkill.skillLevelIndex} onClose={closeSkill} />}
  </PageLayout>
}

export function SkillNumericScatterPanel({ dataset, xMetric, yMetric, pointMode, showFit, onShowFitChange, onAxisChange, onSwap, onPointModeChange }: {
  dataset: SkillNumericDataset
  xMetric: SkillNumericMetric
  yMetric: SkillNumericMetric
  pointMode: ScatterPointMode
  showFit: boolean
  onShowFitChange: (showFit: boolean) => void
  onAxisChange: (axis: 'x' | 'y', metric: SkillNumericMetric) => void
  onSwap: () => void
  onPointModeChange: (mode: ScatterPointMode) => void
}) {
  const analysis = useMemo(() => buildSkillNumericScatter(dataset, xMetric, yMetric), [dataset, xMetric, yMetric])
  const label = (metric: SkillNumericMetric) => {
    const definition = SKILL_NUMERIC_METRICS.find(item => item.key === metric)!
    return `${definition.label}${definition.unit === '秒' ? '（秒）' : ''}`
  }
  return <div className="skill-numeric-scatter">
    <div className="skill-numeric-scatter-controls">
      <label className="skill-numeric-x-field"><span>横軸</span><select value={xMetric}
        onChange={event => onAxisChange('x', event.target.value as SkillNumericMetric)}>
        {SKILL_NUMERIC_METRICS.map(definition => <option key={definition.key} value={definition.key}
          disabled={definition.key === yMetric}>{definition.label}</option>)}
      </select></label>
      <button type="button" className="button skill-numeric-swap" aria-label="軸を入れ替える" onClick={onSwap}>⇄</button>
      <label className="skill-numeric-y-field"><span>縦軸</span><select value={yMetric}
        onChange={event => onAxisChange('y', event.target.value as SkillNumericMetric)}>
        {SKILL_NUMERIC_METRICS.map(definition => <option key={definition.key} value={definition.key}
          disabled={definition.key === xMetric}>{definition.label}</option>)}
      </select></label>
      <label className="skill-numeric-point-field"><span>点の表示</span><select value={pointMode}
        onChange={event => onPointModeChange(event.target.value as ScatterPointMode)}>
        {POINT_MODES.map(([value, name]) => <option value={value} key={value}>{name}</option>)}
      </select></label>
    </div>
    <div className="skill-numeric-scatter-readout">
      <label className="skill-numeric-inline-label skill-numeric-fit-toggle"><input type="checkbox" checked={showFit}
        onChange={event => onShowFitChange(event.target.checked)} />回帰線</label>
      <dl className="skill-numeric-correlation"><div><dt>Pearson r</dt><dd>
        {analysis.correlation === null ? '—' : ESTIMATE.format(analysis.correlation)}
      </dd></div><div><dt>R²</dt><dd>
        {analysis.fit && analysis.fit.rSquared !== null ? ESTIMATE.format(analysis.fit.rSquared) : '—'}
      </dd></div></dl>
      <span className="skill-numeric-count" role="status">有効 {COUNT.format(analysis.validCount)}件 ／ 対象外 {COUNT.format(analysis.excludedCount)}件</span>
    </div>
    <NumericScatterChart points={analysis.points} xLabel={label(xMetric)} yLabel={label(yMetric)} pointMode={pointMode}
      fit={analysis.fit} showFit={showFit} />
    {showFit && analysis.fit && <p className="skill-numeric-equation" aria-label="回帰式">
      {label(yMetric)} = {ESTIMATE.format(analysis.fit.slope)} × {label(xMetric)} {analysis.fit.intercept < 0 ? '−' : '+'} {ESTIMATE.format(Math.abs(analysis.fit.intercept))}
    </p>}
  </div>
}

export function SkillNumericSummaryTable({ summaries }: { summaries: readonly Summary[] }) {
  return <div className="skill-numeric-table-scroll" role="region" tabIndex={0} aria-label="各指標の統計量">
    <table className="skill-numeric-table skill-numeric-summary-table">
      <thead><tr><th scope="col">指標</th><th scope="col">有効</th><th scope="col">対象外</th>
        {STAT_COLUMNS.map(([key, label]) => <th scope="col" key={key}>{label}</th>)}
      </tr></thead>
      <tbody>{summaries.map(summary => {
        const definition = SKILL_NUMERIC_METRICS.find(item => item.key === summary.metric)!
        return <tr key={summary.metric}>
          <th scope="row">{definition.label}{definition.unit === '秒' ? `（${definition.unit}）` : ''}</th>
          <td>{COUNT.format(summary.validCount)}</td><td>{COUNT.format(summary.excludedCount)}</td>
          {STAT_COLUMNS.map(([key]) => <td key={key}>{formatNumber(summary.statistics[key])}</td>)}
        </tr>
      })}</tbody>
    </table>
  </div>
}

export function SkillNumericStatisticStrip({ statistics, label }: { statistics: NumericStatistics; label: string }) {
  return <div className="skill-numeric-table-scroll" role="region" tabIndex={0} aria-label={`${label}の統計量`}>
    <table className="skill-numeric-table skill-numeric-statistic-strip">
      <thead><tr>{STAT_COLUMNS.map(([key, name]) => <th scope="col" key={key}>{name}</th>)}</tr></thead>
      <tbody><tr>{STAT_COLUMNS.map(([key]) => <td key={key}>{formatNumber(statistics[key])}</td>)}</tr></tbody>
    </table>
  </div>
}

export function SkillNumericObservationTable({ observations, onOpenSkill }: {
  observations: readonly SkillNumericObservation[]
  onOpenSkill: (observation: SkillNumericObservation, opener: HTMLButtonElement) => void
}) {
  const [sort, setSort] = useState<TableSort<SortKey>>({ key: 'operator', direction: 'asc' })
  const ordered = useMemo(() => [...observations].sort((left, right) => {
    const value = (observation: SkillNumericObservation): string | number | null => {
      if (sort.key === 'operator') return observation.skill.operatorName
      if (sort.key === 'skillIndex') return observation.skill.skillIndex
      if (sort.key === 'skillName') return getSkillName(observation)
      return observation[sort.key]
    }
    const a = value(left), b = value(right)
    if (a === null) return b === null ? left.id.localeCompare(right.id) : 1
    if (b === null) return -1
    const comparison = typeof a === 'string' && typeof b === 'string' ? a.localeCompare(b, 'ja') : Number(a) - Number(b)
    return comparison === 0 ? left.id.localeCompare(right.id) : comparison * (sort.direction === 'asc' ? 1 : -1)
  }), [observations, sort])
  const onSort = (key: SortKey) => setSort(current => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' }))
  const columns: readonly (readonly [SortKey, string])[] = [
    ['operator', 'オペレーター'], ['skillIndex', 'S'], ['skillName', 'スキル名'], ['durationSeconds', '持続（秒）'],
    ['spCost', '必要SP'], ['initialSp', '初期SP'], ['spGap', '必要SP−初期SP'],
  ]
  return <div className="skill-numeric-table-scroll" role="region" tabIndex={0} aria-label="スキルの数値">
    <table className="skill-numeric-table skill-numeric-observation-table">
      <thead><tr>{columns.map(([key, label]) => <TableSortHeader key={key} label={label} sortKey={key} sort={sort} onSort={onSort}
        ariaLabel={`${label}で並べ替え`} />)}</tr></thead>
      <tbody>{ordered.length === 0 ? <tr><td colSpan={columns.length} className="skill-numeric-empty">対象のスキルは0件です。</td></tr>
        : ordered.map(observation => <tr key={observation.id}>
          <th scope="row"><button type="button" className="skill-numeric-skill-button"
            aria-label={`${observation.skill.operatorName} S${observation.skill.skillIndex} ${getSkillName(observation)}のスキル効果を表示`}
            onClick={event => onOpenSkill(observation, event.currentTarget)}>{observation.skill.operatorName}</button></th>
          <td className="skill-numeric-index">S{observation.skill.skillIndex}</td>
          <td className="skill-numeric-name">{getSkillName(observation)}</td>
          <td>{observation.durationSeconds === null ? SKILL_NUMERIC_DURATION_LABELS[observation.durationState] : formatNumber(observation.durationSeconds)}</td>
          <td>{formatNumber(observation.spCost)}</td><td>{formatNumber(observation.initialSp)}</td><td>{formatNumber(observation.spGap)}</td>
        </tr>)}
      </tbody>
    </table>
  </div>
}

export default SkillNumericStatisticsPage
