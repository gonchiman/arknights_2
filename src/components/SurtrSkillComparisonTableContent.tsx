import { Fragment, type CSSProperties } from 'react'
import { getSurtrDpsResistanceRating } from '../lib/surtrDpsResistance'
import { formatSurtrUnequippedComparisonValue, type SurtrUnequippedRankMode } from '../lib/surtrUnequippedComparison'
import { getSurtrUnequippedColorScaleBackground, getSurtrUnequippedColorScaleMaximum } from '../lib/surtrUnequippedColorScale'
import type { EnemyHeatmapColorScale } from '../lib/enemyHeatmapColor'
import type { SurtrSkillExternalBuffs } from '../lib/surtrSkillComparison'
import { getSurtrSkillComparisonWinnerTsv, SurtrSkillComparisonWinnerTable } from './SurtrSkillComparisonWinnerTable'
import './SurtrS3Page.css'
import './SurtrSkillComparisonTable.css'

export interface SurtrSkillComparisonTableSeries {
  id: string
  label: string
  color: string
  moduleType?: string | null
  moduleLevel?: number
  s2: readonly number[]
  s3: readonly number[]
}

export interface SurtrSkillComparisonTableMetadata {
  level: number
  trust: number
  potential: number
  s2LevelLabel: string
  s3LevelLabel: string
  enemyCount: number
  blocking: boolean
  remnantActive: boolean
  externalBuffs?: SurtrSkillExternalBuffs
}

export type SurtrSkillComparisonMetric = 'dps' | 'difference' | 'ratio' | 'percent'
export type SurtrSkillComparisonColumnOrder = 'module' | 'skill'
export type SurtrSkillComparisonRankMode = Exclude<SurtrUnequippedRankMode, 'inline'>
export type SurtrSkillComparisonDisplayMode = 'numeric' | 'module-winner' | 'skill-winner'

export interface SurtrSkillComparisonTableData {
  series: readonly SurtrSkillComparisonTableSeries[]
  resistances: readonly number[]
  metric: SurtrSkillComparisonMetric
  precision: number
  columnOrder: SurtrSkillComparisonColumnOrder
  rankMode: SurtrSkillComparisonRankMode
  colorScale: 'none' | EnemyHeatmapColorScale
  displayMode?: SurtrSkillComparisonDisplayMode
  winnerColor?: 'category' | 'none'
  winnerGapShading?: boolean
  /** Keep every selected module when splitting the module-winner image by skill. */
  winnerSkill?: 2 | 3
}

export const SURTR_SKILL_COMPARISON_METRIC_LABELS: Record<SurtrSkillComparisonMetric, string> = {
  dps: 'DPS', difference: 'DPS差（S2 − S3）', ratio: '比率（S3＝100%）', percent: '増加率（S3基準）',
}

/** Comparison uses unrounded DPS; invalid or zero denominators remain unavailable. */
export function getSurtrSkillComparisonValue(item: SurtrSkillComparisonTableSeries, index: number,
  metric: SurtrSkillComparisonMetric, skill: 's2' | 's3' = 's2'): number | null {
  const s2 = item.s2[index]
  const s3 = item.s3[index]
  if (metric === 'dps') return Number.isFinite(item[skill][index]) ? item[skill][index] : null
  if (!Number.isFinite(s2) || !Number.isFinite(s3) || (metric !== 'difference' && s3 === 0)) return null
  const value = metric === 'difference' ? s2 - s3 : metric === 'ratio' ? s2 / s3 * 100 : (s2 / s3 - 1) * 100
  return Number.isFinite(value) ? value === 0 ? 0 : value : null
}

export function formatSurtrSkillComparisonValue(value: number | null, metric: SurtrSkillComparisonMetric, precision: number,
  grouping = true): string {
  if (metric !== 'dps') return formatSurtrUnequippedComparisonValue(value, metric, precision, grouping)
  if (value === null || !Number.isFinite(value)) return '—'
  const rounded = Number(value.toFixed(precision))
  return new Intl.NumberFormat('ja-JP', { minimumFractionDigits: precision, maximumFractionDigits: precision,
    useGrouping: grouping }).format(rounded === 0 ? 0 : rounded)
}

function tableColumns(data: SurtrSkillComparisonTableData) {
  const skills = ['s2', 's3'] as const
  if (data.metric !== 'dps') return data.series.map(item => ({ item, skill: 's2' as const }))
  return data.columnOrder === 'skill'
    ? skills.flatMap(skill => data.series.map(item => ({ item, skill })))
    : data.series.flatMap(item => skills.map(skill => ({ item, skill })))
}

export function getSurtrSkillComparisonTableTsv(data: SurtrSkillComparisonTableData): string {
  if (data.displayMode === 'module-winner' || data.displayMode === 'skill-winner') return getSurtrSkillComparisonWinnerTsv(data)
  const columns = tableColumns(data)
  return [
    ['術耐性', ...(data.rankMode === 'none' ? [] : ['術耐性ランク']), ...columns.map(({ item, skill }) =>
      `${item.label} ${data.metric === 'dps' ? `${skill.toUpperCase()} DPS` : SURTR_SKILL_COMPARISON_METRIC_LABELS[data.metric]}`)],
    ...data.resistances.map((resistance, index) => [String(resistance),
      ...(data.rankMode === 'none' ? [] : [getSurtrDpsResistanceRating(resistance)?.rating ?? '—']),
      ...columns.map(({ item, skill }) => formatSurtrSkillComparisonValue(
        getSurtrSkillComparisonValue(item, index, data.metric, skill), data.metric, data.precision, false))]),
  ].map(row => row.map(cell => cell.replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n')
}

export function getSurtrSkillComparisonColorMaximum(data: SurtrSkillComparisonTableData): number {
  const values = tableColumns(data).flatMap(({ item, skill }) => data.resistances.map((_, index) =>
    getSurtrSkillComparisonValue(item, index, data.metric, skill)))
  return getSurtrUnequippedColorScaleMaximum(values, data.metric === 'dps' ? 'difference' : data.metric)
}

function rankGroups(resistances: readonly number[]) {
  const groups = resistances.map(resistance => ({ resistance, rank: getSurtrDpsResistanceRating(resistance), span: 1 }))
  for (let index = 0; index < groups.length;) {
    const rating = groups[index].rank?.rating
    let end = index + 1
    while (end < groups.length && rating !== undefined && groups[end].rank?.rating === rating) end += 1
    groups[index].span = end - index
    for (let next = index + 1; next < end; next += 1) groups[next].span = 0
    index = end
  }
  return groups
}

export function SurtrSkillComparisonTableContent({ transpose = false, forImage = false, onOpenDetail, colorMaximum, ...data }:
  SurtrSkillComparisonTableData & { transpose?: boolean; forImage?: boolean; colorMaximum?: number;
    onOpenDetail?: (resistance: number, seriesId: string, skillIndex?: 2 | 3) => void }) {
  if (data.displayMode === 'module-winner' || data.displayMode === 'skill-winner') {
    return <SurtrSkillComparisonWinnerTable {...data} transpose={transpose} forImage={forImage} onOpenDetail={onOpenDetail} />
  }
  const columns = tableColumns(data)
  const dps = data.metric === 'dps'
  const merged = data.rankMode === 'merged'
  const rows = rankGroups(data.resistances)
  const maximum = colorMaximum ?? getSurtrSkillComparisonColorMaximum(data)
  const tableStyle = { '--surtr-skill-table-min-width': `${(transpose ? (dps ? 240 : 160) + rows.length * 112
    : 88 + (merged ? 64 : 0) + columns.length * 112)}px` } as CSSProperties
  const rank = (value: number) => {
    const rating = getSurtrDpsResistanceRating(value)
    return <span className="surtr-s3-resistance-rank" title={rating?.label}
      aria-label={rating ? `術耐性ランク ${rating.rating}、${rating.label}` : '術耐性ランク不明'}>{rating?.rating ?? '—'}</span>
  }
  const moduleLabel = (item: SurtrSkillComparisonTableSeries) => <span className="surtr-s3-column-label"><i style={{ backgroundColor: item.color }} />{item.label}</span>
  const cell = (item: SurtrSkillComparisonTableSeries, skill: 's2' | 's3', index: number) => {
    const value = getSurtrSkillComparisonValue(item, index, data.metric, skill)
    const backgroundColor = data.colorScale === 'none' ? undefined
      : getSurtrUnequippedColorScaleBackground(value, data.metric === 'dps' ? 'difference' : data.metric, maximum, data.colorScale)
    const text = formatSurtrSkillComparisonValue(value, data.metric, data.precision)
    const resistance = data.resistances[index]
    return <td key={`${item.id}:${skill}:${resistance}`} data-table-image-number data-series-id={item.id} data-skill={skill}
      data-resistance={resistance} style={{ backgroundColor }}>
      {!forImage && onOpenDetail ? <button type="button" className="surtr-skill-comparison-value" aria-haspopup="dialog"
        aria-label={`術耐性 ${resistance}、${item.label}、${dps ? skill.toUpperCase() : 'S2・S3'}の計算詳細`}
        onClick={event => { event.stopPropagation(); onOpenDetail(resistance, item.id, dps && skill === 's3' ? 3 : 2) }}>{text}</button> : text}
    </td>
  }
  if (!data.series.length || !rows.length) return <p className="surtr-s3-status">比較するMODを選択してください。</p>
  return <div className={`surtr-s3-table-wrap surtr-skill-comparison-wrap${forImage ? ' is-image' : ''}`}>
    <table className="surtr-s3-table surtr-skill-comparison-table" style={tableStyle}
      aria-label={`S2・S3 ${SURTR_SKILL_COMPARISON_METRIC_LABELS[data.metric]}比較表${transpose ? '（術耐性を列）' : ''}`}>
      {transpose ? <>
        <colgroup>{Array.from({ length: dps ? 2 : 1 }, (_, i) => <col key={i} className="surtr-skill-label-column" />)}
          {rows.map(row => <col key={row.resistance} />)}</colgroup>
        <thead>{merged && <tr><th colSpan={dps ? 2 : 1}>術耐性ランク</th>{rows.filter(row => row.span).map(row =>
          <th key={row.resistance} scope="colgroup" colSpan={row.span}>{rank(row.resistance)}</th>)}</tr>}
          <tr><th scope="col">{dps && data.columnOrder === 'skill' ? 'スキル' : 'MOD'}</th>{dps && <th scope="col">{data.columnOrder === 'skill' ? 'MOD' : 'スキル'}</th>}
            {rows.map(row => <th key={row.resistance} scope="col">術耐性 {row.resistance}</th>)}</tr>
        </thead>
        <tbody>{columns.map(({ item, skill }) => <tr key={`${item.id}:${skill}`}>
          {dps && data.columnOrder === 'skill' ? <><th scope="row">{skill.toUpperCase()}</th><th scope="row">{moduleLabel(item)}</th></>
            : <><th scope="row">{moduleLabel(item)}</th>{dps && <th scope="row">{skill.toUpperCase()}</th>}</>}
          {rows.map((_, index) => cell(item, skill, index))}
        </tr>)}</tbody>
      </> : <>
        <colgroup>{merged && <col className="surtr-skill-rank-column" />}<col className="surtr-skill-resistance-column" />
          {columns.map(({ item, skill }) => <col key={`${item.id}:${skill}`} />)}</colgroup>
        <thead><tr>{merged && <th scope="col" rowSpan={dps ? 2 : 1}>ランク</th>}<th scope="col" rowSpan={dps ? 2 : 1}>術耐性</th>
          {dps && data.columnOrder === 'skill' ? (['s2', 's3'] as const).map(skill => <th key={skill} scope="colgroup" colSpan={data.series.length}>{skill.toUpperCase()}</th>)
            : data.series.map(item => <th key={item.id} scope={dps ? 'colgroup' : 'col'} colSpan={dps ? 2 : 1}>{moduleLabel(item)}</th>)}
        </tr>{dps && <tr>{columns.map(({ item, skill }) => <th key={`${item.id}:${skill}`} scope="col">
          {data.columnOrder === 'skill' ? moduleLabel(item) : skill.toUpperCase()}</th>)}</tr>}</thead>
        <tbody>{rows.map((row, index) => <tr key={row.resistance}
          onClick={!forImage && onOpenDetail ? () => onOpenDetail(row.resistance, data.series[0].id) : undefined}>
          {merged && row.span > 0 && <th scope="rowgroup" rowSpan={row.span}>{rank(row.resistance)}</th>}
          <th scope="row">{row.resistance}</th>
          {columns.map(({ item, skill }) => <Fragment key={`${item.id}:${skill}`}>{cell(item, skill, index)}</Fragment>)}
        </tr>)}</tbody>
      </>}
    </table>
  </div>
}
