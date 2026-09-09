import { useMemo, useRef, useState } from 'react'
import { writeClipboardText } from '../lib/clipboard'
import { GOLDENGLOW_OPERATOR_ID } from '../lib/goldenglowExplosion'
import { deriveGoldenglowGuideSkills } from '../lib/goldenglowGuideSkill'
import {
  buildGoldenglowPerformanceComparison,
  buildGoldenglowPerformanceComparisonTsv,
  buildGoldenglowPerformanceCurve,
  buildGoldenglowResistanceValues,
  DEFAULT_GOLDENGLOW_RESISTANCE_STEP,
  type GoldenglowComparisonBuild,
} from '../lib/goldenglowPerformanceComparison'
import { getOperatorModuleId, getOperatorModuleLevels, getOperatorModules, isOperatorModuleUnlocked } from '../lib/operatorModules'
import type { SkillRecord } from '../types/skill'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { ComparisonChart, type ComparisonChartSeries } from './ComparisonChart'
import { GoldenglowDetailModal } from './GoldenglowDetailModal'
import { GoldenglowOperatorInfo } from './GoldenglowOperatorInfo'
import { GoldenglowPerformanceBarChart } from './GoldenglowPerformanceBarChart'
import { GoldenglowPerformanceHeatmap } from './GoldenglowPerformanceHeatmap'
import { GoldenglowPerformanceSkillNavigation } from './GoldenglowPerformanceSkillNavigation'
import type { GoldenglowPerformanceChartColumn } from './goldenglowPerformanceChartTypes'
import { saveComparisonChartImage } from './saveComparisonChartImage'
import './DamageCalculator.css'
import './GoldenglowGuidePage.css'
import './GoldenglowPerformancePage.css'

const format = (value: number) => new Intl.NumberFormat('ja-JP', { useGrouping: false, maximumFractionDigits: 3 }).format(value)
const chartColors = ['#58758a', '#95615d', '#64806b', '#776d7f', '#827452', '#5b7b78']
const chartTypes = [
  { value: 'line', label: '折れ線' },
  { value: 'bar', label: '横棒' },
  { value: 'heatmap', label: 'ヒートマップ' },
  { value: 'stacked', label: '積み上げ棒' },
] as const
type ChartType = typeof chartTypes[number]['value']

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
  const [resistanceStep, setResistanceStep] = useState(DEFAULT_GOLDENGLOW_RESISTANCE_STEP)
  const [resistanceStepInput, setResistanceStepInput] = useState(String(DEFAULT_GOLDENGLOW_RESISTANCE_STEP))
  const [chartResistanceStep, setChartResistanceStep] = useState(DEFAULT_GOLDENGLOW_RESISTANCE_STEP)
  const [chartResistanceStepInput, setChartResistanceStepInput] = useState(String(DEFAULT_GOLDENGLOW_RESISTANCE_STEP))
  const [chartType, setChartType] = useState<ChartType>('line')
  const [chartResistance, setChartResistance] = useState(0)
  const [savingImage, setSavingImage] = useState(false)
  const [imageFeedback, setImageFeedback] = useState<'saved' | 'failed' | null>(null)
  const imageSaveInProgress = useRef(false)
  const [open, setOpen] = useState(true)
  const [savedBuilds, setSavedBuilds] = useState<GoldenglowComparisonBuild[] | null>(null)
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
  const defaultBuilds = useMemo<GoldenglowComparisonBuild[]>(() => [
    { id: 'default-off', moduleId: '', moduleLevel: 3, potential: 1 },
    ...moduleChoices.map((choice) => ({
      id: `default-${choice.id}`, moduleId: choice.id, moduleLevel: choice.levels.at(-1) ?? 3, potential: 1,
    })),
  ], [moduleChoices])
  const builds = savedBuilds ?? defaultBuilds
  const skills = useMemo(() => deriveGoldenglowGuideSkills(rows, '', 3, skillLevelIndex), [rows, skillLevelIndex])
  const skill = skills.find((candidate) => candidate.skillIndex === skillIndex) ?? skills[0] ?? null
  const resistanceValues = useMemo(() => buildGoldenglowResistanceValues(resistanceStep), [resistanceStep])
  const chartResistanceValues = useMemo(() => buildGoldenglowResistanceValues(chartResistanceStep), [chartResistanceStep])
  const activeChartResistance = chartResistanceValues.reduce((closest, value) => (
    Math.abs(value - chartResistance) < Math.abs(closest - chartResistance) ? value : closest
  ), chartResistanceValues[0])
  const comparison = useMemo(() => skill ? buildGoldenglowPerformanceComparison(
    rows, builds, skill.skillIndex, skill.skillLevelIndex, viewingDuration, resistanceStep,
  ) : [], [rows, builds, skill, viewingDuration, resistanceStep])
  const chartComparison = useMemo(() => skill ? buildGoldenglowPerformanceComparison(
    rows, builds, skill.skillIndex, skill.skillLevelIndex, viewingDuration, chartResistanceStep,
  ) : [], [rows, builds, skill, viewingDuration, chartResistanceStep])
  const lineComparison = useMemo(() => skill ? buildGoldenglowPerformanceCurve(
    rows, builds, skill.skillIndex, skill.skillLevelIndex, viewingDuration,
  ) : [], [rows, builds, skill, viewingDuration])
  const chartColumns = useMemo<GoldenglowPerformanceChartColumn[]>(() => chartComparison.map((column, index) => ({
    id: column.build.id,
    label: `${moduleLabel(column.build, moduleChoices)}（${buildCondition(column.build)}）`,
    color: chartColors[index % chartColors.length],
    values: column.values,
  })), [chartComparison, moduleChoices])
  const chartSeries = useMemo<ComparisonChartSeries[]>(() => lineComparison.map((column, index) => ({
    id: column.build.id,
    label: `${moduleLabel(column.build, moduleChoices)}（${buildCondition(column.build)}）`,
    color: chartColors[index % chartColors.length],
    points: column.values.map((value) => ({ x: value.resistance, value: value.expectedTotalDamage })),
  })), [lineComparison, moduleChoices])
  const tableText = useMemo(() => buildGoldenglowPerformanceComparisonTsv(comparison.map((column) => ({
    label: `${moduleLabel(column.build, moduleChoices)}（${buildCondition(column.build)}）`,
    values: column.values,
  }))), [comparison, moduleChoices])
  const copyState = copyFeedback?.text === tableText ? copyFeedback.state : null
  const permanent = skill?.duration === null
  const duration = skill?.duration ?? viewingDuration
  const outputTitle = permanent ? '表示時間内の総ダメージ期待値' : 'スキル総ダメージ期待値'
  const unavailable = comparison.filter((column) => !column.skill)

  const renderChart = () => {
    if (chartType === 'line') return <ComparisonChart axisLabel="敵の術耐性" metricLabel={outputTitle} series={chartSeries} formatValue={format} showPoints={false} />
    if (chartType === 'heatmap') return <GoldenglowPerformanceHeatmap columns={chartColumns} metricLabel={outputTitle} formatValue={format} />
    return <GoldenglowPerformanceBarChart columns={chartColumns} metricLabel={outputTitle}
      resistance={activeChartResistance} stacked={chartType === 'stacked'} formatValue={format} />
  }

  const saveChartImage = async () => {
    if (!skill || imageSaveInProgress.current) return
    imageSaveInProgress.current = true
    setSavingImage(true)
    setImageFeedback(null)
    const singleResistance = chartType === 'bar' || chartType === 'stacked'
    try {
      await saveComparisonChartImage({
        chart: renderChart(),
        filename: `goldenglow-S${skill.skillIndex}-${skill.skillLevelLabel}-${format(duration)}s-${chartType}${singleResistance ? `-res${activeChartResistance}` : ''}.png`,
        width: chartType === 'heatmap' ? Math.max(1120, 88 + chartColumns.length * 150 + 2) : 1120,
      })
      setImageFeedback('saved')
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

      <GoldenglowOperatorInfo skill={skill} loading={loading} />

      <CollapsibleCalculatorPanel
        id="gg-performance-results"
        number="02"
        title="モジュール比較"
        summary={skill ? `S${skill.skillIndex}・${format(duration)}秒・${builds.length}列` : '術耐性別のスキル総ダメージ期待値'}
        open={open}
        onToggle={() => setOpen((value) => !value)}
        collapsedLabel="結果を表示"
      >
        {skill ? <>
          <div className="gg-performance-table-toolbar">
            <h3 className="gg-table-title" id="gg-performance-output-title">{outputTitle}</h3>
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
              {permanent && <label className="calculator-field gg-performance-duration">
                <span>表示時間（秒）</span>
                <input type="number" aria-label="表示時間（秒）" min={0} max={600} step="any" value={viewingDuration}
                  onChange={(event) => {
                    const value = event.target.valueAsNumber
                    setViewingDuration(Number.isFinite(value) ? Math.max(0, Math.min(600, value)) : 0)
                  }} />
              </label>}
              <button type="button" className="button secondary" aria-label="比較表をコピー" title="Excel用にコピー（小数は計算式で貼り付け）"
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
          <div className="gg-performance-table-wrap" tabIndex={0} role="region" aria-labelledby="gg-performance-output-title">
            <table className="gg-probability-table gg-performance-table" aria-labelledby="gg-performance-output-title"
              style={{ minWidth: 88 + builds.length * 150 }}>
              <colgroup><col style={{ width: 88 }} />{builds.map((build) => <col key={build.id} />)}</colgroup>
              <thead><tr>
                <th scope="col">敵の術耐性</th>
                {builds.map((build) => <th scope="col" key={build.id}>
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
                {comparison.map((column) => {
                  const value = column.values[rowIndex]?.expectedTotalDamage
                  return <td key={column.build.id}>{value === null || value === undefined ? '—' : format(value)}</td>
                })}
              </tr>)}</tbody>
            </table>
          </div>
          {unavailable.length > 0 && <p className="gg-performance-status" role="status">
            {unavailable.map((column) => `${moduleLabel(column.build, moduleChoices)}（${buildCondition(column.build)}）`).join('、')}の計算に必要なデータを取得できませんでした。
          </p>}
          <section className="gg-performance-graphs" aria-label="比較グラフ">
            <div className="gg-performance-graph-controls">
              <h3 className="gg-table-title">グラフ</h3>
              <div className="gg-performance-graph-types" role="group" aria-label="表示グラフ">
                {chartTypes.map((type) => <button key={type.value} type="button" aria-pressed={chartType === type.value}
                  onClick={() => setChartType(type.value)}>{type.label}</button>)}
              </div>
              {chartType !== 'line' && <label className="calculator-field gg-performance-step">
                <span>術耐性の刻み</span>
                <input type="number" aria-label="グラフの術耐性の刻み" min={1} max={100} step={1} value={chartResistanceStepInput}
                  onChange={(event) => {
                    setChartResistanceStepInput(event.target.value)
                    const value = event.target.valueAsNumber
                    if (Number.isInteger(value) && value >= 1 && value <= 100) setChartResistanceStep(value)
                  }}
                  onBlur={() => setChartResistanceStepInput(String(chartResistanceStep))}
                  onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
                />
              </label>}
              {(chartType === 'bar' || chartType === 'stacked') && <label className="calculator-field gg-performance-graph-resistance">
                <span>敵の術耐性</span>
                <select aria-label="グラフの術耐性" value={activeChartResistance}
                  onChange={(event) => setChartResistance(Number(event.target.value))}>
                  {chartResistanceValues.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>}
              <button type="button" className="button secondary gg-performance-save-image"
                aria-label="グラフをPNG画像で保存" title="選択中のグラフをPNG画像で保存"
                disabled={savingImage || chartColumns.length === 0} aria-busy={savingImage}
                onClick={() => void saveChartImage()}>{savingImage ? '画像を作成中…' : '画像を保存'}</button>
            </div>
            <p role="status" className={imageFeedback === 'failed' ? 'gg-performance-status' : 'visually-hidden'}>
              {imageFeedback === 'failed' ? '画像を保存できませんでした。もう一度お試しください。'
                : imageFeedback === 'saved' ? 'PNG画像のダウンロードを開始しました。' : ''}
            </p>
            {renderChart()}
          </section>
          <details className="gg-performance-assumptions">
            <summary>計算条件</summary>
            <p>昇進2最大レベル・信頼100。敵1体を攻撃し続けたときの、本体・浮遊ユニット・爆発を合わせた総ダメージ期待値です。術耐性無視と、モジュール・潜在段階による攻撃力・攻撃速度・特性・素質の変化を各列に反映します。</p>
            <p>初回攻撃は攻撃間隔後、浮遊ユニットの帰還・再索敵は0秒として計算します。S2は永続のため、指定した表示時間内の結果です。表示は小数点以下3桁までの概数です。</p>
          </details>
        </> : <p className="gg-probability-intro" role="status">{loading ? 'スキル情報を読み込み中…' : 'スキル情報の読み込み後に表示します。'}</p>}
      </CollapsibleCalculatorPanel>
      {editor && <ComparisonColumnEditor
        key={editor.build.id}
        initial={editor.build}
        adding={editor.adding}
        moduleChoices={moduleChoices}
        builds={builds}
        onClose={() => setEditor(null)}
        onSave={(build) => {
          setSavedBuilds(editor.adding ? [...builds, build] : builds.map((current) => current.id === build.id ? build : current))
          setEditor(null)
        }}
        onRemove={() => {
          setSavedBuilds(builds.filter((build) => build.id !== editor.build.id))
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
