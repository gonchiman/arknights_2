import { useMemo, type CSSProperties, type ReactNode } from 'react'
import {
  buildGgTableRows, buildGgTableWinnerMatrix, formatGgTableValue, getGgTableTargets,
  getGgTableTitle, getGgTableRankMode, getGgTableColorScaleMaximum, type GgTableData,
} from '../lib/goldenglowTargetSwitchTable'
import { getEnemyStatRating } from '../lib/enemyStatRatings'
import { getModuleComparisonColors } from '../lib/moduleColors'
import { getSurtrUnequippedColorScaleBackground } from '../lib/surtrUnequippedColorScale'
import { ModuleWinnerTable } from './ModuleWinnerTable'
import './GoldenglowTargetSwitchTable.css'

/** Screen and every export arrangement read the same computed values. */
export function GoldenglowTargetSwitchTableContent({ data, title, footer, transpose = false, forImage = false }: {
  data: GgTableData; title?: string; footer?: ReactNode; transpose?: boolean; forImage?: boolean
}) {
  const targets = useMemo(() => getGgTableTargets(data), [data])
  const rows = useMemo(() => buildGgTableRows(data), [data])
  const colors = useMemo(() => {
    const palette = getModuleComparisonColors(data.builds, { shadeBy: 'moduleLevel' })
    return new Map(data.builds.map((build, index) => [build.id, palette[index]]))
  }, [data.builds])
  const rankMode = getGgTableRankMode(data)
  const combined = data.layout === 'combined'
  const merged = rankMode === 'merged'
  const rankGroups = adjacentGroups(rows, row => row.rank?.rating ?? String(row.resistance))
  const rankStart = new Map(rankGroups.map(group => [group.start, group.count]))
  const metricLabel = data.metric === 'difference' ? '総ダメージ差' : data.metric === 'ratio' ? '基準比（%）' : '増加率（%）'
  const maximum = getGgTableColorScaleMaximum(data)
  const descriptors = data.hps.flatMap(hp => targets.flatMap(build => {
    const rawOnly = data.layout === 'total' || combined && build.id === 'none'
    return (combined && !rawOnly ? ['total', data.metric] as const : [rawOnly ? 'total' : data.metric] as const)
      .map(metric => ({ hp, build, metric }))
  }))
  const hpRowSpans = new Map(adjacentGroups(descriptors, column => String(column.hp)).map(group => [group.start, group.count]))
  const buildRowSpans = new Map(adjacentGroups(descriptors, column => `${column.hp}:${column.build.id}`).map(group => [group.start, group.count]))
  const moduleLabel = (build: (typeof targets)[number]) => <span className="gg-switch-table-module-label">
    <i aria-hidden="true" style={{ backgroundColor: colors.get(build.id) }} />{build.label}</span>
  const resistanceLabel = (row: (typeof rows)[number]) => rankMode === 'inline'
    ? <>{row.resistance}<span className="gg-switch-table-inline-rank">{row.rank?.rating ?? '—'}</span></> : row.resistance
  const hpLabel = (hp: number) => <>{rankMode !== 'none' && <span className="gg-switch-table-hp-rank">HPランク {getEnemyStatRating('maxHp', hp) ?? '—'}<br /></span>}
    敵HP {hp.toLocaleString('ja-JP')}</>
  const cell = (descriptor: (typeof descriptors)[number], row: (typeof rows)[number]) => {
    const entry = row.cells.find(value => value.hp === descriptor.hp && value.buildId === descriptor.build.id)
    const value = descriptor.metric === 'total' ? entry?.total : entry?.comparison
    const background = data.colorScale !== 'NONE' && descriptor.metric !== 'total'
      ? getSurtrUnequippedColorScaleBackground(value, data.metric, maximum, data.colorScale) : undefined
    return <td key={`${row.resistance}:${descriptor.hp}:${descriptor.build.id}:${descriptor.metric}`} data-table-image-number
      data-build-id={descriptor.build.id} data-hp={descriptor.hp} data-resistance={row.resistance} data-metric={descriptor.metric}
      style={background ? { backgroundColor: background } : undefined}>{formatGgTableValue(value, descriptor.metric, data.precision)}</td>
  }
  if (data.layout === 'winner') return <div className="gg-switch-table-winner-content">
    {title !== undefined && <div className="gg-switch-table-standalone-title">{title}</div>}
    <ModuleWinnerTable data={buildGgTableWinnerMatrix(data)} transpose={transpose} color={data.winnerColor ?? 'module'}
      gapShading={data.winnerGapShading ?? false} rankMode={rankMode} ariaLabel={getGgTableTitle(data)} forImage={forImage} />
    {footer}
  </div>
  const columns = transpose ? 3 + rows.length : (merged ? 2 : 1) + descriptors.length
  const headerRows = combined ? 3 : 2
  const style = { '--gg-switch-table-min-width': `${transpose ? 300 + rows.length * 100 : (merged ? 126 : rankMode === 'inline' ? 112 : 76) + descriptors.length * 100}px` } as CSSProperties
  return <div className="gg-switch-table-wrap"><table className="gg-switch-table-content" style={style} aria-label={getGgTableTitle(data)} data-transpose={transpose}>
    <colgroup>{Array.from({ length: columns }, (_, index) => <col key={index} />)}</colgroup>
    <thead>
      {title !== undefined && <tr className="gg-switch-table-image-title-row"><th colSpan={columns}>{title}</th></tr>}
      {transpose ? <>
        <tr><th rowSpan={merged ? 2 : 1} scope="col">敵HP</th><th rowSpan={merged ? 2 : 1} scope="col">MOD</th><th rowSpan={merged ? 2 : 1} scope="col">値</th>
          {merged ? rankGroups.map(group => <th scope="colgroup" colSpan={group.count} key={group.start} title={rows[group.start].rank?.label}>
            術耐性ランク {rows[group.start].rank?.rating ?? '—'}</th>) : rows.map(row => <th key={row.resistance} scope="col">{resistanceLabel(row)}</th>)}
        </tr>
        {merged && <tr>{rows.map(row => <th key={row.resistance} scope="col">{row.resistance}</th>)}</tr>}
      </> : <>
        <tr>{merged && <th scope="col" rowSpan={headerRows}>術耐性<br />ランク</th>}<th scope="col" rowSpan={headerRows}>術耐性</th>
          {data.hps.map(hp => <th key={hp} scope="colgroup" colSpan={descriptors.filter(column => column.hp === hp).length}>{hpLabel(hp)}</th>)}
        </tr>
        <tr>{data.hps.flatMap(hp => targets.map(build => <th key={`${hp}:${build.id}`} scope={combined ? 'colgroup' : 'col'}
          colSpan={descriptors.filter(column => column.hp === hp && column.build.id === build.id).length}>{moduleLabel(build)}</th>))}</tr>
        {combined && <tr>{descriptors.map(column => <th key={`${column.hp}:${column.build.id}:${column.metric}`} scope="col">{column.metric === 'total' ? '総ダメージ' : metricLabel}</th>)}</tr>}
      </>}
    </thead>
    <tbody>{transpose ? descriptors.map((descriptor, index) => <tr key={`${descriptor.hp}:${descriptor.build.id}:${descriptor.metric}`}>
      {hpRowSpans.has(index) && <th scope="rowgroup" rowSpan={hpRowSpans.get(index)}>{hpLabel(descriptor.hp)}</th>}
      {buildRowSpans.has(index) && <th scope="rowgroup" rowSpan={buildRowSpans.get(index)}>{moduleLabel(descriptor.build)}</th>}
      <th scope="row">{descriptor.metric === 'total' ? '総ダメージ' : metricLabel}</th>{rows.map(row => cell(descriptor, row))}
    </tr>) : rows.map((row, index) => <tr key={row.resistance}>
      {merged && rankStart.has(index) && <th className="gg-switch-table-rank-cell" scope="rowgroup" rowSpan={rankStart.get(index)} title={row.rank?.label}>{row.rank?.rating ?? '—'}</th>}
      <th scope="row">{resistanceLabel(row)}</th>{descriptors.map(descriptor => cell(descriptor, row))}
    </tr>)}</tbody>
    {footer && <tfoot><tr><td colSpan={columns}>{footer}</td></tr></tfoot>}
  </table></div>
}

function adjacentGroups<T>(items: readonly T[], key: (item: T) => string) {
  const groups: { start: number; count: number }[] = []
  for (let index = 0; index < items.length;) {
    let end = index + 1
    while (end < items.length && key(items[index]) === key(items[end])) end += 1
    groups.push({ start: index, count: end - index }); index = end
  }
  return groups
}
