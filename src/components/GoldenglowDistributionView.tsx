import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { MAX_GOLDENGLOW_EXPLOSION_TRIALS } from '../lib/goldenglowExplosionSimulation'
import type { GoldenglowDistributionRow } from '../lib/goldenglowSkillExplosionDistribution'
import { GoldenglowDetailModal } from './GoldenglowDetailModal'
import './GoldenglowExplosionDistributionPanel.css'

const percent = (value: number) => `${value > 0 && value * 100 < .0001 ? (value * 100).toExponential(3) : new Intl.NumberFormat('ja-JP', { maximumSignificantDigits: 4 }).format(value * 100)}%`

export function GoldenglowDistributionView({ rows, trialCount, onRun, title, xLabel, context, conditions, describeValue, busy = false, error = null, fitDistribution = false }: {
  rows: readonly GoldenglowDistributionRow[]
  trialCount: number
  onRun: (count: number) => void
  title: string
  xLabel: string
  context: string
  conditions: ReactNode
  describeValue: (value: number) => string
  fitDistribution?: boolean
  busy?: boolean
  error?: string | null
}) {
  const [trialCountInput, setTrialCountInput] = useState(String(trialCount))
  const trialCountLabel = trialCount.toLocaleString('ja-JP')
  const [tableOpen, setTableOpen] = useState(false)
  const [visible, setVisible] = useState({ simulation: true, theory: true })
  const [selected, setSelected] = useState<number | null>(null)
  const [pinned, setPinned] = useState(false)
  const frameRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const titleId = useId()
  useLayoutEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const observer = new ResizeObserver(() => setWidth(frame.clientWidth))
    observer.observe(frame)
    setWidth(frame.clientWidth)
    return () => observer.disconnect()
  }, [])

  const lastVisible = rows.reduce((last, row, index) => row.theoreticalProbability >= 1e-6 || row.observedCount > 0 ? index : last, 0)
  const graphRows = fitDistribution ? rows.slice(0, lastVisible + 2) : rows
  const cropped = graphRows.length < rows.length
  const height = 320, left = 52, right = 16, top = 32, bottom = 54
  const plotWidth = Math.max(1, width - left - right)
  const maximum = Math.max(.01, ...rows.flatMap(row => [row.observedProbability, row.theoreticalProbability])) * 100
  const tickStep = maximum > 50 ? 20 : maximum > 20 ? 10 : maximum > 10 ? 5 : maximum > 5 ? 2 : 1
  const yMax = Math.ceil(maximum * 1.08 / tickStep) * tickStep
  const x = (index: number) => left + (index + .5) * plotWidth / graphRows.length
  const y = (probability: number) => height - bottom - probability * 100 / yMax * (height - top - bottom)
  const ticks = Array.from({ length: Math.round(yMax / tickStep) + 1 }, (_, i) => i * tickStep)
  const firstValue = graphRows[0]?.value ?? 0
  const lastAttack = graphRows[graphRows.length - 1]?.value ?? 0
  const xStep = Math.max(1, Math.ceil((lastAttack - firstValue) / (width < 440 ? 3 : 8) / 5) * 5)
  const xTicks = graphRows.filter(row => row.value === firstValue || row.value === lastAttack
    || (row.value % xStep === 0 && row.value < lastAttack - xStep * .55))
  const row = selected === null ? null : graphRows[selected]
  const selectedStyle = selected === null ? undefined : {
    left: Math.max(4, Math.min(x(selected) - 100, width - 212)),
    top: 36,
  }
  const selectFromPointer = (event: React.PointerEvent<SVGSVGElement> | React.MouseEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const position = event.clientX - bounds.left
    const index = Math.max(0, Math.min(graphRows.length - 1, Math.floor((position - left) / plotWidth * graphRows.length)))
    setSelected(index)
  }

  return <div className="gg-explosion-distribution">
    <form className="gg-distribution-toolbar" onSubmit={event => {
      event.preventDefault()
      const count = Number(trialCountInput)
      if (busy || !Number.isInteger(count) || count < 1 || count > MAX_GOLDENGLOW_EXPLOSION_TRIALS) return
      onRun(count)
      setSelected(null)
      setPinned(false)
    }}>
      <label className="gg-distribution-trial-input">
        <span>シミュレーション回数</span>
        <input type="number" min={1} max={MAX_GOLDENGLOW_EXPLOSION_TRIALS} step={1} required
          value={trialCountInput} onChange={event => setTrialCountInput(event.target.value)} />
        <span>回</span>
      </label>
      <div className="gg-distribution-actions">
        <button type="submit" disabled={busy}>{busy ? '計算中…' : '再シミュレーション'}</button>
        <button type="button" aria-haspopup="dialog" disabled={busy || rows.length === 0} onClick={() => setTableOpen(true)}>数値表</button>
      </div>
    </form>
    <figure className="gg-distribution-figure">
      <figcaption id={titleId}>
        <div><strong>{title}</strong>
          <div className="gg-distribution-trial-count" role="status">{busy ? '計算中…' : `${trialCountLabel}試行`}</div>
        </div>
        <div className="gg-distribution-legend" aria-label="分布グラフの系列">
          <button type="button" aria-pressed={visible.simulation} onClick={() => setVisible(value => ({ ...value, simulation: !value.simulation }))}>
            <span className="gg-distribution-bar-key" aria-hidden="true" />試行結果
          </button>
          <button type="button" aria-pressed={visible.theory} onClick={() => setVisible(value => ({ ...value, theory: !value.theory }))}>
            <span className="gg-distribution-line-key" aria-hidden="true" />理論値
          </button>
        </div>
      </figcaption>
      <div className="gg-distribution-chart" ref={frameRef}>
        {error && <p className="gg-probability-intro" role="alert">{error}</p>}
        {busy && <p className="gg-probability-intro" role="status">分布を計算中…</p>}
        {!busy && rows.length > 0 && width > 0 && <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-labelledby={titleId}
          onPointerMove={event => { if (!pinned) selectFromPointer(event) }}
          onPointerLeave={() => { if (!pinned) setSelected(null) }}
          onClick={event => { selectFromPointer(event); setPinned(value => !value) }}>
          <desc>棒は{trialCountLabel}試行の結果、点と線は理論値。横軸は{xLabel}、縦軸は割合。各回の正確な値は数値表から確認できます。</desc>
          {ticks.map(tick => <g key={tick}>
            <line className="gg-distribution-grid" x1={left} x2={width - right} y1={y(tick / 100)} y2={y(tick / 100)} />
            <text x={left - 10} y={y(tick / 100)} dy=".35em" textAnchor="end">{tick}</text>
          </g>)}
          <rect className="gg-distribution-frame" x={left} y={top} width={plotWidth} height={height - bottom - top} />
          {xTicks.map(tick => <text key={tick.value} x={x(tick.value - firstValue)} y={height - bottom + 22}
            textAnchor={tick.value === firstValue ? 'start' : tick.value === lastAttack ? 'end' : 'middle'}>{tick.value}</text>)}
          <text x={left} y={17}>割合（%）</text>
          <text x={left + plotWidth / 2} y={height - 12} textAnchor="middle">{xLabel}（回）</text>
          {visible.simulation && graphRows.map((item, index) => <rect key={item.value} className="gg-distribution-bar"
            x={x(index) - plotWidth / graphRows.length * .36} y={y(item.observedProbability)}
            width={plotWidth / graphRows.length * .72} height={y(0) - y(item.observedProbability)} />)}
          {visible.theory && <g className="gg-distribution-theory">
            <path d={graphRows.map((item, index) => `${index ? 'L' : 'M'} ${x(index)} ${y(item.theoreticalProbability)}`).join(' ')} />
            {graphRows.map((item, index) => <circle key={item.value} cx={x(index)} cy={y(item.theoreticalProbability)} r={2} />)}
          </g>}
          {selected !== null && <line className="gg-distribution-guide" x1={x(selected)} x2={x(selected)} y1={top} y2={height - bottom} />}
        </svg>}
        {!busy && row && <div className="gg-distribution-tooltip" style={selectedStyle}>
          <strong>{describeValue(row.value)}</strong>
          {visible.simulation && <span>試行結果：{percent(row.observedProbability)}（{row.observedCount}件）</span>}
          {visible.theory && <span>理論値：{percent(row.theoreticalProbability)}</span>}
        </div>}
      </div>
      {cropped && <div className="gg-distribution-range">表示範囲：{firstValue}〜{lastAttack}回（全範囲は数値表）</div>}
    </figure>
    <details className="gg-distribution-conditions"><summary>試行条件</summary>
      <p>{conditions}</p>
    </details>
    {tableOpen && <GoldenglowDetailModal title={title} closeLabel="分布の数値表を閉じる" onClose={() => setTableOpen(false)}>
      <table className="gg-probability-table gg-distribution-values">
        <caption>{trialCountLabel}試行・{context}</caption>
        <thead><tr><th scope="col">{xLabel}</th><th scope="col">理論値</th><th scope="col">試行結果</th><th scope="col">件数</th></tr></thead>
        <tbody>{rows.map(item => <tr key={item.value}><th scope="row">{item.value}回</th>
          <td>{percent(item.theoreticalProbability)}</td><td>{percent(item.observedProbability)}</td><td>{item.observedCount}</td></tr>)}</tbody>
        <tfoot><tr><th scope="row">合計</th><td>{percent(rows.reduce((sum, item) => sum + item.theoreticalProbability, 0))}</td>
          <td>100%</td><td>{trialCount}</td></tr></tfoot>
      </table>
    </GoldenglowDetailModal>}
  </div>
}
