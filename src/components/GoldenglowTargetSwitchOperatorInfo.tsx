import { useState, type ReactNode } from 'react'
import type { GoldenglowGuideSkill } from '../lib/goldenglowGuideSkill'
import { GoldenglowAttackDetailModal } from './GoldenglowAttackDetailModal'
import { GoldenglowDetailModal } from './GoldenglowDetailModal'

type OperatorDetail = 'attack' | 'interval' | 'duration' | 'drones' | 'resistance'
type InfoRow = readonly [label: string, value: ReactNode]
const numberFormat = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 })
const format = (value: number) => numberFormat.format(value)

export function GoldenglowTargetSwitchOperatorInfo({ skill }: { skill: GoldenglowGuideSkill }) {
  const [detail, setDetail] = useState<OperatorDetail | null>(null)
  const model = skill.explosionModel
  const duration = skill.skillIndex === 2 ? '永続' : skill.duration === null ? '—' : `${format(skill.duration)}秒`
  const bodyAttack = skill.skillIndex === 3 ? 'なし' : 'あり'
  const rows: readonly { key: OperatorDetail; label: string; value: ReactNode }[] = [
    { key: 'attack', label: 'スキル中の攻撃力', value: format(skill.effectiveAttack) },
    { key: 'interval', label: '攻撃間隔', value: `${format(skill.attackInterval)}秒` },
    { key: 'duration', label: 'スキル持続時間', value: duration },
    { key: 'drones', label: '浮遊ユニット数 / 本体攻撃', value: `${format(model.activeDroneCount)}体 / ${bodyAttack}` },
    { key: 'resistance', label: '術耐性の固定無視', value: format(model.resistanceIgnoreFixed) },
  ]
  const selected = rows.find((row) => row.key === detail)
  const closeDetail = () => setDetail(null)

  return <section className="calculator-panel ggs-operator-info" aria-labelledby="ggs-operator-info-title">
    <h2 id="ggs-operator-info-title">オペレーター情報</h2>
    <div className="gg-probability-table-wrap gg-value-table-wrap">
      <table className="gg-probability-table gg-value-table" aria-labelledby="ggs-operator-info-title">
        <tbody>{rows.map((row) => <tr key={row.key} className="gg-detail-row" onClick={(event) => {
          if (event.target instanceof Element && event.target.closest('button')) return
          event.currentTarget.querySelector('button')?.focus({ preventScroll: true })
          setDetail(row.key)
        }}>
          <th scope="row"><button type="button" className="gg-detail-trigger" aria-label={`${row.label}の詳細`} aria-haspopup="dialog" onClick={() => setDetail(row.key)}>
            {row.label}<span aria-hidden="true">›</span>
          </button></th>
          <td>{row.value}</td>
        </tr>)}</tbody>
      </table>
    </div>
    {detail === 'attack' && <GoldenglowAttackDetailModal skill={skill} attackOverride={null} onClose={closeDetail} />}
    {detail && detail !== 'attack' && selected && <GoldenglowDetailModal title={selected.label} closeLabel={`${selected.label}の詳細を閉じる`} onClose={closeDetail}>
      <div className="ggs-detail-content">
        {detail === 'interval' && <>
          <InfoTable title="選択中のスキルの攻撃間隔" rows={[[selected.label, selected.value]]} />
          <p>選択したスキル・スキルレベル・モジュールの条件から求めた攻撃間隔です。スキル中の攻撃速度補正を含みます。</p>
          <p>表示は小数第3位までに丸めています。計算には丸め前の値を使います。</p>
        </>}
        {detail === 'duration' && <>
          <InfoTable title={`S${skill.skillIndex}の効果時間`} rows={[[selected.label, selected.value]]} />
          <p>{skill.skillIndex === 2 ? 'S2は効果時間が無制限の永続スキルです。' : `S${skill.skillIndex} ${skill.skillLevelLabel}のスキル持続時間です。`}発動前にSPを貯める時間は含みません。</p>
        </>}
        {detail === 'drones' && <>
          <InfoTable title="浮遊ユニットと本体の攻撃" rows={[
            ['スキル中の浮遊ユニット数', `${format(model.activeDroneCount)}体`],
            ['本体の攻撃', bodyAttack],
            ['通常攻撃の初期倍率', `${format(model.droneInitialAttackScale * 100)}%`],
            ['通常攻撃ごとの増加', `${format(model.droneAttackScaleStep * 100)}ポイント`],
            ['通常攻撃の最大倍率', `${format(model.droneMaxAttackScale * 100)}%`],
            ['爆発の攻撃倍率', `${format(model.attackScale * 100)}%`],
          ]} />
          <p>通常攻撃倍率は浮遊ユニットごとに扱います。爆発は、その浮遊ユニットの通常攻撃を置き換えます。{skill.skillIndex === 3 ? 'S3中は本体が攻撃せず、浮遊ユニットが攻撃します。' : '選択中のスキルでは、本体も攻撃します。'}</p>
        </>}
        {detail === 'resistance' && <>
          <InfoTable title="術耐性を無視する値" rows={[[selected.label, selected.value]]} />
          <p>ダメージ計算時に、敵の術耐性から{format(model.resistanceIgnoreFixed)}を差し引きます。割合ではなく固定値で、適用する術耐性の下限は0です。</p>
          <p className="ggs-detail-equation">適用術耐性 = max（0, 敵術耐性 − {format(model.resistanceIgnoreFixed)}）</p>
        </>}
      </div>
    </GoldenglowDetailModal>}
  </section>
}

function InfoTable({ title, rows }: { title: string; rows: readonly InfoRow[] }) {
  return <>
    <h3 className="gg-table-title">{title}</h3>
    <div className="gg-probability-table-wrap gg-value-table-wrap">
      <table className="gg-probability-table gg-value-table">
        <caption className="visually-hidden">{title}</caption>
        <tbody>{rows.map(([label, value]) => <tr key={label}><th scope="row">{label}</th><td>{value}</td></tr>)}</tbody>
      </table>
    </div>
  </>
}
