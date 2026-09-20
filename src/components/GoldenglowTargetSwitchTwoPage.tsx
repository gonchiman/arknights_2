import { useEffect, useMemo, useRef, useState } from 'react'
import { GOLDENGLOW_OPERATOR_ID } from '../lib/goldenglowExplosion'
import { deriveGoldenglowGuideSkills } from '../lib/goldenglowGuideSkill'
import { GOLDENGLOW_TARGET_SWITCH_LIMITS } from '../lib/goldenglowTargetSwitch'
import {
  createGoldenglowTargetSwitchHpValues,
} from '../lib/goldenglowTargetSwitchHp'
import {
  chooseHpComparisonBaseline, createHpComparisonDisplaySeries, createHpComparisonUnequippedDifferenceSeries, selectHpComparisonBarHps,
  type HpComparisonInput, type HpComparisonMessage, type HpComparisonMetric, type HpComparisonSeries,
} from '../lib/goldenglowTargetSwitchHpComparison'
import { getOperatorModuleId, getOperatorModuleLevels, getOperatorModules, isOperatorModuleUnlocked } from '../lib/operatorModules'
import { writeClipboardText } from '../lib/clipboard'
import { getChartImageSavePicker, selectChartImageDestination } from '../lib/chartImageDestination'
import type { SkillRecord } from '../types/skill'
import { GoldenglowAnalysisHeader } from './GoldenglowAnalysisHeader'
import { GoldenglowTargetSwitchHpChart } from './GoldenglowTargetSwitchHpChart'
import { GoldenglowTargetSwitchHpResults } from './GoldenglowTargetSwitchHpResults'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { GoldenglowOperatorInfo } from './GoldenglowOperatorInfo'
import { GoldenglowSkillControls } from './GoldenglowSkillControls'
import { ChartImageSaveDialog, type ChartImageAspectSettings } from './ChartImageSaveDialog'
import { GoldenglowTargetSwitchHpChartImagePreview, saveGoldenglowTargetSwitchHpChartImage, type HpChartImageSnapshot } from './saveGoldenglowTargetSwitchHpChartImage'
import './DamageCalculator.css'
import './GoldenglowGuidePage.css'
import './GoldenglowPerformancePage.css'
import './GoldenglowTargetSwitchTwoPage.css'

const number = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 })
const format = (value: number) => number.format(value)
const limits = GOLDENGLOW_TARGET_SWITCH_LIMITS
type ChartDisplay = 'line' | 'bar'

export function GoldenglowTargetSwitchTwoPage({ rows, loading, error, onRetry }: {
  rows: readonly SkillRecord[]
  loading: boolean
  error: string | null
  onRetry: () => void
}) {
  const [skillIndex, setSkillIndex] = useState(3)
  const [skillLevelIndex, setSkillLevelIndex] = useState<number>()
  const [moduleSelection, setModuleSelection] = useState<Record<string, boolean>>({})
  const [moduleLevels, setModuleLevels] = useState<Record<string, number>>({})
  const [metric, setMetric] = useState<HpComparisonMetric>('total')
  const [chartKind, setChartKind] = useState<ChartDisplay>('bar')
  const [differenceMetric, setDifferenceMetric] = useState<'difference' | 'percent'>('difference')
  const [requestedBaselineId, setRequestedBaselineId] = useState('none')
  const [resistance, setResistance] = useState('0')
  const [delay, setDelay] = useState('0.1')
  const [duration, setDuration] = useState('30')
  const [startHp, setStartHp] = useState('1000')
  const [endHp, setEndHp] = useState('30000')
  const [stepHp, setStepHp] = useState('1000')
  const [trials, setTrials] = useState(10000)
  const [seed, setSeed] = useState('20260908')
  const [selectedHp, setSelectedHp] = useState<number | null>(null)
  const [digits, setDigits] = useState(0)
  const [copyFeedback, setCopyFeedback] = useState<{ text: string; ok: boolean } | null>(null)
  const [copying, setCopying] = useState(false)
  const [imageExport, setImageExport] = useState<{ id: number; filename: string; snapshot: HpChartImageSnapshot } | null>(null)
  const [imageAspect, setImageAspect] = useState<ChartImageAspectSettings>({ preset: 'auto', width: '16', height: '9' })
  const imageSnapshotId = useRef(0)
  const previewAspect = imageAspect.preset !== 'auto'
    && [imageAspect.width, imageAspect.height].every((value) => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 100)
    ? Number(imageAspect.width) / Number(imageAspect.height) : undefined
  const [savingImage, setSavingImage] = useState(false)
  const [imageFeedback, setImageFeedback] = useState<'saved' | 'downloaded' | 'failed' | null>(null)
  const imageSaveInProgress = useRef(false)
  const imageSavePicker = getChartImageSavePicker()
  const calculation = useHpSimulation()
  const running = calculation.status === 'running'

  const profile = rows.find((row) => row.operatorId === GOLDENGLOW_OPERATOR_ID)?.operatorProfile
  const modules = useMemo(() => profile ? getOperatorModules(profile).map((module, index) => ({
    module, id: getOperatorModuleId(module, index), label: ['MOD', module.typeName2?.trim()].filter(Boolean).join(' '), levels: getOperatorModuleLevels(module),
    unlocked: isOperatorModuleUnlocked(module, 2, profile.phases[2]?.maxLevel ?? 1),
  })) : [], [profile])
  const skills = useMemo(() => deriveGoldenglowGuideSkills(rows, '', 3, skillLevelIndex), [rows, skillLevelIndex])
  const skill = skills.find((item) => item.skillIndex === skillIndex) ?? skills[0]
  const choices = useMemo(() => [
    { id: 'none', moduleId: '', moduleType: null, label: '未装備', name: '', levels: [] as number[], unlocked: true },
    ...modules.map((item) => ({ ...item, moduleId: item.id, moduleType: item.module.typeName2 ?? undefined, name: item.module.uniEquipName })),
  ], [modules])
  const selectedChoices = useMemo(() => choices.filter((item) => item.unlocked
    && (item.id === 'none' || item.levels.length > 0) && (moduleSelection[item.id] ?? true)), [choices, moduleSelection])
  const builds = useMemo(() => selectedChoices.map((choice) => {
    const level = moduleLevels[choice.id] ?? choice.levels.at(-1) ?? 3
    const derived = deriveGoldenglowGuideSkills(rows, choice.moduleId, level, skillLevelIndex)
      .find((item) => item.skillIndex === skill?.skillIndex)
    const valid = derived && derived.moduleId === choice.moduleId
      && (!choice.moduleId || (choice.levels.includes(level) && derived.moduleApplication.moduleLevel === level))
    return {
      id: choice.id, label: choice.id === 'none' ? choice.label : `${choice.label} Lv.${level}`,
      moduleType: choice.moduleType, potential: 1, skill: valid ? derived : null,
    }
  }), [selectedChoices, moduleLevels, rows, skillLevelIndex, skill?.skillIndex])

  const hpRange = useMemo(() => {
    try {
      const values = createGoldenglowTargetSwitchHpValues(Number(startHp), Number(endHp), Number(stepHp))
      return { values, error: null }
    } catch (cause) {
      return { values: [], error: cause instanceof Error ? cause.message : 'HPの範囲を確認してください。' }
    }
  }, [startHp, endHp, stepHp])
  const resistanceError = validateNumber(resistance, 0, limits.maxEnemyResistance, '術耐性')
  const delayError = validateNumber(delay, 0, limits.maxSwitchDelay, '切り替え時間')
  const durationError = skill?.skillIndex === 2 ? validateNumber(duration, 0.1, limits.maxDuration, '計測時間') : null
  const seedError = validateNumber(seed, 0, limits.maxSeed, '抽選番号', true)
  const moduleError = !builds.length ? '比較する装備を1つ以上選択してください。'
    : builds.some((item) => !item.skill) ? '選択したMODの情報を取得できませんでした。装備とレベルを確認してください。' : null
  const fieldError = resistanceError ?? delayError ?? durationError ?? hpRange.error ?? seedError ?? moduleError
  const input = useMemo<HpComparisonInput | null>(() => skill && !fieldError ? {
    builds: builds.map((build) => ({ id: build.id, label: build.label, moduleType: build.moduleType, potential: build.potential, input: {
      model: build.skill!.explosionModel,
      skillIndex: build.skill!.skillIndex,
      effectiveAttack: build.skill!.effectiveAttack,
      attackInterval: build.skill!.attackInterval,
      duration: build.skill!.duration ?? Number(duration),
      enemyDefense: 0,
      enemyResistance: Number(resistance),
      enemyHps: hpRange.values,
      switchDelay: Number(delay),
      retargetRemainingDrones: true,
      trials,
      seed: Number(seed),
    } })),
  } : null, [skill, builds, fieldError, duration, resistance, hpRange.values, delay, trials, seed])
  const skillLabel = skill ? `S${skill.skillIndex} ${skill.skillLevelLabel}` : ''
  const buildLabel = skill ? `${skillLabel}・${builds.map((build) => build.label).join(' / ')}` : ''
  const inputKey = input ? JSON.stringify({ input, buildLabel }) : null
  const request = calculation.request
  const stale = !!request && request.key !== inputKey
  const rangeLabel = hpRange.values.length
    ? `HP ${format(hpRange.values[0])}〜${format(hpRange.values.at(-1)!)}・${format(Number(stepHp))}刻み・${hpRange.values.length}点`
    : 'HP範囲を確認してください'
  const calculate = () => {
    if (!input || !inputKey || running) return
    setSelectedHp(null)
    calculation.start({ input, key: inputKey, buildLabel, skillLabel,
      operatorLabel: `昇進2 Lv.${skill!.attackCalculation.level}・信頼100・潜在1` })
  }
  const sharedInput = request?.input.builds[0]?.input
  const totalPoints = request?.input.builds.reduce((sum, build) => sum + build.input.enemyHps.length, 0) ?? 0
  const completedPoints = calculation.series.reduce((sum, series) => sum + series.points.length, 0)
  const statusText = running ? `計算中 ${completedPoints} / ${totalPoints}点`
    : stale ? '条件変更あり・再計算で更新'
      : calculation.status === 'cancelled' ? `中止・${completedPoints} / ${totalPoints}点`
        : calculation.status === 'complete' ? `${request!.input.builds.length}装備 × ${sharedInput!.enemyHps.length}点・${format(sharedInput!.trials)}回 / 点`
          : calculation.status === 'error' ? '計算未完了' : ''

  const resultCondition = request && sharedInput ? `${request.buildLabel}・${format(sharedInput.duration)}秒・術耐性 ${format(sharedInput.enemyResistance)}・切り替え ${format(sharedInput.switchDelay)}秒` : ''
  const shownInput = sharedInput ?? input?.builds[0]?.input
  const shownHps = shownInput?.enemyHps ?? hpRange.values
  const shownSeries = useMemo(() => request ? calculation.series : builds.map((build) => ({
    id: build.id, label: build.label, moduleType: build.moduleType, potential: build.potential, points: [],
  })), [request, calculation.series, builds])
  const hideBaseline = chartKind === 'bar' && metric !== 'total'
  const baselineId = chooseHpComparisonBaseline(shownSeries, requestedBaselineId)
  const baselineLabel = shownSeries.find((series) => series.id === baselineId)?.label ?? ''
  const displaySeries = useMemo(() => metric === 'difference' && baselineId === 'none'
    ? createHpComparisonUnequippedDifferenceSeries(shownSeries, shownHps)
    : createHpComparisonDisplaySeries(shownSeries, shownHps, metric, baselineId), [shownSeries, shownHps, metric, baselineId])
  const visibleSeries = useMemo(() => hideBaseline ? displaySeries.filter((series) => series.id !== baselineId) : displaySeries, [displaySeries, baselineId, hideBaseline])
  const barHps = useMemo(() => selectHpComparisonBarHps(shownHps, selectedHp), [shownHps, selectedHp])
  const metricLabel = metric === 'total' ? 'スキル総ダメージ期待値'
    : metric === 'difference' ? hideBaseline ? `${baselineLabel}との差` : '基準との差'
      : hideBaseline ? `${baselineLabel}からの増加率` : '基準からの増加率'
  const displayCondition = `${resultCondition}${metric === 'total' ? '' : `・基準 ${baselineLabel}・${metricLabel}`}`
  const hasDisplayPoints = visibleSeries.some((series) => series.points.some((point) => point.value !== null))
  const hasChartPoints = visibleSeries.some((series) => series.points.some((point) => point.value !== null && (chartKind === 'line' || barHps.includes(point.enemyHp))))
  const comparisonError = hideBaseline && !visibleSeries.length
    ? '共通設定で比較する装備を2つ以上選んで計算してください。' : null
  const formatDamage = useMemo(() => {
    const formatter = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: digits, signDisplay: metric === 'total' ? 'auto' : 'exceptZero' })
    return (value: number) => `${formatter.format(value)}${metric === 'percent' ? '%' : ''}`
  }, [digits, metric])
  const tableText = request && hasDisplayPoints ? [
    `${metricLabel}［${displayCondition}・${format(sharedInput!.trials)}回/点・抽選番号${sharedInput!.seed}${calculation.status !== 'complete' ? '・途中結果' : ''}］`,
    ['敵HP', ...visibleSeries.map((series) => `${series.label}${metric !== 'total' && series.id === baselineId ? '（基準）' : ''}`)].join('\t'),
    ...shownHps.map((hp, index) => [hp, ...visibleSeries.map((series) => {
      const value = series.points[index]?.value
      return value == null ? '—' : `${value.toFixed(digits)}${metric === 'percent' ? '%' : ''}`
    })].join('\t')),
  ].join('\n') : ''
  const copyState = copyFeedback?.text === tableText ? copyFeedback.ok : null
  const copyTable = async () => {
    if (!tableText || copying) return
    setCopying(true)
    try {
      await writeClipboardText(tableText)
      setCopyFeedback({ text: tableText, ok: true })
    } catch {
      setCopyFeedback({ text: tableText, ok: false })
    } finally { setCopying(false) }
  }
  const canSaveImage = !!request && !!sharedInput && hasChartPoints && !running
  const openImageSaveDialog = () => {
    if (!canSaveImage || !request || !sharedInput || imageSaveInProgress.current) return
    setImageFeedback(null)
    // Keep the displayed results and their own conditions together, including when
    // the form has been edited or a partial calculation has been cancelled.
    setImageExport({
      id: ++imageSnapshotId.current,
      filename: `goldenglow-target-switch-2-S${sharedInput.skillIndex}-${chartKind}-${metric}-res${sharedInput.enemyResistance}.png`,
      snapshot: {
        series: structuredClone(displaySeries), maxHp: sharedInput.enemyHps.at(-1)!,
        metric, baselineId, digits, chartKind, hideBaseline, barHps: [...barHps], title: `ゴールデングロー：${metricLabel}`,
        conditions: `${request.skillLabel}・術耐性 ${format(sharedInput.enemyResistance)}`,
        notice: calculation.status === 'complete' ? undefined : `途中結果：${completedPoints} / ${totalPoints}点`,
      },
    })
  }
  const saveChartImage = async (filename: string, aspectRatio?: number) => {
    if (!imageExport || imageSaveInProgress.current || !filename.trim()) return
    const snapshot = imageExport.snapshot
    imageSaveInProgress.current = true
    setSavingImage(true)
    setImageFeedback(null)
    try {
      const destination = await selectChartImageDestination(filename, imageSavePicker)
      if (destination.type === 'cancelled') return
      await saveGoldenglowTargetSwitchHpChartImage(snapshot, filename, destination.type === 'file' ? destination.write : undefined, aspectRatio)
      setImageFeedback(destination.type === 'file' ? 'saved' : 'downloaded')
      setImageExport(null)
    } catch {
      setImageFeedback('failed')
    } finally {
      imageSaveInProgress.current = false
      setSavingImage(false)
    }
  }

  return <section className="calculator-page gg-reference-page gg2-page" aria-labelledby="gg2-title">
    <GoldenglowAnalysisHeader id="gg2-title" title="ターゲット切替2" />
    {loading ? <p className="calculator-loading" role="status">スキル情報を読み込み中…</p> : !skill ? (
      <div className="error-box" role="alert"><p>{error ?? 'ゴールデングローのスキル情報を取得できませんでした。'}</p><button type="button" className="button secondary" onClick={onRetry}>再読み込み</button></div>
    ) : <>
      <GoldenglowOperatorInfo skill={skill} loading={loading} defaultOpen={false} />
      <CollapsibleCalculatorPanel id="gg2-common-settings" number="02" title="共通設定"
        summary={`${buildLabel}・術耐性 ${resistance}・切り替え ${delay}秒`}
        collapsedLabel="設定を表示" defaultOpen={false} bodyClassName="gg-performance-settings-body">
      <form className="gg2-form" noValidate onSubmit={(event) => { event.preventDefault(); calculate() }}>
        <fieldset className="gg2-fields" disabled={running} aria-label="計算条件">
          <div className="damage-build-navigation gg-skill-navigation gg-normal-navigation">
            <GoldenglowSkillControls skill={skill} skills={skills} compact={false}
              onShowEffect={() => {}} onSkillChange={setSkillIndex} onSkillLevelChange={setSkillLevelIndex}
            />
            <div className="damage-build-navigation-group gg2-module-controls">
              <span className="damage-build-navigation-label">比較する装備</span>
              <div className="gg2-module-choices" role="group" aria-label="比較する装備">
                {choices.map((choice) => {
                  const available = choice.unlocked && (choice.id === 'none' || choice.levels.length > 0)
                  const checked = available && (moduleSelection[choice.id] ?? true)
                  return <div className={`gg2-module-choice${checked ? ' active' : ''}`} key={choice.id}>
                    <label className="gg2-module-check">
                      <input type="checkbox" checked={checked} aria-label={`${choice.label}を比較`}
                        disabled={!available || (checked && selectedChoices.length === 1)}
                        onChange={(event) => setModuleSelection((previous) => ({ ...previous, [choice.id]: event.target.checked }))} />
                      <span><strong>{choice.label}</strong>{choice.name && <span>{choice.name}</span>}</span>
                    </label>
                    {choice.id !== 'none' && <select aria-label={`${choice.label}のレベル`}
                      disabled={!checked} value={moduleLevels[choice.id] ?? choice.levels.at(-1) ?? ''}
                      onChange={(event) => setModuleLevels((previous) => ({ ...previous, [choice.id]: Number(event.target.value) }))}>
                      {choice.levels.map((level) => <option key={level} value={level}>Lv.{level}</option>)}
                    </select>}
                  </div>
                })}
              </div>
            </div>
          </div>
          <div className="gg2-condition-fields gg-performance-common-controls">
            <NumericField label="術耐性" value={resistance} onChange={setResistance} min={0} max={limits.maxEnemyResistance} invalid={!!resistanceError} />
            <NumericField label="切り替え時間（秒）" value={delay} onChange={setDelay} min={0} max={limits.maxSwitchDelay} step="0.1" invalid={!!delayError} />
            {skill.skillIndex === 2 && <NumericField label="発動後の計測時間（秒）" value={duration} onChange={setDuration} min={0.1} max={limits.maxDuration} invalid={!!durationError} />}
            <details className="gg2-settings">
              <summary>計算設定</summary>
              <div className="gg2-settings-fields">
                <NumericField label="開始HP" value={startHp} onChange={setStartHp} min={1} max={limits.maxEnemyHp} step="1" invalid={!!hpRange.error} />
                <NumericField label="終了HP" value={endHp} onChange={setEndHp} min={1} max={limits.maxEnemyHp} step="1" invalid={!!hpRange.error} />
                <NumericField label="HPの刻み" value={stepHp} onChange={setStepHp} min={1} max={limits.maxEnemyHp} step="1" invalid={!!hpRange.error} />
                <label className="calculator-field"><span>試行回数 / 点</span><select value={trials} onChange={(event) => setTrials(Number(event.target.value))}>
                  {[1000, 5000, 10000, 20000].map((value) => <option key={value} value={value}>{format(value)}回</option>)}
                </select></label>
                <NumericField label="抽選番号" value={seed} onChange={setSeed} min={0} max={limits.maxSeed} step="1" invalid={!!seedError} />
              </div>
            </details>
          </div>
        </fieldset>
      </form>
      </CollapsibleCalculatorPanel>
      <CollapsibleCalculatorPanel id="gg2-output" number="03" title="計算結果"
        summary={request ? `${request.buildLabel}・敵HP別` : rangeLabel}
        collapsedLabel="結果を表示" className="gg2-output-panel" headerActions={<>
          <label className="gg2-output-precision"><span>グラフ</span>
            <select aria-label="グラフの表示形式" value={chartKind} onChange={(event) => setChartKind(event.target.value as ChartDisplay)}>
              <option value="line">折れ線</option>
              <option value="bar">棒グラフ</option>
            </select>
          </label>
          <details name="gg2-output-options" className="gg2-comparison-options" onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.currentTarget.open = false
              event.currentTarget.querySelector('summary')?.focus()
            }
          }}>
            <summary>比較表示</summary>
            <div className="gg2-comparison-popover">
              <label className="gg2-difference-toggle"><input type="checkbox" checked={metric !== 'total'}
                onChange={(event) => setMetric(event.target.checked ? differenceMetric : 'total')} />基準との差</label>
              {metric !== 'total' && <>
                <label className="calculator-field"><span>基準の装備</span>
                  <select value={baselineId} onChange={(event) => setRequestedBaselineId(event.target.value)}>
                    {shownSeries.map((series) => <option key={series.id} value={series.id}>{series.label}</option>)}
                  </select>
                </label>
                <label className="calculator-field"><span>表示</span>
                  <select value={metric} onChange={(event) => {
                    const next = event.target.value as 'difference' | 'percent'
                    setDifferenceMetric(next); setMetric(next)
                  }}>
                    <option value="difference">ダメージ差</option><option value="percent">増加率（%）</option>
                  </select>
                </label>
              </>}
            </div>
          </details>
          <label className="gg2-output-precision"><span>小数点以下</span>
            <select aria-label="出力の小数点以下の桁数" value={digits} onChange={(event) => setDigits(Number(event.target.value))}>
              {[0, 1, 2, 3].map((value) => <option key={value} value={value}>{value}桁</option>)}
            </select>
          </label>
          <details name="gg2-output-options" className="gg2-output-conditions" onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.currentTarget.open = false
              event.currentTarget.querySelector('summary')?.focus()
            }
          }}>
            <summary>条件</summary>
            <dl>
              <dt>装備・スキル</dt><dd>{request?.buildLabel ?? buildLabel}</dd>
              <dt>計測時間</dt><dd>{shownInput ? `${format(shownInput.duration)}秒` : '—'}</dd>
              <dt>術耐性</dt><dd>{shownInput ? format(shownInput.enemyResistance) : '—'}</dd>
              <dt>切り替え時間</dt><dd>{shownInput ? `${format(shownInput.switchDelay)}秒` : '—'}</dd>
              <dt>敵HP</dt><dd>{shownHps.length ? `${format(shownHps[0])}〜${format(shownHps.at(-1)!)}` : '—'}</dd>
              <dt>計算点数</dt><dd>{shownHps.length}点</dd>
              <dt>試行回数 / 点</dt><dd>{format(shownInput?.trials ?? trials)}回</dd>
              <dt>抽選番号</dt><dd>{shownInput?.seed ?? '—'}</dd>
            </dl>
          </details>
          <div className="gg2-run-actions">
            <button type="button" className="button" onClick={calculate} disabled={!input || running}>{running ? '計算中' : request ? '再計算' : '計算する'}</button>
            {running && <button type="button" className="button secondary" onClick={calculation.cancel}>中止</button>}
          </div>
        </>}>
      <section className="gg2-output" aria-labelledby="gg2-chart-title">
        {fieldError && <p className="gg2-error" role="alert">{fieldError}</p>}
        {calculation.error && <p className="gg2-error" role="alert">{calculation.error}</p>}
        <GoldenglowTargetSwitchHpResults series={visibleSeries} enemyHps={shownHps} metric={metric} baselineId={baselineId}
          selectedHp={selectedHp} onSelectHp={setSelectedHp} formatDamage={formatDamage}
          condition={displayCondition} running={running} stale={stale} toolbar={<>
          <div className="gg-performance-table-toolbar">
            <h3 className="gg2-table-title" id="gg2-table-title">数値表</h3>
            <button type="button" className="button secondary gg-performance-copy-table" aria-label="数値表をコピー"
              disabled={!tableText || copying} onClick={() => void copyTable()}>
              {copying ? 'コピー中…' : copyState === true ? 'コピー済み' : copyState === false ? 'コピー失敗' : '表をコピー'}
            </button>
          </div>
          <span className="visually-hidden" role="status">{copyState === true ? '数値表をコピーしました。' : copyState === false ? '数値表をコピーできませんでした。' : ''}</span>
          </>}>
          <div className="gg2-chart-heading">
            <h3 id="gg2-chart-title">{metricLabel}{metric !== 'total' && !hideBaseline && <span className="gg2-baseline-label">基準：{baselineLabel}</span>}</h3>
            <button type="button" className="button secondary gg2-save-image" aria-label="グラフをPNG画像で保存" aria-haspopup="dialog"
              disabled={!canSaveImage || savingImage} aria-busy={savingImage} onClick={openImageSaveDialog}>
              {savingImage ? '保存中…' : '画像を保存'}
            </button>
          </div>
          <div className="gg2-chart-area" aria-busy={running}>
            <GoldenglowTargetSwitchHpChart series={displaySeries} maxHp={shownHps.at(-1) ?? 30000}
              selectedHp={selectedHp} onSelectHp={setSelectedHp} stale={stale} digits={digits} metric={metric} baselineId={baselineId}
              chartKind={chartKind} barHps={barHps} hideBaseline={hideBaseline} />
            {!hasChartPoints && <span className="gg2-empty">{comparisonError ?? (running ? '計算中…' : calculation.status === 'idle' ? '未計算' : hasDisplayPoints ? '表から計算済みのHPを選択してください' : metric !== 'total' && completedPoints ? '比較できる結果なし' : '計算結果なし')}</span>}
          </div>
        </GoldenglowTargetSwitchHpResults>
        <div className="gg2-status" role="status" aria-live="polite">
          {running && <progress aria-label="装備・HPごとの計算進捗" value={completedPoints} max={totalPoints} />}
          <span>{statusText}</span>
        </div>
        <span className="visually-hidden" role="status">{imageFeedback === 'saved' ? 'PNG画像を保存しました。' : imageFeedback === 'downloaded' ? 'PNG画像のダウンロードを開始しました。' : ''}</span>
        <details className="gg2-help">
          <summary>計算とグラフについて</summary>
          <p>各点は、同じHP・術耐性の敵が撃破後に続けて現れる条件での総ダメージの平均です。術耐性を適用した後の値で、敵の残りHPを超えたダメージも含みます。点の間の線は補間で、HP 0では計算しません。</p>
          <p>切り替え時間0.1秒は映像からの暫定値です。撃破時に各ユニットが攻撃先を選び直し、次の攻撃時刻を「元の予定」と「撃破時刻＋切り替え時間」の遅い方にするモデルです。同時刻は本体、浮遊ユニットの順に処理します。</p>
          <p>昇進2 Lv.{skill.attackCalculation.level}・信頼100・潜在1。各MODの攻撃力・攻撃速度・素質の変化を適用します。S2は発動後の計測時間内を計算します。抽選番号を固定すると、同じ条件の結果を再現できます。</p>
          <p>ダメージ差は「比較する装備 − 基準の装備」、増加率は「ダメージ差 ÷ 基準の総ダメージ × 100」です。基準が0の増加率と未計算の値は「—」で表示します。差分は計算済みの値から求めるため、表示の切り替えに再計算は不要です。小さな差には試行ごとのばらつきも含まれます。</p>
          <p>棒グラフは計算したHPから最大5点を選んで表示します。表や敵HP欄で別のHPを選ぶと、近い1点を入れ替えて表示します。差分表示では基準の装備を0として、ほかの装備を表示します。数値表にはすべてのHPを表示します。</p>
        </details>
      </section>
      </CollapsibleCalculatorPanel>
      {imageExport && <ChartImageSaveDialog initialFilename={imageExport.filename}
        aspect={imageAspect} onAspectChange={setImageAspect}
        canChooseLocation={!!imageSavePicker} saving={savingImage} error={imageFeedback === 'failed'} helpMode="popover"
        preview={<GoldenglowTargetSwitchHpChartImagePreview
          key={`${imageExport.id}:${imageExport.snapshot.chartKind}:${imageExport.snapshot.metric}:${previewAspect ?? 'auto'}`}
          snapshot={imageExport.snapshot} aspectRatio={previewAspect} />}
        onClose={() => {
          if (imageSaveInProgress.current) return
          setImageExport(null); setImageFeedback(null)
        }}
        onSave={(filename, aspectRatio) => void saveChartImage(filename, aspectRatio)} />}
    </>}
  </section>
}

function NumericField({ label, value, onChange, min, max, step = 'any', invalid }: {
  label: string; value: string; onChange: (value: string) => void; min: number; max: number; step?: string; invalid: boolean
}) {
  return <label className="calculator-field"><span>{label}</span><input type="number" inputMode={step === '1' ? 'numeric' : 'decimal'}
    value={value} onChange={(event) => onChange(event.target.value)} min={min} max={max} step={step}
    aria-invalid={invalid} /></label>
}

function validateNumber(value: string, min: number, max: number, label: string, integer = false): string | null {
  const parsed = Number(value)
  return value.trim() === '' || !Number.isFinite(parsed) || parsed < min || parsed > max || (integer && !Number.isSafeInteger(parsed))
    ? `${label}は${format(min)}〜${format(max)}の${integer ? '整数' : '数値'}で入力してください。` : null
}

interface HpRequest { input: HpComparisonInput; key: string; buildLabel: string; skillLabel: string; operatorLabel: string }
interface HpCalculation {
  request: HpRequest | null
  series: HpComparisonSeries[]
  status: 'idle' | 'running' | 'complete' | 'cancelled' | 'error'
  error: string | null
}

function useHpSimulation() {
  const [state, setState] = useState<HpCalculation>({ request: null, series: [], status: 'idle', error: null })
  const workerRef = useRef<Worker | null>(null)
  const stop = () => { workerRef.current?.terminate(); workerRef.current = null }
  useEffect(() => stop, [])

  const start = (request: HpRequest) => {
    stop()
    const emptySeries = request.input.builds.map((build) => ({
      id: build.id, label: build.label, moduleType: build.moduleType, potential: build.potential, points: [],
    }))
    setState({ request, series: emptySeries, status: 'running', error: null })
    try {
      const worker = new Worker(new URL('../lib/goldenglowTargetSwitchHpComparison.worker.ts', import.meta.url), { type: 'module' })
      workerRef.current = worker
      const fail = (message: string) => {
        if (workerRef.current !== worker) return
        stop()
        setState((previous) => ({ ...previous, status: 'error', error: message }))
      }
      worker.onmessage = (event: MessageEvent<HpComparisonMessage>) => {
        if (workerRef.current !== worker) return
        const message = event.data
        if (message.type === 'point') {
          setState((previous) => ({ ...previous, series: previous.series.map((series) => series.id === message.buildId
            ? { ...series, points: [...series.points, message.point] } : series) }))
        } else if (message.type === 'complete') {
          stop()
          setState({ request, series: message.series, status: 'complete', error: null })
        } else fail(message.error)
      }
      worker.onerror = () => fail('計算を完了できませんでした。条件を確認して再計算してください。')
      worker.onmessageerror = () => fail('計算結果を読み取れませんでした。再計算してください。')
      worker.postMessage(request.input)
    } catch {
      stop()
      setState({ request, series: emptySeries, status: 'error', error: '計算を開始できませんでした。ページを再読み込みしてください。' })
    }
  }
  const cancel = () => {
    stop()
    setState((previous) => previous.status === 'running' ? { ...previous, status: 'cancelled' } : previous)
  }
  return { ...state, start, cancel }
}
