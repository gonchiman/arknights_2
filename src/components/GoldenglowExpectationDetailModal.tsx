import { useId } from 'react'
import type { GoldenglowFirstExplosionRow } from '../lib/goldenglowExplosion'
import { GoldenglowDetailModal } from './GoldenglowDetailModal'
import './GoldenglowExplosionDamageModal.css'
import './GoldenglowExpectationDetailModal.css'

type ExpectationRow = GoldenglowFirstExplosionRow & { contribution: number }

const numberFormat = new Intl.NumberFormat('ja-JP', { maximumSignificantDigits: 8 })
const format = (value: number) => numberFormat.format(value)
const formatProbability = (probability: number) => `${format(probability * 100)}%`

export function GoldenglowExpectationDetailModal({ rows, meanAttacks, attackNumber, onClose }: {
  rows: readonly ExpectationRow[]
  meanAttacks: number
  attackNumber: number | null
  onClose: () => void
}) {
  const flowTitleId = useId()
  const selectedRow = attackNumber === null ? null : rows.find((row) => row.attackNumber === attackNumber)
  if (rows.length === 0 || (attackNumber !== null && !selectedRow)) return null

  const title = attackNumber === null ? '平均攻撃回数の計算' : `${attackNumber}回目の期待値への寄与`

  return (
    <GoldenglowDetailModal title={title} closeLabel="期待値の計算詳細を閉じる" onClose={onClose}>
      <h3 className="gg-table-title" id={flowTitleId}>計算フロー</h3>
      <div className="gg-damage-detail-table-wrap" tabIndex={0} role="region" aria-label={title}>
        <table className="gg-probability-table gg-damage-detail-table gg-expectation-detail-table" aria-labelledby={flowTitleId}>
          <thead>
            <tr>
              <th scope="col">計算内容</th>
              <th scope="col">式</th>
              <th scope="col">結果</th>
            </tr>
          </thead>
          <tbody>
            {selectedRow ? (
              <>
                <tr>
                  <th scope="row">不発が続いた場合の爆発確率</th>
                  <td><code>{describeChanceFormula(selectedRow, rows[0])}</code></td>
                  <td>{formatProbability(selectedRow.explosionChancePercent / 100)}</td>
                </tr>
                <tr>
                  <th scope="row">それまで爆発しない確率</th>
                  <td><code>{describeReachFormula(rows.filter((row) => row.attackNumber < selectedRow.attackNumber))}</code></td>
                  <td>{formatProbability(selectedRow.reachProbability)}</td>
                </tr>
                <tr>
                  <th scope="row">その回で初めて爆発する確率</th>
                  <td><code>{formatProbability(selectedRow.reachProbability)} × {formatProbability(selectedRow.explosionChancePercent / 100)}</code></td>
                  <td>{formatProbability(selectedRow.firstExplosionProbability)}</td>
                </tr>
                <tr>
                  <th scope="row">平均攻撃回数への寄与</th>
                  <td><code>{selectedRow.attackNumber}回 × {formatProbability(selectedRow.firstExplosionProbability)}</code></td>
                  <td>{format(selectedRow.contribution)}回</td>
                </tr>
              </>
            ) : (
              <>
                {rows.slice(0, 2).map((row) => (
                  <tr key={row.attackNumber}>
                    <th scope="row">{row.attackNumber}回目の寄与</th>
                    <td><code>{row.attackNumber}回 × {formatProbability(row.firstExplosionProbability)}</code></td>
                    <td>{format(row.contribution)}回</td>
                  </tr>
                ))}
                <tr>
                  <th scope="row">全{rows.length}行の合計</th>
                  <td><code>{describeContributionSum(rows)}</code></td>
                  <td>{format(meanAttacks)}回</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
      <div className="gg-damage-detail-notes">
        <p>浮遊ユニット1体・確率のリセットから次の爆発までの平均攻撃回数です。</p>
        <p>初めて爆発する回ごとに「攻撃回数 × その確率」を求め、すべて足すと平均攻撃回数になります。</p>
        <p>表示は概数です。寄与と平均は、丸める前の数値で計算しています。</p>
      </div>
    </GoldenglowDetailModal>
  )
}

function describeReachFormula(previousRows: readonly GoldenglowFirstExplosionRow[]): string {
  if (previousRows.length === 0) return '先行する攻撃なし'

  const factor = (row: GoldenglowFirstExplosionRow) => `(1 − ${formatProbability(row.explosionChancePercent / 100)})`
  if (previousRows.length <= 3) return previousRows.map(factor).join(' × ')
  return `${factor(previousRows[0])} × ${factor(previousRows[1])} × … × ${factor(previousRows[previousRows.length - 1])}`
}

function describeChanceFormula(row: GoldenglowFirstExplosionRow, firstRow: GoldenglowFirstExplosionRow): string {
  if (row.explosionChancePercent >= 100) {
    return row.attackNumber === 1 ? '初回から確定爆発' : `${row.attackNumber - 1}回連続で不発なら確定爆発`
  }
  return `${formatProbability(firstRow.explosionChancePercent / 100)} × ${row.attackNumber}`
}

function describeContributionSum(rows: readonly ExpectationRow[]): string {
  if (rows.length <= 3) return rows.map((row) => format(row.contribution)).join(' + ')
  return `${format(rows[0].contribution)} + ${format(rows[1].contribution)} + … + ${format(rows[rows.length - 1].contribution)}`
}
