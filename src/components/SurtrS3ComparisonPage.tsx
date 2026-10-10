import { useEffect, useMemo, useState } from 'react'
import type { SkillRecord } from '../types/skill'
import { SURTR_OPERATOR_ID, deriveSurtrDpsModel, type SurtrDpsSettings } from '../lib/surtrDps'
import { getSurtrModuleChoices, getSelectedSurtrModuleStages, type SurtrModuleChoice } from '../lib/surtrModuleComparison'
import { readSurtrComparisonPageState, writeSurtrComparisonPageState } from '../lib/surtrComparisonPageState'
import { applySurtrComparisonPreset } from '../lib/surtrComparisonPresets'
import { buildSurtrPotentialComparison } from '../lib/surtrPotentialComparison'
import { calculateSurtrDpsCalculation } from '../lib/surtrDpsCalculation'
import { getSurtrDpsResistanceSamples, isValidSurtrDpsResistanceRange } from '../lib/surtrDpsResistance'
import type { SurtrDpsOutputSeries } from '../lib/surtrDpsOutput'
import { buildSurtrUnequippedComparisonSeries, getSurtrComparisonBaseLabel, getSurtrComparisonTargets,
  getSurtrStageComparisonBaseline, type SurtrUnequippedMetric } from '../lib/surtrUnequippedComparison'
import { SURTR_HOME_LINK } from '../lib/navigation'
import { PageBreadcrumbs } from './PageBreadcrumbs'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { SurtrModuleStageSelection } from './SurtrModuleStageSelection'
import { SurtrComparisonPresetControls } from './SurtrComparisonPresetControls'
import { SurtrModuleComparisonTableControls, type SurtrModuleComparisonTableOptions } from './SurtrModuleComparisonTableControls'
import { getSurtrResistanceStepError } from './SurtrResistanceStepControl'
import { SurtrUnequippedComparisonTable } from './SurtrUnequippedComparisonTable'
import { SurtrDpsDetailModal, type SurtrDpsDetailSnapshot } from './SurtrDpsDetailModal'
import './DamageCalculator.css'
import './SurtrS3Page.css'
import './SurtrS3ComparisonPage.css'

const skillLabel = (index: number) => index < 7 ? `ランク${index + 1}` : `特化${index - 6}`

export function SurtrS3ComparisonPage({ rows, loading, error, onRetry }: {
  rows: readonly SkillRecord[]
  loading: boolean
  error: string | null
  onRetry: () => void
}) {
  const record = rows.find(row => row.operatorId === SURTR_OPERATOR_ID && row.skillIndex === 3)
  const [state, setState] = useState(readSurtrComparisonPageState)
  const [customStep, setCustomStep] = useState(typeof state.unequippedStep === 'number' && ![10, 20].includes(state.unequippedStep))
  const [stepDraft, setStepDraft] = useState(String(typeof state.unequippedStep === 'number' ? state.unequippedStep : 10))
  const [rangeDraft, setRangeDraft] = useState({ min: String(state.resistanceRange.min), max: String(state.resistanceRange.max) })
  const [detail, setDetail] = useState<SurtrDpsDetailSnapshot | null>(null)
  useEffect(() => writeSurtrComparisonPageState(state), [state])

  const maximumLevel = record?.operatorProfile.phases[2]?.maxLevel ?? 90
  const effectiveSettings = useMemo(() => ({ ...state.settings, blocking: false,
    level: Math.min(maximumLevel, state.settings.level),
    skillLevelIndex: Math.min(state.settings.skillLevelIndex, Math.max(0, (record?.skillLevels.length ?? 10) - 1)),
  }), [state.settings, maximumLevel, record])
  const choices = useMemo(() => getSurtrModuleChoices(record?.operatorProfile, effectiveSettings.level), [record, effectiveSettings.level])
  const stages = useMemo(() => getSelectedSurtrModuleStages(choices, state.excluded, state.moduleLevels), [choices, state.excluded, state.moduleLevels])
  const tableComparison = useMemo(() => record ? buildSurtrPotentialComparison(record, effectiveSettings,
    stages, state.unequippedPotentials, state.unequippedComparisonBase) : null,
  [record, effectiveSettings, stages, state.unequippedPotentials, state.unequippedComparisonBase])
  const resistances = useMemo(() => getSurtrDpsResistanceSamples(state.unequippedStep, state.resistanceRange),
    [state.unequippedStep, state.resistanceRange])
  const baseLabel = getSurtrComparisonBaseLabel(state.unequippedComparisonBase)
  const label = skillLabel(effectiveSettings.skillLevelIndex)
  const remnantLabel = effectiveSettings.remnantActive ? '余燼中' : '余燼なし'
  const rangeError = !rangeDraft.min.trim() || !rangeDraft.max.trim()
    || !isValidSurtrDpsResistanceRange({ min: Number(rangeDraft.min), max: Number(rangeDraft.max) })
    ? '0〜100の整数で、終了を開始より大きくしてください。' : ''
  const stepError = getSurtrResistanceStepError(customStep, stepDraft)
  const update = <K extends keyof SurtrDpsSettings>(key: K, value: SurtrDpsSettings[K]) => setState(previous => ({
    ...previous, settings: { ...previous.settings, [key]: value },
  }))
  const toggleModuleLevel = (choice: SurtrModuleChoice, level: number, checked: boolean) => setState(previous => {
    const selected = previous.excluded.includes(choice.id) ? [] : previous.moduleLevels[choice.id] ?? [choice.levels.at(-1) ?? 3]
    return { ...previous, excluded: previous.excluded.filter(id => id !== choice.id), moduleLevels: {
      ...previous.moduleLevels, [choice.id]: choice.levels.filter(candidate => candidate === level ? checked : selected.includes(candidate)),
    } }
  })
  const togglePotential = (potential: number, checked: boolean) => setState(previous => ({ ...previous,
    unequippedPotentials: [1, 2, 3, 4, 5, 6].filter(candidate => candidate === potential ? checked : previous.unequippedPotentials.includes(candidate)),
  }))
  const updateRange = (bound: 'min' | 'max', value: string) => {
    const draft = { ...rangeDraft, [bound]: value }
    setRangeDraft(draft)
    const next = { min: Number(draft.min), max: Number(draft.max) }
    if (!draft.min.trim() || !draft.max.trim() || !isValidSurtrDpsResistanceRange(next)) return
    setState(previous => ({ ...previous, resistanceRange: next,
      selectedResistance: previous.selectedResistance !== null && (previous.selectedResistance < next.min || previous.selectedResistance > next.max)
        ? null : previous.selectedResistance,
    }))
  }
  const options: SurtrModuleComparisonTableOptions = {
    comparisonBase: state.unequippedComparisonBase, layout: state.unequippedLayout, columnOrder: state.unequippedColumnOrder,
    metric: state.unequippedMetric, step: state.unequippedStep, customStep, stepDraft,
    rankMode: state.unequippedRankMode, precision: state.precision,
    colorScale: state.unequippedColorScale ? state.unequippedColorScaleMode : 'NONE',
  }
  const updateOptions = (changes: Partial<SurtrModuleComparisonTableOptions>) => {
    if (changes.customStep !== undefined) setCustomStep(changes.customStep)
    if (changes.stepDraft !== undefined) setStepDraft(changes.stepDraft)
    setState(previous => ({ ...previous,
      unequippedComparisonBase: changes.comparisonBase ?? previous.unequippedComparisonBase,
      unequippedLayout: changes.layout ?? previous.unequippedLayout,
      unequippedColumnOrder: changes.columnOrder ?? previous.unequippedColumnOrder,
      unequippedMetric: changes.metric ?? previous.unequippedMetric,
      unequippedStep: changes.step ?? previous.unequippedStep,
      unequippedRankMode: changes.rankMode ?? previous.unequippedRankMode,
      precision: changes.precision ?? previous.precision,
      unequippedColorScale: changes.colorScale !== undefined ? changes.colorScale !== 'NONE' : previous.unequippedColorScale,
      unequippedColorScaleMode: changes.colorScale && changes.colorScale !== 'NONE' ? changes.colorScale : previous.unequippedColorScaleMode,
    }))
  }
  const openDetail = (resistance: number, requestedSeriesId: string | undefined,
    detailMetric: SurtrUnequippedMetric | 'total', requestedBlocking?: boolean) => {
    if (!record || !tableComparison) return
    const blocking = requestedBlocking ?? false
    const group = tableComparison.blockingComparison.find(group => group.blocking === blocking)
    if (!group) return
    const targets = getSurtrComparisonTargets(group.series, state.unequippedComparisonBase)
    const requested = [...group.series, ...(group.referenceSeries ?? [])].find(item => item.id === requestedSeriesId)
    const entries = requested && !targets.some(item => item.id === requested.id) ? [requested, ...targets] : targets
    const values = buildSurtrUnequippedComparisonSeries(group.series, group.baseline, state.unequippedMetric,
      state.unequippedComparisonBase, group.referenceSeries)
    const getCalculation = (item: SurtrDpsOutputSeries) => {
      const stageId = item.moduleStageId ?? item.id
      const stage = stageId === 'none' ? null : /^(.*):lv([123])$/.exec(stageId)
      if (stageId !== 'none' && !stage) return null
      const model = deriveSurtrDpsModel(record, { ...effectiveSettings, blocking, potential: item.potential ?? effectiveSettings.potential },
        stage?.[1] ?? '', Number(stage?.[2] ?? 0))
      return model ? calculateSurtrDpsCalculation(model, resistance) : null
    }
    const detailSeries = entries.flatMap(item => {
      const calculation = getCalculation(item)
      if (!calculation) return []
      const reference = getSurtrStageComparisonBaseline(item, group.baseline, state.unequippedComparisonBase, group.referenceSeries)
      const referenceCalculation = reference ? getCalculation(reference) : null
      return [{ id: item.id, label: item.label, color: item.color, calculation,
        value: detailMetric === 'total' ? calculation.dps : values.find(value => value.id === item.id)?.points.find(point => point.x === resistance)?.value ?? null,
        ...(reference && referenceCalculation ? { baseline: { label: reference.label, calculation: referenceCalculation } } : {}) }]
    })
    if (!detailSeries.length) return
    setState(previous => ({ ...previous, selectedResistance: resistance }))
    setDetail({ resistance, series: detailSeries, initialSeriesId: requestedSeriesId ?? detailSeries[0].id,
      metric: detailMetric, baselineId: group.baseline.id, precision: state.precision, signedComparison: true, comparisonBase: state.unequippedComparisonBase,
      conditions: `昇進2 Lv.${effectiveSettings.level}・信頼度${effectiveSettings.trust}・潜在${state.unequippedPotentials.join('・')}・S3 ${label}・${blocking ? '対象を自身でブロック' : '未ブロック'}・${remnantLabel}` })
  }
  const status = error ? <div className="error-box" role="alert">{error}<button className="button secondary" type="button" onClick={onRetry}>再読み込み</button></div>
    : <p className="surtr-s3-status" role="status">{loading ? 'スルトのデータを読み込み中…' : 'スルトS3のデータを取得できませんでした。'}</p>

  return <section className="calculator-page surtr-s3-page surtr-s3-comparison-page" aria-labelledby="surtr-s3-comparison-title">
    <div className="page-heading-with-breadcrumbs">
      <PageBreadcrumbs parents={[SURTR_HOME_LINK]} current="S3 MOD・潜在比較" />
      <header className="page-intro"><h1 id="surtr-s3-comparison-title">S3 MOD・潜在比較<span className="surtr-s3-subtitle">ラグナロク</span></h1>
        <p>MOD・段階・潜在を、未ブロックと対象を自身でブロックする条件で比較します。</p>
        <a className="surtr-s3-page-link" href="#/analysis/surtr/s3">S3分析のグラフ・数値表へ</a>
      </header>
    </div>
    <CollapsibleCalculatorPanel id="surtr-s3-comparison-conditions" number="01" title="比較条件"
      summary={`昇進2 Lv.${effectiveSettings.level}・${label}・潜在${state.unequippedPotentials.join('・')}・${remnantLabel}`} collapsedLabel="比較条件を表示">
      {record ? <>
        <div className="surtr-s3-fields surtr-s3-comparison-fields">
          <label className="calculator-field"><span>レベル（昇進2）</span><input aria-label="レベル（昇進2）" type="number" min={1} max={maximumLevel} step={1} value={effectiveSettings.level}
            onChange={event => update('level', Math.max(1, Math.min(maximumLevel, Math.trunc(Number(event.target.value)) || 1)))} /></label>
          <label className="calculator-field"><span>信頼度</span><input aria-label="信頼度" type="number" min={0} max={100} step={1} value={effectiveSettings.trust}
            onChange={event => update('trust', Math.max(0, Math.min(100, Math.trunc(Number(event.target.value)) || 0)))} /></label>
          <label className="calculator-field"><span>スキルレベル</span><select aria-label="スキルレベル" value={effectiveSettings.skillLevelIndex} onChange={event => update('skillLevelIndex', Number(event.target.value))}>
            {record.skillLevels.map((_, index) => <option key={index} value={index}>{skillLabel(index)}</option>)}</select></label>
        </div>
        <SurtrComparisonPresetControls choices={choices} excluded={state.excluded} moduleLevels={state.moduleLevels}
          onApply={selection => setState(previous => applySurtrComparisonPreset(previous, selection, choices))} />
        <SurtrModuleStageSelection choices={choices} excluded={state.excluded} moduleLevels={state.moduleLevels} onToggleLevel={toggleModuleLevel}
          onToggleNone={checked => setState(previous => ({ ...previous, excluded: checked ? previous.excluded.filter(id => id !== '') : [...previous.excluded, ''] }))} />
        <fieldset className="surtr-s3-potential-selection"><legend>比較する潜在</legend>
          {[1, 2, 3, 4, 5, 6].map(potential => <label key={potential}><input type="checkbox" aria-label={`潜在${potential}を比較`}
            checked={state.unequippedPotentials.includes(potential)} onChange={event => togglePotential(potential, event.target.checked)} />潜在{potential}</label>)}
        </fieldset>
        <div className="surtr-s3-comparison-condition-controls">
          <SurtrModuleComparisonTableControls group="conditions" allowPotentialComparison stepErrorId="surtr-s3-comparison-step-error" value={options} onChange={updateOptions} />
          <label className="surtr-s3-values-toggle"><input type="checkbox" checked={!!effectiveSettings.remnantActive}
            onChange={event => update('remnantActive', event.target.checked)} />素質2「余燼」発動中</label>
        </div>
        <details className="surtr-s3-assumptions"><summary>計算条件</summary>
          <p>敵1体への連続攻撃を想定した理論DPSです。{effectiveSettings.remnantActive ? '素質2「余燼」発動中の攻撃速度を反映します。' : '素質2「余燼」は含めません。'}素質1、MODの攻撃力・特性を反映し、外部バフとフレーム単位の攻撃間隔の丸めは含めません。</p>
          <p>「余燼」発動中はMOD Y Lv.2の攻撃速度＋20、Lv.3の＋30を反映します。未装備・MOD X・MOD Y Lv.1のDPSは変わりません。発動中の持続時間や攻撃回数による総ダメージは計算しません。</p>
          <p>未ブロックはスルトが誰もブロックしていない状態です。「対象を自身でブロック」は攻撃対象をスルト自身がブロックしている状態です。両方の条件を表に表示します。</p>
        </details>
      </> : status}
    </CollapsibleCalculatorPanel>
    <CollapsibleCalculatorPanel id="surtr-s3-comparison-display" number="02" title="表の表示設定"
      summary={`${state.unequippedLayout === 'combined' ? 'DPS＋比較値' : '比較値のみ'}・${state.unequippedMetric === 'difference' ? 'DPS差' : state.unequippedMetric === 'ratio' ? '比率' : '増加率'}・術耐性${state.resistanceRange.min}〜${state.resistanceRange.max}`} collapsedLabel="表示設定を表示">
      <div className="surtr-s3-comparison-display-controls">
        <SurtrModuleComparisonTableControls group="display" allowPotentialComparison stepErrorId="surtr-s3-comparison-step-error" value={options} onChange={updateOptions} />
      </div>
      <fieldset className="surtr-s3-comparison-range"><legend>術耐性の範囲</legend><div className="surtr-s3-resistance-bounds">
        {(['min', 'max'] as const).map(bound => <label className="calculator-field" key={bound}><span>{bound === 'min' ? '開始' : '終了'}</span>
          <input type="number" min="0" max="100" step="1" aria-label={`${bound === 'min' ? '開始' : '終了'}術耐性`} value={rangeDraft[bound]}
            aria-invalid={!!rangeError} aria-describedby={rangeError ? 'surtr-s3-comparison-range-error' : undefined}
            onChange={event => updateRange(bound, event.target.value)} /></label>)}
      </div>{rangeError && <p className="surtr-s3-axis-error" id="surtr-s3-comparison-range-error" role="alert">{rangeError}</p>}</fieldset>
    </CollapsibleCalculatorPanel>
    <CollapsibleCalculatorPanel id="surtr-s3-comparison-result" number="03" title="比較結果"
      summary={`${baseLabel}との比較・ブロック条件比較`} collapsedLabel="比較結果を表示" className="surtr-s3-output-panel">
      {!record ? status : !state.unequippedPotentials.length ? <p className="surtr-s3-status" role="status">比較する潜在を選択してください。</p>
        : !stages.length || (!state.unequippedComparisonBase.startsWith('potential-') && !stages.some(item => item.id !== 'none'))
          ? <p className="surtr-s3-status" role="status">比較するMODを選択してください。</p>
        : !tableComparison ? <p role="alert">比較条件の計算に必要なデータを取得できませんでした。</p>
        : !!rangeError || !!stepError ? <p className="surtr-s3-status" role="status">術耐性の範囲と刻みを確認してください。</p>
        : !resistances.length ? <p className="surtr-s3-status" role="status">指定した範囲に表示する術耐性がありません。</p>
        : <SurtrUnequippedComparisonTable enableImageLayouts series={tableComparison.series} baseline={tableComparison.baseline}
          referenceSeries={tableComparison.referenceSeries} resistances={resistances} precision={state.precision}
          metric={state.unequippedMetric} layout={state.unequippedLayout} comparisonBase={state.unequippedComparisonBase}
          rankMode={state.unequippedRankMode} columnOrder={state.unequippedColumnOrder}
          colorScale={state.unequippedColorScale} colorScaleMode={state.unequippedColorScaleMode}
          blockingComparison={tableComparison.blockingComparison} selectedResistance={state.selectedResistance}
          metadata={{ skillLabel: label, level: effectiveSettings.level, trust: effectiveSettings.trust,
            potential: state.unequippedPotentials[0], potentials: state.unequippedPotentials, blocking: false, remnantActive: effectiveSettings.remnantActive }}
          onOpenDetail={openDetail} />}
    </CollapsibleCalculatorPanel>
    {detail && <SurtrDpsDetailModal snapshot={detail} onClose={() => setDetail(null)} />}
  </section>
}
