import { useMemo, useRef, useState, type ComponentProps } from 'react'
import { GOLDENGLOW_OPERATOR_ID } from '../lib/goldenglowExplosion'
import { buildGoldenglowPerformanceDifferenceCurve, buildGoldenglowPerformanceDifferences } from '../lib/goldenglowPerformanceDifference'
import { buildGoldenglowPerformancePresets } from '../lib/goldenglowPerformancePresets'
import { buildGoldenglowPerformanceRatios, buildGoldenglowPerformanceRatioCurve, type GoldenglowPerformanceRatioMode } from '../lib/goldenglowPerformanceRatio'
import { getModuleComparisonColors } from '../lib/moduleColors'
import { getChartImageLayout } from '../lib/chartImageLayout'
import { deriveGoldenglowGuideSkills } from '../lib/goldenglowGuideSkill'
import {
  buildGoldenglowPerformanceComparison,
  buildGoldenglowPerformanceAtResistance,
  buildGoldenglowPerformanceCurve,
  buildGoldenglowResistanceValues,
  DEFAULT_GOLDENGLOW_RESISTANCE_STEP,
  type GoldenglowComparisonBuild,
} from '../lib/goldenglowPerformanceComparison'
import { getOperatorModuleId, getOperatorModuleLevels, getOperatorModules, isOperatorModuleUnlocked } from '../lib/operatorModules'
import type { SkillRecord } from '../types/skill'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { PersistentDetails } from './PersistentDetails'
import { HelpPopover } from './HelpPopover'
import { ComparisonChart, type ComparisonChartSeries } from './ComparisonChart'
import { ChartImageSaveDialog, type ChartImageAspectSettings } from './ChartImageSaveDialog'
import { getChartImageSavePicker, selectChartImageDestination } from '../lib/chartImageDestination'
import { GoldenglowDetailModal } from './GoldenglowDetailModal'
import { GoldenglowOperatorInfo } from './GoldenglowOperatorInfo'
import { GoldenglowAnalysisHeader } from './GoldenglowAnalysisHeader'
import { GoldenglowPerformanceBarChart, type GoldenglowBarOrientation, type GoldenglowBarVariant } from './GoldenglowPerformanceBarChart'
import { GoldenglowPerformanceGroupedBarChart } from './GoldenglowPerformanceGroupedBarChart'
import { GoldenglowGroupedBarImagePreview } from './GoldenglowGroupedBarImagePreview'
import { GoldenglowPerformanceChartFrame } from './GoldenglowPerformanceChartFrame'
import { GoldenglowPerformanceSkillNavigation } from './GoldenglowPerformanceSkillNavigation'
import { GoldenglowPerformanceNumericTable } from './GoldenglowPerformanceNumericTable'
import type { GoldenglowPerformanceChartColumn } from './goldenglowPerformanceChartTypes'
import { saveComparisonChartImage } from './saveComparisonChartImage'
import './DamageCalculator.css'
import './GoldenglowGuidePage.css'
import './GoldenglowPerformancePage.css'

const format = (value: number) => new Intl.NumberFormat('ja-JP', { useGrouping: false, maximumFractionDigits: 3 }).format(value)
const chartTypes = [
  { value: 'line', label: '折れ線' },
  { value: 'bar', label: '棒グラフ' },
] as const
type ChartType = typeof chartTypes[number]['value']
type ChartMetric = 'total' | 'difference' | GoldenglowPerformanceRatioMode
const chartMetrics = [
  { value: 'total', label: '総ダメージ' },
  { value: 'difference', label: '基準との差分' },
  { value: 'ratio', label: '基準比（基準100%）' },
  { value: 'growth', label: '増減率（基準0%）' },
] as const
const barVariants = [
  { value: 'axis', label: 'A：軸をそろえて比較' },
  { value: 'label', label: 'B：ラベルと棒をまとめる' },
  { value: 'detail', label: 'C：合計と内訳を表示' },
] as const

interface ModuleChoice {
  id: string
  type: string
  label: string
  name: string
  levels: number[]
  unlocked: boolean
}

function moduleLabel(build: GoldenglowComparisonBuild, choices: readonly ModuleChoice[]) {
  return build.moduleId ? choices.find((choice) => choice.id === build.moduleId)?.label ?? 'モジュール未取得' : '未装備'
}

function buildCondition(build: GoldenglowComparisonBuild) {
  return `${build.moduleId ? `Lv.${build.moduleLevel}・` : ''}潜在${build.potential}`
}

export function GoldenglowPerformancePage({ rows, loading, error, onRetry }: {
  rows: readonly SkillRecord[]
  loading: boolean
  error: string | null
  onRetry: () => void
}) {
  const [skillIndex, setSkillIndex] = useState(3)
  const [skillLevelIndex, setSkillLevelIndex] = useState<number | undefined>(undefined)
  const [viewingDuration, setViewingDuration] = useState(30)
  const [chartType, setChartType] = useState<ChartType>('line')
  const [chartMetric, setChartMetric] = useState<ChartMetric>('total')
  const [chartBaselineId, setChartBaselineId] = useState('default-off')
  const [chartDigits, setChartDigits] = useState(0)
  const [yAxisFromZero, setYAxisFromZero] = useState(false)
  const [lineStyle, setLineStyle] = useState<'solid' | 'dashed'>('solid')
  const [showLineEndLabels, setShowLineEndLabels] = useState(false)
  const [barMode, setBarMode] = useState<'single' | 'grouped'>('single')
  const [showGroupedBarValues, setShowGroupedBarValues] = useState(false)
  const [groupedResistanceStep, setGroupedResistanceStep] = useState(DEFAULT_GOLDENGLOW_RESISTANCE_STEP)
  const [groupedResistanceStepInput, setGroupedResistanceStepInput] = useState(String(DEFAULT_GOLDENGLOW_RESISTANCE_STEP))
  const [stackedBars, setStackedBars] = useState(false)
  const [barOrientation, setBarOrientation] = useState<GoldenglowBarOrientation>('vertical')
  const [barVariant, setBarVariant] = useState<GoldenglowBarVariant>('axis')
  const [chartResistance, setChartResistance] = useState(0)
  const [chartResistanceInput, setChartResistanceInput] = useState('0')
  const [imageAspect, setImageAspect] = useState<ChartImageAspectSettings>({ preset: 'auto', width: '16', height: '9' })
  const [savingImage, setSavingImage] = useState(false)
  const [imageFilename, setImageFilename] = useState<string | null>(null)
  const [groupedImageExport, setGroupedImageExport] = useState<{
    id: number
    props: ComponentProps<typeof GoldenglowPerformanceGroupedBarChart>
  } | null>(null)
  const nextImageId = useRef(1)
  const [imageFeedback, setImageFeedback] = useState<'saved' | 'downloaded' | 'failed' | null>(null)
  const imageSaveInProgress = useRef(false)
  const imageSavePicker = getChartImageSavePicker()
  const [savedBuilds, setSavedBuilds] = useState<GoldenglowComparisonBuild[] | null>(null)
  const [buildPresetId, setBuildPresetId] = useState('modules')
  const [editor, setEditor] = useState<{ build: GoldenglowComparisonBuild; adding: boolean } | null>(null)
  const nextBuildId = useRef(1)
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const profile = rows.find((row) => row.operatorId === GOLDENGLOW_OPERATOR_ID)?.operatorProfile
  const moduleChoices = useMemo(() => profile ? getOperatorModules(profile).map((module, index) => ({
    id: getOperatorModuleId(module, index),
    type: module.typeName2?.trim() ?? '',
    label: ['MOD', module.typeName2?.trim()].filter(Boolean).join(' '),
    name: module.uniEquipName ?? '',
    levels: getOperatorModuleLevels(module),
    unlocked: isOperatorModuleUnlocked(module, 2, profile.phases[2]?.maxLevel ?? 1),
  })) : [], [profile])
  const buildPresets = useMemo(() => buildGoldenglowPerformancePresets(moduleChoices), [moduleChoices])
  const selectedBuildPreset = buildPresets.find((preset) => preset.id === buildPresetId) ?? buildPresets[0]
  const customBuilds = buildPresetId === 'custom' ? savedBuilds : null
  const builds = customBuilds ?? selectedBuildPreset.builds
  const effectiveBuildPresetId = customBuilds ? 'custom' : selectedBuildPreset.id
  const skills = useMemo(() => deriveGoldenglowGuideSkills(rows, '', 3, skillLevelIndex), [rows, skillLevelIndex])
  const skill = skills.find((candidate) => candidate.skillIndex === skillIndex) ?? skills[0] ?? null
  const isGroupedBar = chartType === 'bar' && barMode === 'grouped'
  const groupedResistanceValues = useMemo(() => buildGoldenglowResistanceValues(groupedResistanceStep), [groupedResistanceStep])
  const barComparison = useMemo(() => {
    if (!skill) return []
    if (isGroupedBar) return buildGoldenglowPerformanceComparison(
      rows, builds, skill.skillIndex, skill.skillLevelIndex, viewingDuration, groupedResistanceStep,
    )
    return buildGoldenglowPerformanceAtResistance(
      rows, builds, skill.skillIndex, skill.skillLevelIndex, viewingDuration, chartResistance,
    )
  }, [rows, builds, skill, viewingDuration, chartResistance, isGroupedBar, groupedResistanceStep])
  const lineComparison = useMemo(() => skill ? buildGoldenglowPerformanceCurve(
    rows, builds, skill.skillIndex, skill.skillLevelIndex, viewingDuration,
  ) : [], [rows, builds, skill, viewingDuration])
  const isPercentage = chartMetric === 'ratio' || chartMetric === 'growth'
  const chartRelative = chartMetric !== 'total'
  const chartSigned = chartMetric === 'difference' || chartMetric === 'growth'
  const chartBaseline = lineComparison.find((column) => column.build.id === chartBaselineId) ?? lineComparison[0]
  const effectiveChartBaselineId = chartBaseline?.build.id ?? ''
  const chartBaselineLabel = chartBaseline
    ? `${moduleLabel(chartBaseline.build, moduleChoices)}（${buildCondition(chartBaseline.build)}）` : ''
  const formatChartOutput = useMemo(() => {
    const formatter = new Intl.NumberFormat('ja-JP', { minimumFractionDigits: isPercentage ? chartDigits : 0,
      maximumFractionDigits: chartDigits, signDisplay: chartSigned ? 'exceptZero' : 'auto' })
    return (value: number) => `${formatter.format(value)}${isPercentage ? '%' : ''}`
  }, [chartDigits, isPercentage, chartSigned])
  const chartComparison = useMemo(() => chartMetric === 'ratio' || chartMetric === 'growth'
    ? buildGoldenglowPerformanceRatios(lineComparison, chartMetric, effectiveChartBaselineId,
      isGroupedBar ? groupedResistanceValues : [chartResistance])
    : chartMetric === 'difference' ? buildGoldenglowPerformanceDifferences(barComparison, effectiveChartBaselineId) : barComparison,
  [lineComparison, chartMetric, effectiveChartBaselineId, isGroupedBar, groupedResistanceValues, chartResistance, barComparison])
  const chartCurve = useMemo(() => chartMetric === 'ratio' || chartMetric === 'growth'
    ? buildGoldenglowPerformanceRatioCurve(lineComparison, chartMetric, effectiveChartBaselineId)
    : chartMetric === 'difference' ? buildGoldenglowPerformanceDifferenceCurve(lineComparison, effectiveChartBaselineId) : lineComparison,
  [lineComparison, chartMetric, effectiveChartBaselineId])
  const chartColumns = useMemo<GoldenglowPerformanceChartColumn[]>(() => {
    const visible = chartComparison.filter((column) => !chartRelative || column.build.id !== effectiveChartBaselineId)
    const colors = getModuleComparisonColors(visible.map(({ build }) => ({
      moduleType: build.moduleId ? moduleChoices.find((choice) => choice.id === build.moduleId)?.type : null,
      potential: build.potential,
    })))
    return visible.map((column, index) => ({
      id: column.build.id,
      label: `${moduleLabel(column.build, moduleChoices)}（${buildCondition(column.build)}）`,
      color: colors[index],
      values: column.values,
    }))
  }, [chartComparison, moduleChoices, chartRelative, effectiveChartBaselineId])
  const chartSeries = useMemo<ComparisonChartSeries[]>(() => {
    const visible = chartCurve.filter((column) => !chartRelative || column.build.id !== effectiveChartBaselineId)
    const colors = getModuleComparisonColors(visible.map(({ build }) => ({
      moduleType: build.moduleId ? moduleChoices.find((choice) => choice.id === build.moduleId)?.type : null,
      potential: build.potential,
    })))
    return visible.map((column, index) => ({
      id: column.build.id,
      label: `${moduleLabel(column.build, moduleChoices)}（${buildCondition(column.build)}）`,
      shortLabel: moduleLabel(column.build, moduleChoices),
      detailLabel: buildCondition(column.build),
      color: colors[index],
      points: column.values.map((value) => ({ x: value.resistance, value: value.expectedTotalDamage })),
    }))
  }, [chartCurve, chartRelative, effectiveChartBaselineId, moduleChoices])
  const permanent = skill?.duration === null
  const duration = skill?.duration ?? viewingDuration
  const chartTitle = chartMetric === 'ratio' ? 'スキル総ダメージの基準比' : chartMetric === 'growth' ? 'スキル総ダメージの増減率'
    : chartMetric === 'difference' ? '総ダメージ期待値の差分' : permanent ? '集計時間内の総ダメージ期待値' : 'スキル総ダメージ期待値'
  const valueAxisLabel = chartMetric === 'ratio' ? '基準比（%）' : chartMetric === 'growth' ? '増減率（%）' : undefined
  const chartConditionLabel = skill ? `S${skill.skillIndex} ${skill.skillLevelLabel}・${format(duration)}秒${chartRelative ? ` ／ 基準：${chartBaselineLabel}${isPercentage ? '（同じ術耐性）' : ''}` : ''}` : undefined
  const chartHelp = chartMetric === 'ratio' ? '同じ術耐性の基準列を100%として比較します。120%なら基準の1.2倍です。'
    : chartMetric === 'growth' ? '同じ術耐性の基準列からの増減を表示します。+20%なら基準より20%増加、0%なら同じ値です。'
    : chartMetric === 'difference' ? '各列から同じ術耐性の基準列を引いた差分です。プラスは増加、マイナスは減少を示します。' : ''
  const referenceY = isPercentage ? { value: chartMetric === 'ratio' ? 100 : 0, label: chartMetric === 'ratio' ? '基準 100%' : '基準 0%' } : undefined
  const chartMinWidth = isGroupedBar
    ? Math.max(480, groupedResistanceValues.length * Math.max(60, chartColumns.length * 18 + 24) + 90)
    : chartType === 'bar' && barOrientation === 'vertical'
    ? Math.max(320, chartColumns.length * 160 + 80) : 320
  const chartLabel = isGroupedBar ? `集合棒グラフ・術耐性${groupedResistanceStep}刻み` : chartType === 'bar'
    ? `${barOrientation === 'horizontal' ? '横棒' : '縦棒'}${stackedBars ? '（積み上げ）' : ''}・${barVariants.find((variant) => variant.value === barVariant)?.label}`
    : chartTypes.find((type) => type.value === chartType)?.label
  const noChartTargets = chartRelative && chartColumns.length === 0
  const visibleChartValues = chartType === 'line' ? chartSeries.flatMap((series) => series.points.map((point) => point.value))
    : chartColumns.flatMap((column) => column.values.map((value) => value.expectedTotalDamage))
  const hasChartValues = visibleChartValues.some((value) => value !== null)
  const hasMissingChartValues = visibleChartValues.some((value) => value === null)
  const emptyComparisonMessage = '基準列以外の比較対象がありません。共通設定の「比較列を追加」から列を追加してください。'

  const renderChart = (imageOutput = false, aspectRatio?: number) => {
    if (noChartTargets) return <p className="gg-performance-status" role="status">{emptyComparisonMessage}</p>
    return <GoldenglowPerformanceChartFrame minWidth={chartMinWidth}
      aspectRatio={imageOutput ? aspectRatio : undefined} imageOutput={imageOutput}>
      {(minHeight) => chartType === 'line'
        ? <ComparisonChart axisLabel="敵の術耐性" metricLabel={chartTitle} valueAxisLabel={valueAxisLabel} series={chartSeries}
          formatValue={formatChartOutput} formatAxisValue={(value) => String(value)}
          lineStyle={lineStyle}
          showEndLabels={showLineEndLabels}
          imageOutput={imageOutput}
          captionDetail={chartConditionLabel}
          valueDescription={chartHelp || undefined} referenceY={referenceY} yAxisFromZero={isPercentage ? yAxisFromZero : true}
          emphasizeZero={chartMetric === 'difference'} integerYTicks={chartDigits === 0} fitYAxisLabels showPoints={false} minHeight={minHeight ?? (imageOutput ? 500 : undefined)} />
        : isGroupedBar ? <GoldenglowPerformanceGroupedBarChart columns={chartColumns} resistances={groupedResistanceValues}
          metricLabel={chartTitle} valueAxisLabel={valueAxisLabel} referenceY={referenceY} conditionLabel={chartConditionLabel} difference={chartSigned}
          integerTicks={chartDigits === 0} imageOutput={imageOutput} formatValue={formatChartOutput}
          showValues={showGroupedBarValues}
          minHeight={minHeight ?? (imageOutput ? 500 : undefined)} />
        : <GoldenglowPerformanceBarChart columns={chartColumns} metricLabel={chartTitle} valueAxisLabel={valueAxisLabel} referenceY={referenceY}
          conditionLabel={chartConditionLabel} difference={chartSigned} integerTicks={chartDigits === 0} imageOutput={imageOutput}
          resistance={chartResistance} stacked={stackedBars} orientation={barOrientation} variant={barVariant} formatValue={formatChartOutput} minHeight={minHeight ?? (imageOutput ? 500 : undefined)} />}
    </GoldenglowPerformanceChartFrame>
  }

  const openImageSaveDialog = () => {
    if (!skill || imageSaveInProgress.current || !hasChartValues) return
    const singleResistance = chartType === 'bar' && !isGroupedBar
    const imageChartType = isGroupedBar ? 'grouped-bar' : singleResistance && stackedBars ? 'stacked' : chartType
    const chartDetails = isGroupedBar ? `-step${groupedResistanceStep}`
      : singleResistance ? `-${barOrientation}-${barVariant}-res${chartResistance}` : showLineEndLabels ? '-end-labels' : ''
    setImageFeedback(null)
    setGroupedImageExport(isGroupedBar ? {
      id: nextImageId.current++,
      props: {
        columns: structuredClone(chartColumns), resistances: [...groupedResistanceValues],
        metricLabel: chartTitle, valueAxisLabel, referenceY, conditionLabel: chartConditionLabel,
        difference: chartSigned, integerTicks: chartDigits === 0, formatValue: formatChartOutput,
        showValues: showGroupedBarValues, imageOutput: true,
      },
    } : null)
    setImageFilename(`goldenglow-S${skill.skillIndex}-${skill.skillLevelLabel}-${format(duration)}s-${imageChartType}${chartRelative ? `-${chartMetric}-from-${chartBaselineLabel}` : ''}${chartDetails}.png`)
  }

  const saveChartImage = async (filename: string, aspectRatio?: number) => {
    if (!skill || imageSaveInProgress.current || !filename.trim()) return
    imageSaveInProgress.current = true
    setSavingImage(true)
    setImageFeedback(null)
    try {
      // Open the picker during this click, before asynchronous image rendering consumes user activation.
      const destination = await selectChartImageDestination(filename, imageSavePicker)
      if (destination.type === 'cancelled') return
      await saveComparisonChartImage({
        chart: groupedImageExport
          ? <GoldenglowPerformanceGroupedBarChart {...groupedImageExport.props} aspectRatio={aspectRatio} />
          : renderChart(true, aspectRatio),
        width: groupedImageExport ? getChartImageLayout({ naturalChartHeight: 334, aspectRatio }).width : undefined,
        filename,
        writeBlob: destination.type === 'file' ? destination.write : undefined,
      })
      setImageFeedback(destination.type === 'file' ? 'saved' : 'downloaded')
      setImageFilename(null)
      setGroupedImageExport(null)
    } catch {
      setImageFeedback('failed')
    } finally {
      imageSaveInProgress.current = false
      setSavingImage(false)
    }
  }

  const addColumn = () => {
    const firstModule = moduleChoices.find((choice) => choice.unlocked && choice.levels.length > 0)
    setEditor({
      adding: true,
      build: {
        id: `comparison-${nextBuildId.current++}`,
        moduleId: firstModule?.id ?? '',
        moduleLevel: firstModule?.levels.at(-1) ?? 3,
        potential: 1,
      },
    })
  }

  return (
    <section className="calculator-page gg-reference-page gg-performance-page" aria-labelledby="gg-performance-title">
      <GoldenglowAnalysisHeader id="gg-performance-title" title="スキルダメージ比較" />
      <GoldenglowOperatorInfo skill={skill} loading={loading} defaultOpen={false} />

      <CollapsibleCalculatorPanel
        id="gg-performance-settings"
        number="02"
        title="共通設定"
        summary={skill ? `S${skill.skillIndex} ${skill.skillLevelLabel}・${format(duration)}秒・比較対象${builds.length}列` : 'テーブル・グラフに共通の計算条件'}
        collapsedLabel="設定を表示"
        defaultOpen={false}
        bodyClassName="gg-performance-settings-body"
      >
        {skill ? <>
          <GoldenglowPerformanceSkillNavigation
            skill={skill}
            skills={skills}
            onSkillChange={setSkillIndex}
            onSkillLevelChange={setSkillLevelIndex}
          />
          <div className="gg-performance-common-controls">
            <label className="calculator-field gg-performance-common-preset">
              <span>比較プリセット</span>
              <select aria-label="比較プリセット" value={effectiveBuildPresetId} onChange={(event) => {
                const presetId = event.target.value
                const nextBuilds = presetId === 'custom' ? savedBuilds
                  : buildPresets.find((preset) => preset.id === presetId)?.builds
                if (!nextBuilds) return
                setBuildPresetId(presetId)
                setChartBaselineId(nextBuilds[0]?.id ?? '')
                setEditor(null)
              }}>
                {buildPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
                {savedBuilds && <option value="custom">カスタム</option>}
              </select>
            </label>
            {permanent && <label className="calculator-field gg-performance-duration">
              <span>集計時間（秒）</span>
              <input type="number" aria-label="集計時間（秒）" min={0} max={600} step="any" value={viewingDuration}
                onChange={(event) => {
                  const value = event.target.valueAsNumber
                  setViewingDuration(Number.isFinite(value) ? Math.max(0, Math.min(600, value)) : 0)
                }} />
            </label>}
            <button ref={addButtonRef} type="button" className="button secondary gg-performance-add-build" aria-haspopup="dialog" onClick={addColumn}>＋ 比較列を追加</button>
          </div>
          <div className="gg-performance-build-settings">
            <p className="gg-performance-build-label">比較対象</p>
            <ul className="gg-performance-build-list" aria-label="共通の比較対象">
              {builds.map((build) => <li key={build.id}>
                <button type="button" className="gg-performance-build-trigger" aria-haspopup="dialog"
                  aria-label={`${moduleLabel(build, moduleChoices)} ${buildCondition(build)}の共通比較条件`}
                  onClick={() => setEditor({ build, adding: false })}>
                  <span><strong>{moduleLabel(build, moduleChoices)}</strong><small>{buildCondition(build)}</small></span>
                  <span aria-hidden="true">›</span>
                </button>
              </li>)}
            </ul>
          </div>
          <PersistentDetails persistenceId="gg-performance-assumptions" className="gg-performance-assumptions">
            <summary>計算条件</summary>
            <p>昇進2最大レベル・信頼100。敵1体を攻撃し続けたときの、本体・浮遊ユニット・爆発を合わせた総ダメージ期待値です。術耐性無視と、モジュール・潜在段階による攻撃力・攻撃速度・特性・素質の変化を各列に反映します。</p>
            <p>初回攻撃は攻撃間隔後、浮遊ユニットの帰還・再索敵は0秒として計算します。S2は永続のため、指定した集計時間内の結果です。</p>
          </PersistentDetails>
        </> : loading ? <p className="gg-probability-intro" role="status">スキル情報を読み込み中…</p>
          : <div className="gg-skill-load-error" role="alert">
            <p>{error ?? 'ゴールデングローのスキル情報を取得できませんでした。'}</p>
            <button type="button" className="button secondary" onClick={onRetry}>再読み込み</button>
          </div>}
      </CollapsibleCalculatorPanel>

      <CollapsibleCalculatorPanel
        id="gg-performance-graphs"
        number="03"
        title="グラフ表示"
        summary={skill ? `S${skill.skillIndex}・${format(duration)}秒・${chartLabel}・${chartMetrics.find((metric) => metric.value === chartMetric)?.label}${chartRelative ? `（基準：${chartBaselineLabel}）` : ''}` : '術耐性別のスキル総ダメージ期待値'}
        collapsedLabel="グラフを表示"
      >
        {skill ? <section aria-label="比較グラフ">
            <div className="gg-performance-graph-controls">
              <div className="gg-performance-chart-format"><span>グラフ形式</span>
              <div className="gg-performance-graph-types" role="group" aria-label="グラフ形式">
                {chartTypes.map((type) => <button key={type.value} type="button" aria-pressed={chartType === type.value}
                  onClick={() => setChartType(type.value)}>{type.label}</button>)}
              </div>
              </div>
              <div className="calculator-field gg-performance-chart-metric">
                <div className="gg-performance-field-heading">
                  <HelpPopover label="表示値の説明" triggerText="表示値">
                    <p>{chartHelp || '総ダメージは、本体・浮遊ユニット・爆発を合わせた期待値です。'}</p>
                  </HelpPopover>
                </div>
                <select id="gg-performance-chart-metric" aria-label="グラフの表示値" value={chartMetric} onChange={(event) => setChartMetric(event.target.value as ChartMetric)}>
                  {chartMetrics.map((metric) => <option key={metric.value} value={metric.value}>{metric.label}</option>)}
                </select>
              </div>
              {chartRelative && <label className="calculator-field gg-performance-baseline"><span>基準列</span>
                <select aria-label="グラフの基準列" value={effectiveChartBaselineId} onChange={(event) => setChartBaselineId(event.target.value)}>
                  {lineComparison.map(({ build }) => <option key={build.id} value={build.id}>{moduleLabel(build, moduleChoices)}（{buildCondition(build)}）</option>)}
                </select>
              </label>}
              <button type="button" className="button secondary gg-performance-save-image"
                aria-label="グラフをPNG画像で保存" title="選択中のグラフをPNG画像で保存" aria-haspopup="dialog"
                disabled={savingImage || !hasChartValues} aria-busy={savingImage}
                onClick={openImageSaveDialog}>{savingImage ? '画像を保存中…' : '画像を保存'}</button>
            </div>
            <div className="gg-performance-graph-options" role="group"
              aria-label={chartType === 'line' ? '折れ線グラフの設定' : '棒グラフの設定'}>
              <label className="calculator-field gg-performance-chart-precision"><span>小数点以下</span>
                <select aria-label="グラフの小数点以下の桁数" value={chartDigits} onChange={(event) => setChartDigits(Number(event.target.value))}>
                  {[0, 1, 2, 3].map((digits) => <option key={digits} value={digits}>{digits}桁</option>)}
                </select>
              </label>
              {chartType === 'line' && <>
              <label className="calculator-field gg-performance-line-design">
                <span>線のデザイン</span>
                <select aria-label="線のデザイン" value={lineStyle}
                  onChange={(event) => setLineStyle(event.target.value as 'solid' | 'dashed')}>
                  <option value="solid">標準の実線</option>
                  <option value="dashed">破線を併用</option>
                </select>
              </label>
              <label className="gg-performance-stacked-option">
                <input type="checkbox" checked={showLineEndLabels}
                  onChange={(event) => setShowLineEndLabels(event.target.checked)} />
                線の端に系列名を表示
              </label>
              {isPercentage && <label className="gg-performance-stacked-option">
                <input type="checkbox" checked={yAxisFromZero} onChange={(event) => setYAxisFromZero(event.target.checked)} />縦軸に0%を含める
              </label>}
              </>}
              {chartType === 'bar' && <>
              <label className="calculator-field gg-performance-bar-mode">
                <span>棒グラフの種類</span>
                <select aria-label="棒グラフの種類" value={barMode}
                  onChange={(event) => setBarMode(event.target.value as 'single' | 'grouped')}>
                  <option value="single">単一の術耐性</option>
                  <option value="grouped">集合棒グラフ</option>
                </select>
              </label>
              {isGroupedBar ? <><label className="calculator-field gg-performance-graph-resistance">
                <span>術耐性の刻み</span>
                <input type="number" aria-label="グラフの術耐性の刻み" min={1} max={100} step={1} value={groupedResistanceStepInput}
                  onChange={(event) => {
                    setGroupedResistanceStepInput(event.target.value)
                    const value = event.target.valueAsNumber
                    if (Number.isInteger(value) && value >= 1 && value <= 100) setGroupedResistanceStep(value)
                  }}
                  onBlur={() => setGroupedResistanceStepInput(String(groupedResistanceStep))}
                  onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
                />
              </label>
              <label className="gg-performance-stacked-option">
                <input type="checkbox" checked={showGroupedBarValues}
                  onChange={(event) => setShowGroupedBarValues(event.target.checked)} />
                数値を表示
              </label></> : <>
              <label className="calculator-field gg-performance-graph-resistance">
                <span>敵の術耐性</span>
                <input type="number" aria-label="グラフの術耐性" min={0} max={100} step={1} value={chartResistanceInput}
                  onChange={(event) => {
                    setChartResistanceInput(event.target.value)
                    const value = event.target.valueAsNumber
                    if (Number.isInteger(value) && value >= 0 && value <= 100) setChartResistance(value)
                  }}
                  onBlur={() => setChartResistanceInput(String(chartResistance))}
                  onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
                />
              </label>
              <label className="calculator-field gg-performance-bar-orientation">
                <span>向き</span>
                <select aria-label="棒グラフの向き" value={barOrientation}
                  onChange={(event) => setBarOrientation(event.target.value as GoldenglowBarOrientation)}>
                  <option value="horizontal">横</option>
                  <option value="vertical">縦</option>
                </select>
              </label>
              <label className="calculator-field gg-performance-bar-design">
                <span>棒グラフのデザイン</span>
                <select aria-label="棒グラフのデザイン" value={barVariant}
                  onChange={(event) => setBarVariant(event.target.value as GoldenglowBarVariant)}>
                  {barVariants.map((variant) => <option key={variant.value} value={variant.value}>{variant.label}</option>)}
                </select>
              </label>
              <label className="gg-performance-stacked-option">
                <input type="checkbox" checked={stackedBars} onChange={(event) => setStackedBars(event.target.checked)} />
                積み上げ表示
              </label>
              </>}
              </>}
            </div>
            <p role="status" className="visually-hidden">
              {imageFeedback === 'saved' ? 'PNG画像を保存しました。' : imageFeedback === 'downloaded' ? 'PNG画像のダウンロードを開始しました。' : ''}
            </p>
            <div className="gg-performance-chart-viewport" tabIndex={0} role="region" aria-label="グラフ表示領域">
              {renderChart()}
            </div>
            {isPercentage && hasMissingChartValues && <p className="gg-performance-status" role="status">基準が0または未計算の術耐性や、未計算の比較値は、比率を表示できません。</p>}
            <GoldenglowPerformanceNumericTable
              columns={lineComparison} metric={chartMetric} baselineId={effectiveChartBaselineId}
              digits={chartDigits} formatValue={formatChartOutput} title={chartTitle} condition={chartConditionLabel}
              labelBuild={build => ({ name: moduleLabel(build, moduleChoices), detail: buildCondition(build) })}
              chartResistance={chartType === 'bar' && !isGroupedBar ? chartResistance : undefined}
              emptyMessage={emptyComparisonMessage}
            />
        </section> : <p className="gg-probability-intro" role="status">{loading ? 'スキル情報を読み込み中…' : 'スキル情報の読み込み後に表示します。'}</p>}
      </CollapsibleCalculatorPanel>
      {imageFilename !== null && <ChartImageSaveDialog
        initialFilename={imageFilename}
        helpMode="popover"
        aspect={imageAspect}
        onAspectChange={setImageAspect}
        canChooseLocation={!!imageSavePicker}
        saving={savingImage}
        error={imageFeedback === 'failed'}
        preview={groupedImageExport && <GoldenglowGroupedBarImagePreview
          key={`${groupedImageExport.id}:${imageAspect.preset}:${imageAspect.width}:${imageAspect.height}`}
          chartProps={groupedImageExport.props}
          aspectRatio={imageAspect.preset !== 'auto' && [imageAspect.width, imageAspect.height]
            .every((value) => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 100)
            ? Number(imageAspect.width) / Number(imageAspect.height) : undefined}
        />}
        onClose={() => {
          if (imageSaveInProgress.current) return
          setImageFilename(null)
          setGroupedImageExport(null)
          setImageFeedback(null)
        }}
        onSave={(filename, aspectRatio) => void saveChartImage(filename, aspectRatio)}
      />}
      {editor && <ComparisonColumnEditor
        key={editor.build.id}
        initial={editor.build}
        adding={editor.adding}
        moduleChoices={moduleChoices}
        builds={builds}
        onClose={() => setEditor(null)}
        onSave={(build) => {
          setSavedBuilds(editor.adding ? [...builds, build] : builds.map((current) => current.id === build.id ? build : current))
          setBuildPresetId('custom')
          setEditor(null)
        }}
        onRemove={() => {
          setSavedBuilds(builds.filter((build) => build.id !== editor.build.id))
          setBuildPresetId('custom')
          setEditor(null)
          window.requestAnimationFrame(() => {
            const addButton = addButtonRef.current
            const focusTarget = addButton?.getClientRects().length
              ? addButton : document.getElementById('gg-performance-settings-heading')
            focusTarget?.focus({ preventScroll: true })
          })
        }}
      />}
    </section>
  )
}

function ComparisonColumnEditor({ initial, adding, moduleChoices, builds, onClose, onSave, onRemove }: {
  initial: GoldenglowComparisonBuild
  adding: boolean
  moduleChoices: readonly ModuleChoice[]
  builds: readonly GoldenglowComparisonBuild[]
  onClose: () => void
  onSave: (build: GoldenglowComparisonBuild) => void
  onRemove: () => void
}) {
  const [draft, setDraft] = useState(initial)
  const selectedModule = moduleChoices.find((choice) => choice.id === draft.moduleId)
  const duplicate = builds.some((build) => build.id !== draft.id
    && build.moduleId === draft.moduleId && build.potential === draft.potential
    && (!draft.moduleId || build.moduleLevel === draft.moduleLevel))
  const valid = !draft.moduleId || Boolean(selectedModule?.unlocked && selectedModule.levels.includes(draft.moduleLevel))
  return <GoldenglowDetailModal title={adding ? '比較列を追加' : '比較条件'} closeLabel="比較条件を閉じる" onClose={onClose}>
    <form className="gg-performance-column-form" onSubmit={(event) => {
      event.preventDefault()
      if (valid && !duplicate) onSave(draft)
    }}>
      <div className="gg-performance-column-fields">
        <label className="calculator-field"><span>モジュール</span>
          <select aria-label="比較列のモジュール" value={draft.moduleId} onChange={(event) => {
            const choice = moduleChoices.find((item) => item.id === event.target.value)
            setDraft((current) => ({ ...current, moduleId: event.target.value, moduleLevel: choice?.levels.at(-1) ?? 3 }))
          }}>
            <option value="">未装備</option>
            {moduleChoices.map((choice) => <option key={choice.id} value={choice.id} disabled={!choice.unlocked || choice.levels.length === 0}>
              {choice.label} {choice.name}
            </option>)}
          </select>
        </label>
        <label className="calculator-field"><span>モジュールレベル</span>
          <select aria-label="比較列のモジュールレベル" disabled={!selectedModule} value={selectedModule ? draft.moduleLevel : ''}
            onChange={(event) => setDraft((current) => ({ ...current, moduleLevel: Number(event.target.value) }))}>
            {selectedModule ? selectedModule.levels.map((level) => <option key={level} value={level}>Lv.{level}</option>) : <option value="">—</option>}
          </select>
        </label>
        <label className="calculator-field"><span>潜在段階</span>
          <select aria-label="比較列の潜在段階" value={draft.potential}
            onChange={(event) => setDraft((current) => ({ ...current, potential: Number(event.target.value) }))}>
            {[1, 2, 3, 4, 5, 6].map((potential) => <option key={potential} value={potential}>潜在{potential}</option>)}
          </select>
        </label>
      </div>
      {duplicate && <p className="gg-performance-status" role="status">同じ条件の列がすでにあります。</p>}
      <div className="gg-performance-column-form-actions">
        {!adding && <button type="button" className="button secondary gg-performance-remove" disabled={builds.length <= 1} onClick={onRemove}>この列を削除</button>}
        <button type="button" className="button secondary" onClick={onClose}>キャンセル</button>
        <button type="submit" className="button" disabled={!valid || duplicate}>{adding ? '追加' : '適用'}</button>
      </div>
    </form>
  </GoldenglowDetailModal>
}
