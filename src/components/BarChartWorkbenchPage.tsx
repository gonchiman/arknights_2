import { useId, useMemo, useState } from 'react'
import { BAR_CHART_PROVIDERS, createBarChartFromProvider, type BarChartProviderId } from '../lib/barChartProviders'
import {
  DEFAULT_BAR_CHART_DISPLAY_SETTINGS, getBarChartComparisonAxis, getBarChartComparisonBand,
  type BarChartDisplaySettings,
} from '../lib/barChartDocument'
import { useEnemyAggregation } from '../lib/useEnemyAggregation'
import { getBarChartPresentationLabels, getBarChartItemKind } from '../lib/barChartPresentation'
import { ENEMY_STAT_METRICS, type EnemyStatKey } from '../lib/enemyStatMetrics'
import { isEnemyRatingStat } from '../lib/enemyRatingHistogram'
import type { EnemyRatingStat } from '../lib/enemyStatRatings'
import type { EnemyRankBandStatValues } from '../lib/enemyRankBandStatistics'
import { ENEMY_RANK_BAND_STATISTIC_LABELS } from '../lib/enemyRankBandStatisticsDisplay'
import { EnemyAggregationSelector } from './EnemyAggregationSelector'
import { EnemyAggregationScopeSelector, type EnemyAggregationScope } from './EnemyAggregationScopeSelector'
import { EnemyDataContent } from './EnemyPageShared'
import { BarChartFigure } from './BarChartPlot'
import { BarChartImageDialog, createBarChartImageSnapshot, type BarChartImageSnapshot } from './BarChartImageDialog'
import './DamageCalculator.css'
import './EnemyAnalysis.css'
import './BarChartWorkbenchPage.css'

export function BarChartWorkbenchPage() {
  const aggregation = useEnemyAggregation({ defaultToLatest: true })
  const [sourceId, setSourceId] = useState<BarChartProviderId>('enemy-stat-histogram')
  const [statKey, setStatKey] = useState<EnemyStatKey>('magicResistance')
  const [leftStatKey, setLeftStatKey] = useState<EnemyRatingStat>('defense')
  const [rightStatKey, setRightStatKey] = useState<EnemyRatingStat>('magicResistance')
  const isRatingComparison = sourceId === 'enemy-stat-rating-comparison'
  const isRankStatistics = sourceId === 'enemy-rank-band-statistics'
  const isComparison = isRatingComparison || isRankStatistics
  const [rankBandStep, setRankBandStep] = useState<5 | 10 | 20>(10)
  const [rankBandMetric, setRankBandMetric] = useState<keyof EnemyRankBandStatValues>('standardDeviation')
  const [binning, setBinning] = useState<'numeric' | 'rating'>('numeric')
  const binningName = useId()
  const comparisonBandName = useId()
  const supportsRating = sourceId === 'enemy-stat-histogram' && isEnemyRatingStat(statKey)
  const histogramBinning = supportsRating ? binning : 'numeric'
  const [scope, setScope] = useState<EnemyAggregationScope>('main')
  const [settings, setSettings] = useState<BarChartDisplaySettings>({ ...DEFAULT_BAR_CHART_DISPLAY_SETTINGS })
  const [snapshot, setSnapshot] = useState<BarChartImageSnapshot | null>(null)
  const { data, version, loading, error } = aggregation
  const result = useMemo(() => {
    if (!data || !version || loading || error) return null
    try { return { document: createBarChartFromProvider(sourceId, { data, version, scope, statKey, histogramBinning, leftStatKey, rightStatKey, rankBandStep, rankBandMetric }), error: null } }
    catch (cause) { return { document: null, error: cause instanceof Error ? cause.message : 'データを作成できませんでした。' } }
  }, [sourceId, data, version, loading, error, scope, statKey, histogramBinning, leftStatKey, rightStatKey, rankBandStep, rankBandMetric])
  const document = result?.document
  const presentation = document ? getBarChartPresentationLabels(getBarChartItemKind(document), document.layout) : null
  const update = (key: 'values' | 'axisBand' | 'percent' | 'cumulative' | 'cumulativeBand' | 'rankBand', checked: boolean) =>
    setSettings(current => ({ ...current, [key]: checked }))

  return <section className="calculator-page enemy-analysis-route bar-chart-workbench">
    <header className="page-intro bar-chart-workbench-intro">
      <h1>棒グラフ作成</h1>
      <button type="button" className="button secondary" disabled={!document} aria-haspopup="dialog"
        onClick={() => document && setSnapshot(createBarChartImageSnapshot(document, settings))}>画像を保存</button>
    </header>
    <section className="bar-chart-workbench-data" aria-label="グラフに渡すデータ">
      <div className={`bar-chart-data-selectors${isComparison ? ' is-comparison' : ''}`}>
        <label className="bar-chart-source">データ
          <select aria-label="グラフに渡すデータ" value={sourceId} onChange={event => setSourceId(event.target.value as BarChartProviderId)}>
            {BAR_CHART_PROVIDERS.map(source => <option key={source.id} value={source.id}>{source.label}</option>)}
          </select>
        </label>
        {sourceId === 'enemy-stat-histogram' && <label className="bar-chart-source">ステータス
          <select aria-label="ステータス" value={statKey} onChange={event => setStatKey(event.target.value as EnemyStatKey)}>
            {ENEMY_STAT_METRICS.map(metric => <option key={metric.key} value={metric.key}>{metric.label}</option>)}
          </select>
        </label>}
        {isRatingComparison && <div className="bar-chart-pair-selectors">
          {([{ side: 'left', label: '左側', value: leftStatKey, change: setLeftStatKey },
            { side: 'right', label: '右側', value: rightStatKey, change: setRightStatKey }] as const).map(item =>
            <label key={item.side} className="bar-chart-source">{item.label}
              <select aria-label={`${item.label}のステータス`} value={item.value} onChange={event => item.change(event.target.value as EnemyRatingStat)}>
                {ENEMY_STAT_METRICS.filter(metric => isEnemyRatingStat(metric.key)).map(metric =>
                  <option key={metric.key} value={metric.key}>{metric.label}</option>)}
              </select>
            </label>)}
        </div>}
        {isRankStatistics && <label className="bar-chart-source">順位帯幅
          <select aria-label="順位帯幅" value={rankBandStep} onChange={event => setRankBandStep(Number(event.target.value) as 5 | 10 | 20)}>
            {([5, 10, 20] as const).map(step => <option key={step} value={step}>{step}ポイント</option>)}
          </select>
        </label>}
      </div>
      <div className="enemy-analysis-aggregation" role="group" aria-label="データの集計設定">
        <EnemyAggregationSelector state={aggregation} />
        <EnemyAggregationScopeSelector scope={scope} onChange={setScope} disabled={!data || loading} />
        {supportsRating && <fieldset className="enemy-chart-visibility enemy-analysis-scope" disabled={!data || loading}>
          <legend>階級</legend>
          <div>{(['numeric', 'rating'] as const).map(mode => <label key={mode} className={binning === mode ? 'active' : ''}>
            <input type="radio" name={binningName} value={mode} checked={binning === mode} onChange={() => setBinning(mode)} />
            <span>{mode === 'numeric' ? '数値' : 'ゲーム内評価'}</span>
          </label>)}</div>
        </fieldset>}
      </div>
      {document && presentation && <div className="bar-chart-auto-labels" aria-live="polite">
        <span>自動設定</span>
        <dl className="bar-chart-auto-values">
          <div><dt>{isComparison ? '棒の長さ' : '横軸'}</dt><dd><strong>{document.xAxisTitle}</strong></dd></div>
          <div><dt>{isComparison ? '並び' : '縦軸'}</dt><dd><strong>{document.yAxisTitle}</strong></dd></div>
          <div><dt>描画方式</dt><dd><strong>{presentation.type}</strong><span className="bar-chart-auto-mark">自動</span></dd></div>
          <div><dt>棒幅</dt><dd><strong>{presentation.width}</strong>{presentation.limit && <span className="bar-chart-width-limit">{presentation.limit}</span>}</dd></div>
          {document.layout === 'mirrored' && <>
            <div><dt>系列数</dt><dd><strong>{document.series?.length}</strong></dd></div>
            <div><dt>目盛り</dt><dd><strong>左右共通・{getBarChartComparisonAxis(document).minimum}〜{getBarChartComparisonAxis(document).maximum}{document.semantics.comparisonValue === 'value' ? document.semantics.xUnit ?? '' : '%'}</strong></dd></div>
          </>}
          {(document.semantics.kind === 'histogram' || isRankStatistics) && document.source.parameters.map(parameter =>
            <div key={parameter.label}><dt>{parameter.label}</dt><dd><strong>{parameter.value}</strong></dd></div>)}
        </dl>
      </div>}
    </section>
    <EnemyDataContent loading={loading} error={error} onRetry={aggregation.retry}>
      {result?.error && <p role="status">{result.error}</p>}
      {document && <>
        {isRankStatistics && <label className="bar-chart-source bar-chart-statistic-option">統計量
          <select aria-label="グラフの統計量" value={rankBandMetric} onChange={event => setRankBandMetric(event.target.value as keyof EnemyRankBandStatValues)}>
            {(Object.keys(ENEMY_RANK_BAND_STATISTIC_LABELS) as (keyof EnemyRankBandStatValues)[]).map(key =>
              <option key={key} value={key}>{ENEMY_RANK_BAND_STATISTIC_LABELS[key]}</option>)}
          </select>
        </label>}
        {document.layout === 'mirrored' ? <div className="bar-chart-comparison-options">
          <fieldset className="bar-chart-workbench-options"><legend>外側の帯</legend>
            {(document.semantics.comparisonValue === 'value' ? ['value', 'none'] as const : ['cumulative', 'rank', 'none'] as const).map(mode => <label key={mode}>
              <input type="radio" name={comparisonBandName} checked={getBarChartComparisonBand(settings, document) === mode}
                onChange={() => setSettings(current => ({ ...current, comparisonBand: mode }))} />
              {mode === 'value' ? document.semantics.xLabel : mode === 'cumulative' ? '累積割合' : mode === 'rank' ? '階級割合' : 'なし'}
            </label>)}
          </fieldset>
          <fieldset className="bar-chart-workbench-options"><legend>強調</legend>
            {document.bins.map(bin => <label key={bin.id}>
              <input type="checkbox" checked={settings.selectedRanks?.includes(bin.id) ?? false} onChange={event =>
                setSettings(current => ({ ...current, selectedRanks: event.target.checked
                  ? [...(current.selectedRanks ?? []), bin.id] : current.selectedRanks?.filter(id => id !== bin.id) ?? [] }))} />
              {bin.label}
            </label>)}
          </fieldset>
        </div> : <div className="bar-chart-workbench-options" role="group" aria-label="共通の表示設定">
          <span>表示</span>
          <label><input type="checkbox" checked={settings.values} onChange={event => update('values', event.target.checked)} />数値</label>
          <label><input type="checkbox" checked={settings.axisBand} onChange={event => update('axisBand', event.target.checked)} />横軸の帯</label>
          {document.capabilities.percentages && <label><input type="checkbox" checked={settings.percent} onChange={event => update('percent', event.target.checked)} />割合帯</label>}
          {document.capabilities.cumulative && <>
            <label><input type="checkbox" checked={settings.cumulative} onChange={event => update('cumulative', event.target.checked)} />累積割合線</label>
            <label><input type="checkbox" checked={Boolean(settings.cumulativeBand)} onChange={event => update('cumulativeBand', event.target.checked)} />累積割合帯</label>
          </>}
          {document.capabilities.rankBands && <label><input type="checkbox" checked={Boolean(settings.rankBand)} onChange={event => update('rankBand', event.target.checked)} />評価帯</label>}
        </div>}
        <BarChartFigure document={document} settings={settings} />
      </>}
    </EnemyDataContent>
    {snapshot && <BarChartImageDialog snapshot={snapshot} onClose={() => setSnapshot(null)} />}
  </section>
}
