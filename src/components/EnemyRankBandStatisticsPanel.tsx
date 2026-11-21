import { useId, useMemo, useState } from 'react'
import type { EnemyRecord } from '../types/enemy'
import type { EnemyHistogramCounts } from '../lib/enemyHistogramCounts'
import {
  buildStandardizedEnemyRankBandStatistics,
  type EnemyRankBandMetric,
  type EnemyStandardizedRankBandStatistics,
  type EnemyRankBandStatValues,
} from '../lib/enemyRankBandStatistics'
import { ENEMY_RANK_BAND_METRIC_LABELS, formatRankBandStatistic } from '../lib/enemyRankBandStatisticsDisplay'
import { ComparisonTableImageDialog, type ComparisonTableImageSnapshot } from './ComparisonTableImageDialog'
import {
  EnemyRankBandStatisticsImageDialog,
  type EnemyRankBandStatisticsChartSnapshot,
} from './EnemyRankBandStatisticsImageDialog'
import { EnemyRankBandStatisticsPlot } from './EnemyRankBandStatisticsPlot'
import { ElementLocationCopyButton } from './ElementLocationCopyButton'
import './EnemyRankBandStatisticsPanel.css'

type Step = 5 | 10 | 20
type Column = keyof EnemyRankBandStatValues
const SERIES = [{ key: 'defense', label: '防御力' }, { key: 'resistance', label: '術耐性' }] as const
const COLUMN_LABELS: Record<Column, string> = {
  min: '最小', max: '最大', width: '幅', mean: '平均', standardDeviation: '標準偏差', variance: '分散',
}
const METRICS: EnemyRankBandMetric[] = ['standardDeviation', 'width', 'mean', 'variance']
const VIEW_LABELS = { table: '表', chart: 'グラフ' } as const
const COUNT = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 })

export function EnemyRankBandStatisticsPanel({ rows, counts, conditions, locationPath }: {
  rows: readonly EnemyRecord[]
  counts: EnemyHistogramCounts
  conditions: readonly string[]
  locationPath: readonly string[]
}) {
  const id = useId()
  const [step, setStep] = useState<Step>(10)
  const [view, setView] = useState<'table' | 'chart'>('table')
  const [showMean, setShowMean] = useState(false)
  const [showVariance, setShowVariance] = useState(false)
  const [showRange, setShowRange] = useState(false)
  const [metric, setMetric] = useState<EnemyRankBandMetric>('standardDeviation')
  const [tableImage, setTableImage] = useState<ComparisonTableImageSnapshot | null>(null)
  const [chartImage, setChartImage] = useState<EnemyRankBandStatisticsChartSnapshot | null>(null)
  const result = useMemo(() => buildStandardizedEnemyRankBandStatistics(rows, counts, step), [rows, counts, step])
  const columns: Column[] = [
    ...(showRange ? ['min', 'max'] as const : []), 'width', ...(showMean ? ['mean'] as const : []),
    'standardDeviation', ...(showVariance ? ['variance'] as const : []),
  ]
  const table = <EnemyRankBandStatisticsTable bands={result.bands} columns={columns} />

  function openImage() {
    const snapshotConditions = [...conditions, '標準化', '出現回数', `順位帯幅${step}ポイント`, '母分散']
    if (view === 'table') {
      setTableImage({
        title: '防御力・術耐性の順位帯統計',
        conditions: [...conditions, '標準化（全体基準）', `有効出現回数 ${COUNT.format(result.total)}`, `順位帯幅 ${step}ポイント`, '母分散'],
        filenameConditions: [...snapshotConditions, ...columns.map(column => COLUMN_LABELS[column])],
        table,
      })
    } else {
      setChartImage({
        bands: result.bands.map(band => ({ ...band,
          defense: band.defense ? { ...band.defense } : null,
          resistance: band.resistance ? { ...band.resistance } : null,
        })),
        metric, step,
        conditions: [...conditions, '標準化（全体基準）', `出現回数 ${COUNT.format(result.total)}`,
          ...(['variance', 'standardDeviation'].includes(metric) ? ['母分散'] : [])],
        filenameConditions: [...conditions, '標準化', '出現回数',
          ...(['variance', 'standardDeviation'].includes(metric) ? ['母分散'] : [])],
      })
    }
  }

  return <section className="enemy-rank-statistics" aria-label="順位帯の統計">
    <div className="enemy-rank-statistics-heading">
      <div className="enemy-rank-statistics-heading-text">
        <h2>順位帯ごとの統計量（標準化）</h2><span>出現回数で重み付け・全体基準・母分散</span>
      </div>
      <ElementLocationCopyButton segments={[...locationPath, VIEW_LABELS[view]]} className="enemy-rank-statistics-location-copy" />
    </div>
    <div className="enemy-rank-statistics-toolbar">
      <label htmlFor={`${id}-step`}>順位帯幅
        <select id={`${id}-step`} aria-label="順位帯幅" value={step} onChange={event => setStep(Number(event.target.value) as Step)}>
          {[5, 10, 20].map(value => <option key={value} value={value}>{value}ポイント</option>)}
        </select>
      </label>
      <div className="enemy-chart-scale-switch" role="group" aria-label="順位帯統計の表示形式">
        {(['table', 'chart'] as const).map(key => <button key={key} type="button" aria-pressed={view === key}
          className={view === key ? 'active' : ''} onClick={() => setView(key)}>{VIEW_LABELS[key]}</button>)}
      </div>
      {view === 'chart' && <label htmlFor={`${id}-metric`}>統計量
        <select id={`${id}-metric`} aria-label="統計量" value={metric} onChange={event => setMetric(event.target.value as EnemyRankBandMetric)}>
          {METRICS.map(key => <option key={key} value={key}>{ENEMY_RANK_BAND_METRIC_LABELS[key]}</option>)}
        </select>
      </label>}
      <button type="button" className="button secondary enemy-rank-statistics-save" aria-haspopup="dialog"
        aria-label={`順位帯統計の${VIEW_LABELS[view]}をPNG画像で保存`}
        disabled={result.bands.length === 0} onClick={openImage}>画像を保存</button>
    </div>
    {view === 'table' && <div className="enemy-rank-statistics-columns" role="group" aria-label="追加表示する統計量">
      <span>追加表示</span>
      <label><input type="checkbox" checked={showMean} onChange={event => setShowMean(event.target.checked)} />平均</label>
      <label><input type="checkbox" checked={showVariance} onChange={event => setShowVariance(event.target.checked)} />分散</label>
      <label><input type="checkbox" checked={showRange} onChange={event => setShowRange(event.target.checked)} />最小・最大</label>
    </div>}
    {result.bands.length === 0 ? <p role="status">集計対象の出現データがありません。</p>
      : view === 'table'
        ? <div className="damage-two-table-wrap enemy-rank-statistics-table-scroll" role="region" tabIndex={0}
            aria-label="順位帯ごとの防御力と術耐性の統計量">{table}</div>
        : <EnemyRankBandStatisticsPlot bands={result.bands} metric={metric} />}
    {tableImage && <ComparisonTableImageDialog snapshot={tableImage} helpMode="none" onClose={() => setTableImage(null)} />}
    {chartImage && <EnemyRankBandStatisticsImageDialog snapshot={chartImage} onClose={() => setChartImage(null)} />}
  </section>
}

export function EnemyRankBandStatisticsTable({ bands, columns }: {
  bands: readonly EnemyStandardizedRankBandStatistics[]
  columns: readonly Column[]
}) {
  return <table className="damage-two-table enemy-defense-resistance-table enemy-rank-statistics-table"
    aria-label="防御力と術耐性の順位帯統計（標準化）">
    <colgroup><col /></colgroup>
    {SERIES.map(series => <colgroup key={series.key}>{columns.map(column => <col key={column} />)}</colgroup>)}
    <thead>
      <tr><th scope="col" rowSpan={2}>ステータス順位帯<br />（高い順）</th>
        {SERIES.map(series => <th key={series.key} scope="colgroup" colSpan={columns.length}
          className={`enemy-rank-statistics-${series.key}`}>{series.label}</th>)}
      </tr>
      <tr>{SERIES.flatMap(series => columns.map(column => <th key={`${series.key}-${column}`} scope="col">
        {COLUMN_LABELS[column]}
      </th>))}</tr>
    </thead>
    <tbody>{bands.map(band => <tr key={band.from}>
      <th scope="row">上位{band.from}〜{band.to}%</th>
      {SERIES.flatMap(series => columns.map(column => <td key={`${series.key}-${column}`} data-table-image-number>
        {formatRankBandStatistic(band[series.key]?.[column])}
      </td>))}
    </tr>)}</tbody>
  </table>
}
