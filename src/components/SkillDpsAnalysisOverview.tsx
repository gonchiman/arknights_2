import { useMemo, useState } from 'react'
import {
  analyzeSkillDps, type SKILL_DPS_ANALYSIS_AXES,
  type SkillDpsAnalysisAxis, type SkillDpsAnalysisDataset, type SkillDpsAnalysisMetric,
} from '../lib/skillDpsAnalysis'
import { buildSkillDpsTargetGroups } from '../lib/skillDpsTargetGroups'
import { PageOutputHeader } from './PageLayout'
import { TableSortHeader, type TableSort } from './TableSortHeader'
import './SkillDpsAnalysisOverview.css'

const SORTABLE_COLUMNS = [['count', '使用件数'], ['correlation', '相関係数 r'], ['rSquared', 'R²']] as const
const TARGET_GROUP_TITLE = '最大対象数別のDPS'
const COUNT = new Intl.NumberFormat('ja-JP')
const CORRELATION = new Intl.NumberFormat('ja-JP', {
  signDisplay: 'exceptZero', minimumFractionDigits: 3, maximumFractionDigits: 3,
})
const PERCENTAGE = new Intl.NumberFormat('ja-JP', {
  style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1,
})
const DPS = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 })

type SortKey = typeof SORTABLE_COLUMNS[number][0]

export function SkillDpsAnalysisOverview({ dataset, metric, axes, onSelectAxis }: {
  dataset: SkillDpsAnalysisDataset
  metric: SkillDpsAnalysisMetric
  axes: readonly (typeof SKILL_DPS_ANALYSIS_AXES)[number][]
  onSelectAxis: (axis: SkillDpsAnalysisAxis) => void
}) {
  const [sort, setSort] = useState<TableSort<SortKey> | null>(null)
  const { rows, groups } = useMemo(() => {
    const targetAnalysis = analyzeSkillDps(dataset, 'maxTargets', metric)
    const rows = axes.map(([axis, label]) => {
      const analysis = axis === 'maxTargets' ? targetAnalysis : analyzeSkillDps(dataset, axis, metric)
      return {
        axis, label, count: analysis.observations.length,
        correlation: analysis.correlation, rSquared: analysis.fit?.rSquared ?? null,
      }
    })
    const groups = buildSkillDpsTargetGroups(
      targetAnalysis.observations.map(({ id, x, y }) => ({ id, targetCount: x, y })),
    )
    return { rows, groups }
  }, [dataset, metric, axes])

  function changeSort(key: SortKey) {
    setSort(current => ({ key, direction: current?.key === key && current.direction === 'desc' ? 'asc' : 'desc' }))
  }

  const orderedRows = sort ? [...rows].sort((left, right) => {
    const first = left[sort.key], second = right[sort.key]
    if (first === null || second === null) {
      return first === second ? 0 : first === null ? 1 : -1
    }
    return sort.direction === 'asc' ? first - second : second - first
  }) : rows

  return <>
    <div className="skill-dps-table-scroll" role="region" tabIndex={0} aria-label="指標別のDPS分析結果">
      <table className="skill-dps-table skill-dps-overview-table">
        <thead><tr>
          <th scope="col">指標</th>
          {SORTABLE_COLUMNS.map(([key, label]) => <TableSortHeader
            key={key} label={label} sortKey={key} sort={sort} onSort={changeSort}
            ariaLabel={`${label}で並べ替え`} />)}
        </tr></thead>
        <tbody>{orderedRows.map(({ axis, label, count, correlation, rSquared }) => <tr key={axis}>
          <th scope="row">
            <button type="button" className="skill-dps-table-action" onClick={() => onSelectAxis(axis)}>{label}</button>
          </th>
          <td>{COUNT.format(count)}</td>
          <td>{correlation === null ? '—' : CORRELATION.format(correlation)}</td>
          <td>{rSquared === null ? '—' : PERCENTAGE.format(rSquared)}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <details className="skill-dps-overview-targets">
      <summary>{TARGET_GROUP_TITLE}</summary>
      <div className="skill-dps-overview-target-content">
        <PageOutputHeader segments={['分析一覧', TARGET_GROUP_TITLE, '表']} />
        <div className="skill-dps-table-scroll" role="region" tabIndex={0} aria-label={`${TARGET_GROUP_TITLE}の表`}>
          <table className="skill-dps-table skill-dps-overview-table skill-dps-overview-group-table">
            <thead><tr>{['対象数', '件数', 'Q1', '中央値', 'Q3'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
            <tbody>{groups.length ? groups.map(group => <tr key={group.key}>
              <th scope="row">{group.label}</th>
              <td>{COUNT.format(group.count)}</td>
              <td>{DPS.format(group.firstQuartile)}</td>
              <td>{DPS.format(group.median)}</td>
              <td>{DPS.format(group.thirdQuartile)}</td>
            </tr>) : <tr><td colSpan={5} className="skill-dps-table-empty">対象なし</td></tr>}</tbody>
          </table>
        </div>
      </div>
    </details>
  </>
}
