import type { ReactNode } from 'react'
import type { SurtrRemnantAttackAssumptions } from '../lib/surtrRemnantAttacks'
import type { SurtrRemnantAttackExpectation, SurtrRemnantHitCountProbability } from '../lib/surtrRemnantExpectation'
import './OperatorModuleComparison.css'
import './SurtrS3Page.css'
import './SurtrRemnantAttackExpectationTable.css'

export interface SurtrRemnantExpectationComparisonResult {
  id: string
  label: string
  color: string
  expectation: SurtrRemnantAttackExpectation
}

const format = (value: number, digits: number) => value.toLocaleString('ja-JP', { maximumFractionDigits: digits })

export type SurtrRemnantAttackExpectationTableLayout = 'horizontal' | 'vertical'

export function SurtrRemnantAttackExpectationConditions({ potential, blocking, assumptions }: {
  potential: number
  blocking: boolean
  assumptions: SurtrRemnantAttackAssumptions
}) {
  return <div className="operator-module-comparison-image-footer surtr-remnant-attack-expectation-conditions">
    <span>残りCT：一様分布</span>
    <span>潜在{potential}・{blocking ? '自身でブロック中' : '自身は非ブロック'}・命中まで {format(assumptions.windup, 6)} s・
      {assumptions.ctCarry === 'time' ? 'CT秒数維持' : 'CT割合維持'}・撤退同時の命中{assumptions.includeRetreatHit ? 'を含む' : 'を含まない'}</span>
  </div>
}

function ConditionsRow({ footer, columnCount }: { footer: ReactNode; columnCount: number }) {
  return <tr><td colSpan={columnCount} className="surtr-remnant-attack-expectation-conditions-cell">{footer}</td></tr>
}

function Equipment({ item }: { item: SurtrRemnantExpectationComparisonResult }) {
  return <>
    <span className="surtr-s3-column-label"><i aria-hidden="true" style={{ backgroundColor: item.color }} />{item.label}</span>
    <span className="surtr-remnant-attack-expectation-ct-domain">CT 0〜{format(item.expectation.remainingCtLimit, 6)} s</span>
  </>
}

function CtRanges({ row }: { row?: SurtrRemnantHitCountProbability }) {
  return row ? <span className="surtr-remnant-attack-expectation-ranges">{row.ctRanges.map((range, index) =>
    <span key={index}><span>{range.includeFrom ? '[' : '('}{format(range.from, 6)}, </span>
      <span>{format(range.to, 6)}{range.includeTo ? ']' : ')'} s</span></span>)}</span> : <>—</>
}

function Probability({ row, limit }: { row?: SurtrRemnantHitCountProbability; limit: number }) {
  if (!row) return <>0%</>
  const length = row.ctRanges.reduce((sum, range) => sum + range.to - range.from, 0)
  return <>
    <span className="surtr-remnant-attack-expectation-probability-calculation">{format(length, 6)} ÷ {format(limit, 6)}</span>
    <span className="surtr-remnant-attack-expectation-probability">≈ {format(row.probability * 100, 4)}%</span>
  </>
}

/** Use the same unrounded analytical results for the live table and saved image. */
export function SurtrRemnantAttackExpectationTable({ comparison, layout = 'horizontal', footer }: {
  comparison: readonly SurtrRemnantExpectationComparisonResult[]
  layout?: SurtrRemnantAttackExpectationTableLayout
  footer?: ReactNode
}) {
  const counts = [...new Set(comparison.flatMap(item => item.expectation.probabilities.map(row => row.hitCount)))].sort((a, b) => a - b)
  if (!comparison.length || !counts.length) return null
  const groupWidth = 93 / comparison.length

  if (layout === 'vertical') return <div className="surtr-s3-table-wrap surtr-remnant-attack-expectation-table-wrap">
    <table className="surtr-s3-table surtr-remnant-attack-expectation-table surtr-remnant-attack-expectation-table-vertical"
      aria-label="命中回数別の確率と期待値への寄与" style={{ minWidth: 680 }}>
      <colgroup><col style={{ width: '16%' }} /><col style={{ width: '9%' }} /><col style={{ width: '24%' }} />
        <col style={{ width: '25%' }} /><col style={{ width: '14%' }} /><col style={{ width: '12%' }} /></colgroup>
      <thead><tr><th scope="col">装備</th><th scope="col">命中回数</th><th scope="col">残りCT範囲</th>
        <th scope="col">確率の計算</th><th scope="col">回数 × 確率</th><th scope="col">期待値</th></tr></thead>
      {comparison.map(item => <tbody key={item.id}>{item.expectation.probabilities.map((row, index) => <tr key={row.hitCount}>
        {index === 0 && <th scope="rowgroup" rowSpan={item.expectation.probabilities.length}
          className="surtr-remnant-attack-expectation-equipment"><Equipment item={item} /></th>}
        <th scope="row">{row.hitCount} 回</th><td className="surtr-remnant-attack-expectation-range-cell"><CtRanges row={row} /></td>
        <td><Probability row={row} limit={item.expectation.remainingCtLimit} /></td>
        <td className="surtr-remnant-attack-expectation-contribution">{format(row.contribution, 4)} 回</td>
        {index === 0 && <td rowSpan={item.expectation.probabilities.length} className="surtr-remnant-attack-expectation-mean">
          <strong>≈ {format(item.expectation.expectedHitCount, 4)}</strong> 回</td>}
      </tr>)}</tbody>)}
      {footer && <tfoot><ConditionsRow footer={footer} columnCount={6} /></tfoot>}
    </table>
  </div>

  return <div className="surtr-s3-table-wrap surtr-remnant-attack-expectation-table-wrap">
    <table className="surtr-s3-table surtr-remnant-attack-expectation-table surtr-remnant-attack-expectation-table-horizontal"
      aria-label="命中回数別の確率と期待値への寄与" style={{ minWidth: Math.max(320, 100 + comparison.length * 320) }}>
      <colgroup><col style={{ width: '7%' }} />{comparison.flatMap(item => [
        <col key={`${item.id}:ranges`} style={{ width: `${groupWidth * 0.39}%` }} />,
        <col key={`${item.id}:probability`} style={{ width: `${groupWidth * 0.33}%` }} />,
        <col key={`${item.id}:contribution`} style={{ width: `${groupWidth * 0.28}%` }} />,
      ])}</colgroup>
      <thead>
        <tr><th scope="col" rowSpan={2}>命中回数</th>{comparison.map(item =>
          <th key={item.id} scope="colgroup" colSpan={3}><Equipment item={item} /></th>)}</tr>
        <tr>{comparison.flatMap(item => [
          <th key={`${item.id}:ranges`} scope="col">残りCT範囲</th>,
          <th key={`${item.id}:probability`} scope="col">確率の計算</th>,
          <th key={`${item.id}:contribution`} scope="col">回数 × 確率</th>,
        ])}</tr>
      </thead>
      <tbody>{counts.map(hitCount => <tr key={hitCount}><th scope="row">{hitCount} 回</th>{comparison.flatMap(item => {
        const row = item.expectation.probabilities.find(value => value.hitCount === hitCount)
        return [
          <td key={`${item.id}:ranges`} className={`surtr-remnant-attack-expectation-range-cell${!row ? ' is-zero' : ''}`}><CtRanges row={row} /></td>,
          <td key={`${item.id}:probability`} className={!row ? 'is-zero' : undefined}><Probability row={row} limit={item.expectation.remainingCtLimit} /></td>,
          <td key={`${item.id}:contribution`} className={!row ? 'is-zero' : undefined}>{format(row?.contribution ?? 0, 4)} 回</td>,
        ]
      })}</tr>)}</tbody>
      <tfoot><tr><th scope="row">期待値</th>{comparison.map(item => <td key={item.id} colSpan={3}>
        <strong>≈ {format(item.expectation.expectedHitCount, 4)}</strong> 回
      </td>)}</tr>{footer && <ConditionsRow footer={footer} columnCount={1 + comparison.length * 3} />}</tfoot>
    </table>
  </div>
}
