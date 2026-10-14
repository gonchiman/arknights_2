import { useId, useState } from 'react'
import type { SurtrTotalDamageModel, SurtrTotalDamageResult } from '../lib/surtrTotalDamage'
import { HelpPopover } from './HelpPopover'
import './SurtrTotalDamageDetail.css'

export interface SurtrTotalDamageDetailComparison {
  id: string
  label: string
  color: string
  model: SurtrTotalDamageModel
  result: SurtrTotalDamageResult
}

interface Props {
  time: number
  resistance?: number
  initialSeriesId?: string
  comparisons: readonly SurtrTotalDamageDetailComparison[]
  precision: number
  onClose: () => void
}

const seconds = (value: number) => `${Number(value.toFixed(3)).toLocaleString('ja-JP', { maximumFractionDigits: 3 })} s`

function AttackEventsTable({ comparison, nearby, start, end, precision }: {
  comparison: SurtrTotalDamageDetailComparison
  nearby: boolean
  start: number
  end: number
  precision: number
}) {
  const attacks = comparison.result.attacks.map((attack, index) => ({ ...attack, number: index + 1 }))
    .filter(attack => !nearby || (attack.hitTime >= start && attack.startTime <= end))
  const number = (value: number) => value.toLocaleString('ja-JP', { minimumFractionDigits: precision, maximumFractionDigits: precision })
  return <div className="surtr-s3-table-wrap">
    <table className="surtr-s3-table surtr-total-damage-event-table" aria-label={`${comparison.label}の${nearby ? '素質２発動前後' : 'すべて'}の命中詳細`}>
      <thead><tr>
        <th scope="col">攻撃</th><th scope="col">開始</th><th scope="col">命中</th>
        <th scope="col">命中した区間</th><th scope="col">開始済みの攻撃</th><th scope="col">ダメージ</th>
      </tr></thead>
      <tbody>{attacks.map(attack => <tr key={attack.number} className={attack.carriedImpact ? 'surtr-total-damage-carried-row' : undefined}>
        <th scope="row">{attack.number} 回目</th>
        <td>{seconds(attack.startTime)}</td><td>{seconds(attack.hitTime)}</td>
        <td>{attack.phase === 'before' ? '発動前' : '発動中'}</td>
        <td>{attack.carriedImpact ? '発動前に開始' : '—'}</td>
        <td>{number(attack.damage)}</td>
      </tr>)}</tbody>
    </table>
    {!attacks.length && <p className="surtr-s3-status surtr-total-damage-empty">この区間に命中した攻撃はありません。</p>}
  </div>
}

function AttackTimeline({ comparison, start, end }: {
  comparison: SurtrTotalDamageDetailComparison
  start: number
  end: number
}) {
  const titleId = useId()
  const descriptionId = useId()
  const { result, color } = comparison
  const width = 880
  const left = 80
  const right = 22
  const chartWidth = width - left - right
  const x = (time: number) => left + (time - start) / (end - start) * chartWidth
  const triggerX = x(result.remnantActivationTime)
  const visible = result.attacks.filter(attack => attack.hitTime >= start && attack.startTime <= end)
  const ticks = Array.from({ length: 6 }, (_, index) => start + (end - start) * index / 5)
  return <div className="surtr-total-damage-timeline-scroll">
    <svg className="surtr-total-damage-timeline" viewBox={`0 0 ${width} 188`} role="img" aria-labelledby={`${titleId} ${descriptionId}`}>
      <title id={titleId}>{comparison.label}の素質２発動前後の攻撃時刻</title>
      <desc id={descriptionId}>横軸はS3発動からの経過時間。上段は攻撃開始、下段は命中。ひし形は素質２発動前に開始し、発動中に命中した攻撃。</desc>
      <rect x={triggerX} y={30} width={Math.max(0, width - right - triggerX)} height={106} className="surtr-total-damage-timeline-phase" />
      {triggerX - left >= 60 && <text x={left + 4} y={20} className="surtr-total-damage-timeline-phase-label">発動前</text>}
      <text x={Math.min(width - right - 36, triggerX + 8)} y={20} className="surtr-total-damage-timeline-phase-label">発動中</text>
      <line x1={triggerX} x2={triggerX} y1={30} y2={136} className="surtr-total-damage-timeline-trigger" />
      <text x={triggerX} y={154} textAnchor="middle" className="surtr-total-damage-timeline-trigger-label">{seconds(result.remnantActivationTime)}</text>
      <text x={12} y={66} className="surtr-total-damage-timeline-label">攻撃開始</text>
      <text x={12} y={113} className="surtr-total-damage-timeline-label">命中</text>
      <line x1={left} x2={width - right} y1={62} y2={62} className="surtr-total-damage-timeline-track" />
      <line x1={left} x2={width - right} y1={109} y2={109} className="surtr-total-damage-timeline-track" />
      {visible.map((attack, index) => <g key={index}>
        <line x1={Math.max(left, x(attack.startTime))} y1={62} x2={Math.min(width - right, x(attack.hitTime))} y2={109}
          stroke={color} className="surtr-total-damage-timeline-connection" />
        {attack.startTime >= start && attack.startTime <= end && <circle cx={x(attack.startTime)} cy={62} r={5} fill="var(--surface)" stroke={color} strokeWidth={2}>
          <title>攻撃開始 {seconds(attack.startTime)}</title>
        </circle>}
        {attack.hitTime >= start && attack.hitTime <= end && (attack.carriedImpact
          ? <path d={`M ${x(attack.hitTime)} 101 l 8 8 l -8 8 l -8 -8 Z`} fill={color}>
            <title>発動前に開始した攻撃の命中 {seconds(attack.hitTime)}</title>
          </path>
          : <circle cx={x(attack.hitTime)} cy={109} r={5} fill={color}>
            <title>命中 {seconds(attack.hitTime)}</title>
          </circle>)}
      </g>)}
      {ticks.map((tick, index) => <g key={index}>
        <line x1={x(tick)} x2={x(tick)} y1={130} y2={136} className="surtr-total-damage-timeline-track" />
        <text x={x(tick)} y={176} textAnchor={index === 0 ? 'start' : index === ticks.length - 1 ? 'end' : 'middle'} className="surtr-total-damage-timeline-tick">
          {Number(tick.toFixed(2)).toLocaleString('ja-JP', { maximumFractionDigits: 2 })}
        </text>
      </g>)}
    </svg>
  </div>
}

export function SurtrTotalDamageDetail({ time, resistance, initialSeriesId, comparisons, precision, onClose }: Props) {
  const titleId = useId()
  const [selectedId, setSelectedId] = useState(initialSeriesId ?? comparisons[0]?.id ?? '')
  const selected = comparisons.find(item => item.id === selectedId) ?? comparisons[0]
  if (!selected) return null
  const number = (value: number) => value.toLocaleString('ja-JP', { minimumFractionDigits: precision, maximumFractionDigits: precision })
  const interval = Math.max(selected.model.timing.attackIntervalBefore, selected.model.timing.attackIntervalAfter)
  const start = Math.max(0, time - 2 * interval)
  const end = Math.max(start + 1, Math.min(selected.result.retreatTime, time + 2 * interval))
  return <section className="surtr-total-damage-detail" aria-labelledby={titleId}>
    <header className="surtr-s3-result-heading">
      <h3 id={titleId}>素質２発動 {seconds(time)}{resistance !== undefined ? `・術耐性 ${resistance}` : ''} の内訳</h3>
      <button type="button" className="button secondary" onClick={onClose}>内訳を閉じる</button>
    </header>
    <div className="surtr-total-damage-detail-body">
      <div className="surtr-s3-table-wrap">
        <table className="surtr-s3-table surtr-total-damage-summary-table" aria-label="MOD別の命中回数と総ダメージの内訳">
          <thead>
            <tr><th rowSpan={2} scope="col">MOD</th><th colSpan={2} scope="colgroup">素質２発動前</th><th colSpan={2} scope="colgroup">素質２発動中</th><th colSpan={2} scope="colgroup">合計</th></tr>
            <tr>{['before', 'remnant', 'total'].map(phase => <FragmentColumns key={phase} />)}</tr>
          </thead>
          <tbody>{comparisons.map(item => <tr key={item.id}>
            <th scope="row"><span className="surtr-s3-column-label"><i aria-hidden="true" style={{ backgroundColor: item.color }} />{item.label}</span></th>
            <td>{item.result.hitsBefore}</td><td>{number(item.result.damageBefore)}</td>
            <td>{item.result.hitsRemnant}</td><td>{number(item.result.damageRemnant)}</td>
            <td>{item.result.totalHits}</td><td>{number(item.result.totalDamage)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="surtr-total-damage-detail-controls">
        <label className="surtr-s3-output-control"><span>命中詳細</span>
          <select value={selected.id} onChange={event => setSelectedId(event.target.value)} aria-label="命中詳細のMOD">
            {comparisons.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <HelpPopover label="命中詳細の見方" triggerText="見方">
          <p>時刻はS3発動を0秒としています。破線が素質２の発動時刻です。○は攻撃開始、●は命中、◆は発動前に開始し発動中に命中した攻撃です。</p>
          <p>発動前後の区分は命中時刻で決まります。退場後の命中は計算に含みません。</p>
        </HelpPopover>
        <span className="surtr-total-damage-retreat">退場 {seconds(selected.result.retreatTime)}</span>
      </div>
      <AttackTimeline comparison={selected} start={start} end={end} />
      <div className="surtr-total-damage-timeline-legend" aria-hidden="true"><span>○ 攻撃開始</span><span>● 命中</span><span>◆ 発動前に開始</span><span>S3発動からの経過時間（秒）</span></div>
      <AttackEventsTable comparison={selected} nearby start={start} end={end} precision={precision} />
      <details className="surtr-s3-assumptions surtr-total-damage-all-events">
        <summary>すべての命中時刻</summary>
        <AttackEventsTable comparison={selected} nearby={false} start={start} end={end} precision={precision} />
      </details>
    </div>
  </section>
}

function FragmentColumns() {
  return <><th scope="col">命中回数</th><th scope="col">ダメージ</th></>
}
