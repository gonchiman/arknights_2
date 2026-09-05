import { useId } from 'react'
import type { DamageSensitivityMetric } from '../lib/damageSensitivity'
import {
  MECH_ACCORD_ATTACK_COUNTS,
  getMechAccordMultiplierPercent,
  type MechAccordAttackCount,
  type MechAccordDamageRowsResult,
  type MechAccordResistanceTableResult,
} from '../lib/mechAccordDamage'

const tableNumberFormatter = new Intl.NumberFormat('ja-JP', {
  maximumFractionDigits: 1,
  useGrouping: false,
})

function formatTableNumber(value: number | null): string {
  return value !== null && Number.isFinite(value) ? tableNumberFormatter.format(value) : '—'
}

const commonNote = '同一対象に全ユニットが同じ回数だけ連続攻撃した場合の値です。対象変更時は1回目へ戻ります。選択モジュールの本体攻撃力補正を含みます。浮遊ユニット固有のモジュール補正、自爆などの追加ダメージは含みません。'

export function MechAccordAttackCountTable({
  result,
  attackLabel,
}: {
  result: MechAccordDamageRowsResult
  attackLabel: string
}) {
  const outputId = useId()
  const headingId = `${outputId}-heading`
  const noteId = `${outputId}-note`
  const hasMinimumDamage = result.rows.some((row) => row.minimumReached)
  const droneLabel = `浮遊${result.droneCount}体`
  const mainLabel = result.mainAttackEnabled ? '本体' : '本体（攻撃停止）'

  return (
    <section className="mech-accord-output" aria-labelledby={headingId}>
      <div className="mech-accord-output-heading">
        <h3 id={headingId}>攻撃回数別ダメージ</h3>
        <p>{attackLabel} · 1攻撃あたり · {mainLabel} {formatTableNumber(result.mainDamage.result)} ＋ {droneLabel} · 術耐性0</p>
      </div>
      {hasMinimumDamage && (
        <div className="mech-accord-table-meta-row">
          <span className="minimum-damage-legend">赤字：最低保証ダメージ（合計は最低保証を含む）</span>
        </div>
      )}
      <div className="mech-accord-table-wrap" role="region" aria-labelledby={headingId} tabIndex={0}>
        <table className="mech-accord-table mech-accord-attack-count-table" aria-describedby={noteId}>
          <caption className="visually-hidden">{attackLabel}・術耐性0の攻撃回数別ダメージ</caption>
          <thead>
            <tr>
              <th scope="col">攻撃回数</th>
              <th scope="col">{mainLabel}</th>
              <th scope="col">{droneLabel}</th>
              <th scope="col">本体＋浮遊</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => (
              <tr key={row.attackCount}>
                <th scope="row" aria-label={row.attackCount === MECH_ACCORD_ATTACK_COUNTS.length ? '8回目以降' : `${row.attackCount}回目`}>{row.attackCount}</th>
                <td aria-label={`${mainLabel} ${formatTableNumber(result.mainDamage.result)}`}>
                  <strong className="mech-accord-cell-value">{formatTableNumber(result.mainDamage.result)}</strong>
                </td>
                <td
                  className={row.minimumReached ? 'mech-accord-minimum' : undefined}
                  aria-label={`${droneLabel} ${formatTableNumber(row.droneDamage)}、1体の攻撃倍率 ${row.multiplierPercent}%${row.minimumReached ? '、最低保証ダメージ' : ''}`}
                >
                  <strong className="mech-accord-cell-value">{formatTableNumber(row.droneDamage)}</strong>
                </td>
                <td
                  className={row.minimumReached ? 'mech-accord-minimum' : undefined}
                  aria-label={`本体＋浮遊 ${formatTableNumber(row.combinedDamage)}${row.minimumReached ? '、最低保証ダメージを含む' : ''}`}
                >
                  <strong className="mech-accord-cell-value">{formatTableNumber(row.combinedDamage)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mech-accord-note" id={noteId}>
        攻撃回数の「8」は8回目以降を表します。浮遊ユニット1体の倍率（1〜8回目）：
        {result.rows.map((row) => `${row.multiplierPercent}%`).join(' / ')}。{commonNote}
      </p>
    </section>
  )
}

export function MechAccordDefaultTable({
  result,
  attackLabel,
  onAttackCountChange,
  attackInterval,
  duration,
  allowTotal,
  metric,
  onMetricChange,
}: {
  result: MechAccordResistanceTableResult
  attackLabel: string
  onAttackCountChange: (count: MechAccordAttackCount) => void
  attackInterval: number
  duration: number
  allowTotal: boolean
  metric: DamageSensitivityMetric
  onMetricChange: (metric: DamageSensitivityMetric) => void
}) {
  const outputId = useId()
  const headingId = `${outputId}-heading`
  const noteId = `${outputId}-note`
  const projectionNoteId = `${outputId}-projection-note`
  const attackCountSelectId = `${outputId}-attack-count`
  const tableId = `${outputId}-table`
  const effectiveMetric = metric === 'TOTAL' && !allowTotal ? 'DAMAGE' : metric
  const metricLabel = effectiveMetric === 'TOTAL' ? '総ダメージ（理論値）' : effectiveMetric === 'DPS' ? 'DPS（理論値）' : '1攻撃あたり'
  const hasMinimumDamage = result.rows.some((row) => row.combinedMinimumReached)
  const droneLabel = `浮遊${result.droneCount}体`
  const mainLabel = result.mainAttackEnabled ? '本体' : '本体（攻撃停止）'
  const validInterval = Number.isFinite(attackInterval) && attackInterval > 0
  const validDuration = Number.isFinite(duration) && duration > 0
  const projectDamage = (value: number): number | null => {
    if (effectiveMetric === 'DAMAGE') return value
    if (!validInterval) return null
    const dps = value / attackInterval
    return effectiveMetric === 'TOTAL' ? validDuration ? dps * duration : null : dps
  }

  return (
    <section className="mech-accord-output" aria-labelledby={headingId}>
      <div className="mech-accord-output-heading">
        <h3 id={headingId}>メイン出力</h3>
        <p aria-live="polite">{attackLabel} · {metricLabel} · {result.attackCountLabel} · {droneLabel}（1体 {result.multiplierPercent}%） · 術</p>
      </div>
      <div className="sensitivity-toolbar">
        <div className="mech-accord-attack-count-control">
          <label htmlFor={attackCountSelectId}>攻撃回数</label>
          <select
            id={attackCountSelectId}
            value={result.attackCount}
            aria-controls={tableId}
            onChange={(event) => onAttackCountChange(Number(event.target.value) as MechAccordAttackCount)}
          >
            {MECH_ACCORD_ATTACK_COUNTS.map((attackCount) => (
              <option value={attackCount} key={attackCount}>
                {attackCount === MECH_ACCORD_ATTACK_COUNTS.length ? '8回目以降' : `${attackCount}回目`}
                （{getMechAccordMultiplierPercent(attackCount)}%）
              </option>
            ))}
          </select>
        </div>
        <div className="sensitivity-control">
          <span>表示内容</span>
          <div className="sensitivity-metric-switch" role="group" aria-label="表の表示内容">
            {(['DAMAGE', 'DPS', 'TOTAL'] as const).map((option) => (
              <button
                type="button"
                key={option}
                className={effectiveMetric === option ? 'active' : ''}
                aria-pressed={effectiveMetric === option}
                aria-controls={tableId}
                disabled={option === 'TOTAL' && !allowTotal}
                onClick={() => onMetricChange(option)}
              >{option === 'DAMAGE' ? '1攻撃' : option === 'DPS' ? 'DPS' : '総ダメージ'}</button>
            ))}
          </div>
        </div>
      </div>
      {effectiveMetric !== 'DAMAGE' && (
        <p className="sensitivity-metric-note" id={projectionNoteId}>
          選択した攻撃回数の倍率を固定し、1攻撃のダメージを攻撃間隔で割った理論DPSです。
          {effectiveMetric === 'TOTAL' && '総ダメージは、このDPSにスキル時間を掛けた理論値です。'}
          初撃からの倍率上昇、自爆、対象変更や自爆による倍率リセットは反映しません。
          {!validInterval && '攻撃間隔を取得できないため算出できません。'}
          {effectiveMetric === 'TOTAL' && !validDuration && 'スキル時間を取得できないため算出できません。'}
        </p>
      )}
      {hasMinimumDamage && (
        <div className="mech-accord-table-meta-row">
          <span className="minimum-damage-legend">赤字：最低保証ダメージを基に算出（合計は最低保証を含む）</span>
        </div>
      )}
      <div className="mech-accord-table-wrap" role="region" aria-label={`${result.attackCountLabel}の術耐性別${metricLabel}表`} tabIndex={0}>
        <table
          className="mech-accord-table mech-accord-resistance-table"
          id={tableId}
          aria-describedby={effectiveMetric === 'DAMAGE' ? noteId : `${projectionNoteId} ${noteId}`}
        >
          <caption className="visually-hidden">{attackLabel}・{result.attackCountLabel}の術耐性別{metricLabel}</caption>
          <thead>
            <tr>
              <th scope="col">術耐性（%）</th>
              <th scope="col">{mainLabel}</th>
              <th scope="col">{droneLabel}</th>
              <th scope="col">本体＋浮遊</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => (
              <tr key={row.resistance}>
                <th scope="row">{formatTableNumber(row.resistance)}</th>
                <td
                  className={row.mainMinimumReached ? 'mech-accord-minimum' : undefined}
                  aria-label={`${mainLabel} ${formatTableNumber(projectDamage(row.mainDamage))}${row.mainMinimumReached ? '、最低保証ダメージを基に算出' : ''}`}
                >
                  <strong className="mech-accord-cell-value">{formatTableNumber(projectDamage(row.mainDamage))}</strong>
                </td>
                <td
                  className={row.droneMinimumReached ? 'mech-accord-minimum' : undefined}
                  aria-label={`${droneLabel} ${formatTableNumber(projectDamage(row.droneDamage))}、1体の攻撃倍率 ${result.multiplierPercent}%${row.droneMinimumReached ? '、最低保証ダメージを基に算出' : ''}`}
                >
                  <strong className="mech-accord-cell-value">{formatTableNumber(projectDamage(row.droneDamage))}</strong>
                </td>
                <td
                  className={row.combinedMinimumReached ? 'mech-accord-minimum' : undefined}
                  aria-label={`本体＋浮遊 ${formatTableNumber(projectDamage(row.combinedDamage))}${row.combinedMinimumReached ? '、最低保証ダメージを含む' : ''}`}
                >
                  <strong className="mech-accord-cell-value">{formatTableNumber(projectDamage(row.combinedDamage))}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mech-accord-note" id={noteId}>{commonNote}</p>
    </section>
  )
}
