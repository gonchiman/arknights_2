import { useEffect, useState } from 'react'
import type { GoldenglowGuideSkill } from '../lib/goldenglowGuideSkill'
import type { GoldenglowCombinedAttackRow } from '../lib/goldenglowCombinedAttackTable'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { GoldenglowExpandableTable } from './GoldenglowExpandableTable'
import { GoldenglowCombinedAttackDetailModal } from './GoldenglowCombinedAttackDetailModal'
import './GoldenglowCombinedAttackPanel.css'

const format = (value: number) => new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 }).format(value)

export function GoldenglowCombinedAttackPanel({ skill, attackRows, attack, explosionDamage, resistance, resistanceIgnore, viewingDuration, loading }: {
  skill: GoldenglowGuideSkill | null
  attackRows: readonly GoldenglowCombinedAttackRow[]
  attack: number
  explosionDamage: number
  resistance: number
  resistanceIgnore: number
  viewingDuration: number
  loading: boolean
}) {
  const [selectedAttackNumber, setSelectedAttackNumber] = useState<number | null>(null)
  const duration = skill?.duration ?? viewingDuration
  const selectedRow = attackRows.find((row) => row.attackNumber === selectedAttackNumber)

  useEffect(() => setSelectedAttackNumber(null), [skill?.skillIndex, attack, explosionDamage, duration, resistance, resistanceIgnore])

  return (
    <CollapsibleCalculatorPanel
      id="gg-combined-attacks"
      number="09"
      title="スキルダメージ期待値"
      summary={skill ? `S${skill.skillIndex}・浮遊ユニット${skill.explosionModel.activeDroneCount}体・同一目標` : '本体・浮遊ユニット・爆発'}
      collapsedLabel="テーブルを表示"
    >
      {skill ? <>
        <h3 className="gg-table-title" id="gg-combined-attack-table-title">攻撃ごとの合計ダメージ期待値</h3>
        {attackRows.length > 0 ? <GoldenglowExpandableTable
          persistenceId="combined-attacks-rows"
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
