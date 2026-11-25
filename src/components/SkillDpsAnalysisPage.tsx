import { useId, useMemo, useRef, useState, useTransition, type FormEvent } from 'react'
import type { SkillRecord } from '../types/skill'
import { getProfessionLabel, PROFESSION_ORDER } from '../lib/operatorFilters'
import { formatSkillStructureSpRecovery } from '../lib/skillStructure'
import {
  analyzeSkillDps, buildSkillDpsAnalysisDataset, DEFAULT_SKILL_DPS_ANALYSIS_CONFIG,
  getSkillDpsAnalysisAxisValue, SKILL_DPS_ANALYSIS_AXES, SKILL_DPS_ANALYSIS_X_LABELS,
  type SkillDpsAnalysisAxis, type SkillDpsAnalysisConfig, type SkillDpsAnalysisMetric,
  type SkillDpsDamageType, type SkillDpsObservation, type SkillDpsSpRecovery,
} from '../lib/skillDpsAnalysis'
import { getSkillDpsAnalysisConditionLabels, type SkillDpsChartImageSnapshot } from '../lib/skillDpsChartImage'
import type { SkillDpsRegressionPredictor } from '../lib/skillDpsMultipleRegression'
import { buildSkillDpsTargetGroups } from '../lib/skillDpsTargetGroups'
import { AnalysisTabPanel } from './AnalysisTabs'
import { PageLayout, PageOutputHeader, PageOutputTabs } from './PageLayout'
import { PageViewSwitch, TABLE_CHART_VIEWS, viewLabel, type TableChartView } from './PageViewSwitch'
import { SkillDpsAnalysisChart } from './SkillDpsAnalysisChart'
import { SkillDpsAnalysisImageDialog } from './SkillDpsAnalysisImageDialog'
import { SkillDpsAnalysisOverview } from './SkillDpsAnalysisOverview'
import { SkillDpsCombinationEvaluation } from './SkillDpsCombinationEvaluation'
import { SkillDpsMultipleRegression, type SkillDpsRegressionSelection } from './SkillDpsMultipleRegression'
import { SkillDpsTargetBoxplot } from './SkillDpsTargetBoxplot'
import { TableSortHeader, type TableSort } from './TableSortHeader'
import './SkillDpsAnalysisPage.css'

interface Props {
  rows: readonly SkillRecord[]
  loading: boolean
  error?: string | null
}

const TABS = [['overview', '分析一覧'], ['detail', '分析詳細']] as const
const DETAIL_MODES = [['indicator', '指標別'], ['multiple', '重回帰'], ['combinations', '組み合わせ評価']] as const
const VIEWS = [['chart', 'グラフ'], ['table', '表']] as const
const AXES_WITHOUT_UPTIME = SKILL_DPS_ANALYSIS_AXES.filter(([key]) => key !== 'uptime')
const X_LABELS = SKILL_DPS_ANALYSIS_X_LABELS
const METRIC_LABELS: Record<SkillDpsAnalysisMetric, string> = { direct: '直接DPS', combined: '合計DPS' }
const DAMAGE_TYPES: readonly (readonly [SkillDpsDamageType, string])[] = [
  ['PHYSICAL', '物理'], ['ARTS', '術'], ['TRUE', '確定'], ['ELEMENTAL', '元素'], ['MIXED', '複合'],
]
const SP_RECOVERY: readonly SkillDpsSpRecovery[] = [
  'INCREASE_WITH_TIME', 'INCREASE_WHEN_ATTACK', 'INCREASE_WHEN_TAKEN_DAMAGE',
]
const NUMBER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 })
const ESTIMATE = new Intl.NumberFormat('ja-JP', { maximumSignificantDigits: 4 })
const COUNT = new Intl.NumberFormat('ja-JP')

type DraftConfig = Omit<SkillDpsAnalysisConfig, 'defense' | 'resistance'> & { defense: string; resistance: string }
type SortKey = 'operator' | 'skillIndex' | 'skillName' | 'durationSeconds' | 'spCost' | 'initialSp' | 'spGap' | 'selectedAxis' | 'dps'

function formatNumber(value: number | null | undefined) {
  return value !== null && value !== undefined && Number.isFinite(value) ? NUMBER.format(value) : '—'
}

function formatEstimate(value: number | null | undefined) {
  return value !== null && value !== undefined && Number.isFinite(value) ? ESTIMATE.format(value) : '—'
}

function parseDraft(draft: DraftConfig): { config: SkillDpsAnalysisConfig | null; error: string | null } {
  const defense = draft.defense.trim() ? Number(draft.defense) : Number.NaN
  const resistance = draft.resistance.trim() ? Number(draft.resistance) : Number.NaN
  if (!Number.isFinite(defense) || defense < 0) return { config: null, error: '防御力は0以上の数値を入力してください。' }
  if (!Number.isFinite(resistance) || resistance < 0 || resistance > 100) {
    return { config: null, error: '術耐性は0〜100の数値を入力してください。' }
  }
  return { config: { ...draft, defense, resistance }, error: null }
}

function sameConfig(left: SkillDpsAnalysisConfig, right: SkillDpsAnalysisConfig) {
  return left.profession === right.profession && left.rarity === right.rarity
    && left.spRecovery === right.spRecovery && left.damageType === right.damageType
    && left.skillLevel === right.skillLevel && left.defense === right.defense && left.resistance === right.resistance
}

export function SkillDpsAnalysisPage({ rows, loading, error }: Props) {
  const id = useId()
  const [tab, setTab] = useState<typeof TABS[number][0]>('overview')
  const [detailMode, setDetailMode] = useState<typeof DETAIL_MODES[number][0]>('indicator')
  const [openedModelModes, setOpenedModelModes] = useState({ multiple: false, combinations: false })
  const [regressionRequest, setRegressionRequest] = useState<{
    version: number
    selection: SkillDpsRegressionSelection
  } | null>(null)
  const regressionSection = useRef<HTMLElement>(null)
  const [axis, setAxis] = useState<SkillDpsAnalysisAxis>('duration')
  const axisSelect = useRef<HTMLSelectElement>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [view, setView] = useState<TableChartView>('chart')
  const [combinationView, setCombinationView] = useState<TableChartView>('table')
  const [metric, setMetric] = useState<SkillDpsAnalysisMetric>('direct')
  const [includeUptime, setIncludeUptime] = useState(true)
  const axes = includeUptime ? SKILL_DPS_ANALYSIS_AXES : AXES_WITHOUT_UPTIME
  const [showFit, setShowFit] = useState(true)
  const [imageSnapshot, setImageSnapshot] = useState<SkillDpsChartImageSnapshot | null>(null)
  const [draft, setDraft] = useState<DraftConfig>(() => ({
    ...DEFAULT_SKILL_DPS_ANALYSIS_CONFIG,
    defense: String(DEFAULT_SKILL_DPS_ANALYSIS_CONFIG.defense),
    resistance: String(DEFAULT_SKILL_DPS_ANALYSIS_CONFIG.resistance),
  }))
  const [applied, setApplied] = useState<SkillDpsAnalysisConfig>(DEFAULT_SKILL_DPS_ANALYSIS_CONFIG)
  const [inputError, setInputError] = useState<string | null>(null)
  const [busy, startTransition] = useTransition()
  const parsed = parseDraft(draft)
  const pending = !parsed.config || !sameConfig(parsed.config, applied)
  const calculation = useMemo(() => {
    if (loading || error) return { dataset: null, error: null }
    try { return { dataset: buildSkillDpsAnalysisDataset(rows, applied), error: null } }
    catch (caught) {
      return { dataset: null, error: caught instanceof Error ? caught.message : 'DPSを計算できませんでした。' }
    }
  }, [rows, applied, loading, error])
  const analysis = useMemo(() => calculation.dataset && tab === 'detail' && detailMode === 'indicator'
    ? analyzeSkillDps(calculation.dataset, axis, metric) : null, [calculation.dataset, tab, detailMode, axis, metric])
  const categorical = axis === 'maxTargets'
  const numericPoints = useMemo(() => analysis?.observations.flatMap(({ id, x, y }) =>
    typeof x === 'number' ? [{ id, x, y }] : []) ?? [], [analysis])
  const targetGroups = useMemo(() => categorical ? buildSkillDpsTargetGroups(
    analysis?.observations.map(({ id, x, y }) => ({ id, targetCount: x, y })) ?? [],
  ) : [], [analysis, categorical])
  const dataset = calculation.dataset
  const fit = analysis?.fit ?? null
  const slope = fit?.coefficients[0]
  const chartFit = fit && slope !== undefined ? { slope, intercept: fit.intercept } : null
  const excludedCount = (dataset?.excludedCount ?? 0) + (analysis?.missingValueCount ?? 0)
  const professions = PROFESSION_ORDER.filter(profession => rows.some(row => row.profession === profession))
  const rarities = [...new Set(rows.map(row => row.rarity))].sort((left, right) => right - left)
  const sourceError = error || calculation.error
  const status = loading ? '読み込み中…' : busy ? '計算中…' : pending ? '未反映' : dataset ? '計算済み' : ''
  const detailFormat = detailMode === 'indicator'
    ? [viewLabel(axes, axis), viewLabel(VIEWS, view)]
    : [detailMode === 'combinations' ? viewLabel(TABLE_CHART_VIEWS, combinationView) : '表']

  function changeDraft<Key extends keyof DraftConfig>(key: Key, value: DraftConfig[Key]) {
    setDraft(current => ({ ...current, [key]: value }))
    setInputError(null)
  }

  function applyConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next = parseDraft(draft)
    setInputError(next.error)
    if (!next.config) return
    startTransition(() => setApplied(next.config!))
  }

  function changeDetailMode(mode: typeof DETAIL_MODES[number][0]) {
    setDetailMode(mode)
    if (mode !== 'indicator' && !openedModelModes[mode]) {
      setOpenedModelModes(current => ({ ...current, [mode]: true }))
    }
  }

  function openAxisDetail(selectedAxis: SkillDpsAnalysisAxis) {
    setAxis(selectedAxis)
    setDetailMode('indicator')
    setTab('detail')
    window.requestAnimationFrame(() => axisSelect.current?.focus())
  }

  function openCombinationRegression(
    predictors: readonly SkillDpsRegressionPredictor[],
    cohortCandidates: readonly SkillDpsRegressionPredictor[],
  ) {
    setRegressionRequest(current => ({ version: (current?.version ?? 0) + 1, selection: { predictors, cohortCandidates } }))
    changeDetailMode('multiple')
    window.requestAnimationFrame(() => regressionSection.current?.focus())
  }

  const settings = <section className="skill-dps-settings" aria-label="分析条件">
    <PageOutputHeader segments={['分析条件']}>
      <div className="skill-dps-toolbar skill-dps-settings-toolbar">
        <button className="button secondary" type="button" aria-expanded={settingsOpen} aria-controls={`${id}-conditions`}
          onClick={() => setSettingsOpen(open => !open)}><span aria-hidden="true">{settingsOpen ? '▾' : '▸'}</span> 分析条件</button>
        <label className="skill-dps-inline-label">DPS
          <select value={metric} disabled={loading || Boolean(error)}
            onChange={event => setMetric(event.target.value as SkillDpsAnalysisMetric)}>
            {Object.entries(METRIC_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <label className="skill-dps-inline-label">
          <input type="checkbox" checked={includeUptime} disabled={loading || Boolean(error)} onChange={event => {
            const checked = event.target.checked
            setIncludeUptime(checked)
            if (!checked && axis === 'uptime') setAxis('duration')
          }} />理論稼働率を含める
        </label>
      </div>
    </PageOutputHeader>
    <div className="skill-dps-applied-conditions">
      <span>{getSkillDpsAnalysisConditionLabels(applied).join('・')}</span>
      <span role="status" className={`skill-dps-status${pending ? ' pending' : ''}`}>{status}</span>
    </div>
    <form className="skill-dps-condition-form" id={`${id}-conditions`} hidden={!settingsOpen} onSubmit={applyConfig} noValidate>
      <fieldset>
        <legend>分析対象</legend>
        <div className="skill-dps-fields">
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
            onChange={event => changeDraft('spRecovery', event.target.value as SkillDpsSpRecovery)}>
            {SP_RECOVERY.map(recovery => <option value={recovery} key={recovery}>{formatSkillStructureSpRecovery(recovery)}</option>)}
          </select></label>
          <label><span>攻撃属性</span><select value={draft.damageType} disabled={loading || busy}
            onChange={event => changeDraft('damageType', event.target.value as SkillDpsAnalysisConfig['damageType'])}>
            <option value="ALL">すべて</option>
            {DAMAGE_TYPES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select></label>
        </div>
      </fieldset>
      <fieldset>
        <legend>育成・敵条件</legend>
        <div className="skill-dps-fields skill-dps-calculation-fields">
          <label><span>スキルレベル</span><select value={draft.skillLevel} disabled={loading || busy}
            onChange={event => changeDraft('skillLevel', event.target.value as SkillDpsAnalysisConfig['skillLevel'])}>
            <option value="MAX">最高Lv</option><option value="RANK_7">Lv.7</option>
          </select></label>
          <label><span>防御力</span><input type="number" min="0" step="100" value={draft.defense}
            disabled={loading || busy} aria-invalid={inputError !== null && (!draft.defense.trim() || !Number.isFinite(Number(draft.defense)) || Number(draft.defense) < 0)}
            onChange={event => changeDraft('defense', event.target.value)} /></label>
          <label><span>術耐性</span><input type="number" min="0" max="100" step="10" value={draft.resistance}
            disabled={loading || busy} aria-invalid={inputError !== null && (!draft.resistance.trim() || !Number.isFinite(Number(draft.resistance)) || Number(draft.resistance) < 0 || Number(draft.resistance) > 100)}
            onChange={event => changeDraft('resistance', event.target.value)} /></label>
        </div>
      </fieldset>
      <div className="skill-dps-actions">
        <button className="button" type="submit" disabled={loading || busy || Boolean(error)}>{busy ? '計算中…' : '分析する'}</button>
        <span className="skill-dps-fixed-condition">通常攻撃型・1スキル1件</span>
        <span className="skill-dps-fixed-condition">個別条件 DC3既定</span>
        <span className="skill-dps-fixed-condition">昇進・Lv最大・信頼100・潜在1・未装備・敵1体</span>
      </div>
      {inputError && <p className="skill-dps-error" role="alert">{inputError}</p>}
    </form>
  </section>

  return <PageLayout page="skill-dps-analysis" settings={settings} className="skill-dps-page">
    {sourceError && <p className="skill-dps-error" role="alert">{sourceError}</p>}
    {dataset && <>
      <PageOutputTabs idPrefix={id} tabs={TABS} activeTab={tab} onChange={setTab}
        label="分析結果" format={tab === 'overview' ? '表' : [viewLabel(DETAIL_MODES, detailMode), ...detailFormat]} />
      <AnalysisTabPanel idPrefix={id} tab="overview" activeTab={tab}>
        <div className="skill-dps-result" aria-busy={busy}>
          <SkillDpsAnalysisOverview dataset={dataset} metric={metric} axes={axes} onSelectAxis={openAxisDetail} />
        </div>
      </AnalysisTabPanel>
      <AnalysisTabPanel idPrefix={id} tab="detail" activeTab={tab}>
        <PageViewSwitch views={DETAIL_MODES} selected={detailMode} onChange={changeDetailMode} label="分析方法" />
        {openedModelModes.multiple && <div hidden={detailMode !== 'multiple'} aria-busy={busy}>
          <SkillDpsMultipleRegression key={regressionRequest?.version ?? 0} dataset={dataset} metric={metric}
            includeUptime={includeUptime} initialSelection={regressionRequest?.selection} sectionRef={regressionSection} />
        </div>}
        {openedModelModes.combinations && <div hidden={detailMode !== 'combinations'} aria-busy={busy}>
          <SkillDpsCombinationEvaluation dataset={dataset} metric={metric} includeUptime={includeUptime}
            view={combinationView} onViewChange={setCombinationView} onOpenRegression={openCombinationRegression} />
        </div>}
        {analysis && <div className="skill-dps-result" aria-busy={busy}>
          <div className="skill-dps-toolbar">
            <label className="skill-dps-inline-label">指標
              <select ref={axisSelect} value={axis} onChange={event => setAxis(event.target.value as SkillDpsAnalysisAxis)}>
                {axes.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </label>
            <PageViewSwitch views={VIEWS} selected={view} onChange={setView} label="分析結果の表示形式" />
            {view === 'chart' && !categorical && <label className="skill-dps-inline-label"><input type="checkbox" checked={showFit}
              onChange={event => setShowFit(event.target.checked)} />回帰線</label>}
            <span className="skill-dps-count" role="status">使用 {COUNT.format(analysis.observations.length)}件 ／ 除外 {COUNT.format(excludedCount)}件</span>
            {view === 'chart' && <button className="button" type="button"
              disabled={loading || busy || Boolean(sourceError) || analysis.observations.length === 0}
              onClick={() => setImageSnapshot({
                config: { ...applied }, axis, metric, showFit: !categorical && showFit,
                points: analysis.observations.map(({ id, x, y }) => ({ id, x, y })),
                fit: chartFit ? { ...chartFit } : null,
                correlation: analysis.correlation, rSquared: fit?.rSquared ?? null,
              })}>画像を保存</button>}
          </div>
          {!categorical && <dl className="skill-dps-statistics">
            <div><dt>Pearson r</dt><dd>{formatEstimate(analysis.correlation)}</dd></div>
            <div><dt>R²</dt><dd>{formatEstimate(fit?.rSquared)}</dd></div>
            <div><dt>傾き</dt><dd>{formatEstimate(slope)}</dd></div>
          </dl>}
          {axis === 'uptime' && <p className="skill-dps-result-condition">SP回復1/秒・反復固定周期・回復支援なし</p>}
          {analysis.error && <p role="status" className="skill-dps-result-status">{analysis.error}</p>}
          {view === 'chart'
            ? categorical
              ? <SkillDpsTargetBoxplot groups={targetGroups} yLabel={METRIC_LABELS[metric]} />
              : <SkillDpsAnalysisChart points={numericPoints} xLabel={X_LABELS[axis]} yLabel={METRIC_LABELS[metric]}
                  fit={chartFit} showFit={showFit} />
            : <SkillDpsAnalysisTable observations={analysis.observations} metric={metric} axis={axis} />}
          {fit && slope !== undefined && <p className="skill-dps-equation" aria-label="回帰式">
            {METRIC_LABELS[metric]} = {formatEstimate(slope)} × {X_LABELS[axis]} {fit.intercept < 0 ? '−' : '+'} {formatEstimate(Math.abs(fit.intercept))}
          </p>}
          {(dataset.exclusions.length > 0 || analysis.missingValueCount > 0) && <dl className="skill-dps-exclusions" aria-label="除外理由">
            {dataset.exclusions.filter(item => item.count > 0).map(item => <div key={item.label}><dt>{item.label}</dt><dd>{COUNT.format(item.count)}件</dd></div>)}
            {analysis.missingValueReasons.map(item => <div key={item.label}><dt>{item.label}</dt><dd>{COUNT.format(item.count)}件</dd></div>)}
          </dl>}
        </div>}
      </AnalysisTabPanel>
    </>}
    {imageSnapshot && <SkillDpsAnalysisImageDialog snapshot={imageSnapshot} onClose={() => setImageSnapshot(null)} />}
  </PageLayout>
}

export function SkillDpsAnalysisTable({ observations, metric, axis = 'duration' }: {
  observations: readonly SkillDpsObservation[]
  metric: SkillDpsAnalysisMetric
  axis?: SkillDpsAnalysisAxis
}) {
  const extraColumn = axis !== 'duration' && axis !== 'spCost' && axis !== 'spGap'
  const [sort, setSort] = useState<TableSort<SortKey>>({ key: 'dps', direction: 'desc' })
  const activeSort: TableSort<SortKey> = sort.key === 'selectedAxis' && !extraColumn
    ? { key: 'dps', direction: 'desc' } : sort
  const ordered = useMemo(() => [...observations].sort((left, right) => {
    const value = (observation: SkillDpsObservation): string | number | null => {
      if (activeSort.key === 'operator') return observation.skill.operatorName
      if (activeSort.key === 'skillIndex') return observation.skill.skillIndex
      if (activeSort.key === 'skillName') return observation.skill.skillName
      if (activeSort.key === 'dps') return metric === 'direct' ? observation.directDps : observation.combinedDps
      if (activeSort.key === 'selectedAxis') return getSkillDpsAnalysisAxisValue(observation, axis)
      return observation[activeSort.key]
    }
    const first = value(left), second = value(right)
    if (first === null || second === null) return first === second ? left.id.localeCompare(right.id) : first === null ? 1 : -1
    const comparison = first === 'UNLIMITED' || second === 'UNLIMITED'
      ? first === second ? 0 : first === 'UNLIMITED' ? 1 : -1
      : typeof first === 'string' && typeof second === 'string'
      ? first.localeCompare(second, 'ja') : Number(first) - Number(second)
    return (activeSort.direction === 'asc' ? comparison : -comparison)
      || left.skill.operatorName.localeCompare(right.skill.operatorName, 'ja')
      || left.skill.skillIndex - right.skill.skillIndex || left.id.localeCompare(right.id)
  }), [observations, metric, activeSort.key, activeSort.direction, axis])
  function changeSort(key: SortKey) {
    setSort(current => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' }))
  }
  const headers: readonly (readonly [SortKey, string])[] = [
    ['operator', 'オペレーター'], ['skillIndex', 'S'], ['skillName', 'スキル名'], ['durationSeconds', '持続（秒）'],
    ['spCost', '必要SP'], ['initialSp', '初期SP'], ['spGap', '必要SP−初期SP'],
    ...(extraColumn ? [['selectedAxis', X_LABELS[axis]] as const] : []), ['dps', METRIC_LABELS[metric]],
  ]
  return <div className="skill-dps-table-scroll" role="region" tabIndex={0} aria-label="分析対象のスキル">
    <table className="skill-dps-table">
      <thead><tr>{headers.map(([key, label]) => <TableSortHeader key={key} label={label} sortKey={key} sort={activeSort}
        onSort={changeSort} ariaLabel={`${key === 'skillIndex' ? 'スキル番号' : label}で並べ替え`} />)}</tr></thead>
      <tbody>{ordered.length ? ordered.map(observation => <tr key={observation.id}>
        <th scope="row">{observation.skill.operatorName}</th>
        <td className="skill-dps-skill-index">S{observation.skill.skillIndex}</td>
        <td className="skill-dps-skill-name">{observation.skill.skillName}</td>
        <td>{formatNumber(observation.durationSeconds)}</td>
        <td>{formatNumber(observation.spCost)}</td>
        <td>{formatNumber(observation.initialSp)}</td>
        <td>{formatNumber(observation.spGap)}</td>
        {extraColumn && <td>{getSkillDpsAnalysisAxisValue(observation, axis) === 'UNLIMITED' ? '上限なし'
          : formatNumber(getSkillDpsAnalysisAxisValue(observation, axis) as number | null)}</td>}
        <td>{formatNumber(metric === 'direct' ? observation.directDps : observation.combinedDps)}</td>
      </tr>) : <tr><td colSpan={headers.length} className="skill-dps-table-empty">対象なし</td></tr>}</tbody>
    </table>
  </div>
}

export default SkillDpsAnalysisPage
