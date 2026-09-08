import { useId } from 'react'
import type { calculateDamageBreakdown } from '../lib/damageCalculator'
import { GoldenglowDetailModal } from './GoldenglowDetailModal'
import './GoldenglowExplosionDamageModal.css'

const format = (value: number) => new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 }).format(value)

export function GoldenglowExplosionDamageModal({ attack, explosionScale, resistance, resistanceIgnore, damage, onClose }: {
  attack: number
  explosionScale: number
  resistance: number
  resistanceIgnore: number
  damage: ReturnType<typeof calculateDamageBreakdown>
  onClose: () => void
}) {
  const flowTitleId = useId()
  const afterResistance = damage.afterResistance ?? 0
  const minimumDamage = damage.minimumDamage ?? 0

  return (
    <GoldenglowDetailModal
      title="単発爆発ダメージの詳細"
      closeLabel="単発爆発ダメージの詳細を閉じる"
      onClose={onClose}
    >
      <h3 className="gg-table-title" id={flowTitleId}>計算フロー</h3>
      <div className="gg-damage-detail-table-wrap" tabIndex={0} role="region" aria-label="単発爆発ダメージの計算内訳">
        <table className="gg-probability-table gg-damage-detail-table" aria-labelledby={flowTitleId}>
          <thead>
            <tr>
              <th scope="col">計算内容</th>
              <th scope="col">式</th>
              <th scope="col">結果</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">爆発倍率を掛ける</th>
              <td><code>{format(attack)} × {format(explosionScale)}%</code></td>
              <td>{format(damage.attack)}</td>
            </tr>
            <tr>
              <th scope="row">術耐性無視を反映</th>
              <td><code>max(0, {format(resistance)} − {format(resistanceIgnore)})</code></td>
              <td>{format(damage.appliedResistance)}</td>
            </tr>
            <tr>
              <th scope="row">術耐性で軽減</th>
              <td><code>{format(damage.attack)} × (1 − {format(damage.appliedResistance)} ÷ 100)</code></td>
              <td>{format(afterResistance)}</td>
            </tr>
            <tr>
              <th scope="row">5%の最低保証</th>
              <td><code>{format(damage.attack)} × 5%</code></td>
              <td>{format(minimumDamage)}</td>
            </tr>
            <tr>
              <th scope="row">単発爆発ダメージ</th>
              <td><code>max({format(afterResistance)}, {format(minimumDamage)})</code></td>
              <td>{format(damage.result)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="gg-damage-detail-notes">
        <p>maxは、大きい方の値を採用します。術耐性は0を下限とし、軽減後のダメージと軽減前の5%を比べて、単発爆発ダメージを決めます。</p>
        <p>攻撃力・爆発倍率・術耐性無視は、選択したスキルとモジュールを反映します。手入力で変更した場合は、その値を使います。</p>
        <p>術ダメージ・敵1体あたり。表示は小数第3位までの概数です。</p>
      </div>
    </GoldenglowDetailModal>
  )
}
