import { useId, useMemo, useRef, useState } from 'react'
import { createZeroBasedValueAxis } from '../lib/chartValueAxis'
import { matchesEnemyFilters } from '../lib/enemyData'
import { copyEnemyLevelSelection, ENEMY_LEVEL_LABELS, formatEnemyLevelSelection, type EnemyAnalysisFiltersState } from '../lib/enemyLevelSelection'
import { formatEnemyNumericCondition, matchesEnemyNumericConditions, parseEnemyNumericFilterValue, type EnemyNumericCondition } from '../lib/enemyNumericFilters'
import {
  DEFAULT_ENEMY_REGRESSION_CONFIG,
  ENEMY_REGRESSION_METRICS,
  runEnemyRegression,
  type EnemyRegressionConfig,
  type EnemyRegressionMetric,
  type EnemyRegressionPredictor,
} from '../lib/enemyRegression'
import type { EnemyRecord } from '../types/enemy'
import { useEnemyRecords } from '../lib/useEnemyRecords'
import { EnemyAnalysisFilters } from './EnemyAnalysisFilters'
import { EnemyDataContent } from './EnemyPageShared'
import { EnemyDetailModal } from './EnemyDetailModal'
import { EnemyRegressionDiagnostics } from './EnemyRegressionDiagnostics'
import { AnalysisTabs, AnalysisTabPanel } from './AnalysisTabs'
import './DamageCalculator.css'
import './EnemyAnalysis.css'
import './EnemyStatisticsSummary.css'
import './EnemyRegressionPage.css'

interface RegressionDraft {
  config: EnemyRegressionConfig
  filters: EnemyAnalysisFiltersState
  numericConditions: readonly EnemyNumericCondition[]
}

function initialDraft(): RegressionDraft {
  return {
    config: { ...DEFAULT_ENEMY_REGRESSION_CONFIG, predictors: [...DEFAULT_ENEMY_REGRESSION_CONFIG.predictors] },
    filters: { levelType: 'ALL' },
    numericConditions: [],
  }
}

function copyDraft(draft: RegressionDraft): RegressionDraft {
  return {
    config: { ...draft.config, predictors: [...draft.config.predictors] },
    filters: { levelType: copyEnemyLevelSelection(draft.filters.levelType) },
    numericConditions: draft.numericConditions.map((condition) => ({ ...condition })),
  }
}

function describeScope(draft: RegressionDraft) {
  return [formatEnemyLevelSelection(draft.filters.levelType), ...draft.numericConditions.map(formatEnemyNumericCondition)]
    .filter(Boolean).join(' · ')
}

const PREDICTOR_OPTIONS: readonly { key: EnemyRegressionPredictor; label: string }[] = [
  ...ENEMY_REGRESSION_METRICS,
  { key: 'levelType', label: '敵区分' },
]

const TABS = [['settings', '条件設定'], ['results', '結果'], ['diagnostics', '診断']] as const
type RegressionTab = typeof TABS[number][0]

export function EnemyRegressionPage() {
  const { rows, loading, error, retry } = useEnemyRecords()
  return <section className="calculator-page enemy-analysis-route enemy-regression-page">
    <header className="page-intro">
      <h1>敵の重回帰分析</h1>
      <a className="button secondary enemy-page-link" href="#/analysis/enemies">敵の統計分析へ</a>
    </header>
    <EnemyDataContent loading={loading} error={error} onRetry={retry}>
      <EnemyRegressionContent rows={rows} />
    </EnemyDataContent>
  </section>
}

function EnemyRegressionContent({ rows }: { rows: readonly EnemyRecord[] }) {
  const [draft, setDraft] = useState(initialDraft)
  const [submission, setSubmission] = useState(() => ({
    draft: initialDraft(), sourceRows: rows, scopedRows: rows,
  }))
  const [detailEnemy, setDetailEnemy] = useState<EnemyRecord | null>(null)
  const [activeTab, setActiveTab] = useState<RegressionTab>('results')
  const [coefficientMode, setCoefficientMode] = useState<'beta' | 'raw'>('beta')
  const [showBars, setShowBars] = useState(false)
  const detailTrigger = useRef<HTMLButtonElement | null>(null)
  const tabId = useId()
  const resultTitleId = useId()
  const categoryTitleId = useId()
  const outcomeId = useId()
  const statusId = useId()
  const scopedRows = useMemo(() => rows.filter((enemy) => (
    matchesEnemyFilters(enemy, { query: '', levelType: draft.filters.levelType })
    && matchesEnemyNumericConditions(enemy, draft.numericConditions)
  )), [rows, draft.filters, draft.numericConditions])
  const invalidConditions = draft.numericConditions.some(({ value }) => value.trim() !== '' && parseEnemyNumericFilterValue(value) === null)
  const dirty = JSON.stringify(draft) !== JSON.stringify(submission.draft) || rows !== submission.sourceRows
  const calculation = useMemo(() => {
    try { return { result: runEnemyRegression(submission.scopedRows, submission.draft.config), error: null } }
    catch (cause) { return { result: null, error: cause instanceof Error ? cause.message : '重回帰分析を計算できませんでした。' } }
  }, [submission])
  const outcome = ENEMY_REGRESSION_METRICS.find(({ key }) => key === submission.draft.config.outcome)!
  const result = calculation.result
  const indexedColumns = result?.columns.map((column, index) => ({ ...column, index })) ?? []
  const numericColumns = indexedColumns.filter((column) => !column.isCategory)
  const categoryColumns = indexedColumns.filter((column) => column.isCategory)
  const standardized = coefficientMode === 'beta'
  const canShowBars = standardized && numericColumns.length > 0
  const barsVisible = canShowBars && showBars
  const barMaximum = createZeroBasedValueAxis(Math.max(0, ...numericColumns.map(({ index }) => (
    Math.abs(result!.fit.standardizedCoefficients[index])
  ))), 0).maximum
  const status = invalidConditions ? '数値条件を確認してください。'
    : draft.config.predictors.length === 0 ? '説明変数を1つ以上選んでください。'
    : dirty ? '未再計算'
    : calculation.error ? '計算エラー' : '計算済み'

  function calculate() {
    setSubmission({ draft: copyDraft(draft), sourceRows: rows, scopedRows: [...scopedRows] })
    setActiveTab('results')
    window.requestAnimationFrame(() => document.getElementById(`${tabId}-tab-results`)?.focus({ preventScroll: true }))
  }

  function selectOutcome(nextOutcome: EnemyRegressionMetric) {
    setDraft((current) => ({ ...current, config: {
      ...current.config, outcome: nextOutcome,
      predictors: current.config.predictors.filter((key) => key !== nextOutcome),
    } }))
  }

  function togglePredictor(predictor: EnemyRegressionPredictor) {
    setDraft((current) => ({ ...current, config: {
      ...current.config,
      predictors: PREDICTOR_OPTIONS.filter(({ key }) => key === predictor
        ? !current.config.predictors.includes(key)
        : current.config.predictors.includes(key)).map(({ key }) => key),
    } }))
  }

  function closeEnemyDetail() {
    setDetailEnemy(null)
    window.requestAnimationFrame(() => {
      if (detailTrigger.current?.isConnected) detailTrigger.current.focus()
    })
  }

  return <div className="enemy-regression-content">
    <div className="enemy-regression-model" aria-live="polite" aria-atomic="true">
      <strong>{dirty ? '前回の計算条件' : '計算条件'}：{outcome.label} ← {submission.draft.config.predictors.map((key) => (
        PREDICTOR_OPTIONS.find((option) => option.key === key)!.label
      )).join('・') || '—'}</strong>
      <span>{describeScope(submission.draft)}</span>
      {dirty && <strong>未再計算</strong>}
    </div>
    <AnalysisTabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} idPrefix={tabId} label="重回帰分析の表示" />
    <AnalysisTabPanel idPrefix={tabId} tab="settings" activeTab={activeTab} title="分析条件">
      <form className="analysis-panel-body" onSubmit={(event) => { event.preventDefault(); calculate() }}>
        <label className="enemy-regression-outcome" htmlFor={outcomeId}>
          <span>目的変数</span>
          <select id={outcomeId} value={draft.config.outcome} onChange={(event) => selectOutcome(event.target.value as EnemyRegressionMetric)}>
            {ENEMY_REGRESSION_METRICS.map(({ key, label, unit }) => <option key={key} value={key}>{label}{unit ? `（${unit}）` : ''}</option>)}
          </select>
        </label>
        <div className="enemy-regression-filters">
          <EnemyAnalysisFilters
            filters={draft.filters}
            onFiltersChange={(filters) => setDraft((current) => ({ ...current, filters }))}
            numericConditions={draft.numericConditions}
            onNumericConditionsChange={(numericConditions) => setDraft((current) => ({ ...current, numericConditions }))}
            matchedCount={scopedRows.length}
            totalCount={rows.length}
            onReset={() => setDraft((current) => ({ ...current, filters: { levelType: 'ALL' }, numericConditions: [] }))}
            showHints={false}
          />
        </div>
        <fieldset className="enemy-regression-predictors">
          <legend>説明変数</legend>
          <div>
            {PREDICTOR_OPTIONS.map(({ key, label }) => <label key={key}>
              <input type="checkbox" checked={draft.config.predictors.includes(key)} disabled={draft.config.outcome === key}
                onChange={() => togglePredictor(key)} />
              <span>{label}</span>
            </label>)}
          </div>
        </fieldset>
        <div className="enemy-regression-actions">
          <button type="submit" className="button" aria-describedby={statusId}
            disabled={invalidConditions || draft.config.predictors.length === 0}>計算する</button>
          <span id={statusId} role="status" aria-live="polite">{status}</span>
        </div>
      </form>
    </AnalysisTabPanel>
    <AnalysisTabPanel idPrefix={tabId} tab="results" activeTab={activeTab} title="分析結果">
      <div className="analysis-panel-body">
        {calculation.error && <p className="enemy-regression-error" role="alert">{calculation.error}</p>}
        {result && <section className="enemy-regression-results" aria-label={`${outcome.label}の分析結果`}>
          <div className="enemy-regression-result-scope">
            {dirty && <strong>前回計算した結果</strong>}
            <span>対象 {result.targetCount.toLocaleString('ja-JP')}種類</span>
            <span>利用 {result.fit.observationCount.toLocaleString('ja-JP')}種類</span>
            <span>欠損除外 {result.excludedCount.toLocaleString('ja-JP')}種類</span>
            <span>パラメーター {result.fit.parameterCount}個</span>
          </div>
          <div className="enemy-regression-coefficient-controls">
            <div className="enemy-chart-scale-switch" role="group" aria-label="係数の表示">
              <button type="button" aria-pressed={standardized} className={standardized ? 'active' : ''}
                onClick={() => setCoefficientMode('beta')}>標準化 β</button>
              <button type="button" aria-pressed={!standardized} className={!standardized ? 'active' : ''}
                onClick={() => setCoefficientMode('raw')}>元の単位 B</button>
            </div>
            <label className="enemy-regression-bar-option">
              <input type="checkbox" checked={showBars} disabled={!canShowBars} onChange={(event) => setShowBars(event.target.checked)} />
              <span>横棒（標準化 β）</span>
            </label>
          </div>
          {numericColumns.length > 0 && <>
            <h3 id={resultTitleId}>{standardized ? '標準化回帰係数 β' : '回帰係数 B'}</h3>
            <div className="enemy-stat-summary-scroll enemy-regression-coefficient-scroll" role="region" aria-labelledby={resultTitleId} tabIndex={0}>
              <table className={`enemy-stat-summary-table enemy-regression-coefficient-table${barsVisible ? ' enemy-regression-with-bars' : ''}`} aria-labelledby={resultTitleId}>
                <thead><tr>
                  <th scope="col">{standardized ? '説明変数' : '説明変数（＋1）'}</th>
                  <th scope="col" className="enemy-regression-coefficient-value">{standardized ? 'β' : '回帰係数 B'}</th>
                  {barsVisible && <th scope="col" aria-label="標準化回帰係数 β の横棒">
                    <div className="enemy-regression-bar-axis" aria-hidden="true"><span>{formatSigned(-barMaximum)}</span><span>0</span><span>{formatSigned(barMaximum)}</span></div>
                  </th>}
                </tr></thead>
                <tbody>{numericColumns.map((column) => {
                  const beta = result.fit.standardizedCoefficients[column.index]
                  const barWidth = Math.abs(beta) / barMaximum * 50
                  return <tr key={column.key}>
                    <th scope="row">{column.label}{!standardized && column.unit ? `（${column.unit}）` : ''}</th>
                    <td>{standardized ? formatSigned(beta, 3) : formatSigned(result.fit.coefficients[column.index])}</td>
                    {barsVisible && <td><div className="enemy-regression-bar-lane" role="img" aria-label={`${column.label}の標準化回帰係数 ${formatSigned(beta, 3)}`}>
                      <div className="enemy-regression-bar" style={{ left: `${beta < 0 ? 50 - barWidth : 50}%`, width: `${barWidth}%` }} />
                    </div></td>}
                  </tr>
                })}</tbody>
              </table>
            </div>
          </>}
          {categoryColumns.length > 0 && <section className="enemy-regression-categories" aria-labelledby={categoryTitleId}>
            <h3 id={categoryTitleId}>敵区分差（{ENEMY_LEVEL_LABELS[result.referenceLevelType!]}基準）</h3>
            <div className="enemy-stat-summary-scroll enemy-regression-coefficient-scroll" role="region" aria-labelledby={categoryTitleId} tabIndex={0}>
              <table className="enemy-stat-summary-table enemy-regression-coefficient-table" aria-labelledby={categoryTitleId}>
                <thead><tr><th scope="col">敵区分</th><th scope="col">{outcome.label}の差{outcome.unit ? `（${outcome.unit}）` : ''}</th></tr></thead>
                <tbody>{categoryColumns.map((column) => <tr key={column.key}>
                  <th scope="row">{ENEMY_LEVEL_LABELS[column.levelType!]}</th>
                  <td>{formatSigned(result.fit.coefficients[column.index])}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </section>}
          <div className="enemy-regression-intercept">切片（元の単位） {formatSigned(result.fit.intercept)}</div>
          <dl className="enemy-regression-fit">
            <div><dt>決定係数 R²</dt><dd>{formatNumber(result.fit.rSquared, 4)}</dd></div>
            <div><dt>調整済み R²</dt><dd>{formatNumber(result.fit.adjustedRSquared, 4)}</dd></div>
            <div><dt>平均絶対誤差 MAE</dt><dd>{formatNumber(result.fit.meanAbsoluteError)}{outcome.unit && <small>{outcome.unit}</small>}</dd></div>
          </dl>
        </section>}
      </div>
    </AnalysisTabPanel>
    <AnalysisTabPanel idPrefix={tabId} tab="diagnostics" activeTab={activeTab} title="診断">
      <div className="analysis-panel-body">
        {result ? <>
          <div className="enemy-regression-diagnostic-count">利用 {result.fit.observationCount.toLocaleString('ja-JP')}種類</div>
          <EnemyRegressionDiagnostics observations={result.observations} outcomeLabel={outcome.label} outcomeUnit={outcome.unit}
            onEnemySelect={(enemy, opener) => { detailTrigger.current = opener; setDetailEnemy(enemy) }} />
        </> : <p className="enemy-regression-error" role="alert">{calculation.error}</p>}
      </div>
    </AnalysisTabPanel>
    {detailEnemy && <EnemyDetailModal enemy={detailEnemy} onClose={closeEnemyDetail} />}
  </div>
}

function formatNumber(value: number, digits = 2) {
  return value.toLocaleString('ja-JP', { maximumFractionDigits: digits })
}

function formatSigned(value: number, digits?: number) {
  const magnitude = Math.abs(value)
  if (magnitude === 0) return '0'
  if (magnitude < 0.0001 || magnitude >= 1_000_000) return `${value < 0 ? '−' : '+'}${magnitude.toExponential(2)}`
  const formatted = digits === undefined ? magnitude.toLocaleString('ja-JP', { maximumSignificantDigits: 5 })
    : formatNumber(magnitude, magnitude < 0.01 ? Math.max(digits, 4) : digits)
  return `${value < 0 ? '−' : '+'}${formatted}`
}
