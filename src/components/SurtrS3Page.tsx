import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SkillRecord } from '../types/skill'
import { SURTR_OPERATOR_ID, deriveSurtrDpsModel, buildSurtrDpsCurve, type SurtrDpsSettings } from '../lib/surtrDps'
import { getSurtrModuleChoices, getSelectedSurtrModuleStages, type SurtrModuleChoice } from '../lib/surtrModuleComparison'
import { getSurtrDpsImageFilename, getSurtrCombinedImageFilename } from '../lib/surtrDpsImageFilename'
import { readEnemyHistogramSnapshot, writeEnemyHistogramSnapshot, type EnemyHistogramSnapshot } from '../lib/enemyHistogramSnapshot'
import { readSurtrDpsPageState, writeSurtrDpsPageState } from '../lib/surtrDpsPageState'
import { calculateSurtrDpsCalculation } from '../lib/surtrDpsCalculation'
import { getSurtrDpsResistanceSamples, isValidSurtrDpsResistanceRange, type SurtrDpsBarStep, type SurtrDpsResistanceRange } from '../lib/surtrDpsResistance'
import { transformSurtrDpsSeries, getSurtrDpsOutputTsv, type SurtrDpsMetric } from '../lib/surtrDpsOutput'
import { buildSurtrUnequippedComparisonSeries, type SurtrUnequippedLayout, type SurtrUnequippedMetric } from '../lib/surtrUnequippedComparison'
import { buildSurtrDpsBlockComparison } from '../lib/surtrDpsBlockComparison'
import { writeClipboardText } from '../lib/clipboard'
import { isValidHpChartYAxisRange } from '../lib/goldenglowTargetSwitchHpAxis'
import { withChartImageAspect } from '../lib/chartImageFilename'
import { withChartImageLabelFilename, type ChartImageLabelOverrides } from '../lib/chartImageLabels'
import { getChartImageLayout } from '../lib/chartImageLayout'
import { getChartImageSavePicker, selectChartImageDestination } from '../lib/chartImageDestination'
import { SURTR_HOME_LINK } from '../lib/navigation'
import { PageBreadcrumbs } from './PageBreadcrumbs'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { ChartImageSaveDialog, type ChartImageAspectSettings } from './ChartImageSaveDialog'
import { ChartImageLabelEditor } from './ChartImageLabelEditor'
import { SurtrDpsChart, SurtrDpsChartImage, SurtrDpsChartImagePreview, getSurtrDpsImageLabelDefaults,
  type SurtrDpsChartSeries, type SurtrDpsChartKind, type SurtrDpsChartYAxis } from './SurtrDpsChart'
import { saveComparisonChartImage } from './saveComparisonChartImage'
import { SurtrDpsDetailModal, type SurtrDpsDetailSnapshot } from './SurtrDpsDetailModal'
import { SurtrCombinedChartImage, SurtrCombinedChartImagePreview, getSurtrCombinedImageLayout } from './SurtrCombinedChartImage'
import { OperatorModuleComparison } from './OperatorModuleComparison'
import { EnemyResistanceHistogramEditor } from './EnemyResistanceHistogramEditor'
import { SurtrModuleStageSelection } from './SurtrModuleStageSelection'
import { SurtrUnequippedComparisonTable } from './SurtrUnequippedComparisonTable'
import './DamageCalculator.css'
import './SurtrS3Page.css'

const format = (value: number) => new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 }).format(value)
const skillLabel = (index: number) => index < 7 ? `ランク${index + 1}` : `特化${index - 6}`
interface ImageSnapshot {
  id: number; series: SurtrDpsChartSeries[]; conditions: string; filename: string
  kind: SurtrDpsChartKind; barStep: SurtrDpsBarStep; showValues: boolean; metric: SurtrDpsMetric; title: string
  resistanceRange: SurtrDpsResistanceRange
  showResistanceRanks: boolean
  labels?: ChartImageLabelOverrides
  blockComparisons: { blocking: boolean; series: SurtrDpsChartSeries[]; conditions: string }[] | null
  blockComparisonFilename: string
  blockComparisonConditions: string
  histogram: EnemyHistogramSnapshot | null
  gridStyle: 'none' | 'dashed' | 'solid'; precision: number; yAxis: SurtrDpsChartYAxis; selectedResistance: number | null
}

export function SurtrS3Page({ rows, loading, error, onRetry }: {
  rows: readonly SkillRecord[]
  loading: boolean
  error: string | null
  onRetry: () => void
}) {
  const record = rows.find(row => row.operatorId === SURTR_OPERATOR_ID && row.skillIndex === 3)
  const [initialState] = useState(readSurtrDpsPageState)
  const [settings, setSettings] = useState<SurtrDpsSettings>(initialState.settings)
  const [excluded, setExcluded] = useState(initialState.excluded)
  const [moduleLevels, setModuleLevels] = useState(initialState.moduleLevels)
  const [chartKind, setChartKind] = useState<SurtrDpsChartKind>(initialState.chartKind)
  const [barStep, setBarStep] = useState<SurtrDpsBarStep>(initialState.barStep)
  const [customBarStep, setCustomBarStep] = useState(typeof initialState.barStep === 'number' && ![10, 20].includes(initialState.barStep))
  const [barStepDraft, setBarStepDraft] = useState(String(typeof initialState.barStep === 'number' ? initialState.barStep : 20))
  const [resistanceRange, setResistanceRange] = useState<SurtrDpsResistanceRange>(initialState.resistanceRange)
  const [resistanceRangeDraft, setResistanceRangeDraft] = useState({ min: String(initialState.resistanceRange.min), max: String(initialState.resistanceRange.max) })
  const [showValues, setShowValues] = useState(initialState.showValues)
  const [showResistanceRanks, setShowResistanceRanks] = useState(initialState.showResistanceRanks)
  const [gridStyle, setGridStyle] = useState(initialState.gridStyle)
  const [precision, setPrecision] = useState(initialState.precision)
  const [metric, setMetric] = useState<SurtrDpsMetric>(initialState.metric)
  const [differenceMetric, setDifferenceMetric] = useState<'difference' | 'percent'>(initialState.differenceMetric)
  const [requestedBaselineId, setRequestedBaselineId] = useState(initialState.requestedBaselineId)
  const [unequippedLayout, setUnequippedLayout] = useState<SurtrUnequippedLayout>(initialState.unequippedLayout)
  const [unequippedMetric, setUnequippedMetric] = useState<SurtrUnequippedMetric>(initialState.unequippedMetric)
  const [selectedResistance, setSelectedResistance] = useState<number | null>(initialState.selectedResistance)
  const [yAxisMode, setYAxisMode] = useState<SurtrDpsChartYAxis['mode']>(initialState.yAxisMode)
  const [yAxisDraft, setYAxisDraft] = useState(initialState.yAxisDraft)
  const [includeHistogram, setIncludeHistogram] = useState(false)
  const [compareBlocking, setCompareBlocking] = useState(false)
  const [histogramEditor, setHistogramEditor] = useState<{ initialSnapshot: EnemyHistogramSnapshot | null; wasIncluded: boolean } | null>(null)
  const [histogramDraft, setHistogramDraft] = useState<EnemyHistogramSnapshot | null>(null)
  const [histogramStorageError, setHistogramStorageError] = useState(false)
  const histogramEditTrigger = useRef<HTMLButtonElement>(null)
  const receiveHistogramDraft = useCallback((snapshot: EnemyHistogramSnapshot | null) => setHistogramDraft(snapshot), [])
  useEffect(() => {
    writeSurtrDpsPageState({ settings, excluded, moduleLevels, chartKind, barStep, resistanceRange, showValues, showResistanceRanks,
      gridStyle, precision, metric, differenceMetric, requestedBaselineId, unequippedLayout, unequippedMetric, selectedResistance, yAxisMode, yAxisDraft })
  }, [settings, excluded, moduleLevels, chartKind, barStep, resistanceRange, showValues, showResistanceRanks,
    gridStyle, precision, metric, differenceMetric, requestedBaselineId, unequippedLayout, unequippedMetric, selectedResistance, yAxisMode, yAxisDraft])
  const [copyFeedback, setCopyFeedback] = useState<{ text: string; ok: boolean } | null>(null)
  const [copying, setCopying] = useState(false)
  const [image, setImage] = useState<ImageSnapshot | null>(null)
  const [detail, setDetail] = useState<SurtrDpsDetailSnapshot | null>(null)
  const [aspect, setAspect] = useState<ChartImageAspectSettings>({ preset: 'auto', width: '16', height: '9' })
  const [saving, setSaving] = useState(false)
  const [imageFeedback, setImageFeedback] = useState<'saved' | 'downloaded' | 'failed' | null>(null)
  const saveInProgress = useRef(false)
  const nextSnapshot = useRef(0)
  const picker = getChartImageSavePicker()
  const maximumLevel = record?.operatorProfile.phases[2]?.maxLevel ?? 90
  const effectiveSettings = useMemo(() => ({ ...settings,
    level: Math.min(maximumLevel, settings.level),
    skillLevelIndex: Math.min(settings.skillLevelIndex, Math.max(0, (record?.skillLevels.length ?? 10) - 1)),
  }), [settings, maximumLevel, record])
  const choices = useMemo(() => getSurtrModuleChoices(record?.operatorProfile, effectiveSettings.level), [record, effectiveSettings.level])
  const toggleModuleLevel = (choice: SurtrModuleChoice, level: number, checked: boolean) => {
    setModuleLevels(previous => {
      const selected = excluded.includes(choice.id) ? [] : previous[choice.id] ?? [choice.levels.at(-1) ?? 3]
      return { ...previous, [choice.id]: choice.levels.filter(candidate => candidate === level ? checked : selected.includes(candidate)) }
    })
    setExcluded(previous => previous.filter(id => id !== choice.id))
  }
  const comparison = useMemo(() => {
    if (!record) return []
    return getSelectedSurtrModuleStages(choices, excluded, moduleLevels).map(choice => {
      const model = deriveSurtrDpsModel(record, effectiveSettings, choice.moduleId, choice.level)
      return { ...choice, model, points: model ? buildSurtrDpsCurve(model).map(point => ({ x: point.resistance, value: point.dps })) : [] }
    })
  }, [record, choices, excluded, effectiveSettings, moduleLevels])
  const series = useMemo<SurtrDpsChartSeries[]>(() => comparison.filter(item => item.model).map(item => ({
    id: item.id, label: item.label, color: item.color, lineStyle: item.lineStyle, points: item.points,
  })), [comparison])
  const unequipped = useMemo(() => {
    const selected = comparison.find(item => item.id === 'none')
    if (selected) return selected
    if (!record) return null
    const choice = getSelectedSurtrModuleStages(choices.filter(item => item.id === ''))[0]
    if (!choice) return null
    const model = deriveSurtrDpsModel(record, effectiveSettings, choice.moduleId, choice.level)
    return { ...choice, model, points: model ? buildSurtrDpsCurve(model).map(point => ({ x: point.resistance, value: point.dps })) : [] }
  }, [comparison, record, choices, effectiveSettings])
  const invalidModels = comparison.filter(item => !item.model)
  const baseline = series.find(item => item.id === requestedBaselineId) ?? series[0]
  const effectiveMetric = series.length > 1 ? metric : 'total'
  const outputSeries = useMemo(() => transformSurtrDpsSeries(series, effectiveMetric, baseline?.id ?? ''), [series, effectiveMetric, baseline?.id])
  const chartSeries = effectiveMetric === 'total' ? outputSeries : outputSeries.filter(item => item.id !== baseline?.id)
  const outputTitle = effectiveMetric === 'total' ? 'DPS' : effectiveMetric === 'difference' ? `${baseline?.label}とのDPS差` : `${baseline?.label}からの増加率`
  const outputResistances = useMemo(() => [...new Set([
    ...getSurtrDpsResistanceSamples(10, resistanceRange),
    ...(selectedResistance === null || selectedResistance < resistanceRange.min || selectedResistance > resistanceRange.max ? [] : [selectedResistance]),
  ])].sort((a, b) => a - b), [selectedResistance, resistanceRange])
  const outputFormatter = useMemo(() => new Intl.NumberFormat('ja-JP', { minimumFractionDigits: precision, maximumFractionDigits: precision }), [precision])
  const formatOutput = (value: number | null | undefined) => {
    if (value == null) return '—'
    const rounded = Number(value.toFixed(precision))
    return `${outputFormatter.format(rounded === 0 ? 0 : rounded)}${effectiveMetric === 'percent' ? '%' : ''}`
  }
  const tableText = invalidModels.length ? '' : getSurtrDpsOutputTsv(outputSeries, outputResistances, precision, effectiveMetric)
  const copyState = copyFeedback?.text === tableText ? copyFeedback.ok : null
  const yAxis: SurtrDpsChartYAxis = chartKind === 'bar' ? { mode: 'zero' } : {
    mode: yAxisMode, ...(yAxisMode === 'manual' ? { min: Number(yAxisDraft.min), max: Number(yAxisDraft.max) } : {}),
  }
  const yAxisError = yAxis.mode === 'manual' && (!yAxisDraft.min.trim() || !yAxisDraft.max.trim()
    || !isValidHpChartYAxisRange({ min: yAxis.min!, max: yAxis.max! }))
    ? '最小値より大きい最大値を入力してください。' : ''
  const changeMetric = (next: SurtrDpsMetric) => { setMetric(next); setYAxisMode('zero') }
  const barStepError = chartKind === 'bar' && customBarStep
    && (!barStepDraft.trim() || !Number.isInteger(Number(barStepDraft)) || Number(barStepDraft) < 1 || Number(barStepDraft) > 100)
    ? '刻みは1〜100の整数で指定してください。' : ''
  const changeBarStep = (value: string) => {
    setCustomBarStep(value === 'custom')
    if (value === 'custom') {
      const next = typeof barStep === 'number' ? barStep : 20
      setBarStepDraft(String(next))
      setBarStep(next)
    } else setBarStep(value === 'ratings' ? 'ratings' : Number(value))
  }
  const updateBarStepDraft = (value: string) => {
    setBarStepDraft(value)
    const next = Number(value)
    if (value.trim() && Number.isInteger(next) && next >= 1 && next <= 100) setBarStep(next)
  }
  const resistanceRangeError = !resistanceRangeDraft.min.trim() || !resistanceRangeDraft.max.trim()
    || !isValidSurtrDpsResistanceRange({ min: Number(resistanceRangeDraft.min), max: Number(resistanceRangeDraft.max) })
    ? '0〜100の整数で、終了を開始より大きくしてください。' : ''
  const updateResistanceRange = (bound: 'min' | 'max', value: string) => {
    const draft = { ...resistanceRangeDraft, [bound]: value }
    setResistanceRangeDraft(draft)
    const next = { min: Number(draft.min), max: Number(draft.max) }
    if (!draft.min.trim() || !draft.max.trim() || !isValidSurtrDpsResistanceRange(next)) return
    setResistanceRange(next)
    setSelectedResistance(previous => previous !== null && (previous < next.min || previous > next.max) ? null : previous)
  }
  const copyTable = async () => {
    if (!tableText || copying) return
    setCopying(true)
    try { await writeClipboardText(tableText); setCopyFeedback({ text: tableText, ok: true }) }
    catch { setCopyFeedback({ text: tableText, ok: false }) }
    finally { setCopying(false) }
  }
  const label = skillLabel(effectiveSettings.skillLevelIndex)
  const blockLabel = effectiveSettings.blocking ? '対象を自身でブロック' : '未ブロック'
  const openDetail = (resistance: number, requestedSeriesId?: string, unequippedDetailMetric?: SurtrUnequippedMetric | 'total') => {
    const useUnequippedComparison = unequippedDetailMetric !== undefined
    const entries = useUnequippedComparison && unequipped ? [unequipped, ...comparison.filter(item => item.id !== 'none')] : comparison
    const detailValues = unequipped && unequippedDetailMetric && unequippedDetailMetric !== 'total'
      ? buildSurtrUnequippedComparisonSeries(series, unequipped, unequippedDetailMetric) : outputSeries
    const detailSeries = entries.flatMap(item => {
      if (!item.model) return []
      const calculation = calculateSurtrDpsCalculation(item.model, resistance)
      if (!calculation) return []
      const id = item.id
      let value = detailValues.find(series => series.id === id)?.points.find(point => point.x === resistance)?.value ?? null
      if (unequippedDetailMetric === 'total') value = calculation.dps
      else if (useUnequippedComparison && id === 'none') {
        value = unequippedDetailMetric !== 'difference' && calculation.dps === 0 ? null : unequippedDetailMetric === 'ratio' ? 100 : 0
      }
      return [{ id, label: item.label, color: item.color, calculation, value }]
    })
    if (!detailSeries.length) return
    setSelectedResistance(resistance)
    const initialSeriesId = requestedSeriesId ?? (useUnequippedComparison && unequippedDetailMetric !== 'total'
      ? detailSeries.find(item => item.id !== 'none')?.id : undefined) ?? detailSeries[0].id
    setDetail({ resistance, series: detailSeries, initialSeriesId,
      metric: unequippedDetailMetric ?? effectiveMetric, baselineId: useUnequippedComparison ? 'none' : baseline?.id ?? '', precision,
      signedComparison: useUnequippedComparison,
      conditions: `昇進2 Lv.${effectiveSettings.level}・信頼度${effectiveSettings.trust}・潜在${effectiveSettings.potential}・S3 ${label}・${blockLabel}` })
  }
  const update = <K extends keyof SurtrDpsSettings>(key: K, value: SurtrDpsSettings[K]) => setSettings(previous => ({ ...previous, [key]: value }))
  const aspectRatio = aspect.preset !== 'auto' && [aspect.width, aspect.height].every(value => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 100)
    ? Number(aspect.width) / Number(aspect.height) : undefined
  const openImage = () => {
    setImageFeedback(null)
    setHistogramEditor(null)
    setHistogramDraft(null)
    setHistogramStorageError(false)
    if (!chartSeries.length || invalidModels.length || yAxisError || barStepError) return
    const blockComparisons = record ? buildSurtrDpsBlockComparison(record, effectiveSettings,
      comparison.map(item => ({ id: item.id, moduleId: item.moduleId, label: item.label, color: item.color,
        level: item.level, lineStyle: item.lineStyle })), effectiveMetric, baseline?.id ?? '') : null
    const filenameSettings = { ...effectiveSettings, skillLevelLabel: label, modules: series.map(item => item.label), kind: chartKind,
      barStep, resistanceRange, showValues, metric: effectiveMetric, baselineLabel: baseline?.label,
      gridStyle, precision, yAxis, selectedResistance, showResistanceRanks }
    setImage({ id: ++nextSnapshot.current, series: chartSeries, kind: chartKind, barStep, resistanceRange: { ...resistanceRange }, showValues: chartKind === 'bar' && showValues,
      title: `スルト S3 ${outputTitle}`, metric: effectiveMetric, gridStyle, precision, yAxis, selectedResistance, showResistanceRanks,
      conditions: `${label}・${blockLabel}`, histogram: readEnemyHistogramSnapshot(),
      blockComparisons: blockComparisons?.map(item => ({ ...item,
        series: effectiveMetric === 'total' ? item.series : item.series.filter(series => series.id !== baseline?.id),
        conditions: `${label}・${item.blocking ? '対象を自身でブロック' : '未ブロック'}`,
      })) ?? null,
      filename: getSurtrDpsImageFilename(filenameSettings),
      blockComparisonFilename: getSurtrDpsImageFilename({ ...filenameSettings, compareBlocking: true }),
      blockComparisonConditions: `${label}・ブロック状態比較`,
    })
  }
  const saveImage = async (filename: string, ratio?: number) => {
    if (!image || histogramEditor || saveInProgress.current) return
    saveInProgress.current = true
    setSaving(true)
    setImageFeedback(null)
    try {
      const destination = await selectChartImageDestination(filename, picker)
      if (destination.type === 'cancelled') return
      const histogram = includeHistogram ? image.histogram : null
      const blockComparisons = compareBlocking ? image.blockComparisons ?? undefined : undefined
      const stacked = !!blockComparisons || !!histogram
      await saveComparisonChartImage({ filename,
        width: stacked ? getSurtrCombinedImageLayout(ratio, blockComparisons?.length ?? 1, !!histogram).width
          : getChartImageLayout({ naturalChartHeight: 334, aspectRatio: ratio }).width,
        chart: stacked
          ? <SurtrCombinedChartImage {...image} blockComparisons={blockComparisons} histogram={histogram} aspectRatio={ratio} />
          : <SurtrDpsChartImage {...image} aspectRatio={ratio} />,
        writeBlob: destination.type === 'file' ? destination.write : undefined,
      })
      setImageFeedback(destination.type === 'file' ? 'saved' : 'downloaded')
      setImage(null)
    } catch { setImageFeedback('failed') }
    finally { saveInProgress.current = false; setSaving(false) }
  }
  const status = error ? <div className="error-box" role="alert">{error}<button className="button secondary" type="button" onClick={onRetry}>再読み込み</button></div>
    : <p className="surtr-s3-status" role="status">{loading ? 'スルトのデータを読み込み中…' : 'スルトS3のデータを取得できませんでした。'}</p>

  const previewHistogram = histogramEditor ? histogramDraft ?? image?.histogram : image?.histogram
  const previewBlockComparisons = compareBlocking ? image?.blockComparisons ?? undefined : undefined
  const stackedPreview = !!previewBlockComparisons || (includeHistogram && !!previewHistogram)
  const imageBaseFilename = image ? compareBlocking && image.blockComparisons ? image.blockComparisonFilename : image.filename : ''
  const finishHistogramEdit = (apply: boolean) => {
    if (!histogramEditor || (apply && !histogramDraft)) return
    if (apply && histogramDraft) {
      setImage(current => current ? { ...current, histogram: histogramDraft } : current)
      setHistogramStorageError(!writeEnemyHistogramSnapshot(histogramDraft))
    } else setIncludeHistogram(histogramEditor.wasIncluded)
    setHistogramEditor(null)
    setHistogramDraft(null)
    requestAnimationFrame(() => histogramEditTrigger.current?.focus({ preventScroll: true }))
  }

  return <section className="calculator-page surtr-s3-page" aria-labelledby="surtr-s3-title">
    <div className="page-heading-with-breadcrumbs">
      <PageBreadcrumbs parents={[SURTR_HOME_LINK]} current="S3分析" />
      <header className="page-intro"><h1 id="surtr-s3-title">S3分析<span className="surtr-s3-subtitle">ラグナロク</span></h1></header>
    </div>
    <CollapsibleCalculatorPanel id="surtr-s3-info" number="01" title="オペレーター情報" defaultOpen={false}
      summary="スルト・昇進2" collapsedLabel="情報を表示">
      {record ?
        <section aria-labelledby="surtr-s3-stats-title">
          <h3 id="surtr-s3-stats-title" className="surtr-s3-info-title">スキル中のステータス</h3>
          {comparison.length > 0 ? <div className="surtr-s3-table-wrap"><table className="surtr-s3-table" aria-label="スキル中のステータス">
        <thead><tr><th scope="col">スキル中のステータス</th>{comparison.map(item => <th key={item.id} scope="col">{item.label}</th>)}</tr></thead>
        <tbody>{[
          { label: '攻撃力', value: (item: typeof comparison[number]) => item.model ? format(item.model.effectiveAttack) : '—' },
          { label: '攻撃速度', value: (item: typeof comparison[number]) => item.model ? format(item.model.attackSpeed) : '—' },
          { label: '攻撃間隔（秒）', value: (item: typeof comparison[number]) => item.model ? format(item.model.attackInterval) : '—' },
          { label: '術耐性無視', value: (item: typeof comparison[number]) => item.model ? format(item.model.resistanceIgnore) : '—' },
          { label: '術脆弱', value: (item: typeof comparison[number]) => item.model ? `${format(item.model.artsFragility * 100)}%` : '—' },
        ].map(row => <tr key={row.label}><th scope="row">{row.label}</th>{comparison.map(item => <td key={item.id}>{row.value(item)}</td>)}</tr>)}</tbody>
          </table></div> : <p role="status">比較するMODを選択してください。</p>}
        </section> : status}
    </CollapsibleCalculatorPanel>
    <CollapsibleCalculatorPanel id="surtr-s3-modules" number="02" title="モジュール" defaultOpen={false}
      summary="スルト" collapsedLabel="モジュールを表示">
      {record ? <OperatorModuleComparison profile={record.operatorProfile} operatorName={record.operatorName} operatorId={record.operatorId} /> : status}
    </CollapsibleCalculatorPanel>
    <CollapsibleCalculatorPanel id="surtr-s3-settings" number="03" title="比較条件"
      summary={`${label}・潜在${effectiveSettings.potential}・${blockLabel}`} collapsedLabel="設定を表示">
      {record ? <>
        <div className="surtr-s3-fields">
          <label className="calculator-field"><span>レベル（昇進2）</span><input aria-label="レベル（昇進2）" type="number" min={1} max={maximumLevel} step={1} value={effectiveSettings.level}
            onChange={event => update('level', Math.max(1, Math.min(maximumLevel, Math.trunc(Number(event.target.value)) || 1)))} /></label>
          <label className="calculator-field"><span>信頼度</span><input aria-label="信頼度" type="number" min={0} max={100} step={1} value={effectiveSettings.trust}
            onChange={event => update('trust', Math.max(0, Math.min(100, Math.trunc(Number(event.target.value)) || 0)))} /></label>
          <label className="calculator-field"><span>スキルレベル</span><select aria-label="スキルレベル" value={effectiveSettings.skillLevelIndex} onChange={event => update('skillLevelIndex', Number(event.target.value))}>
            {record.skillLevels.map((_, index) => <option key={index} value={index}>{skillLabel(index)}</option>)}</select></label>
          <label className="calculator-field"><span>潜在</span><select aria-label="潜在" value={effectiveSettings.potential} onChange={event => update('potential', Number(event.target.value))}>
            {[1, 2, 3, 4, 5, 6].map(rank => <option key={rank} value={rank}>潜在{rank}</option>)}</select></label>
        </div>
        <SurtrModuleStageSelection choices={choices} excluded={excluded} moduleLevels={moduleLevels} onToggleLevel={toggleModuleLevel}
          onToggleNone={checked => setExcluded(previous => checked ? previous.filter(id => id !== '') : [...previous, ''])} />
        <div className="surtr-s3-block-setting"><span>ブロック状態</span><div className="surtr-s3-segments" role="group" aria-label="ブロック状態">
          <button type="button" aria-pressed={!effectiveSettings.blocking} onClick={() => update('blocking', false)}>未ブロック</button>
          <button type="button" aria-pressed={effectiveSettings.blocking} onClick={() => update('blocking', true)}>対象を自身でブロック</button>
        </div></div>
        <details className="surtr-s3-assumptions"><summary>計算条件</summary>
          <p>敵1体への連続攻撃を想定した理論DPSです。素質2「余燼」は含めません。通常時の素質1、MODの攻撃力・特性を反映し、外部バフとフレーム単位の攻撃間隔の丸めは含めません。</p>
          <p>未ブロックはスルトが誰もブロックしていない状態です。「対象を自身でブロック」は攻撃対象をスルト自身がブロックしている状態です。</p>
        </details>
      </> : status}
    </CollapsibleCalculatorPanel>
    <CollapsibleCalculatorPanel id="surtr-s3-output" number="04" title="計算結果" summary={outputTitle} collapsedLabel="結果を表示" className="surtr-s3-output-panel"
      headerActions={<>
        <label className="surtr-s3-output-control"><span>グラフ</span><select aria-label="グラフの表示形式" value={chartKind} onChange={event => setChartKind(event.target.value as SurtrDpsChartKind)}>
          <option value="bar">棒グラフ</option><option value="line">折れ線</option>
        </select></label>
        {chartKind === 'bar' && <div className="surtr-s3-step-control">
          <label className="surtr-s3-output-control"><span>術耐性の刻み</span><select aria-label="術耐性の刻み" value={customBarStep ? 'custom' : barStep} onChange={event => changeBarStep(event.target.value)}>
            <option value={10}>10</option><option value={20}>20</option><option value="ratings">ゲーム内表記</option><option value="custom">指定</option>
          </select></label>
          {customBarStep && <div className="surtr-s3-output-control">
            <input className="surtr-s3-step-input" aria-label="術耐性の刻みを指定" type="number" min="1" max="100" step="1"
              value={barStepDraft} aria-invalid={Boolean(barStepError)} aria-describedby={barStepError ? 'surtr-s3-step-error' : undefined}
              onChange={event => updateBarStepDraft(event.target.value)} />
          </div>}
        </div>}
        <details className="surtr-s3-comparison-options surtr-s3-resistance-range" onToggle={event => {
          if (!event.currentTarget.open) setResistanceRangeDraft({ min: String(resistanceRange.min), max: String(resistanceRange.max) })
        }} onKeyDown={event => {
          if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus() }
        }}><summary aria-label={`術耐性の範囲 ${resistanceRange.min}〜${resistanceRange.max}`}>範囲 {resistanceRange.min}〜{resistanceRange.max}</summary>
          <div className="surtr-s3-comparison-popover surtr-s3-resistance-popover">
            <div className="surtr-s3-resistance-bounds">
              {(['min', 'max'] as const).map(bound => <label className="calculator-field" key={bound}>
                <span>{bound === 'min' ? '開始' : '終了'}</span>
                <input type="number" min="0" max="100" step="1" aria-label={`${bound === 'min' ? '開始' : '終了'}術耐性`}
                  value={resistanceRangeDraft[bound]} aria-invalid={!!resistanceRangeError} aria-describedby={resistanceRangeError ? 'surtr-s3-resistance-error' : undefined}
                  onChange={event => updateResistanceRange(bound, event.target.value)} />
              </label>)}
            </div>
            {resistanceRangeError && <p className="surtr-s3-axis-error" id="surtr-s3-resistance-error" role="alert">{resistanceRangeError}</p>}
          </div>
        </details>
        {chartKind === 'bar' && <label className="surtr-s3-values-toggle"><input type="checkbox" checked={showValues} onChange={event => setShowValues(event.target.checked)} />数値を表示</label>}
        <label className="surtr-s3-values-toggle"><input type="checkbox" checked={showResistanceRanks} onChange={event => setShowResistanceRanks(event.target.checked)} />術耐性ランク表示</label>
        <label className="surtr-s3-output-control"><span>横の目盛線</span><select aria-label="横の目盛線" value={gridStyle} onChange={event => setGridStyle(event.target.value as typeof gridStyle)}>
          <option value="none">なし</option><option value="dashed">破線</option><option value="solid">実線</option>
        </select></label>
        <details className="surtr-s3-comparison-options" onKeyDown={event => {
          if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus() }
        }}><summary>比較表示</summary><div className="surtr-s3-comparison-popover">
          <label className="surtr-s3-difference-toggle"><input type="checkbox" checked={effectiveMetric !== 'total'} disabled={series.length < 2}
            onChange={event => changeMetric(event.target.checked ? differenceMetric : 'total')} />基準との差</label>
          {effectiveMetric !== 'total' && <>
            <label className="calculator-field"><span>基準の装備</span><select aria-label="基準の装備" value={baseline?.id ?? ''} onChange={event => { setRequestedBaselineId(event.target.value); setYAxisMode('zero') }}>
              {series.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select></label>
            <label className="calculator-field"><span>表示</span><select aria-label="比較の表示方法" value={effectiveMetric} onChange={event => {
              const next = event.target.value as 'difference' | 'percent'; setDifferenceMetric(next); changeMetric(next)
            }}><option value="difference">DPS差</option><option value="percent">増加率（%）</option></select></label>
          </>}
        </div></details>
        <label className="surtr-s3-output-control"><span>小数点以下</span><select aria-label="出力の小数点以下の桁数" value={precision} onChange={event => setPrecision(Number(event.target.value))}>
          {[0, 1, 2, 3].map(value => <option key={value} value={value}>{value}桁</option>)}
        </select></label>
        {barStepError && <p className="surtr-s3-axis-error" id="surtr-s3-step-error" role="alert">{barStepError}</p>}
      </>}>
      {!record ? status : invalidModels.length ? <p role="alert">{invalidModels.map(item => item.label).join('・')}の計算に必要なデータを取得できませんでした。</p>
        : !series.length ? <p className="surtr-s3-status" role="status">比較するMODを選択してください。</p> : <div className="surtr-s3-results-layout">
          <section className="surtr-s3-chart-section" aria-labelledby="surtr-s3-chart-title">
            <div className="surtr-s3-result-heading">
              <h3 id="surtr-s3-chart-title">{outputTitle}</h3>
              <div className="surtr-s3-result-actions">
                {chartKind === 'line' && <>
                  <label className="surtr-s3-output-control"><span>縦軸</span><select aria-label="縦軸の表示範囲" value={yAxisMode} onChange={event => setYAxisMode(event.target.value as typeof yAxisMode)}>
                    <option value="zero">{effectiveMetric === 'total' ? '0から' : '0を含む'}</option><option value="auto">データに合わせる</option><option value="manual">範囲を指定</option>
                  </select></label>
                  {yAxisMode === 'manual' && <div className="surtr-s3-axis-bounds" role="group" aria-label="縦軸の範囲指定">
                    {(['min', 'max'] as const).map(bound => <label className="surtr-s3-output-control" key={bound}><span>{bound === 'min' ? '最小' : '最大'}</span>
                      <input type="number" step="any" aria-label={`縦軸の${bound === 'min' ? '最小値' : '最大値'}`} value={yAxisDraft[bound]} aria-invalid={!!yAxisError} aria-describedby={yAxisError ? 'surtr-s3-axis-error' : undefined}
                        onChange={event => setYAxisDraft(previous => ({ ...previous, [bound]: event.target.value }))} />
                    </label>)}
                  </div>}
                </>}
                <button className="button secondary" type="button" disabled={!chartSeries.length || !!yAxisError || !!barStepError} onClick={openImage} aria-label="グラフをPNG画像で保存" aria-haspopup="dialog">画像を保存</button>
              </div>
              {yAxisError && <p className="surtr-s3-axis-error" id="surtr-s3-axis-error" role="alert">{yAxisError}</p>}
            </div>
            <div className="surtr-s3-chart-area"><SurtrDpsChart series={chartSeries} kind={chartKind} barStep={barStep} resistanceRange={resistanceRange} showValues={showValues} showResistanceRanks={showResistanceRanks} gridStyle={gridStyle} precision={precision}
              metric={effectiveMetric} yAxis={yAxis} selectedResistance={selectedResistance} onSelectResistance={setSelectedResistance} /></div>
            <div className="surtr-s3-readout">
              <label className="surtr-s3-output-control"><span>術耐性</span><select aria-label="選択する術耐性" value={selectedResistance ?? ''} onChange={event => setSelectedResistance(event.target.value === '' ? null : Number(event.target.value))}>
                <option value="">選択</option>{Array.from({ length: resistanceRange.max - resistanceRange.min + 1 }, (_, index) => index + resistanceRange.min).map(value => <option key={value} value={value}>{value}</option>)}
              </select></label>
              {chartSeries.map(item => <span className="surtr-s3-readout-value" key={item.id}><span><i style={{ backgroundColor: item.color }} />{item.label}</span>
                <strong>{formatOutput(item.points.find(point => point.x === selectedResistance)?.value)}</strong></span>)}
            </div>
          </section>
          <section className="surtr-s3-table-section" aria-labelledby="surtr-s3-table-title">
            <div className="surtr-s3-result-heading"><h3 id="surtr-s3-table-title">数値表</h3>
              <button type="button" className="button secondary" aria-label="数値表をコピー" disabled={!tableText || copying} onClick={() => void copyTable()}>
                {copying ? 'コピー中…' : copyState === true ? 'コピー済み' : copyState === false ? 'コピー失敗' : '表をコピー'}
              </button>
            </div>
            <span className="visually-hidden" role="status">{copyState === true ? '数値表をコピーしました。' : copyState === false ? '数値表をコピーできませんでした。' : ''}</span>
            <div className="surtr-s3-table-wrap surtr-s3-result-table"><table className="surtr-s3-table" aria-label={`術耐性ごとの${outputTitle}`}>
              <thead><tr><th scope="col">術耐性</th>{outputSeries.map(item => <th key={item.id} scope="col"><span className="surtr-s3-column-label"><i style={{ backgroundColor: item.color }} />{item.label}</span>
                {effectiveMetric !== 'total' && item.id === baseline?.id && <span className="surtr-s3-baseline-label">基準</span>}</th>)}</tr></thead>
              <tbody>{outputResistances.map(resistance => <tr key={resistance} className={selectedResistance === resistance ? 'is-selected' : undefined}
                onClick={event => {
                  const column = event.target instanceof Element ? event.target.closest('td[data-series-id]') : null
                  event.currentTarget.querySelector('button')?.focus({ preventScroll: true })
                  openDetail(resistance, column?.getAttribute('data-series-id') ?? undefined)
                }}>
                <th scope="row"><button type="button" className="surtr-s3-table-resistance" aria-label={`術耐性 ${resistance}の計算フローを開く`} aria-haspopup="dialog">{resistance}<span aria-hidden="true">›</span></button></th>
                {outputSeries.map(item => <td key={item.id} data-series-id={item.id}>{formatOutput(item.points.find(point => point.x === resistance)?.value)}</td>)}
              </tr>)}</tbody>
            </table></div>
          </section>
        </div>}
      {imageFeedback && imageFeedback !== 'failed' && <p className="surtr-s3-status" role="status">{imageFeedback === 'saved' ? '画像を保存しました。' : '画像をダウンロードしました。'}</p>}
    </CollapsibleCalculatorPanel>
    <CollapsibleCalculatorPanel id="surtr-s3-unequipped-comparison" number="05" title="未装備との比較"
      summary={`${unequippedLayout === 'combined' ? 'DPS＋比較値' : '比較値のみ'}・${unequippedMetric === 'difference' ? 'DPS差' : unequippedMetric === 'ratio' ? '比率' : '増加率'}`}
      collapsedLabel="比較表を表示" className="surtr-s3-output-panel"
      headerActions={<>
        <label className="surtr-s3-output-control"><span>表の形式</span><select aria-label="未装備比較の表の形式" value={unequippedLayout} onChange={event => setUnequippedLayout(event.target.value as SurtrUnequippedLayout)}>
          <option value="combined">DPS＋比較値</option><option value="comparison">比較値のみ</option>
        </select></label>
        <label className="surtr-s3-output-control"><span>比較値</span><select aria-label="未装備比較の指標" value={unequippedMetric} onChange={event => setUnequippedMetric(event.target.value as SurtrUnequippedMetric)}>
          <option value="difference">DPS差</option><option value="ratio">比率（未装備＝100%）</option><option value="percent">増加率（%）</option>
        </select></label>
        <label className="surtr-s3-output-control"><span>小数点以下</span><select aria-label="未装備比較の小数点以下の桁数" value={precision} onChange={event => setPrecision(Number(event.target.value))}>
          {[0, 1, 2, 3].map(value => <option key={value} value={value}>{value}桁</option>)}
        </select></label>
      </>}>
      {!record ? status : invalidModels.some(item => item.id !== 'none') ? <p role="alert">{invalidModels.filter(item => item.id !== 'none').map(item => item.label).join('・')}の計算に必要なデータを取得できませんでした。</p>
        : !unequipped?.model ? <p role="alert">未装備の計算に必要なデータを取得できませんでした。</p>
        : !series.some(item => item.id !== 'none') ? <p className="surtr-s3-status" role="status">比較するMODを選択してください。</p>
        : <SurtrUnequippedComparisonTable series={series} baseline={unequipped} resistances={outputResistances} precision={precision}
          metric={unequippedMetric} layout={unequippedLayout} selectedResistance={selectedResistance}
          metadata={{ skillLabel: label, level: effectiveSettings.level, trust: effectiveSettings.trust,
            potential: effectiveSettings.potential, blocking: effectiveSettings.blocking }}
          onOpenDetail={(resistance, seriesId, detailMetric) => openDetail(resistance, seriesId, detailMetric)} />}
    </CollapsibleCalculatorPanel>
    {detail && <SurtrDpsDetailModal snapshot={detail} onClose={() => setDetail(null)} />}
    {image && <ChartImageSaveDialog initialFilename={imageBaseFilename} getDefaultFilename={ratio => withChartImageAspect(
      withChartImageLabelFilename(
        includeHistogram && image.histogram ? getSurtrCombinedImageFilename(imageBaseFilename, image.histogram.filename) : imageBaseFilename,
        getSurtrDpsImageLabelDefaults(image.series, image.title, image.metric), image.labels), ratio)} aspect={aspect} onAspectChange={setAspect}
      canChooseLocation={!!picker} saving={saving} saveDisabled={!!histogramEditor} error={imageFeedback === 'failed'} helpMode="popover"
      onClose={() => { if (!saveInProgress.current) {
        if (histogramEditor) setIncludeHistogram(histogramEditor.wasIncluded)
        setHistogramEditor(null); setHistogramDraft(null); setImage(null); setImageFeedback(null)
      } }} onSave={(filename, ratio) => void saveImage(filename, ratio)}
      options={<><fieldset className="surtr-s3-export-distribution" disabled={saving}>
        <label><input type="checkbox" checked={compareBlocking && !!image.blockComparisons} disabled={!image.blockComparisons || saving || !!histogramEditor}
          onChange={event => setCompareBlocking(event.target.checked)} />ブロック状態を上下に比較</label>
        <label><input type="checkbox" checked={includeHistogram && !!previewHistogram} disabled={!image.histogram || saving || !!histogramEditor}
          onChange={event => setIncludeHistogram(event.target.checked)} />術耐性分布を添える</label>
        {previewHistogram && <span>{previewHistogram.summary}</span>}
        <button type="button" className="surtr-histogram-edit-trigger" ref={histogramEditTrigger}
          disabled={saving || !!histogramEditor} aria-expanded={!!histogramEditor} aria-controls="surtr-histogram-editor"
          onClick={() => {
            setHistogramEditor({ initialSnapshot: image.histogram, wasIncluded: includeHistogram })
            setHistogramDraft(null)
            setHistogramStorageError(false)
            setIncludeHistogram(true)
          }}>{image.histogram ? '分布を変更' : '分布を設定'}</button>
        {histogramStorageError && <span role="alert">分布を次回用に保存できませんでした。今回の出力には反映されています。</span>}
        {histogramEditor && <section id="surtr-histogram-editor" className="surtr-histogram-editor" aria-label="術耐性分布の設定">
          <EnemyResistanceHistogramEditor initialSnapshot={histogramEditor.initialSnapshot} onChange={receiveHistogramDraft} />
          <div className="surtr-histogram-editor-actions">
            <button type="button" className="button secondary" onClick={() => finishHistogramEdit(false)}>変更を取り消す</button>
            <button type="button" className="button" disabled={!histogramDraft} onClick={() => finishHistogramEdit(true)}>分布を適用</button>
          </div>
        </section>}
      </fieldset>
      <ChartImageLabelEditor defaults={getSurtrDpsImageLabelDefaults(image.series, image.title, image.metric)}
        value={image.labels ?? {}} disabled={saving || !!histogramEditor}
        onChange={labels => setImage(current => current ? { ...current, labels } : null)} />
      </>}
      preview={stackedPreview
        ? <SurtrCombinedChartImagePreview key={`${image.id}:stack:${JSON.stringify(image.labels)}:${!!previewBlockComparisons}:${includeHistogram ? previewHistogram?.id : 'none'}:${aspectRatio ?? 'auto'}`}
            {...image} blockComparisons={previewBlockComparisons} histogram={includeHistogram ? previewHistogram : null} aspectRatio={aspectRatio} />
        : <SurtrDpsChartImagePreview key={`${image.id}:${image.kind}:${JSON.stringify(image.labels)}:${aspectRatio ?? 'auto'}`} {...image} aspectRatio={aspectRatio} />} />}
  </section>
}
