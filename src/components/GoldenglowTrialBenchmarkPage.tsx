import { useMemo, useRef, useState } from 'react'
import { GOLDENGLOW_OPERATOR_ID } from '../lib/goldenglowExplosion'
import { deriveGoldenglowGuideSkills } from '../lib/goldenglowGuideSkill'
import { GOLDENGLOW_TARGET_SWITCH_BENCHMARK_MAX_TRIALS, GOLDENGLOW_TARGET_SWITCH_LIMITS as limits } from '../lib/goldenglowTargetSwitch'
import { createGoldenglowTargetSwitchHpValues } from '../lib/goldenglowTargetSwitchHp'
import type { HpComparisonInput } from '../lib/goldenglowTargetSwitchHpComparison'
import { GOLDENGLOW_TRIAL_BENCHMARK_PRESETS, isGoldenglowTrialBenchmarkCount, summarizeGoldenglowTrialBenchmark } from '../lib/goldenglowTrialBenchmark'
import { useGoldenglowTrialBenchmark } from '../lib/useGoldenglowTrialBenchmark'
import { getOperatorModuleId, getOperatorModuleLevels, getOperatorModules, isOperatorModuleUnlocked } from '../lib/operatorModules'
import type { SkillRecord } from '../types/skill'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { GoldenglowAnalysisHeader } from './GoldenglowAnalysisHeader'
import { GoldenglowSkillControls } from './GoldenglowSkillControls'
import { GoldenglowTrialBenchmarkChart } from './GoldenglowTrialBenchmarkChart'
import { HelpPopover } from './HelpPopover'
import './DamageCalculator.css'
import './GoldenglowGuidePage.css'
import './GoldenglowTrialBenchmarkPage.css'

const format = (value: number) => new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 }).format(value)
const seconds = (ms: number) => `${format(ms / 1000)}秒`
const trialLabel = (value: number) => `${format(value)}回`
const initialTrials = [...GOLDENGLOW_TRIAL_BENCHMARK_PRESETS]

export function GoldenglowTrialBenchmarkPage({ rows, loading, error, onRetry }: {
  rows: readonly SkillRecord[]; loading: boolean; error: string | null; onRetry: () => void
}) {
  const [skillIndex, setSkillIndex] = useState(3)
  const [skillLevelIndex, setSkillLevelIndex] = useState<number>()
  const [moduleSelection, setModuleSelection] = useState<Record<string, boolean>>({})
  const [moduleLevels, setModuleLevels] = useState<Record<string, number>>({})
  const [startHp, setStartHp] = useState('1000')
  const [endHp, setEndHp] = useState('30000')
  const [stepHp, setStepHp] = useState('1000')
  const [resistance, setResistance] = useState('0')
  const [delay, setDelay] = useState('0.1')
  const [duration, setDuration] = useState('30')
  const [trialCounts, setTrialCounts] = useState<number[]>(initialTrials)
  const [repeats, setRepeats] = useState(3)
  const [thresholdSeconds, setThresholdSeconds] = useState(30)
  const [selectedTrials, setSelectedTrials] = useState<number | null>(null)
  const benchmark = useGoldenglowTrialBenchmark()
  const running = benchmark.status === 'running'

  const profile = rows.find((row) => row.operatorId === GOLDENGLOW_OPERATOR_ID)?.operatorProfile
  const choices = useMemo(() => [
    { id: 'none', moduleId: '', moduleType: null, label: '未装備', name: '', levels: [] as number[], unlocked: true },
    ...(profile ? getOperatorModules(profile).map((module, index) => ({
      id: getOperatorModuleId(module, index), moduleId: getOperatorModuleId(module, index), moduleType: module.typeName2,
      label: ['MOD', module.typeName2?.trim()].filter(Boolean).join(' '), name: module.uniEquipName,
      levels: getOperatorModuleLevels(module), unlocked: isOperatorModuleUnlocked(module, 2, profile.phases[2]?.maxLevel ?? 1),
    })) : []),
  ], [profile])
  const skills = useMemo(() => deriveGoldenglowGuideSkills(rows, '', 3, skillLevelIndex), [rows, skillLevelIndex])
  const skill = skills.find((item) => item.skillIndex === skillIndex) ?? skills[0]
  const selectedChoices = choices.filter((choice) => choice.unlocked && (choice.id === 'none' || choice.levels.length > 0) && (moduleSelection[choice.id] ?? true))
  const builds = selectedChoices.map((choice) => {
    const level = moduleLevels[choice.id] ?? choice.levels.at(-1) ?? 3
    const derived = deriveGoldenglowGuideSkills(rows, choice.moduleId, level, skillLevelIndex).find((item) => item.skillIndex === skill?.skillIndex)
    const valid = derived && derived.moduleId === choice.moduleId
      && (!choice.moduleId || (choice.levels.includes(level) && derived.moduleApplication.moduleLevel === level))
    return { id: choice.id, label: choice.id === 'none' ? choice.label : `${choice.label} Lv.${level}`, moduleType: choice.moduleType, skill: valid ? derived : null }
  })
  const hpRange = useMemo(() => {
    try { return { values: createGoldenglowTargetSwitchHpValues(Number(startHp), Number(endHp), Number(stepHp)), error: null } }
    catch (cause) { return { values: [], error: cause instanceof Error ? cause.message : 'HPの範囲を確認してください。' } }
  }, [startHp, endHp, stepHp])
  const resistanceError = numericError(resistance, 0, limits.maxEnemyResistance, '術耐性')
  const delayError = numericError(delay, 0, limits.maxSwitchDelay, '切り替え時間')
  const durationError = skill?.skillIndex === 2 ? numericError(duration, 0.1, limits.maxDuration, '計測時間') : null
  const fieldError = hpRange.error ?? resistanceError ?? delayError ?? durationError
    ?? (!builds.length ? '装備を1つ以上選んでください。' : builds.some((build) => !build.skill) ? '選択した装備の情報を取得できませんでした。' : null)
  const input: HpComparisonInput | null = skill && !fieldError ? { builds: builds.map((build) => ({
    id: build.id, label: build.label, moduleType: build.moduleType, potential: 1, input: {
      model: build.skill!.explosionModel, skillIndex: build.skill!.skillIndex,
      effectiveAttack: build.skill!.effectiveAttack, attackInterval: build.skill!.attackInterval,
      duration: build.skill!.duration ?? Number(duration), enemyDefense: 0,
      enemyResistance: Number(resistance), enemyHps: hpRange.values,
      switchDelay: Number(delay), retargetRemainingDrones: true, trials: 10000, seed: 20260908,
    },
  })) } : null
  const key = input ? JSON.stringify({ input, trialCounts, repeats }) : null
  const request = benchmark.request
  const stale = !!request && request.key !== key
  const skillLabel = skill ? `S${skill.skillIndex} ${skill.skillLevelLabel}` : ''
  const conditionLabel = `${skillLabel}・HP ${hpRange.values.length}点・${builds.length}装備`
  const shownRows = request ? benchmark.rows : trialCounts.map((trials) => ({ trials,
    totalTrials: input ? input.builds.reduce((sum, build) => sum + trials * build.input.enemyHps.length, 0) : 0,
    timesMs: [], status: 'pending' as const, error: undefined }))
  const measured = shownRows.map((row) => ({ ...row, stats: row.timesMs.length ? summarizeGoldenglowTrialBenchmark(row.timesMs) : null }))
  const chartPoints = measured.flatMap((row) => row.status === 'complete' && row.stats ? [{ trials: row.trials, ...row.stats }] : [])
  const active = shownRows.find((row) => row.status === 'running')
  const plannedRepeats = request?.repeats ?? repeats
  const completedMeasurements = shownRows.reduce((sum, row) => sum + row.timesMs.length, 0)
  const progress = running && active ? `計測中 ${trialLabel(active.trials)}・${benchmark.activeRepeat} / ${plannedRepeats}回`
    : request && !stale ? `${completedMeasurements} / ${shownRows.length * plannedRepeats}回の時間測定`
      : `${trialCounts.length}種類・全${trialCounts.length * repeats}回の時間測定`
  const resultStatus = running ? '計測中' : stale ? '条件変更あり' : benchmark.status === 'idle' ? '未計測'
    : benchmark.status === 'cancelled' ? '中止' : benchmark.status === 'error' ? '計測中断'
      : shownRows.some((row) => row.status === 'limit') ? '上限超過あり' : '計測完了'
  const run = () => {
    if (!input || !key || running) return
    setSelectedTrials(null)
    benchmark.start({ input, key, repeats, trialCounts, label: `${skillLabel}・${builds.map((build) => build.label).join(' / ')}・HP ${format(hpRange.values[0])}〜${format(hpRange.values.at(-1)!)}（${format(Number(stepHp))}刻み）・術耐性 ${resistance}・切り替え ${delay}秒・計測対象 ${format(input.builds[0].input.duration)}秒` })
  }

  return <section className="calculator-page gg-reference-page ggb-page" aria-labelledby="ggb-title">
    <GoldenglowAnalysisHeader id="ggb-title" title="試行回数の調査" />
    {loading ? <p className="calculator-loading" role="status">スキル情報を読み込み中…</p> : !skill ? <div className="error-box" role="alert"><p>{error ?? 'ゴールデングローの情報を取得できませんでした。'}</p><button type="button" className="button secondary" onClick={onRetry}>再読み込み</button></div> : <>
      <CollapsibleCalculatorPanel id="ggb-conditions" number="01" title="計測条件" summary={conditionLabel} collapsedLabel="条件を表示" defaultOpen={false}>
        <fieldset className="ggb-fields" disabled={running} aria-label="計測条件">
          <div className="damage-build-navigation gg-skill-navigation gg-normal-navigation">
            <GoldenglowSkillControls skill={skill} skills={skills} compact={false} onShowEffect={() => {}} onSkillChange={setSkillIndex} onSkillLevelChange={setSkillLevelIndex} />
          </div>
          <fieldset className="ggb-module-choices"><legend>比較する装備</legend>
            {choices.map((choice) => {
              const available = choice.unlocked && (choice.id === 'none' || choice.levels.length > 0)
              const checked = available && (moduleSelection[choice.id] ?? true)
              return <div key={choice.id} className={`ggb-module-choice${checked ? ' active' : ''}`}>
                <label><input type="checkbox" aria-label={`${choice.label}を比較`} checked={checked} disabled={!available || (checked && selectedChoices.length === 1)}
                  onChange={(event) => setModuleSelection((previous) => ({ ...previous, [choice.id]: event.target.checked }))} /><span>{choice.label}</span></label>
                {choice.id !== 'none' && <select aria-label={`${choice.label}のレベル`} value={moduleLevels[choice.id] ?? choice.levels.at(-1) ?? ''} disabled={!checked}
                  onChange={(event) => setModuleLevels((previous) => ({ ...previous, [choice.id]: Number(event.target.value) }))}>
                  {choice.levels.map((level) => <option key={level} value={level}>Lv.{level}</option>)}
                </select>}
              </div>
            })}
          </fieldset>
          <div className="ggb-condition-fields">
            <NumberField label="開始HP" value={startHp} onChange={setStartHp} min={1} max={limits.maxEnemyHp} step="1" invalid={!!hpRange.error} />
            <NumberField label="終了HP" value={endHp} onChange={setEndHp} min={1} max={limits.maxEnemyHp} step="1" invalid={!!hpRange.error} />
            <NumberField label="HPの刻み" value={stepHp} onChange={setStepHp} min={1} max={limits.maxEnemyHp} step="1" invalid={!!hpRange.error} />
            <NumberField label="術耐性" value={resistance} onChange={setResistance} min={0} max={limits.maxEnemyResistance} invalid={!!resistanceError} />
            <NumberField label="切り替え時間（秒）" value={delay} onChange={setDelay} min={0} max={limits.maxSwitchDelay} step="0.1" invalid={!!delayError} />
            {skill.skillIndex === 2 && <NumberField label="発動後の計測時間（秒）" value={duration} onChange={setDuration} min={0.1} max={limits.maxDuration} invalid={!!durationError} />}
          </div>
        </fieldset>
      </CollapsibleCalculatorPanel>

      {fieldError && <p className="ggb-error" role="alert">{fieldError}</p>}
      <CollapsibleCalculatorPanel id="ggb-run" number="02" title="計測" summary="" collapsedLabel="計測設定を表示" className="ggb-run-panel"
        headerActions={<button type="button" className={`button${running ? ' secondary' : ''}`} disabled={!running && !input} onClick={running ? benchmark.cancel : run}>{running ? '中止' : '計測する'}</button>} headerActionsWhenCollapsed>
        <fieldset className="ggb-fields" disabled={running} aria-label="計測設定">
          <TrialCountInput counts={trialCounts} onChange={setTrialCounts} disabled={running} />
          <label className="calculator-field ggb-repeat"><span>時間測定の繰り返し</span><select value={repeats} onChange={(event) => setRepeats(Number(event.target.value))}>
            {[1, 3, 5].map((value) => <option key={value} value={value}>各{value}回</option>)}
          </select></label>
        </fieldset>
        <div className="ggb-run-footer"><label className="calculator-field"><span>目安時間（中央値）</span><select value={thresholdSeconds} onChange={(event) => setThresholdSeconds(Number(event.target.value))}>
          {[5, 10, 30, 60].map((value) => <option key={value} value={value}>{value}秒</option>)}
        </select></label><span className="ggb-progress" role="status" aria-live="polite">{progress}</span></div>
        <details className="ggb-help ggb-input-help"><summary>入力範囲・計測の単位</summary>
          <p>試行回数は1〜{format(GOLDENGLOW_TARGET_SWITCH_BENCHMARK_MAX_TRIALS)}の整数で追加できます。登録した回数を小さい順に計測します。</p>
          <p>全HP・全装備の計算を1セットとして時間を測ります。「各3回」なら、それぞれの試行回数で同じ計算を3セット繰り返します。</p>
        </details>
      </CollapsibleCalculatorPanel>

      <CollapsibleCalculatorPanel id="ggb-results" number="03" title="計測結果" summary={resultStatus} collapsedLabel="結果を表示">
        <GoldenglowTrialBenchmarkChart points={chartPoints} trialCounts={request?.trialCounts ?? trialCounts} thresholdSeconds={thresholdSeconds} selectedTrials={selectedTrials} onSelectTrials={setSelectedTrials} />
        <div className={`ggb-table-scroll${stale ? ' ggb-stale' : ''}`}>
          <table className="analysis-table ggb-table"><caption className="visually-hidden">試行回数ごとの計測結果{request ? `・${request.label}` : ''}</caption>
            <thead><tr><th scope="col">試行回数<span>/ 点・装備</span></th><th scope="col">総試行回数<span>/ 1計測</span></th><th scope="col">中央値</th><th scope="col">最短〜最長</th><th scope="col">判定</th></tr></thead>
            <tbody>{measured.map((row) => <tr key={row.trials} className={row.trials === selectedTrials ? 'ggb-selected' : undefined}>
              <th scope="row"><button type="button" className="ggb-select-row" aria-pressed={row.trials === selectedTrials} disabled={row.status !== 'complete'} onClick={() => setSelectedTrials(row.trials)}>{trialLabel(row.trials)}</button></th>
              <td>{row.totalTrials ? trialLabel(row.totalTrials) : '—'}</td>
              <td>{row.stats ? seconds(row.stats.medianMs) : '—'}</td><td>{row.stats ? `${format(row.stats.minMs / 1000)}〜${format(row.stats.maxMs / 1000)}秒` : '—'}</td>
              <td>{row.error ? <HelpPopover label={row.error} triggerText={row.status === 'limit' ? '上限超過' : row.status === 'timeout' ? '時間切れ' : '計測失敗'}>{row.error}</HelpPopover>
                : row.status === 'complete' ? row.stats!.medianMs <= thresholdSeconds * 1000 ? '目安以内' : '目安超過'
                  : row.status === 'running' ? `計測中 ${row.timesMs.length} / ${plannedRepeats}回`
                    : row.status === 'cancelled' ? `中止 ${row.timesMs.length} / ${plannedRepeats}回` : request ? '待機' : '未計測'}</td>
            </tr>)}</tbody>
          </table>
        </div>
        {stale && <p className="ggb-progress" role="status">条件変更あり・再計測で更新</p>}
        <details className="ggb-help"><summary>計測について</summary>
          {request && <p><strong>結果の条件：</strong>{request.label}・各{request.repeats}回</p>}
          <p>計算時間は、全装備・全HPのシミュレーションを実行した時間です。計算の準備を含み、Workerの起動・画面描画は含みません。計測ごとにWorkerを作り直し、抽選番号20260908で同じ条件を繰り返します。別のアプリの処理などで時間は変動します。</p>
          <p>総試行回数は1計測分です。中央値が目安時間以内なら「目安以内」と表示します。目安時間は停止時間ではありません。中止した条件は完了した回数まで集計し、グラフには全回完了した条件だけを表示します。</p>
          <p>このページでは最大10万回まで調べられます。通常ページの上限は2万回です。計算量・メモリの上限を超える条件は実行せず、1計測が5分を超えた場合は中断します。「目安以内」はこの計測条件での結果です。</p>
        </details>
      </CollapsibleCalculatorPanel>
    </>}
  </section>
}

function TrialCountInput({ counts, onChange, disabled }: {
  counts: readonly number[]; onChange: (counts: number[]) => void; disabled: boolean
}) {
  const [draft, setDraft] = useState('30000')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const add = () => {
    if (disabled) return
    const count = Number(draft)
    if (draft.trim() === '' || !isGoldenglowTrialBenchmarkCount(count)) {
      setError(`1〜${format(GOLDENGLOW_TARGET_SWITCH_BENCHMARK_MAX_TRIALS)}の整数で入力してください。`)
      return
    }
    if (counts.includes(count)) {
      setError('この試行回数は追加済みです。')
      return
    }
    onChange([...counts, count].sort((left, right) => left - right))
    setDraft('')
    setError(null)
    inputRef.current?.focus()
  }
  const remove = (count: number) => {
    if (disabled || counts.length <= 1) return
    onChange(counts.filter((value) => value !== count))
    setError(null)
    inputRef.current?.focus()
  }
  return <div className="ggb-trial-choices">
    <label className="ggb-count-label" htmlFor="ggb-trial-count">各HP・各装備の試行回数</label>
    <div className="ggb-count-entry">
      <div className="ggb-count-value calculator-field"><input ref={inputRef} id="ggb-trial-count" type="number" inputMode="numeric"
        min={1} max={GOLDENGLOW_TARGET_SWITCH_BENCHMARK_MAX_TRIALS} step={1} value={draft} disabled={disabled}
        aria-invalid={!!error} aria-describedby={error ? 'ggb-trial-count-error' : undefined}
        onChange={(event) => { setDraft(event.target.value); setError(null) }}
        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add() } }} /><span>回</span></div>
      <button type="button" className="button secondary" disabled={disabled} onClick={add}>追加</button>
    </div>
    <ul className="ggb-count-list" aria-label="比較する試行回数">
      {counts.map((count) => <li key={count}><span>{trialLabel(count)}</span>
        <button type="button" aria-label={`${trialLabel(count)}を削除`} disabled={disabled || counts.length === 1} onClick={() => remove(count)}>×</button>
      </li>)}
    </ul>
    {error && <p id="ggb-trial-count-error" className="ggb-error" role="alert">{error}</p>}
  </div>
}

function NumberField({ label, value, onChange, min, max, step = 'any', invalid }: {
  label: string; value: string; onChange: (value: string) => void; min: number; max: number; step?: string; invalid: boolean
}) {
  return <label className="calculator-field"><span>{label}</span><input type="number" inputMode={step === '1' ? 'numeric' : 'decimal'}
    value={value} onChange={(event) => onChange(event.target.value)} min={min} max={max} step={step} aria-invalid={invalid} /></label>
}
function numericError(value: string, min: number, max: number, label: string): string | null {
  const number = Number(value)
  return value.trim() === '' || !Number.isFinite(number) || number < min || number > max ? `${label}は${format(min)}〜${format(max)}で入力してください。` : null
}
