import { useId } from 'react'
import type { SurtrDurationTableLayout, SurtrDurationTimelineRow } from '../lib/surtrDurationTimeline'

const hpFormat = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 })
const timeFormat = new Intl.NumberFormat('ja-JP', { minimumFractionDigits: 1, maximumFractionDigits: 2 })
const statusLabels: Record<SurtrDurationTimelineRow['status'], string> = {
  activation: '発動', 'full-heal': '全回復', drain: '—',
  'remnant-start': '余燼発動', remnant: '余燼中', retreated: '退場', limit: '計算上限',
}

export function SurtrDurationTimelineTableContent({ rows, precision = 2, layout = 'vertical', selectedTime, onSelect, forImage = false }: {
  rows: readonly SurtrDurationTimelineRow[]
  precision?: number
  layout?: SurtrDurationTableLayout
  selectedTime?: number
  onSelect?: (row: SurtrDurationTimelineRow) => void
  forImage?: boolean
}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const digits = Number.isInteger(precision) && precision >= 0 && precision <= 3 ? precision : 2
  const interactive = Boolean(onSelect && !forImage)
  const isSelected = (row: SurtrDurationTimelineRow) => !forImage && row.time === selectedTime
  const timeLabel = (row: SurtrDurationTimelineRow) => interactive ? <button type="button" className="surtr-duration-timeline-time"
    aria-label={`${timeFormat.format(row.time)}秒をグラフで確認`} aria-pressed={row.time === selectedTime}
    onClick={() => onSelect?.(row)}>{timeFormat.format(row.time)}</button> : timeFormat.format(row.time)
  const hpLabel = (row: SurtrDurationTimelineRow) => row.hp === null ? '—' : hpFormat.format(row.hp)
  const percentLabel = (row: SurtrDurationTimelineRow) => row.hpPercent === null ? '—' : `${row.hpPercent.toFixed(digits)}%`
  if (layout === 'horizontal') {
    const metrics = [
      { id: 'hp', label: '残りHP', value: hpLabel },
      { id: 'hpPercent', label: '残HP率', value: percentLabel },
      { id: 'status', label: '状態', value: (row: SurtrDurationTimelineRow) => statusLabels[row.status] },
    ]
    const timeHeader = (index: number) => `${id}-time-${index}`
    const metricHeader = (metricId: string) => `${id}-metric-${metricId}`
    return <div className={`surtr-s3-table-wrap surtr-duration-timeline-content${forImage ? ' is-image' : ''}`} data-layout={layout}>
      <table className="surtr-s3-table surtr-duration-timeline-table surtr-duration-timeline-table-horizontal"
        style={forImage ? undefined : { minWidth: `${112 + rows.length * 80}px` }} aria-label="秒数ごとの残りHP">
        <colgroup><col className="surtr-duration-timeline-label-column" />{rows.map(row => <col key={row.time} />)}</colgroup>
        <thead><tr><th scope="col">経過時間（秒）</th>{rows.map((row, index) => <th key={row.time}
          id={timeHeader(index)} scope="col" className={`surtr-duration-timeline-time-header${isSelected(row) ? ' is-selected' : ''}`}>
          {timeLabel(row)}
        </th>)}</tr></thead>
        <tbody>{metrics.map(metric => <tr key={metric.id}>
          <th id={metricHeader(metric.id)} scope="row">{metric.label}</th>
          {rows.map((row, index) => <td key={row.time} headers={`${timeHeader(index)} ${metricHeader(metric.id)}`}
            className={`${metric.id === 'status' ? 'surtr-duration-timeline-status' : ''}${isSelected(row) ? ' is-selected' : ''}`.trim() || undefined}>
            {metric.value(row)}
          </td>)}
        </tr>)}</tbody>
      </table>
    </div>
  }
  return <div className={`surtr-s3-table-wrap surtr-duration-timeline-content${forImage ? ' is-image' : ''}`} data-layout={layout}>
    <table className="surtr-s3-table surtr-duration-timeline-table" aria-label="秒数ごとの残りHP">
      <thead><tr><th scope="col">経過時間（秒）</th><th scope="col">残りHP</th><th scope="col">残HP率</th><th scope="col">状態</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.time} className={isSelected(row) ? 'is-selected' : undefined}>
        <th scope="row">{timeLabel(row)}</th>
        <td>{hpLabel(row)}</td>
        <td>{percentLabel(row)}</td>
        <td className="surtr-duration-timeline-status">{statusLabels[row.status]}</td>
      </tr>)}</tbody>
    </table>
  </div>
}

export function SurtrDurationTimelineTable({ rows, step, onStepChange, precision = 2, onPrecisionChange, layout = 'vertical', onLayoutChange, selectedTime, onSelect }: {
  rows: readonly SurtrDurationTimelineRow[]
  step: 1 | 5
  onStepChange: (step: 1 | 5) => void
  precision?: number
  onPrecisionChange?: (precision: number) => void
  layout?: SurtrDurationTableLayout
  onLayoutChange?: (layout: SurtrDurationTableLayout) => void
  selectedTime?: number
  onSelect: (row: SurtrDurationTimelineRow) => void
}) {
  return <section className="surtr-duration-timeline" aria-labelledby="surtr-duration-timeline-title">
    <div className="surtr-duration-timeline-heading">
      <h3 id="surtr-duration-timeline-title">秒数ごとの残りHP（推定）</h3>
      <div className="surtr-duration-timeline-controls">
      {onLayoutChange && <label className="surtr-s3-output-control"><span>配置</span>
        <select aria-label="テーブルの配置" value={layout} onChange={event => onLayoutChange(event.target.value as SurtrDurationTableLayout)}>
          <option value="vertical">縦（時間を行）</option><option value="horizontal">横（時間を列）</option>
        </select>
      </label>}
      <label className="surtr-s3-output-control"><span>表示間隔</span>
        <select aria-label="残りHPの表示間隔" value={step} onChange={event => onStepChange(Number(event.target.value) as 1 | 5)}>
          <option value={1}>1秒</option><option value={5}>5秒</option>
        </select>
      </label>
      {onPrecisionChange && <label className="surtr-s3-output-control"><span>残HP率の小数点以下</span>
        <select aria-label="残HP率の小数点以下" value={precision} onChange={event => onPrecisionChange(Number(event.target.value))}>
          {[0, 1, 2, 3].map(value => <option key={value} value={value}>{value}桁</option>)}
        </select>
      </label>}</div>
    </div>
    <SurtrDurationTimelineTableContent rows={rows} precision={precision} layout={layout} selectedTime={selectedTime} onSelect={onSelect} />
    <details className="surtr-s3-assumptions"><summary>表示条件</summary>
      <p>各時刻の処理後のHPを表示します。次のHP変化までは直前の値を保ち、補間しません。全回復・余燼発動・退場の時刻も表示します。計算上限に達した場合は、その時点のHPを表示します。</p>
      <p>残りHPは表示時に四捨五入し、残HP率はその時点の最大HPに対する割合です。退場後のHPは「—」で表示します。</p>
    </details>
  </section>
}
