import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { loadEnemyRecords } from '../lib/enemyData'
import { getEnemyCombatInputValues, hasEnemyCombatInputChanges } from '../lib/enemySelection'
import { GOLDENGLOW_OPERATOR_ID } from '../lib/goldenglowExplosion'
import { deriveGoldenglowGuideSkills, type GoldenglowGuideSkill } from '../lib/goldenglowGuideSkill'
import { getOperatorModuleId, getOperatorModuleLevels, getOperatorModules, isOperatorModuleUnlocked } from '../lib/operatorModules'
import { GOLDENGLOW_TARGET_SWITCH_LIMITS as LIMITS, simulateGoldenglowTargetSwitchTrial, type GoldenglowTargetSwitchInput, type GoldenglowTargetSwitchTrial } from '../lib/goldenglowTargetSwitch'
import { buildGoldenglowTargetSwitchHistoryRows, type GoldenglowTargetSwitchHistoryEvent } from '../lib/goldenglowTargetSwitchHistory'
import type { SkillRecord } from '../types/skill'
import type { EnemyRecord } from '../types/enemy'
import { GoldenglowAnalysisHeader } from './GoldenglowAnalysisHeader'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { GoldenglowBuildControls } from './GoldenglowBuildControls'
import { GoldenglowDetailModal } from './GoldenglowDetailModal'
import { GoldenglowEnemyPicker } from './GoldenglowEnemyPicker'
import { GoldenglowModuleEffect } from './GoldenglowModuleEffect'
import { GoldenglowOperatorInfo } from './GoldenglowOperatorInfo'
import { GoldenglowSingleTrialSummary } from './GoldenglowSingleTrialSummary'
import { GoldenglowTargetSwitchDetailModal, type GoldenglowTargetSwitchDetail } from './GoldenglowTargetSwitchDetailModal'
import { GoldenglowTargetSwitchHistoryTable } from './GoldenglowTargetSwitchTrialPanel'
import './DamageCalculator.css'
import './GoldenglowGuidePage.css'
import './GoldenglowTargetSwitchPage.css'
import './GoldenglowSingleTrialPage.css'

const HISTORY_BATCH_SIZE = 8
const format = (value: number) => new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 }).format(value)
type CompletedTrial = {
  input: GoldenglowTargetSwitchInput
  skill: GoldenglowGuideSkill
  signature: string
  trial: GoldenglowTargetSwitchTrial
  enemyLabel: string | null
}

export function GoldenglowSingleTrialPage({ rows, loading, error, onRetry, footerContainer }: {
  rows: readonly SkillRecord[]
  loading: boolean
  error: string | null
  onRetry: () => void
  footerContainer: HTMLElement | null
}) {
  const [skillIndex, setSkillIndex] = useState(3)
  const [skillLevelIndex, setSkillLevelIndex] = useState<number | undefined>(undefined)
  const [moduleId, setModuleId] = useState('')
  const [moduleLevel, setModuleLevel] = useState(3)
  const [hp, setHp] = useState('200')
  const [resistance, setResistance] = useState('0')
  const [switchDelay, setSwitchDelay] = useState('0.1')
  const [viewingDuration, setViewingDuration] = useState('30')
  const [seed, setSeed] = useState('20260908')
  const [fixedSeed, setFixedSeed] = useState(false)
  const [showDecimals, setShowDecimals] = useState(false)
  const [completed, setCompleted] = useState<CompletedTrial | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const [visibleRowLimit, setVisibleRowLimit] = useState(HISTORY_BATCH_SIZE)
  const [detail, setDetail] = useState<GoldenglowTargetSwitchDetail | null>(null)
  const [effectDetail, setEffectDetail] = useState<'skill' | 'module' | null>(null)
  const [enemyPickerOpen, setEnemyPickerOpen] = useState(false)
  const [selectedEnemy, setSelectedEnemy] = useState<EnemyRecord | null>(null)
  const [enemyCatalog, setEnemyCatalog] = useState<{ rows: EnemyRecord[] | null; error: string | null }>({ rows: null, error: null })
  const [enemyRetry, setEnemyRetry] = useState(0)
  const historyHeading = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!enemyPickerOpen || enemyCatalog.rows !== null) return
    let active = true
    setEnemyCatalog({ rows: null, error: null })
    void loadEnemyRecords().then((records) => {
      if (active) setEnemyCatalog({ rows: records, error: null })
    }).catch((cause: unknown) => {
      if (active) setEnemyCatalog({ rows: null, error: cause instanceof Error ? cause.message : '敵データを取得できませんでした。' })
    })
    return () => { active = false }
  }, [enemyPickerOpen, enemyCatalog.rows, enemyRetry])
  const enemyAdjusted = selectedEnemy ? hasEnemyCombatInputChanges(selectedEnemy, { hp, resistance }) : false
  const enemyLabel = selectedEnemy ? `${selectedEnemy.name}${enemyAdjusted ? '（調整済み）' : ''}` : null
  const operatorProfile = rows.find((row) => row.operatorId === GOLDENGLOW_OPERATOR_ID)?.operatorProfile
  const moduleChoices = useMemo(() => operatorProfile ? getOperatorModules(operatorProfile).map((module, index) => ({
    module, id: getOperatorModuleId(module, index), label: ['MOD', module.typeName2?.trim()].filter(Boolean).join(' '),
    levels: getOperatorModuleLevels(module),
    unlocked: isOperatorModuleUnlocked(module, 2, operatorProfile.phases[2]?.maxLevel ?? 1),
  })) : [], [operatorProfile])
  const skills = useMemo(() => deriveGoldenglowGuideSkills(rows, moduleId, moduleLevel, skillLevelIndex), [rows, moduleId, moduleLevel, skillLevelIndex])
  const skill = skills.find((item) => item.skillIndex === skillIndex) ?? skills[0] ?? null
  const errors = {
    hp: numericError(hp, 1, LIMITS.maxEnemyHp, '敵HP'),
    resistance: numericError(resistance, 0, LIMITS.maxEnemyResistance, '術耐性'),
    switchDelay: numericError(switchDelay, 0, LIMITS.maxSwitchDelay, '切り替え時間'),
    duration: skill?.duration === null ? numericError(viewingDuration, 0.1, LIMITS.maxDuration, '計測時間') : null,
    seed: fixedSeed ? numericError(seed, 0, LIMITS.maxSeed, '抽選番号') ?? (Number.isInteger(Number(seed)) ? null : '抽選番号は整数で入力してください。') : null,
  }
  const fieldError = Object.values(errors).find(Boolean) ?? null
  const input = useMemo<GoldenglowTargetSwitchInput | null>(() => skill && !fieldError ? {
    model: skill.explosionModel, skillIndex: skill.skillIndex,
    effectiveAttack: skill.effectiveAttack, attackInterval: skill.attackInterval,
    duration: skill.duration ?? Number(viewingDuration),
    enemyHp: Number(hp), enemyDefense: 0, enemyResistance: Number(resistance),
    switchDelay: Number(switchDelay), retargetRemainingDrones: true, trials: 1, seed: fixedSeed ? Number(seed) : 0,
  } : null, [skill, fieldError, viewingDuration, hp, resistance, switchDelay, seed, fixedSeed])
  // Compare build conditions separately from the seed, which changes automatically per run.
  const signature = input && skill ? JSON.stringify([{ ...input, seed: 0 }, skill.skillLevelIndex, skill.moduleId, skill.moduleApplication.moduleLevel, selectedEnemy?.id ?? null]) : null
  const stale = completed !== null && (completed.signature !== signature || fixedSeed && completed.input.seed !== Number(seed))
  const history = useMemo(() => completed ? buildGoldenglowTargetSwitchHistoryRows(completed.trial) : [], [completed])
  const visibleRowCount = Math.min(visibleRowLimit, history.length)
  const remainingRowCount = history.length - visibleRowCount

  function run(event: FormEvent) {
    event.preventDefault()
    if (!input || !skill || !signature) return
    setRunError(null)
    try {
      let runSeed = input.seed
      if (!fixedSeed) {
        runSeed = crypto.getRandomValues(new Uint32Array(1))[0]
        if (runSeed === completed?.input.seed) runSeed = (runSeed + 1) >>> 0
      }
      const runInput = { ...input, seed: runSeed }
      const trial = simulateGoldenglowTargetSwitchTrial(runInput)
      setCompleted({ input: runInput, skill, signature, trial, enemyLabel })
      setSeed(String(runSeed))
      setVisibleRowLimit(HISTORY_BATCH_SIZE)
      setDetail(null)
    } catch (cause) {
      setRunError(cause instanceof Error ? cause.message : '計算を完了できませんでした。')
    }
  }
  function openEvent(event: GoldenglowTargetSwitchHistoryEvent) {
    if (!completed) return
    setDetail(event.kind === 'attack'
      ? { kind: 'attack', entry: event.entry, seed: completed.input.seed }
      : { kind: 'delay', entry: event, seed: completed.input.seed })
  }
  function collapseHistory() {
    setVisibleRowLimit(HISTORY_BATCH_SIZE)
    historyHeading.current?.focus({ preventScroll: true })
    historyHeading.current?.scrollIntoView({ block: 'start', inline: 'nearest' })
  }
  function selectEnemy(enemy: EnemyRecord) {
    const values = getEnemyCombatInputValues(enemy)
    setSelectedEnemy(enemy)
    setHp(values.hp)
    setResistance(values.resistance)
    setEnemyPickerOpen(false)
  }

  return <section className="calculator-page gg-single-page" aria-labelledby="gg-single-title">
    <GoldenglowAnalysisHeader id="gg-single-title" title="単発シミュレーション" />
    {loading ? <p className="calculator-loading" role="status">スキル情報を読み込み中…</p> : !skill ? (
      <div className="error-box" role="alert"><p>{error ?? 'ゴールデングローのスキル情報を取得できませんでした。'}</p><button className="button secondary" type="button" onClick={onRetry}>再読み込み</button></div>
    ) : <>
      <GoldenglowOperatorInfo skill={skill} loading={loading} defaultOpen={false} />
      <CollapsibleCalculatorPanel id="gg-single-settings" number="02" title="共通設定"
        summary={`S${skill.skillIndex} ${skill.skillLevelLabel}・${format(skill.duration ?? Number(viewingDuration))}秒・HP ${hp || '—'}・術耐性 ${resistance || '—'}`}
        collapsedLabel="設定を表示" bodyClassName="gg-single-settings-body">
      <div className="damage-build-navigation gg-skill-navigation gg-single-build">
        <GoldenglowBuildControls skill={skill} skills={skills} moduleChoices={moduleChoices} compact={false}
          onShowEffect={setEffectDetail}
          onSkillChange={(index) => { setSkillIndex(index); setEffectDetail(null) }}
          onSkillLevelChange={(index) => { setSkillLevelIndex(index); setEffectDetail(null) }}
          onModuleChange={(id, level) => { setModuleId(id); setModuleLevel(level); setEffectDetail(null) }} />
      </div>
      <form className="gg-single-conditions" aria-label="シミュレーション条件" onSubmit={run} noValidate>
        <div className="gg-single-enemy-selection">
          <button type="button" className="button secondary" aria-haspopup="dialog" onClick={() => setEnemyPickerOpen(true)}>敵を選ぶ</button>
          {selectedEnemy && <span role="status">{selectedEnemy.name}{selectedEnemy.index && <span className="gg-single-enemy-index">{selectedEnemy.index}</span>}{enemyAdjusted && <span className="gg-single-enemy-adjusted">調整済み</span>}</span>}
        </div>
        <div className="gg-single-inputs">
          <NumericField label="敵HP" value={hp} onChange={setHp} min={1} max={LIMITS.maxEnemyHp} error={errors.hp} />
          <NumericField label="術耐性" value={resistance} onChange={setResistance} min={0} max={LIMITS.maxEnemyResistance} error={errors.resistance} />
          <NumericField label="切り替え時間 (s)" value={switchDelay} onChange={setSwitchDelay} min={0} max={LIMITS.maxSwitchDelay} error={errors.switchDelay} />
          {skill.duration === null
            ? <NumericField label="計測時間 (s)" value={viewingDuration} onChange={setViewingDuration} min={0.1} max={LIMITS.maxDuration} error={errors.duration} />
            : <div className="calculator-field gg-single-duration"><span>持続時間</span><strong>{format(skill.duration)}秒</strong></div>}
          <button type="submit" className="button primary gg-single-run" disabled={!input}>{stale ? '変更した条件で実行' : '1回実行'}</button>
        </div>
        <details className="gg-single-seed">
          <summary>抽選設定（{fixedSeed ? '固定' : '毎回変更'}）</summary>
          <label className="gg-single-seed-mode"><input type="checkbox" checked={fixedSeed} onChange={(event) => setFixedSeed(event.target.checked)} />抽選番号を固定</label>
          {fixedSeed && <div className="gg-single-seed-fields">
            <NumericField label="抽選番号" value={seed} onChange={setSeed} min={0} max={LIMITS.maxSeed} step={1} error={errors.seed} />
          </div>}
          <p>{fixedSeed ? '同じ条件と抽選番号で結果を再現できます。' : '実行するたびに抽選番号を変更します。使用した番号は結果に表示します。'}</p>
        </details>
        {(fieldError || runError) && <p id="gg-single-input-error" className="gg-single-error" role="alert">{fieldError ?? runError}</p>}
      </form>
      </CollapsibleCalculatorPanel>
      <CollapsibleCalculatorPanel id="gg-single-result" number="03" title="シミュレーション結果"
        summary={completed ? `S${completed.skill.skillIndex}・${format(completed.input.duration)}秒・${format(history.length)}行${stale ? '・条件変更あり' : ''}` : '未実行'}
        collapsedLabel="結果を表示" bodyClassName="gg-single-result">
        <div className="gg-single-result-toolbar">
        <div className="gg-single-result-state" role="status" aria-live="polite">
          {completed ? <>
            <span>S{completed.skill.skillIndex} {completed.skill.skillLevelLabel}・{completed.skill.moduleApplication.moduleName ? `${completed.skill.moduleApplication.moduleName} Lv.${completed.skill.moduleApplication.moduleLevel}` : '未装備'}・{format(completed.input.duration)}秒{completed.enemyLabel && `・${completed.enemyLabel}`}・HP {format(completed.input.enemyHp)}・術耐性 {format(completed.input.enemyResistance)}・切替 {format(completed.input.switchDelay)}秒・抽選 {completed.input.seed}</span>
            {stale && <strong>条件変更あり・実行で反映</strong>}
          </> : <span>未実行</span>}
        </div>
        {completed && <label className="gg-single-decimals"><input type="checkbox" checked={showDecimals} onChange={(event) => setShowDecimals(event.target.checked)} />小数を表示</label>}
        </div>
        {completed && <>
          <GoldenglowSingleTrialSummary totals={completed.trial.totals} skillIndex={completed.skill.skillIndex} showDecimals={showDecimals} />
          <div className="gg-single-history-heading" ref={historyHeading} tabIndex={-1}>
            <h3 id="gg-single-history-title">攻撃と切り替え</h3>
          </div>
          <GoldenglowTargetSwitchHistoryTable history={history} input={completed.input} start={0}
            pageSize={visibleRowLimit} headingId="gg-single-history-title" showHelp={false} compact showDecimals={showDecimals}
            onOpen={openEvent} onOpenHp={(target) => setDetail({ kind: 'targetHp', target, seed: completed.input.seed })} />
          {history.length > 0 && <div className="gg-single-history-controls">
            <span role="status" aria-live="polite">{format(visibleRowCount)} / {format(history.length)}行</span>
            <div>
              {history.length > HISTORY_BATCH_SIZE && <button type="button" className="button secondary" disabled={remainingRowCount === 0}
                onClick={() => setVisibleRowLimit(history.length)}>
                {remainingRowCount > 0 ? 'すべて表示' : 'すべて表示済み'}
              </button>}
              {visibleRowCount > HISTORY_BATCH_SIZE && <button type="button" className="button secondary" onClick={collapseHistory}>最初の{HISTORY_BATCH_SIZE}行に戻す</button>}
            </div>
          </div>}
        </>}
        <details className="gg-single-help"><summary>表の見方・計算条件</summary>
          <p>同時刻の攻撃は本体、浮遊①、②、③の順に処理するモデルです。延期は攻撃予定の変更で、その時刻にはダメージが発生しません。セルを選ぶと詳細を確認できます。</p>
          <p>敵HPは、その時刻の最初の攻撃前から最後の攻撃後までの変化です。敵を倒すと同じHP・術耐性の次の敵に切り替わります。</p>
          <p>昇進2・最大レベル・信頼度100・潜在1で計算します。初回攻撃は攻撃間隔の経過後です。S2は発動後の指定時間を計測します。切り替え時間0.1秒と処理順序は暫定の仮定です。</p>
          <p>撃破後の切り替え待ちは次の攻撃までの残り時間と重なります。待ち終わる前に予定されていた攻撃だけが延期されます。</p>
          <p>敵を選ぶと基礎HP・術耐性を取り込みます。ステージによる補正や敵固有の能力は反映しません。選択後の数値は直接調整できます。</p>
        </details>
      </CollapsibleCalculatorPanel>
    </>}
    {detail && completed && <GoldenglowTargetSwitchDetailModal detail={detail} input={completed.input} result={null} showDecimals={showDecimals} onClose={() => setDetail(null)} />}
    {enemyPickerOpen && <GoldenglowDetailModal title="敵を選ぶ" closeLabel="敵の選択を閉じる" className="gg-single-enemy-dialog" onClose={() => setEnemyPickerOpen(false)}>
      <GoldenglowEnemyPicker enemies={enemyCatalog.rows ?? []} loading={enemyCatalog.rows === null && enemyCatalog.error === null}
        error={enemyCatalog.error} onRetry={() => setEnemyRetry((current) => current + 1)} selectedEnemyId={selectedEnemy?.id} onSelect={selectEnemy} />
    </GoldenglowDetailModal>}
    {effectDetail && skill && <GoldenglowDetailModal title={effectDetail === 'skill' ? `S${skill.skillIndex} ${skill.skillName} ${skill.skillLevelLabel}・スキル効果` : 'モジュール効果'} closeLabel="効果を閉じる" onClose={() => setEffectDetail(null)}>
      {effectDetail === 'skill' ? <p className="gg-skill-effect-description">{skill.skillDescription}</p> : <GoldenglowModuleEffect application={skill.moduleApplication} />}
    </GoldenglowDetailModal>}
    {footerContainer && createPortal(<span>ゴールデングロー · 単発シミュレーション</span>, footerContainer)}
  </section>
}

function numericError(value: string, min: number, max: number, label: string) {
  return value.trim() === '' || !Number.isFinite(Number(value)) || Number(value) < min || Number(value) > max
    ? `${label}は${format(min)}〜${format(max)}の数値で入力してください。` : null
}

function NumericField({ label, value, onChange, min, max, error, step = 'any' }: {
  label: string; value: string; onChange: (value: string) => void; min: number; max: number; error: string | null; step?: number | 'any'
}) {
  return <label className="calculator-field gg-single-field"><span>{label}</span><input type="number" inputMode="decimal" min={min} max={max} step={step} value={value}
    aria-invalid={Boolean(error)} aria-describedby={error ? 'gg-single-input-error' : undefined} onChange={(event) => onChange(event.target.value)} /></label>
}
