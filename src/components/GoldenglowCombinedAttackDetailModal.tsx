import { useId } from 'react'
import type { GoldenglowCombinedAttackRow } from '../lib/goldenglowCombinedAttackTable'
import type { GoldenglowGuideSkill } from '../lib/goldenglowGuideSkill'
import { GoldenglowDetailModal } from './GoldenglowDetailModal'
import './GoldenglowExplosionDamageModal.css'
import './GoldenglowCombinedAttackDetailModal.css'

const format = (value: number) => new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 }).format(value)
const probabilityFormat = new Intl.NumberFormat('ja-JP', { maximumSignificantDigits: 8 })
const formatChance = (percent: number) => `${probabilityFormat.format(percent)}%`

export function GoldenglowCombinedAttackDetailModal({ row, skill, attack, explosionDamage, resistance, resistanceIgnore, onClose }: {
  row: GoldenglowCombinedAttackRow
  skill: GoldenglowGuideSkill
  attack: number
  explosionDamage: number
  resistance: number
  resistanceIgnore: number
  onClose: () => void
}) {
  const conditionsTitleId = useId()
  const flowTitleId = useId()
  const normal = row.normalAttack
  const previousTotal = row.cumulativeExpectedTotalDamage - row.expectedTotalDamage

  return (
    <GoldenglowDetailModal
      title={`${row.attackNumber}回目の合計ダメージ`}
      closeLabel="合計ダメージの詳細を閉じる"
      onClose={onClose}
    >
      <h3 className="gg-table-title" id={conditionsTitleId}>この回の条件</h3>
      <div className="gg-combined-conditions-wrap">
        <table className="gg-probability-table gg-combined-conditions-table" aria-labelledby={conditionsTitleId}>
          <tbody>
            <tr><th scope="row">経過時間</th><td>{format(row.elapsedSeconds)}秒</td></tr>
            <tr><th scope="row">浮遊ユニット数</th><td>{row.droneCount}体</td></tr>
            <tr><th scope="row">浮遊ユニットの通常攻撃倍率</th><td>{format(normal.attackScalePercent)}%</td></tr>
            <tr><th scope="row">爆発する確率（1体）</th><td>{formatChance(normal.explosionChancePercent)}</td></tr>
            <tr><th scope="row">通常攻撃になる確率（1体）</th><td>{formatChance(normal.normalChancePercent)}</td></tr>
          </tbody>
        </table>
      </div>
      <h3 className="gg-table-title" id={flowTitleId}>計算フロー</h3>
      <div className="gg-damage-detail-table-wrap" tabIndex={0} role="region" aria-label="本体と浮遊ユニットの合計ダメージの計算内訳">
        <table className="gg-probability-table gg-damage-detail-table gg-combined-damage-detail-table" aria-labelledby={flowTitleId}>
          <thead>
            <tr>
              <th scope="col">計算内容</th>
              <th scope="col">式</th>
              <th scope="col">結果</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">術耐性無視を反映</th>
              <td><code>max(0, {format(resistance)} − {format(resistanceIgnore)})</code></td>
              <td>{format(row.bodyDamage.appliedResistance)}</td>
            </tr>
            <tr>
              <th scope="row">本体の通常攻撃ダメージ</th>
              <td>{row.bodyAttackEnabled
                ? <code>max({format(attack)} × (1 − {format(row.bodyDamage.appliedResistance)} ÷ 100), {format(row.bodyDamage.minimumDamage ?? 0)})</code>
                : `S${skill.skillIndex}は本体攻撃なし`}</td>
              <td>{format(row.expectedBodyDamage)}</td>
            </tr>
            <tr>
              <th scope="row">浮遊ユニット1体の軽減前ダメージ</th>
              <td><code>{format(attack)} × {format(normal.attackScalePercent)}%</code></td>
              <td>{format(normal.damage.attack)}</td>
            </tr>
            <tr>
              <th scope="row">浮遊ユニット1体の通常攻撃ダメージ</th>
              <td><code>max({format(normal.damage.attack)} × (1 − {format(normal.damage.appliedResistance)} ÷ 100), {format(normal.damage.minimumDamage ?? 0)})</code></td>
              <td>{format(normal.damage.result)}</td>
            </tr>
            <tr>
              <th scope="row">浮遊ユニット全体の通常攻撃期待値</th>
              <td><code>{format(normal.damage.result)} × {formatChance(normal.normalChancePercent)} × {row.droneCount}体</code></td>
              <td>{format(row.expectedDroneNormalDamage)}</td>
            </tr>
            <tr>
              <th scope="row">浮遊ユニット全体の爆発期待値</th>
              <td><code>{format(explosionDamage)} × {formatChance(normal.explosionChancePercent)} × {row.droneCount}体</code></td>
              <td>{format(row.expectedExplosionDamage)}</td>
            </tr>
            <tr>
              <th scope="row">今回の合計ダメージ期待値</th>
              <td><code>{format(row.expectedBodyDamage)} + {format(row.expectedDroneNormalDamage)} + {format(row.expectedExplosionDamage)}</code></td>
              <td>{format(row.expectedTotalDamage)}</td>
            </tr>
            <tr>
              <th scope="row">累計ダメージ期待値</th>
              <td><code>{format(previousTotal)} + {format(row.expectedTotalDamage)}</code></td>
              <td>{format(row.cumulativeExpectedTotalDamage)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <details className="gg-combined-detail-assumptions">
        <summary>計算の前提</summary>
        <div className="gg-damage-detail-notes">
          <p>すべての浮遊ユニットが倍率{format(skill.explosionModel.droneInitialAttackScale * 100)}%・爆発確率のリセットから開始し、同じ敵1体を攻撃し続けます。{row.bodyAttackEnabled && '敵は本体の攻撃範囲内にいる条件です。'}</p>
          <p>初回攻撃は攻撃間隔後、帰還・再索敵にかかる時間は0秒として計算します。</p>
          <p>爆発する回は通常攻撃を行いません。爆発する回も倍率を進める攻撃回数に含める条件で、爆発後も同じ敵への倍率を引き継ぎます。</p>
          {skill.duration === null && <p>S2は永続のため、この表は指定した表示時間までを扱います。</p>}
          <p>maxは大きい方の値を採用し、軽減前の5%を最低保証とします。表示は概数で、計算には丸める前の数値を使います。</p>
        </div>
      </details>
    </GoldenglowDetailModal>
  )
}
