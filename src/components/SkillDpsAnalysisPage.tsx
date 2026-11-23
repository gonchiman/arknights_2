import { useId, useMemo, useState, useTransition, type FormEvent } from 'react'
import type { SkillRecord } from '../types/skill'
import { getProfessionLabel, PROFESSION_ORDER } from '../lib/operatorFilters'
import { formatSkillStructureSpRecovery } from '../lib/skillStructure'
import {
  analyzeSkillDps, buildSkillDpsAnalysisDataset, DEFAULT_SKILL_DPS_ANALYSIS_CONFIG,
  getSkillDpsAnalysisAxisValue, SKILL_DPS_ANALYSIS_AXES, SKILL_DPS_ANALYSIS_X_LABELS,
  type SkillDpsAnalysisAxis, type SkillDpsAnalysisConfig, type SkillDpsAnalysisMetric,
  type SkillDpsDamageType, type SkillDpsObservation, type SkillDpsSpRecovery,
} from '../lib/skillDpsAnalysis'
import type { SkillDpsChartImageSnapshot } from '../lib/skillDpsChartImage'
import { buildSkillDpsTargetGroups } from '../lib/skillDpsTargetGroups'
import { AnalysisTabPanel } from './AnalysisTabs'
import { PageLayout, PageOutputHeader, PageOutputTabs } from './PageLayout'
import { PageViewSwitch, viewLabel, type TableChartView } from './PageViewSwitch'
import { SkillDpsAnalysisChart } from './SkillDpsAnalysisChart'
import { SkillDpsAnalysisImageDialog } from './SkillDpsAnalysisImageDialog'
import { SkillDpsTargetBoxplot } from './SkillDpsTargetBoxplot'
import { TableSortHeader, type TableSort } from './TableSortHeader'
import './SkillDpsAnalysisPage.css'

interface Props {
  rows: readonly SkillRecord[]
  loading: boolean
  error?: string | null
}

const TABS = SKILL_DPS_ANALYSIS_AXES
const VIEWS = [['chart', 'グラフ'], ['table', '表']] as const
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
  const [axis, setAxis] = useState<SkillDpsAnalysisAxis>('duration')
  const [view, setView] = useState<TableChartView>('chart')
  const [metric, setMetric] = useState<SkillDpsAnalysisMetric>('direct')
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
  const analysis = useMemo(() => calculation.dataset ? analyzeSkillDps(calculation.dataset, axis, metric) : null,
    [calculation.dataset, axis, metric])
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

  const settings = <form className="skill-dps-settings" onSubmit={applyConfig} noValidate>
    <section className="skill-dps-settings-section" aria-labelledby={`${id}-target`}>
      <PageOutputHeader segments={['分析対象']}><h2 id={`${id}-target`}>分析対象</h2></PageOutputHeader>
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
    </section>
    <section className="skill-dps-settings-section" aria-labelledby={`${id}-conditions`}>
      <PageOutputHeader segments={['計算条件']}><h2 id={`${id}-conditions`}>計算条件</h2></PageOutputHeader>
      <details className="skill-dps-conditions">
        <summary>育成・敵条件<span className="skill-dps-condition-values">
          {draft.skillLevel === 'MAX' ? 'スキル最高Lv' : 'スキルLv.7'}・昇進・Lv最大・信頼100・潜在1・未装備 ／ 防御{draft.defense || '—'}・術耐性{draft.resistance || '—'}・敵1体
        </span></summary>
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
      </details>
      <div className="skill-dps-actions">
        <button className="button" type="submit" disabled={loading || busy || Boolean(error)}>{busy ? '計算中…' : '分析する'}</button>
        <span className="skill-dps-fixed-condition">通常攻撃型・1スキル1件</span>
        <span className="skill-dps-fixed-condition">個別条件 DC3既定</span>
        <span role="status" className={`skill-dps-status${pending ? ' pending' : ''}`}>{status}</span>
      </div>
      {inputError && <p className="skill-dps-error" role="alert">{inputError}</p>}
    </section>
  </form>

  return <PageLayout page="skill-dps-analysis" settings={settings} className="skill-dps-page">
    {sourceError && <p className="skill-dps-error" role="alert">{sourceError}</p>}
    {dataset && analysis && <>
      <PageOutputTabs idPrefix={id} tabs={TABS} activeTab={axis} onChange={setAxis}
        label="分析する関係" format={viewLabel(VIEWS, view)} />
      <AnalysisTabPanel idPrefix={id} tab={axis} activeTab={axis}>
        <div className="skill-dps-result" aria-busy={busy}>
          <div className="skill-dps-toolbar">
            <PageViewSwitch views={VIEWS} selected={view} onChange={setView} label="分析結果の表示形式" />
            <label className="skill-dps-inline-label">DPS<select value={metric} onChange={event => setMetric(event.target.value as SkillDpsAnalysisMetric)}>
              <option value="direct">直接DPS</option><option value="combined">合計DPS</option>
            </select></label>
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
        </div>
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
