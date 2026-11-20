import { useMemo, useState } from 'react'
import { BAR_CHART_PROVIDERS, createBarChartFromProvider, type BarChartProviderId } from '../lib/barChartProviders'
import type { BarChartDisplaySettings } from '../lib/barChartDocument'
import { useEnemyAggregation } from '../lib/useEnemyAggregation'
import { getBarChartPresentationLabels } from '../lib/barChartPresentation'
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
  const [sourceId, setSourceId] = useState<BarChartProviderId>('enemy-resistance-histogram')
  const [scope, setScope] = useState<EnemyAggregationScope>('main')
  const [settings, setSettings] = useState<BarChartDisplaySettings>({ values: true, axisBand: true, percent: false, cumulative: false })
  const [snapshot, setSnapshot] = useState<BarChartImageSnapshot | null>(null)
  const { data, version, loading, error } = aggregation
  const result = useMemo(() => {
    if (!data || !version || loading || error) return null
    try { return { document: createBarChartFromProvider(sourceId, { data, version, scope }), error: null } }
    catch (cause) { return { document: null, error: cause instanceof Error ? cause.message : 'データを作成できませんでした。' } }
  }, [sourceId, data, version, loading, error, scope])
  const document = result?.document
  const presentation = document ? getBarChartPresentationLabels(document.xKind) : null
  const update = (key: keyof BarChartDisplaySettings, checked: boolean) => setSettings(current => ({ ...current, [key]: checked }))

  return <section className="calculator-page enemy-analysis-route bar-chart-workbench">
    <header className="page-intro bar-chart-workbench-intro">
      <h1>棒グラフ作成</h1>
      <button type="button" className="button secondary" disabled={!document} aria-haspopup="dialog"
        onClick={() => document && setSnapshot(createBarChartImageSnapshot(document, settings))}>画像を保存</button>
    </header>
    <section className="bar-chart-workbench-data" aria-label="グラフに渡すデータ">
      <label className="bar-chart-source">データ
        <select aria-label="グラフに渡すデータ" value={sourceId} onChange={event => setSourceId(event.target.value as BarChartProviderId)}>
          {BAR_CHART_PROVIDERS.map(source => <option key={source.id} value={source.id}>{source.label}</option>)}
        </select>
      </label>
      <div className="enemy-analysis-aggregation" role="group" aria-label="データの集計設定">
        <EnemyAggregationSelector state={aggregation} />
        <EnemyAggregationScopeSelector scope={scope} onChange={setScope} disabled={!data || loading} />
      </div>
      {document && presentation && <div className="bar-chart-auto-labels" aria-live="polite">
        <span>自動設定</span>
        <dl className="bar-chart-auto-values">
          <div><dt>横軸</dt><dd><strong>{document.xAxisTitle}</strong></dd></div>
          <div><dt>縦軸</dt><dd><strong>{document.yAxisTitle}</strong></dd></div>
          <div><dt>描画方式</dt><dd><strong>{presentation.type}</strong><span className="bar-chart-auto-mark">自動</span></dd></div>
          <div><dt>棒幅</dt><dd><strong>{presentation.width}</strong>{presentation.limit && <span className="bar-chart-width-limit">{presentation.limit}</span>}</dd></div>
        </dl>
      </div>}
    </section>
    <EnemyDataContent loading={loading} error={error} onRetry={aggregation.retry}>
      {result?.error && <p role="status">{result.error}</p>}
      {document && <>
        <div className="bar-chart-workbench-options" role="group" aria-label="共通の表示設定">
          <span>表示</span>
          <label><input type="checkbox" checked={settings.values} onChange={event => update('values', event.target.checked)} />数値</label>
          <label><input type="checkbox" checked={settings.axisBand} onChange={event => update('axisBand', event.target.checked)} />横軸の帯</label>
          {document.capabilities.percentages && <label><input type="checkbox" checked={settings.percent} onChange={event => update('percent', event.target.checked)} />割合帯</label>}
          {document.capabilities.cumulative && <label><input type="checkbox" checked={settings.cumulative} onChange={event => update('cumulative', event.target.checked)} />累積割合</label>}
        </div>
        <BarChartFigure document={document} settings={settings} />
      </>}
    </EnemyDataContent>
    {snapshot && <BarChartImageDialog snapshot={snapshot} onClose={() => setSnapshot(null)} />}
  </section>
}
