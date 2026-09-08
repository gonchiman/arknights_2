import { useEffect, useState } from 'react'
import type { GoldenglowGuideSkill } from '../lib/goldenglowGuideSkill'
import type { GoldenglowCombinedAttackRow } from '../lib/goldenglowCombinedAttackTable'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { GoldenglowExpandableTable } from './GoldenglowExpandableTable'
import { GoldenglowCombinedAttackDetailModal } from './GoldenglowCombinedAttackDetailModal'
import './GoldenglowCombinedAttackPanel.css'

const format = (value: number) => new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 }).format(value)

export function GoldenglowCombinedAttackPanel({ skill, attackRows, attack, explosionDamage, resistance, resistanceIgnore, viewingDuration, onViewingDurationChange, loading }: {
  skill: GoldenglowGuideSkill | null
  attackRows: readonly GoldenglowCombinedAttackRow[]
  attack: number
  explosionDamage: number
  resistance: number
  resistanceIgnore: number
  viewingDuration: number
  onViewingDurationChange: (duration: number) => void
  loading: boolean
}) {
  const [open, setOpen] = useState(true)
  const [selectedAttackNumber, setSelectedAttackNumber] = useState<number | null>(null)
  const duration = skill?.duration ?? viewingDuration
  const selectedRow = attackRows.find((row) => row.attackNumber === selectedAttackNumber)

  useEffect(() => setSelectedAttackNumber(null), [skill?.skillIndex, attack, explosionDamage, duration, resistance, resistanceIgnore])

  return (
    <CollapsibleCalculatorPanel
      id="gg-combined-attacks"
      number="08"
      title="スキルダメージ期待値"
      summary={skill ? `S${skill.skillIndex}・浮遊ユニット${skill.explosionModel.activeDroneCount}体・同一目標` : '本体・浮遊ユニット・爆発'}
      open={open}
      onToggle={() => setOpen((value) => !value)}
      collapsedLabel="テーブルを表示"
    >
      {skill ? <>
        <h3 className="gg-table-title" id="gg-combined-conditions-title">攻撃条件</h3>
        <div className="gg-probability-table-wrap gg-value-table-wrap">
          <table className="gg-probability-table gg-value-table" aria-labelledby="gg-combined-conditions-title">
            <tbody>
              <tr><th scope="row">攻撃間隔</th><td>{format(skill.attackInterval)}秒</td></tr>
              <tr>
                <th scope="row">{skill.duration === null ? '表示時間' : 'スキル時間'}</th>
                <td>{skill.duration === null ? <label className="calculator-field">
                  <span>表示時間</span>
                  <div className="number-input-wrap">
                    <input
                      type="number"
                      aria-label="合計ダメージの表示時間"
                      min={0}
                      max={600}
                      step="any"
                      value={viewingDuration}
                      onChange={(event) => {
                        const value = event.target.valueAsNumber
                        onViewingDurationChange(Number.isFinite(value) ? Math.min(600, Math.max(0, value)) : 0)
                      }}
                    />
                    <em>秒</em>
                  </div>
                </label> : `${format(duration)}秒`}</td>
              </tr>
              <tr><th scope="row">攻撃回数（各ユニット）</th><td>{attackRows.length}回</td></tr>
              <tr><th scope="row">浮遊ユニット数</th><td>{skill.explosionModel.activeDroneCount}体</td></tr>
              <tr><th scope="row">初回の特性倍率（全ユニット）</th><td>{format(skill.explosionModel.droneInitialAttackScalePercent)}%</td></tr>
              <tr><th scope="row">本体攻撃</th><td>{skill.skillIndex === 3 ? 'なし' : 'あり（敵が射程内）'}</td></tr>
            </tbody>
          </table>
        </div>
        <h3 className="gg-table-title" id="gg-combined-attack-table-title">攻撃ごとの合計ダメージ期待値</h3>
        {attackRows.length > 0 ? <GoldenglowExpandableTable
          rows={attackRows}
          regionLabel="スキル中の合計ダメージテーブル"
          tableWrapperClassName="gg-combined-attack-table-wrap"
        >
          {(visibleRows) => <table className="gg-probability-table gg-combined-attack-table" aria-labelledby="gg-combined-attack-table-title">
            <thead>
              <tr>
                <th scope="col">攻撃回数</th>
                <th scope="col">本体</th>
                <th scope="col">浮遊ユニット（{skill.explosionModel.activeDroneCount}体）</th>
                <th scope="col">爆発（{skill.explosionModel.activeDroneCount}体）</th>
                <th scope="col">合計</th>
                <th scope="col">累計</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => <tr
                key={row.attackNumber}
                className="gg-detail-row"
                onClick={(event) => {
                  event.currentTarget.querySelector('button')?.focus({ preventScroll: true })
                  setSelectedAttackNumber(row.attackNumber)
                }}
              >
                <th scope="row">
                  <button type="button" className="gg-detail-trigger" aria-label={`${row.attackNumber}回目の合計ダメージの詳細`} aria-haspopup="dialog">
                    {row.attackNumber}回目<span aria-hidden="true">›</span>
                  </button>
                </th>
                <td>{format(row.expectedBodyDamage)}</td>
                <td>{format(row.expectedDroneNormalDamage)}</td>
                <td>{format(row.expectedExplosionDamage)}</td>
                <td>{format(row.expectedTotalDamage)}</td>
                <td>{format(row.cumulativeExpectedTotalDamage)}</td>
              </tr>)}
            </tbody>
          </table>}
        </GoldenglowExpandableTable> : <p className="gg-probability-intro" role="status">この時間内には攻撃がありません。</p>}
        {selectedRow && <GoldenglowCombinedAttackDetailModal
          row={selectedRow}
          skill={skill}
          attack={attack}
          explosionDamage={explosionDamage}
          resistance={resistance}
          resistanceIgnore={resistanceIgnore}
          onClose={() => setSelectedAttackNumber(null)}
        />}
      </> : <p className="gg-probability-intro" role="status">{loading ? 'スキル情報を読み込み中…' : 'スキル情報の読み込み後に表示します。'}</p>}
    </CollapsibleCalculatorPanel>
  )
}
