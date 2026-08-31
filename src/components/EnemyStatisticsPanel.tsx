import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  calculateBoxPlotStatistics,
  calculateEmpiricalCdf,
  calculateNumericStatistics,
  type BoxPlotStatistics,
  type EmpiricalCdfPoint,
  type HistogramBin,
  type HistogramScale,
  type NumericStatistics,
} from '../lib/enemyStatistics'
import type { EnemyLevelType, EnemyRecord, EnemyStats } from '../types/enemy'

type AnalyzedStatKey = keyof Pick<
  EnemyStats,
  'maxHp' | 'attack' | 'defense' | 'magicResistance' | 'moveSpeed' | 'baseAttackTime' | 'massLevel'
>

type ChartKind = 'HISTOGRAM' | 'ECDF' | 'BOX' | 'SCATTER' | 'INDIVIDUAL'

interface StatMetric {
  key: AnalyzedStatKey
  label: string
  axisLabel: string
  suffix: string
  valueDigits: number
  summaryDigits: number
  logBinCount: number
  minimumLinearBinWidth: number
  defaultScale: HistogramScale
}

interface MetricObservation {
  enemy: EnemyRecord
  value: number
}

interface ScatterObservation {
  enemy: EnemyRecord
  x: number
  y: number
}

interface BoxPlotGroup {
  key: string
  label: string
  statistics: BoxPlotStatistics
  mean: number
  outliers: MetricObservation[]
}

interface IndividualGroup {
  key: string
  label: string
  observations: MetricObservation[]
  median: number
}

const STAT_METRICS: StatMetric[] = [
  { key: 'maxHp', label: 'HP', axisLabel: 'HP', suffix: '', valueDigits: 0, summaryDigits: 1, logBinCount: 12, minimumLinearBinWidth: 1, defaultScale: 'LOG' },
  { key: 'attack', label: '攻撃力', axisLabel: '攻撃力', suffix: '', valueDigits: 0, summaryDigits: 1, logBinCount: 12, minimumLinearBinWidth: 1, defaultScale: 'LOG' },
  { key: 'defense', label: '防御力', axisLabel: '防御力', suffix: '', valueDigits: 0, summaryDigits: 1, logBinCount: 12, minimumLinearBinWidth: 1, defaultScale: 'LOG' },
  { key: 'magicResistance', label: '術耐性', axisLabel: '術耐性', suffix: '', valueDigits: 0, summaryDigits: 1, logBinCount: 10, minimumLinearBinWidth: 1, defaultScale: 'LINEAR' },
  { key: 'moveSpeed', label: '移動速度', axisLabel: '移動速度', suffix: '', valueDigits: 2, summaryDigits: 2, logBinCount: 10, minimumLinearBinWidth: 0.01, defaultScale: 'LINEAR' },
  { key: 'baseAttackTime', label: '攻撃間隔', axisLabel: '攻撃間隔（秒）', suffix: '秒', valueDigits: 2, summaryDigits: 2, logBinCount: 10, minimumLinearBinWidth: 0.01, defaultScale: 'LINEAR' },
  { key: 'massLevel', label: '重量', axisLabel: '重量', suffix: '', valueDigits: 0, summaryDigits: 2, logBinCount: 10, minimumLinearBinWidth: 1, defaultScale: 'LINEAR' },
]

const CHART_OPTIONS: Array<{ key: ChartKind; label: string }> = [
  { key: 'HISTOGRAM', label: 'ヒストグラム' },
  { key: 'ECDF', label: '累積分布' },
  { key: 'BOX', label: '箱ひげ図' },
  { key: 'SCATTER', label: '散布図' },
  { key: 'INDIVIDUAL', label: '個体プロット' },
]

const LEVEL_ORDER: EnemyLevelType[] = ['NORMAL', 'ELITE', 'BOSS', 'UNKNOWN']
const LEVEL_LABELS: Record<EnemyLevelType, string> = {
  NORMAL: '通常',
  ELITE: 'エリート',
  BOSS: 'ボス',
  UNKNOWN: '未分類',
}

const CHART_HEIGHT = 310
const SCATTER_CHART_HEIGHT = 340
const CHART_MARGIN = { top: 44, right: 18, bottom: 52, left: 52 }

export function EnemyStatisticsPanel({ rows, scopeLabel }: { rows: EnemyRecord[]; scopeLabel: string }) {
  const [selectedMetricKey, setSelectedMetricKey] = useState<AnalyzedStatKey>('maxHp')
  const [axisScale, setAxisScale] = useState<HistogramScale>('LOG')
  const [scatterMetricKey, setScatterMetricKey] = useState<AnalyzedStatKey>('defense')
  const [scatterScale, setScatterScale] = useState<HistogramScale>('LOG')
  const [selectedChart, setSelectedChart] = useState<ChartKind>('HISTOGRAM')

  const selectedMetric = getMetric(selectedMetricKey)
  const scatterMetric = getMetric(scatterMetricKey)
  const metricSource = useMemo(
    () => rows.map((enemy) => enemy.stats[selectedMetric.key]),
    [rows, selectedMetric.key],
  )
  const observations = useMemo(
    () => buildMetricObservations(rows, selectedMetric.key),
    [rows, selectedMetric.key],
  )
  const statistics = useMemo(
    () => calculateNumericStatistics(
      metricSource,
      selectedMetric.logBinCount,
      axisScale,
      selectedMetric.minimumLinearBinWidth,
    ),
    [metricSource, selectedMetric.logBinCount, selectedMetric.minimumLinearBinWidth, axisScale],
  )

  const selectMetric = (metric: StatMetric) => {
    setSelectedMetricKey(metric.key)
    setAxisScale(metric.defaultScale)

    if (scatterMetricKey === metric.key) {
      const fallback = STAT_METRICS.find((candidate) => candidate.key !== metric.key) ?? STAT_METRICS[0]
      setScatterMetricKey(fallback.key)
      setScatterScale(fallback.defaultScale)
    }
  }

  const selectScatterMetric = (metricKey: AnalyzedStatKey) => {
    const metric = getMetric(metricKey)
    setScatterMetricKey(metric.key)
    setScatterScale(metric.defaultScale)
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

      <div className="enemy-chart-toolbar">
        <fieldset className="enemy-chart-visibility">
          <legend>表示するグラフ</legend>
          <div role="radiogroup" aria-label="グラフの選択">
            {CHART_OPTIONS.map((chart) => (
              <label className={selectedChart === chart.key ? 'active' : ''} key={chart.key}>
                <input
                  type="radio"
                  name="enemy-statistics-chart"
                  value={chart.key}
                  checked={selectedChart === chart.key}
                  onChange={() => setSelectedChart(chart.key)}
                />
                <span>{chart.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {statistics.count > 0 && (
          <div className="enemy-chart-axis-control">
            <span>横軸</span>
            <ScaleSwitch
              scale={axisScale}
              onChange={setAxisScale}
              label={`${selectedMetric.label}の横軸目盛`}
            />
          </div>
        )}
      </div>

      <div className="enemy-chart-stack">
        {selectedChart === 'HISTOGRAM' && (
          <HistogramFigure statistics={statistics} metric={selectedMetric} scopeLabel={scopeLabel} scale={axisScale} />
        )}
        {selectedChart === 'ECDF' && (
          <EcdfFigure
            statistics={statistics}
            observations={observations}
            metric={selectedMetric}
            scopeLabel={scopeLabel}
            scale={axisScale}
          />
        )}
        {selectedChart === 'BOX' && (
          <BoxPlotFigure
            statistics={statistics}
            observations={observations}
            metric={selectedMetric}
            scopeLabel={scopeLabel}
            scale={axisScale}
          />
        )}
        {selectedChart === 'SCATTER' && (
          <ScatterPlotFigure
            rows={rows}
            xMetric={selectedMetric}
            xScale={axisScale}
            yMetric={scatterMetric}
            yScale={scatterScale}
            onYMetricChange={selectScatterMetric}
            onYScaleChange={setScatterScale}
            scopeLabel={scopeLabel}
          />
        )}
        {selectedChart === 'INDIVIDUAL' && (
          <IndividualPlotFigure
            statistics={statistics}
            observations={observations}
            metric={selectedMetric}
            scopeLabel={scopeLabel}
            scale={axisScale}
          />
        )}
      </div>
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

function HistogramFigure({
  statistics,
  metric,
  scopeLabel,
  scale,
}: {
  statistics: NumericStatistics
  metric: StatMetric
  scopeLabel: string
  scale: HistogramScale
}) {
  const [chartContainerRef, chartWidth] = useChartWidth()
  const titleId = useId()
  const descriptionId = useId()
  const scaleName = getEffectiveScaleName(scale, statistics.minimum)
  const chartDescription = statistics.count === 0
    ? `${scopeLabel}には${metric.label}の数値データがありません。`
    : `${scopeLabel}の${metric.label}を${statistics.bins.length}階級の${scaleName}目盛で集計したヒストグラムです。`

  return (
    <figure className="enemy-analysis-figure">
      <figcaption>
        <div>
          <strong>{metric.label}のヒストグラム</strong>
          <span>横軸：{metric.axisLabel}（{scaleName}目盛） · 縦軸：敵数</span>
        </div>
        {statistics.count > 0 && <MeanMedianLegend />}
      </figcaption>
      <div className="enemy-chart-container" ref={chartContainerRef}>
        {statistics.count === 0 ? (
          <ChartEmpty />
        ) : (
          <HistogramSvg
            statistics={statistics}
            metric={metric}
            width={chartWidth}
            titleId={titleId}
            descriptionId={descriptionId}
            description={chartDescription}
            scale={scale}
          />
        )}
      </div>
      {statistics.count > 0 && <FrequencyDistributionTable statistics={statistics} metric={metric} scale={scale} />}
    </figure>
  )
}

function FrequencyDistributionTable({ statistics, metric, scale }: {
  statistics: NumericStatistics
  metric: StatMetric
  scale: HistogramScale
}) {
  let cumulativeCount = 0
  const rows = statistics.bins.map((bin) => {
    cumulativeCount += bin.count
    return {
      bin,
      cumulativeCount,
      proportion: bin.count / statistics.count,
      cumulativeProportion: cumulativeCount / statistics.count,
    }
  })
  const histogram = statistics.histogram
  const isAdaptiveLinear = scale === 'LINEAR'
    && histogram?.scale === 'LINEAR'
    && histogram.binWidth !== null
    && histogram.normalRangeStart === 0
  const normalCount = statistics.bins
    .filter((bin) => !bin.isOverflow)
    .reduce((sum, bin) => sum + bin.count, 0)

  return (
    <details className="enemy-frequency-details">
      <summary>
        <span>度数分布表</span>
        <small>{statistics.bins.length}階級</small>
      </summary>
      {isAdaptiveLinear && histogram && (
        <dl className="enemy-frequency-meta" aria-label={`${metric.label}の階級設定`}>
          <div>
            <dt>階級幅</dt>
            <dd>{formatNumber(histogram.binWidth ?? 0, metric.valueDigits, metric.suffix)}</dd>
          </div>
          <div>
            <dt>通常範囲</dt>
            <dd>
              {formatCompactRange(histogram.normalRangeStart, histogram.normalRangeEnd, metric)}
              （{formatNumber((normalCount / statistics.count) * 100, 1, '%')}）
            </dd>
          </div>
          <div>
            <dt>上限超過</dt>
            <dd>{histogram.hasOverflow ? `${formatNumber(histogram.normalRangeEnd, metric.valueDigits, metric.suffix)}超` : 'なし'}</dd>
          </div>
          <div>
            <dt>階級数</dt>
            <dd>{statistics.bins.length}</dd>
          </div>
        </dl>
      )}
      <div className="enemy-frequency-table-wrapper">
        <table className="enemy-frequency-table">
          <caption className="enemy-visually-hidden">{metric.label}の度数分布表</caption>
          <thead>
            <tr>
              <th scope="col">階級</th>
              <th scope="col">度数</th>
              <th scope="col">割合</th>
              <th scope="col">累積割合</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ bin, cumulativeCount: rowCumulativeCount, proportion, cumulativeProportion }, index) => (
              <tr key={`${bin.start}-${index}`}>
                <th scope="row">{formatHistogramRange(bin, statistics, metric)}</th>
                <td>{bin.count}</td>
                <td>{formatNumber(proportion * 100, 1, '%')}</td>
                <td title={`累積度数：${rowCumulativeCount}`}>{formatNumber(cumulativeProportion * 100, 1, '%')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

function HistogramSvg({
  statistics,
  metric,
  width,
  titleId,
  descriptionId,
  description,
  scale,
}: {
  statistics: NumericStatistics
  metric: StatMetric
  width: number
  titleId: string
  descriptionId: string
  description: string
  scale: HistogramScale
}) {
  const histogram = statistics.histogram
  const isAdaptiveLinear = scale === 'LINEAR'
    && histogram?.scale === 'LINEAR'
    && histogram.binWidth !== null
    && histogram.normalRangeStart === 0
  const overflowDisplayWidth = isAdaptiveLinear && histogram.hasOverflow ? histogram.binWidth ?? 0 : 0
  const minimum = isAdaptiveLinear ? histogram.normalRangeStart : statistics.minimum ?? 0
  const maximum = isAdaptiveLinear
    ? histogram.normalRangeEnd + overflowDisplayWidth
    : statistics.maximum ?? minimum
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
  const valueScale = createValueScale(minimum, maximum, plotLeft, plotRight, isAdaptiveLinear ? 'LINEAR' : scale)
  const xTicks = isAdaptiveLinear
    ? createAdaptiveLinearTicks(histogram.normalRangeStart, histogram.normalRangeEnd, width < 480 ? 2 : 5)
    : createScaleTicks(minimum, maximum, width < 480 ? 3 : 5, scale)
  const referencePosition = (value: number) => {
    if (!isAdaptiveLinear) return valueScale.position(value)
    if (histogram.hasOverflow && value > histogram.normalRangeEnd) {
      return valueScale.position(histogram.normalRangeEnd + ((histogram.binWidth ?? 0) / 2))
    }
    return valueScale.position(Math.min(histogram.normalRangeEnd, Math.max(histogram.normalRangeStart, value)))
  }
  const overflowTick = isAdaptiveLinear && histogram.hasOverflow
    ? {
      value: histogram.normalRangeEnd + ((histogram.binWidth ?? 0) / 2),
      label: `${formatNumber(histogram.normalRangeEnd, metric.valueDigits, metric.suffix)}超`,
    }
    : undefined
  const y = (value: number) => plotBottom - ((value / countMaximum) * plotHeight)
  const barGap = Math.min(3, Math.max(1, plotWidth / Math.max(1, statistics.bins.length) * 0.08))

  return (
    <svg className="enemy-stat-chart" viewBox={`0 0 ${width} ${CHART_HEIGHT}`} width="100%" height={CHART_HEIGHT} role="img" aria-labelledby={`${titleId} ${descriptionId}`}>
      <title id={titleId}>{metric.label}のヒストグラム</title>
      <desc id={descriptionId}>{description}</desc>

      {countTicks.map((tick) => (
        <g key={tick}>
          <line className="enemy-chart-gridline" x1={plotLeft} x2={plotRight} y1={y(tick)} y2={y(tick)} />
          <text className="enemy-chart-tick" x={plotLeft - 8} y={y(tick) + 4} textAnchor="end">{tick}</text>
        </g>
      ))}

      <rect className="enemy-chart-frame" x={plotLeft} y={plotTop} width={plotWidth} height={plotHeight} />

      {statistics.bins.map((bin, index) => {
        const startX = minimum === maximum ? plotLeft : valueScale.position(bin.start)
        const endX = minimum === maximum ? plotRight : valueScale.position(bin.end)
        const barWidth = Math.max(1, endX - startX - barGap)
        const barTop = y(bin.count)
        const rangeLabel = formatHistogramRange(bin, statistics, metric)
        return (
          <rect className={`enemy-chart-bar${bin.isOverflow ? ' overflow' : ''}`} x={startX + (barGap / 2)} y={barTop} width={barWidth} height={Math.max(0, plotBottom - barTop)} key={`${bin.start}-${index}`}>
            <title>{rangeLabel}：{bin.count}体</title>
          </rect>
        )
      })}

      <MeanMedianReferences statistics={statistics} metric={metric} position={referencePosition} plotLeft={plotLeft} plotRight={plotRight} plotTop={plotTop} plotBottom={plotBottom} />
      <BottomAxis
        ticks={xTicks}
        position={valueScale.position}
        metric={metric}
        plotLeft={plotLeft}
        plotRight={plotRight}
        plotBottom={plotBottom}
        axisLabel={`${metric.axisLabel}（${valueScale.effectiveScale === 'LOG' ? '対数' : '線形'}目盛）`}
        extraTick={overflowTick}
      />
      <VerticalAxisTitle label="敵数" x={14} plotTop={plotTop} plotBottom={plotBottom} />
    </svg>
  )
}

function EcdfFigure({
  statistics,
  observations,
  metric,
  scopeLabel,
  scale,
}: {
  statistics: NumericStatistics
  observations: MetricObservation[]
  metric: StatMetric
  scopeLabel: string
  scale: HistogramScale
}) {
  const [chartContainerRef, chartWidth] = useChartWidth()
  const titleId = useId()
  const descriptionId = useId()
  const points = useMemo(() => calculateEmpiricalCdf(observations.map(({ value }) => value)), [observations])
  const scaleName = getEffectiveScaleName(scale, statistics.minimum)

  return (
    <figure className="enemy-analysis-figure">
      <figcaption>
        <div>
          <strong>{metric.label}の累積分布</strong>
          <span>横軸：{metric.axisLabel}（{scaleName}目盛） · 縦軸：その値以下の敵の割合</span>
        </div>
        {statistics.count > 0 && <MeanMedianLegend />}
      </figcaption>
      <div className="enemy-chart-container" ref={chartContainerRef}>
        {statistics.count === 0 ? (
          <ChartEmpty />
        ) : (
          <EcdfSvg
            statistics={statistics}
            points={points}
            metric={metric}
            width={chartWidth}
            scale={scale}
            titleId={titleId}
            descriptionId={descriptionId}
            description={`${scopeLabel}の${metric.label}について、各値以下の敵の割合を示した累積分布です。`}
          />
        )}
      </div>
    </figure>
  )
}

function EcdfSvg({ statistics, points, metric, width, scale, titleId, descriptionId, description }: {
  statistics: NumericStatistics
  points: EmpiricalCdfPoint[]
  metric: StatMetric
  width: number
  scale: HistogramScale
  titleId: string
  descriptionId: string
  description: string
}) {
  const minimum = statistics.minimum ?? 0
  const maximum = statistics.maximum ?? minimum
  const plotLeft = CHART_MARGIN.left
  const plotTop = CHART_MARGIN.top
  const plotRight = width - CHART_MARGIN.right
  const plotBottom = CHART_HEIGHT - CHART_MARGIN.bottom
  const plotWidth = Math.max(1, plotRight - plotLeft)
  const plotHeight = plotBottom - plotTop
  const valueScale = createValueScale(minimum, maximum, plotLeft, plotRight, scale)
  const xTicks = createScaleTicks(minimum, maximum, width < 480 ? 3 : 5, scale)
  const yTicks = [0, 0.25, 0.5, 0.75, 1]
  const y = (value: number) => plotBottom - (value * plotHeight)
  const path = createEcdfPath(points, valueScale.position, y)

  return (
    <svg className="enemy-stat-chart" viewBox={`0 0 ${width} ${CHART_HEIGHT}`} width="100%" height={CHART_HEIGHT} role="img" aria-labelledby={`${titleId} ${descriptionId}`}>
      <title id={titleId}>{metric.label}の累積分布</title>
      <desc id={descriptionId}>{description}</desc>
      {yTicks.map((tick) => (
        <g key={tick}>
          <line className="enemy-chart-gridline" x1={plotLeft} x2={plotRight} y1={y(tick)} y2={y(tick)} />
          <text className="enemy-chart-tick" x={plotLeft - 8} y={y(tick) + 4} textAnchor="end">{Math.round(tick * 100)}%</text>
        </g>
      ))}
      <rect className="enemy-chart-frame" x={plotLeft} y={plotTop} width={plotWidth} height={plotHeight} />
      <path className="enemy-chart-line ecdf" d={path} />
      {points.map((point) => (
        <circle className="enemy-ecdf-point" cx={valueScale.position(point.value)} cy={y(point.proportion)} r={2.5} key={point.value}>
          <title>{formatNumber(point.value, metric.valueDigits, metric.suffix)}以下：{point.cumulativeCount}体（{formatNumber(point.proportion * 100, 1)}%）</title>
        </circle>
      ))}
      <MeanMedianReferences statistics={statistics} metric={metric} position={valueScale.position} plotLeft={plotLeft} plotRight={plotRight} plotTop={plotTop} plotBottom={plotBottom} />
      <BottomAxis ticks={xTicks} position={valueScale.position} metric={metric} plotLeft={plotLeft} plotRight={plotRight} plotBottom={plotBottom} axisLabel={`${metric.axisLabel}（${valueScale.effectiveScale === 'LOG' ? '対数' : '線形'}目盛）`} />
      <VerticalAxisTitle label="累積割合" x={14} plotTop={plotTop} plotBottom={plotBottom} />
    </svg>
  )
}

function BoxPlotFigure({ statistics, observations, metric, scopeLabel, scale }: {
  statistics: NumericStatistics
  observations: MetricObservation[]
  metric: StatMetric
  scopeLabel: string
  scale: HistogramScale
}) {
  const [chartContainerRef, chartWidth] = useChartWidth()
  const titleId = useId()
  const descriptionId = useId()
  const groups = useMemo(() => buildBoxPlotGroups(observations), [observations])
  const scaleName = getEffectiveScaleName(scale, statistics.minimum)

  return (
    <figure className="enemy-analysis-figure">
      <figcaption>
        <div>
          <strong>{metric.label}の箱ひげ図</strong>
          <span>{groups.length > 1 ? '区分ごとの中央値・中央50%・外れ値を比較' : `${scopeLabel}の中央値・中央50%・外れ値`} · {scaleName}目盛</span>
        </div>
        {statistics.count > 0 && (
          <div className="enemy-chart-legend box" aria-label="箱ひげ図の凡例">
            <span className="box-median"><i aria-hidden="true" />中央値</span>
            <span className="box-mean"><i aria-hidden="true" />平均</span>
            <span className="box-outlier"><i aria-hidden="true" />外れ値</span>
          </div>
        )}
      </figcaption>
      <div className="enemy-chart-container" ref={chartContainerRef}>
        {statistics.count === 0 || groups.length === 0 ? (
          <ChartEmpty />
        ) : (
          <BoxPlotSvg statistics={statistics} groups={groups} metric={metric} width={chartWidth} scale={scale} titleId={titleId} descriptionId={descriptionId} />
        )}
      </div>
    </figure>
  )
}

function BoxPlotSvg({ statistics, groups, metric, width, scale, titleId, descriptionId }: {
  statistics: NumericStatistics
  groups: BoxPlotGroup[]
  metric: StatMetric
  width: number
  scale: HistogramScale
  titleId: string
  descriptionId: string
}) {
  const height = Math.max(190, 80 + (groups.length * 54))
  const plotLeft = width < 440 ? 64 : 82
  const plotRight = width - 18
  const plotTop = 20
  const plotBottom = height - 48
  const minimum = statistics.minimum ?? 0
  const maximum = statistics.maximum ?? minimum
  const valueScale = createValueScale(minimum, maximum, plotLeft, plotRight, scale)
  const ticks = createScaleTicks(minimum, maximum, width < 480 ? 3 : 5, scale)
  const rowStep = (plotBottom - plotTop) / groups.length

  return (
    <svg className="enemy-stat-chart enemy-box-chart" viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-labelledby={`${titleId} ${descriptionId}`}>
      <title id={titleId}>{metric.label}の箱ひげ図</title>
      <desc id={descriptionId}>区分ごとに第1四分位、中央値、第3四分位、平均、ひげ、外れ値を表示します。</desc>
      <rect className="enemy-chart-frame" x={plotLeft} y={plotTop} width={Math.max(1, plotRight - plotLeft)} height={plotBottom - plotTop} />
      {groups.map((group, groupIndex) => {
        const y = plotTop + (rowStep * (groupIndex + 0.5))
        const boxStart = valueScale.position(group.statistics.firstQuartile)
        const boxEnd = valueScale.position(group.statistics.thirdQuartile)
        const boxX = Math.min(boxStart, boxEnd)
        const boxWidth = Math.max(2, Math.abs(boxEnd - boxStart))
        return (
          <g key={group.key}>
            {groupIndex > 0 && <line className="enemy-chart-group-guide" x1={plotLeft} x2={plotRight} y1={y - (rowStep / 2)} y2={y - (rowStep / 2)} />}
            <text className="enemy-chart-group-label" x={plotLeft - 9} y={y + 4} textAnchor="end">{group.label}</text>
            <line className="enemy-box-whisker" x1={valueScale.position(group.statistics.lowerWhisker)} x2={valueScale.position(group.statistics.upperWhisker)} y1={y} y2={y} />
            <line className="enemy-box-cap" x1={valueScale.position(group.statistics.lowerWhisker)} x2={valueScale.position(group.statistics.lowerWhisker)} y1={y - 9} y2={y + 9} />
            <line className="enemy-box-cap" x1={valueScale.position(group.statistics.upperWhisker)} x2={valueScale.position(group.statistics.upperWhisker)} y1={y - 9} y2={y + 9} />
            <rect className="enemy-box-body" x={boxX} y={y - 15} width={boxWidth} height={30}>
              <title>{group.label}（{group.statistics.count}体）：Q1 {formatNumber(group.statistics.firstQuartile, metric.summaryDigits, metric.suffix)}、中央値 {formatNumber(group.statistics.median, metric.summaryDigits, metric.suffix)}、Q3 {formatNumber(group.statistics.thirdQuartile, metric.summaryDigits, metric.suffix)}</title>
            </rect>
            <line className="enemy-box-median" x1={valueScale.position(group.statistics.median)} x2={valueScale.position(group.statistics.median)} y1={y - 15} y2={y + 15} />
            <circle className="enemy-box-mean" cx={valueScale.position(group.mean)} cy={y} r={4}>
              <title>{group.label}の平均：{formatNumber(group.mean, metric.summaryDigits, metric.suffix)}</title>
            </circle>
            {group.outliers.map((observation, index) => (
              <circle className={`enemy-box-outlier ${observation.enemy.levelType.toLowerCase()}`} cx={valueScale.position(observation.value)} cy={y + (stableJitter(`${observation.enemy.id}-${index}`) * 18)} r={3} key={`${observation.enemy.id}-${index}`}>
                <title>{observation.enemy.name}：{formatNumber(observation.value, metric.valueDigits, metric.suffix)}</title>
              </circle>
            ))}
          </g>
        )
      })}
      <BottomAxis ticks={ticks} position={valueScale.position} metric={metric} plotLeft={plotLeft} plotRight={plotRight} plotBottom={plotBottom} axisLabel={`${metric.axisLabel}（${valueScale.effectiveScale === 'LOG' ? '対数' : '線形'}目盛）`} chartHeight={height} />
    </svg>
  )
}

function ScatterPlotFigure({ rows, xMetric, xScale, yMetric, yScale, onYMetricChange, onYScaleChange, scopeLabel }: {
  rows: EnemyRecord[]
  xMetric: StatMetric
  xScale: HistogramScale
  yMetric: StatMetric
  yScale: HistogramScale
  onYMetricChange: (metric: AnalyzedStatKey) => void
  onYScaleChange: (scale: HistogramScale) => void
  scopeLabel: string
}) {
  const [chartContainerRef, chartWidth] = useChartWidth()
  const titleId = useId()
  const descriptionId = useId()
  const observations = useMemo(() => buildScatterObservations(rows, xMetric.key, yMetric.key), [rows, xMetric.key, yMetric.key])
  const presentLevelTypes = useMemo(
    () => LEVEL_ORDER.filter((levelType) => observations.some(({ enemy }) => enemy.levelType === levelType)),
    [observations],
  )

  return (
    <figure className="enemy-analysis-figure">
      <figcaption>
        <div>
          <strong>{xMetric.label}と{yMetric.label}の散布図</strong>
          <span>{scopeLabel} · 両方の値がある{observations.length}体</span>
          {presentLevelTypes.length > 0 && <EnemyLevelLegend levelTypes={presentLevelTypes} />}
        </div>
        <div className="enemy-scatter-controls">
          <label className="enemy-chart-select-label">
            <span>縦軸</span>
            <select value={yMetric.key} onChange={(event) => onYMetricChange(event.target.value as AnalyzedStatKey)} aria-label="散布図の縦軸ステータス">
              {STAT_METRICS.filter((metric) => metric.key !== xMetric.key).map((metric) => (
                <option value={metric.key} key={metric.key}>{metric.label}</option>
              ))}
            </select>
          </label>
          {observations.length > 0 && <ScaleSwitch scale={yScale} onChange={onYScaleChange} label={`${yMetric.label}の縦軸目盛`} />}
        </div>
      </figcaption>
      <div className="enemy-chart-container" ref={chartContainerRef}>
        {observations.length === 0 ? (
          <ChartEmpty message="2項目とも値がある敵がいません" />
        ) : (
          <ScatterSvg observations={observations} xMetric={xMetric} xScale={xScale} yMetric={yMetric} yScale={yScale} width={chartWidth} titleId={titleId} descriptionId={descriptionId} />
        )}
      </div>
    </figure>
  )
}

function ScatterSvg({ observations, xMetric, xScale, yMetric, yScale, width, titleId, descriptionId }: {
  observations: ScatterObservation[]
  xMetric: StatMetric
  xScale: HistogramScale
  yMetric: StatMetric
  yScale: HistogramScale
  width: number
  titleId: string
  descriptionId: string
}) {
  const plotLeft = width < 480 ? 58 : 66
  const plotTop = 22
  const plotRight = width - 18
  const plotBottom = SCATTER_CHART_HEIGHT - 58
  const xMinimum = Math.min(...observations.map(({ x }) => x))
  const xMaximum = Math.max(...observations.map(({ x }) => x))
  const yMinimum = Math.min(...observations.map(({ y }) => y))
  const yMaximum = Math.max(...observations.map(({ y }) => y))
  const xValueScale = createValueScale(xMinimum, xMaximum, plotLeft, plotRight, xScale)
  const yValueScale = createValueScale(yMinimum, yMaximum, plotBottom, plotTop, yScale)
  const xTicks = createScaleTicks(xMinimum, xMaximum, width < 480 ? 3 : 5, xScale)
  const yTicks = createScaleTicks(yMinimum, yMaximum, width < 480 ? 3 : 5, yScale)
  const radius = getPointRadius(observations.length)

  return (
    <svg className="enemy-stat-chart enemy-scatter-chart" viewBox={`0 0 ${width} ${SCATTER_CHART_HEIGHT}`} width="100%" height={SCATTER_CHART_HEIGHT} role="img" aria-labelledby={`${titleId} ${descriptionId}`}>
      <title id={titleId}>{xMetric.label}と{yMetric.label}の散布図</title>
      <desc id={descriptionId}>点は敵1体を表し、横軸が{xMetric.label}、縦軸が{yMetric.label}です。</desc>
      {yTicks.map((tick, index) => (
        <g key={`${tick}-${index}`}>
          <line className="enemy-chart-gridline" x1={plotLeft} x2={plotRight} y1={yValueScale.position(tick)} y2={yValueScale.position(tick)} />
          <text className="enemy-chart-tick" x={plotLeft - 8} y={yValueScale.position(tick) + 4} textAnchor="end">{formatNumber(tick, yMetric.valueDigits)}</text>
        </g>
      ))}
      {xTicks.map((tick, index) => (
        <line className="enemy-chart-gridline vertical" x1={xValueScale.position(tick)} x2={xValueScale.position(tick)} y1={plotTop} y2={plotBottom} key={`${tick}-${index}`} />
      ))}
      <rect className="enemy-chart-frame" x={plotLeft} y={plotTop} width={Math.max(1, plotRight - plotLeft)} height={plotBottom - plotTop} />
      {observations.map((observation) => (
        <circle className={`enemy-scatter-point ${observation.enemy.levelType.toLowerCase()}`} cx={xValueScale.position(observation.x)} cy={yValueScale.position(observation.y)} r={radius} key={observation.enemy.id}>
          <title>{observation.enemy.name}：{xMetric.label} {formatNumber(observation.x, xMetric.valueDigits, xMetric.suffix)}、{yMetric.label} {formatNumber(observation.y, yMetric.valueDigits, yMetric.suffix)}</title>
        </circle>
      ))}
      <BottomAxis ticks={xTicks} position={xValueScale.position} metric={xMetric} plotLeft={plotLeft} plotRight={plotRight} plotBottom={plotBottom} axisLabel={`${xMetric.axisLabel}（${xValueScale.effectiveScale === 'LOG' ? '対数' : '線形'}目盛）`} chartHeight={SCATTER_CHART_HEIGHT} />
      <VerticalAxisTitle label={`${yMetric.axisLabel}（${yValueScale.effectiveScale === 'LOG' ? '対数' : '線形'}目盛）`} x={15} plotTop={plotTop} plotBottom={plotBottom} />
    </svg>
  )
}

function IndividualPlotFigure({ statistics, observations, metric, scopeLabel, scale }: {
  statistics: NumericStatistics
  observations: MetricObservation[]
  metric: StatMetric
  scopeLabel: string
  scale: HistogramScale
}) {
  const [chartContainerRef, chartWidth] = useChartWidth()
  const titleId = useId()
  const descriptionId = useId()
  const groups = useMemo(() => buildIndividualGroups(observations), [observations])
  const scaleName = getEffectiveScaleName(scale, statistics.minimum)

  return (
    <figure className="enemy-analysis-figure">
      <figcaption>
        <div>
          <strong>{metric.label}の個体プロット</strong>
          <span>{scopeLabel} · 点は敵1体、縦線は区分ごとの中央値 · {scaleName}目盛</span>
        </div>
      </figcaption>
      <div className="enemy-chart-container" ref={chartContainerRef}>
        {statistics.count === 0 || groups.length === 0 ? (
          <ChartEmpty />
        ) : (
          <IndividualPlotSvg statistics={statistics} groups={groups} metric={metric} width={chartWidth} scale={scale} titleId={titleId} descriptionId={descriptionId} />
        )}
      </div>
    </figure>
  )
}

function IndividualPlotSvg({ statistics, groups, metric, width, scale, titleId, descriptionId }: {
  statistics: NumericStatistics
  groups: IndividualGroup[]
  metric: StatMetric
  width: number
  scale: HistogramScale
  titleId: string
  descriptionId: string
}) {
  const height = Math.max(190, 78 + (groups.length * 54))
  const plotLeft = width < 440 ? 64 : 82
  const plotRight = width - 18
  const plotTop = 20
  const plotBottom = height - 48
  const minimum = statistics.minimum ?? 0
  const maximum = statistics.maximum ?? minimum
  const valueScale = createValueScale(minimum, maximum, plotLeft, plotRight, scale)
  const ticks = createScaleTicks(minimum, maximum, width < 480 ? 3 : 5, scale)
  const rowStep = (plotBottom - plotTop) / groups.length
  const radius = getPointRadius(observationsCount(groups))

  return (
    <svg className="enemy-stat-chart enemy-individual-chart" viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-labelledby={`${titleId} ${descriptionId}`}>
      <title id={titleId}>{metric.label}の個体プロット</title>
      <desc id={descriptionId}>区分ごとに各敵を1点で表示し、中央値を縦線で示します。</desc>
      <rect className="enemy-chart-frame" x={plotLeft} y={plotTop} width={Math.max(1, plotRight - plotLeft)} height={plotBottom - plotTop} />
      {groups.map((group, groupIndex) => {
        const y = plotTop + (rowStep * (groupIndex + 0.5))
        return (
          <g key={group.key}>
            {groupIndex > 0 && <line className="enemy-chart-group-guide" x1={plotLeft} x2={plotRight} y1={y - (rowStep / 2)} y2={y - (rowStep / 2)} />}
            <text className="enemy-chart-group-label" x={plotLeft - 9} y={y + 4} textAnchor="end">{group.label}</text>
            <line className="enemy-individual-median" x1={valueScale.position(group.median)} x2={valueScale.position(group.median)} y1={y - 17} y2={y + 17}>
              <title>{group.label}の中央値：{formatNumber(group.median, metric.summaryDigits, metric.suffix)}</title>
            </line>
            {group.observations.map((observation, index) => (
              <circle className={`enemy-individual-point ${observation.enemy.levelType.toLowerCase()}`} cx={valueScale.position(observation.value)} cy={y + (stableJitter(`${observation.enemy.id}-${index}`) * 28)} r={radius} key={observation.enemy.id}>
                <title>{observation.enemy.name}：{formatNumber(observation.value, metric.valueDigits, metric.suffix)}</title>
              </circle>
            ))}
          </g>
        )
      })}
      <BottomAxis ticks={ticks} position={valueScale.position} metric={metric} plotLeft={plotLeft} plotRight={plotRight} plotBottom={plotBottom} axisLabel={`${metric.axisLabel}（${valueScale.effectiveScale === 'LOG' ? '対数' : '線形'}目盛）`} chartHeight={height} />
    </svg>
  )
}

function MeanMedianLegend() {
  return (
    <div className="enemy-chart-legend" aria-label="基準線">
      <span className="mean"><i aria-hidden="true" />平均</span>
      <span className="median"><i aria-hidden="true" />中央値</span>
    </div>
  )
}

function EnemyLevelLegend({ levelTypes }: { levelTypes: EnemyLevelType[] }) {
  return (
    <div className="enemy-level-legend" aria-label="点の色（敵の区分）">
      {levelTypes.map((levelType) => (
        <span className={levelType.toLowerCase()} key={levelType}>
          <i aria-hidden="true" />{LEVEL_LABELS[levelType]}
        </span>
      ))}
    </div>
  )
}

function MeanMedianReferences({ statistics, metric, position, plotLeft, plotRight, plotTop, plotBottom }: {
  statistics: NumericStatistics
  metric: StatMetric
  position: (value: number) => number
  plotLeft: number
  plotRight: number
  plotTop: number
  plotBottom: number
}) {
  const meanX = position(statistics.mean ?? statistics.minimum ?? 0)
  const medianX = position(statistics.median ?? statistics.minimum ?? 0)
  const labelsOverlap = Math.abs(meanX - medianX) < 72
  return (
    <>
      <line className="enemy-chart-reference mean" x1={meanX} x2={meanX} y1={plotTop} y2={plotBottom} />
      <line className="enemy-chart-reference median" x1={medianX} x2={medianX} y1={plotTop} y2={plotBottom} />
      <text className="enemy-chart-reference-label mean" x={clampLabelX(meanX, plotLeft, plotRight)} y={14}>平均 {formatNumber(statistics.mean ?? 0, metric.summaryDigits, metric.suffix)}</text>
      <text className="enemy-chart-reference-label median" x={clampLabelX(medianX, plotLeft, plotRight)} y={labelsOverlap ? 29 : 14}>中央値 {formatNumber(statistics.median ?? 0, metric.summaryDigits, metric.suffix)}</text>
    </>
  )
}

function BottomAxis({
  ticks,
  position,
  metric,
  plotLeft,
  plotRight,
  plotBottom,
  axisLabel,
  chartHeight = CHART_HEIGHT,
  extraTick,
}: {
  ticks: number[]
  position: (value: number) => number
  metric: StatMetric
  plotLeft: number
  plotRight: number
  plotBottom: number
  axisLabel: string
  chartHeight?: number
  extraTick?: { value: number; label: string }
}) {
  return (
    <>
      {ticks.map((tick, index) => (
        <g key={`${tick}-${index}`}>
          <line className="enemy-chart-axis-tick" x1={position(tick)} x2={position(tick)} y1={plotBottom} y2={plotBottom + 5} />
          <text className="enemy-chart-tick" x={position(tick)} y={plotBottom + 19} textAnchor={index === 0 ? 'start' : index === ticks.length - 1 ? 'end' : 'middle'}>
            {formatNumber(tick, metric.valueDigits)}
          </text>
        </g>
      ))}
      {extraTick && (
        <g>
          <line className="enemy-chart-axis-tick" x1={position(extraTick.value)} x2={position(extraTick.value)} y1={plotBottom} y2={plotBottom + 5} />
          <text className="enemy-chart-tick enemy-chart-overflow-tick" x={position(extraTick.value)} y={plotBottom + 19} textAnchor="middle">
            {extraTick.label}
          </text>
        </g>
      )}
      <text className="enemy-chart-axis-title" x={(plotLeft + plotRight) / 2} y={chartHeight - 8} textAnchor="middle">{axisLabel}</text>
    </>
  )
}

function VerticalAxisTitle({ label, x, plotTop, plotBottom }: { label: string; x: number; plotTop: number; plotBottom: number }) {
  return (
    <text className="enemy-chart-axis-title" x={x} y={(plotTop + plotBottom) / 2} textAnchor="middle" transform={`rotate(-90 ${x} ${(plotTop + plotBottom) / 2})`}>
      {label}
    </text>
  )
}

function ScaleSwitch({ scale, onChange, label }: { scale: HistogramScale; onChange: (scale: HistogramScale) => void; label: string }) {
  return (
    <div className="enemy-chart-scale-switch" role="group" aria-label={label}>
      <button type="button" className={scale === 'LINEAR' ? 'active' : ''} aria-pressed={scale === 'LINEAR'} onClick={() => onChange('LINEAR')}>線形</button>
      <button type="button" className={scale === 'LOG' ? 'active' : ''} aria-pressed={scale === 'LOG'} onClick={() => onChange('LOG')}>対数</button>
    </div>
  )
}

function ChartEmpty({ message = '数値データがありません' }: { message?: string }) {
  return <div className="enemy-chart-empty" role="status">{message}</div>
}

function useChartWidth() {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const [chartWidth, setChartWidth] = useState(760)
  useEffect(() => {
    const container = chartContainerRef.current
    if (!container) return
    const updateWidth = () => setChartWidth(Math.max(300, Math.floor(container.getBoundingClientRect().width)))
    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])
  return [chartContainerRef, chartWidth] as const
}

function getMetric(key: AnalyzedStatKey): StatMetric {
  return STAT_METRICS.find((metric) => metric.key === key) ?? STAT_METRICS[0]
}

function buildMetricObservations(rows: EnemyRecord[], metricKey: AnalyzedStatKey): MetricObservation[] {
  return rows.flatMap((enemy) => {
    const value = enemy.stats[metricKey]
    return typeof value === 'number' && Number.isFinite(value) ? [{ enemy, value }] : []
  })
}

function buildScatterObservations(rows: EnemyRecord[], xMetricKey: AnalyzedStatKey, yMetricKey: AnalyzedStatKey): ScatterObservation[] {
  return rows.flatMap((enemy) => {
    const x = enemy.stats[xMetricKey]
    const y = enemy.stats[yMetricKey]
    return typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y) ? [{ enemy, x, y }] : []
  })
}

function buildBoxPlotGroups(observations: MetricObservation[]): BoxPlotGroup[] {
  return LEVEL_ORDER.flatMap((levelType) => {
    const groupObservations = observations.filter(({ enemy }) => enemy.levelType === levelType)
    const statistics = calculateBoxPlotStatistics(groupObservations.map(({ value }) => value))
    if (!statistics) return []
    return [{
      key: levelType,
      label: LEVEL_LABELS[levelType],
      statistics,
      mean: groupObservations.reduce((sum, { value }) => sum + value, 0) / groupObservations.length,
      outliers: groupObservations.filter(({ value }) => value < statistics.lowerWhisker || value > statistics.upperWhisker),
    }]
  })
}

function buildIndividualGroups(observations: MetricObservation[]): IndividualGroup[] {
  return LEVEL_ORDER.flatMap((levelType) => {
    const groupObservations = observations.filter(({ enemy }) => enemy.levelType === levelType)
    const statistics = calculateBoxPlotStatistics(groupObservations.map(({ value }) => value))
    return statistics ? [{ key: levelType, label: LEVEL_LABELS[levelType], observations: groupObservations, median: statistics.median }] : []
  })
}

function createValueScale(minimum: number, maximum: number, rangeStart: number, rangeEnd: number, requestedScale: HistogramScale) {
  const effectiveScale: HistogramScale = requestedScale === 'LOG' && minimum >= 0 ? 'LOG' : 'LINEAR'
  const transform = (value: number) => effectiveScale === 'LOG' ? Math.log1p(value) : value
  const transformedMinimum = transform(minimum)
  const transformedMaximum = transform(maximum)
  const span = transformedMaximum - transformedMinimum
  const position = (value: number) => span === 0
    ? rangeStart + ((rangeEnd - rangeStart) / 2)
    : rangeStart + (((transform(value) - transformedMinimum) / span) * (rangeEnd - rangeStart))
  return { effectiveScale, position }
}

function createScaleTicks(minimum: number, maximum: number, count: number, scale: HistogramScale): number[] {
  if (minimum === maximum) return [minimum]
  if (scale === 'LOG' && minimum >= 0) {
    const transformedMinimum = Math.log1p(minimum)
    const transformedMaximum = Math.log1p(maximum)
    return Array.from({ length: count }, (_, index) => Math.expm1(transformedMinimum + (((transformedMaximum - transformedMinimum) * index) / (count - 1))))
  }
  return Array.from({ length: count }, (_, index) => minimum + (((maximum - minimum) * index) / (count - 1)))
}

function createAdaptiveLinearTicks(minimum: number, maximum: number, divisions: number): number[] {
  return Array.from({ length: divisions + 1 }, (_, index) => minimum + (((maximum - minimum) * index) / divisions))
}

function createEcdfPath(points: EmpiricalCdfPoint[], x: (value: number) => number, y: (value: number) => number): string {
  if (points.length === 0) return ''
  let path = `M ${x(points[0].value)} ${y(0)}`
  let previousProportion = 0
  for (const point of points) {
    path += ` L ${x(point.value)} ${y(previousProportion)} L ${x(point.value)} ${y(point.proportion)}`
    previousProportion = point.proportion
  }
  return path
}

function getEffectiveScaleName(scale: HistogramScale, minimum: number | null): string {
  return scale === 'LOG' && (minimum ?? 0) >= 0 ? '対数' : '線形'
}

function stableJitter(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) / 0xffffffff) - 0.5
}

function getPointRadius(count: number): number {
  if (count > 600) return 1.8
  if (count > 250) return 2.2
  if (count > 100) return 2.7
  return 3.4
}

function observationsCount(groups: IndividualGroup[]): number {
  return groups.reduce((sum, group) => sum + group.observations.length, 0)
}

function clampLabelX(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum - 65, Math.max(minimum + 3, value + 4))
}

function formatHistogramRange(bin: HistogramBin, statistics: NumericStatistics, metric: StatMetric): string {
  if (bin.isOverflow) {
    return `${formatNumber(bin.start, metric.summaryDigits, metric.suffix)}超`
  }
  if (statistics.minimum === statistics.maximum) {
    return formatNumber(statistics.minimum ?? bin.start, metric.valueDigits, metric.suffix)
  }
  return `${formatNumber(bin.start, metric.summaryDigits, metric.suffix)}以上、${formatNumber(bin.end, metric.summaryDigits, metric.suffix)}${bin.includesMaximum ? '以下' : '未満'}`
}

function formatCompactRange(start: number, end: number, metric: StatMetric): string {
  return `${formatNumber(start, metric.valueDigits)}～${formatNumber(end, metric.valueDigits, metric.suffix)}`
}

function formatNumber(value: number, maximumFractionDigits: number, suffix = ''): string {
  return `${new Intl.NumberFormat('ja-JP', { maximumFractionDigits }).format(value)}${suffix}`
}
