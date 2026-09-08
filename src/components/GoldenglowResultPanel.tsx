import { useEffect, useMemo, useState } from 'react'
import { summarizeGoldenglowCombinedAttackTable, type GoldenglowCombinedAttackRow } from '../lib/goldenglowCombinedAttackTable'
import type { GoldenglowGuideSkill } from '../lib/goldenglowGuideSkill'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { GoldenglowDetailModal } from './GoldenglowDetailModal'
import './GoldenglowExplosionDamageModal.css'
import './GoldenglowResultPanel.css'

const format = (value: number) => new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 }).format(value)

export function GoldenglowResultPanel({ skill, attackRows, duration, loading }: {
  skill: GoldenglowGuideSkill | null
  attackRows: readonly GoldenglowCombinedAttackRow[]
  duration: number
  loading: boolean
}) {
  const [open, setOpen] = useState(true)
  const [detail, setDetail] = useState<'total' | 'dps' | null>(null)
  const result = useMemo(() => summarizeGoldenglowCombinedAttackTable(attackRows, duration), [attackRows, duration])
  const permanent = skill?.duration === null
  const totalLabel = permanent ? '表示時間内の期待総ダメージ' : 'スキル期待総ダメージ'
  const dpsLabel = permanent ? '表示時間内の期待DPS' : 'スキル期待DPS'
  const durationLabel = permanent ? '表示時間' : 'スキル時間'
  const resultRows = [
    { key: 'total' as const, label: totalLabel, value: format(result.expectedTotalDamage) },
    { key: 'dps' as const, label: dpsLabel, value: result.expectedDps === null ? '—' : format(result.expectedDps) },
  ]
  const breakdownRows = [
    { label: '本体', value: result.expectedBodyDamage },
    { label: `浮遊ユニット（${skill?.explosionModel.activeDroneCount ?? 0}体）`, value: result.expectedDroneNormalDamage },
    { label: `爆発（${skill?.explosionModel.activeDroneCount ?? 0}体）`, value: result.expectedExplosionDamage },
  ]

  useEffect(() => setDetail(null), [attackRows, duration])

  return (
    <CollapsibleCalculatorPanel
      id="gg-results"
      number="02"
      title="計算結果"
      summary={skill ? `S${skill.skillIndex}・${durationLabel}${format(duration)}秒・敵1体` : 'スキル期待総ダメージ・スキル期待DPS'}
      open={open}
      onToggle={() => setOpen((value) => !value)}
      collapsedLabel="結果を表示"
    >
      {skill ? <>
        <h3 className="gg-table-title" id="gg-results-title">{permanent ? '表示時間内の期待値' : 'スキル期待値'}</h3>
        <div className="gg-probability-table-wrap gg-value-table-wrap">
          <table className="gg-probability-table gg-value-table gg-result-table" aria-labelledby="gg-results-title">
            <tbody>
              {resultRows.map((row) => <tr
                key={row.key}
                className="gg-detail-row"
                onClick={(event) => {
                  event.currentTarget.querySelector('button')?.focus({ preventScroll: true })
                  setDetail(row.key)
                }}
              >
                <th scope="row"><button type="button" className="gg-detail-trigger" aria-label={`${row.label}の計算詳細`} aria-haspopup="dialog">
                  {row.label}<span aria-hidden="true">›</span>
                </button></th>
                <td>{row.value}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
        <h3 className="gg-table-title" id="gg-results-breakdown-title">ダメージ内訳</h3>
        <div className="gg-probability-table-wrap gg-value-table-wrap gg-result-breakdown-wrap">
          <table className="gg-probability-table gg-value-table" aria-labelledby="gg-results-breakdown-title">
            <tbody>
              {breakdownRows.map((row) => <tr key={row.label}><th scope="row">{row.label}</th><td>{format(row.value)}</td></tr>)}
            </tbody>
          </table>
        </div>
        {detail && <GoldenglowDetailModal
          title={`${detail === 'total' ? totalLabel : dpsLabel}の計算`}
          closeLabel="計算結果の詳細を閉じる"
          onClose={() => setDetail(null)}
        >
          <h3 className="gg-table-title" id="gg-result-detail-conditions-title">計算条件</h3>
          <div className="gg-probability-table-wrap gg-value-table-wrap">
            <table className="gg-probability-table gg-value-table" aria-labelledby="gg-result-detail-conditions-title">
              <tbody>
                <tr><th scope="row">{durationLabel}</th><td>{format(duration)}秒</td></tr>
                <tr><th scope="row">攻撃回数（各ユニット）</th><td>{attackRows.length}回</td></tr>
              </tbody>
            </table>
          </div>
          <h3 className="gg-table-title" id="gg-result-detail-flow-title">計算フロー</h3>
          <div className="gg-damage-detail-table-wrap" tabIndex={0} role="region" aria-label="計算結果の計算フロー">
            <table className="gg-probability-table gg-damage-detail-table" aria-labelledby="gg-result-detail-flow-title">
              <thead><tr><th scope="col">計算内容</th><th scope="col">式</th><th scope="col">結果</th></tr></thead>
              <tbody>
                {detail === 'total' && breakdownRows.map((row) => <tr key={row.label}>
                  <th scope="row">{row.label}</th><td>各攻撃のダメージ期待値を合算</td><td>{format(row.value)}</td>
                </tr>)}
                <tr>
                  <th scope="row">{totalLabel}</th>
                  <td><code>{format(result.expectedBodyDamage)} + {format(result.expectedDroneNormalDamage)} + {format(result.expectedExplosionDamage)}</code></td>
                  <td>{format(result.expectedTotalDamage)}</td>
                </tr>
                {detail === 'dps' && <tr>
                  <th scope="row">{dpsLabel}</th>
                  <td>{result.expectedDps === null ? '表示時間が0秒のため計算できません' : <code>{format(result.expectedTotalDamage)} ÷ {format(duration)}秒</code>}</td>
                  <td>{result.expectedDps === null ? '—' : format(result.expectedDps)}</td>
                </tr>}
              </tbody>
            </table>
          </div>
          <details className="gg-result-assumptions">
            <summary>計算の前提</summary>
            <div className="gg-damage-detail-notes">
              <p>総ダメージは「攻撃ごとの合計ダメージ期待値」テーブルの最終行の累計と同じ値です。「浮遊ユニット」は爆発分を含みません。</p>
              <p>DPSは攻撃していない時間も含めた{durationLabel}全体で割ります。{permanent && 'S2は永続のため、指定した表示時間内の結果です。'}</p>
              <p>全浮遊ユニットが特性倍率{format(skill.explosionModel.droneInitialAttackScalePercent)}%・爆発確率のリセットから開始し、同じ敵1体を攻撃し続ける条件です。初回攻撃は攻撃間隔後、帰還・再索敵は0秒として計算します。</p>
              <p>表示は概数です。計算には丸める前の数値を使います。</p>
            </div>
          </details>
        </GoldenglowDetailModal>}
      </> : <p className="gg-probability-intro" role="status">{loading ? 'スキル情報を読み込み中…' : 'スキル情報の読み込み後に表示します。'}</p>}
    </CollapsibleCalculatorPanel>
  )
}
