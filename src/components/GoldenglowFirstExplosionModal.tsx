import { useId } from 'react'
import type { GoldenglowFirstExplosionRow } from '../lib/goldenglowExplosion'
import { GoldenglowDetailModal } from './GoldenglowDetailModal'
import './GoldenglowExplosionDamageModal.css'
import './GoldenglowFirstExplosionModal.css'

const probabilityFormat = new Intl.NumberFormat('ja-JP', { maximumSignificantDigits: 8 })
const formatProbability = (probability: number) => `${probabilityFormat.format(probability * 100)}%`

export function GoldenglowFirstExplosionModal({ rows, attackNumber, onClose }: {
  rows: readonly GoldenglowFirstExplosionRow[]
  attackNumber: number
  onClose: () => void
}) {
  const flowTitleId = useId()
  const row = rows.find((item) => item.attackNumber === attackNumber)
  if (!row) return null

  const previousRows = rows.filter((item) => item.attackNumber < attackNumber)
  const firstRow = rows[0]
  const lastRow = rows[rows.length - 1]
  const chanceFormula = row.explosionChancePercent >= 100
    ? attackNumber === 1 ? '初回から確定爆発' : `${attackNumber - 1}回連続で不発なら確定爆発`
    : `${formatProbability(firstRow.explosionChancePercent / 100)} × ${attackNumber}`

  return (
    <GoldenglowDetailModal
      title={`${attackNumber}回目の初回爆発確率`}
      closeLabel="初回爆発確率の詳細を閉じる"
      onClose={onClose}
    >
      <h3 className="gg-table-title" id={flowTitleId}>計算フロー</h3>
      <div className="gg-damage-detail-table-wrap" tabIndex={0} role="region" aria-label="初回爆発確率の計算内訳">
        <table className="gg-probability-table gg-damage-detail-table gg-first-explosion-flow-table" aria-labelledby={flowTitleId}>
          <thead>
            <tr>
              <th scope="col">計算内容</th>
              <th scope="col">式</th>
              <th scope="col">結果</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">不発が続いた場合の爆発確率</th>
              <td><code>{chanceFormula}</code></td>
              <td>{formatProbability(row.explosionChancePercent / 100)}</td>
            </tr>
            <tr>
              <th scope="row">それまで爆発しない確率</th>
              <td><code>{describeReachFormula(previousRows)}</code></td>
              <td>{formatProbability(row.reachProbability)}</td>
            </tr>
            <tr>
              <th scope="row">その回で初めて爆発する確率</th>
              <td><code>{formatProbability(row.reachProbability)} × {formatProbability(row.explosionChancePercent / 100)}</code></td>
              <td>{formatProbability(row.firstExplosionProbability)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="gg-damage-detail-notes">
        <p>爆発で確率がリセットされた直後を1回目として、初めて爆発するまでを数えます。</p>
        <p>{lastRow.explosionChancePercent >= 100 && lastRow.attackNumber > 1
          ? `${lastRow.attackNumber}回目の100%は、先行する${lastRow.attackNumber - 1}回がすべて不発だった場合の確率です。`
          : '「不発が続いた場合の爆発確率」は、それまで爆発しなかった場合の確率です。'}「その回で初めて爆発する確率」には、そこまで不発が続く確率も含みます。</p>
      </div>
      <details className="gg-first-explosion-detail-list">
        <summary>攻撃回数ごとの一覧（{firstRow.attackNumber}〜{lastRow.attackNumber}回）</summary>
        <div className="gg-first-explosion-list-wrap" tabIndex={0} role="region" aria-label="初回爆発の確率一覧">
          <table className="gg-probability-table gg-first-explosion-list-table" aria-label="攻撃回数ごとの初回爆発確率">
            <thead>
              <tr>
                <th scope="col">攻撃回数</th>
                <th scope="col">不発が続いた場合の<br />爆発確率</th>
                <th scope="col">それまで<br />爆発しない確率</th>
                <th scope="col">その回で初めて<br />爆発する確率</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.attackNumber} className={item.attackNumber === attackNumber ? 'is-selected' : undefined}>
                  <th scope="row">{item.attackNumber}回目</th>
                  <td>{formatProbability(item.explosionChancePercent / 100)}</td>
                  <td>{formatProbability(item.reachProbability)}</td>
                  <td>{formatProbability(item.firstExplosionProbability)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </GoldenglowDetailModal>
  )
}

function describeReachFormula(previousRows: readonly GoldenglowFirstExplosionRow[]): string {
  if (previousRows.length === 0) return '先行する攻撃なし'

  const factor = (row: GoldenglowFirstExplosionRow) => `(1 − ${formatProbability(row.explosionChancePercent / 100)})`
  if (previousRows.length <= 3) return previousRows.map(factor).join(' × ')
  return `${factor(previousRows[0])} × ${factor(previousRows[1])} × … × ${factor(previousRows[previousRows.length - 1])}`
}
