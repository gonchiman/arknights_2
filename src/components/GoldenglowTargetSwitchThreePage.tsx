import { useMemo, useState } from 'react'
import type { SkillRecord } from '../types/skill'
import { GOLDENGLOW_OPERATOR_ID } from '../lib/goldenglowExplosion'
import { deriveGoldenglowGuideSkills } from '../lib/goldenglowGuideSkill'
import { GOLDENGLOW_TARGET_SWITCH_LIMITS as limits } from '../lib/goldenglowTargetSwitch'
import { createGoldenglowTargetSwitchHpValues } from '../lib/goldenglowTargetSwitchHp'
import { GOLDENGLOW_HP_RANK_PRESET } from '../lib/goldenglowTargetSwitchHpComparison'
import { parseComparisonValues } from '../lib/goldenglowResistanceComparisonSettings'
import { validateResistanceComparisonInput, type ResistanceComparisonInput } from '../lib/goldenglowResistanceComparison'
import { getSurtrModuleChoices, getSelectedSurtrModuleStages, type SurtrModuleChoice } from '../lib/surtrModuleComparison'
import { applySurtrComparisonPreset, buildSurtrComparisonPresets } from '../lib/surtrComparisonPresets'
import { getSurtrDpsResistanceSamples, isValidSurtrDpsResistanceRange, type SurtrDpsBarStep } from '../lib/surtrDpsResistance'
import { getGgTableBaselineId, type GgTableBaseline, type GgTableBuild, type GgTableColorScale,
  type GgTableData, type GgTableLayout, type GgTableMetric } from '../lib/goldenglowTargetSwitchTable'
import { GoldenglowAnalysisHeader } from './GoldenglowAnalysisHeader'
import { GoldenglowSkillControls } from './GoldenglowSkillControls'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { SurtrModuleStageSelection } from './SurtrModuleStageSelection'
import { SurtrResistanceStepControl, getSurtrResistanceStepError } from './SurtrResistanceStepControl'
import { HelpPopover } from './HelpPopover'
import { useGoldenglowResistanceSimulation } from './useGoldenglowResistanceSimulation'
import { GoldenglowTargetSwitchTable } from './GoldenglowTargetSwitchTable'
import './DamageCalculator.css'
import './GoldenglowGuidePage.css'
import './SurtrS3Page.css'
import './SurtrComparisonPresetControls.css'
import './GoldenglowTargetSwitchThreePage.css'

const format = (value: number) => value.toLocaleString('ja-JP', { maximumFractionDigits: 3 })
type Snapshot = { builds: GgTableBuild[]; baseline: GgTableBaseline; conditions: string }

export function GoldenglowTargetSwitchThreePage({ rows, loading, error, onRetry }: {
  rows: readonly SkillRecord[]; loading: boolean; error: string | null; onRetry: () => void
}) {
  const [skillIndex, setSkillIndex] = useState(3)
  const [skillLevelIndex, setSkillLevelIndex] = useState<number>()
  const [selection, setSelection] = useState<{ excluded: string[]; moduleLevels: Record<string, number[]> }>({ excluded: [], moduleLevels: {} })
  const [baseline, setBaseline] = useState<GgTableBaseline>({ kind: 'unequipped' })
  const [hpMode, setHpMode] = useState('rank')
  const [hpList, setHpList] = useState(GOLDENGLOW_HP_RANK_PRESET.join(', '))
  const [hpRange, setHpRange] = useState({ min: '1000', max: '30000', step: '1000' })
  const [resRange, setResRange] = useState({ min: '0', max: '100' })
  const [resStep, setResStep] = useState<SurtrDpsBarStep>(20)
  const [customResStep, setCustomResStep] = useState(false)
  const [resStepDraft, setResStepDraft] = useState('10')
  const [delay, setDelay] = useState('0.1')
  const [duration, setDuration] = useState('30')
  const [trials, setTrials] = useState(10000)
  const [seed, setSeed] = useState('20260908')
  const [layout, setLayout] = useState<GgTableLayout>('comparison')
  const [metric, setMetric] = useState<GgTableMetric>('percent')
  const [precision, setPrecision] = useState(0)
  const [showRanks, setShowRanks] = useState(true)
  const [colorScale, setColorScale] = useState<GgTableColorScale>('NONE')
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const calculation = useGoldenglowResistanceSimulation()
  const running = calculation.status === 'running'
  const profile = rows.find(row => row.operatorId === GOLDENGLOW_OPERATOR_ID)?.operatorProfile
  const choices = useMemo(() => getSurtrModuleChoices(profile, profile?.phases[2]?.maxLevel ?? 90), [profile])
  const stages = useMemo(() => getSelectedSurtrModuleStages(choices, selection.excluded, selection.moduleLevels), [choices, selection])
  const allStages = useMemo(() => getSelectedSurtrModuleStages(choices, [], Object.fromEntries(choices.map(choice => [choice.id, choice.levels]))), [choices])
  const skills = useMemo(() => deriveGoldenglowGuideSkills(rows, '', 3, skillLevelIndex), [rows, skillLevelIndex])
  const skill = skills.find(item => item.skillIndex === skillIndex) ?? skills[0]
  const descriptors = useMemo(() => allStages.map(stage => ({ id: stage.id, label: stage.label,
    moduleId: stage.moduleId, moduleType: stage.type, moduleLevel: stage.level })), [allStages])
  const visibleBuilds = descriptors.filter(build => stages.some(stage => stage.id === build.id))
  const presets = useMemo(() => buildSurtrComparisonPresets(choices), [choices])
  const hpSelection = useMemo(() => {
    if (hpMode === 'rank') return { values: [...GOLDENGLOW_HP_RANK_PRESET], error: null }
    if (hpMode === 'list') return parseComparisonValues(hpList, '比較するHP', 1, limits.maxEnemyHp, 100)
    try {
      if (Object.values(hpRange).some(value => !value.trim())) throw new RangeError('HPの開始・終了・刻みを入力してください。')
      return { values: createGoldenglowTargetSwitchHpValues(Number(hpRange.min), Number(hpRange.max), Number(hpRange.step)), error: null }
    } catch (cause) { return { values: [], error: cause instanceof Error ? cause.message : 'HPの範囲を確認してください。' } }
  }, [hpMode, hpList, hpRange])
  const resRangeValue = { min: Number(resRange.min), max: Number(resRange.max) }
  const rangeError = !resRange.min.trim() || !resRange.max.trim() || !isValidSurtrDpsResistanceRange(resRangeValue)
    ? '術耐性は0〜100の整数で、終了を開始より大きくしてください。' : null
  const stepError = getSurtrResistanceStepError(customResStep, resStepDraft)
  const resistances = getSurtrDpsResistanceSamples(resStep, resRangeValue)
  const fieldError = hpSelection.error ?? rangeError ?? (stepError || null)
    ?? numericError(delay, 0, limits.maxSwitchDelay, '切り替え時間')
    ?? (skill?.skillIndex === 2 ? numericError(duration, 0.1, limits.maxDuration, '計測時間') : null)
    ?? numericError(seed, 0, limits.maxSeed, '抽選番号', true)
    ?? (!stages.length ? '比較する装備を1つ以上選択してください。' : null)
    ?? (!resistances.length ? '指定した範囲に計算する術耐性がありません。' : null)
  const prepared = useMemo(() => {
    if (!skill || fieldError) return { input: null, error: fieldError }
    const required = new Set(visibleBuilds.map(build => build.id))
    for (const build of visibleBuilds) {
      const reference = getGgTableBaselineId(build, baseline)
      if (reference) required.add(reference)
    }
    try {
      if (baseline.kind === 'selected' && !descriptors.some(build => build.id === baseline.id)) throw new RangeError('基準の装備を選択してください。')
      const input: ResistanceComparisonInput = {
        enemyResistances: resistances,
        builds: descriptors.filter(build => required.has(build.id)).map(build => {
          const derived = deriveGoldenglowGuideSkills(rows, build.moduleId, build.moduleLevel || 3, skillLevelIndex)
            .find(item => item.skillIndex === skill.skillIndex)
          if (!derived || derived.moduleId !== build.moduleId
            || (build.moduleId && derived.moduleApplication.moduleLevel !== build.moduleLevel)) throw new RangeError('選択したMOD・段階の情報を取得できませんでした。')
          return { id: build.id, label: build.label, moduleType: build.moduleType, potential: 1, input: {
            model: derived.explosionModel, skillIndex: derived.skillIndex, effectiveAttack: derived.effectiveAttack,
            attackInterval: derived.attackInterval, duration: derived.duration ?? Number(duration),
            enemyDefense: 0, enemyResistance: 0, enemyHps: hpSelection.values, switchDelay: Number(delay),
            retargetRemainingDrones: true, trials, seed: Number(seed),
          } }
        }),
      }
      validateResistanceComparisonInput(input)
      return { input, error: null }
    } catch (cause) { return { input: null, error: cause instanceof Error ? cause.message : '計算条件を確認してください。' } }
  }, [rows, skill, skillLevelIndex, descriptors, JSON.stringify(visibleBuilds), baseline, hpSelection, JSON.stringify(resistances), fieldError, delay, duration, trials, seed])
  const inputKey = prepared.input ? JSON.stringify({ input: prepared.input, visible: visibleBuilds.map(build => build.id), baseline }) : null
  const stale = !!calculation.request && calculation.request.key !== inputKey
  const skillLabel = skill ? `S${skill.skillIndex} ${skill.skillLevelLabel}` : ''
  const calculate = () => {
    if (!prepared.input || !inputKey || !skill || running) return
    const conditions = `昇進2 Lv.${skill.attackCalculation.level}・信頼100・潜在1・${skillLabel}・${format(prepared.input.builds[0].input.duration)}秒・切り替え${delay}秒・${format(trials)}回/点・抽選番号${seed}`
    setSnapshot(structuredClone({ builds: visibleBuilds, baseline, conditions }))
    calculation.start({ input: prepared.input, key: inputKey, minHp: hpSelection.values[0], skillLabel,
      buildLabel: visibleBuilds.map(build => build.label).join(' / '), operatorLabel: `昇進2 Lv.${skill.attackCalculation.level}・信頼100・潜在1` })
  }
  const toggleLevel = (choice: SurtrModuleChoice, level: number, checked: boolean) => setSelection(previous => {
    const selected = previous.excluded.includes(choice.id) ? [] : previous.moduleLevels[choice.id] ?? [choice.levels.at(-1) ?? 3]
    return { excluded: previous.excluded.filter(id => id !== choice.id), moduleLevels: { ...previous.moduleLevels,
      [choice.id]: choice.levels.filter(candidate => candidate === level ? checked : selected.includes(candidate)) } }
  })
  const data: GgTableData = { builds: snapshot?.builds ?? visibleBuilds, series: calculation.series,
    hps: calculation.request?.input.builds[0]?.input.enemyHps ?? hpSelection.values,
    resistances: calculation.request?.input.enemyResistances ?? resistances, baseline: snapshot?.baseline ?? baseline,
    layout, metric, precision, showRanks, colorScale }
  const status = loading ? <p role="status">スキル情報を読み込み中…</p>
    : <div className="error-box" role="alert">{error ?? 'ゴールデングローのスキル情報を取得できませんでした。'}<button type="button" className="button secondary" onClick={onRetry}>再読み込み</button></div>
  const workload = prepared.input ? prepared.input.builds.length * hpSelection.values.length * resistances.length : 0
  const actions = <div className="gg3-run-actions"><button type="button" className="button" disabled={!prepared.input || running} onClick={calculate}> {running ? '計算中…' : '計算する'}</button>
    {running && <button type="button" className="button secondary" onClick={calculation.cancel}>中止</button>}</div>

  return <section className="calculator-page surtr-s3-page gg3-page" aria-labelledby="gg3-title">
    <GoldenglowAnalysisHeader id="gg3-title" title="ターゲット切替3" />
    <a className="gg3-page-link" href="#/analysis/goldenglow/target-switch-2">ターゲット切替2のグラフへ</a>
    <CollapsibleCalculatorPanel id="gg3-conditions" number="01" title="比較条件" defaultOpen={false}
      summary={`${skillLabel}・HP ${hpSelection.values.length}点 × 術耐性 ${resistances.length}点・切り替え${delay}秒`}
      collapsedLabel="比較条件を表示" headerActions={actions} headerActionsWhenCollapsed>
      {!skill ? status : <fieldset className="gg3-condition-fields" disabled={running}>
        <GoldenglowSkillControls skill={skill} skills={skills} compact={false} onShowEffect={() => {}}
          onSkillChange={setSkillIndex} onSkillLevelChange={setSkillLevelIndex} />
        <fieldset className="surtr-comparison-presets"><legend>比較プリセット</legend><div className="surtr-comparison-preset-buttons" role="group" aria-label="比較プリセット">
          {presets.map(preset => <button key={preset.id} type="button" className="button secondary"
            onClick={() => setSelection(previous => applySurtrComparisonPreset(previous, preset.selection, choices))}>{preset.name}</button>)}
        </div></fieldset>
        <SurtrModuleStageSelection choices={choices} excluded={selection.excluded} moduleLevels={selection.moduleLevels} onToggleLevel={toggleLevel}
          onToggleNone={checked => setSelection(previous => ({ ...previous, excluded: checked ? previous.excluded.filter(id => id !== '') : [...previous.excluded.filter(id => id !== ''), ''] }))} />
        <div className="gg3-fields">
          <label className="calculator-field"><span>比較基準</span><select value={baseline.kind} aria-label="比較基準" onChange={event => setBaseline({ kind: event.target.value as GgTableBaseline['kind'], id: baseline.id ?? 'none' })}>
            <option value="unequipped">未装備</option><option value="previous">1つ前の段階</option><option value="selected">指定MOD</option></select></label>
          {baseline.kind === 'selected' && <label className="calculator-field"><span>基準の装備</span><select aria-label="基準の装備" value={baseline.id ?? 'none'} onChange={event => setBaseline({ kind: 'selected', id: event.target.value })}>
            {descriptors.map(build => <option key={build.id} value={build.id}>{build.label}</option>)}</select></label>}
          <Field label="切り替え時間（秒）" value={delay} onChange={setDelay} min={0} max={5} step="0.1" />
          {skill.skillIndex === 2 && <Field label="発動後の計測時間（秒）" value={duration} onChange={setDuration} min={0.1} max={300} step="0.1" />}
        </div>
        <div className="gg3-axis-fields">
          <fieldset><legend>敵HP</legend><label className="calculator-field"><span>プリセット</span><select aria-label="敵HPのプリセット" value={hpMode} onChange={event => setHpMode(event.target.value)}>
            <option value="rank">E〜A（6点）</option><option value="range">範囲・刻みを指定</option><option value="list">値を指定</option></select></label>
            {hpMode === 'rank' ? <span className="gg3-samples">{GOLDENGLOW_HP_RANK_PRESET.map(format).join(' / ')}</span>
              : hpMode === 'list' ? <label className="calculator-field"><span>比較するHP</span><input aria-label="比較するHP" value={hpList} onChange={event => setHpList(event.target.value)} /></label>
              : <div className="gg3-bounds">{(['min', 'max', 'step'] as const).map(bound => <Field key={bound} label={bound === 'min' ? '開始HP' : bound === 'max' ? '終了HP' : 'HPの刻み'} value={hpRange[bound]}
                onChange={value => setHpRange(previous => ({ ...previous, [bound]: value }))} min={bound === 'min' ? 0 : 1} max={limits.maxEnemyHp} step="1" />)}</div>}
          </fieldset>
          <fieldset><legend>術耐性</legend><SurtrResistanceStepControl step={resStep} custom={customResStep} draft={resStepDraft}
            onChange={setResStep} onCustomChange={setCustomResStep} onDraftChange={setResStepDraft} ariaLabel="術耐性の刻み" errorId="gg3-resistance-step-error" defaultStep={10} />
            <div className="gg3-bounds">{(['min', 'max'] as const).map(bound => <Field key={bound} label={bound === 'min' ? '開始術耐性' : '終了術耐性'} value={resRange[bound]}
              onChange={value => setResRange(previous => ({ ...previous, [bound]: value }))} min={0} max={100} step="1" />)}</div>
          </fieldset>
        </div>
        <details className="gg3-help"><summary>計算設定・条件</summary><div className="gg3-fields">
          <label className="calculator-field"><span>試行回数 / 点・装備</span><select aria-label="試行回数 / 点・装備" value={trials} onChange={event => setTrials(Number(event.target.value))}>
            {[1000, 5000, 10000, 20000].map(count => <option key={count} value={count}>{format(count)}回</option>)}</select></label>
          <Field label="抽選番号" value={seed} onChange={setSeed} min={0} max={limits.maxSeed} step="1" />
        </div><p>昇進2・最大レベル・信頼100・潜在1。対象を倒すたびに同じHP・術耐性の次の敵へ切り替えるモデルです。総ダメージは術耐性を反映し、オーバーキルを含みます。</p>
          <p>ターゲット切替2と同じ暫定モデルです。切り替えは各ユニットの残りCTと重なります。「1つ前の段階」はLv.1を未装備、Lv.2をLv.1、Lv.3をLv.2と比較します。表示していない基準も計算します。</p>
          <p>HP・術耐性・装備の各組み合わせで指定回数を試行します。装備・条件間で共通の抽選番号を使います。</p></details>
      </fieldset>}
      {!!prepared.error && <p className="gg3-error" role="alert">{prepared.error}</p>}
    </CollapsibleCalculatorPanel>
    <CollapsibleCalculatorPanel id="gg3-display" number="02" title="表の表示設定" collapsedLabel="表示設定を表示"
      summary={`${layout === 'total' ? '総ダメージのみ' : layout === 'combined' ? '総ダメージ＋比較値' : '比較値のみ'}・小数${precision}桁`}>
      <div className="gg3-display-controls">
        <label className="calculator-field"><span>表の形式</span><select aria-label="表の形式" value={layout} onChange={event => setLayout(event.target.value as GgTableLayout)}>
          <option value="total">総ダメージのみ</option><option value="comparison">比較値のみ</option><option value="combined">総ダメージ＋比較値</option></select></label>
        <label className="calculator-field"><span>比較値</span><select aria-label="比較値" value={metric} disabled={layout === 'total'} onChange={event => setMetric(event.target.value as GgTableMetric)}>
          <option value="difference">総ダメージ差</option><option value="ratio">基準比（基準＝100%）</option><option value="percent">増加率（%）</option></select></label>
        <label className="calculator-field"><span>小数点以下</span><select aria-label="小数点以下" value={precision} onChange={event => setPrecision(Number(event.target.value))}>
          {[0, 1, 2, 3].map(value => <option key={value} value={value}>{value}桁</option>)}</select></label>
        <div className="gg3-color-control"><label className="calculator-field"><span>カラースケール</span><select aria-label="カラースケール" value={colorScale} onChange={event => setColorScale(event.target.value as GgTableColorScale)}>
          <option value="NONE">なし</option><option value="LINEAR">値に比例</option><option value="SQRT">中程度を見やすく</option></select></label>
          <HelpPopover label="カラースケールの説明">比較値を基準より高ければ青、低ければ茶色で表示します。「中程度を見やすく」は、最大差に対する比率の平方根で濃淡を付けます。</HelpPopover></div>
        <label className="gg3-rank-control"><input type="checkbox" checked={showRanks} onChange={event => setShowRanks(event.target.checked)} />ランク表記</label>
      </div>
    </CollapsibleCalculatorPanel>
    <CollapsibleCalculatorPanel id="gg3-result" number="03" title="比較結果" collapsedLabel="比較結果を表示"
      summary={snapshot ? calculation.request?.skillLabel ?? '' : '術耐性 × 敵HP × MOD'}>
      <div className="gg3-calculation-status" role="status">
        {running ? <><progress max={calculation.totalPoints} value={calculation.completedPoints} />計算中 {calculation.completedPoints} / {calculation.totalPoints}点</>
          : stale ? '条件変更あり・再計算で更新' : calculation.status === 'complete' ? `${calculation.completedPoints}点・計算完了`
            : calculation.status === 'cancelled' ? `中止・${calculation.completedPoints} / ${calculation.totalPoints}点` : !snapshot ? `${workload}点・総試行 ${format(workload * trials)}回` : ''}
        {!!calculation.error && <span className="gg3-error" role="alert">{calculation.error}</span>}
      </div>
      {!skill ? status : !snapshot ? <p className="gg3-empty" role="status">比較条件を確認して「計算する」を押してください。</p>
        : <GoldenglowTargetSwitchTable data={data} conditions={snapshot.conditions} disabled={calculation.status !== 'complete'} />}
    </CollapsibleCalculatorPanel>
  </section>
}

function numericError(value: string, min: number, max: number, label: string, integer = false) {
  const number = Number(value)
  return !value.trim() || !Number.isFinite(number) || number < min || number > max || (integer && !Number.isSafeInteger(number))
    ? `${label}は${format(min)}〜${format(max)}${integer ? 'の整数' : ''}で入力してください。` : null
}

function Field({ label, value, onChange, min, max, step }: { label: string; value: string; onChange: (value: string) => void; min: number; max: number; step: string }) {
  return <label className="calculator-field"><span>{label}</span><input aria-label={label} type="number" value={value} min={min} max={max} step={step} onChange={event => onChange(event.target.value)} /></label>
}
