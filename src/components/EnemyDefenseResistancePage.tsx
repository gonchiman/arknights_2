import { useId, useMemo, useState } from 'react'
import { buildEnemyDefenseResistanceBands, type EnemyDefenseResistanceBand } from '../lib/enemyDefenseResistance'
import { parseEcdfGuideInput } from '../lib/enemyEcdfGuides'
import { useEnemyAggregation } from '../lib/useEnemyAggregation'
import { EnemyAggregationSelector } from './EnemyAggregationSelector'
import { EnemyDefenseResistanceChart } from './EnemyDefenseResistanceChart'
import { EnemyDataContent } from './EnemyPageShared'
import './DamageCalculator.css'
import './DamageCalculatorTwo.css'
import './EnemyAnalysis.css'
import './EnemyDefenseResistancePage.css'

const NUMBER = new Intl.NumberFormat('ja-JP')
const VIEWS = [['table', '範囲表'], ['rank', '順位表'], ['chart', 'グラフ']] as const

export function EnemyDefenseResistancePage() {
  const aggregation = useEnemyAggregation()
  const { data } = aggregation
  const result = useMemo(() => data ? buildEnemyDefenseResistanceBands(data.rows, data.counts) : null, [data])
  const [view, setView] = useState<typeof VIEWS[number][0]>('table')
  const [rankInput, setRankInput] = useState('')

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
        {result.bands.length > 0 ? <>
          <div className="enemy-chart-scale-switch enemy-defense-resistance-view-switch" role="group" aria-label="表示形式">
            {VIEWS.map(([id, label]) => <button key={id} type="button" aria-pressed={view === id}
              className={view === id ? 'active' : ''} onClick={() => setView(id)}>{label}</button>)}
          </div>
          {view === 'table' && <EnemyDefenseResistanceTable bands={result.bands} />}
          {view === 'rank' && <EnemyDefenseResistanceRankTable result={result} input={rankInput} onInputChange={setRankInput} />}
          {view === 'chart' && <EnemyDefenseResistanceChart bands={result.bands} />}
        </> : <p role="status">集計対象の出現データがありません。</p>}
      </>}
    </EnemyDataContent>
  </section>
}

function EnemyDefenseResistanceRankTable({ result, input, onInputChange }: {
  result: ReturnType<typeof buildEnemyDefenseResistanceBands>
  input: string
  onInputChange: (value: string) => void
}) {
  const errorId = useId()
  const { value, error } = parseEcdfGuideInput(input, 'y')
  const ranks = result.bands.map(({ to, defense, resistance }) => ({
    percentage: to,
    defense: defense.min,
    resistance: resistance.min,
  }))
  if (value !== null && !ranks.some(({ percentage }) => percentage === value)) {
    const custom = result.getRank(value)
    if (custom) {
      ranks.push(custom)
      ranks.sort((a, b) => a.percentage - b.percentage)
    }
  }

  return <>
    <div className="enemy-defense-resistance-rank-controls">
      <label>
        指定順位　上位
        <input type="number" min={0} max={100} step="any" inputMode="decimal" value={input}
          onChange={(event) => onInputChange(event.target.value)} aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined} />
        %
      </label>
      {error && <span id={errorId} className="error" role="alert">{error}</span>}
    </div>
    <div className="damage-two-table-wrap" role="region" tabIndex={0} aria-label="順位表">
      <table className="damage-two-table enemy-defense-resistance-table enemy-defense-resistance-rank-table"
        aria-label="指定順位の防御力と術耐性">
        <colgroup><col className="enemy-defense-resistance-rank" /><col /><col /></colgroup>
        <thead>
          <tr>
            <th scope="col">出現順位<wbr />（高い順）</th>
            <th scope="col">防御力</th>
            <th scope="col">術耐性</th>
          </tr>
        </thead>
        <tbody>
          {ranks.map(({ percentage, defense, resistance }) => (
            <tr key={percentage} className={percentage === value ? 'is-selected-rank' : undefined}>
              <th scope="row">上位{percentage}%</th>
              <td>{NUMBER.format(defense)}</td>
              <td>{NUMBER.format(resistance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </>
}

function EnemyDefenseResistanceTable({ bands }: { bands: readonly EnemyDefenseResistanceBand[] }) {
  return <div className="damage-two-table-wrap" role="region" tabIndex={0} aria-label="出現順位別の防御力と術耐性">
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
        {bands.map(({ from, to, defense, resistance }) => <tr key={from}>
          <th scope="row">{from}〜{to}%</th>
          <td>{NUMBER.format(defense.min)}</td>
          <td>{NUMBER.format(defense.max)}</td>
          <td>{NUMBER.format(resistance.min)}</td>
          <td>{NUMBER.format(resistance.max)}</td>
        </tr>)}
      </tbody>
    </table>
  </div>
}
