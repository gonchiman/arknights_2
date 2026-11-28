import type { MainStorySpawnChapterRow, MainStorySpawnChapterSort } from '../lib/mainStoryEnemySpawns'
import { TableSortHeader } from './TableSortHeader'

export const chapterSortLabels = { chapter: '章', count: '確認済み出現回数' } as const
const COLUMNS = ['chapter', 'count', 'stageCount', 'partialStageCount'] as const
const LABELS = { ...chapterSortLabels, stageCount: '対象ステージ数', partialStageCount: 'うち一部集計' }
const number = new Intl.NumberFormat('ja-JP')

export function MainStoryChapterSpawnTable({ rows, sorting }: {
  rows: readonly MainStorySpawnChapterRow[]
  sorting?: { sort: MainStorySpawnChapterSort; onSort: (key: MainStorySpawnChapterSort['key']) => void }
}) {
  const forImage = !sorting
  return <table className="main-story-spawns-table main-story-chapter-table" data-image={forImage || undefined}
    aria-label="章別の出現回数">
    {forImage && <colgroup>{COLUMNS.map(key => <col key={key} />)}</colgroup>}
    <thead><tr>{COLUMNS.map(key => sorting && (key === 'chapter' || key === 'count')
      ? <TableSortHeader key={key} label={LABELS[key]} sortKey={key} {...sorting} />
      : <th scope="col" key={key}>{LABELS[key]}</th>)}</tr></thead>
    <tbody>
      {rows.map(row => <tr key={row.chapter}>
        <th scope="row">第{row.chapter}章</th>
        <td data-table-image-number={forImage || undefined}>{number.format(row.count)}</td>
        <td data-table-image-number={forImage || undefined}>{number.format(row.stageCount)}</td>
        <td data-table-image-number={forImage || undefined}>{number.format(row.partialStageCount)}</td>
      </tr>)}
      {!rows.length && <tr><td className="main-story-spawns-empty" colSpan={COLUMNS.length}>一致する敵名はありません</td></tr>}
    </tbody>
  </table>
}
