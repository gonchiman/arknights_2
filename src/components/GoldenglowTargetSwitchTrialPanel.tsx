import { useEffect, useMemo, useRef, useState } from 'react'
import { simulateGoldenglowTargetSwitchTrial, type GoldenglowTargetSwitchInput, type GoldenglowTargetSwitchResult, type GoldenglowTargetSwitchTraceRow, type GoldenglowTargetSwitchTrial } from '../lib/goldenglowTargetSwitch'
import { buildGoldenglowTargetSwitchHistoryRows, groupGoldenglowTargetSwitchHistoryTargets, type GoldenglowTargetSwitchHistoryEvent, type GoldenglowTargetSwitchHistoryRow, type GoldenglowTargetSwitchHistoryTarget } from '../lib/goldenglowTargetSwitchHistory'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import type { GoldenglowTargetSwitchDetail } from './GoldenglowTargetSwitchDetailModal'
import './GoldenglowTargetSwitchTrialPanel.css'

const numberFormat = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 })
const integerFormat = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 })
const format = (value: number) => numberFormat.format(value)
const timeFormat = new Intl.NumberFormat('ja-JP', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
const PAGE_SIZE = 100

export function GoldenglowTargetSwitchTrialPanel({ input, result, status, showDecimals, onOpen, onSwitchDelayChange }: {
  input: GoldenglowTargetSwitchInput | null
  result: GoldenglowTargetSwitchResult | null
  status: string | null
  showDecimals: boolean
  onOpen: (detail: GoldenglowTargetSwitchDetail) => void
  onSwitchDelayChange: (delay: number, seed: number) => void
}) {
  const pendingDelayFocus = useRef<number | null>(null)
  useEffect(() => {
    const delay = pendingDelayFocus.current
    if (delay === null || !result || input?.switchDelay !== delay) return
    pendingDelayFocus.current = null
    // The worker's pending state temporarily removes the history controls.
    // Restore the chosen control unless the user has already focused elsewhere.
    if (!document.activeElement || document.activeElement === document.body) {
      document.getElementById(`ggs-trial-delay-${delay}`)?.focus()
    }
  }, [input, result])
  return <CollapsibleCalculatorPanel id="ggs-trial-panel" number="05" title="シミュレーション1回分"
    summary="1回分の攻撃と撃破の記録" collapsedLabel="履歴を表示">
    {input && result
      ? <TrialOutput key={`${result.seed}:${result.duration}:${input.enemyHp}:${input.enemyResistance}:${Boolean(input.retargetRemainingDrones)}`} input={input} result={result} showDecimals={showDecimals} onOpen={onOpen}
          onSwitchDelayChange={(delay, seed) => { pendingDelayFocus.current = delay; onSwitchDelayChange(delay, seed) }} />
      : <p className="ggs-status" role="status">{status ?? '計算条件を入力すると表示します。'}</p>}
  </CollapsibleCalculatorPanel>
}

function TrialOutput({ input, result, showDecimals, onOpen, onSwitchDelayChange }: {
  input: GoldenglowTargetSwitchInput
  result: GoldenglowTargetSwitchResult
  showDecimals: boolean
  onOpen: (detail: GoldenglowTargetSwitchDetail) => void
  onSwitchDelayChange: (delay: number, seed: number) => void
}) {
  const [page, setPage] = useState(0)
  const [rerun, setRerun] = useState<{ source: GoldenglowTargetSwitchResult; seed: number; trial: GoldenglowTargetSwitchTrial } | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const simulation = rerun?.source === result ? rerun : { seed: result.seed, trial: result.sample }
  const { trace } = simulation.trial
  const individual = Boolean(input.retargetRemainingDrones)
  const history = useMemo(() => individual ? buildGoldenglowTargetSwitchHistoryRows(simulation.trial) : [], [individual, simulation.trial])
  const resimulate = () => {
    const seed = (simulation.seed + 1) >>> 0
    const trial = simulateGoldenglowTargetSwitchTrial({ ...input, trials: 1, seed })
    setRerun({ source: result, seed, trial })
    setPage(0)
  }
  const openAttack = (index: number) => onOpen({ kind: 'trace', index, seed: simulation.seed, trial: simulation.trial })
  const openEvent = (event: GoldenglowTargetSwitchHistoryEvent) => onOpen(event.kind === 'attack'
    ? { kind: 'attack', entry: event.entry, seed: simulation.seed }
    : { kind: 'delay', entry: event, seed: simulation.seed })
  const rows = trace.map((row, index) => ({ row, index }))
  const rowCount = individual ? history.length : rows.length
  const pageCount = Math.max(1, Math.ceil(rowCount / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const visible = rows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)
  const changePage = (nextPage: number) => {
    setPage(nextPage)
    headingRef.current?.scrollIntoView({ block: 'center', inline: 'nearest' })
  }
  return <>
    <div className="ggs-trial-toolbar">
      <h3 id="ggs-trial-history-title" ref={headingRef} className="gg-table-title ggs-trial-history-heading">{individual ? '攻撃と切り替え' : '攻撃履歴'}</h3>
      <div className="ggs-trial-actions">
        {individual && <div className="ggs-trial-delay" role="group" aria-label="攻撃履歴の切り替え時間">
          <span>切り替え時間 {format(input.switchDelay)}秒</span>
          <div className="ggs-trial-delay-options">{[0, 0.1].map((delay) => (
            <button type="button" key={delay} id={`ggs-trial-delay-${delay}`} aria-pressed={input.switchDelay === delay}
              onClick={() => { if (input.switchDelay !== delay) onSwitchDelayChange(delay, simulation.seed) }}>{delay}秒</button>
          ))}</div>
        </div>}
        <button type="button" className="button secondary" onClick={resimulate}>もう一度実行</button>
      </div>
    </div>
    {individual ? <GoldenglowTargetSwitchHistoryTable history={history} input={input} start={safePage * PAGE_SIZE} showDecimals={showDecimals} onOpen={openEvent}
        onOpenHp={(target) => onOpen({ kind: 'targetHp', target, seed: simulation.seed })} />
      : <div className="ggs-trial-scroll" tabIndex={0} role="region" aria-labelledby="ggs-trial-history-title">
      <table className="ggs-trial-table" aria-labelledby="ggs-trial-history-title">
        <caption className="visually-hidden">本体と各浮遊ユニットを個別の行で表示します。同じ攻撃回は同時に着弾し、合計ダメージ・攻撃後の敵の残りHP・余剰ダメージ・累計撃破数を共有します。</caption>
        <thead><tr>
          <th scope="col" className="ggs-trial-attack">攻撃・時刻</th>
          <th scope="col">攻撃者</th><th scope="col" className="ggs-trial-explosion-status">自爆</th>
          <th scope="col">適用倍率</th><th scope="col">個別ダメージ</th>
          <th scope="col">連続不発回数</th>
          <th scope="col">合計ダメージ</th><th scope="col">攻撃後の敵の残りHP</th><th scope="col">余剰ダメージ</th>
          <th scope="col">撃破数</th>
        </tr></thead>
        {visible.length === 0 ? <tbody><tr><td colSpan={10}>計測時間内に攻撃は発生しません。</td></tr></tbody>
          : visible.map(({ row, index }) => <AttackRows key={index} input={input} row={row} index={index} showDecimals={showDecimals} onOpen={openAttack} />)}
      </table>
    </div>}
    {pageCount > 1 && <div className="ggs-trial-pagination">
      <button type="button" className="button secondary" disabled={safePage === 0} onClick={() => changePage(safePage - 1)}>前の100{individual ? '行' : '件'}</button>
      <span>{safePage * PAGE_SIZE + 1}〜{Math.min((safePage + 1) * PAGE_SIZE, rowCount)} / {format(rowCount)}{individual ? '行' : '件'}</span>
      <button type="button" className="button secondary" disabled={safePage >= pageCount - 1} onClick={() => changePage(safePage + 1)}>次の100{individual ? '行' : '件'}</button>
    </div>}
  </>
}

export function GoldenglowTargetSwitchHistoryTable({ history, input, start, showDecimals, onOpen, onOpenHp, pageSize = PAGE_SIZE, headingId = 'ggs-trial-history-title', showHelp = true, compact = false }: {
  history: readonly GoldenglowTargetSwitchHistoryRow[]
  input: GoldenglowTargetSwitchInput
  start: number
  showDecimals: boolean
  onOpen: (event: GoldenglowTargetSwitchHistoryEvent) => void
  onOpenHp: (target: GoldenglowTargetSwitchHistoryTarget) => void
  pageSize?: number
  headingId?: string
  showHelp?: boolean
  compact?: boolean
}) {
  const formatOutput = (value: number) => (showDecimals ? numberFormat : integerFormat).format(value)
  const actors = [
    ...(input.skillIndex === 3 ? [] : [{ key: 'body', name: '本体' }]),
    ...Array.from({ length: input.model.activeDroneCount }, (_, index) => ({ key: `drone-${index + 1}`, name: `浮遊${String.fromCharCode(0x2460 + index)}` })),
  ]
  return <>
    <div className={`ggs-trial-scroll${compact ? ' ggs-trial-scroll--compact' : ''}`} tabIndex={0} role="region" aria-labelledby={headingId}>
    <table className={`ggs-trial-table ggs-trial-unit-table${compact ? ' ggs-trial-unit-table--compact' : ''}`} style={compact ? undefined : { minWidth: 254 + actors.length * 132 }} aria-labelledby={headingId}>
      <caption className="visually-hidden">時刻を縦、攻撃者を横に表示します。同時刻の攻撃は左から順に処理するモデルです。切り替えで攻撃予定が遅くなった箇所に延期を表示し、記録のないセルは横線にします。</caption>
      <colgroup><col className="ggs-trial-time-column" />{actors.map((actor) => <col key={actor.key} />)}<col className="ggs-trial-hp-column" /></colgroup>
      <thead><tr><th scope="col" className="ggs-trial-attack">時刻 (s)</th>{actors.map((actor) => <th key={actor.key} scope="col">{actor.name}</th>)}<th scope="col">敵HP<span className="ggs-trial-hp-heading">攻撃前 → 攻撃後</span></th></tr></thead>
      <tbody>
        {history.length === 0 ? <tr><td colSpan={actors.length + 2}>計測時間内に攻撃は発生しません。</td></tr>
          : history.slice(start, start + pageSize).map((row) => {
            const time = timeFormat.format(row.time)
            const targets = groupGoldenglowTargetSwitchHistoryTargets(row)
            return <tr key={row.traceIndex}>
              <th scope="row" className="ggs-trial-attack">{time}</th>
              {actors.map((actor) => {
                const events = row.events.filter((event) => {
                  const source = event.kind === 'attack' ? event.entry.attack : event.delay
                  return (source.actor === 'body' ? 'body' : `drone-${source.droneNumber}`) === actor.key
                })
                return <td key={actor.key} data-actor={actor.key} onClick={(event) => {
                  if (events.length !== 1 || event.target instanceof Element && event.target.closest('button')) return
                  event.currentTarget.querySelector('button')?.focus({ preventScroll: true })
                  onOpen(events[0])
                }}>
                  {events.length === 0 ? <span className="ggs-trial-empty" aria-label="この時刻の攻撃・延期記録なし">—</span>
                    : events.map((event) => event.kind === 'delay'
                      ? <button type="button" key={`delay-${event.delayIndex}`} className="ggs-trial-event ggs-trial-delay-event" aria-haspopup="dialog"
                          aria-label={`${time}秒 ${actor.name} 敵${event.delay.nextTargetNumber}へ切り替えで${timeFormat.format(event.delay.nextAttackTime)}秒へ延期。詳細を表示`}
                          onClick={() => onOpen(event)}>
                          {compact ? <span className="ggs-trial-event-title">敵{event.delay.nextTargetNumber}へ 延期 → {timeFormat.format(event.delay.nextAttackTime)} s</span> : <>
                          <span className="ggs-trial-event-title">切替で延期</span>
                          <span>{timeFormat.format(event.delay.nextAttackTime)} s へ</span>
                          <span className="ggs-trial-event-value">＋{timeFormat.format(event.delay.addedDelay)} s</span>
                          </>}
                        </button>
                      : <button type="button" key={`attack-${event.entry.attackIndex}`} className="ggs-trial-event" aria-haspopup="dialog"
                          aria-label={`${time}秒 ${actor.name} ${event.entry.actorAttackNumber}回目の攻撃の詳細${event.entry.attack.killed ? '・撃破' : ''}`}
                          onClick={() => onOpen(event)}>
                          <span className="ggs-trial-event-title"><span>敵{event.entry.attack.targetNumber}</span>
                            <span>{event.entry.drone?.exploded ? '自爆' : '攻撃'}</span>
                            {event.entry.attack.killed && <span className="ggs-trial-kill-label">撃破</span>}
                          </span>
                        </button>)}
                </td>
              })}
              <td className="ggs-trial-hp-cell" onClick={(event) => {
                if (targets.length !== 1 || event.target instanceof Element && event.target.closest('button')) return
                event.currentTarget.querySelector('button')?.focus({ preventScroll: true })
                onOpenHp(targets[0])
              }}>
                {targets.length === 0 ? <span className="ggs-trial-empty" aria-label="この時刻に攻撃された敵なし">—</span>
                  : targets.map((target) => <button type="button" key={target.targetNumber} className="ggs-trial-event ggs-trial-hp-event" aria-haspopup="dialog"
                    aria-label={`${time}秒 敵${target.targetNumber}のHP変化の詳細`} onClick={() => onOpenHp(target)}>
                    <span className="ggs-trial-event-title">敵{target.targetNumber}<span aria-hidden="true">›</span></span>
                    {compact ? <span className="ggs-trial-hp-values"><span>{formatOutput(target.hpBefore)} → {formatOutput(target.hpAfter)}</span></span>
                      : <span className="ggs-trial-hp-values"><span>{formatOutput(target.hpBefore)}</span><span>→</span><span>{formatOutput(target.hpAfter)}</span></span>}
                  </button>)}
              </td>
            </tr>
          })}
      </tbody>
    </table>
    </div>
    {showHelp && <details className="ggs-trial-table-help"><summary>表の見方</summary>
      <p>同時刻の攻撃は左から順に処理するモデルです。色付きのセルは、切り替えで攻撃予定が遅くなった箇所です。「—」はその時刻の攻撃・延期記録なし。各セルを押すと詳細を確認できます。</p>
      <p>敵HPは、その時刻に攻撃された敵ごとの「最初の攻撃前 → 最後の攻撃後」です。HP欄を押すと各攻撃後の変化を確認できます。0秒設定で同時刻に複数の敵を攻撃した場合も、敵ごとに表示します。</p>
    </details>}
  </>
}

function AttackRows({ input, row, index, showDecimals, onOpen }: {
  input: GoldenglowTargetSwitchInput
  row: GoldenglowTargetSwitchTraceRow
  index: number
  showDecimals: boolean
  onOpen: (index: number) => void
}) {
  const formatOutput = (value: number) => (showDecimals ? numberFormat : integerFormat).format(value)
  const actors = [
    ...(input.skillIndex === 3 ? [] : [{
      id: 'body', name: '本体',
      scale: '100%', damage: row.bodyDamage,
      misses: '—', exploded: false,
    }]),
    ...row.drones.map((drone) => ({
      id: `drone-${drone.droneNumber}`, name: `浮遊 #${drone.droneNumber}`,
      scale: `${format(drone.exploded ? input.model.attackScale * 100 : drone.normalScalePercent)}%`,
      damage: drone.damage,
      misses: format(drone.missesAfter), exploded: drone.exploded,
    })),
  ]
  const groupSize = actors.length
  const cumulativeKills = row.nextTargetNumber - 1
  return <tbody className="ggs-trial-volley" data-attack={index + 1}>
    {actors.map((actor, actorIndex) => {
      return <tr key={actor.id} data-actor={actor.id}
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest('button')) return
        event.currentTarget.closest('tbody')?.querySelector('button')?.focus({ preventScroll: true })
        onOpen(index)
      }}>
      {actorIndex === 0 &&
        <th scope="rowgroup" rowSpan={groupSize} className="ggs-trial-attack ggs-trial-shared">
          <button type="button" className="ggs-trial-detail-link" aria-label={`${index + 1}回目の攻撃の詳細`} aria-haspopup="dialog" onClick={() => onOpen(index)}>{index + 1}回目 ›</button>
          <span className="ggs-trial-secondary">{format(row.time)}秒</span>
        </th>
      }
      <th scope="row" className="ggs-trial-actor">{actor.name}</th>
      <td className={`ggs-trial-explosion-status${actor.exploded ? ' ggs-trial-explosion' : ''}`}>
        {actor.id === 'body' ? '—' : actor.exploded ? '発動' : '不発'}
      </td>
      <td>{actor.scale}</td><td>{formatOutput(actor.damage)}</td><td>{actor.misses}</td>
      {actorIndex === 0 && <td rowSpan={groupSize} className="ggs-trial-shared ggs-trial-total">{formatOutput(row.rawDamage)}</td>}
      {actorIndex === 0 && <>
        <td rowSpan={groupSize} className="ggs-trial-shared ggs-trial-target">{formatOutput(row.hpAfter)}</td>
        <td rowSpan={groupSize} className="ggs-trial-shared ggs-trial-overkill">{formatOutput(row.overkillDamage)}</td>
      </>}
      {actorIndex === 0 && <td rowSpan={groupSize} className="ggs-trial-shared ggs-trial-kills">{format(cumulativeKills)}</td>}
    </tr>})}
  </tbody>
}
