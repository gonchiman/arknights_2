import { Fragment, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { ADVANTAGE_OUTCOMES } from '../lib/damageThreeAdvantageChart'
import type { EnemyOperatorVoteSummary, EnemySkillVoteSummary, WeightedVotes } from '../lib/damageThreeEnemySpawnAdvantage'
import { STANDARD_PAGE_TITLES } from '../lib/navigation'
import { ComparisonTableImageDialog, type ComparisonTableImageSnapshot } from './ComparisonTableImageDialog'
import { getDamageThreeStatisticsImageConditions, type StatisticsImageConditions } from './createDamageThreeStatisticsChartImage'
import { formatAdvantagePercentage } from './DamageThreeSkillRankStatisticsTable'
import { ENEMY_ANALYSES, ENEMY_COMPARISON_TITLE } from './enemyComparisonViews'
import { OutputImageSaveButton } from './OutputImageSaveButton'
import { PageOutputHeader } from './PageLayout'
import { PageViewSwitch, viewLabel } from './PageViewSwitch'
import { TableSortHeader, type TableSort } from './TableSortHeader'
import './DamageThreeVoteList.css'

const GROUPS = [['operator', 'オペレーター別'], ['skill', 'スキル別']] as const
const UNITS = [['votes', '票数'], ['rate', '得票率']] as const
export type VoteListGroup = typeof GROUPS[number][0]
type Unit = typeof UNITS[number][0]
type Column = 'operator' | 'skillCount' | 'skillIndex' | 'skillName' | keyof WeightedVotes
const NUMBER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 })
const NAMES = new Intl.Collator('ja', { numeric: true })
const PAGE_SIZE = 15

export function getVoteListSegments(group: VoteListGroup) {
  return [ENEMY_COMPARISON_TITLE, viewLabel(ENEMY_ANALYSES, 'operatorVotes'), viewLabel(GROUPS, group) + 'の得票一覧']
}

interface Props {
  operators: readonly EnemyOperatorVoteSummary[] | null
  imageConditions: StatisticsImageConditions
  spawnCount: number
  group: VoteListGroup
  onGroupChange: (group: VoteListGroup) => void
  renderDetail: (operator: EnemyOperatorVoteSummary, skill: EnemySkillVoteSummary | undefined, close: () => void) => ReactNode
}

interface VoteRow {
  id: string
  operator: EnemyOperatorVoteSummary
  skill?: EnemySkillVoteSummary
  votes: WeightedVotes
}

function voteSortValue(row: VoteRow, column: Column, unit: Unit) {
  switch (column) {
    case 'operator': return row.operator.operatorName
    case 'skillCount': return row.operator.skills.length
    case 'skillIndex': return row.skill?.skillIndex ?? 0
    case 'skillName': return row.skill?.skillName ?? ''
    case 'count': return row.votes.count
    default:
      if (unit === 'votes') return row.votes[column]
      return row.votes.count > 0 ? row.votes[column] / row.votes.count : -1
  }
}

function columnHeaders(group: VoteListGroup, unit: Unit) {
  const columns: [Column, string][] = [['operator', 'オペレーター']]
  if (group === 'operator') columns.push(['skillCount', '有効スキル数'])
  else columns.push(['skillIndex', 'S番号'], ['skillName', 'スキル名'])
  for (const { key, label } of ADVANTAGE_OUTCOMES) columns.push([key, label + (unit === 'votes' ? '（票）' : '（%）')])
  columns.push(['count', '合計（票）'])
  return columns
}

interface TableProps {
  rows: VoteRow[]
  group: VoteListGroup
  title: string
  unit: Unit
  controls?: {
    sort: TableSort<Column>
    onSort: (key: Column) => void
    selected: string | null
    toggle: (row: VoteRow, trigger: HTMLButtonElement) => void
    detailsId: string
    render: (row: VoteRow) => ReactNode
  }
}

function VoteTable({ rows, group, title, unit, controls }: TableProps) {
  const headers = columnHeaders(group, unit)
  return <table className="damage-two-table dc3-statistics-table dc3-vote-list-table" aria-label={title}>
    <colgroup>{headers.map(([key]) => <col key={key} />)}</colgroup>
    <thead><tr>{headers.map(([key, label]) => controls
      ? <TableSortHeader key={key} sortKey={key} label={label} ariaLabel={label + 'で並べ替え'} sort={controls.sort} onSort={controls.onSort} />
      : <th scope="col" key={key}>{label}</th>)}</tr></thead>
    <tbody>{rows.map(row => {
      const { operator, skill, votes } = row
      const open = controls?.selected === row.id
      const triggerLabel = skill ? 'S' + skill.skillIndex : operator.operatorName
      const trigger = controls ? <button type="button" className="text-button dc3-matrix-status-button"
        aria-expanded={open} aria-controls={open ? controls.detailsId : undefined}
        aria-label={skill ? operator.operatorName + ' ' + triggerLabel + ' ' + skill.skillName + 'の得票内訳' : operator.operatorName + 'のスキル別の得票'}
        onClick={event => controls.toggle(row, event.currentTarget)}>{triggerLabel}</button> : triggerLabel
      return <Fragment key={row.id}>
        <tr className={open ? 'dc3-vote-list-selected' : undefined}>
          <th scope="row" className="dc3-vote-list-name">{skill ? operator.operatorName : trigger}</th>
          {skill ? <><td className="dc3-vote-list-index">{trigger}</td><td className="dc3-vote-list-name">{skill.skillName}</td></>
            : <td data-table-image-number>{operator.skills.length}</td>}
          {ADVANTAGE_OUTCOMES.map(({ key }) => <td key={key} data-table-image-number>{unit === 'votes'
            ? NUMBER.format(votes[key]) : formatAdvantagePercentage(votes[key], votes.count)}</td>)}
          <td data-table-image-number>{NUMBER.format(votes.count)}</td>
        </tr>
        {controls && open && <tr><td className="dc3-vote-list-expanded" colSpan={headers.length}>
          <div id={controls.detailsId} className="dc3-vote-list-detail">{controls.render(row)}</div>
        </td></tr>}
      </Fragment>
    })}</tbody>
  </table>
}

export function DamageThreeVoteList(props: Props) {
  const [unit, setUnit] = useState<Unit>('votes')
  const { group, onGroupChange, imageConditions } = props
  const context = [group, imageConditions.aggregationVersion, imageConditions.scope, imageConditions.comparisonPolicy, imageConditions.filters]
  return <div className="dc3-operator-votes dc3-vote-list">
    <div className="dc3-matrix-display-options">
      <div className="dc3-matrix-option-group"><span className="dc3-matrix-option-label">一覧の単位</span>
        <PageViewSwitch views={GROUPS} selected={group} label="一覧の単位" onChange={onGroupChange} /></div>
      <div className="dc3-matrix-option-group"><span className="dc3-matrix-option-label">表示する値</span>
        <PageViewSwitch views={UNITS} selected={unit} label="表示する値" onChange={setUnit} /></div>
    </div>
    <VoteListResults key={JSON.stringify(context)} {...props} unit={unit} />
  </div>
}

function VoteListResults({ group, unit, operators, spawnCount, imageConditions, renderDetail }: Props & { unit: Unit }) {
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState<TableSort<Column>>({ key: 'operator', direction: 'asc' })
  const [selected, setSelected] = useState<string | null>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const detailsId = useId()
  const [snapshot, setSnapshot] = useState<ComparisonTableImageSnapshot | null>(null)
  const segments = getVoteListSegments(group)
  const title = segments[2]
  const rows = useMemo(() => {
    const list: VoteRow[] = []
    for (const operator of operators ?? []) {
      if (group === 'operator') list.push({ id: operator.operatorId, operator, votes: operator.votes })
      else for (const skill of operator.skills) list.push({ id: skill.key, operator, skill, votes: skill.votes })
    }
    return list.sort((a, b) => {
      const first = voteSortValue(a, sort.key, unit), second = voteSortValue(b, sort.key, unit)
      const comparison = typeof first === 'number' && typeof second === 'number' ? first - second : NAMES.compare(String(first), String(second))
      return (sort.direction === 'asc' ? comparison : -comparison)
        || NAMES.compare(a.operator.operatorName, b.operator.operatorName)
        || NAMES.compare(a.operator.operatorId, b.operator.operatorId)
        || (a.skill?.skillIndex ?? 0) - (b.skill?.skillIndex ?? 0) || NAMES.compare(a.id, b.id)
    })
  }, [operators, group, sort, unit])
  const activePage = Math.min(page, Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1))
  const start = activePage * PAGE_SIZE
  const pageRows = rows.slice(start, start + PAGE_SIZE)
  const range = (start + 1) + '–' + (start + pageRows.length) + ' / ' + rows.length + '件'

  function changePage(next: number) {
    setPage(next)
    setSelected(null)
  }
  function onSort(key: Column) {
    const ascending = key === sort.key ? sort.direction === 'desc' : ['operator', 'skillName', 'skillIndex'].includes(key)
    setSort({ key, direction: ascending ? 'asc' : 'desc' })
    changePage(0)
  }
  function openImage() {
    const { source, settings } = getDamageThreeStatisticsImageConditions(imageConditions)
    const column = columnHeaders(group, unit).find(([key]) => key === sort.key)![1]
    const sortLabel = column + (sort.direction === 'asc' ? ' 昇順' : ' 降順')
    const conditions = [viewLabel(UNITS, unit), ...source, 'スキル単位', ...settings, sortLabel]
    setSnapshot({ title, filenameConditions: [...conditions, `${start + 1}–${start + pageRows.length}件目`],
      conditions: [...conditions, `出現回数 ${NUMBER.format(spawnCount)}`, range],
      table: <VoteTable rows={pageRows} group={group} title={title} unit={unit} /> })
  }
  return <>
    <PageOutputHeader segments={segments} actions={pageRows.length > 0 && <OutputImageSaveButton onClick={openImage} />}>
      <div className="dc3-matrix-table-heading">
        <h2>{title}</h2>
        {pageRows.length > 0 && <nav aria-label={title + 'のページ切り替え'}>
          <span aria-live="polite">{range}</span>
          {rows.length > PAGE_SIZE && <>
            <button type="button" className="button secondary" disabled={activePage === 0} onClick={() => changePage(activePage - 1)}>前へ</button>
            <button type="button" className="button secondary" disabled={start + PAGE_SIZE >= rows.length} onClick={() => changePage(activePage + 1)}>次へ</button>
          </>}
        </nav>}
      </div>
    </PageOutputHeader>
    {pageRows.length ? <div className="damage-two-table-wrap" role="region" tabIndex={0} aria-label={title}>
      <VoteTable rows={pageRows} group={group} title={title} unit={unit} controls={{ sort, onSort, selected, detailsId,
        toggle: (row, button) => {
          trigger.current = button
          setSelected(selected === row.id ? null : row.id)
        },
        render: row => renderDetail(row.operator, row.skill, () => {
          setSelected(null)
          trigger.current?.focus()
        }),
      }} />
    </div> : <p role="status">{operators === null ? '得票を集計中…' : '物理・術の両方を比較できるスキルはありません。'}</p>}
    {snapshot && <ComparisonTableImageDialog snapshot={snapshot} onClose={() => setSnapshot(null)}
      parentLocation={[STANDARD_PAGE_TITLES['damage-three-skill-attribute-matrix'], ...segments]} />}
  </>
}
