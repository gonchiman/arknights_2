import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { loadEnemyRecords } from '../lib/enemyData'
import { getEnemyCombatInputValues, hasEnemyCombatInputChanges } from '../lib/enemySelection'
import { deriveGoldenglowGuideSkills } from '../lib/goldenglowGuideSkill'
import { GOLDENGLOW_OPERATOR_ID } from '../lib/goldenglowExplosion'
import { getOperatorModules, getOperatorModuleId, getOperatorModuleLevels, isOperatorModuleUnlocked } from '../lib/operatorModules'
import type { GoldenglowTargetSwitchInput, GoldenglowTargetSwitchResult } from '../lib/goldenglowTargetSwitch'
import type { GoldenglowTargetSwitchGridSetup } from '../lib/goldenglowTargetSwitchGrid'
import type { SkillRecord } from '../types/skill'
import type { EnemyRecord } from '../types/enemy'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { EnemySearch, EMPTY_ENEMY_SEARCH_FILTERS, type EnemySearchFilters } from './EnemySearch'
import { GoldenglowBuildControls } from './GoldenglowBuildControls'
import { GoldenglowDetailModal } from './GoldenglowDetailModal'
import { GoldenglowModuleEffect } from './GoldenglowModuleEffect'
import { GoldenglowTargetSwitchDetailModal, type GoldenglowTargetSwitchDetail } from './GoldenglowTargetSwitchDetailModal'
import { GOLDENGLOW_TARGET_SWITCH_HP_PRESETS, GoldenglowTargetSwitchGridPanels } from './GoldenglowTargetSwitchGridPanel'
import { GoldenglowTargetSwitchHelpModal } from './GoldenglowTargetSwitchHelpModal'
import { GoldenglowTargetSwitchOperatorInfo } from './GoldenglowTargetSwitchOperatorInfo'
import { GoldenglowTargetSwitchTrialPanel } from './GoldenglowTargetSwitchTrialPanel'
import './DamageCalculator.css'
import './GoldenglowGuidePage.css'
import './GoldenglowTargetSwitchPage.css'

const formatters = [0, 1, 2, 3].map((maximumFractionDigits) => new Intl.NumberFormat('ja-JP', { maximumFractionDigits }))
const format = (value: number, digits = 1) => formatters[digits].format(value)
type PageDetail = GoldenglowTargetSwitchDetail

export function GoldenglowTargetSwitchPage({ rows, loading, error, onRetry, footerContainer }: {
  rows: readonly SkillRecord[]
  loading: boolean
  error: string | null
  onRetry: () => void
  footerContainer: HTMLElement | null
}) {
  const [moduleId, setModuleId] = useState('')
  const [moduleLevel, setModuleLevel] = useState(3)
  const [skillLevelIndex, setSkillLevelIndex] = useState<number | undefined>(undefined)
  const buildNavigationRef = useRef<HTMLDivElement>(null)
  const compactNavigationRef = useRef<HTMLDivElement>(null)
  const [navigation, setNavigation] = useState({ compact: false, left: 0, width: 0 })
  const pendingNavigationFocus = useRef<string | null>(null)
  const [effectDetail, setEffectDetail] = useState<'skill' | 'module' | null>(null)
  const operatorProfile = rows.find((row) => row.operatorId === GOLDENGLOW_OPERATOR_ID)?.operatorProfile
  const moduleChoices = useMemo(() => operatorProfile ? getOperatorModules(operatorProfile).map((module, index) => ({
    module,
    id: getOperatorModuleId(module, index),
    label: ['MOD', module.typeName2?.trim()].filter(Boolean).join(' '),
    levels: getOperatorModuleLevels(module),
    unlocked: isOperatorModuleUnlocked(module, 2, operatorProfile.phases[2]?.maxLevel ?? 1),
  })) : [], [operatorProfile])
  const skills = useMemo(() => deriveGoldenglowGuideSkills(rows, moduleId, moduleLevel, skillLevelIndex), [rows, moduleId, moduleLevel, skillLevelIndex])
  const [skillIndex, setSkillIndex] = useState(3)
  const skill = skills.find((item) => item.skillIndex === skillIndex) ?? skills[0] ?? null
  const [hp, setHp] = useState('5000')
  const [resistance, setResistance] = useState('0')
  const [selectedEnemy, setSelectedEnemy] = useState<EnemyRecord | null>(null)
  const [enemySearchOpen, setEnemySearchOpen] = useState(false)
  const [enemyFilters, setEnemyFilters] = useState<EnemySearchFilters>({ ...EMPTY_ENEMY_SEARCH_FILTERS })
  const enemySearchTrigger = useRef<HTMLButtonElement>(null)
  const enemyCatalog = useEnemyCatalog(enemySearchOpen)
  const enemyAdjusted = selectedEnemy ? hasEnemyCombatInputChanges(selectedEnemy, { hp, resistance }) : false
  const selectedEnemyBase = selectedEnemy ? getEnemyCombatInputValues(selectedEnemy) : null
  const enemyNeedsInput = selectedEnemyBase && (
    (selectedEnemyBase.hp === '' && hp.trim() === '')
    || (selectedEnemyBase.resistance === '' && resistance.trim() === '')
  )
  const closeEnemySearch = () => {
    setEnemySearchOpen(false)
    enemySearchTrigger.current?.focus({ preventScroll: true })
  }
  const applyEnemy = (enemy: EnemyRecord) => {
    const values = getEnemyCombatInputValues(enemy)
    setSelectedEnemy(enemy)
    setHp(values.hp)
    setResistance(values.resistance)
    closeEnemySearch()
  }
  const [switchDelay, setSwitchDelay] = useState('0')
  const [retargetRemainingDrones, setRetargetRemainingDrones] = useState(false)
  const [showDecimals, setShowDecimals] = useState(false)
  const [viewingDuration, setViewingDuration] = useState('30')
  const [trials, setTrials] = useState(10000)
  const [seed, setSeed] = useState(20260908)
  const [helpOpen, setHelpOpen] = useState(false)
  const [detail, setDetail] = useState<PageDetail | null>(null)
  const attack = skill?.effectiveAttack ?? 0
  const interval = skill?.attackInterval ?? 1.3
  const duration = skill?.duration ?? Number(viewingDuration)
  const moduleLabel = skill?.moduleApplication.moduleName
    ? `${skill.moduleApplication.moduleName} Lv.${skill.moduleApplication.moduleLevel}` : 'モジュールなし'
  const closeBuildDetails = () => {
    setDetail(null)
    setEffectDetail(null)
  }
  const commonFieldError = [
    invalidNumber(switchDelay, 0, 5, '切り替えの追加時間'),
    invalidNumber(String(attack), 0, 1e6, 'スキル中の攻撃力'),
    invalidNumber(String(interval), 0.05, 300, '攻撃間隔'),
    skill?.skillIndex === 2 ? invalidNumber(viewingDuration, 0.1, 300, '計測時間') : null,
  ].find(Boolean) ?? null
  const fieldError = invalidNumber(hp, 0, 1e9, '敵HP')
    ?? invalidNumber(resistance, 0, 100, '術耐性') ?? commonFieldError
  const gridInput = useMemo<GoldenglowTargetSwitchGridSetup | null>(() => skill && !commonFieldError ? {
    model: skill.explosionModel, skillIndex: skill.skillIndex,
    effectiveAttack: attack, attackInterval: interval, duration,
    enemyDefense: 0, switchDelay: Number(switchDelay), retargetRemainingDrones, trials, seed,
  } : null, [skill, commonFieldError, attack, interval, duration, switchDelay, retargetRemainingDrones, trials, seed])
  const input = useMemo<GoldenglowTargetSwitchInput | null>(() => skill && !fieldError && Number(hp) >= 1 ? {
    model: skill.explosionModel, skillIndex: skill.skillIndex,
    effectiveAttack: attack, attackInterval: interval, duration,
    enemyHp: Number(hp), enemyDefense: 0, enemyResistance: Number(resistance),
    switchDelay: Number(switchDelay), retargetRemainingDrones, trials, seed,
  } : null, [skill, fieldError, attack, interval, duration, hp, resistance, switchDelay, retargetRemainingDrones, trials, seed])
  const calculation = useSimulation(input)
  const resultStatus = fieldError ? '入力値を確認してください。'
    : Number(hp) < 1 ? '敵HPを1以上にすると計算します。'
      : calculation.error ?? (calculation.result ? null : '爆発の抽選と撃破を計算中…')
  useEffect(() => setDetail(null), [input])
  const openCondition = (condition: Extract<GoldenglowTargetSwitchDetail, { kind: 'condition' }>['condition']) => (
    input ? () => setDetail({ kind: 'condition', condition }) : undefined
  )

  useLayoutEffect(() => {
    const normal = buildNavigationRef.current
    const compactNavigation = compactNavigationRef.current
    if (!normal || !compactNavigation) return
    let animationFrameId = 0
    const updateStuckState = () => {
      const stickyTop = Number.parseFloat(window.getComputedStyle(compactNavigation).top) || 0
      const bounds = normal.getBoundingClientRect()
      // 通常表示の高さは維持し、固定表示への切り替えで本文が動かないようにする。
      const compact = bounds.bottom <= stickyTop
      const wasCompact = !compactNavigation.hidden
      if (compact !== wasCompact) {
        const previous = wasCompact ? compactNavigation : normal
        const focused = document.activeElement
        if (focused instanceof HTMLElement && previous.contains(focused)) {
          pendingNavigationFocus.current = focused.getAttribute('data-gg-build-control')
          focused.blur()
        }
      }
      setNavigation((current) => (
        current.compact === compact && current.left === bounds.left && current.width === bounds.width
          ? current : { compact, left: bounds.left, width: bounds.width }
      ))
    }
    const requestUpdate = () => {
      window.cancelAnimationFrame(animationFrameId)
      animationFrameId = window.requestAnimationFrame(updateStuckState)
    }
    updateStuckState()
    window.addEventListener('scroll', requestUpdate, { passive: true })
    window.addEventListener('resize', requestUpdate)
    const resizeObserver = new ResizeObserver(requestUpdate)
    resizeObserver.observe(normal)
    if (normal.parentElement) resizeObserver.observe(normal.parentElement)
    if (normal.previousElementSibling instanceof HTMLElement) resizeObserver.observe(normal.previousElementSibling)
    return () => {
      window.cancelAnimationFrame(animationFrameId)
      window.removeEventListener('scroll', requestUpdate)
      window.removeEventListener('resize', requestUpdate)
      resizeObserver.disconnect()
    }
  }, [loading, skills.length])

  useLayoutEffect(() => {
    const key = pendingNavigationFocus.current
    pendingNavigationFocus.current = null
    if (!key) return
    const target = navigation.compact ? compactNavigationRef.current : buildNavigationRef.current
    const controls = Array.from(target?.querySelectorAll<HTMLElement>('[data-gg-build-control]') ?? [])
    const visibleControl = (controlKey: string) => controls.find((control) => (
      control.getAttribute('data-gg-build-control') === controlKey
        && !control.matches(':disabled') && control.getClientRects().length > 0
    ))
    const control = visibleControl(key) ?? visibleControl(key.replace(/-content$/, ''))
      ?? (key.startsWith('module-effect') ? visibleControl('module-off') : undefined)
    control?.focus({ preventScroll: true })
  }, [navigation.compact])

  const renderBuildControls = (compact: boolean) => skill && <GoldenglowBuildControls
    skill={skill} skills={skills} moduleChoices={moduleChoices} compact={compact}
    onShowEffect={setEffectDetail}
    onSkillChange={(index) => { setSkillIndex(index); closeBuildDetails() }}
    onSkillLevelChange={(index) => { setSkillLevelIndex(index); closeBuildDetails() }}
    onModuleChange={(id, level) => { setModuleId(id); setModuleLevel(level); closeBuildDetails() }} />

  return (
    <section className="calculator-page gg-switch-page" aria-labelledby="gg-switch-title">
      <header className="page-intro">
        <div><span className="page-kicker">GOLDENGLOW / TARGET SWITCHING</span><h1 id="gg-switch-title">Goldenglow Target Switching Analysis</h1></div>
      </header>
      {loading ? <p className="calculator-loading" role="status">スキル情報を読み込み中…</p> : !skill ? (
        <div className="error-box" role="alert"><p>{error ?? 'ゴールデングローのスキル情報を取得できませんでした。'}</p><button type="button" className="button secondary" onClick={onRetry}>再読み込み</button></div>
      ) : <>
        <div className="damage-build-navigation gg-skill-navigation gg-normal-navigation"
          ref={buildNavigationRef} inert={navigation.compact} aria-hidden={navigation.compact}>
          {renderBuildControls(false)}
        </div>
        <div className="damage-build-navigation gg-skill-navigation gg-compact-navigation is-stuck"
          ref={compactNavigationRef} hidden={!navigation.compact}
          style={{ left: navigation.left, width: navigation.width }}>
          {renderBuildControls(true)}
        </div>
        {effectDetail && <GoldenglowDetailModal
          title={effectDetail === 'skill' ? `S${skill.skillIndex} ${skill.skillName} ${skill.skillLevelLabel}・スキル効果` : 'モジュール効果'}
          closeLabel={effectDetail === 'skill' ? 'スキル効果を閉じる' : 'モジュール効果を閉じる'}
          onClose={() => setEffectDetail(null)}>
          {effectDetail === 'skill'
            ? <p className="gg-skill-effect-description">{skill.skillDescription || 'スキル効果の説明を取得できませんでした。'}</p>
            : <GoldenglowModuleEffect application={skill.moduleApplication} />}
        </GoldenglowDetailModal>}
        <GoldenglowTargetSwitchOperatorInfo skill={skill} key={`${skill.skillIndex}:${skill.skillLevelIndex}:${skill.moduleId}:${moduleLevel}`} />
        <CollapsibleCalculatorPanel id="ggs-output" number="01" title="計算条件" summary={`S${skill.skillIndex}・浮遊${skill.explosionModel.activeDroneCount}体・撃破後に次の敵へ`}
          collapsedLabel="表を表示">
          <TableSection id="ggs-enemy-conditions" title="敵">
            <tbody>
              <ValueRow label="敵の選択" value={<div className="ggs-enemy-picker">
                <button ref={enemySearchTrigger} type="button" className="operator-search-trigger ggs-enemy-search-trigger" aria-label="敵を検索して選択" aria-expanded={enemySearchOpen} aria-controls="ggs-enemy-search" onClick={() => setEnemySearchOpen((value) => !value)}>
                  <strong>{selectedEnemy?.name ?? '数値入力'}</strong>
                  <small>{selectedEnemy ? `${selectedEnemy.index || '図鑑番号なし'} · ${enemyAdjusted ? '数値を調整済み' : '基礎ステータス'}` : 'HP・術耐性を指定'}</small>
                  <em>{enemySearchOpen ? '検索を閉じる' : '検索して選択'} ↗</em>
                </button>
                {selectedEnemy && <div className="ggs-enemy-actions">
                  {enemyAdjusted && <button type="button" onClick={() => applyEnemy(selectedEnemy)}>基礎値に戻す</button>}
                  <button type="button" onClick={() => { setSelectedEnemy(null); closeEnemySearch() }}>数値入力に切り替え</button>
                </div>}
              </div>} />
              {enemySearchOpen && <tr className="ggs-enemy-search-row"><td colSpan={2}>
                <div id="ggs-enemy-search" className="calculator-operator-search">
                  <div className="operator-search-heading"><div><strong>敵を検索</strong><span>区分・文字・HP・術耐性で絞り込めます</span></div><button type="button" aria-label="敵検索を閉じる" onClick={closeEnemySearch}>閉じる</button></div>
                  {enemyCatalog.error ? <div className="ggs-enemy-load-error" role="alert"><p>{enemyCatalog.error}</p><button type="button" className="button secondary" onClick={enemyCatalog.retry}>再読み込み</button></div>
                    : <EnemySearch rows={enemyCatalog.rows} filters={enemyFilters} loading={enemyCatalog.loading} onFiltersChange={setEnemyFilters} onSelect={applyEnemy} selectedEnemyId={selectedEnemy?.id} />}
                </div>
              </td></tr>}
              <ValueRow label="敵HP（次の敵も同じ）" onOpen={openCondition('enemyHp')} value={<HpInput value={hp} onChange={setHp} />} />
              <ValueRow label="敵の術耐性" onOpen={openCondition('enemyResistance')} value={<ResistanceInput value={resistance} onChange={setResistance} />} />
            </tbody>
          </TableSection>
          {enemyNeedsInput && <p className="ggs-status" role="status">未取得のステータスは空欄です。数値を入力してください。</p>}
          <TableSection id="ggs-battle-conditions" title="戦闘・計測条件">
            <tbody>
              {skill.skillIndex === 2 && <ValueRow label="発動後の計測時間" onOpen={openCondition('duration')} value={<NumericInput id="ggs-duration" label="発動後の計測時間" value={viewingDuration} onChange={setViewingDuration} min={0.1} max={300} unit="秒" />} />}
              <ValueRow label="残り浮遊の切り替え（仮定）" onOpen={openCondition('retargetRemainingDrones')} value={<label className="calculator-field">
                <span>残り浮遊の切り替え（仮定）</span>
                <select id="ggs-retarget" aria-label="残り浮遊の切り替え（仮定）" value={retargetRemainingDrones ? 'on' : 'off'} onChange={(event) => setRetargetRemainingDrones(event.target.value === 'on')}>
                  <option value="off">なし</option><option value="on">あり</option>
                </select>
              </label>} />
              <ValueRow label="切り替えの追加時間" onOpen={openCondition('switchDelay')} value={<NumericInput id="ggs-delay" label="切り替えの追加時間" value={switchDelay} onChange={setSwitchDelay} min={0} max={5} unit="秒" />} />
              <ValueRow label="計算モデル・参照元" onOpen={input ? () => setDetail({ kind: 'model' }) : undefined} value={`${retargetRemainingDrones ? '残り浮遊の切り替えあり' : '一斉着弾'}・帰還と移動0秒`} />
            </tbody>
          </TableSection>
          <div className="ggs-actions"><button className="button secondary" type="button" onClick={() => setSwitchDelay('0')}>切り替え時間を標準に戻す</button></div>
          <TableSection id="ggs-sampling" title="試行回数・抽選設定">
            <tbody>
              <ValueRow label="試行回数" onOpen={openCondition('sampling')} value={<label className="calculator-field"><span>試行回数</span><select id="ggs-trials" aria-label="試行回数" value={trials} onChange={(event) => setTrials(Number(event.target.value))}><option value={1000}>1,000回</option><option value={10000}>10,000回</option><option value={20000}>20,000回</option></select></label>} />
              <ValueRow label="抽選番号" onOpen={openCondition('sampling')} value={<div className="ggs-seed-control">
                <span>{seed}</span>
                <button className="button secondary" type="button" onClick={() => setSeed((value) => (value + 1) >>> 0)}>別の抽選で再計算</button>
              </div>} />
            </tbody>
          </TableSection>
          <TableSection id="ggs-display-settings" title="表示設定">
            <tbody><ValueRow label="小数点以下" value={<label className="ggs-display-decimals">
              <input type="checkbox" aria-label="小数点以下を表示" checked={showDecimals} onChange={(event) => setShowDecimals(event.target.checked)} />
              表示する
            </label>} /></tbody>
          </TableSection>
          {fieldError && <p className="ggs-error" role="alert">{fieldError}</p>}
        </CollapsibleCalculatorPanel>
        <CollapsibleCalculatorPanel id="ggs-results-panel" number="02" title="計算結果" summary={`S${skill.skillIndex}・${skill.duration === null ? '計測時間' : 'スキル時間'}${format(duration)}秒・撃破後に次の敵へ`}
          collapsedLabel="結果を表示">
          {resultStatus && <p className="ggs-status" role="status" aria-live="polite">{resultStatus}</p>}
          {input && calculation.result && <OutputTables result={calculation.result} input={input} showDecimals={showDecimals} onOpen={setDetail} />}
        </CollapsibleCalculatorPanel>
        <GoldenglowTargetSwitchGridPanels input={gridInput} error={commonFieldError} showDecimals={showDecimals} />
        <GoldenglowTargetSwitchTrialPanel input={input} result={calculation.result} status={resultStatus} showDecimals={showDecimals} onOpen={setDetail} />
        {footerContainer && createPortal(<button type="button" className="ggs-footer-link" aria-haspopup="dialog"
          onClick={() => setHelpOpen(true)}>計算条件と結果の見方</button>, footerContainer)}
        {helpOpen && <GoldenglowTargetSwitchHelpModal
          buildLabel={`S${skill.skillIndex} ${skill.skillLevelLabel}・${moduleLabel}`}
          duration={duration} permanent={skill.skillIndex === 2} trials={trials}
          retargetRemainingDrones={retargetRemainingDrones}
          showDecimals={showDecimals}
          droneCount={skill.explosionModel.activeDroneCount} hpRanges={Object.values(GOLDENGLOW_TARGET_SWITCH_HP_PRESETS)}
          onClose={() => setHelpOpen(false)} />}
        {input && detail && <GoldenglowTargetSwitchDetailModal detail={detail} input={input} result={calculation.result} showDecimals={showDecimals} onClose={() => setDetail(null)} />}
      </>}
    </section>
  )
}

function OutputTables({ result, input, showDecimals, onOpen }: { result: GoldenglowTargetSwitchResult; input: GoldenglowTargetSwitchInput; showDecimals: boolean; onOpen: (detail: PageDetail) => void }) {
  const { mean } = result
  const digits = showDecimals ? 3 : 0
  const permanent = input.skillIndex === 2
  const droneCount = input.model.activeDroneCount
  const metric = (name: Extract<GoldenglowTargetSwitchDetail, { kind: 'metric' }>['metric']) => () => onOpen({ kind: 'metric', metric: name })
  return <>
    <TableSection id="ggs-result-enemy" title="敵">
      <tbody>
        <ValueRow label="HP" value={format(input.enemyHp, 3)} />
        <ValueRow label="術耐性" value={format(input.enemyResistance, 3)} />
      </tbody>
    </TableSection>
    <TableSection id="ggs-result-attacks" title="スキル時間・攻撃回数">
      <tbody>
        <ValueRow label="スキル持続時間" value={permanent ? `永続（計測${format(result.duration, 3)}秒）` : `${format(result.duration, 3)}秒`} />
        <ValueRow label="本体攻撃回数" value={`${format(input.skillIndex === 3 ? 0 : mean.volleys, digits)}回`} />
        <ValueRow label="浮遊ユニット攻撃回数" value={`${format(mean.volleys * droneCount, digits)}回`} />
        <ValueRow label="爆発回数期待値" value={`${format(mean.explosions, digits)}回`} onOpen={metric('explosions')} />
      </tbody>
    </TableSection>
    <TableSection id="ggs-results" title="スキルダメージ期待値" columns="gg-value-table ggs-result-table">
      <tbody>
        <ValueRow label="スキル時間総ダメージ" value={format(mean.rawDamage, digits)} onOpen={metric('rawDamage')} />
        <ValueRow label="スキル期待DPS" value={format(mean.rawDps, digits)} onOpen={metric('rawDps')} />
      </tbody>
    </TableSection>
    <TableSection id="ggs-results-breakdown" title="ダメージ内訳">
      <tbody>
        <ValueRow label="本体" value={format(mean.bodyDamage, digits)} />
        <ValueRow label="浮遊ユニット" value={format(mean.normalDamage, digits)} />
        <ValueRow label="爆発" value={format(mean.explosionDamage, digits)} />
      </tbody>
    </TableSection>
  </>
}

function useEnemyCatalog(enabled: boolean) {
  const [state, setState] = useState<{ rows: EnemyRecord[] | null; error: string | null }>({ rows: null, error: null })
  const [version, setVersion] = useState(0)
  useEffect(() => {
    if (!enabled || state.rows !== null) return
    let active = true
    setState({ rows: null, error: null })
    void loadEnemyRecords().then((rows) => {
      if (active) setState({ rows, error: null })
    }).catch((cause: unknown) => {
      if (active) setState({ rows: null, error: cause instanceof Error ? cause.message : '敵データの取得に失敗しました。' })
    })
    return () => { active = false }
  }, [enabled, version, state.rows])
  return { rows: state.rows ?? [], error: state.error, loading: enabled && state.rows === null && !state.error, retry: () => setVersion((value) => value + 1) }
}

function useSimulation(input: GoldenglowTargetSwitchInput | null) {
  const [state, setState] = useState<{ input: GoldenglowTargetSwitchInput | null; result: GoldenglowTargetSwitchResult | null; error: string | null }>({ input: null, result: null, error: null })
  useEffect(() => {
    if (!input) return
    let worker: Worker | undefined
    const timer = window.setTimeout(() => {
      try {
        worker = new Worker(new URL('../lib/goldenglowTargetSwitch.worker.ts', import.meta.url), { type: 'module' })
        worker.onmessage = (event: MessageEvent<{ result?: GoldenglowTargetSwitchResult; error?: string }>) => {
          setState({ input, result: event.data.result ?? null, error: event.data.error ?? null })
          worker?.terminate()
        }
        worker.onerror = () => { setState({ input, result: null, error: '計算を完了できませんでした。条件を変更するか、ページを再読み込みしてください。' }); worker?.terminate() }
        worker.postMessage(input)
      } catch {
        setState({ input, result: null, error: '計算を開始できませんでした。ページを再読み込みしてください。' })
      }
    }, 220)
    return () => { window.clearTimeout(timer); worker?.terminate() }
  }, [input])
  return state.input === input ? state : { result: null, error: null }
}

function TableSection({ id, title, children, columns }: { id: string; title: string; children: ReactNode; columns?: string }) {
  return <><h3 className="gg-table-title" id={`${id}-title`}>{title}</h3><div className="gg-probability-table-wrap gg-value-table-wrap">
    <table className={`gg-probability-table ${columns ?? 'gg-value-table'}`} aria-labelledby={`${id}-title`}>{children}</table>
  </div></>
}

function ValueRow({ label, value, onOpen }: { label: string; value: ReactNode; onOpen?: () => void }) {
  return <DetailTableRow label={label} onOpen={onOpen}><td>{value}</td></DetailTableRow>
}

function DetailTableRow({ label, detailLabel, children, onOpen, className = '' }: { label: string; detailLabel?: string; children: ReactNode; onOpen?: () => void; className?: string }) {
  return <tr className={`${onOpen ? 'gg-detail-row' : ''} ${className}`.trim()} onClick={onOpen ? (event) => {
    if (event.target instanceof Element && event.target.closest('input, select, button, label, a')) return
    event.currentTarget.querySelector('button')?.focus({ preventScroll: true })
    onOpen()
  } : undefined}>
    <th scope="row">{onOpen ? <button type="button" className="gg-detail-trigger" aria-label={detailLabel ?? `${label}の詳細`} aria-haspopup="dialog" onClick={onOpen}>{label}<span aria-hidden="true">›</span></button> : label}</th>{children}
  </tr>
}

function HpInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const numericValue = Number(value)
  const invalid = !!invalidNumber(value, 0, 1e9, '敵HP')
  return <div className="ggs-hp-input">
    <NumericInput id="ggs-hp" label="敵HP" value={value} onChange={onChange} min={0} max={1e9} />
    <div className="ggs-hp-adjustments" role="group" aria-label="敵HPの増減">
      {[1000, 10000].map((step) => <div className="ggs-hp-adjustment-pair" key={step}>
        {[-step, step].map((delta) => <button key={delta} type="button"
          aria-label={`敵HPを${format(step, 0)}${delta < 0 ? '減らす' : '増やす'}`}
          disabled={invalid || (delta < 0 ? numericValue <= 0 : numericValue >= 1e9)}
          onClick={() => onChange(String(Math.max(0, Math.min(1e9, numericValue + delta))))}>
          {delta < 0 ? '−' : '＋'}{format(step, 0)}
        </button>)}
      </div>)}
    </div>
  </div>
}

function ResistanceInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const numericValue = Number(value)
  // 敵選択や数値入力の値は保ち、スライダーの位置だけを5刻みに合わせる。
  const sliderValue = Number.isFinite(numericValue) ? Math.max(0, Math.min(100, Math.round(numericValue / 5) * 5)) : 0
  return <div className="ggs-stat-input ggs-resistance-input">
    <label className="ggs-stat-range">
      <input id="ggs-resistance-slider" type="range" min={0} max={100} step={5} value={sliderValue}
        aria-label="術耐性（5刻み）"
        onChange={(event) => onChange(event.target.value)}
        onPointerUp={(event) => { if (event.button === 0) onChange(event.currentTarget.value) }}
        onKeyUp={(event) => {
          if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) onChange(event.currentTarget.value)
        }} />
      <span className="ggs-stat-range-ends" aria-hidden="true"><span>0</span><span>5刻み</span><span>100</span></span>
    </label>
    <NumericInput id="ggs-resistance" label="術耐性" value={value} onChange={onChange} min={0} max={100} />
  </div>
}

function NumericInput({ id, label, value, onChange, min, max, unit }: { id: string; label: string; value: string; onChange: (value: string) => void; min: number; max: number; unit?: string }) {
  return <label className="calculator-field"><span>{label}</span><div className="number-input-wrap"><input id={id} type="number" inputMode="decimal" aria-label={label} min={min} max={max} step="any" value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={!!invalidNumber(value, min, max, label)} />{unit && <em>{unit}</em>}</div></label>
}

function invalidNumber(value: string, min: number, max: number, label: string) {
  return value.trim() === '' || !Number.isFinite(Number(value)) || Number(value) < min || Number(value) > max ? `${label}は${format(min, 2)}〜${format(max, 0)}の数値で入力してください。` : null
}
