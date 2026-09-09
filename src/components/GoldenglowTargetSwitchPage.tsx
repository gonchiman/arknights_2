import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { loadEnemyRecords } from '../lib/enemyData'
import { getEnemyCombatInputValues, hasEnemyCombatInputChanges } from '../lib/enemySelection'
import { deriveGoldenglowGuideSkills } from '../lib/goldenglowGuideSkill'
import type { GoldenglowTargetSwitchInput, GoldenglowTargetSwitchResult } from '../lib/goldenglowTargetSwitch'
import type { SkillRecord } from '../types/skill'
import type { EnemyRecord } from '../types/enemy'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { EnemySearch, EMPTY_ENEMY_SEARCH_FILTERS, type EnemySearchFilters } from './EnemySearch'
import { GoldenglowAttackDetailModal } from './GoldenglowAttackDetailModal'
import { GoldenglowDetailModal } from './GoldenglowDetailModal'
import { GoldenglowTargetSwitchDetailModal, type GoldenglowTargetSwitchDetail } from './GoldenglowTargetSwitchDetailModal'
import './DamageCalculator.css'
import './GoldenglowGuidePage.css'
import './GoldenglowTargetSwitchPage.css'

const formatters = [0, 1, 2, 3].map((maximumFractionDigits) => new Intl.NumberFormat('ja-JP', { maximumFractionDigits }))
const format = (value: number, digits = 1) => formatters[digits].format(value)
const axisFormatter = new Intl.NumberFormat('ja-JP', { notation: 'compact', maximumFractionDigits: 1 })
const TRACE_PAGE_SIZE = 100
type PageDetail = GoldenglowTargetSwitchDetail | { kind: 'attack' } | { kind: 'chart' }

export function GoldenglowTargetSwitchPage({ rows, loading, error, onRetry }: {
  rows: readonly SkillRecord[]
  loading: boolean
  error: string | null
  onRetry: () => void
}) {
  const skills = useMemo(() => deriveGoldenglowGuideSkills(rows), [rows])
  const [skillIndex, setSkillIndex] = useState(3)
  const skill = skills.find((item) => item.skillIndex === skillIndex) ?? null
  const [hp, setHp] = useState('5000')
  const [resistance, setResistance] = useState('0')
  const [selectedEnemy, setSelectedEnemy] = useState<EnemyRecord | null>(null)
  const [enemySearchOpen, setEnemySearchOpen] = useState(false)
  const [enemyFilters, setEnemyFilters] = useState<EnemySearchFilters>({ ...EMPTY_ENEMY_SEARCH_FILTERS })
  const enemySearchTrigger = useRef<HTMLButtonElement>(null)
  const enemyCatalog = useEnemyCatalog(enemySearchOpen)
  const enemyAdjusted = selectedEnemy ? hasEnemyCombatInputChanges(selectedEnemy, { hp, resistance }) : false
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
  const [viewingDuration, setViewingDuration] = useState('30')
  const [attackOverride, setAttackOverride] = useState<string | null>(null)
  const [intervalOverride, setIntervalOverride] = useState<string | null>(null)
  const [trials, setTrials] = useState(10000)
  const [seed, setSeed] = useState(20260908)
  const [open, setOpen] = useState(true)
  const [detail, setDetail] = useState<PageDetail | null>(null)
  const attack = attackOverride ?? String(skill?.effectiveAttack ?? 0)
  const interval = intervalOverride ?? String(skill?.attackInterval ?? 1.3)
  const duration = skill?.duration ?? Number(viewingDuration)
  const fieldError = [
    invalidNumber(hp, 0, 1e9, '敵HP'),
    invalidNumber(resistance, 0, 100, '術耐性'),
    invalidNumber(switchDelay, 0, 5, '切り替えの追加時間'),
    invalidNumber(attack, 0, 1e6, 'スキル中の攻撃力'),
    invalidNumber(interval, 0.05, 300, '攻撃間隔'),
    skillIndex === 2 ? invalidNumber(viewingDuration, 0.1, 300, '計測時間') : null,
  ].find(Boolean) ?? null
  const input = useMemo<GoldenglowTargetSwitchInput | null>(() => skill && !fieldError && Number(hp) >= 1 ? {
    model: skill.explosionModel, skillIndex: skill.skillIndex,
    effectiveAttack: Number(attack), attackInterval: Number(interval), duration,
    enemyHp: Number(hp), enemyDefense: 0, enemyResistance: Number(resistance),
    switchDelay: Number(switchDelay), trials, seed,
  } : null, [skill, fieldError, attack, interval, duration, hp, resistance, switchDelay, trials, seed])
  const calculation = useSimulation(input)
  useEffect(() => setDetail(null), [input])
  const openCondition = (condition: Extract<GoldenglowTargetSwitchDetail, { kind: 'condition' }>['condition']) => (
    input ? () => setDetail({ kind: 'condition', condition }) : undefined
  )

  return (
    <section className="calculator-page gg-switch-page" aria-labelledby="gg-switch-title">
      <header className="page-intro">
        <div><span className="page-kicker">GOLDENGLOW / TARGET SWITCHING</span><h1 id="gg-switch-title">Goldenglow Target Switching Analysis</h1></div>
      </header>
      {loading ? <p className="calculator-loading" role="status">スキル情報を読み込み中…</p> : !skill ? (
        <div className="error-box" role="alert"><p>{error ?? 'ゴールデングローのスキル情報を取得できませんでした。'}</p><button type="button" className="button secondary" onClick={onRetry}>再読み込み</button></div>
      ) : <>
        <CollapsibleCalculatorPanel id="ggs-output" number="01" title="スキル中のダメージ" summary={`S${skillIndex}・浮遊${skill.explosionModel.activeDroneCount}体・撃破後に次の敵へ`}
          open={open} onToggle={() => setOpen((value) => !value)} collapsedLabel="表を表示">
          <TableSection id="ggs-operator-conditions" title="オペレーター">
            <tbody>
              <ValueRow label="スキル" value={<label className="calculator-field ggs-skill-select"><span>分析するスキル</span><select id="ggs-skill" aria-label="分析するスキル" value={skillIndex} onChange={(event) => { setSkillIndex(Number(event.target.value)); setAttackOverride(null); setIntervalOverride(null) }}>
                {skills.map((item) => <option key={item.skillIndex} value={item.skillIndex}>S{item.skillIndex} {item.skillName}</option>)}
              </select></label>} />
              <ValueRow label="スキル中の攻撃力" onOpen={input ? () => setDetail({ kind: 'attack' }) : undefined} value={<NumericInput id="ggs-attack" label="スキル中の攻撃力" value={attack} onChange={setAttackOverride} min={0} max={1e6} />} />
              <ValueRow label="攻撃間隔" onOpen={openCondition('attackInterval')} value={<NumericInput id="ggs-interval" label="攻撃間隔" value={interval} onChange={setIntervalOverride} min={0.05} max={300} unit="秒" />} />
              <ValueRow label="スキル持続時間" onOpen={openCondition('duration')} value={skillIndex === 2 ? '永続' : `${format(duration)}秒`} />
              <ValueRow label="浮遊ユニット数 / 本体攻撃" onOpen={openCondition('drones')} value={`${skill.explosionModel.activeDroneCount}体 / ${skillIndex === 3 ? 'なし' : 'あり'}`} />
              <ValueRow label="術耐性の固定無視" onOpen={openCondition('enemyResistance')} value={format(skill.explosionModel.resistanceIgnoreFixed)} />
            </tbody>
          </TableSection>
          <p className="ggs-caption">{skill.skillLevelLabel}・昇進2最大レベル・信頼100・潜在1・モジュールなし。› の行から詳細を表示。</p>
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
          {selectedEnemy && <p className="ggs-caption">図鑑の基礎ステータスを反映。ステージ補正・敵の能力は含めません。各数値は選択後も変更できます。{Object.values(getEnemyCombatInputValues(selectedEnemy)).some((value) => value === '') && '未取得のステータスは空欄です。数値を入力してください。'}</p>}
          <TableSection id="ggs-battle-conditions" title="戦闘・計測条件">
            <tbody>
              {skillIndex === 2 && <ValueRow label="発動後の計測時間" onOpen={openCondition('duration')} value={<NumericInput id="ggs-duration" label="発動後の計測時間" value={viewingDuration} onChange={setViewingDuration} min={0.1} max={300} unit="秒" />} />}
              <ValueRow label="切り替えの追加時間" onOpen={openCondition('switchDelay')} value={<NumericInput id="ggs-delay" label="切り替えの追加時間" value={switchDelay} onChange={setSwitchDelay} min={0} max={5} unit="秒" />} />
              <ValueRow label="計算モデル・参照元" onOpen={input ? () => setDetail({ kind: 'model' }) : undefined} value="一斉着弾・帰還と移動0秒" />
            </tbody>
          </TableSection>
          <details className="ggs-settings">
            <summary>試行回数・抽選設定</summary>
            <TableSection id="ggs-sampling" title="試行条件">
              <tbody>
                <ValueRow label="試行回数" onOpen={openCondition('sampling')} value={<label className="calculator-field"><span>試行回数</span><select id="ggs-trials" aria-label="試行回数" value={trials} onChange={(event) => setTrials(Number(event.target.value))}><option value={1000}>1,000回</option><option value={10000}>10,000回</option><option value={20000}>20,000回</option></select></label>} />
                <ValueRow label="抽選番号" onOpen={openCondition('sampling')} value={seed} />
              </tbody>
            </TableSection>
            <div className="ggs-actions"><button className="button secondary" type="button" onClick={() => { setAttackOverride(null); setIntervalOverride(null); setSwitchDelay('0') }}>攻撃力・間隔・切り替え時間を標準に戻す</button><button className="button secondary" type="button" onClick={() => setSeed((value) => (value + 1) >>> 0)}>別の抽選で再計算</button></div>
          </details>
          {fieldError && <p className="ggs-error" role="alert">{fieldError}</p>}
          <p className="ggs-status" role="status" aria-live="polite">{fieldError ? '入力値を確認してください。' : Number(hp) < 1 ? '敵HPを1以上にすると計算します。' : calculation.error ?? (calculation.result ? `${format(trials, 0)}回の試行平均・${format(duration)}秒間` : '爆発の抽選と撃破を計算中…')}</p>
          {input && calculation.result && <OutputTables result={calculation.result} onOpen={setDetail} />}
        </CollapsibleCalculatorPanel>
        {input && calculation.result && <HistoryTables result={calculation.result} input={input} onOpen={setDetail} />}
        {input && detail && (detail.kind === 'attack' ? <GoldenglowAttackDetailModal skill={skill} attackOverride={attackOverride === null ? null : Number(attackOverride)} onClose={() => setDetail(null)} />
          : detail.kind === 'chart' ? calculation.result && <TimelineChartModal result={calculation.result} onClose={() => setDetail(null)} />
            : <GoldenglowTargetSwitchDetailModal detail={detail} input={input} result={calculation.result} onClose={() => setDetail(null)} />)}
      </>}
    </section>
  )
}

function OutputTables({ result, onOpen }: { result: GoldenglowTargetSwitchResult; onOpen: (detail: PageDetail) => void }) {
  const { mean, baseline } = result
  const metric = (name: Extract<GoldenglowTargetSwitchDetail, { kind: 'metric' }>['metric']) => () => onOpen({ kind: 'metric', metric: name })
  return <>
    <TableSection id="ggs-results" title="ダメージ結果">
      <tbody>
        <ValueRow label="総ダメージ（有効）" value={format(mean.effectiveDamage)} onOpen={metric('effectiveDamage')} />
        <ValueRow label="有効DPS" value={format(mean.effectiveDps)} onOpen={metric('effectiveDps')} />
        <ValueRow label="攻撃ダメージ（残HPの制限前）" value={format(mean.rawDamage)} onOpen={metric('rawDamage')} />
        <ValueRow label="攻撃DPS" value={format(mean.rawDps)} onOpen={metric('rawDps')} />
        <ValueRow label="余剰ダメージ" value={format(mean.overkillDamage)} onOpen={metric('overkillDamage')} />
        <ValueRow label="平均撃破数" value={`${format(mean.kills, 2)}体`} onOpen={metric('kills')} />
        <ValueRow label="平均爆発回数（全浮遊）" value={`${format(mean.explosions, 2)}回`} onOpen={metric('explosions')} />
        <ValueRow label="平均有効DPSの95%信頼区間" value={result.dpsConfidence95 ? `${format(result.dpsConfidence95.lower, 2)}〜${format(result.dpsConfidence95.upper, 2)}` : '—'} onOpen={metric('confidence')} />
      </tbody>
    </TableSection>
    <TableSection id="ggs-comparison" title="同一目標との比較" columns="ggs-comparison-table">
      <thead><tr><th scope="col">計算条件</th><th scope="col">総ダメージ</th><th scope="col">DPS</th></tr></thead>
      <tbody>
        <DetailTableRow label="同一目標・HP無限" onOpen={() => onOpen({ kind: 'comparison', mode: 'baseline' })}><td>{format(baseline.rawDamage)}</td><td>{format(baseline.rawDps)}</td></DetailTableRow>
        <DetailTableRow label="撃破で切り替え・攻撃ダメージ" onOpen={() => onOpen({ kind: 'comparison', mode: 'raw' })}><td>{format(mean.rawDamage)}</td><td>{format(mean.rawDps)}</td></DetailTableRow>
        <DetailTableRow label="撃破で切り替え・有効ダメージ" onOpen={() => onOpen({ kind: 'comparison', mode: 'effective' })}><td>{format(mean.effectiveDamage)}</td><td>{format(mean.effectiveDps)}</td></DetailTableRow>
      </tbody>
    </TableSection>
    <TableSection id="ggs-variation" title="1戦ごとの有効DPSのばらつき" columns="ggs-percentile-table">
      <thead><tr><th scope="col">指標</th><th scope="col">P10</th><th scope="col">中央値 P50</th><th scope="col">P90</th></tr></thead>
      <tbody><DetailTableRow label="有効DPS" detailLabel="有効DPSのばらつきの詳細" onOpen={metric('percentiles')}><td>{format(result.dpsPercentiles.p10)}</td><td>{format(result.dpsPercentiles.p50)}</td><td>{format(result.dpsPercentiles.p90)}</td></DetailTableRow></tbody>
    </TableSection>
  </>
}

function HistoryTables({ result, input, onOpen }: { result: GoldenglowTargetSwitchResult; input: GoldenglowTargetSwitchInput; onOpen: (detail: PageDetail) => void }) {
  const [timelineOpen, setTimelineOpen] = useState(true)
  const [traceOpen, setTraceOpen] = useState(true)
  const [killsOnly, setKillsOnly] = useState(false)
  const [tracePage, setTracePage] = useState(0)
  const sampleRows = result.sample.trace.map((row, index) => ({ row, index })).filter(({ row }) => !killsOnly || row.killed)
  const safePage = Math.min(tracePage, Math.max(0, Math.ceil(sampleRows.length / TRACE_PAGE_SIZE) - 1))
  const visibleRows = sampleRows.slice(safePage * TRACE_PAGE_SIZE, (safePage + 1) * TRACE_PAGE_SIZE)
  return <>
    <CollapsibleCalculatorPanel id="ggs-timeline-panel" number="02" title="時間ごとの累積ダメージ" summary={`${format(result.trials, 0)}回の試行平均`}
      open={timelineOpen} onToggle={() => setTimelineOpen((value) => !value)} collapsedLabel="表を表示">
      <TableSection id="ggs-timeline-conditions" title="集計条件">
        <tbody>
          <ValueRow label="集計範囲" value={`開始から各時刻まで / ${format(input.duration)}秒間`} onOpen={() => onOpen({ kind: 'condition', condition: 'duration' })} />
          <ValueRow label="ダメージ推移のグラフ" value="3条件の推移を表示" onOpen={() => onOpen({ kind: 'chart' })} />
        </tbody>
      </TableSection>
      <TableSection id="ggs-timeline" title="時刻ごとの累積結果" columns="ggs-timeline-table" scroll>
        <thead><tr><th scope="col">経過時間</th><th scope="col">同一目標<br />HP無限</th><th scope="col">切り替え<br />攻撃ダメージ</th><th scope="col">切り替え<br />有効ダメージ</th><th scope="col">平均撃破数</th></tr></thead>
        <tbody>{result.timeline.map((point, index) => <DetailTableRow key={point.time} label={`${format(point.time, 2)}秒`} detailLabel={`${format(point.time, 2)}秒時点の累積ダメージの詳細`} onOpen={() => onOpen({ kind: 'timeline', index })}>
          <td>{format(point.baselineRawDamage)}</td><td>{format(point.rawDamage)}</td><td>{format(point.effectiveDamage)}</td><td>{format(point.kills, 2)}体</td>
        </DetailTableRow>)}</tbody>
      </TableSection>
    </CollapsibleCalculatorPanel>
    <CollapsibleCalculatorPanel id="ggs-trace-panel" number="03" title="攻撃・撃破の履歴" summary="最初の1試行・平均値とは別" open={traceOpen} onToggle={() => setTraceOpen((value) => !value)} collapsedLabel="表を表示">
      <TableSection id="ggs-trace-conditions" title="表示条件">
        <tbody>
          <ValueRow label="対象の試行" value={`抽選番号 ${result.seed} / 最初の1戦`} onOpen={() => onOpen({ kind: 'condition', condition: 'sampling' })} />
          <ValueRow label="表示する攻撃" value={<label className="calculator-field"><span>表示する攻撃</span><select id="ggs-trace-filter" aria-label="表示する攻撃" value={killsOnly ? 'kills' : 'all'} onChange={(event) => { setKillsOnly(event.target.value === 'kills'); setTracePage(0) }}><option value="all">すべての攻撃</option><option value="kills">撃破した回のみ</option></select></label>} />
          <ValueRow label="この試行の有効ダメージ / DPS" value={`${format(result.sample.totals.effectiveDamage)} / ${format(result.sample.totals.effectiveDps)}`} onOpen={() => onOpen({ kind: 'sample' })} />
          <ValueRow label="この試行の撃破数" value={`${result.sample.totals.kills}体`} onOpen={() => onOpen({ kind: 'sample' })} />
        </tbody>
      </TableSection>
      <TableSection id="ggs-trace" title="攻撃ごとの結果" columns="ggs-trace-table" scroll>
        <thead><tr><th scope="col">攻撃回数</th><th scope="col">時刻</th><th scope="col">敵</th><th scope="col">攻撃前HP</th><th scope="col">有効ダメージ</th><th scope="col">余剰ダメージ</th><th scope="col">残HP / 結果</th></tr></thead>
        <tbody>{visibleRows.length === 0 ? <tr><td colSpan={7}>{killsOnly ? 'この試行では撃破していません。' : '計測時間内に攻撃は発生しません。'}</td></tr> : visibleRows.map(({ row, index }) => <DetailTableRow key={row.time} label={`${index + 1}回目`} detailLabel={`${index + 1}回目・敵${row.targetNumber}への攻撃の詳細`} onOpen={() => onOpen({ kind: 'trace', index })} className={row.killed ? 'ggs-kill-row' : ''}>
          <td>{format(row.time, 3)}秒</td><td>#{row.targetNumber}</td><td>{format(row.hpBefore)}</td><td>{format(row.effectiveDamage)}</td><td>{format(row.overkillDamage)}</td><td>{row.killed ? '撃破 → 次の敵' : format(row.hpAfter)}</td>
        </DetailTableRow>)}</tbody>
      </TableSection>
      {sampleRows.length > TRACE_PAGE_SIZE && <div className="ggs-trace-pager"><button className="button secondary" type="button" disabled={safePage === 0} onClick={() => setTracePage(safePage - 1)}>前の100回</button><span>{safePage * TRACE_PAGE_SIZE + 1}〜{Math.min((safePage + 1) * TRACE_PAGE_SIZE, sampleRows.length)} / {format(sampleRows.length, 0)}回</span><button className="button secondary" type="button" disabled={(safePage + 1) * TRACE_PAGE_SIZE >= sampleRows.length} onClick={() => setTracePage(safePage + 1)}>次の100回</button></div>}
    </CollapsibleCalculatorPanel>
  </>
}

function TimelineChartModal({ result, onClose }: { result: GoldenglowTargetSwitchResult; onClose: () => void }) {
  const [pointIndex, setPointIndex] = useState(result.timeline.length - 1)
  const point = result.timeline[pointIndex]
  const maxDamage = Math.max(1, ...result.timeline.map((row) => row.baselineRawDamage))
  const x = (time: number) => 66 + time / result.duration * 740
  const y = (damage: number) => 221 - damage / maxDamage * 196
  const path = (key: 'effectiveDamage' | 'rawDamage' | 'baselineRawDamage') => result.timeline.map((row, index) => `${index === 0 ? 'M' : 'L'}${x(row.time)},${y(row[key])}`).join(' ')
  return <GoldenglowDetailModal title="累積ダメージの推移" closeLabel="ダメージ推移のグラフを閉じる" onClose={onClose}>
    <div className="ggs-chart-content">
      <p className="ggs-caption">{format(result.trials, 0)}回の試行平均 / {format(result.duration)}秒間</p>
      <div className="ggs-legend"><span className="ggs-legend-effective">有効ダメージ</span><span className="ggs-legend-raw">攻撃ダメージ</span><span className="ggs-legend-baseline">同一目標・HP無限</span></div>
      <svg className="ggs-chart" viewBox="0 0 830 256" role="img" aria-label="3条件の平均累積ダメージの推移">
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => <g key={ratio}><line x1={66} x2={806} y1={y(maxDamage * ratio)} y2={y(maxDamage * ratio)} className="ggs-chart-grid" /><text x={57} y={y(maxDamage * ratio) + 4} textAnchor="end">{axisFormatter.format(maxDamage * ratio)}</text></g>)}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => <text key={ratio} x={x(result.duration * ratio)} y={244} textAnchor="middle">{format(result.duration * ratio)}秒</text>)}
        <path d={path('baselineRawDamage')} className="ggs-line-baseline" /><path d={path('rawDamage')} className="ggs-line-raw" /><path d={path('effectiveDamage')} className="ggs-line-effective" />
        <line x1={x(point.time)} x2={x(point.time)} y1={21} y2={221} className="ggs-chart-cursor" />
      </svg>
      <label className="ggs-time-label" htmlFor="ggs-time">経過時間 <strong>{format(point.time, 2)}秒</strong></label>
      <input className="ggs-time-slider" id="ggs-time" type="range" min={0} max={result.timeline.length - 1} value={pointIndex} onChange={(event) => setPointIndex(Number(event.target.value))} aria-valuetext={`${format(point.time, 2)}秒、有効ダメージ${format(point.effectiveDamage)}`} />
      <TableSection id="ggs-chart-values" title={`${format(point.time, 2)}秒時点の累積結果`}><tbody><ValueRow label="有効ダメージ" value={format(point.effectiveDamage)} /><ValueRow label="攻撃ダメージ" value={format(point.rawDamage)} /><ValueRow label="同一目標・HP無限" value={format(point.baselineRawDamage)} /><ValueRow label="平均撃破数" value={`${format(point.kills, 2)}体`} /></tbody></TableSection>
    </div>
  </GoldenglowDetailModal>
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

function TableSection({ id, title, children, columns, scroll = false }: { id: string; title: string; children: ReactNode; columns?: string; scroll?: boolean }) {
  return <><h3 className="gg-table-title" id={`${id}-title`}>{title}</h3><div className={`gg-probability-table-wrap ${scroll ? 'ggs-scroll-table' : 'gg-value-table-wrap'}`} tabIndex={scroll ? 0 : undefined} role={scroll ? 'region' : undefined} aria-label={scroll ? title : undefined}>
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
