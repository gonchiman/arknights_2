import { useEffect, useId, useRef, useState } from 'react'
import { formatCrossoverBoundary, type CrossoverPoint } from '../lib/goldenglowCrossover'
import { getHpChartValueAxis } from '../lib/goldenglowTargetSwitchHpAxis'

export function GoldenglowCrossoverChart({ points, resistances, kind, selected, onSelect, running }: {
  points: readonly CrossoverPoint[]; resistances: readonly number[]; kind: 'line' | 'bar'
  selected: number | null; onSelect: (value: number) => void; running: boolean
}) {
  const frame = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(560)
  const clipId = useId()
  const titleId = useId()
  useEffect(() => {
    const element = frame.current
    if (!element) return
    const measure = () => { if (element.clientWidth > 0) setWidth(element.clientWidth) }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const format = (value: number) => value.toLocaleString('ja-JP')
  const data = resistances.map(resistance => ({ resistance, point: points.find(p => p.resistance === resistance) }))
  const numericValue = (row: typeof data[number], key: 'first' | 'sustained') => {
    const boundary = row.point?.[key]
    return boundary?.kind === 'found' ? boundary.hp : null
  }
  const values = data.flatMap(row => [numericValue(row, 'first'), numericValue(row, 'sustained')]).filter((v): v is number => v !== null)
  const axis = getHpChartValueAxis(values.length ? values.map(value => value * 1.05) : [60000], { mode: 'zero', nonNegative: true })
  const left = Math.max(64, format(axis.upperLimit).length * 7.5 + 12), right = 18, top = 28, bottom = 48, height = 286
  const plotWidth = Math.max(1, width - left - right), plotHeight = height - top - bottom
  const first = resistances[0] ?? 0, last = resistances.at(-1) ?? 100
  const x = (value: number) => kind === 'bar'
    ? left + plotWidth * (resistances.indexOf(value) + 0.5) / Math.max(1, resistances.length)
    : first === last ? left + plotWidth / 2 : left + 4 + (value - first) / (last - first) * (plotWidth - 8)
  const y = (value: number) => top + plotHeight * (1 - value / axis.upperLimit)
  const tickCount = Math.min(width < 420 ? 3 : 6, data.length)
  const ticks = [...new Set(Array.from({ length: tickCount }, (_, i) => tickCount === 1 ? 0 : Math.round(i * (data.length - 1) / (tickCount - 1))))]
  const active = points.find(p => p.resistance === selected)
  const path = (key: 'first' | 'sustained') => {
    let pen = false
    return data.map(row => {
      const value = numericValue(row, key)
      if (value === null) { pen = false; return '' }
      const command = `${pen ? 'L' : 'M'}${x(row.resistance)},${y(value)}`
      pen = true
      return command
    }).join(' ')
  }
  const barWidth = Math.max(0.6, Math.min(22, plotWidth / Math.max(1, data.length) * 0.3))
  return <>
    <div className="gg-crossover-legend" aria-label="凡例">
      <span><i className="first" aria-hidden="true" />最初にY優勢</span>
      <span><i className="sustained" aria-hidden="true" />以後Y優勢</span>
    </div>
    <div className="gg-crossover-chart" ref={frame}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={titleId}>
        <title id={titleId}>術耐性別の逆転HP・{kind === 'line' ? '折れ線' : '棒グラフ'}。開始HPからY優勢・未検出の値は数値表に表示。</title>
        <defs><clipPath id={clipId}><rect x={left} y={top} width={plotWidth} height={plotHeight} /></clipPath></defs>
        {axis.yTicks.map(value => <g key={value}><line className="grid horizontal" x1={left} x2={width - right} y1={y(value)} y2={y(value)} />
          <text className="tick" x={left - 10} y={y(value) + 4} textAnchor="end">{format(value)}</text></g>)}
        {ticks.map(index => <g key={index}>
          <line className="grid" x1={x(data[index].resistance)} x2={x(data[index].resistance)} y1={top} y2={top + plotHeight} />
          <text className="tick" x={x(data[index].resistance)} y={height - bottom + 22} textAnchor="middle">{data[index].resistance}</text>
        </g>)}
        <path className="axis" d={`M${left},${top}V${height - bottom}H${width - right}`} />
        <text x={left} y={16}>逆転する敵HP</text>
        <text x={left + plotWidth / 2} y={height - 5} textAnchor="middle">敵の術耐性</text>
        <g clipPath={`url(#${clipId})`}>
          {(['first', 'sustained'] as const).map((key, index) => <g key={key} className={key}>
            {kind === 'line' && <path className="series-line" d={path(key)} />}
            {data.map(row => {
              const value = numericValue(row, key)
              if (value === null) return null
              return kind === 'line' ? <circle key={row.resistance} cx={x(row.resistance)} cy={y(value)} r={data.length > 30 ? 1.8 : 2.8} />
                : <rect key={row.resistance} x={x(row.resistance) + (index === 0 ? -barWidth - 0.5 : 0.5)} y={y(value)} width={barWidth} height={y(0) - y(value)} />
            })}
          </g>)}
          {selected !== null && resistances.includes(selected) && <line className="selection" x1={x(selected)} x2={x(selected)} y1={top} y2={height - bottom} />}
        </g>
        <rect x={left} y={top} width={plotWidth} height={plotHeight} fill="transparent" onPointerMove={event => {
          const svg = event.currentTarget.ownerSVGElement!
          const bounds = svg.getBoundingClientRect()
          const px = (event.clientX - bounds.left) * width / bounds.width
          const nearest = resistances.reduce<number | null>((best, value) => best === null || Math.abs(x(value) - px) < Math.abs(x(best) - px) ? value : best, null)
          if (nearest !== null && nearest !== selected) onSelect(nearest)
        }} />
        {!values.length && <text x={left + plotWidth / 2} y={top + plotHeight / 2} textAnchor="middle" className="empty">
          {points.length ? '数値表で結果を確認' : running ? '計算中…' : '未計算'}
        </text>}
      </svg>
    </div>
    <div className="gg-crossover-readout">
      <label>術耐性<select aria-label="逆転HPを確認する術耐性" value={selected ?? resistances[0] ?? ''} onChange={event => onSelect(Number(event.target.value))}>
        {resistances.map(value => <option key={value} value={value}>{value}</option>)}
      </select></label>
      <span>最初 <strong>{formatCrossoverBoundary(active?.first)}</strong></span>
      <span>以後 <strong>{formatCrossoverBoundary(active?.sustained)}</strong></span>
    </div>
  </>
}
