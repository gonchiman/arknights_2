import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  MAX_CUSTOM_LINEAR_BIN_COUNT,
  calculateBoxPlotStatistics,
  calculateEmpiricalCdf,
  calculateNumericStatisticsWithDispersion,
  getCustomLinearHistogramMaximum,
  type BoxPlotStatistics,
  type EmpiricalCdfPoint,
  type HistogramBin,
  type HistogramScale,
  type NumericStatistics,
  type NumericStatisticsWithDispersion,
  validateCustomLinearBinWidth,
} from '../lib/enemyStatistics'
import type { EnemyLevelType, EnemyRecord, EnemyStats } from '../types/enemy'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { PersistentDetails } from './PersistentDetails'
import { ChartImageSaveDialog, type ChartImageAspectSettings } from './ChartImageSaveDialog'
import { ChartImageFrame } from './ChartImageFrame'
import { EnemyHistogramOverflowHelp } from './EnemyHistogramOverflowHelp'
import { EnemyEcdfGuideControls } from './EnemyEcdfGuideControls'
import { EnemyDistributionComparison } from './EnemyDistributionComparison'
import { calculateEcdfGuideReadings, parseEcdfGuideInput, type EcdfGuideValues } from '../lib/enemyEcdfGuides'
import { getChartImageSavePicker, selectChartImageDestination } from '../lib/chartImageDestination'
import { getEnemyChartImageFilename, getEnemyChartImageLayout, getEnemyChartNaturalHeight, type EnemyChartKind as ChartKind } from '../lib/enemyChartImage'
import { saveComparisonChartImage } from './saveComparisonChartImage'
import './EnemyDistribution.css'
import './EnemyStatisticsSummary.css'
import './EnemyChartImage.css'

type AnalyzedStatKey = keyof Pick<
  EnemyStats,
  'maxHp' | 'attack' | 'defense' | 'magicResistance' | 'moveSpeed' | 'baseAttackTime' | 'massLevel'
> | 'stageAppearanceCount'

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
  { key: 'stageAppearanceCount', label: '登場ステージ数', axisLabel: '登場ステージ数', suffix: '', valueDigits: 0, summaryDigits: 2, logBinCount: 10, minimumLinearBinWidth: 1, defaultScale: 'LINEAR' },
]

const CHART_OPTIONS: Array<{ key: ChartKind; label: string }> = [
  { key: 'HISTOGRAM', label: 'ヒストグラム' },
  { key: 'ECDF', label: '累積分布' },
  { key: 'COMPARISON', label: '分布比較' },
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

interface ReferenceVisibility {
  mean: boolean
  median: boolean
}

export function useEnemyStatisticsControls() {
  const [selectedMetricKey, setSelectedMetricKey] = useState<AnalyzedStatKey>('maxHp')
  const [axisScale, setAxisScale] = useState<HistogramScale>('LOG')
  const [scatterMetricKey, setScatterMetricKey] = useState<AnalyzedStatKey>('defense')
  const [scatterScale, setScatterScale] = useState<HistogramScale>('LOG')
  const [linearBinWidthInput, setLinearBinWidthInput] = useState('')
  const [linearUpperBoundInput, setLinearUpperBoundInput] = useState('')
  const [ecdfXInput, setEcdfXInput] = useState('')
  const [ecdfYInput, setEcdfYInput] = useState('')
  const [referenceVisibility, setReferenceVisibility] = useState<ReferenceVisibility>({ mean: true, median: true })

  const selectedMetric = getMetric(selectedMetricKey)
  const scatterMetric = getMetric(scatterMetricKey)
  const selectMetric = (metric: StatMetric) => {
    if (metric.key !== selectedMetricKey) setEcdfXInput('')
    setSelectedMetricKey(metric.key)
    setAxisScale(metric.defaultScale)
    setLinearBinWidthInput('')
    setLinearUpperBoundInput('')

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

  return {
    selectedMetric, selectMetric, axisScale, setAxisScale,
    scatterMetric, selectScatterMetric, scatterScale, setScatterScale,
    linearBinWidthInput, setLinearBinWidthInput,
    linearUpperBoundInput, setLinearUpperBoundInput,
    ecdfXInput, setEcdfXInput, ecdfYInput, setEcdfYInput,
    referenceVisibility, setReferenceVisibility,
  }
}

type EnemyStatisticsControls = ReturnType<typeof useEnemyStatisticsControls>

function EnemyStatisticsSettings({ controls }: { controls: EnemyStatisticsControls }) {
  return (
    <fieldset className="enemy-statistics-settings">
      <legend>分布を見るステータス</legend>
      <div className="enemy-metric-selector" role="group" aria-label="分析するステータス">
        {STAT_METRICS.map((metric) => (
          <button
            type="button"
            className={metric.key === controls.selectedMetric.key ? 'active' : ''}
            aria-pressed={metric.key === controls.selectedMetric.key}
            onClick={() => controls.selectMetric(metric)}
            key={metric.key}
          >
            {metric.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

export function EnemyStatisticsPanel({ rows, allRows, scopeLabel, controls, filterControls }: {
  rows: EnemyRecord[]
  allRows: EnemyRecord[]
  scopeLabel: string
  controls: EnemyStatisticsControls
  filterControls: ReactNode
}) {
  const binWidthInputId = useId()
  const binWidthHelpId = useId()
  const upperBoundInputId = useId()
  const upperBoundHelpId = useId()
  const [chartChoice, setSelectedChart] = useState<ChartKind>('HISTOGRAM')
  const selectedChart = CHART_OPTIONS.some(({ key }) => key === chartChoice) ? chartChoice : 'HISTOGRAM'
  const [imageData, setImageData] = useState<EnemyChartImageData | null>(null)
  const [imageAspect, setImageAspect] = useState<ChartImageAspectSettings>({ preset: 'auto', width: '16', height: '9' })
  const [savingImage, setSavingImage] = useState(false)
  const [imageFeedback, setImageFeedback] = useState<'saved' | 'downloaded' | 'failed' | null>(null)
  const imageSaveInProgress = useRef(false)
  const imageSavePicker = getChartImageSavePicker()
  const {
    selectedMetric, axisScale, setAxisScale,
    scatterMetric, selectScatterMetric, scatterScale, setScatterScale,
    linearBinWidthInput, setLinearBinWidthInput,
    linearUpperBoundInput, setLinearUpperBoundInput,
    ecdfXInput, setEcdfXInput, ecdfYInput, setEcdfYInput,
    referenceVisibility, setReferenceVisibility,
  } = controls
  const metricSource = useMemo(
    () => rows.map((enemy) => getEnemyMetricValue(enemy, selectedMetric.key)),
    [rows, selectedMetric.key],
  )
  const observations = useMemo(
    () => buildMetricObservations(rows, selectedMetric.key),
    [rows, selectedMetric.key],
  )
  const ecdfPoints = useMemo(() => calculateEmpiricalCdf(metricSource), [metricSource])
  const ecdfX = parseEcdfGuideInput(ecdfXInput, 'x')
  const ecdfY = parseEcdfGuideInput(ecdfYInput, 'y')
  const ecdfGuides: EcdfGuideValues = { x: ecdfX.value, yPercent: ecdfY.value }
  const ecdfReadings = calculateEcdfGuideReadings(ecdfPoints, ecdfGuides)
  const customHistogramMaximum = useMemo(
    () => getCustomLinearHistogramMaximum(metricSource, selectedMetric.minimumLinearBinWidth),
    [metricSource, selectedMetric.minimumLinearBinWidth],
  )
  const automaticLinearStatistics = useMemo(
    () => calculateNumericStatisticsWithDispersion(metricSource, selectedMetric.logBinCount, 'LINEAR', selectedMetric.minimumLinearBinWidth),
    [metricSource, selectedMetric.logBinCount, selectedMetric.minimumLinearBinWidth],
  )
  const automaticBinWidth = automaticLinearStatistics.histogram?.binWidth ?? selectedMetric.minimumLinearBinWidth
  const parsedLinearUpperBound = linearUpperBoundInput.trim() === '' ? null : Number(linearUpperBoundInput)
  const invalidUpperBound = parsedLinearUpperBound !== null
    && (!Number.isFinite(parsedLinearUpperBound) || parsedLinearUpperBound <= 0)
  const requestedUpperBound = invalidUpperBound ? null : parsedLinearUpperBound
  const parsedLinearBinWidth = linearBinWidthInput.trim() === '' ? null : Number(linearBinWidthInput)
  const linearBinWidthValidation = parsedLinearBinWidth === null
    ? null
    : validateCustomLinearBinWidth(parsedLinearBinWidth, requestedUpperBound ?? customHistogramMaximum ?? 0)
  const upperBoundValidation = requestedUpperBound === null || parsedLinearBinWidth !== null
    ? null
    : validateCustomLinearBinWidth(automaticBinWidth, requestedUpperBound)
  const invalidDisplayRange = requestedUpperBound !== null
    && !Number.isFinite(requestedUpperBound + (parsedLinearBinWidth ?? automaticBinWidth))
  const linearUpperBoundError = invalidUpperBound
    ? '0より大きい数値を入力してください'
    : invalidDisplayRange
      ? '上限または階級幅を小さくしてください'
    : upperBoundValidation?.error === 'TOO_MANY_BINS'
      ? `通常階級は最大${MAX_CUSTOM_LINEAR_BIN_COUNT}階級です。上限を小さくするか、階級幅を指定してください`
      : null
  const linearBinWidthError = parsedLinearBinWidth === null
    ? null
    : getLinearBinWidthError(linearBinWidthValidation?.error ?? null)
  const histogramSettingsError = linearBinWidthError ?? linearUpperBoundError
  const customLinearBinWidth = !histogramSettingsError && linearBinWidthValidation?.valid
    ? parsedLinearBinWidth
    : null
  const customLinearUpperBound = histogramSettingsError ? null : requestedUpperBound
  const statistics = useMemo(
    () => calculateNumericStatisticsWithDispersion(
      metricSource,
      selectedMetric.logBinCount,
      axisScale,
      selectedMetric.minimumLinearBinWidth,
      customLinearBinWidth,
      customLinearUpperBound,
    ),
    [metricSource, selectedMetric.logBinCount, selectedMetric.minimumLinearBinWidth, axisScale, customLinearBinWidth, customLinearUpperBound],
  )
  const scatterObservations = useMemo(
    () => selectedChart === 'SCATTER' ? buildScatterObservations(rows, selectedMetric.key, scatterMetric.key) : [],
    [rows, selectedChart, selectedMetric.key, scatterMetric.key],
  )
  const canSaveImage = (selectedChart === 'SCATTER' ? scatterObservations.length : statistics.count) > 0
    && !(selectedChart === 'HISTOGRAM' && axisScale === 'LINEAR' && histogramSettingsError)
    && !(selectedChart === 'ECDF' && (ecdfX.error || ecdfY.error))
  const hasFixedEmptyHistogram = selectedChart === 'HISTOGRAM' && axisScale === 'LINEAR'
    && customLinearUpperBound !== null && statistics.bins.length > 0
  const previewAspect = imageAspect.preset === 'auto' ? undefined : Number(imageAspect.width) / Number(imageAspect.height)

  const openImageSaveDialog = () => {
    if (!canSaveImage || imageSaveInProgress.current || selectedChart === 'COMPARISON') return
    setImageFeedback(null)
    // Keep the preview and saved image on the same data, even if the source updates.
    setImageData({ kind: selectedChart, metric: selectedMetric, scale: axisScale, statistics, observations,
      scatterObservations, scatterMetric, scatterScale, scopeLabel, customLinearUpperBound, ecdfGuides,
      referenceVisibility: { ...referenceVisibility } })
  }

  const saveChartImage = async (filename: string, aspectRatio?: number) => {
    if (!imageData || imageSaveInProgress.current) return
    imageSaveInProgress.current = true
    setSavingImage(true)
    setImageFeedback(null)
    try {
      const destination = await selectChartImageDestination(filename, imageSavePicker)
      if (destination.type === 'cancelled') return
      const groupCount = new Set(imageData.observations.map(({ enemy }) => enemy.levelType)).size
      const layout = getEnemyChartImageLayout({ kind: imageData.kind, aspectRatio, groupCount })
      await saveComparisonChartImage({
        chart: <EnemyChartImage data={imageData} aspectRatio={aspectRatio} />,
        width: layout.width,
        filename,
        writeBlob: destination.type === 'file' ? destination.write : undefined,
      })
      setImageFeedback(destination.type === 'file' ? 'saved' : 'downloaded')
      setImageData(null)
    } catch {
      setImageFeedback('failed')
    } finally {
      imageSaveInProgress.current = false
      setSavingImage(false)
    }
  }

  return (
    <>
      <CollapsibleCalculatorPanel
        id="enemy-statistics"
        number="01"
        title="統計サマリー"
        summary={`${selectedMetric.label} · ${scopeLabel} · 値なし ${statistics.missingCount}体`}
        defaultOpen
        collapsedLabel="統計を開く"
        className="enemy-statistics-panel"
        bodyClassName="enemy-statistics-body"
      >
        <StatisticsSummary statistics={statistics} metric={selectedMetric} />
      </CollapsibleCalculatorPanel>

      <CollapsibleCalculatorPanel
        id="enemy-distribution"
        number="02"
        title="分布グラフ"
        summary={selectedChart === 'COMPARISON' ? `${selectedMetric.label} · 分布比較`
          : `${selectedMetric.label} · ${CHART_OPTIONS.find((chart) => chart.key === selectedChart)?.label} · ${scopeLabel} · 対象 ${rows.length}体`}
        defaultOpen
        collapsedLabel="グラフを開く"
        className="enemy-distribution-panel"
        bodyClassName="enemy-distribution-body"
      >
        {selectedChart !== 'COMPARISON' && filterControls}
        <EnemyStatisticsSettings controls={controls} />
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
          {selectedChart !== 'COMPARISON' && statistics.count > 0 && (
            <div className="enemy-chart-axis-control">
              <span>横軸</span>
              <ScaleSwitch
                scale={axisScale}
                onChange={setAxisScale}
                label={`${selectedMetric.label}の横軸目盛`}
              />
            </div>
          )}
          {selectedChart !== 'COMPARISON' && <button type="button" className="button secondary enemy-chart-save-button"
            aria-haspopup="dialog" disabled={!canSaveImage || savingImage} aria-busy={savingImage}
            onClick={openImageSaveDialog}>{savingImage ? '画像を保存中…' : '画像を保存'}</button>}
        </div>

        {selectedChart === 'HISTOGRAM' && axisScale === 'LINEAR' && (
          <div
            className="statistics-histogram-settings enemy-histogram-settings"
            role="group"
            aria-labelledby="enemy-histogram-settings-heading"
          >
            <div className="statistics-histogram-settings-heading">
              <strong id="enemy-histogram-settings-heading">ヒストグラム設定</strong>
            </div>
            <div className="enemy-histogram-fields">
            <div className="statistics-bin-width-control">
              <label htmlFor={binWidthInputId}>
                階級幅{selectedMetric.suffix ? `（${selectedMetric.suffix}）` : ''}
              </label>
              <div className="statistics-bin-width-input-row">
                <input
                  id={binWidthInputId}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={linearBinWidthInput}
                  placeholder="自動"
                  aria-invalid={linearBinWidthError !== null}
                  aria-describedby={binWidthHelpId}
                  onChange={(event) => setLinearBinWidthInput(event.target.value)}
                />
                {linearBinWidthInput !== '' && (
                  <button
                    type="button"
                    onClick={() => setLinearBinWidthInput('')}
                    aria-label="階級幅を自動設定に戻す"
                  >
                    自動
                  </button>
                )}
              </div>
              <small
                id={binWidthHelpId}
                className={linearBinWidthError ? 'error' : ''}
                aria-live="polite"
              >
                {linearBinWidthError
                  ?? (linearBinWidthValidation?.valid
                    ? `${statistics.bins.length}階級で集計`
                    : `自動：${formatHistogramSetting(automaticBinWidth, selectedMetric.suffix)}`)}
              </small>
            </div>
            <div className="statistics-bin-width-control">
              <div className="enemy-histogram-upper-label">
                <label htmlFor={upperBoundInputId}>通常階級の上限{selectedMetric.suffix ? `（${selectedMetric.suffix}）` : ''}</label>
                <EnemyHistogramOverflowHelp
                  upperBoundLabel={histogramSettingsError || !statistics.histogram ? null
                    : formatHistogramSetting(statistics.histogram.normalRangeEnd, selectedMetric.suffix)}
                  isCustom={customLinearUpperBound !== null}
                  hasOverflow={statistics.bins.some((bin) => bin.isOverflow && bin.count > 0)}
                />
              </div>
              <div className="statistics-bin-width-input-row">
                <input id={upperBoundInputId} type="number" inputMode="decimal" min="0" step="any"
                  value={linearUpperBoundInput} placeholder="自動"
                  aria-invalid={linearUpperBoundError !== null} aria-describedby={upperBoundHelpId}
                  onChange={(event) => setLinearUpperBoundInput(event.target.value)} />
                {linearUpperBoundInput !== '' && <button type="button"
                  onClick={() => setLinearUpperBoundInput('')} aria-label="通常階級の上限を自動設定に戻す">自動</button>}
              </div>
              <small id={upperBoundHelpId} className={linearUpperBoundError ? 'error' : ''} aria-live="polite">
                {linearUpperBoundError ?? (statistics.histogram
                  ? `${customLinearUpperBound === null ? '自動' : '固定'}：${formatHistogramSetting(statistics.histogram.normalRangeEnd, selectedMetric.suffix)}${statistics.histogram.hasOverflow ? '超をまとめる' : ''}`
                  : '数値データがありません')}
              </small>
            </div>
            </div>
          </div>
        )}

        {selectedChart === 'ECDF' && <EnemyEcdfGuideControls
          metricLabel={selectedMetric.label} suffix={selectedMetric.suffix}
          xInput={ecdfXInput} yInput={ecdfYInput} onXChange={setEcdfXInput} onYChange={setEcdfYInput}
          xError={ecdfX.error} yError={ecdfY.error} readings={ecdfReadings} hasData={statistics.count > 0}
        />}

        <EnemyDistributionComparison rows={allRows} metric={selectedMetric} active={selectedChart === 'COMPARISON'} />

        <div className="enemy-chart-stack" hidden={selectedChart === 'COMPARISON'}>
          {rows.length === 0 && !hasFixedEmptyHistogram ? <ChartEmpty message="条件に一致する敵がいません" /> : <>
          {selectedChart === 'HISTOGRAM' && (
            <HistogramFigure statistics={statistics} metric={selectedMetric} scopeLabel={scopeLabel} scale={axisScale}
              referenceVisibility={referenceVisibility} onReferenceVisibilityChange={setReferenceVisibility} />
          )}
          {selectedChart === 'ECDF' && (
            <EcdfFigure
              statistics={statistics}
              points={ecdfPoints}
              guides={ecdfGuides}
              referenceVisibility={referenceVisibility}
              onReferenceVisibilityChange={setReferenceVisibility}
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
          </>}
        </div>
        <p className="visually-hidden" role="status">
          {imageFeedback === 'saved' ? 'PNG画像を保存しました。'
            : imageFeedback === 'downloaded' ? 'PNG画像のダウンロードを開始しました。' : ''}
        </p>
      </CollapsibleCalculatorPanel>
      {imageData && CHART_OPTIONS.some(({ key }) => key === imageData.kind) && <ChartImageSaveDialog
        initialFilename={getEnemyChartImageFilename({ kind: imageData.kind, metricLabel: imageData.metric.label,
          secondaryMetricLabel: imageData.scatterMetric.label, scopeLabel: imageData.scopeLabel,
          ecdfGuides: imageData.kind === 'ECDF' ? imageData.ecdfGuides : undefined,
          histogramSettings: imageData.kind === 'HISTOGRAM' && imageData.scale === 'LINEAR' && imageData.statistics.histogram?.binWidth
            ? { binWidth: imageData.statistics.histogram.binWidth, upperBound: imageData.statistics.histogram.normalRangeEnd }
            : undefined })}
        aspect={imageAspect}
        onAspectChange={setImageAspect}
        canChooseLocation={!!imageSavePicker}
        saving={savingImage}
        error={imageFeedback === 'failed'}
        helpMode="popover"
        preview={<EnemyChartImagePreview key={`${imageData.kind}-${previewAspect}`} data={imageData} aspectRatio={previewAspect} />}
        onClose={() => {
          if (imageSaveInProgress.current) return
          setImageData(null)
          setImageFeedback(null)
        }}
        onSave={(filename, aspectRatio) => void saveChartImage(filename, aspectRatio)}
      />}
    </>
  )
}

interface EnemyChartImageData {
  kind: ChartKind
  metric: StatMetric
  scale: HistogramScale
  statistics: NumericStatistics
  observations: MetricObservation[]
  scatterObservations: ScatterObservation[]
  scatterMetric: StatMetric
  scatterScale: HistogramScale
  scopeLabel: string
  customLinearUpperBound: number | null
  ecdfGuides: EcdfGuideValues
  referenceVisibility: ReferenceVisibility
}

function EnemyChartImage({ data, aspectRatio, onLayout }: {
  data: EnemyChartImageData
  aspectRatio?: number
  onLayout?: (size: { width: number; height: number }) => void
}) {
  const titleId = useId()
  const descriptionId = useId()
  const { kind, metric, scale, statistics, observations, scatterObservations, scatterMetric, scatterScale, scopeLabel } = data
  const boxGroups = useMemo(() => kind === 'BOX' ? buildBoxPlotGroups(observations) : [], [kind, observations])
  const individualGroups = useMemo(() => kind === 'INDIVIDUAL' ? buildIndividualGroups(observations) : [], [kind, observations])
  const cdfPoints = useMemo(() => kind === 'ECDF' ? calculateEmpiricalCdf(observations.map(({ value }) => value)) : [], [kind, observations])
  const presentLevels = LEVEL_ORDER.filter((levelType) => (kind === 'SCATTER' ? scatterObservations : observations)
    .some(({ enemy }) => enemy.levelType === levelType))
  const title = kind === 'SCATTER' ? `${metric.label}と${scatterMetric.label}の散布図`
    : `${metric.label}の${CHART_OPTIONS.find((option) => option.key === kind)?.label}`
  const count = kind === 'SCATTER' ? scatterObservations.length : statistics.count
  const missingCount = statistics.count + statistics.missingCount - count
  const axisMinimum = kind === 'SCATTER' ? Math.min(...scatterObservations.map(({ x }) => x)) : statistics.minimum
  const axisLabel = `${metric.axisLabel}（${getEffectiveScaleName(scale, axisMinimum)}目盛）`
  const conditions = [scopeLabel, `有効データ ${count}体`]
  if (missingCount > 0) conditions.push(`値なし ${missingCount}体を除外`)
  if (kind === 'HISTOGRAM') {
    const binWidth = statistics.histogram?.binWidth
    conditions.push(scale === 'LINEAR' && binWidth != null
      ? `階級幅 ${formatHistogramSetting(binWidth, metric.suffix)}`
      : `${statistics.bins.length}階級`)
    if (scale === 'LINEAR' && data.customLinearUpperBound !== null) {
      conditions.push(`上限 ${formatHistogramSetting(data.customLinearUpperBound, metric.suffix)}`)
    }
  }
  if (kind === 'ECDF') {
    const readings = calculateEcdfGuideReadings(cdfPoints, data.ecdfGuides)
    if (readings.x) conditions.push(`縦線 ${formatHistogramSetting(readings.x.value, metric.suffix)}${readings.x.inRange ? '' : '（表示範囲外）'}`)
    if (readings.y) conditions.push(`横線 ${formatHistogramSetting(readings.y.percentage, '%')}`)
  }

  return <ChartImageFrame className="enemy-chart-image" title={title} conditions={conditions.join(' · ')}
    axisTitle={axisLabel} naturalChartHeight={getEnemyChartNaturalHeight(kind, presentLevels.length)}
    aspectRatio={aspectRatio} onLayout={onLayout} legend={<>
      {kind === 'BOX' && <BoxPlotLegend />}
      {(kind === 'SCATTER' || kind === 'INDIVIDUAL') && <EnemyLevelLegend levelTypes={presentLevels} />}
      {kind === 'INDIVIDUAL' && <div className="enemy-chart-legend"><span className="median"><i aria-hidden="true" />中央値</span></div>}
    </>}>
    {({ width, height }) => {
      const shared = { metric, statistics, scale, width, height, titleId, descriptionId, image: true }
      return <>
        {kind === 'HISTOGRAM' && <HistogramSvg {...shared} referenceVisibility={data.referenceVisibility} description={`${scopeLabel}の${metric.label}のヒストグラム`} />}
        {kind === 'ECDF' && <EcdfSvg {...shared} points={cdfPoints} guides={data.ecdfGuides} referenceVisibility={data.referenceVisibility} description={`${scopeLabel}の${metric.label}の累積分布`} />}
        {kind === 'BOX' && <BoxPlotSvg {...shared} groups={boxGroups} />}
        {kind === 'SCATTER' && <ScatterSvg observations={scatterObservations} xMetric={metric} xScale={scale}
          yMetric={scatterMetric} yScale={scatterScale} width={width} height={height}
          titleId={titleId} descriptionId={descriptionId} image />}
        {kind === 'INDIVIDUAL' && <IndividualPlotSvg {...shared} groups={individualGroups} />}
      </>
    }}
  </ChartImageFrame>
}

function EnemyChartImagePreview({ data, aspectRatio }: { data: EnemyChartImageData; aspectRatio?: number }) {
  const previewRef = useRef<HTMLDivElement>(null)
  const [availableWidth, setAvailableWidth] = useState(600)
  const [size, setSize] = useState<{ width: number; height: number }>(() => getEnemyChartImageLayout({ kind: data.kind, aspectRatio,
    groupCount: new Set(data.observations.map(({ enemy }) => enemy.levelType)).size }))
  useLayoutEffect(() => {
    const element = previewRef.current
    if (!element) return
    const measure = () => setAvailableWidth(Math.max(1, element.clientWidth))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const scale = Math.min(availableWidth / size.width, 380 / size.height, 1)
  const pixelRatio = Math.min(2, 16_000 / size.width, 16_000 / size.height, Math.sqrt(32_000_000 / size.width / size.height))
  return <div className="enemy-chart-image-preview">
    <div className="enemy-chart-image-preview-heading"><span>プレビュー</span><span>PNG</span></div>
    <div ref={previewRef} className="enemy-chart-image-preview-frame" style={{ height: Math.ceil(size.height * scale) }}>
      <div className="enemy-chart-image-preview-position" style={{ width: size.width, height: size.height,
        left: (availableWidth - size.width * scale) / 2, transform: `scale(${scale})` }}>
        <EnemyChartImage data={data} aspectRatio={aspectRatio} onLayout={setSize} />
      </div>
    </div>
    <span className="enemy-chart-image-preview-size" aria-live="polite">
      {formatNumber(Math.floor(size.width * pixelRatio), 0)} × {formatNumber(Math.floor(size.height * pixelRatio), 0)} px
    </span>
  </div>
}

function StatisticsSummary({ statistics, metric }: { statistics: NumericStatisticsWithDispersion; metric: StatMetric }) {
  const formatValue = (value: number | null, digits = metric.summaryDigits) => (
    value === null ? '—' : formatNumber(value, digits, metric.suffix)
  )
  const formatPercentage = (value: number | null) => (
    value === null
      ? '—'
      : new Intl.NumberFormat('ja-JP', {
        style: 'percent',
        maximumFractionDigits: 1,
      }).format(value)
  )
  const containsNegativeValue = statistics.minimum !== null && statistics.minimum < 0
  const coefficientOfVariationDetail = statistics.coefficientOfVariation !== null
    ? null
    : statistics.count === 0
      ? '有効データなし'
      : containsNegativeValue
        ? '負値を含むため算出なし'
        : '平均が0のため算出なし'
  const iqrValue = formatValue(statistics.interquartileRange)
  const normalizedIqrDetail = statistics.normalizedInterquartileRange !== null
    ? null
    : statistics.count === 0
      ? '有効データなし'
      : containsNegativeValue
        ? '負値を含むため算出なし'
        : '中央値が0のため算出なし'

  return (
    <div className="enemy-stat-summary">
      <dl className="enemy-stat-summary-grid" aria-label={`${metric.label}の統計量`}>
        <StatisticsItem label="最小" value={formatValue(statistics.minimum, metric.valueDigits)} />
        <StatisticsItem label="第1四分位" value={formatValue(statistics.firstQuartile)} />
        <StatisticsItem label="中央値" value={formatValue(statistics.median)} />
        <StatisticsItem label="第3四分位" value={formatValue(statistics.thirdQuartile)} />
        <StatisticsItem label="最大" value={formatValue(statistics.maximum, metric.valueDigits)} />
        <StatisticsItem label="有効データ" value={`${statistics.count}体`} />
        <StatisticsItem label="平均" value={formatValue(statistics.mean)} />
        <StatisticsItem label="標準偏差" value={formatValue(statistics.standardDeviation)} />
        <StatisticsItem label="変動係数（CV）" value={formatPercentage(statistics.coefficientOfVariation)} />
        <StatisticsItem label="正規化IQR" value={formatPercentage(statistics.normalizedInterquartileRange)} detail={`IQR ${iqrValue}`} />
      </dl>
      <details className="enemy-stat-summary-help">
        <summary>統計量の見方</summary>
        <dl>
          <div>
            <dt>有効データ・値なし</dt>
            <dd>数値のないデータは集計から除外します。0は有効データに含めます。</dd>
          </div>
          <div>
            <dt>第1・第3四分位</dt>
            <dd>データを小さい順に並べたときの25%点・75%点です。</dd>
          </div>
          <div>
            <dt>変動係数（CV）</dt>
            <dd>
              標準偏差 ÷ 平均を%で表示します。平均が0、または負値を含む場合は算出しません。
              {coefficientOfVariationDetail && <span className="enemy-stat-summary-note">現在の対象：{coefficientOfVariationDetail}</span>}
            </dd>
          </div>
          <div>
            <dt>四分位範囲（IQR）</dt>
            <dd>第3四分位 − 第1四分位です。</dd>
          </div>
          <div>
            <dt>正規化IQR</dt>
            <dd>
              IQR ÷ 中央値を%で表示します。中央値が0、または負値を含む場合は算出しません。
              {normalizedIqrDetail && <span className="enemy-stat-summary-note">現在の対象：{normalizedIqrDetail}</span>}
            </dd>
          </div>
        </dl>
      </details>
    </div>
  )
}

function StatisticsItem({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="enemy-stat-summary-item">
      <dt>{label}</dt>
      <dd>
        {value}
        {detail && <small className="enemy-stat-summary-note">{detail}</small>}
      </dd>
    </div>
  )
}

function HistogramFigure({
  statistics,
  metric,
  scopeLabel,
  scale,
  referenceVisibility,
  onReferenceVisibilityChange,
}: {
  statistics: NumericStatistics
  metric: StatMetric
  scopeLabel: string
  scale: HistogramScale
  referenceVisibility: ReferenceVisibility
  onReferenceVisibilityChange: (visibility: ReferenceVisibility) => void
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
        {statistics.count > 0 && <MeanMedianLegend visibility={referenceVisibility} onChange={onReferenceVisibilityChange} />}
      </figcaption>
      <div className="enemy-chart-container" ref={chartContainerRef}>
        {statistics.bins.length === 0 ? (
          <ChartEmpty />
        ) : (
          <HistogramSvg
            statistics={statistics}
            referenceVisibility={referenceVisibility}
            metric={metric}
            width={chartWidth}
            titleId={titleId}
            descriptionId={descriptionId}
            description={chartDescription}
            scale={scale}
          />
        )}
      </div>
      {statistics.bins.length > 0 && <FrequencyDistributionTable statistics={statistics} metric={metric} scale={scale} />}
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
    <PersistentDetails persistenceId="frequency-distribution" className="enemy-frequency-details">
      <summary>
        <span>度数分布表</span>
        <small>{statistics.bins.length}階級</small>
      </summary>
      {isAdaptiveLinear && histogram && (
        <dl className="enemy-frequency-meta" aria-label={`${metric.label}の階級設定`}>
          <div>
            <dt>階級幅</dt>
            <dd>{formatHistogramSetting(histogram.binWidth ?? 0, metric.suffix)}</dd>
          </div>
          <div>
            <dt>通常範囲</dt>
            <dd>
              {formatCompactRange(histogram.normalRangeStart, histogram.normalRangeEnd, metric)}
              （{statistics.count > 0 ? formatNumber((normalCount / statistics.count) * 100, 1, '%') : '—'}）
            </dd>
          </div>
          <div>
            <dt>上限超過</dt>
            <dd>{histogram.hasOverflow ? `${formatHistogramSetting(histogram.normalRangeEnd, metric.suffix)}超` : 'なし'}</dd>
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
                <td>{statistics.count > 0 ? formatNumber(proportion * 100, 1, '%') : '—'}</td>
                <td title={`累積度数：${rowCumulativeCount}`}>{statistics.count > 0 ? formatNumber(cumulativeProportion * 100, 1, '%') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PersistentDetails>
  )
}

function HistogramSvg({
  statistics,
  referenceVisibility,
  metric,
  width,
  titleId,
  descriptionId,
  description,
  scale,
  height = CHART_HEIGHT,
  image = false,
}: {
  statistics: NumericStatistics
  referenceVisibility: ReferenceVisibility
  metric: StatMetric
  width: number
  titleId: string
  descriptionId: string
  description: string
  scale: HistogramScale
  height?: number
  image?: boolean
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
  const plotRight = width - CHART_MARGIN.right
  const plotBottom = height - (image ? 18 : CHART_MARGIN.bottom)
  const plotWidth = Math.max(1, plotRight - plotLeft)
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
  const referenceLabels = useImageReferenceLabels(statistics, metric, referencePosition, plotLeft, plotRight, image, referenceVisibility)
  const plotTop = image ? referenceLabels.top : CHART_MARGIN.top
  const plotHeight = plotBottom - plotTop
  const overflowTick = isAdaptiveLinear && histogram.hasOverflow
    ? {
      value: histogram.normalRangeEnd + ((histogram.binWidth ?? 0) / 2),
      label: `${formatHistogramSetting(histogram.normalRangeEnd, metric.suffix)}超`,
    }
    : undefined
  const y = (value: number) => plotBottom - ((value / countMaximum) * plotHeight)
  const barGap = Math.min(3, Math.max(1, plotWidth / Math.max(1, statistics.bins.length) * 0.08))

  return (
    <svg className="enemy-stat-chart" viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-labelledby={`${titleId} ${descriptionId}`}>
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

      {statistics.count > 0 && <MeanMedianReferences statistics={statistics} visibility={referenceVisibility} metric={metric} position={referencePosition} plotLeft={plotLeft} plotRight={plotRight} plotTop={plotTop} plotBottom={plotBottom} imageLabels={image ? referenceLabels : undefined} />}
      <BottomAxis
        ticks={xTicks}
        position={valueScale.position}
        metric={metric}
        plotLeft={plotLeft}
        plotRight={plotRight}
        plotBottom={plotBottom}
        axisLabel={`${metric.axisLabel}（${valueScale.effectiveScale === 'LOG' ? '対数' : '線形'}目盛）`}
        extraTick={overflowTick}
        preciseTicks={isAdaptiveLinear}
        chartHeight={height}
        showTitle={!image}
      />
      <VerticalAxisTitle label="敵数" x={14} plotTop={plotTop} plotBottom={plotBottom} />
    </svg>
  )
}

function EcdfFigure({
  statistics,
  points,
  guides,
  metric,
  scopeLabel,
  scale,
  referenceVisibility,
  onReferenceVisibilityChange,
}: {
  statistics: NumericStatistics
  points: EmpiricalCdfPoint[]
  guides: EcdfGuideValues
  metric: StatMetric
  scopeLabel: string
  scale: HistogramScale
  referenceVisibility: ReferenceVisibility
  onReferenceVisibilityChange: (visibility: ReferenceVisibility) => void
}) {
  const [chartContainerRef, chartWidth] = useChartWidth()
  const titleId = useId()
  const descriptionId = useId()
  const scaleName = getEffectiveScaleName(scale, statistics.minimum)

  return (
    <figure className="enemy-analysis-figure">
      <figcaption>
        <div>
          <strong>{metric.label}の累積分布</strong>
          <span>横軸：{metric.axisLabel}（{scaleName}目盛） · 縦軸：その値以下の敵の割合</span>
        </div>
        {statistics.count > 0 && <MeanMedianLegend visibility={referenceVisibility} onChange={onReferenceVisibilityChange}
          showGuides={guides.x !== null || guides.yPercent !== null} />}
      </figcaption>
      <div className="enemy-chart-container" ref={chartContainerRef}>
        {statistics.count === 0 ? (
          <ChartEmpty />
        ) : (
          <EcdfSvg
            statistics={statistics}
            referenceVisibility={referenceVisibility}
            points={points}
            guides={guides}
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

function EcdfSvg({ statistics, points, guides, referenceVisibility, metric, width, scale, titleId, descriptionId, description, height = CHART_HEIGHT, image = false }: {
  statistics: NumericStatistics
  points: EmpiricalCdfPoint[]
  guides: EcdfGuideValues
  referenceVisibility: ReferenceVisibility
  metric: StatMetric
  width: number
  scale: HistogramScale
  titleId: string
  descriptionId: string
  description: string
  height?: number
  image?: boolean
}) {
  const minimum = statistics.minimum ?? 0
  const maximum = statistics.maximum ?? minimum
  const plotLeft = CHART_MARGIN.left
  const plotRight = width - CHART_MARGIN.right
  const plotBottom = height - (image ? 18 : CHART_MARGIN.bottom)
  const plotWidth = Math.max(1, plotRight - plotLeft)
  const valueScale = createValueScale(minimum, maximum, plotLeft, plotRight, scale)
  const readings = calculateEcdfGuideReadings(points, guides)
  const hasGuides = readings.x !== null || readings.y !== null
  const referenceLabels = useImageReferenceLabels(statistics, metric, valueScale.position, plotLeft, plotRight, image || hasGuides, referenceVisibility, 4)
  const plotTop = (image ? referenceLabels.top : CHART_MARGIN.top) + (readings.x?.inRange ? 20 : 0)
  const plotHeight = plotBottom - plotTop
  const xTicks = createScaleTicks(minimum, maximum, width < 480 ? 3 : 5, scale)
  const yTicks = [0, 0.25, 0.5, 0.75, 1]
  const y = (value: number) => plotBottom - (value * plotHeight)
  const path = createEcdfPath(points, valueScale.position, y)

  return (
    <svg className="enemy-stat-chart" viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-labelledby={`${titleId} ${descriptionId}`}>
      <title id={titleId}>{metric.label}の累積分布</title>
      <desc id={descriptionId}>{description}{readings.x ? ` 縦線：${formatHistogramSetting(readings.x.value, metric.suffix)}。` : ''}{readings.y ? ` 横線：${formatHistogramSetting(readings.y.percentage, '%')}。` : ''}</desc>
      {yTicks.map((tick) => (
        <g key={tick}>
          <line className="enemy-chart-gridline" x1={plotLeft} x2={plotRight} y1={y(tick)} y2={y(tick)} />
          <text className="enemy-chart-tick" x={plotLeft - 8} y={y(tick) + 4} textAnchor="end">{Math.round(tick * 100)}%</text>
        </g>
      ))}
      <rect className="enemy-chart-frame" x={plotLeft} y={plotTop} width={plotWidth} height={plotHeight} />
      <path className="enemy-chart-line ecdf" d={path} />
      {!image && points.map((point) => (
        <circle className="enemy-ecdf-point" cx={valueScale.position(point.value)} cy={y(point.proportion)} r={2.5} key={point.value}>
          <title>{formatNumber(point.value, metric.valueDigits, metric.suffix)}以下：{point.cumulativeCount}体（{formatNumber(point.proportion * 100, 1)}%）</title>
        </circle>
      ))}
      <MeanMedianReferences statistics={statistics} visibility={referenceVisibility} metric={metric} position={valueScale.position} plotLeft={plotLeft} plotRight={plotRight} plotTop={plotTop} plotBottom={plotBottom} imageLabels={image || hasGuides ? referenceLabels : undefined} />
      <EcdfGuideLines readings={readings} metric={metric} position={valueScale.position} y={y}
        plotLeft={plotLeft} plotRight={plotRight} plotTop={plotTop} plotBottom={plotBottom} />
      <BottomAxis ticks={xTicks} position={valueScale.position} metric={metric} plotLeft={plotLeft} plotRight={plotRight} plotBottom={plotBottom} axisLabel={`${metric.axisLabel}（${valueScale.effectiveScale === 'LOG' ? '対数' : '線形'}目盛）`} chartHeight={height} showTitle={!image} />
      <VerticalAxisTitle label="累積割合" x={14} plotTop={plotTop} plotBottom={plotBottom} />
    </svg>
  )
}

function EcdfGuideLines({ readings, metric, position, y, plotLeft, plotRight, plotTop, plotBottom }: {
  readings: ReturnType<typeof calculateEcdfGuideReadings>
  metric: StatMetric
  position: (value: number) => number
  y: (proportion: number) => number
  plotLeft: number
  plotRight: number
  plotTop: number
  plotBottom: number
}) {
  const xLabelRef = useRef<SVGTextElement>(null)
  const yLabelRef = useRef<SVGTextElement>(null)
  const [labelWidths, setLabelWidths] = useState({ x: 0, y: 0 })
  const vertical = readings.x?.inRange ? readings.x : null
  const horizontal = readings.y
  const verticalText = vertical ? `${metric.label} ${formatHistogramSetting(vertical.value, metric.suffix)}` : ''
  const horizontalText = horizontal ? formatHistogramSetting(horizontal.percentage, '%') : ''
  useLayoutEffect(() => {
    let active = true
    const measure = () => {
      if (!active) return
      const x = xLabelRef.current?.getComputedTextLength() ?? 0
      const y = yLabelRef.current?.getComputedTextLength() ?? 0
      setLabelWidths((current) => current.x === x && current.y === y ? current : { x, y })
    }
    measure()
    void document.fonts.ready.then(measure)
    return () => { active = false }
  }, [verticalText, horizontalText])
  const halfWidth = (labelWidths.x || verticalText.length * 11) / 2
  const verticalX = vertical ? position(vertical.value) : 0
  const labelX = Math.max(plotLeft + halfWidth, Math.min(plotRight - halfWidth, verticalX))
  const horizontalLabelY = horizontal ? Math.max(plotTop + 15, y(horizontal.percentage / 100) - 8) : 0
  const horizontalLabelWidth = labelWidths.y || horizontalText.length * 11

  return <g className="enemy-ecdf-guides">
    {vertical && <>
      <line className="enemy-ecdf-guide-line vertical" x1={verticalX} x2={verticalX} y1={plotTop} y2={plotBottom} />
      <circle className="enemy-ecdf-guide-point vertical" cx={verticalX} cy={y(vertical.proportion)} r={3.5}>
        <title>{formatHistogramSetting(vertical.value, metric.suffix)}以下：{formatNumber(vertical.proportion * 100, 1, '%')}（{vertical.cumulativeCount}体）</title>
      </circle>
      <text ref={xLabelRef} className="enemy-ecdf-guide-label vertical" x={labelX} y={plotTop - 6} textAnchor="middle">{verticalText}</text>
    </>}
    {horizontal && <>
      <line className="enemy-ecdf-guide-line horizontal" x1={plotLeft} x2={plotRight} y1={y(horizontal.percentage / 100)} y2={y(horizontal.percentage / 100)} />
      {horizontal.value !== null && <circle className="enemy-ecdf-guide-point horizontal"
        cx={position(horizontal.value)} cy={y(horizontal.percentage / 100)} r={3.5}>
        <title>{formatHistogramSetting(horizontal.percentage, '%')}以上になる最小{metric.label}：{formatHistogramSetting(horizontal.value, metric.suffix)}</title>
      </circle>}
      <rect className="enemy-ecdf-guide-label-background" x={plotRight - 9 - horizontalLabelWidth}
        y={horizontalLabelY - 12} width={horizontalLabelWidth + 6} height={16} />
      <text ref={yLabelRef} className="enemy-ecdf-guide-label horizontal" x={plotRight - 6}
        y={horizontalLabelY} textAnchor="end">{horizontalText}</text>
    </>}
  </g>
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
          <BoxPlotLegend />
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

function BoxPlotSvg({ statistics, groups, metric, width, scale, titleId, descriptionId, height: imageHeight, image = false }: {
  statistics: NumericStatistics
  groups: BoxPlotGroup[]
  metric: StatMetric
  width: number
  scale: HistogramScale
  titleId: string
  descriptionId: string
  height?: number
  image?: boolean
}) {
  const height = imageHeight ?? Math.max(190, 80 + (groups.length * 54))
  const plotLeft = width < 440 ? 64 : 82
  const plotRight = width - 18
  const plotTop = image ? 6 : 20
  const plotBottom = height - (image ? 18 : 48)
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
      <BottomAxis ticks={ticks} position={valueScale.position} metric={metric} plotLeft={plotLeft} plotRight={plotRight} plotBottom={plotBottom} axisLabel={`${metric.axisLabel}（${valueScale.effectiveScale === 'LOG' ? '対数' : '線形'}目盛）`} chartHeight={height} showTitle={!image} />
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

function ScatterSvg({ observations, xMetric, xScale, yMetric, yScale, width, titleId, descriptionId, height = SCATTER_CHART_HEIGHT, image = false }: {
  observations: ScatterObservation[]
  xMetric: StatMetric
  xScale: HistogramScale
  yMetric: StatMetric
  yScale: HistogramScale
  width: number
  titleId: string
  descriptionId: string
  height?: number
  image?: boolean
}) {
  const plotLeft = width < 480 ? 58 : 66
  const plotTop = image ? 6 : 22
  const plotRight = width - 18
  const plotBottom = height - (image ? 18 : 58)
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
    <svg className="enemy-stat-chart enemy-scatter-chart" viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-labelledby={`${titleId} ${descriptionId}`}>
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
      <BottomAxis ticks={xTicks} position={xValueScale.position} metric={xMetric} plotLeft={plotLeft} plotRight={plotRight} plotBottom={plotBottom} axisLabel={`${xMetric.axisLabel}（${xValueScale.effectiveScale === 'LOG' ? '対数' : '線形'}目盛）`} chartHeight={height} showTitle={!image} />
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

function IndividualPlotSvg({ statistics, groups, metric, width, scale, titleId, descriptionId, height: imageHeight, image = false }: {
  statistics: NumericStatistics
  groups: IndividualGroup[]
  metric: StatMetric
  width: number
  scale: HistogramScale
  titleId: string
  descriptionId: string
  height?: number
  image?: boolean
}) {
  const height = imageHeight ?? Math.max(190, 78 + (groups.length * 54))
  const plotLeft = width < 440 ? 64 : 82
  const plotRight = width - 18
  const plotTop = image ? 6 : 20
  const plotBottom = height - (image ? 18 : 48)
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
      <BottomAxis ticks={ticks} position={valueScale.position} metric={metric} plotLeft={plotLeft} plotRight={plotRight} plotBottom={plotBottom} axisLabel={`${metric.axisLabel}（${valueScale.effectiveScale === 'LOG' ? '対数' : '線形'}目盛）`} chartHeight={height} showTitle={!image} />
    </svg>
  )
}

function BoxPlotLegend() {
  return <div className="enemy-chart-legend box" aria-label="箱ひげ図の凡例">
    <span className="box-median"><i aria-hidden="true" />中央値</span>
    <span className="box-mean"><i aria-hidden="true" />平均</span>
    <span className="box-outlier"><i aria-hidden="true" />外れ値</span>
  </div>
}

function MeanMedianLegend({ visibility, onChange, showGuides = false }: {
  visibility: ReferenceVisibility
  onChange: (visibility: ReferenceVisibility) => void
  showGuides?: boolean
}) {
  return (
    <div className="enemy-chart-legend enemy-reference-controls" role="group" aria-label="基準線の表示">
      <label className="mean">
        <input type="checkbox" checked={visibility.mean} onChange={(event) => onChange({ ...visibility, mean: event.target.checked })} />
        <i aria-hidden="true" />平均
      </label>
      <label className="median">
        <input type="checkbox" checked={visibility.median} onChange={(event) => onChange({ ...visibility, median: event.target.checked })} />
        <i aria-hidden="true" />中央値
      </label>
      {showGuides && <span className="ecdf-guide"><i aria-hidden="true" />補助線</span>}
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

function useImageReferenceLabels(statistics: NumericStatistics, metric: StatMetric, position: (value: number) => number,
  plotLeft: number, plotRight: number, enabled: boolean, visibility: ReferenceVisibility, topInset = 0) {
  const meanRef = useRef<SVGTextElement>(null)
  const medianRef = useRef<SVGTextElement>(null)
  const meanText = `平均 ${formatNumber(statistics.mean ?? 0, metric.summaryDigits, metric.suffix)}`
  const medianText = `中央値 ${formatNumber(statistics.median ?? 0, metric.summaryDigits, metric.suffix)}`
  const [widths, setWidths] = useState({ mean: 0, median: 0 })
  useLayoutEffect(() => {
    if (!enabled) return
    let active = true
    const measure = () => {
      if (!active) return
      const mean = meanRef.current?.getComputedTextLength() ?? 0
      const median = medianRef.current?.getComputedTextLength() ?? 0
      setWidths((current) => current.mean === mean && current.median === median ? current : { mean, median })
    }
    measure()
    void document.fonts.ready.then(measure)
    return () => { active = false }
  }, [enabled, meanText, medianText, visibility.mean, visibility.median])

  const mean = { x: position(statistics.mean ?? statistics.minimum ?? 0), width: widths.mean || meanText.length * 11, y: 10 + topInset }
  const median = { x: position(statistics.median ?? statistics.minimum ?? 0), width: widths.median || medianText.length * 11, y: 10 + topInset }
  const [left, right] = [visibility.median ? median : null, visibility.mean ? mean : null]
    .filter((label): label is typeof mean => label !== null).sort((a, b) => a.x - b.x)
  const clampStart = (x: number, width: number) => Math.max(plotLeft, Math.min(plotRight - width, x))
  if (left) left.x = clampStart(left.x + (right ? -left.width - 4 : 4), left.width)
  if (right) right.x = clampStart(right.x + 4, right.width)
  // Keep each label beside its line; only edge collisions need a second row.
  const overlap = left && right && left.x + left.width + 6 > right.x
  if (overlap) right.y += 16
  return { meanRef, medianRef, mean, median, top: (overlap ? 32 : 16) + topInset }
}

function MeanMedianReferences({ statistics, visibility, metric, position, plotLeft, plotRight, plotTop, plotBottom, imageLabels }: {
  statistics: NumericStatistics
  visibility: ReferenceVisibility
  metric: StatMetric
  position: (value: number) => number
  plotLeft: number
  plotRight: number
  plotTop: number
  plotBottom: number
  imageLabels?: ReturnType<typeof useImageReferenceLabels>
}) {
  const meanX = position(statistics.mean ?? statistics.minimum ?? 0)
  const medianX = position(statistics.median ?? statistics.minimum ?? 0)
  const labelsOverlap = visibility.mean && visibility.median && Math.abs(meanX - medianX) < 72
  return (
    <>
      {visibility.mean && <>
        <line className="enemy-chart-reference mean" x1={meanX} x2={meanX} y1={plotTop} y2={plotBottom} />
        <text ref={imageLabels?.meanRef} className="enemy-chart-reference-label mean" x={imageLabels?.mean.x ?? clampLabelX(meanX, plotLeft, plotRight)} y={imageLabels?.mean.y ?? 14}>平均 {formatNumber(statistics.mean ?? 0, metric.summaryDigits, metric.suffix)}</text>
      </>}
      {visibility.median && <>
        <line className="enemy-chart-reference median" x1={medianX} x2={medianX} y1={plotTop} y2={plotBottom} />
        <text ref={imageLabels?.medianRef} className="enemy-chart-reference-label median" x={imageLabels?.median.x ?? clampLabelX(medianX, plotLeft, plotRight)} y={imageLabels?.median.y ?? (labelsOverlap ? 29 : 14)}>中央値 {formatNumber(statistics.median ?? 0, metric.summaryDigits, metric.suffix)}</text>
      </>}
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
  preciseTicks = false,
  showTitle = true,
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
  preciseTicks?: boolean
  showTitle?: boolean
}) {
  const tickLabelRefs = useRef<Array<SVGTextElement | null>>([])
  const extraLabelRef = useRef<SVGTextElement>(null)
  const labels = ticks.map((tick) => preciseTicks ? formatHistogramSetting(tick) : formatNumber(tick, metric.valueDigits))
  const labelKey = JSON.stringify(labels)
  const [labelWidths, setLabelWidths] = useState<{ ticks: number[]; extra: number }>({ ticks: [], extra: 0 })
  useLayoutEffect(() => {
    if (!extraTick) return
    let active = true
    const measure = () => {
      if (!active || !extraLabelRef.current) return
      const ticks = tickLabelRefs.current.map((element) => element?.getComputedTextLength() ?? 0)
      const extra = extraLabelRef.current.getComputedTextLength()
      setLabelWidths((current) => current.extra === extra
        && current.ticks.length === ticks.length
        && current.ticks.every((width, index) => width === ticks[index])
        ? current
        : { ticks, extra })
    }
    measure()
    void document.fonts.ready.then(measure)
    return () => { active = false }
  }, [labelKey, extraTick?.label, plotLeft, plotRight])

  const extraLabelWidth = labelWidths.extra || (extraTick?.label.length ?? 0) * 11
  const extraLabelX = extraTick
    ? Math.max(plotLeft + extraLabelWidth / 2, Math.min(plotRight - extraLabelWidth / 2, position(extraTick.value)))
    : 0
  const overlapsExtraLabel = (index: number) => {
    if (!extraTick) return false
    const width = labelWidths.ticks[index] || labels[index].length * 11
    const x = position(ticks[index])
    const left = index === 0 ? x : index === ticks.length - 1 ? x - width : x - width / 2
    return left < extraLabelX + extraLabelWidth / 2 + 8
      && left + width > extraLabelX - extraLabelWidth / 2 - 8
  }

  return (
    <>
      {ticks.map((tick, index) => (
        <g key={`${tick}-${index}`}>
          <line className="enemy-chart-axis-tick" x1={position(tick)} x2={position(tick)} y1={plotBottom} y2={plotBottom + 5} />
          <text ref={(element) => { tickLabelRefs.current[index] = element }} className="enemy-chart-tick"
            x={position(tick)} y={plotBottom + 19} textAnchor={index === 0 ? 'start' : index === ticks.length - 1 ? 'end' : 'middle'}
            visibility={overlapsExtraLabel(index) ? 'hidden' : undefined} aria-hidden={overlapsExtraLabel(index) || undefined}>
            {labels[index]}
          </text>
        </g>
      ))}
      {extraTick && (
        <g>
          <line className="enemy-chart-axis-tick" x1={position(extraTick.value)} x2={position(extraTick.value)} y1={plotBottom} y2={plotBottom + 5} />
          <text ref={extraLabelRef} className="enemy-chart-tick enemy-chart-overflow-tick" x={extraLabelX} y={plotBottom + 19} textAnchor="middle">
            {extraTick.label}
          </text>
        </g>
      )}
      {showTitle && <text className="enemy-chart-axis-title" x={(plotLeft + plotRight) / 2} y={chartHeight - 8} textAnchor="middle">{axisLabel}</text>}
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
    const value = getEnemyMetricValue(enemy, metricKey)
    return typeof value === 'number' && Number.isFinite(value) ? [{ enemy, value }] : []
  })
}

function buildScatterObservations(rows: EnemyRecord[], xMetricKey: AnalyzedStatKey, yMetricKey: AnalyzedStatKey): ScatterObservation[] {
  return rows.flatMap((enemy) => {
    const x = getEnemyMetricValue(enemy, xMetricKey)
    const y = getEnemyMetricValue(enemy, yMetricKey)
    return typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y) ? [{ enemy, x, y }] : []
  })
}

function getEnemyMetricValue(enemy: EnemyRecord, metricKey: AnalyzedStatKey): number | null {
  return metricKey === 'stageAppearanceCount'
    ? enemy.stageAppearanceCount
    : enemy.stats[metricKey]
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

function getLinearBinWidthError(
  error: 'INVALID' | 'TOO_MANY_BINS' | null,
): string | null {
  if (error === 'INVALID') return '0より大きい数値を入力してください'
  if (error === 'TOO_MANY_BINS') {
    return `階級数が多すぎます（通常階級は最大${MAX_CUSTOM_LINEAR_BIN_COUNT}階級）`
  }
  return null
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
  const format = (value: number) => statistics.histogram?.binWidth !== null
    ? formatHistogramSetting(value, metric.suffix)
    : formatNumber(value, metric.summaryDigits, metric.suffix)
  if (bin.isOverflow) {
    return `${format(bin.start)}超`
  }
  if (bin.start === bin.end) {
    return format(bin.start)
  }
  return `${format(bin.start)}以上、${format(bin.end)}${bin.includesMaximum ? '以下' : '未満'}`
}

function formatCompactRange(start: number, end: number, metric: StatMetric): string {
  return `${formatHistogramSetting(start)}～${formatHistogramSetting(end, metric.suffix)}`
}

function formatHistogramSetting(value: number, suffix = ''): string {
  return `${new Intl.NumberFormat('ja-JP', { maximumSignificantDigits: 12 }).format(value)}${suffix}`
}

function formatNumber(value: number, maximumFractionDigits: number, suffix = ''): string {
  return `${new Intl.NumberFormat('ja-JP', { maximumFractionDigits }).format(value)}${suffix}`
}
