import { useId, useMemo, useState } from 'react'
import { getEnemyMainStoryScope } from '../lib/enemyAggregationData'
import {
  buildEnemyDefenseResistanceBands, formatEnemyRankPercentage, type EnemyDefenseResistanceBand, type EnemyDefenseResistanceRank,
  type EnemyResistanceThreshold,
} from '../lib/enemyDefenseResistance'
import { parseEcdfGuideInput } from '../lib/enemyEcdfGuides'
import { useEnemyAggregation } from '../lib/useEnemyAggregation'
import { ComparisonTableImageDialog, type ComparisonTableImageSnapshot } from './ComparisonTableImageDialog'
import { EnemyAggregationScopeSelector, ENEMY_MAIN_STORY_LABEL, type EnemyAggregationScope } from './EnemyAggregationScopeSelector'
import { EnemyAggregationSelector } from './EnemyAggregationSelector'
import { EnemyDefenseResistanceChart } from './EnemyDefenseResistanceChart'
import { EnemyDataContent } from './EnemyPageShared'
import './DamageCalculator.css'
import './DamageCalculatorTwo.css'
import './EnemyAnalysis.css'
import './EnemyDefenseResistancePage.css'

const NUMBER = new Intl.NumberFormat('ja-JP')
const VIEWS = [['table', '範囲表'], ['rank', '順位表'], ['resistance', '術耐性別'], ['chart', 'グラフ']] as const
const DEFAULT_RANK_STEP = 10
const MAX_RANK_PERCENTAGE = 100

export function EnemyDefenseResistancePage() {
  const aggregation = useEnemyAggregation()
  const { data } = aggregation
  const [scope, setScope] = useState<EnemyAggregationScope>('all')
  const mainStory = useMemo(() => data && scope === 'main' ? getEnemyMainStoryScope(data) : null, [data, scope])
  const scopedData = mainStory ?? data
  const unavailable = mainStory?.spawnCountsAvailable === false
  const result = useMemo(() => scopedData && !unavailable
    ? buildEnemyDefenseResistanceBands(scopedData.rows, scopedData.counts) : null, [scopedData, unavailable])
  const [view, setView] = useState<typeof VIEWS[number][0]>('table')
  const [rankStep, setRankStep] = useState(DEFAULT_RANK_STEP)
  const [rankInput, setRankInput] = useState('')
  const [showRankPercentage, setShowRankPercentage] = useState(false)
  const [showRankCutoff, setShowRankCutoff] = useState(false)
  const [image, setImage] = useState<ComparisonTableImageSnapshot | null>(null)
  const aggregationConditions = [`集計版 ${aggregation.selectedId}`, ...(scope === 'main' ? [ENEMY_MAIN_STORY_LABEL] : [])]
  const resistanceTable = view === 'resistance' && result
    ? <EnemyResistanceThresholdGrid rows={result.resistanceThresholds} showRankPercentage={showRankPercentage}
        showRankCutoff={showRankCutoff} estimatedRanks={Boolean(scopedData?.counts.summary.expectedMapCount)} />
    : null

  function openResistanceImage() {
    if (!result || !resistanceTable) return
    const rankColumns: string[] = []
    if (showRankPercentage) rankColumns.push('出現順位（%）')
    if (showRankCutoff) rankColumns.push('出現順位の境目')
    setImage({
      title: '防御力と術耐性の対応（術耐性別）',
      conditions: [...aggregationConditions, `出現回数 ${NUMBER.format(result.total)}体`, '術耐性10刻み', ...rankColumns],
      filenameConditions: [...aggregationConditions, '出現回数', '術耐性10刻み', ...rankColumns],
      table: resistanceTable,
    })
  }

  return <section className="calculator-page enemy-analysis-route">
    <header className="page-intro">
      <h1>防御力と術耐性の対応</h1>
      <div className="enemy-analysis-page-actions">
        <div className="enemy-analysis-aggregation" role="group" aria-label="集計設定">
          <EnemyAggregationSelector state={aggregation} />
          <EnemyAggregationScopeSelector scope={scope} onChange={setScope} disabled={!data} />
        </div>
      </div>
    </header>
    <EnemyDataContent loading={aggregation.loading} error={aggregation.error} onRetry={aggregation.retry}>
      {unavailable && <p role="status">この集計版ではメインストーリーの出現回数を利用できません。</p>}
      {result && <>
        <p className="enemy-defense-resistance-count" role="status">出現回数 · {NUMBER.format(result.total)}体</p>
        {result.bands.length > 0 ? <>
          <div className="enemy-chart-scale-switch enemy-defense-resistance-view-switch" role="group" aria-label="表示形式">
            {VIEWS.map(([id, label]) => <button key={id} type="button" aria-pressed={view === id}
              className={view === id ? 'active' : ''} onClick={() => setView(id)}>{label}</button>)}
          </div>
          {view === 'table' && <EnemyDefenseResistanceTable bands={result.bands} />}
          {view === 'rank' && <EnemyDefenseResistanceRankTable result={result} step={rankStep} onStepChange={setRankStep}
            input={rankInput} onInputChange={setRankInput} aggregationConditions={aggregationConditions} onSaveImage={setImage} />}
          {resistanceTable && <>
            <div className="enemy-defense-resistance-rank-controls">
              <div className="enemy-defense-resistance-rank-controls" role="group" aria-label="表示する列">
                <label>
                  <input type="checkbox" checked={showRankPercentage} onChange={event => setShowRankPercentage(event.target.checked)} />
                  出現順位（%）
                </label>
                <label>
                  <input type="checkbox" checked={showRankCutoff} onChange={event => setShowRankCutoff(event.target.checked)} />
                  出現順位の境目（位）
                </label>
              </div>
              <button type="button" className="button secondary" aria-label="術耐性別の表をPNG画像で保存"
                aria-haspopup="dialog" onClick={openResistanceImage}>画像を保存</button>
            </div>
            <div className="damage-two-table-wrap" role="region" tabIndex={0} aria-label="術耐性別">
              {resistanceTable}
            </div>
          </>}
          {view === 'chart' && <EnemyDefenseResistanceChart bands={result.bands} />}
        </> : <p role="status">集計対象の出現データがありません。</p>}
      </>}
    </EnemyDataContent>
    {image && <ComparisonTableImageDialog snapshot={image} onClose={() => setImage(null)} />}
  </section>
}

function EnemyResistanceThresholdGrid({ rows, showRankPercentage, showRankCutoff, estimatedRanks }: {
  rows: readonly EnemyResistanceThreshold[]
  showRankPercentage: boolean
  showRankCutoff: boolean
  estimatedRanks: boolean
}) {
  return <table className="damage-two-table enemy-defense-resistance-table enemy-defense-resistance-threshold-table"
    aria-label="術耐性10刻みの防御力対応表">
    <thead>
      <tr>
        <th scope="col">術耐性</th>
        <th scope="col">防御力</th>
        {showRankPercentage && <th scope="col">出現順位<wbr />（高い順）</th>}
        {showRankCutoff && <th scope="col">出現順位の境目</th>}
      </tr>
    </thead>
    <tbody>
      {rows.map(({ resistance, defense, percentage, rankCutoff }) => <tr key={resistance}>
        <th scope="row" data-table-image-number>{NUMBER.format(resistance)}</th>
        <td data-table-image-number aria-label={defense === null ? '該当なし' : undefined}>
          {defense === null ? '—' : NUMBER.format(defense)}
        </td>
        {showRankPercentage && <td data-table-image-number aria-label={rankCutoff === 0 ? '該当なし' : undefined}>
          {rankCutoff === 0 ? '—' : formatEnemyRankPercentage(percentage)}
        </td>}
        {showRankCutoff && <td data-table-image-number aria-label={rankCutoff === 0 ? '該当なし' : undefined}>
          {rankCutoff === 0 ? '—' : `${estimatedRanks ? '約' : ''}${NUMBER.format(Math.max(1, Math.round(rankCutoff)))}位`}
        </td>}
      </tr>)}
    </tbody>
  </table>
}

function EnemyDefenseResistanceRankTable({ result, step, onStepChange, input, onInputChange, aggregationConditions, onSaveImage }: {
  result: ReturnType<typeof buildEnemyDefenseResistanceBands>
  step: number
  onStepChange: (step: number) => void
  input: string
  onInputChange: (value: string) => void
  aggregationConditions: readonly string[]
  onSaveImage: (snapshot: ComparisonTableImageSnapshot) => void
}) {
  const [stepInput, setStepInput] = useState(String(step))
  const stepErrorId = useId()
  const errorId = useId()
  const invalidStep = stepInput !== '' && !isValidRankStep(Number(stepInput))
  const { value, error } = parseEcdfGuideInput(input, 'y')
  const percentages = new Set([MAX_RANK_PERCENTAGE])
  for (let percentage = step; percentage < MAX_RANK_PERCENTAGE; percentage += step) percentages.add(percentage)
  if (value !== null) percentages.add(value)
  const ranks = [...percentages].sort((a, b) => a - b).map(result.getRank).filter(rank => rank !== null)
  const table = <EnemyDefenseResistanceRankGrid ranks={ranks} selectedRank={value} />

  function openImage() {
    const stepConditions = [`刻み ${step}ポイント`]
    if (value !== null) stepConditions.push(`指定順位 上位${value}%`)
    onSaveImage({
      title: '防御力と術耐性の順位表',
      conditions: [...aggregationConditions, `出現回数 ${NUMBER.format(result.total)}体`, ...stepConditions],
      filenameConditions: [...aggregationConditions, '出現回数', ...stepConditions],
      table,
    })
  }

  return <>
    <div className="enemy-defense-resistance-rank-controls">
      <label>
        刻み
        <input type="number" min={1} max={MAX_RANK_PERCENTAGE} step={1} inputMode="numeric" value={stepInput}
          onChange={(event) => {
            setStepInput(event.target.value)
            const nextStep = event.target.valueAsNumber
            if (isValidRankStep(nextStep)) onStepChange(nextStep)
          }}
          onBlur={() => setStepInput(String(step))}
          onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
          aria-invalid={invalidStep || undefined} aria-describedby={invalidStep ? stepErrorId : undefined} />
        ポイント
      </label>
      <label>
        指定順位　上位
        <input type="number" min={0} max={100} step="any" inputMode="decimal" value={input}
          onChange={(event) => onInputChange(event.target.value)} aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined} />
        %
      </label>
      {invalidStep && <span id={stepErrorId} className="error" role="alert">刻みは1〜100の整数で入力してください。</span>}
      {error && <span id={errorId} className="error" role="alert">{error}</span>}
      <button type="button" className="button secondary" aria-label="順位表をPNG画像で保存"
        aria-haspopup="dialog" disabled={invalidStep || !!error || !ranks.length} onClick={openImage}>画像を保存</button>
    </div>
    <div className="damage-two-table-wrap" role="region" tabIndex={0} aria-label="順位表">
      {table}
    </div>
  </>
}

function EnemyDefenseResistanceRankGrid({ ranks, selectedRank }: {
  ranks: readonly EnemyDefenseResistanceRank[]
  selectedRank: number | null
}) {
  return <table className="damage-two-table enemy-defense-resistance-table enemy-defense-resistance-rank-table"
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
        <tr key={percentage} className={percentage === selectedRank ? 'is-selected-rank' : undefined}>
          <th scope="row">上位{percentage}%</th>
          <td data-table-image-number>{NUMBER.format(defense)}</td>
          <td data-table-image-number>{NUMBER.format(resistance)}</td>
        </tr>
      ))}
    </tbody>
  </table>
}

function isValidRankStep(step: number) {
  return Number.isInteger(step) && step >= 1 && step <= MAX_RANK_PERCENTAGE
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
