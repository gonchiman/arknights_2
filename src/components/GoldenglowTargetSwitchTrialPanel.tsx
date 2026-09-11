import { useRef, useState } from 'react'
import { simulateGoldenglowTargetSwitchTrial, type GoldenglowTargetSwitchInput, type GoldenglowTargetSwitchResult, type GoldenglowTargetSwitchTraceRow, type GoldenglowTargetSwitchTrial } from '../lib/goldenglowTargetSwitch'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import type { GoldenglowTargetSwitchDetail } from './GoldenglowTargetSwitchDetailModal'
import './GoldenglowTargetSwitchTrialPanel.css'

const numberFormat = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 })
const format = (value: number) => numberFormat.format(value)
const PAGE_SIZE = 100

export function GoldenglowTargetSwitchTrialPanel({ input, result, status, onOpen }: {
  input: GoldenglowTargetSwitchInput | null
  result: GoldenglowTargetSwitchResult | null
  status: string | null
  onOpen: (detail: GoldenglowTargetSwitchDetail) => void
}) {
  return <CollapsibleCalculatorPanel id="ggs-trial-panel" number="05" title="シミュレーション1回分"
    summary="1回分の攻撃と撃破の記録" collapsedLabel="履歴を表示">
    {input && result
      ? <TrialOutput key={`${result.seed}:${result.duration}:${input.enemyHp}:${input.enemyResistance}`} input={input} result={result} onOpen={onOpen} />
      : <p className="ggs-status" role="status">{status ?? '計算条件を入力すると表示します。'}</p>}
  </CollapsibleCalculatorPanel>
}

function TrialOutput({ input, result, onOpen }: {
  input: GoldenglowTargetSwitchInput
  result: GoldenglowTargetSwitchResult
  onOpen: (detail: GoldenglowTargetSwitchDetail) => void
}) {
  const [page, setPage] = useState(0)
  const [rerun, setRerun] = useState<{ source: GoldenglowTargetSwitchResult; seed: number; trial: GoldenglowTargetSwitchTrial } | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const simulation = rerun?.source === result ? rerun : { seed: result.seed, trial: result.sample }
  const { trace } = simulation.trial
  const resimulate = () => {
    const seed = (simulation.seed + 1) >>> 0
    const trial = simulateGoldenglowTargetSwitchTrial({ ...input, trials: 1, seed })
    setRerun({ source: result, seed, trial })
    setPage(0)
  }
  const openAttack = (index: number) => onOpen({ kind: 'trace', index, seed: simulation.seed, trial: simulation.trial })
  const rows = trace.map((row, index) => ({ row, index }))
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const visible = rows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)
  const changePage = (nextPage: number) => {
    setPage(nextPage)
    headingRef.current?.scrollIntoView({ block: 'center', inline: 'nearest' })
  }
  return <>
    <div className="ggs-trial-toolbar">
      <h3 id="ggs-trial-history-title" ref={headingRef} className="gg-table-title ggs-trial-history-heading">攻撃履歴</h3>
      <button type="button" className="button secondary" onClick={resimulate}>もう一度実行</button>
    </div>
    <div className="ggs-trial-scroll" tabIndex={0} role="region" aria-labelledby="ggs-trial-history-title">
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
          : visible.map(({ row, index }) => <AttackRows key={index} input={input} row={row} index={index} onOpen={openAttack} />)}
      </table>
    </div>
    {pageCount > 1 && <div className="ggs-trial-pagination">
      <button type="button" className="button secondary" disabled={safePage === 0} onClick={() => changePage(safePage - 1)}>前の100件</button>
      <span>{safePage * PAGE_SIZE + 1}〜{Math.min((safePage + 1) * PAGE_SIZE, rows.length)} / {format(rows.length)}件</span>
      <button type="button" className="button secondary" disabled={safePage >= pageCount - 1} onClick={() => changePage(safePage + 1)}>次の100件</button>
    </div>}
  </>
}

function AttackRows({ input, row, index, onOpen }: {
  input: GoldenglowTargetSwitchInput
  row: GoldenglowTargetSwitchTraceRow
  index: number
  onOpen: (index: number) => void
}) {
  const actors = [
    {
      id: 'body', name: '本体',
      scale: input.skillIndex === 3 ? '—' : '100%', damage: row.bodyDamage,
      misses: '—', exploded: false,
    },
    ...row.drones.map((drone) => ({
      id: `drone-${drone.droneNumber}`, name: `浮遊 #${drone.droneNumber}`,
      scale: `${format(drone.exploded ? input.model.attackScale * 100 : drone.normalScalePercent)}%`,
      damage: drone.damage,
      misses: format(drone.missesAfter), exploded: drone.exploded,
    })),
  ]
  const groupSize = actors.length
  const cumulativeKills = row.targetNumber - 1 + (row.killed ? 1 : 0)
  return <tbody className="ggs-trial-volley" data-attack={index + 1}>
    {actors.map((actor, actorIndex) => <tr key={actor.id} data-actor={actor.id}
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
      <td>{actor.scale}</td><td>{format(actor.damage)}</td><td>{actor.misses}</td>
      {actorIndex === 0 && <>
        <td rowSpan={groupSize} className="ggs-trial-shared ggs-trial-total">{format(row.rawDamage)}</td>
        <td rowSpan={groupSize} className="ggs-trial-shared ggs-trial-target">{format(row.hpAfter)}</td>
        <td rowSpan={groupSize} className="ggs-trial-shared ggs-trial-overkill">{format(row.overkillDamage)}</td>
        <td rowSpan={groupSize} className="ggs-trial-shared ggs-trial-kills">{format(cumulativeKills)}</td>
      </>}
    </tr>)}
  </tbody>
}
