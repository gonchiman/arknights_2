import { useMemo, useRef, useState } from 'react'
import { writeClipboardText } from '../lib/clipboard'
import { GOLDENGLOW_OPERATOR_ID } from '../lib/goldenglowExplosion'
import { buildGoldenglowPerformanceDifferenceCurve, buildGoldenglowPerformanceDifferences } from '../lib/goldenglowPerformanceDifference'
import { buildGoldenglowPerformancePresets } from '../lib/goldenglowPerformancePresets'
import { deriveGoldenglowGuideSkills } from '../lib/goldenglowGuideSkill'
import {
  buildGoldenglowPerformanceComparison,
  buildGoldenglowPerformanceComparisonTsv,
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
import { ComparisonChart, type ComparisonChartSeries } from './ComparisonChart'
import { ChartImageSaveDialog } from './ChartImageSaveDialog'
import { getChartImageSavePicker, selectChartImageDestination } from '../lib/chartImageDestination'
import { GoldenglowDetailModal } from './GoldenglowDetailModal'
import { GoldenglowOperatorInfo } from './GoldenglowOperatorInfo'
import { GoldenglowPerformanceBarChart, type GoldenglowBarOrientation, type GoldenglowBarVariant } from './GoldenglowPerformanceBarChart'
import { GoldenglowPerformanceChartFrame } from './GoldenglowPerformanceChartFrame'
import { GoldenglowPerformanceSkillNavigation } from './GoldenglowPerformanceSkillNavigation'
import type { GoldenglowPerformanceChartColumn } from './goldenglowPerformanceChartTypes'
import { saveComparisonChartImage } from './saveComparisonChartImage'
import './DamageCalculator.css'
import './GoldenglowGuidePage.css'
import './GoldenglowPerformancePage.css'

const format = (value: number) => new Intl.NumberFormat('ja-JP', { useGrouping: false, maximumFractionDigits: 3 }).format(value)
const integerFormat = new Intl.NumberFormat('ja-JP', { useGrouping: false, maximumFractionDigits: 0 })
const chartColors = ['#58758a', '#95615d', '#64806b', '#776d7f', '#827452', '#5b7b78']
const chartTypes = [
  { value: 'line', label: '折れ線' },
  { value: 'bar', label: '棒グラフ' },
] as const
type ChartType = typeof chartTypes[number]['value']
const barVariants = [
  { value: 'axis', label: 'A：軸をそろえて比較' },
  { value: 'label', label: 'B：ラベルと棒をまとめる' },
  { value: 'detail', label: 'C：合計と内訳を表示' },
] as const
const chartAspectPresets = ['16:9', '2:1', '21:9', '3:1'] as const

interface ModuleChoice {
  id: string
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
  const [showDecimals, setShowDecimals] = useState(false)
  const formatDamage = showDecimals ? format : integerFormat.format
  const formatChartDamage = useMemo(() => new Intl.NumberFormat('ja-JP', {
    maximumFractionDigits: showDecimals ? 3 : 0,
  }).format, [showDecimals])
  const [resistanceStep, setResistanceStep] = useState(DEFAULT_GOLDENGLOW_RESISTANCE_STEP)
  const [resistanceStepInput, setResistanceStepInput] = useState(String(DEFAULT_GOLDENGLOW_RESISTANCE_STEP))
  const [chartType, setChartType] = useState<ChartType>('line')
  const [lineStyle, setLineStyle] = useState<'solid' | 'dashed'>('solid')
  const [showLineEndLabels, setShowLineEndLabels] = useState(false)
  const [displayMetric, setDisplayMetric] = useState<'total' | 'difference'>('total')
  const [baselineId, setBaselineId] = useState('default-off')
  const [stackedBars, setStackedBars] = useState(false)
  const [barOrientation, setBarOrientation] = useState<GoldenglowBarOrientation>('vertical')
  const [barVariant, setBarVariant] = useState<GoldenglowBarVariant>('axis')
  const [chartResistance, setChartResistance] = useState(0)
  const [chartResistanceInput, setChartResistanceInput] = useState('0')
  const [chartAspectPreset, setChartAspectPreset] = useState('auto')
  const [chartAspect, setChartAspect] = useState({ width: 16, height: 9 })
  const [chartAspectInput, setChartAspectInput] = useState({ width: '16', height: '9' })
  const [savingImage, setSavingImage] = useState(false)
  const [imageFilename, setImageFilename] = useState<string | null>(null)
  const [imageFeedback, setImageFeedback] = useState<'saved' | 'downloaded' | 'failed' | null>(null)
  const imageSaveInProgress = useRef(false)
  const imageSavePicker = getChartImageSavePicker()
  const [savedBuilds, setSavedBuilds] = useState<GoldenglowComparisonBuild[] | null>(null)
  const [buildPresetId, setBuildPresetId] = useState('modules')
  const [editor, setEditor] = useState<{ build: GoldenglowComparisonBuild; adding: boolean } | null>(null)
  const [copying, setCopying] = useState(false)
  const [copyFeedback, setCopyFeedback] = useState<{ text: string; state: 'copied' | 'failed' } | null>(null)
  const nextBuildId = useRef(1)
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const profile = rows.find((row) => row.operatorId === GOLDENGLOW_OPERATOR_ID)?.operatorProfile
  const moduleChoices = useMemo(() => profile ? getOperatorModules(profile).map((module, index) => ({
    id: getOperatorModuleId(module, index),
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
  const resistanceValues = useMemo(() => buildGoldenglowResistanceValues(resistanceStep), [resistanceStep])
  const comparison = useMemo(() => skill ? buildGoldenglowPerformanceComparison(
    rows, builds, skill.skillIndex, skill.skillLevelIndex, viewingDuration, resistanceStep,
  ) : [], [rows, builds, skill, viewingDuration, resistanceStep])
  const barComparison = useMemo(() => skill ? buildGoldenglowPerformanceAtResistance(
    rows, builds, skill.skillIndex, skill.skillLevelIndex, viewingDuration, chartResistance,
  ) : [], [rows, builds, skill, viewingDuration, chartResistance])
  const lineComparison = useMemo(() => skill ? buildGoldenglowPerformanceCurve(
    rows, builds, skill.skillIndex, skill.skillLevelIndex, viewingDuration,
  ) : [], [rows, builds, skill, viewingDuration])
  const baselineColumn = comparison.find((column) => column.build.id === baselineId) ?? comparison[0]
  const effectiveBaselineId = baselineColumn?.build.id ?? ''
  const baselineLabel = baselineColumn
    ? `${moduleLabel(baselineColumn.build, moduleChoices)}（${buildCondition(baselineColumn.build)}）` : ''
  const isDifference = displayMetric === 'difference'
  const tableComparison = useMemo(() => isDifference
    ? buildGoldenglowPerformanceDifferences(comparison, effectiveBaselineId)
      .filter((column) => column.build.id !== effectiveBaselineId) : comparison,
  [comparison, effectiveBaselineId, isDifference])
  const differenceComparison = useMemo(() => isDifference
    ? buildGoldenglowPerformanceDifferenceCurve(lineComparison, effectiveBaselineId) : [],
  [lineComparison, effectiveBaselineId, isDifference])
  const formatDifference = useMemo(() => new Intl.NumberFormat('ja-JP', {
    useGrouping: false, maximumFractionDigits: showDecimals ? 3 : 0, signDisplay: 'exceptZero',
  }).format, [showDecimals])
  const formatOutput = isDifference ? formatDifference : formatDamage
  const formatChartOutput = useMemo(() => new Intl.NumberFormat('ja-JP', {
    maximumFractionDigits: showDecimals ? 3 : 0, signDisplay: isDifference ? 'exceptZero' : 'auto',
  }).format, [showDecimals, isDifference])
  const chartComparison = useMemo(() => isDifference
    ? buildGoldenglowPerformanceDifferences(barComparison, effectiveBaselineId) : barComparison,
  [barComparison, effectiveBaselineId, isDifference])
  const chartColumns = useMemo<GoldenglowPerformanceChartColumn[]>(() => chartComparison.map((column, index) => ({
    id: column.build.id,
    label: `${moduleLabel(column.build, moduleChoices)}（${buildCondition(column.build)}）`,
    color: chartColors[index % chartColors.length],
    values: column.values,
  })).filter((column) => !isDifference || column.id !== effectiveBaselineId),
  [chartComparison, moduleChoices, isDifference, effectiveBaselineId])
  const chartSeries = useMemo<ComparisonChartSeries[]>(() => (isDifference ? differenceComparison : lineComparison).map((column, index) => ({
    id: column.build.id,
    label: `${moduleLabel(column.build, moduleChoices)}（${buildCondition(column.build)}）`,
    shortLabel: moduleLabel(column.build, moduleChoices),
    detailLabel: buildCondition(column.build),
    color: chartColors[index % chartColors.length],
    points: column.values.map((value) => ({ x: value.resistance, value: value.expectedTotalDamage })),
  })).filter((series) => !isDifference || series.id !== effectiveBaselineId),
  [lineComparison, differenceComparison, isDifference, effectiveBaselineId, moduleChoices])
  const tableText = useMemo(() => buildGoldenglowPerformanceComparisonTsv(tableComparison.map((column) => ({
    label: `${moduleLabel(column.build, moduleChoices)}（${buildCondition(column.build)}）${isDifference ? `［差分・基準：${baselineLabel}］` : ''}`,
    values: column.values,
  })), showDecimals), [tableComparison, moduleChoices, showDecimals, isDifference, baselineLabel])
  const copyState = copyFeedback?.text === tableText ? copyFeedback.state : null
  const permanent = skill?.duration === null
  const duration = skill?.duration ?? viewingDuration
  const outputTitle = isDifference ? '総ダメージ期待値の差分'
    : permanent ? '集計時間内の総ダメージ期待値' : 'スキル総ダメージ期待値'
  const conditionLabel = skill ? `${isDifference ? `基準：${baselineLabel} ／ ` : ''}S${skill.skillIndex} ${skill.skillLevelLabel}・${format(duration)}秒` : undefined
  const unavailable = comparison.filter((column) => !column.skill)
  const chartMinWidth = chartType === 'bar' && barOrientation === 'vertical'
    ? Math.max(320, chartColumns.length * 160 + 80) : 320
  const chartAspectRatio = chartAspectPreset === 'auto' ? undefined : chartAspect.width / chartAspect.height
  const chartLabel = chartType === 'bar'
    ? `${barOrientation === 'horizontal' ? '横棒' : '縦棒'}${stackedBars ? '（積み上げ）' : ''}・${barVariants.find((variant) => variant.value === barVariant)?.label}`
    : chartTypes.find((type) => type.value === chartType)?.label
  const noComparisonTargets = isDifference && tableComparison.length === 0
  const emptyComparisonMessage = '基準列以外の比較対象がありません。「比較列を追加」から列を追加してください。'

  const renderChart = (imageOutput = false) => {
    if (noComparisonTargets) return <p className="gg-performance-status" role="status">{emptyComparisonMessage}</p>
    return <GoldenglowPerformanceChartFrame minWidth={chartMinWidth}
      aspectRatio={chartAspectRatio} imageOutput={imageOutput}>
      {(minHeight) => chartType === 'line'
        ? <ComparisonChart axisLabel="敵の術耐性" metricLabel={outputTitle} series={chartSeries}
          formatValue={formatChartOutput} formatAxisValue={formatChartDamage}
          lineStyle={lineStyle}
          showEndLabels={showLineEndLabels}
          imageOutput={imageOutput}
          captionDetail={conditionLabel}
          valueDescription={isDifference ? `基準は${baselineLabel}です。各列の総ダメージ期待値から基準の値を引いた差分で、プラスは増加、マイナスは減少を示します。` : undefined}
          emphasizeZero={isDifference} integerYTicks={!showDecimals} fitYAxisLabels showPoints={false} minHeight={minHeight ?? (imageOutput ? 500 : undefined)} />
        : <GoldenglowPerformanceBarChart columns={chartColumns} metricLabel={outputTitle}
          conditionLabel={conditionLabel} difference={isDifference} integerTicks={!showDecimals} imageOutput={imageOutput}
          resistance={chartResistance} stacked={stackedBars} orientation={barOrientation} variant={barVariant} formatValue={formatChartOutput} minHeight={minHeight ?? (imageOutput ? 500 : undefined)} />}
    </GoldenglowPerformanceChartFrame>
  }

  const openImageSaveDialog = () => {
    if (!skill || imageSaveInProgress.current) return
    const singleResistance = chartType === 'bar'
    const imageChartType = singleResistance && stackedBars ? 'stacked' : chartType
    setImageFeedback(null)
    setImageFilename(`goldenglow-S${skill.skillIndex}-${skill.skillLevelLabel}-${format(duration)}s-${imageChartType}${isDifference ? `-difference-from-${baselineLabel}` : ''}${singleResistance ? `-${barOrientation}-${barVariant}-res${chartResistance}` : showLineEndLabels ? '-end-labels' : ''}.png`)
  }

  const saveChartImage = async (filename: string) => {
    if (!skill || imageSaveInProgress.current || !filename.trim()) return
    imageSaveInProgress.current = true
    setSavingImage(true)
    setImageFeedback(null)
    try {
      // Open the picker during this click, before asynchronous image rendering consumes user activation.
      const destination = await selectChartImageDestination(filename, imageSavePicker)
      if (destination.type === 'cancelled') return
      await saveComparisonChartImage({
        chart: renderChart(true),
        filename,
        writeBlob: destination.type === 'file' ? destination.write : undefined,
      })
      setImageFeedback(destination.type === 'file' ? 'saved' : 'downloaded')
      setImageFilename(null)
    } catch {
      setImageFeedback('failed')
    } finally {
      imageSaveInProgress.current = false
      setSavingImage(false)
    }
  }

  const copyTable = async () => {
    setCopying(true)
    try {
      await writeClipboardText(tableText)
      setCopyFeedback({ text: tableText, state: 'copied' })
    } catch {
      setCopyFeedback({ text: tableText, state: 'failed' })
    } finally {
      setCopying(false)
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
      <header className="page-intro">
        <div>
          <span className="page-kicker">OPERATOR ANALYSIS</span>
          <h1 id="gg-performance-title">Goldenglow Performance Analysis</h1>
        </div>
      </header>
      {loading ? <div className="gg-skill-selection"><p role="status">スキル情報を読み込み中…</p></div> : skill ? <>
        <GoldenglowPerformanceSkillNavigation
          skill={skill}
          skills={skills}
          onSkillChange={setSkillIndex}
          onSkillLevelChange={setSkillLevelIndex}
        />
        <div className="gg-skill-selection"><p>昇進2最大レベル・信頼100・モジュールと潜在段階は列ごとに設定</p></div>
      </> : <div className="gg-skill-selection gg-skill-load-error" role="alert">
        <p>{error ?? 'ゴールデングローのスキル情報を取得できませんでした。'}</p>
        <button type="button" className="button secondary" onClick={onRetry}>再読み込み</button>
      </div>}

      <GoldenglowOperatorInfo skill={skill} loading={loading} defaultOpen={false} />

      {skill && <fieldset className="gg-performance-common-settings">
        <legend>表・グラフの共通設定</legend>
        <div className="gg-performance-common-controls">
          {permanent && <label className="calculator-field gg-performance-duration">
            <span>集計時間（秒）</span>
            <input type="number" aria-label="集計時間（秒）" min={0} max={600} step="any" value={viewingDuration}
              onChange={(event) => {
                const value = event.target.valueAsNumber
                setViewingDuration(Number.isFinite(value) ? Math.max(0, Math.min(600, value)) : 0)
              }} />
          </label>}
          <div className="gg-performance-display-options">
            <label>
              <input type="checkbox" checked={showDecimals} aria-describedby="gg-performance-decimals-description"
                onChange={(event) => setShowDecimals(event.target.checked)} />
              小数点以下を表示
            </label>
            <span id="gg-performance-decimals-description">非表示時は四捨五入</span>
          </div>
          <label className="calculator-field gg-performance-metric">
            <span>表示値</span>
            <select aria-label="表・グラフの表示値" value={displayMetric}
              onChange={(event) => setDisplayMetric(event.target.value as 'total' | 'difference')}>
              <option value="total">総ダメージ</option>
              <option value="difference">基準との差分</option>
            </select>
          </label>
          {isDifference && <label className="calculator-field gg-performance-baseline">
            <span>基準列</span>
            <select aria-label="表・グラフの基準列" value={effectiveBaselineId}
              onChange={(event) => setBaselineId(event.target.value)}>
              {comparison.map((column) => <option key={column.build.id} value={column.build.id}>
                {moduleLabel(column.build, moduleChoices)}（{buildCondition(column.build)}）
              </option>)}
            </select>
          </label>}
        </div>
        {isDifference && <p className="gg-performance-difference-help" role="status">
          表・グラフともに各列 − 基準列を表示します。プラスは増加、マイナスは減少、0は同じ値です。
          基準列自体は表・グラフに表示しません。
          {!baselineColumn?.values.some((value) => value.expectedTotalDamage !== null) && ' 基準列のデータがないため、差分を計算できません。'}
        </p>}
        <PersistentDetails persistenceId="gg-performance-assumptions" className="gg-performance-assumptions">
          <summary>計算条件</summary>
          <p>昇進2最大レベル・信頼100。敵1体を攻撃し続けたときの、本体・浮遊ユニット・爆発を合わせた総ダメージ期待値です。術耐性無視と、モジュール・潜在段階による攻撃力・攻撃速度・特性・素質の変化を各列に反映します。</p>
          <p>初回攻撃は攻撃間隔後、浮遊ユニットの帰還・再索敵は0秒として計算します。S2は永続のため、指定した集計時間内の結果です。ダメージ表示は{showDecimals ? '小数点以下3桁まで' : '整数'}の概数です。</p>
        </PersistentDetails>
      </fieldset>}

      <CollapsibleCalculatorPanel
        id="gg-performance-results"
        number="02"
        title="比較表"
        summary={skill ? `S${skill.skillIndex}・${format(duration)}秒・${tableComparison.length}列${isDifference ? `・差分（基準：${baselineLabel}）` : ''}` : '術耐性別のスキル総ダメージ期待値'}
        collapsedLabel="表を表示"
      >
        {skill ? <>
          <div className="gg-performance-table-toolbar">
            <label className="calculator-field gg-performance-table-preset">
              <span>比較プリセット</span>
              <select aria-label="比較表のプリセット" value={effectiveBuildPresetId} onChange={(event) => {
                const presetId = event.target.value
                const nextBuilds = presetId === 'custom' ? savedBuilds
                  : buildPresets.find((preset) => preset.id === presetId)?.builds
                if (!nextBuilds) return
                setBuildPresetId(presetId)
                setBaselineId(nextBuilds[0]?.id ?? '')
                setEditor(null)
              }}>
                {buildPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
                {savedBuilds && <option value="custom">カスタム</option>}
              </select>
            </label>
            <div className="gg-performance-table-actions">
              <label className="calculator-field gg-performance-step">
                <span>術耐性の刻み</span>
                <input type="number" aria-label="術耐性の刻み" min={1} max={100} step={1} value={resistanceStepInput}
                  onChange={(event) => {
                    setResistanceStepInput(event.target.value)
                    const value = event.target.valueAsNumber
                    if (Number.isInteger(value) && value >= 1 && value <= 100) setResistanceStep(value)
                  }}
                  onBlur={() => setResistanceStepInput(String(resistanceStep))}
                  onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
                />
              </label>
              <button type="button" className="button secondary" aria-label="比較表をコピー" title="Excel用にコピー（現在の表示桁数を反映）"
                disabled={copying || !tableText} aria-busy={copying} onClick={() => void copyTable()}>
                {copying ? 'コピー中…' : copyState === 'copied' ? 'コピー済み' : copyState === 'failed' ? 'コピー失敗' : '表をコピー'}
              </button>
              <span className="visually-hidden" role="status">
                {copyState === 'copied' ? '比較表をコピーしました。Excelへそのまま貼り付けられます。'
                  : copyState === 'failed' ? '比較表をコピーできませんでした。もう一度お試しください。' : ''}
              </span>
              <button ref={addButtonRef} type="button" className="button secondary" aria-haspopup="dialog" onClick={addColumn}>＋ 比較列を追加</button>
            </div>
          </div>
          <h3 className="gg-table-title gg-performance-output-title" id="gg-performance-output-title">{outputTitle}</h3>
          {isDifference && <p className="gg-performance-table-condition" id="gg-performance-table-condition">{conditionLabel}</p>}
          {noComparisonTargets ? <p className="gg-performance-status" role="status">{emptyComparisonMessage}</p>
            : <div className="gg-performance-table-wrap" tabIndex={0} role="region" aria-labelledby="gg-performance-output-title">
            <table className="gg-probability-table gg-performance-table" aria-labelledby="gg-performance-output-title"
              aria-describedby={isDifference ? 'gg-performance-table-condition' : undefined}
              style={{ minWidth: 88 + tableComparison.length * 150 }}>
              <colgroup><col style={{ width: 88 }} />{tableComparison.map(({ build }) => <col key={build.id} />)}</colgroup>
              <thead><tr>
                <th scope="col">敵の術耐性</th>
                {tableComparison.map(({ build }) => <th scope="col" key={build.id}>
                  <button type="button" className="gg-performance-column-trigger" aria-haspopup="dialog"
                    aria-label={`${moduleLabel(build, moduleChoices)} ${buildCondition(build)}の比較条件`}
                    onClick={() => setEditor({ build, adding: false })}>
                    <strong>{moduleLabel(build, moduleChoices)}<span aria-hidden="true"> ›</span></strong>
                    <span>{buildCondition(build)}</span>
                  </button>
                </th>)}
              </tr></thead>
              <tbody>{resistanceValues.map((resistance, rowIndex) => <tr key={resistance}>
                <th scope="row">{resistance}</th>
                {tableComparison.map((column) => {
                  const value = column.values[rowIndex]?.expectedTotalDamage
                  return <td key={column.build.id}>{value === null || value === undefined ? '—' : formatOutput(value)}</td>
                })}
              </tr>)}</tbody>
            </table>
          </div>}
          {unavailable.length > 0 && <p className="gg-performance-status" role="status">
            {unavailable.map((column) => `${moduleLabel(column.build, moduleChoices)}（${buildCondition(column.build)}）`).join('、')}の計算に必要なデータを取得できませんでした。
          </p>}
        </> : <p className="gg-probability-intro" role="status">{loading ? 'スキル情報を読み込み中…' : 'スキル情報の読み込み後に表示します。'}</p>}
      </CollapsibleCalculatorPanel>

      <CollapsibleCalculatorPanel
        id="gg-performance-graphs"
        number="03"
        title="比較グラフ"
        summary={skill ? `S${skill.skillIndex}・${format(duration)}秒・${chartLabel}${isDifference ? `・差分（基準：${baselineLabel}）` : ''}` : '術耐性別のスキル総ダメージ期待値'}
        collapsedLabel="グラフを表示"
      >
        {skill ? <section aria-label="比較グラフ">
            <div className="gg-performance-graph-controls">
              <div className="gg-performance-graph-types" role="group" aria-label="表示グラフ">
                {chartTypes.map((type) => <button key={type.value} type="button" aria-pressed={chartType === type.value}
                  onClick={() => setChartType(type.value)}>{type.label}</button>)}
              </div>
            </div>
            {chartType === 'line' && <div className="gg-performance-graph-options" role="group"
              aria-label="折れ線グラフの設定">
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
            </div>}
            {chartType === 'bar' && <div className="gg-performance-graph-options" role="group"
              aria-label="棒グラフの設定">
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
            </div>}
            <div className="gg-performance-graph-size-controls" role="group" aria-label="グラフの比率と画像保存">
              <label className="calculator-field gg-performance-aspect-preset">
                <span>縦横比（幅:高さ）</span>
                <select aria-label="グラフの縦横比" value={chartAspectPreset} onChange={(event) => {
                  const preset = event.target.value
                  setChartAspectPreset(preset)
                  if (preset !== 'auto' && preset !== 'custom') {
                    const [width, height] = preset.split(':').map(Number)
                    setChartAspect({ width, height })
                    setChartAspectInput({ width: String(width), height: String(height) })
                  }
                }}>
                  <option value="auto">指定なし</option>
                  {chartAspectPresets.map((preset) => <option key={preset} value={preset}>{preset}</option>)}
                  <option value="custom">カスタム</option>
                </select>
              </label>
              {chartAspectPreset === 'custom' && <div className="gg-performance-graph-ratio" role="group" aria-label="任意の縦横比">
                {(['width', 'height'] as const).map((key, index) => <label key={key} className="calculator-field">
                  <span>比率の{index === 0 ? '幅' : '高さ'}</span>
                  <input type="number" aria-label={`グラフの比率の${index === 0 ? '幅' : '高さ'}`} min={1} max={100} step={1}
                    value={chartAspectInput[key]} onChange={(event) => {
                      const input = event.target.value
                      const value = event.target.valueAsNumber
                      setChartAspectInput((current) => ({ ...current, [key]: input }))
                      if (Number.isInteger(value) && value >= 1 && value <= 100) {
                        setChartAspect((current) => ({ ...current, [key]: value }))
                      }
                    }}
                    onBlur={() => setChartAspectInput((current) => ({ ...current, [key]: String(chartAspect[key]) }))}
                    onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} />
                </label>)}
              </div>}
              <button type="button" className="button secondary" onClick={() => {
                setChartAspectPreset('auto')
                setChartAspect({ width: 16, height: 9 })
                setChartAspectInput({ width: '16', height: '9' })
              }}>自動に戻す</button>
              <button type="button" className="button secondary gg-performance-save-image"
                aria-label="グラフをPNG画像で保存" title="選択中のグラフをPNG画像で保存" aria-haspopup="dialog"
                disabled={savingImage || chartColumns.length === 0} aria-busy={savingImage}
                onClick={openImageSaveDialog}>{savingImage ? '画像を保存中…' : '画像を保存'}</button>
              <p id="gg-performance-size-help">{chartAspectPreset === 'auto'
                ? 'グラフの幅は画面に合わせて自動で調整します。'
                : 'グラフ全体の比率です。画面に合わせて調整し、内容が収まらない場合は比率を保って拡大します。'}</p>
            </div>
            <p role="status" className="visually-hidden">
              {imageFeedback === 'saved' ? 'PNG画像を保存しました。' : imageFeedback === 'downloaded' ? 'PNG画像のダウンロードを開始しました。' : ''}
            </p>
            <div className="gg-performance-chart-viewport" tabIndex={0} role="region" aria-label="グラフ表示領域">
              {renderChart()}
            </div>
        </section> : <p className="gg-probability-intro" role="status">{loading ? 'スキル情報を読み込み中…' : 'スキル情報の読み込み後に表示します。'}</p>}
      </CollapsibleCalculatorPanel>
      {imageFilename !== null && <ChartImageSaveDialog
        initialFilename={imageFilename}
        canChooseLocation={!!imageSavePicker}
        saving={savingImage}
        error={imageFeedback === 'failed'}
        onClose={() => {
          if (imageSaveInProgress.current) return
          setImageFilename(null)
          setImageFeedback(null)
        }}
        onSave={(filename) => void saveChartImage(filename)}
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
          window.requestAnimationFrame(() => addButtonRef.current?.focus({ preventScroll: true }))
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
