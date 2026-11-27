import { useId, useMemo, useRef, useState } from 'react'
import { getEnemySkillVoteDetails, type EnemySpawnAdvantageStatistics, type EnemySpawnPopulation } from '../lib/damageThreeEnemySpawnAdvantage'
import type { StatisticsImageConditions } from './createDamageThreeStatisticsChartImage'
import { OperatorVoteDetailTable, OperatorVotesTable } from './DamageThreeOperatorVoteTables'
import { OperatorSkillVotesChart } from './DamageThreeEnemyAdvantageViews'
import { getOperatorVotesSegments, OperatorVotesChartImageButton, OperatorVotesImageButton } from './OperatorVotesImageButton'
import { PageOutputHeader } from './PageLayout'
import { PageViewSwitch, TABLE_CHART_VIEWS, type TableChartView } from './PageViewSwitch'
import { OperatorNamePicker, type OperatorChoice } from './OperatorNamePicker'
import type { FilterOption } from './Filters'
import './DamageThreeOperatorVotes.css'

interface VoteSelection {
  view: TableChartView
  operatorId: string
  skillKey: string | null
  pairKey: string
}

function pairKey({ defense, resistance }: EnemySpawnPopulation['pairs'][number]) {
  return `${defense}/${resistance}`
}

export function useOperatorVoteSelection() {
  return useState<VoteSelection>({ view: 'table', operatorId: 'char_350_surtr', skillKey: null, pairKey: '100/20' })
}

export function DamageThreeOperatorVotes({ operators, professionOptions, operatorId, statistics, population, imageConditions, selection }: {
  operators: readonly OperatorChoice[]
  professionOptions: readonly FilterOption[]
  operatorId: string
  statistics: EnemySpawnAdvantageStatistics | null
  population: EnemySpawnPopulation
  imageConditions: StatisticsImageConditions
  selection: ReturnType<typeof useOperatorVoteSelection>
}) {
  const [selected, setSelected] = selection
  const detailId = useId()
  const detailTrigger = useRef<HTMLButtonElement | null>(null)
  const operator = statistics?.operators.find(row => row.operatorId === operatorId)
  const skill = selected.view === 'table' ? operator?.skills.find(row => row.key === selected.skillKey) : undefined
  const options = useMemo(() => population.pairs.map((pair, index) => ({ pair, key: pairKey(pair), index }))
    .sort((a, b) => a.pair.defense - b.pair.defense || a.pair.resistance - b.pair.resistance), [population.pairs])
  const current = options.find(option => option.key === selected.pairKey) ?? options[0]
  const rows = skill && current ? getEnemySkillVoteDetails(skill, current.index, current.pair.spawnCount) : []

  const picker = <OperatorNamePicker operators={operators} professionOptions={professionOptions} value={operatorId}
    onSelect={id => setSelected(previous => ({ ...previous, operatorId: id, skillKey: null }))} />
  if (!operator) return <div className="dc3-operator-votes">
    {picker}
    <p role="status">{!operators.length ? '該当するオペレーターはありません。'
      : statistics === null ? 'スキル別の得票を集計中…' : 'このオペレーターには物理・術の両方を比較できるスキルがありません。'}</p>
  </div>
  return <div className="dc3-operator-votes">
    {picker}
    <PageOutputHeader segments={getOperatorVotesSegments(false, selected.view)} actions={selected.view === 'chart'
      ? <OperatorVotesChartImageButton operator={operator} conditions={imageConditions} spawnCount={population.spawnCount} />
      : <OperatorVotesImageButton conditions={imageConditions} operatorName={operator.operatorName} spawnCount={population.spawnCount}
          table={<OperatorVotesTable operator={operator} />} />}>
      <div className="dc3-vote-view-heading">
        <h2>スキル別の得票</h2>
        <PageViewSwitch views={TABLE_CHART_VIEWS} selected={selected.view} label="スキル別の得票の表示形式"
          onChange={view => setSelected(previous => ({ ...previous, view }))} />
      </div>
    </PageOutputHeader>
    {selected.view === 'chart' ? <OperatorSkillVotesChart operator={operator} />
      : <div className="damage-two-table-wrap" role="region" tabIndex={0} aria-label="スキル別の得票">
      <OperatorVotesTable operator={operator} detail={{
        id: detailId, skillKey: skill?.key, trigger: detailTrigger,
        toggle: row => setSelected({ ...selected, operatorId: operator.operatorId, skillKey: skill?.key === row.key ? null : row.key }),
      }} />
    </div>}
    <section id={detailId} hidden={!skill} className="dc3-operator-votes-detail" aria-label="スキルの得票内訳">
      {skill && current && <>
        <PageOutputHeader segments={getOperatorVotesSegments(true)} actions={<>
          <button type="button" className="button secondary" onClick={() => {
            setSelected({ ...selected, skillKey: null })
            detailTrigger.current?.focus()
          }}>閉じる</button>
          {rows.length > 0 && <OperatorVotesImageButton conditions={imageConditions} operatorName={operator.operatorName}
            spawnCount={current.pair.spawnCount} detail={{ skillIndex: skill.skillIndex, skillName: skill.skillName,
              defense: current.pair.defense, resistance: current.pair.resistance }}
            table={<OperatorVoteDetailTable rows={rows} spawnCount={current.pair.spawnCount} />} />}
        </>}>
          <h3>段階ごとの判定 <span className="dc3-vote-detail-skill">{operator.operatorName} S{skill.skillIndex}「{skill.skillName}」</span></h3>
        </PageOutputHeader>
        <div className="dc3-vote-detail-controls">
          <label className="dc3-vote-picker">敵の組
            <select value={current.key} onChange={event => setSelected({ ...selected, pairKey: event.target.value })}>
              {options.map(({ pair, key }) => <option key={key} value={key}>
                防御力 {pair.defense.toLocaleString('ja-JP')} ／ 術耐性 {pair.resistance.toLocaleString('ja-JP')}
              </option>)}
            </select>
          </label>
          <span className="dc3-matrix-population">出現回数 {current.pair.spawnCount.toLocaleString('ja-JP')}回</span>
        </div>
        {rows.length ? <div className="damage-two-table-wrap" role="region" tabIndex={0} aria-label="段階ごとの判定">
          <OperatorVoteDetailTable rows={rows} spawnCount={current.pair.spawnCount} />
        </div> : <p role="status">この敵の組で比較できる段階はありません。</p>}
      </>}
    </section>
  </div>
}
