import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  calculateNumericStatistics,
  type HistogramScale,
  type NumericStatistics,
} from '../lib/enemyStatistics'
import type { EnemyRecord, EnemyStats } from '../types/enemy'

type AnalyzedStatKey = keyof Pick<
  EnemyStats,
  'maxHp' | 'attack' | 'defense' | 'magicResistance' | 'moveSpeed' | 'baseAttackTime' | 'massLevel'
>

interface StatMetric {
  key: AnalyzedStatKey
  label: string
  axisLabel: string
  suffix: string
  valueDigits: number
  summaryDigits: number
  binCount: number
  defaultScale: HistogramScale
}

const STAT_METRICS: StatMetric[] = [
  { key: 'maxHp', label: 'HP', axisLabel: 'HP', suffix: '', valueDigits: 0, summaryDigits: 1, binCount: 12, defaultScale: 'LOG' },
  { key: 'attack', label: '攻撃力', axisLabel: '攻撃力', suffix: '', valueDigits: 0, summaryDigits: 1, binCount: 12, defaultScale: 'LOG' },
  { key: 'defense', label: '防御力', axisLabel: '防御力', suffix: '', valueDigits: 0, summaryDigits: 1, binCount: 12, defaultScale: 'LOG' },
  { key: 'magicResistance', label: '術耐性', axisLabel: '術耐性', suffix: '', valueDigits: 0, summaryDigits: 1, binCount: 10, defaultScale: 'LINEAR' },
  { key: 'moveSpeed', label: '移動速度', axisLabel: '移動速度', suffix: '', valueDigits: 2, summaryDigits: 2, binCount: 10, defaultScale: 'LINEAR' },
  { key: 'baseAttackTime', label: '攻撃間隔', axisLabel: '攻撃間隔（秒）', suffix: '秒', valueDigits: 2, summaryDigits: 2, binCount: 10, defaultScale: 'LINEAR' },
  { key: 'massLevel', label: '重量', axisLabel: '重量', suffix: '', valueDigits: 0, summaryDigits: 2, binCount: 10, defaultScale: 'LINEAR' },
]

const CHART_HEIGHT = 310
const CHART_MARGIN = { top: 44, right: 18, bottom: 52, left: 52 }

export function EnemyStatisticsPanel({ rows, scopeLabel }: { rows: EnemyRecord[]; scopeLabel: string }) {
  const [selectedMetricKey, setSelectedMetricKey] = useState<AnalyzedStatKey>('maxHp')
  const [histogramScale, setHistogramScale] = useState<HistogramScale>('LOG')
  const selectedMetric = STAT_METRICS.find((metric) => metric.key === selectedMetricKey) ?? STAT_METRICS[0]
  const statistics = useMemo(
    () => calculateNumericStatistics(
      rows.map((enemy) => enemy.stats[selectedMetric.key]),
      selectedMetric.binCount,
      histogramScale,
    ),
    [rows, selectedMetric, histogramScale],
  )

  const selectMetric = (metric: StatMetric) => {
    setSelectedMetricKey(metric.key)
    setHistogramScale(metric.defaultScale)
  }

  return (
    <section className="enemy-statistics-panel" aria-labelledby="enemy-statistics-heading">
      <header className="enemy-section-heading">
        <div>
          <span>STATISTICAL ANALYSIS</span>
          <h2 id="enemy-statistics-heading">ステータス分布</h2>
        </div>
        <p>{scopeLabel} · {rows.length}体</p>
      </header>

      <div className="enemy-metric-selector" role="group" aria-label="分析するステータス">
        {STAT_METRICS.map((metric) => (
          <button
            type="button"
            className={metric.key === selectedMetric.key ? 'active' : ''}
            aria-pressed={metric.key === selectedMetric.key}
            onClick={() => selectMetric(metric)}
            key={metric.key}
          >
            {metric.label}
          </button>
        ))}
      </div>

      <StatisticsSummary statistics={statistics} metric={selectedMetric} />
      <EnemyDistributionChart
        statistics={statistics}
        metric={selectedMetric}
        scopeLabel={scopeLabel}
        histogramScale={histogramScale}
        onHistogramScaleChange={setHistogramScale}
      />
    </section>
  )
}

function StatisticsSummary({ statistics, metric }: { statistics: NumericStatistics; metric: StatMetric }) {
  const formatValue = (value: number | null, digits = metric.summaryDigits) => (
    value === null ? '—' : formatNumber(value, digits, metric.suffix)
  )

  return (
    <dl className="enemy-statistics-grid" aria-label={`${metric.label}の統計量`}>
      <StatisticsItem
        label="有効データ"
        value={`${statistics.count}体`}
        detail={statistics.missingCount > 0 ? `値なし ${statistics.missingCount}体を除外` : '表示範囲の全対象'}
      />
      <StatisticsItem label="平均" value={formatValue(statistics.mean)} />
      <StatisticsItem label="中央値" value={formatValue(statistics.median)} />
      <StatisticsItem label="標準偏差" value={formatValue(statistics.standardDeviation)} />
      <StatisticsItem label="最小" value={formatValue(statistics.minimum, metric.valueDigits)} />
      <StatisticsItem label="第1四分位" value={formatValue(statistics.firstQuartile)} />
      <StatisticsItem label="第3四分位" value={formatValue(statistics.thirdQuartile)} />
      <StatisticsItem label="最大" value={formatValue(statistics.maximum, metric.valueDigits)} />
    </dl>
  )
}

function StatisticsItem({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
      {detail && <span>{detail}</span>}
    </div>
  )
}

function EnemyDistributionChart({
  statistics,
  metric,
  scopeLabel,
  histogramScale,
  onHistogramScaleChange,
}: {
  statistics: NumericStatistics
  metric: StatMetric
  scopeLabel: string
  histogramScale: HistogramScale
  onHistogramScaleChange: (scale: HistogramScale) => void
}) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const [chartWidth, setChartWidth] = useState(760)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const container = chartContainerRef.current
    if (!container) return

    const updateWidth = () => setChartWidth(Math.max(300, Math.floor(container.getBoundingClientRect().width)))
    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const chartDescription = statistics.count === 0
    ? `${scopeLabel}には${metric.label}の数値データがありません。`
    : `${scopeLabel}の${metric.label}を${statistics.bins.length}区間の${histogramScale === 'LOG' ? '対数' : '線形'}目盛で集計した分布です。平均は${formatNumber(statistics.mean ?? 0, metric.summaryDigits, metric.suffix)}、中央値は${formatNumber(statistics.median ?? 0, metric.summaryDigits, metric.suffix)}です。`

  return (
    <figure className="enemy-distribution-figure">
      <figcaption>
        <div>
          <strong>{metric.label}の分布</strong>
          <span>横軸：{metric.axisLabel}{histogramScale === 'LOG' ? '（対数目盛）' : ''} · 縦軸：敵数</span>
        </div>
        {statistics.count > 0 && (
          <div className="enemy-chart-options">
            <div className="enemy-chart-legend" aria-label="基準線">
              <span className="mean"><i aria-hidden="true" />平均</span>
              <span className="median"><i aria-hidden="true" />中央値</span>
            </div>
            <div className="enemy-chart-scale-switch" role="group" aria-label="横軸の目盛">
              <button
                type="button"
                className={histogramScale === 'LINEAR' ? 'active' : ''}
                aria-pressed={histogramScale === 'LINEAR'}
                onClick={() => onHistogramScaleChange('LINEAR')}
              >線形</button>
              <button
                type="button"
                className={histogramScale === 'LOG' ? 'active' : ''}
                aria-pressed={histogramScale === 'LOG'}
                onClick={() => onHistogramScaleChange('LOG')}
              >対数</button>
            </div>
          </div>
        )}
      </figcaption>
      <div className="enemy-chart-container" ref={chartContainerRef}>
        {statistics.count === 0 ? (
          <div className="enemy-chart-empty" role="status">数値データがありません</div>
        ) : (
          <DistributionSvg
            statistics={statistics}
            metric={metric}
            width={chartWidth}
            titleId={titleId}
            descriptionId={descriptionId}
            description={chartDescription}
            histogramScale={histogramScale}
          />
        )}
      </div>
    </figure>
  )
}

function DistributionSvg({
  statistics,
  metric,
  width,
  titleId,
  descriptionId,
  description,
  histogramScale,
}: {
  statistics: NumericStatistics
  metric: StatMetric
  width: number
  titleId: string
  descriptionId: string
  description: string
  histogramScale: HistogramScale
}) {
  const minimum = statistics.minimum ?? 0
  const maximum = statistics.maximum ?? minimum
  const plotLeft = CHART_MARGIN.left
  const plotTop = CHART_MARGIN.top
  const plotRight = width - CHART_MARGIN.right
  const plotBottom = CHART_HEIGHT - CHART_MARGIN.bottom
  const plotWidth = Math.max(1, plotRight - plotLeft)
  const plotHeight = plotBottom - plotTop
  const maxBinCount = Math.max(1, ...statistics.bins.map((bin) => bin.count))
  const countStep = Math.max(1, Math.ceil(maxBinCount / 4))
  const countMaximum = Math.ceil(maxBinCount / countStep) * countStep
  const countTicks = Array.from({ length: Math.floor(countMaximum / countStep) + 1 }, (_, index) => index * countStep)
  const xTickCount = width < 480 ? 3 : 5
  const transform = (value: number) => histogramScale === 'LOG' && minimum >= 0 ? Math.log1p(value) : value
  const transformedMinimum = transform(minimum)
  const transformedMaximum = transform(maximum)
  const xTicks = createScaleTicks(minimum, maximum, xTickCount, histogramScale)
  const x = (value: number) => minimum === maximum
    ? plotLeft + (plotWidth / 2)
    : plotLeft + (((transform(value) - transformedMinimum) / (transformedMaximum - transformedMinimum)) * plotWidth)
  const y = (value: number) => plotBottom - ((value / countMaximum) * plotHeight)
  const barGap = Math.min(3, Math.max(1, plotWidth / Math.max(1, statistics.bins.length) * 0.08))
  const meanX = x(statistics.mean ?? minimum)
  const medianX = x(statistics.median ?? minimum)
  const labelsOverlap = Math.abs(meanX - medianX) < 72

  return (
    <svg
      className="enemy-distribution-chart"
      viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
      width="100%"
      height={CHART_HEIGHT}
      role="img"
      aria-labelledby={`${titleId} ${descriptionId}`}
    >
      <title id={titleId}>{metric.label}の分布</title>
      <desc id={descriptionId}>{description}</desc>

      {countTicks.map((tick) => (
        <g key={tick}>
          <line className="enemy-chart-gridline" x1={plotLeft} x2={plotRight} y1={y(tick)} y2={y(tick)} />
          <text className="enemy-chart-tick" x={plotLeft - 8} y={y(tick) + 4} textAnchor="end">{tick}</text>
        </g>
      ))}

      <rect
        className="enemy-chart-frame"
        x={plotLeft}
        y={plotTop}
        width={plotWidth}
        height={plotHeight}
      />

      {statistics.bins.map((bin, index) => {
        const startX = minimum === maximum ? plotLeft : x(bin.start)
        const endX = minimum === maximum ? plotRight : x(bin.end)
        const barWidth = Math.max(1, endX - startX - barGap)
        const barTop = y(bin.count)
        const rangeLabel = minimum === maximum
          ? formatNumber(minimum, metric.valueDigits, metric.suffix)
          : `${formatNumber(bin.start, metric.summaryDigits, metric.suffix)}以上、${formatNumber(bin.end, metric.summaryDigits, metric.suffix)}${bin.includesMaximum ? '以下' : '未満'}`
        return (
          <rect
            className="enemy-chart-bar"
            x={startX + (barGap / 2)}
            y={barTop}
            width={barWidth}
            height={Math.max(0, plotBottom - barTop)}
            key={`${bin.start}-${index}`}
          >
            <title>{rangeLabel}：{bin.count}体</title>
          </rect>
        )
      })}

      <line className="enemy-chart-reference mean" x1={meanX} x2={meanX} y1={plotTop} y2={plotBottom} />
      <line className="enemy-chart-reference median" x1={medianX} x2={medianX} y1={plotTop} y2={plotBottom} />
      <text className="enemy-chart-reference-label mean" x={clampLabelX(meanX, plotLeft, plotRight)} y={14}>
        平均 {formatNumber(statistics.mean ?? 0, metric.summaryDigits, metric.suffix)}
      </text>
      <text
        className="enemy-chart-reference-label median"
        x={clampLabelX(medianX, plotLeft, plotRight)}
        y={labelsOverlap ? 29 : 14}
      >
        中央値 {formatNumber(statistics.median ?? 0, metric.summaryDigits, metric.suffix)}
      </text>

      {xTicks.map((tick, index) => (
        <g key={`${tick}-${index}`}>
          <line className="enemy-chart-axis-tick" x1={x(tick)} x2={x(tick)} y1={plotBottom} y2={plotBottom + 5} />
          <text
            className="enemy-chart-tick"
            x={x(tick)}
            y={plotBottom + 19}
            textAnchor={index === 0 ? 'start' : index === xTicks.length - 1 ? 'end' : 'middle'}
          >
            {formatNumber(tick, metric.valueDigits)}
          </text>
        </g>
      ))}

      <text className="enemy-chart-axis-title" x={(plotLeft + plotRight) / 2} y={CHART_HEIGHT - 8} textAnchor="middle">
        {metric.axisLabel}{histogramScale === 'LOG' ? '（対数目盛）' : ''}
      </text>
      <text
        className="enemy-chart-axis-title"
        x={14}
        y={(plotTop + plotBottom) / 2}
        textAnchor="middle"
        transform={`rotate(-90 14 ${(plotTop + plotBottom) / 2})`}
      >
        敵数
      </text>
    </svg>
  )
}

function createScaleTicks(
  minimum: number,
  maximum: number,
  count: number,
  scale: HistogramScale,
): number[] {
  if (minimum === maximum) return [minimum]
  if (scale === 'LOG' && minimum >= 0) {
    const transformedMinimum = Math.log1p(minimum)
    const transformedMaximum = Math.log1p(maximum)
    return Array.from(
      { length: count },
      (_, index) => Math.expm1(transformedMinimum + (((transformedMaximum - transformedMinimum) * index) / (count - 1))),
    )
  }
  return Array.from({ length: count }, (_, index) => minimum + (((maximum - minimum) * index) / (count - 1)))
}

function clampLabelX(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum - 65, Math.max(minimum + 3, value + 4))
}

function formatNumber(value: number, maximumFractionDigits: number, suffix = ''): string {
  return `${new Intl.NumberFormat('ja-JP', { maximumFractionDigits }).format(value)}${suffix}`
}
