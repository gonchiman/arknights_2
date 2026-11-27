import { useId, useMemo, useRef, useState } from 'react'
import type { DamageThreeAttributeEntry } from '../lib/damageCalculatorThreeAttributeComparison'
import { getEnemySkillVoteDetails, type EnemyOperatorVoteSummary, type EnemySkillVoteSummary, type EnemySpawnPopulation } from '../lib/damageThreeEnemySpawnAdvantage'
import { evaluateSkillRankStatisticsStage } from '../lib/damageThreeSkillRankStatistics'
import { createSkillJsonSelectionKey } from '../lib/skillJsonAnalysis'
import type { StatisticsImageConditions } from './createDamageThreeStatisticsChartImage'
import { OperatorVoteDetailTable, OperatorVotesTable } from './DamageThreeOperatorVoteTables'
import { OperatorSkillVotesChart } from './DamageThreeEnemyAdvantageViews'
import { getOperatorVotesSegments, OperatorVotesChartImageButton, OperatorVotesImageButton } from './OperatorVotesImageButton'
import { PageOutputHeader } from './PageLayout'
import { PageViewSwitch, TABLE_CHART_VIEWS, type TableChartView } from './PageViewSwitch'
import './DamageThreeOperatorVotes.css'

export function useOperatorVoteSelection() {
  return useState<{ view: TableChartView; pairKey: string }>({ view: 'table', pairKey: '100/20' })
}

interface DetailConditions {
  entries: readonly DamageThreeAttributeEntry[]
  population: EnemySpawnPopulation
  imageConditions: StatisticsImageConditions
  selection: ReturnType<typeof useOperatorVoteSelection>
}

export function DamageThreeOperatorVotes({ operator, ...conditions }: DetailConditions & { operator: EnemyOperatorVoteSummary }) {
  const { imageConditions, population, selection: [selected, setSelected] } = conditions
  const [skillKey, setSkillKey] = useState<string | null>(null)
  const skill = selected.view === 'table' ? operator.skills.find(row => row.key === skillKey) : undefined
  const detailId = useId()
  const detailTrigger = useRef<HTMLButtonElement | null>(null)
  return <div className="dc3-operator-votes">
    <PageOutputHeader segments={getOperatorVotesSegments(false, selected.view)} actions={selected.view === 'chart'
      ? <OperatorVotesChartImageButton operator={operator} conditions={imageConditions} spawnCount={population.spawnCount} />
      : <OperatorVotesImageButton conditions={imageConditions} operatorName={operator.operatorName} spawnCount={population.spawnCount}
          table={<OperatorVotesTable operator={operator} />} />}>
      <div className="dc3-vote-view-heading">
        <h2>スキル別の得票 <span className="dc3-vote-detail-skill">{operator.operatorName}</span></h2>
        <PageViewSwitch views={TABLE_CHART_VIEWS} selected={selected.view} label="スキル別の得票の表示形式"
          onChange={view => setSelected(previous => ({ ...previous, view }))} />
      </div>
    </PageOutputHeader>
    {selected.view === 'chart' ? <OperatorSkillVotesChart operator={operator} />
      : <div className="damage-two-table-wrap" role="region" tabIndex={0} aria-label="スキル別の得票">
        <OperatorVotesTable operator={operator} detail={{
          id: detailId, skillKey: skill?.key, trigger: detailTrigger,
          toggle: row => setSkillKey(skill?.key === row.key ? null : row.key),
        }} />
      </div>}
    <div id={detailId} hidden={!skill}>
      {skill && <SkillVoteBreakdown operatorName={operator.operatorName} skill={skill} {...conditions}
        onClose={() => { detailTrigger.current?.focus(); setSkillKey(null) }} />}
    </div>
  </div>
}

export function SkillVoteBreakdown({ operatorName, skill, entries, population, imageConditions, selection, onClose }: DetailConditions & {
  operatorName: string
  skill: EnemySkillVoteSummary
  onClose?: () => void
}) {
  const [selected, setSelected] = selection
  const options = useMemo(() => population.pairs.map(pair => ({ pair, key: `${pair.defense}/${pair.resistance}` }))
    .sort((a, b) => a.pair.defense - b.pair.defense || a.pair.resistance - b.pair.resistance), [population.pairs])
  const current = options.find(option => option.key === selected.pairKey) ?? options[0]
  const rows = useMemo(() => {
    if (!current) return []
    const stages = entries.flatMap(entry => {
      if (createSkillJsonSelectionKey(entry.skill) !== skill.key) return []
      const cells = evaluateSkillRankStatisticsStage(entry, [current.pair], imageConditions.comparisonPolicy)
      return cells ? [{ skill: entry.skill, stageLabel: entry.stageLabel, cells }] : []
    })
    return getEnemySkillVoteDetails({ ...skill, stages }, 0, current.pair.spawnCount)
  }, [entries, skill, current, imageConditions.comparisonPolicy])

  if (!current) return null
  return <section className="dc3-operator-votes-detail" aria-label="スキルの得票内訳">
    <PageOutputHeader segments={getOperatorVotesSegments(true)} actions={<>
      {onClose && <button type="button" className="button secondary" onClick={onClose}>閉じる</button>}
      {rows.length > 0 && <OperatorVotesImageButton conditions={imageConditions} operatorName={operatorName}
        spawnCount={current.pair.spawnCount} detail={{ skillIndex: skill.skillIndex, skillName: skill.skillName,
          defense: current.pair.defense, resistance: current.pair.resistance }}
        table={<OperatorVoteDetailTable rows={rows} spawnCount={current.pair.spawnCount} />} />}
    </>}>
      <h3>段階ごとの判定 <span className="dc3-vote-detail-skill">{operatorName} S{skill.skillIndex}「{skill.skillName}」</span></h3>
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
  </section>
}
