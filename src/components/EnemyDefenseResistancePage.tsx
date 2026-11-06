import { useMemo } from 'react'
import { buildEnemyDefenseResistanceBands } from '../lib/enemyDefenseResistance'
import { useEnemyAggregation } from '../lib/useEnemyAggregation'
import { EnemyAggregationSelector } from './EnemyAggregationSelector'
import { EnemyDataContent } from './EnemyPageShared'
import './DamageCalculator.css'
import './DamageCalculatorTwo.css'
import './EnemyAnalysis.css'
import './EnemyDefenseResistancePage.css'

const NUMBER = new Intl.NumberFormat('ja-JP')

export function EnemyDefenseResistancePage() {
  const aggregation = useEnemyAggregation()
  const { data } = aggregation
  const result = useMemo(() => data ? buildEnemyDefenseResistanceBands(data.rows, data.counts) : null, [data])

  return <section className="calculator-page enemy-analysis-route">
    <header className="page-intro">
      <h1>防御力と術耐性の対応</h1>
      <div className="enemy-analysis-page-actions">
        <EnemyAggregationSelector state={aggregation} />
      </div>
    </header>
    <EnemyDataContent loading={aggregation.loading} error={aggregation.error} onRetry={aggregation.retry}>
      {result && <>
        <p className="enemy-defense-resistance-count">出現回数 · {NUMBER.format(result.total)}体</p>
        {result.bands.length > 0 ? <div className="damage-two-table-wrap" role="region" tabIndex={0}
          aria-label="出現順位別の防御力と術耐性">
          <table className="damage-two-table enemy-defense-resistance-table" aria-label="防御力と術耐性の対応">
            <colgroup><col className="enemy-defense-resistance-rank" /></colgroup>
            <colgroup span={2} />
            <colgroup span={2} />
            <thead>
              <tr>
                <th scope="col" rowSpan={2}>出現順位<wbr />（高い順）</th>
                <th scope="colgroup" colSpan={2}>防御力</th>
                <th scope="colgroup" colSpan={2}>術耐性</th>
              </tr>
              <tr>
                <th scope="col">最小</th><th scope="col">最大</th>
                <th scope="col">最小</th><th scope="col">最大</th>
              </tr>
            </thead>
            <tbody>
              {result.bands.map(({ from, to, defense, resistance }) => <tr key={from}>
                <th scope="row">{from}〜{to}%</th>
                <td>{NUMBER.format(defense.min)}</td>
                <td>{NUMBER.format(defense.max)}</td>
                <td>{NUMBER.format(resistance.min)}</td>
                <td>{NUMBER.format(resistance.max)}</td>
              </tr>)}
            </tbody>
          </table>
        </div> : <p role="status">集計対象の出現データがありません。</p>}
      </>}
    </EnemyDataContent>
  </section>
}
