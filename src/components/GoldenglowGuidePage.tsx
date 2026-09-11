import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { calculateDamageBreakdown } from '../lib/damageCalculator'
import { buildGoldenglowFirstExplosionDistribution, GOLDENGLOW_OPERATOR_ID, type GoldenglowFirstExplosionRow } from '../lib/goldenglowExplosion'
import { getOperatorModules, getOperatorModuleId, getOperatorModuleLevels, isOperatorModuleUnlocked } from '../lib/operatorModules'
import { deriveGoldenglowGuideSkills, type GoldenglowGuideSkill } from '../lib/goldenglowGuideSkill'
import { buildGoldenglowSkillAttackTable } from '../lib/goldenglowSkillAttackTable'
import { buildGoldenglowAttackProbabilityDetail } from '../lib/goldenglowAttackProbability'
import { buildGoldenglowCombinedAttackTable } from '../lib/goldenglowCombinedAttackTable'
import type { SkillRecord } from '../types/skill'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { GoldenglowAttackProbabilityModal } from './GoldenglowAttackProbabilityModal'
import { GoldenglowExplosionDamageModal } from './GoldenglowExplosionDamageModal'
import { GoldenglowAttackDetailModal } from './GoldenglowAttackDetailModal'
import { GoldenglowFirstExplosionModal } from './GoldenglowFirstExplosionModal'
import { GoldenglowExpectationDetailModal } from './GoldenglowExpectationDetailModal'
import { GoldenglowExpectationMeaningModal } from './GoldenglowExpectationMeaningModal'
import { GoldenglowNormalAttackPanel } from './GoldenglowNormalAttackPanel'
import { GoldenglowCombinedAttackPanel } from './GoldenglowCombinedAttackPanel'
import { GoldenglowResultPanel } from './GoldenglowResultPanel'
import { GoldenglowExpandableTable } from './GoldenglowExpandableTable'
import { GoldenglowOperatorInfo } from './GoldenglowOperatorInfo'
import { GoldenglowBuildControls } from './GoldenglowBuildControls'
import { GoldenglowDetailModal } from './GoldenglowDetailModal'
import { GoldenglowModuleEffect } from './GoldenglowModuleEffect'
import './DamageCalculator.css'
import './GoldenglowGuidePage.css'

const format = (value: number) => new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 }).format(value)
const probabilityFormat = new Intl.NumberFormat('ja-JP', { maximumSignificantDigits: 4 })
const formatProbability = (probability: number) => `${probabilityFormat.format(probability * 100)}%`

export function GoldenglowGuidePage({ rows, loading, error, onRetry }: {
  rows: readonly SkillRecord[]
  loading: boolean
  error: string | null
  onRetry: () => void
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
  const [attackOverride, setAttackOverride] = useState<number | null>(null)
  const attack = attackOverride ?? skill?.effectiveAttack ?? 391
  const [explosionScaleOverride, setExplosionScale] = useState<number | null>(null)
  const explosionScale = explosionScaleOverride ?? skill?.explosionModel.attackScalePercent ?? 300
  const [resistance, setResistance] = useState(0)
  const [resistanceIgnoreOverride, setResistanceIgnore] = useState<number | null>(null)
  const resistanceIgnore = resistanceIgnoreOverride ?? skill?.explosionModel.resistanceIgnoreFixed ?? 15
  const [viewingDuration, setViewingDuration] = useState(30)
  const [singleDetail, setSingleDetail] = useState<'attack' | 'damage' | null>(null)
  const rawDamage = attack * explosionScale / 100
  const damage = calculateDamageBreakdown(rawDamage, 'ARTS', 0, resistance, {
    resistanceIgnoreFixed: resistanceIgnore,
  })
  const duration = skill?.duration ?? viewingDuration
  const moduleLabel = skill?.moduleApplication.moduleName
    ? `${skill.moduleApplication.moduleName} Lv.${skill.moduleApplication.moduleLevel}` : 'モジュールなし'
  const explosionDistribution = useMemo(() => skill ? buildGoldenglowFirstExplosionDistribution(skill.explosionModel) : [], [skill])
  const changeModule = (id: string, level: number) => {
    setModuleId(id)
    setModuleLevel(level)
    setAttackOverride(null)
    setExplosionScale(null)
    setResistanceIgnore(null)
    setSingleDetail(null)
    if (!id) setEffectDetail((current) => current === 'module' ? null : current)
  }
  const combinedAttackRows = useMemo(() => skill ? buildGoldenglowCombinedAttackTable({
    model: skill.explosionModel,
    skillIndex: skill.skillIndex,
    attack,
    explosionDamage: damage.result,
    attackInterval: skill.attackInterval,
    duration,
    resistance,
    resistanceIgnore,
  }) : [], [skill, attack, damage.result, duration, resistance, resistanceIgnore])

  useLayoutEffect(() => {
    const normal = buildNavigationRef.current
    const compactNavigation = compactNavigationRef.current
    if (!normal || !compactNavigation) return
    let animationFrameId = 0
    const updateStuckState = () => {
      const stickyTop = Number.parseFloat(window.getComputedStyle(compactNavigation).top) || 0
      const bounds = normal.getBoundingClientRect()
      // The normal controls keep their real height and stay in the page flow.
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
    skill={skill}
    skills={skills}
    moduleChoices={moduleChoices}
    compact={compact}
    onShowEffect={setEffectDetail}
    resistance={resistance}
    onResistanceChange={setResistance}
    onSkillChange={(index) => {
      setSkillIndex(index)
      setAttackOverride(null)
    }}
    onSkillLevelChange={(index) => {
      setSkillLevelIndex(index)
      setAttackOverride(null)
      setSingleDetail(null)
    }}
    onModuleChange={changeModule}
  />

  return (
    <section className="calculator-page gg-reference-page" aria-labelledby="gg-reference-title">
      <header className="page-intro">
        <div>
          <span className="page-kicker">CALCULATION REFERENCE</span>
          <h1 id="gg-reference-title">Goldenglow Explosion Analysis</h1>
        </div>
      </header>
      {loading ? <div className="gg-skill-selection"><p role="status">スキル情報を読み込み中…</p></div> : skill ? (
        <>
          <div className="damage-build-navigation gg-skill-navigation gg-normal-navigation"
            ref={buildNavigationRef} inert={navigation.compact} aria-hidden={navigation.compact}>
            {renderBuildControls(false)}
          </div>
          <div
            className="damage-build-navigation gg-skill-navigation gg-compact-navigation is-stuck"
            ref={compactNavigationRef}
            hidden={!navigation.compact}
            style={{ left: navigation.left, width: navigation.width }}
          >
            {renderBuildControls(true)}
          </div>
          <div className="gg-skill-selection">
            <p>{skill.skillLevelLabel}・昇進2最大レベル・信頼100・潜在1・{moduleLabel}</p>
          </div>
        </>
      ) : (
        <div className="gg-skill-selection gg-skill-load-error" role="alert">
          <p>{error ?? 'ゴールデングローのスキル情報を取得できませんでした。'}</p>
          <button type="button" className="button secondary" onClick={onRetry}>再読み込み</button>
        </div>
      )}
      {effectDetail && skill && <GoldenglowDetailModal
        title={effectDetail === 'skill'
          ? `S${skill.skillIndex} ${skill.skillName} ${skill.skillLevelLabel}・スキル効果`
          : 'モジュール効果'}
        closeLabel={effectDetail === 'skill' ? 'スキル効果を閉じる' : 'モジュール効果を閉じる'}
        onClose={() => setEffectDetail(null)}
      >
        {effectDetail === 'skill'
          ? <p className="gg-skill-effect-description">{skill.skillDescription || 'スキル効果の説明を取得できませんでした。'}</p>
          : <GoldenglowModuleEffect application={skill.moduleApplication} />}
      </GoldenglowDetailModal>}
      <GoldenglowOperatorInfo skill={skill} loading={loading} />
      <GoldenglowResultPanel
        skill={skill}
        attackRows={combinedAttackRows}
        duration={duration}
        loading={loading}
      />
      <AttackConditionsPanel
        skill={skill}
        attack={attack}
        attackCount={combinedAttackRows.length}
        viewingDuration={viewingDuration}
        onViewingDurationChange={setViewingDuration}
        onShowAttackDetail={() => setSingleDetail('attack')}
        loading={loading}
      />
      <CollapsibleCalculatorPanel
        id="gg-single-explosion"
        number="04"
        title="単発の爆発ダメージ"
        summary="術ダメージ・敵1体・爆発1回"
        collapsedLabel="テーブルを表示"
      >
        <h3 className="gg-table-title" id="gg-explosion-conditions-title">数値条件</h3>
        <div className="gg-probability-table-wrap gg-value-table-wrap">
          <table className="gg-probability-table gg-value-table" aria-labelledby="gg-explosion-conditions-title">
            <tbody>
              <tr
                className={skill ? 'gg-detail-row' : undefined}
                onClick={(event) => {
                  if (!skill || (event.target instanceof Element && event.target.closest('input, label'))) return
                  event.currentTarget.querySelector('button')?.focus({ preventScroll: true })
                  setSingleDetail('attack')
                }}
              >
                <th scope="row">
                  <button type="button" className="gg-detail-trigger" aria-label="攻撃力の計算詳細" aria-haspopup="dialog" disabled={!skill}>
                    攻撃力{skill && <span aria-hidden="true">›</span>}
                  </button>
                </th>
                <td><ExplosionInput label="攻撃力" value={attack} max={1_000_000} onChange={setAttackOverride} /></td>
              </tr>
              <tr>
                <th scope="row">爆発倍率</th>
                <td><ExplosionInput label="爆発倍率" value={explosionScale} max={10_000} suffix="%" onChange={setExplosionScale} /></td>
              </tr>
              <tr>
                <th scope="row">敵の術耐性</th>
                <td><ExplosionInput label="敵の術耐性" value={resistance} max={100} onChange={setResistance} /></td>
              </tr>
              <tr>
                <th scope="row">術耐性無視</th>
                <td><ExplosionInput label="術耐性無視" value={resistanceIgnore} max={100} onChange={setResistanceIgnore} /></td>
              </tr>
            </tbody>
          </table>
        </div>
        <h3 className="gg-table-title" id="gg-explosion-result-title">ダメージ結果</h3>
        <div className="gg-probability-table-wrap gg-value-table-wrap gg-explosion-result-table-wrap">
          <table className="gg-probability-table gg-value-table" aria-labelledby="gg-explosion-result-title">
            <tbody>
              <tr
                className="gg-detail-row"
                onClick={(event) => {
                  event.currentTarget.querySelector('button')?.focus({ preventScroll: true })
                  setSingleDetail('damage')
                }}
              >
                <th scope="row">
                  <button
                    type="button"
                    className="gg-detail-trigger"
                    aria-label="単発爆発ダメージの詳細"
                    aria-haspopup="dialog"
                  >
                    単発爆発ダメージ<span aria-hidden="true">›</span>
                  </button>
                </th>
                <td><span role="status" aria-live="polite" aria-atomic="true">{format(damage.result)}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </CollapsibleCalculatorPanel>
      {singleDetail === 'attack' && skill && (
        <GoldenglowAttackDetailModal skill={skill} attackOverride={attackOverride} onClose={() => setSingleDetail(null)} />
      )}
      {singleDetail === 'damage' && (
        <GoldenglowExplosionDamageModal
          attack={attack}
          explosionScale={explosionScale}
          resistance={resistance}
          resistanceIgnore={resistanceIgnore}
          damage={damage}
          onClose={() => setSingleDetail(null)}
        />
      )}
      <FirstExplosionPanel explosionDistribution={explosionDistribution} />
      <ExplosionExpectationPanel explosionDistribution={explosionDistribution} />
      <SkillAttackPanel
        skill={skill}
        explosionDamage={damage.result}
        viewingDuration={viewingDuration}
        loading={loading}
      />
      <GoldenglowNormalAttackPanel
        skill={skill}
        attack={attack}
        resistance={resistance}
        resistanceIgnore={resistanceIgnore}
        viewingDuration={viewingDuration}
        loading={loading}
      />
      <GoldenglowCombinedAttackPanel
        skill={skill}
        attackRows={combinedAttackRows}
        attack={attack}
        explosionDamage={damage.result}
        resistance={resistance}
        resistanceIgnore={resistanceIgnore}
        viewingDuration={viewingDuration}
        loading={loading}
      />
    </section>
  )
}

function FirstExplosionPanel({ explosionDistribution }: { explosionDistribution: readonly GoldenglowFirstExplosionRow[] }) {
  const [selectedAttackNumber, setAttackNumber] = useState(2)
  const [detailOpen, setDetailOpen] = useState(false)
  const lastAttack = explosionDistribution.length
  const attackNumber = Math.min(selectedAttackNumber, lastAttack)
  const row = explosionDistribution[attackNumber - 1]
  if (!row) return null
  const probabilityRows = [
    { label: '不発が続いた場合の爆発確率', value: row.explosionChancePercent / 100 },
    { label: 'それまで爆発しない確率', value: row.reachProbability },
    { label: 'その回で初めて爆発する確率', value: row.firstExplosionProbability },
  ]

  return (
    <CollapsibleCalculatorPanel
      id="gg-first-explosion"
      number="05"
      title="爆発確率"
      summary="浮遊ユニット1体・初回爆発まで"
      collapsedLabel="テーブルを表示"
    >
      <label className="gg-first-explosion-slider">
        <span className="gg-first-explosion-slider-heading">攻撃回数<strong>{attackNumber}回目</strong></span>
        <input
          type="range"
          min={1}
          max={lastAttack}
          step={1}
          value={attackNumber}
          aria-label="初回爆発までの攻撃回数"
          aria-valuetext={`${attackNumber}回目${attackNumber === lastAttack ? '（それまで不発なら確定爆発）' : ''}`}
          onChange={(event) => setAttackNumber(event.target.valueAsNumber)}
        />
        <span className="gg-first-explosion-slider-ends" aria-hidden="true"><span>1回目</span><span>{lastAttack}回目</span></span>
      </label>
      <h3 className="gg-table-title" id="gg-first-explosion-results-title">確率結果</h3>
      <div className="gg-probability-table-wrap gg-value-table-wrap gg-first-explosion-results">
        <table className="gg-probability-table gg-value-table" aria-labelledby="gg-first-explosion-results-title">
          <tbody>
            {probabilityRows.map((item) => (
              <tr
                key={item.label}
                className="gg-detail-row"
                onClick={(event) => {
                  event.currentTarget.querySelector('button')?.focus({ preventScroll: true })
                  setDetailOpen(true)
                }}
              >
                <th scope="row">
                  <button type="button" className="gg-detail-trigger" aria-label={`${item.label}の詳細`} aria-haspopup="dialog">
                    {item.label}<span aria-hidden="true">›</span>
                  </button>
                </th>
                <td><span aria-live="polite" aria-atomic="true">{formatProbability(item.value)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {detailOpen && <GoldenglowFirstExplosionModal rows={explosionDistribution} attackNumber={attackNumber} onClose={() => setDetailOpen(false)} />}
    </CollapsibleCalculatorPanel>
  )
}

function ExplosionExpectationPanel({ explosionDistribution }: { explosionDistribution: readonly GoldenglowFirstExplosionRow[] }) {
  const [selectedDetail, setSelectedDetail] = useState<number | 'mean' | 'meaning' | null>(null)
  const expectationRows = useMemo(() => explosionDistribution.map((row) => ({
    ...row, contribution: row.attackNumber * row.firstExplosionProbability,
  })), [explosionDistribution])
  const meanAttacksPerExplosion = expectationRows.reduce((sum, row) => sum + row.contribution, 0)
  if (expectationRows.length === 0) return null

  return (
    <CollapsibleCalculatorPanel
      id="gg-explosion-expectation"
      number="06"
      title="爆発までの平均攻撃回数"
      summary="浮遊ユニット1体・次の爆発まで"
      collapsedLabel="テーブルを表示"
    >
      <h3 className="gg-table-title" id="gg-expectation-breakdown-title">攻撃回数ごとの計算</h3>
      <GoldenglowExpandableTable persistenceId="explosion-expectation-rows" rows={expectationRows} regionLabel="平均攻撃回数の計算内訳" tableWrapperClassName="gg-expectation-table-wrap">
        {(visibleRows) => <table className="gg-probability-table gg-expectation-table" aria-labelledby="gg-expectation-breakdown-title">
          <thead>
            <tr>
              <th scope="col">攻撃回数</th>
              <th scope="col">その回で初めて<br />爆発する確率</th>
              <th scope="col">
                <button
                  type="button"
                  className="gg-detail-trigger"
                  aria-label="攻撃回数 × 確率の意味"
                  aria-haspopup="dialog"
                  onClick={() => setSelectedDetail('meaning')}
                >
                  攻撃回数 × 確率<span aria-hidden="true">›</span>
                </button>
                <br />（概数）
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr
                key={row.attackNumber}
                className="gg-detail-row"
                onClick={(event) => {
                  event.currentTarget.querySelector('button')?.focus({ preventScroll: true })
                  setSelectedDetail(row.attackNumber)
                }}
              >
                <th scope="row">
                  <button type="button" className="gg-detail-trigger" aria-label={`${row.attackNumber}回目の期待値への寄与`} aria-haspopup="dialog">
                    {row.attackNumber}回目<span aria-hidden="true">›</span>
                  </button>
                </th>
                <td>{formatProbability(row.firstExplosionProbability)}</td>
                <td>{probabilityFormat.format(row.contribution)}回</td>
              </tr>
            ))}
          </tbody>
        </table>}
      </GoldenglowExpandableTable>
      <h3 className="gg-table-title" id="gg-expectation-result-title">計算結果</h3>
      <div className="gg-probability-table-wrap gg-value-table-wrap gg-expectation-result-table-wrap">
        <table className="gg-probability-table gg-value-table" aria-labelledby="gg-expectation-result-title">
          <tbody>
            <tr
              className="gg-detail-row"
              onClick={(event) => {
                event.currentTarget.querySelector('button')?.focus({ preventScroll: true })
                setSelectedDetail('mean')
              }}
            >
              <th scope="row">
                <button type="button" className="gg-detail-trigger" aria-label="平均攻撃回数の計算詳細" aria-haspopup="dialog">
                  爆発までの平均攻撃回数<span aria-hidden="true">›</span>
                </button>
              </th>
              <td>約{format(meanAttacksPerExplosion)}回</td>
            </tr>
          </tbody>
        </table>
      </div>
      {selectedDetail === 'meaning' && <GoldenglowExpectationMeaningModal
        example={expectationRows[2] ?? expectationRows[0]}
        meanAttacks={meanAttacksPerExplosion}
        onClose={() => setSelectedDetail(null)}
      />}
      {selectedDetail !== null && selectedDetail !== 'meaning' && <GoldenglowExpectationDetailModal
        rows={expectationRows}
        meanAttacks={meanAttacksPerExplosion}
        attackNumber={selectedDetail === 'mean' ? null : selectedDetail}
        onClose={() => setSelectedDetail(null)}
      />}
    </CollapsibleCalculatorPanel>
  )
}

function AttackConditionsPanel({ skill, attack, attackCount, viewingDuration, onViewingDurationChange, onShowAttackDetail, loading }: {
  skill: GoldenglowGuideSkill | null
  attack: number
  attackCount: number
  viewingDuration: number
  onViewingDurationChange: (duration: number) => void
  onShowAttackDetail: () => void
  loading: boolean
}) {
  const duration = skill?.duration ?? viewingDuration

  return (
    <CollapsibleCalculatorPanel
      id="gg-attack-conditions"
      number="03"
      title="攻撃条件"
      summary={skill ? `S${skill.skillIndex}・同一目標` : '各ダメージ期待値の共通条件'}
      collapsedLabel="条件を表示"
    >
      {skill ? <>
        <h3 className="gg-table-title" id="gg-attack-conditions-table-title">スキル中の攻撃条件</h3>
        <div className="gg-probability-table-wrap gg-value-table-wrap">
          <table className="gg-probability-table gg-value-table" aria-labelledby="gg-attack-conditions-table-title">
            <tbody>
              <tr
                className="gg-detail-row"
                onClick={(event) => {
                  event.currentTarget.querySelector('button')?.focus({ preventScroll: true })
                  onShowAttackDetail()
                }}
              >
                <th scope="row">
                  <button type="button" className="gg-detail-trigger" aria-label="最終攻撃力の計算詳細" aria-haspopup="dialog">
                    最終攻撃力<span aria-hidden="true">›</span>
                  </button>
                </th>
                <td>{format(attack)}</td>
              </tr>
              <tr><th scope="row">攻撃間隔</th><td>{format(skill.attackInterval)}秒</td></tr>
              <tr>
                <th scope="row">{skill.duration === null ? '表示時間' : 'スキル時間'}</th>
                <td>{skill.duration === null
                  ? <ExplosionInput label="表示時間" value={viewingDuration} max={600} suffix="秒" onChange={onViewingDurationChange} />
                  : `${format(duration)}秒`}</td>
              </tr>
              <tr><th scope="row">攻撃回数（各ユニット）</th><td>{attackCount}回</td></tr>
              <tr><th scope="row">浮遊ユニット数</th><td>{skill.explosionModel.activeDroneCount}体</td></tr>
              <tr><th scope="row">初回の特性倍率（全ユニット）</th><td>{format(skill.explosionModel.droneInitialAttackScalePercent)}%</td></tr>
              <tr><th scope="row">本体攻撃</th><td>{skill.skillIndex === 3 ? 'なし' : 'あり（敵が射程内）'}</td></tr>
            </tbody>
          </table>
        </div>
        {skill.duration === null && <p className="gg-probability-intro">S2は永続のため、表示時間を指定します。</p>}
      </> : <p className="gg-probability-intro" role="status">{loading ? 'スキル情報を読み込み中…' : 'スキル情報の読み込み後に表示します。'}</p>}
    </CollapsibleCalculatorPanel>
  )
}

function SkillAttackPanel({ skill, explosionDamage, viewingDuration, loading }: {
  skill: GoldenglowGuideSkill | null
  explosionDamage: number
  viewingDuration: number
  loading: boolean
}) {
  const [selectedAttackNumber, setSelectedAttackNumber] = useState<number | null>(null)
  const duration = skill?.duration ?? viewingDuration
  const attackRows = useMemo(() => skill ? buildGoldenglowSkillAttackTable({
    model: skill.explosionModel,
    attackInterval: skill.attackInterval,
    duration,
    explosionDamage,
  }) : [], [skill, duration, explosionDamage])
  const lastRow = attackRows.at(-1)
  const selectedDetail = useMemo(() => skill && selectedAttackNumber !== null
    ? buildGoldenglowAttackProbabilityDetail(skill.explosionModel, selectedAttackNumber)
    : null, [skill, selectedAttackNumber])

  useEffect(() => setSelectedAttackNumber(null), [skill?.skillIndex, duration])

  return (
    <CollapsibleCalculatorPanel
      id="gg-skill-attacks"
      number="07"
      title="爆発期待値"
      summary={skill ? `S${skill.skillIndex}・浮遊ユニット1体` : '浮遊ユニット1体'}
      collapsedLabel="テーブルを表示"
    >
      {skill ? (
        <>
          {lastRow ? (
            <>
              <h3 className="gg-table-title" id="gg-skill-attack-table-title">攻撃ごとの爆発期待値</h3>
              <GoldenglowExpandableTable persistenceId="skill-attacks-rows" rows={attackRows} regionLabel="爆発期待値テーブル" tableWrapperClassName="gg-skill-attack-table-wrap">
                {(visibleRows) => <table className="gg-probability-table gg-skill-attack-table" aria-labelledby="gg-skill-attack-table-title">
                  <thead>
                    <tr>
                      <th scope="col">攻撃回数</th>
                      <th scope="col">経過時間</th>
                      <th scope="col">今回の<br />爆発確率</th>
                      <th scope="col">今回の爆発ダメージ<br />の期待値</th>
                      <th scope="col">累計爆発回数<br />の期待値</th>
                      <th scope="col">累計爆発ダメージ<br />の期待値</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row) => (
                      <tr
                        key={row.attackNumber}
                        className="gg-skill-attack-row"
                        onClick={(event) => {
                          event.currentTarget.querySelector('button')?.focus({ preventScroll: true })
                          setSelectedAttackNumber(row.attackNumber)
                        }}
                      >
                        <th scope="row">
                          <button
                            type="button"
                            className="gg-attack-detail-trigger"
                            aria-label={`${row.attackNumber}回目の爆発確率の詳細`}
                            aria-haspopup="dialog"
                          >
                            {row.attackNumber}回目<span aria-hidden="true">›</span>
                          </button>
                        </th>
                        <td>{format(row.elapsedSeconds)}秒</td>
                        <td>{formatProbability(row.explosionChancePercent / 100)}</td>
                        <td>{format(row.explosionChancePercent / 100 * explosionDamage)}</td>
                        <td>{format(row.expectedExplosionCount)}回</td>
                        <td>{format(row.expectedExplosionDamage)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>}
              </GoldenglowExpandableTable>
              <div className="gg-probability-equation gg-expectation-sum" aria-live="polite" aria-atomic="true">
                <span>累計爆発回数の期待値 × 単発爆発ダメージ</span>
                <code>{format(lastRow.expectedExplosionCount)}回 × {format(explosionDamage)} ≈ {format(lastRow.expectedExplosionDamage)}</code>
              </div>
            </>
          ) : <p className="gg-probability-intro" role="status">この時間内には攻撃がありません。</p>}
          {selectedDetail && (
            <GoldenglowAttackProbabilityModal detail={selectedDetail} onClose={() => setSelectedAttackNumber(null)} />
          )}
        </>
      ) : <p className="gg-probability-intro" role="status">{loading ? 'スキル情報を読み込み中…' : 'スキル情報の読み込み後に表示します。'}</p>}
    </CollapsibleCalculatorPanel>
  )
}

function ExplosionInput({ label, value, max, suffix, onChange }: {
  label: string
  value: number
  max: number
  suffix?: string
  onChange: (value: number) => void
}) {
  return (
    <label className="calculator-field">
      <span>{label}</span>
      <div className="number-input-wrap">
        <input
          type="number"
          aria-label={label}
          min={0}
          max={max}
          step="any"
          value={value}
          onChange={(event) => {
            const next = event.target.valueAsNumber
            onChange(Number.isFinite(next) ? Math.min(max, Math.max(0, next)) : 0)
          }}
        />
        {suffix && <em>{suffix}</em>}
      </div>
    </label>
  )
}
