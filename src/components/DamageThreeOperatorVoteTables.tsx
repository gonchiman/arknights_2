import type { RefObject } from 'react'
import type { EnemyOperatorVoteSummary, EnemySkillVoteSummary, getEnemySkillVoteDetails, WeightedVotes } from '../lib/damageThreeEnemySpawnAdvantage'
import { ADVANTAGE_OUTCOMES } from '../lib/damageThreeAdvantageChart'

const NUMBER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 })
const PRECISE_DAMAGE = new Intl.NumberFormat('ja-JP', { maximumSignificantDigits: 12 })
const EXACT_COUNT = new Intl.NumberFormat('ja-JP', { maximumSignificantDigits: 21 })
const TABLE = 'damage-two-table dc3-statistics-table dc3-operator-vote-table'
const COLUMNS = <colgroup><col /><col /><col /><col /><col /><col /></colgroup>

function VoteCells({ votes }: { votes: WeightedVotes }) {
  return <>
    {ADVANTAGE_OUTCOMES.map(({ key }) => <td key={key} data-table-image-number>{NUMBER.format(votes[key])}</td>)}
    <td data-table-image-number>{NUMBER.format(votes.count)}</td>
  </>
}

export function OperatorVotesTable({ operator, detail }: {
  operator: EnemyOperatorVoteSummary
  detail?: { id: string; skillKey?: string; trigger: RefObject<HTMLButtonElement | null>; toggle: (skill: EnemySkillVoteSummary) => void }
}) {
  return <table className={TABLE} aria-label="スキル別の得票">
    {COLUMNS}
    <thead><tr>
      <th scope="col">番号</th><th scope="col">スキル名</th>
      {ADVANTAGE_OUTCOMES.map(({ key, label }) => <th key={key} scope="col">{label}（票）</th>)}
      <th scope="col">合計（票）</th>
    </tr></thead>
    <tbody>{operator.skills.map(skill => <tr key={skill.key} className={detail?.skillKey === skill.key ? 'dc3-vote-selected' : undefined}>
      <th scope="row">{detail ? <button type="button" className="text-button dc3-matrix-status-button"
        ref={detail.skillKey === skill.key ? detail.trigger : undefined}
        aria-expanded={detail.skillKey === skill.key} aria-controls={detail.id}
        aria-label={`S${skill.skillIndex} ${skill.skillName}の得票内訳`}
        onClick={() => detail.toggle(skill)}>S{skill.skillIndex}</button> : `S${skill.skillIndex}`}</th>
      <td className="dc3-vote-skill-name">{skill.skillName}</td><VoteCells votes={skill.votes} />
    </tr>)}</tbody>
    <tfoot><tr><th scope="row" colSpan={2}>対応スキル計</th><VoteCells votes={operator.votes} /></tr></tfoot>
  </table>
}

export function OperatorVoteDetailTable({ rows, spawnCount }: {
  rows: ReturnType<typeof getEnemySkillVoteDetails>
  spawnCount: number
}) {
  return <table className={TABLE} aria-label="段階ごとの判定">
    {COLUMNS}
    <thead><tr>
      <th scope="col">段階</th><th scope="col">物理ダメージ</th><th scope="col">術ダメージ</th>
      <th scope="col">判定</th><th scope="col">出現1回の票</th><th scope="col">加算票</th>
    </tr></thead>
    <tbody>{rows.map((row, index) => {
      const damageFormat = row.outcome !== 'ties' && NUMBER.format(row.physical) === NUMBER.format(row.arts) ? PRECISE_DAMAGE : NUMBER
      const rounded = Number(row.weightedVotes.toFixed(2))
      const shortDecimal = Math.abs(row.weightedVotes - rounded) <= Number.EPSILON * Math.abs(row.weightedVotes)
      const weighted = rows.length === 1 ? EXACT_COUNT.format(spawnCount)
        : shortDecimal ? NUMBER.format(rounded) : `${EXACT_COUNT.format(spawnCount)}/${rows.length}`
      return <tr key={index}>
        <th scope="row">{row.stageLabel}</th>
        <td data-table-image-number>{damageFormat.format(row.physical)}</td><td data-table-image-number>{damageFormat.format(row.arts)}</td>
        <td className="dc3-vote-outcome">{ADVANTAGE_OUTCOMES.find(({ key }) => key === row.outcome)?.label}</td>
        <td data-table-image-number>{row.votesPerSpawn === 1 ? '1' : `1/${rows.length}`}</td><td data-table-image-number>{weighted}</td>
      </tr>
    })}</tbody>
  </table>
}
