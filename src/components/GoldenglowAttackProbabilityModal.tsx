import type { GoldenglowAttackProbabilityDetail, GoldenglowAttackProbabilityState } from '../lib/goldenglowAttackProbability'
import { GoldenglowDetailModal } from './GoldenglowDetailModal'
import './GoldenglowAttackProbabilityModal.css'

const probabilityFormat = new Intl.NumberFormat('ja-JP', { maximumSignificantDigits: 10 })
const formatProbability = (probability: number) => `${probabilityFormat.format(probability * 100)}%`

export function GoldenglowAttackProbabilityModal({ detail, onClose }: {
  detail: GoldenglowAttackProbabilityDetail
  onClose: () => void
}) {
  return (
    <GoldenglowDetailModal
      title={`${detail.attackNumber}回目の爆発確率`}
      closeLabel="爆発確率の詳細を閉じる"
      onClose={onClose}
    >
      <p className="gg-attack-detail-note">最後に爆発した回で履歴をまとめています。それ以前の爆発・不発はすべて含みます。</p>
      <div className="gg-attack-detail-table-wrap" tabIndex={0} role="region" aria-label="爆発確率の計算内訳">
        <table className="gg-probability-table gg-attack-detail-table" aria-label={`${detail.attackNumber}回目の状態別の爆発確率`}>
          <thead>
            <tr>
              <th scope="col">攻撃直前の状態</th>
              <th scope="col">その状態に<br />なる確率</th>
              <th scope="col">その状態での<br />爆発確率</th>
              <th scope="col">掛け合わせた値</th>
            </tr>
          </thead>
          <tbody>
            {detail.states.map((state) => (
              <tr key={state.consecutiveMisses}>
                <th scope="row">{describeState(state, detail.attackNumber)}</th>
                <td>{formatProbability(state.stateProbability)}</td>
                <td>{formatProbability(state.explosionChancePercent / 100)}</td>
                <td>{formatProbability(state.contributionProbability)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="gg-attack-detail-total">
        <span>掛け合わせた値の合計（{detail.states.length}状態）</span>
        <strong>{formatProbability(detail.explosionChancePercent / 100)}</strong>
      </div>
    </GoldenglowDetailModal>
  )
}

function describeState(state: GoldenglowAttackProbabilityState, attackNumber: number): string {
  if (state.lastExplosionAttackNumber === null) {
    if (attackNumber === 1) return '初回攻撃（履歴なし）'
    return attackNumber === 2 ? '1回目は不発' : `1〜${attackNumber - 1}回目はすべて不発`
  }
  const last = state.lastExplosionAttackNumber
  if (state.consecutiveMisses === 0) return `${last}回目に爆発`
  const misses = state.consecutiveMisses === 1
    ? `${last + 1}回目は不発`
    : `${last + 1}〜${attackNumber - 1}回目は不発`
  return `${last}回目に爆発 → ${misses}`
}
