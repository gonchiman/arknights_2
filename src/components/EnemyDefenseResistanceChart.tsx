import { createZeroBasedValueAxis } from '../lib/chartValueAxis'
import type { EnemyDefenseResistanceBand } from '../lib/enemyDefenseResistance'
import './EnemyDefenseResistanceChart.css'

const NUMBER = new Intl.NumberFormat('ja-JP')
const STATS = [
  { key: 'defense', label: '防御力' },
  { key: 'resistance', label: '術耐性' },
] as const

const position = (value: number, maximum: number) => `${value / maximum * 100}%`

export function EnemyDefenseResistanceChart({ bands }: { bands: readonly EnemyDefenseResistanceBand[] }) {
  const columns = STATS.map(({ key, label }) => {
    const axis = createZeroBasedValueAxis(Math.max(0, ...bands.map(band => band[key].max)))
    const last = axis.ticks.length - 1
    const ticks = axis.ticks.length <= 4 ? axis.ticks
      : axis.ticks.filter((_, index) => index === 0 || index === last || index === Math.floor(last / 2))
    return { key, label, maximum: axis.maximum, ticks }
  })

  return (
    <div className="damage-two-table-wrap enemy-defense-resistance-chart-wrap" role="region" tabIndex={0}
      aria-label="防御力と術耐性の範囲グラフ">
      <table className="damage-two-table enemy-defense-resistance-chart" aria-label="出現順位別の防御力と術耐性の範囲">
        <colgroup><col className="enemy-defense-resistance-chart-rank" /><col /><col /></colgroup>
        <thead>
          <tr>
            <th scope="col">出現順位<wbr />（高い順）</th>
            {columns.map(({ key, label, maximum, ticks }) => (
              <th scope="col" key={key} className={key}>
                <div className="enemy-defense-resistance-chart-cell">
                  <div>
                    {label}
                    <div className="enemy-defense-resistance-chart-ticks" aria-hidden="true">
                      {ticks.map(tick => <span key={tick} style={{ left: position(tick, maximum) }}>{NUMBER.format(tick)}</span>)}
                    </div>
                  </div>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bands.map(band => (
            <tr key={band.from}>
              <th scope="row">{band.from}〜{band.to}%</th>
              {columns.map(({ key, maximum, ticks }) => {
                const { min, max } = band[key]
                const singleValue = min === max
                const label = singleValue ? NUMBER.format(min) : `${NUMBER.format(min)}〜${NUMBER.format(max)}`
                return (
                  <td key={key} className={key}>
                    <div className="enemy-defense-resistance-chart-cell">
                      <div className="enemy-defense-resistance-chart-track" aria-hidden="true">
                        {ticks.slice(1, -1).map(tick => <i key={tick} className="enemy-defense-resistance-chart-guide"
                          style={{ left: position(tick, maximum) }} />)}
                        <i className={`enemy-defense-resistance-chart-range${singleValue ? ' is-point' : ''}`}
                          style={{ left: position(min, maximum), width: position(max - min, maximum) }} />
                      </div>
                      <span className="enemy-defense-resistance-chart-value">{label}</span>
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
