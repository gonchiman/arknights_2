import { useState, type CSSProperties } from 'react'
import { createZeroBasedValueAxis } from '../lib/chartValueAxis'
import type { DamageThreeAttributeRankRow } from '../lib/damageCalculatorThreeAttributeTables'
import './DamageCalculatorThreeAttributeRankChart.css'

const ATTRIBUTES = [['physical', '物理'], ['arts', '術']] as const
const STAT = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 })
const DAMAGE = new Intl.NumberFormat('ja-JP', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const TICK = new Intl.NumberFormat('ja-JP', { maximumSignificantDigits: 4 })

function describeRow({ resistance, defense, physical, arts }: DamageThreeAttributeRankRow) {
  return [
    ['術耐性', STAT.format(resistance)],
    ['防御力', defense === null ? '—' : STAT.format(defense)],
    ['物理', physical === null ? '—' : DAMAGE.format(physical)],
    ['術', arts === null ? '—' : DAMAGE.format(arts)],
  ] as const
}

export function DamageCalculatorThreeAttributeRankChart({ rows }: { rows: readonly DamageThreeAttributeRankRow[] }) {
  const [selectedResistance, setSelectedResistance] = useState<number | null>(null)
  const selected = rows.find(row => row.resistance === selectedResistance) ?? rows[Math.floor(rows.length / 2)]
  if (!selected) return null

  const maximum = rows.reduce((value, row) => Math.max(value, row.physical ?? 0, row.arts ?? 0), 0)
  const axis = createZeroBasedValueAxis(maximum, 0)
  const x = (index: number) => (index + 0.5) / rows.length * 100
  const y = (damage: number) => (1 - damage / axis.maximum) * 100
  const columns = { '--attribute-rank-columns': rows.length } as CSSProperties

  return <figure className="damage-three-attribute-rank-chart" aria-label="出現順位別の1回の攻撃ダメージ（1体あたり）">
    <figcaption className="damage-three-attribute-rank-chart-legend">
      {ATTRIBUTES.map(([key, label]) => <span key={key} className={`is-${key}`}><i aria-hidden="true" />{label}</span>)}
    </figcaption>
    <div className="damage-three-attribute-rank-chart-scroll">
      <div className="damage-three-attribute-rank-chart-layout" style={columns}>
        <div className="damage-three-attribute-rank-chart-scale" aria-hidden="true">
          {axis.ticks.map(tick => <span key={tick} style={{ top: `${y(tick)}%` }}>{TICK.format(tick)}</span>)}
        </div>
        <div className="damage-three-attribute-rank-chart-plot" aria-hidden="true">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false">
            {axis.ticks.map(tick => <line key={tick} x1="0" x2="100" y1={y(tick)} y2={y(tick)} vectorEffect="non-scaling-stroke" />)}
            {ATTRIBUTES.map(([key]) => <path key={key} className={`is-${key}`} vectorEffect="non-scaling-stroke"
              d={rows.map((row, index) => {
                const damage = row[key]
                if (damage === null) return ''
                const command = rows[index - 1]?.[key] == null ? 'M' : 'L'
                return `${command} ${x(index)} ${y(damage)}`
              }).join(' ')} />)}
          </svg>
          <div className="damage-three-attribute-rank-chart-columns">
            {rows.map(row => <div key={row.resistance} className={row === selected ? 'is-selected' : undefined}>
              {ATTRIBUTES.map(([key]) => {
                const damage = row[key]
                if (damage === null) return null
                const coincident = key === 'physical' && row.physical === row.arts
                return <i key={key} className={`is-${key}${coincident ? ' is-coincident' : ''}`}
                  style={{ top: `${y(damage)}%` }} />
              })}
            </div>)}
          </div>
        </div>
        <span className="damage-three-attribute-rank-chart-axis-label">術耐性</span>
        <div className="damage-three-attribute-rank-chart-resistance" role="group" aria-label="術耐性を選択">
          {rows.map(row => <button key={row.resistance} type="button" aria-pressed={row === selected}
            aria-label={describeRow(row).map(([label, value]) => `${label} ${value}`).join('、')}
            onClick={() => setSelectedResistance(row.resistance)}>{STAT.format(row.resistance)}</button>)}
        </div>
        <span className="damage-three-attribute-rank-chart-axis-label">防御力</span>
        <div className="damage-three-attribute-rank-chart-defense" aria-hidden="true">
          {rows.map(row => <span key={row.resistance}>{row.defense === null ? '—' : STAT.format(row.defense)}</span>)}
        </div>
      </div>
    </div>
    <dl className="damage-three-attribute-rank-chart-detail" aria-live="polite">
      {describeRow(selected).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
  </figure>
}
