import { useId } from 'react'
import type { GoldenglowFirstExplosionRow } from '../lib/goldenglowExplosion'
import { GoldenglowDetailModal } from './GoldenglowDetailModal'
import './GoldenglowExplosionDamageModal.css'
import './GoldenglowExpectationDetailModal.css'
import './GoldenglowExpectationMeaningModal.css'

const format = (value: number) => new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 }).format(value)
const probabilityFormat = new Intl.NumberFormat('ja-JP', { maximumSignificantDigits: 8 })

export function GoldenglowExpectationMeaningModal({ example, meanAttacks, onClose }: {
  example: GoldenglowFirstExplosionRow & { contribution: number }
  meanAttacks: number
  onClose: () => void
}) {
  const exampleTitleId = useId()
  const trials = 1_000
  const roundedChancePercent = Math.round(example.firstExplosionProbability * 1_000) / 10
  const expectedTrials = trials * roundedChancePercent / 100
  const expectedAttacks = example.attackNumber * expectedTrials
  const averageContribution = expectedAttacks / trials

  return (
    <GoldenglowDetailModal
      title="攻撃回数 × 確率の意味"
      closeLabel="攻撃回数 × 確率の説明を閉じる"
      onClose={onClose}
    >
      <p className="gg-expectation-meaning-intro">その回で初めて爆発する結果が、平均攻撃回数に加える分を表します。</p>
      <h3 className="gg-table-title" id={exampleTitleId}>1,000回試す例</h3>
      <p className="gg-expectation-meaning-intro">確率のリセットから初めて爆発するまでを1試行とします。</p>
      <div className="gg-damage-detail-table-wrap" tabIndex={0} role="region" aria-label="1,000試行で考える攻撃回数と確率">
        <table className="gg-probability-table gg-damage-detail-table gg-expectation-detail-table" aria-labelledby={exampleTitleId}>
          <thead>
            <tr>
              <th scope="col">計算内容</th>
              <th scope="col">式</th>
              <th scope="col">結果</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">{example.attackNumber}回目に初めて爆発する確率</th>
              <td><code>{probabilityFormat.format(example.firstExplosionProbability * 100)}% を丸める</code></td>
              <td>約{format(roundedChancePercent)}%</td>
            </tr>
            <tr>
              <th scope="row">該当する試行数の期待値</th>
              <td><code>{format(trials)}試行 × {format(roundedChancePercent)}%</code></td>
              <td>約{format(expectedTrials)}試行</td>
            </tr>
            <tr>
              <th scope="row">該当する試行の合計攻撃回数</th>
              <td><code>{example.attackNumber}回 × {format(expectedTrials)}試行</code></td>
              <td>約{format(expectedAttacks)}回</td>
            </tr>
            <tr>
              <th scope="row">全試行の平均に加える分</th>
              <td><code>{format(expectedAttacks)}回 ÷ {format(trials)}試行</code></td>
              <td>約{format(averageContribution)}回</td>
            </tr>
            <tr>
              <th scope="row">直接計算する場合</th>
              <td><code>{example.attackNumber}回 × {format(roundedChancePercent)}%</code></td>
              <td>約{format(averageContribution)}回</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="gg-damage-detail-notes">
        <p>各回の分をすべて足すと、平均は約{format(meanAttacks)}回です。</p>
        <p>この例の数値は理解しやすいように丸めています。ページの計算には丸める前の数値を使います。</p>
      </div>
    </GoldenglowDetailModal>
  )
}
