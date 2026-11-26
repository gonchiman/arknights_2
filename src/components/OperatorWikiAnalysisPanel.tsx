import { useImperativeHandle, useMemo, useState, type RefObject } from 'react'
import { getHpChartValueAxis } from '../lib/goldenglowTargetSwitchHpAxis'
import { STANDARD_PAGE_TITLES } from '../lib/navigation'
import { WIKI_ANALYSIS_VERSION, type OperatorWikiAnalysis, type WikiAnalysisPeriod } from '../lib/operatorWikiAnalysis'
import { ComparisonTableImageDialog, type ComparisonTableImageSnapshot } from './ComparisonTableImageDialog'
import {
  DamageCalculatorThreeAttributeChartImageDialog as ChartImageDialog,
  type DamageCalculatorThreeAttributeChartImageSnapshot as ChartImageSnapshot,
} from './DamageCalculatorThreeAttributeChartImageDialog'
import { NumericScatterChart } from './NumericScatterChart'
import { PageViewSwitch, viewLabel } from './PageViewSwitch'
import { WikiDateRange } from './WikiStatsTable'
import './OperatorWikiAnalysisPanel.css'

export const WIKI_ANALYSIS_VIEWS = [['summary', '基本統計'], ['relation', '閲覧数とコメント数の関係']] as const
export type WikiAnalysisView = typeof WIKI_ANALYSIS_VIEWS[number][0]
const PERIODS = [[1, '前日'], [7, '直近7日']] as const
const X_LABEL = '閲覧数（回）'
const Y_LABEL = 'コメント数（件）'
const POINT_LEGEND = '点の面積＝同じ座標の人数'
const NUMBER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 })
const METRICS = [
  ['count', '集計人数', '人'], ['missingCount', '未取得人数', '人'],
  ['mean', '平均値', ''], ['median', '中央値', ''],
  ['firstQuartile', '第1四分位数', ''], ['thirdQuartile', '第3四分位数', ''],
  ['interquartileRange', '四分位範囲（IQR）', ''], ['standardDeviation', '標準偏差', ''],
  ['maximum', '最大値', ''], ['zeroCount', '0回・0件の人数', '人'],
] as const

interface PanelProps {
  analysis: OperatorWikiAnalysis | null
  period: WikiAnalysisPeriod
  onPeriodChange: (period: WikiAnalysisPeriod) => void
  view: WikiAnalysisView
  onViewChange: (view: WikiAnalysisView) => void
  loading: boolean
  error: boolean
  filterConditions: readonly string[]
  imageRef: RefObject<(() => void) | null>
}

type AnalysisImage =
  | { view: 'summary'; snapshot: ComparisonTableImageSnapshot }
  | { view: 'relation'; snapshot: ChartImageSnapshot }

export function canSaveWikiAnalysisImage(analysis: OperatorWikiAnalysis | null, view: WikiAnalysisView) {
  if (!analysis) return false
  return view === 'summary' ? analysis.totalCount > 0 : analysis.points.length > 0
}

function AnalysisTable({ analysis, image = false }: { analysis: OperatorWikiAnalysis; image?: boolean }) {
  const table = <table aria-label="閲覧数とコメント数の基本統計">
    <thead><tr><th scope="col">統計量</th><th scope="col">{X_LABEL}</th><th scope="col">{Y_LABEL}</th></tr></thead>
    <tbody>{METRICS.map(([key, label, unit]) => <tr key={key}>
      <th scope="row">{label}</th>
      {(['views', 'comments'] as const).map(metric => {
        const value = analysis[metric][key]
        return <td key={metric} data-table-image-number={image || undefined}>
          {value === null ? '—' : NUMBER.format(value) + unit}
        </td>
      })}
    </tr>)}</tbody>
  </table>
  return image
    ? <div className="wiki-stats-scroll wiki-analysis-table wiki-stats-image">{table}</div>
    : <div className="wiki-stats-scroll wiki-analysis-table" role="region" aria-label="基本統計の表" tabIndex={0}>{table}</div>
}

function RelationChart({ analysis, imageSize }: {
  analysis: OperatorWikiAnalysis
  imageSize?: { width: number; height: number }
}) {
  const { points } = analysis
  const axes = useMemo(() => ({
    x: getHpChartValueAxis(points.map(point => point.x)),
    y: getHpChartValueAxis(points.map(point => point.y)),
  }), [points])
  return <NumericScatterChart points={points} xLabel={X_LABEL} yLabel={Y_LABEL}
    axes={axes} showLegend={false} imageSize={imageSize}
    description={`横軸は閲覧数、縦軸はコメント数。両方を取得した${points.length}人を表示。点の面積は同じ座標の人数に比例します。`} />
}

function relationLabels(analysis: OperatorWikiAnalysis) {
  return {
    correlation: `順位相関 ${analysis.spearman === null ? '算出不可' : analysis.spearman.toFixed(3)}`,
    counts: `両方取得 ${NUMBER.format(analysis.points.length)}人 ／ 未取得 ${NUMBER.format(analysis.totalCount - analysis.points.length)}人`,
  }
}

function createAnalysisImage(analysis: OperatorWikiAnalysis, view: WikiAnalysisView, period: WikiAnalysisPeriod, filters: readonly string[]): AnalysisImage {
  const { start, end } = analysis.range
  const dates = start === end ? end : `${start}〜${end}`
  const conditions = [period === 1 ? '前日' : '直近7日', dates + ' JST', ...filters,
    `対象 ${NUMBER.format(analysis.totalCount)}人`, `集計 ${WIKI_ANALYSIS_VERSION}`]
  if (view === 'summary') {
    return { view, snapshot: { title: 'オペレーター別 Wiki 集計　基本統計', conditions, table: <AnalysisTable analysis={analysis} image /> } }
  }
  const { correlation, counts } = relationLabels(analysis)
  return { view, snapshot: {
    title: 'オペレーター別 Wiki 閲覧数とコメント数の関係', axisTitle: X_LABEL, conditions: [...conditions, correlation, counts],
    filenameParts: conditions, legend: <span>{POINT_LEGEND}</span>,
    chart: size => <RelationChart analysis={analysis} imageSize={size} />,
  } }
}

export function OperatorWikiAnalysisPanel({ analysis, period, onPeriodChange, view, onViewChange,
  loading, error, filterConditions, imageRef }: PanelProps) {
  const [image, setImage] = useState<AnalysisImage | null>(null)
  useImperativeHandle(imageRef, () => () => {
    if (analysis && !loading && !error && canSaveWikiAnalysisImage(analysis, view)) {
      setImage(createAnalysisImage(analysis, view, period, filterConditions))
    }
  })
  const labels = analysis && relationLabels(analysis)
  const parentLocation = [STANDARD_PAGE_TITLES['operator-wiki-views'], '統計分析', viewLabel(WIKI_ANALYSIS_VIEWS, image?.view ?? view)]

  return <div className="wiki-analysis-panel">
    <PageViewSwitch views={WIKI_ANALYSIS_VIEWS} selected={view} onChange={onViewChange} label="統計分析の表示形式" />
    <div className="wiki-analysis-tools">
      <div className="wiki-stats-period" role="group" aria-label="統計分析の集計期間">
        {PERIODS.map(([days, label]) => <button type="button" key={days} className="button secondary"
          aria-pressed={period === days} onClick={() => onPeriodChange(days)}>{label}</button>)}
      </div>
      {analysis && <span><WikiDateRange {...analysis.range} /> JST</span>}
    </div>
    {error ? <p role="alert" className="error-box">Wiki統計分析のデータを読み込めませんでした。</p>
      : loading ? <p role="status" className="calculator-loading">読み込み中…</p>
        : analysis && <>
          {view === 'summary' ? <AnalysisTable analysis={analysis} /> : <>
            <div className="wiki-analysis-relation-values" aria-live="polite">
              <strong>{labels?.correlation}</strong><span>{labels?.counts}</span>
            </div>
            {analysis.points.length > 0 ? <>
              <RelationChart analysis={analysis} />
              <div className="wiki-analysis-legend">{POINT_LEGEND}</div>
            </> : <p role="status" className="wiki-analysis-empty">両方の値がそろったオペレーターは0人です。</p>}
          </>}
          <div className="wiki-stats-meta"><span>絞り込み対象 {NUMBER.format(analysis.totalCount)}人</span><span>集計 {WIKI_ANALYSIS_VERSION}</span></div>
        </>}
    {image?.view === 'summary' && <ComparisonTableImageDialog snapshot={image.snapshot} helpMode="none"
      parentLocation={parentLocation} onClose={() => setImage(null)} />}
    {image?.view === 'relation' && <ChartImageDialog snapshot={image.snapshot} helpMode="none"
      parentLocation={parentLocation} onClose={() => setImage(null)} />}
  </div>
}
