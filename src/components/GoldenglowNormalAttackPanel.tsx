import { useEffect, useMemo, useState } from 'react'
import type { GoldenglowGuideSkill } from '../lib/goldenglowGuideSkill'
import { buildGoldenglowNormalAttackTable } from '../lib/goldenglowNormalAttackTable'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { GoldenglowExpandableTable } from './GoldenglowExpandableTable'
import { GoldenglowNormalAttackDetailModal } from './GoldenglowNormalAttackDetailModal'
import './GoldenglowNormalAttackPanel.css'

const format = (value: number) => new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 }).format(value)
const formatProbability = (percent: number) => `${new Intl.NumberFormat('ja-JP', { maximumSignificantDigits: 4 }).format(percent)}%`

export function GoldenglowNormalAttackPanel({ skill, attack, resistance, resistanceIgnore, viewingDuration, loading }: {
  skill: GoldenglowGuideSkill | null
  attack: number
  resistance: number
  resistanceIgnore: number
  viewingDuration: number
  loading: boolean
}) {
  const [selectedAttackNumber, setSelectedAttackNumber] = useState<number | null>(null)
  const duration = skill?.duration ?? viewingDuration
  const attackRows = useMemo(() => skill ? buildGoldenglowNormalAttackTable({
    model: skill.explosionModel,
    attack,
    attackInterval: skill.attackInterval,
    duration,
    resistance,
    resistanceIgnore,
  }) : [], [skill, attack, duration, resistance, resistanceIgnore])
  const selectedRow = attackRows.find((row) => row.attackNumber === selectedAttackNumber)

  useEffect(() => setSelectedAttackNumber(null), [skill?.skillIndex, attack, duration, resistance, resistanceIgnore])

  return (
    <CollapsibleCalculatorPanel
      id="gg-normal-attacks"
      number="08"
      title="浮遊ユニットの通常攻撃"
      summary={skill ? `S${skill.skillIndex}・浮遊ユニット1体・同一目標` : '浮遊ユニット1体・同一目標'}
      collapsedLabel="テーブルを表示"
    >
      {skill ? <>
        <h3 className="gg-table-title" id="gg-normal-attack-table-title">攻撃ごとの通常攻撃期待値</h3>
        {attackRows.length > 0 ? <GoldenglowExpandableTable
          persistenceId="normal-attacks-rows"
          rows={attackRows}
          regionLabel="スキル中の通常攻撃テーブル"
          tableWrapperClassName="gg-normal-attack-table-wrap"
        >
          {(visibleRows) => <table className="gg-probability-table gg-normal-attack-table" aria-labelledby="gg-normal-attack-table-title">
            <thead>
              <tr>
                <th scope="col">攻撃回数</th>
                <th scope="col">特性倍率</th>
                <th scope="col">通常攻撃<br />ダメージ</th>
                <th scope="col">通常攻撃に<br />なる確率</th>
                <th scope="col">今回の通常攻撃<br />ダメージ期待値</th>
                <th scope="col">累計通常攻撃<br />ダメージ期待値</th>
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
                  <button type="button" className="gg-detail-trigger" aria-label={`${row.attackNumber}回目の通常攻撃の詳細`} aria-haspopup="dialog">
                    {row.attackNumber}回目<span aria-hidden="true">›</span>
                  </button>
                </th>
                <td>{format(row.attackScalePercent)}%</td>
                <td>{format(row.damage.result)}</td>
                <td>{formatProbability(row.normalChancePercent)}</td>
                <td>{format(row.expectedNormalDamage)}</td>
                <td>{format(row.cumulativeExpectedNormalDamage)}</td>
              </tr>)}
            </tbody>
          </table>}
        </GoldenglowExpandableTable> : <p className="gg-probability-intro" role="status">この時間内には攻撃がありません。</p>}
        {selectedRow && <GoldenglowNormalAttackDetailModal
          row={selectedRow}
          attack={attack}
          resistance={resistance}
          resistanceIgnore={resistanceIgnore}
          model={skill.explosionModel}
          onClose={() => setSelectedAttackNumber(null)}
        />}
      </> : <p className="gg-probability-intro" role="status">{loading ? 'スキル情報を読み込み中…' : 'スキル情報の読み込み後に表示します。'}</p>}
    </CollapsibleCalculatorPanel>
  )
}
