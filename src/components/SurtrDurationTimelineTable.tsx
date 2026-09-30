import type { SurtrDurationTimelineRow } from '../lib/surtrDurationTimeline'

const hpFormat = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 })
const timeFormat = new Intl.NumberFormat('ja-JP', { minimumFractionDigits: 1, maximumFractionDigits: 2 })
const statusLabels: Record<SurtrDurationTimelineRow['status'], string> = {
  activation: '発動', 'full-heal': '全回復', drain: '—',
  'remnant-start': '余燼発動', remnant: '余燼中', retreated: '退場',
}

export function SurtrDurationTimelineTable({ rows, step, onStepChange, selectedTime, onSelect }: {
  rows: readonly SurtrDurationTimelineRow[]
  step: 1 | 5
  onStepChange: (step: 1 | 5) => void
  selectedTime?: number
  onSelect: (row: SurtrDurationTimelineRow) => void
}) {
  return <section className="surtr-duration-timeline" aria-labelledby="surtr-duration-timeline-title">
    <div className="surtr-duration-timeline-heading">
      <h3 id="surtr-duration-timeline-title">秒数ごとの残りHP（推定）</h3>
      <label className="surtr-s3-output-control"><span>表示間隔</span>
        <select aria-label="残りHPの表示間隔" value={step} onChange={event => onStepChange(Number(event.target.value) as 1 | 5)}>
          <option value={1}>1秒</option><option value={5}>5秒</option>
        </select>
      </label>
    </div>
    <div className="surtr-s3-table-wrap">
        <table className="surtr-s3-table surtr-duration-timeline-table" aria-label="秒数ごとの残りHP">
          <thead><tr><th scope="col">経過時間（秒）</th><th scope="col">残りHP</th><th scope="col">残HP率</th><th scope="col">状態</th></tr></thead>
          <tbody>{rows.map(row => <tr key={row.time} className={row.time === selectedTime ? 'is-selected' : undefined}>
            <th scope="row"><button type="button" className="surtr-duration-timeline-time"
              aria-label={`${timeFormat.format(row.time)}秒をグラフで確認`} aria-pressed={row.time === selectedTime}
              onClick={() => onSelect(row)}>{timeFormat.format(row.time)}</button></th>
            <td>{row.hp === null ? '—' : hpFormat.format(row.hp)}</td>
            <td>{row.hpPercent === null ? '—' : `${row.hpPercent.toFixed(2)}%`}</td>
            <td className="surtr-duration-timeline-status">{statusLabels[row.status]}</td>
          </tr>)}</tbody>
        </table>
    </div>
    <details className="surtr-s3-assumptions"><summary>表示条件</summary>
      <p>各時刻の処理後のHPを表示します。次のHP減少までは直前の値を保ち、補間しません。全回復・余燼発動・退場の時刻も表示します。</p>
      <p>残りHPは表示時に四捨五入し、残HP率はその時点の最大HPに対する割合です。退場後のHPは「—」で表示します。</p>
    </details>
  </section>
}
