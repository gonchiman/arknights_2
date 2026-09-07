import { useId } from 'react'
import type { GoldenglowExplosionModel } from '../lib/goldenglowExplosion'
import type { GoldenglowNormalAttackRow } from '../lib/goldenglowNormalAttackTable'
import { GoldenglowDetailModal } from './GoldenglowDetailModal'
import './GoldenglowExplosionDamageModal.css'
import './GoldenglowNormalAttackDetailModal.css'

const format = (value: number) => new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 }).format(value)
const probabilityFormat = new Intl.NumberFormat('ja-JP', { maximumSignificantDigits: 8 })
const formatChance = (percent: number) => `${probabilityFormat.format(percent)}%`

export function GoldenglowNormalAttackDetailModal({ row, attack, resistance, resistanceIgnore, model, onClose }: {
  row: GoldenglowNormalAttackRow
  attack: number
  resistance: number
  resistanceIgnore: number
  model: GoldenglowExplosionModel
  onClose: () => void
}) {
  const flowTitleId = useId()
  const afterResistance = row.damage.afterResistance ?? 0
  const minimumDamage = row.damage.minimumDamage ?? 0
  const previousExpectedDamage = row.cumulativeExpectedNormalDamage - row.expectedNormalDamage

  return (
    <GoldenglowDetailModal
      title={`${row.attackNumber}回目の通常攻撃`}
      closeLabel="通常攻撃の詳細を閉じる"
      onClose={onClose}
    >
      <h3 className="gg-table-title" id={flowTitleId}>計算フロー</h3>
      <div className="gg-damage-detail-table-wrap" tabIndex={0} role="region" aria-label="通常攻撃ダメージの計算内訳">
        <table className="gg-probability-table gg-damage-detail-table gg-normal-attack-detail-table" aria-labelledby={flowTitleId}>
          <thead>
            <tr>
              <th scope="col">計算内容</th>
              <th scope="col">式</th>
              <th scope="col">結果</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">特性による攻撃倍率</th>
              <td><code>min({format(model.droneMaxAttackScale * 100)}%, {format(model.droneInitialAttackScale * 100)}% + {format(model.droneAttackScaleStep * 100)}% × min({row.attackNumber} − 1, {model.droneMaxStack}))</code></td>
              <td>{format(row.attackScalePercent)}%</td>
            </tr>
            <tr>
              <th scope="row">攻撃倍率を掛ける</th>
              <td><code>{format(attack)} × {format(row.attackScalePercent)}%</code></td>
              <td>{format(row.damage.attack)}</td>
            </tr>
            <tr>
              <th scope="row">術耐性無視を反映</th>
              <td><code>max(0, {format(resistance)} − {format(resistanceIgnore)})</code></td>
              <td>{format(row.damage.appliedResistance)}</td>
            </tr>
            <tr>
              <th scope="row">術耐性で軽減</th>
              <td><code>{format(row.damage.attack)} × (1 − {format(row.damage.appliedResistance)} ÷ 100)</code></td>
              <td>{format(afterResistance)}</td>
            </tr>
            <tr>
              <th scope="row">通常攻撃ダメージ（最低保証を反映）</th>
              <td><code>max({format(afterResistance)}, {format(minimumDamage)})</code></td>
              <td>{format(row.damage.result)}</td>
            </tr>
            <tr>
              <th scope="row">通常攻撃になる確率</th>
              <td><code>100% − {formatChance(row.explosionChancePercent)}</code></td>
              <td>{formatChance(row.normalChancePercent)}</td>
            </tr>
            <tr>
              <th scope="row">今回の通常攻撃ダメージの期待値</th>
              <td><code>{format(row.damage.result)} × {formatChance(row.normalChancePercent)}</code></td>
              <td>{format(row.expectedNormalDamage)}</td>
            </tr>
            <tr>
              <th scope="row">累計通常攻撃ダメージの期待値</th>
              <td><code>{format(previousExpectedDamage)} + {format(row.expectedNormalDamage)}</code></td>
              <td>{format(row.cumulativeExpectedNormalDamage)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="gg-damage-detail-notes">
        <p>浮遊ユニット1体が同じ敵を攻撃し続け、倍率{format(model.droneInitialAttackScale * 100)}%から開始する条件です。爆発する回は通常攻撃を行わず、同じ敵なら爆発後も倍率を引き継ぎます。</p>
        <p>初回攻撃は攻撃間隔後、帰還・再索敵にかかる時間は0秒として計算します。</p>
        <p>この表では、爆発する回も倍率を進める攻撃回数に含めます（検証記事の説明に基づく計算条件）。 <a href="https://www.taptap.cn/moment/244077134497186876" target="_blank" rel="noopener noreferrer">倍率・爆発の検証記事</a></p>
        <p>minは小さい方、maxは大きい方の値を採用します。最低保証は{format(row.damage.attack)} × 5% = {format(minimumDamage)}です。表示は概数で、計算には丸める前の数値を使います。</p>
      </div>
    </GoldenglowDetailModal>
  )
}
