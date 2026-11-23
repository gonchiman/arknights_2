import type { SkillRankStatistics } from '../lib/damageThreeSkillRankStatistics'
import { viewLabel } from './PageViewSwitch'

export const STATISTIC_VIEWS = [['distribution', 'ダメージ分布'], ['advantage', '属性別の優勢率']] as const
export type StatisticView = typeof STATISTIC_VIEWS[number][0]

const INTEGER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 })

function Quartiles({ values }: { values: SkillRankStatistics['physical'] }) {
  return <>
    <td>{values ? INTEGER.format(values.q1) : '—'}</td>
    <td className="dc3-statistics-median">{values ? INTEGER.format(values.median) : '—'}</td>
    <td>{values ? INTEGER.format(values.q3) : '—'}</td>
  </>
}

function percentage(wins: number, count: number) {
  return count > 0 ? (wins / count * 100).toFixed(1) : '—'
}

export default function DamageThreeSkillRankStatisticsTable({ rows, view }: {
  rows: readonly SkillRankStatistics[]
  view: StatisticView
}) {
  const distribution = view === 'distribution'
  const label = `術耐性別の${viewLabel(STATISTIC_VIEWS, view)}`
  const rowSpan = distribution ? 2 : 1
  return <div className="damage-two-table-wrap" role="region" tabIndex={0} aria-label={label}>
    <table className="damage-two-table dc3-statistics-table" aria-label={label}>
      <thead><tr>
        <th scope="col">術耐性</th><th scope="col">対応防御力</th><th scope="col">有効段階数</th>
        {distribution ? <>
          <th scope="col">属性</th><th scope="col">第1四分位</th><th scope="col">中央値</th><th scope="col">第3四分位</th>
        </> : <>
          <th scope="col">物理化優勢 (%)</th><th scope="col">同値 (%)</th><th scope="col">術化優勢 (%)</th>
        </>}
      </tr></thead>
      {rows.map(row => <tbody key={row.resistance}>
        <tr>
          <th scope={distribution ? 'rowgroup' : 'row'} rowSpan={rowSpan}>{row.resistance}</th>
          <td rowSpan={rowSpan}>{row.defense === null ? '—' : INTEGER.format(row.defense)}</td>
          <td rowSpan={rowSpan}>{INTEGER.format(row.count)}</td>
          {distribution ? <>
            <th scope="row" className="dc3-statistics-attribute">物理化</th>
            <Quartiles values={row.physical} />
          </> : <>
            <td>{percentage(row.physicalWins, row.count)}</td>
            <td>{percentage(row.ties, row.count)}</td>
            <td>{percentage(row.artsWins, row.count)}</td>
          </>}
        </tr>
        {distribution && <tr>
          <th scope="row" className="dc3-statistics-attribute">術化</th>
          <Quartiles values={row.arts} />
        </tr>}
      </tbody>)}
    </table>
  </div>
}
