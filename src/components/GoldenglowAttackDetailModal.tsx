import { useId, useState } from 'react'
import type { GoldenglowGuideSkill } from '../lib/goldenglowGuideSkill'
import { GoldenglowDetailModal } from './GoldenglowDetailModal'
import { GoldenglowAttackStepPopover } from './GoldenglowAttackStepPopover'
import './GoldenglowExplosionDamageModal.css'
import './GoldenglowAttackDetailModal.css'

const format = (value: number) => new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 }).format(value)

export function GoldenglowAttackDetailModal({ skill, attackOverride, onClose }: {
  skill: GoldenglowGuideSkill
  attackOverride: number | null
  onClose: () => void
}) {
  const titleId = useId()
  const popoverId = `${titleId}-step-detail`
  const [detail, setDetail] = useState<{ key: string; anchor: HTMLButtonElement } | null>(null)
  const { level, base, pipeline, skillBonusPercent, passiveBonusPercent } = skill.attackCalculation
  const afterTrust = base.levelAttack + base.trustAttack
  const afterPotential = afterTrust + base.potentialAttack
  const baseSteps = [
    {
      label: 'レベル攻撃力',
      expression: `昇進2 Lv.${level}`, result: base.levelAttack,
    },
    {
      label: '信頼度攻撃力の加算',
      expression: `${format(base.levelAttack)} + ${format(base.trustAttack)}`, result: afterTrust,
    },
    {
      label: '潜在攻撃力の加算',
      expression: `${format(afterTrust)} + ${format(base.potentialAttack)}`, result: afterPotential,
    },
    {
      label: 'モジュール攻撃力の加算',
      expression: `${format(afterPotential)} + ${format(base.moduleAttack)}`, result: base.beforeRounding,
    },
    {
      label: '基礎攻撃力',
      expression: `round(${format(base.beforeRounding)})`, result: base.result,
    },
  ]
  const steps = [
    {
      key: 'A', label: '攻撃力補正A',
      expression: `${format(pipeline.baseAttack)} + ${format(pipeline.directAddition)}`, result: pipeline.afterDirectAddition,
      description: '割合補正より前に適用する「攻撃力+n」「攻撃力−n」の固定値を合計して加算します。',
      breakdown: [{ label: '固定値の加算合計', value: format(pipeline.directAddition) }],
    },
    {
      key: 'B', label: '攻撃力補正B',
      expression: `${format(pipeline.afterDirectAddition)} × (1 + ${format(pipeline.directMultiplierPercent)} ÷ 100)`, result: pipeline.afterDirectMultiplier,
      description: '「攻撃力+n%」の効果を合計して適用します。選択したスキルの攻撃力上昇は、この補正に含まれます。',
      breakdown: [
        { label: `S${skill.skillIndex}の攻撃力補正（${skill.skillLevelLabel}）`, value: `${format(skillBonusPercent)}%` },
        { label: '特性・素質・モジュール効果の攻撃力補正', value: `${format(passiveBonusPercent)}%` },
        { label: '補正Bの合計', value: `${format(pipeline.directMultiplierPercent)}%` },
      ],
    },
    {
      key: 'C', label: '攻撃力補正C',
      expression: `${format(pipeline.afterDirectMultiplier)} + ${format(pipeline.finalAddition)}`, result: pipeline.afterFinalAddition,
      description: '鼓舞・奪取などの重複規則を適用した後の固定値を、補正Bの後に加算します。このページの条件では0です。',
      breakdown: [{ label: '固定値の加算合計', value: format(pipeline.finalAddition) }],
    },
    {
      key: 'D', label: '攻撃力補正D',
      expression: `max(0, floor(${format(pipeline.afterFinalAddition)} × ${format(pipeline.finalMultiplier)}))`, result: pipeline.afterFinalMultiplier,
      description: '「攻撃力−n%」などの係数を掛け、小数点以下を切り捨てます。結果の下限は0です。低下効果がなければ係数は1ですが、切り捨てはこの段階で行います。',
      breakdown: [
        { label: '補正Dの係数', value: format(pipeline.finalMultiplier) },
        { label: '切り捨て前の攻撃力', value: format(pipeline.afterFinalAddition * pipeline.finalMultiplier) },
      ],
    },
    {
      key: 'E', label: '攻撃力補正E',
      expression: `${format(pipeline.afterFinalMultiplier)} × ${format(pipeline.attackScale)}`, result: pipeline.finalAttack,
      description: '「攻撃力がn%まで上昇」「攻撃力のn%のダメージ」などの倍率を、切り捨て後に掛けます。ここでは各攻撃に共通する攻撃力を求めるため1倍とし、浮遊ユニットの特性倍率・爆発倍率は、それぞれのダメージ計算で適用します。',
      breakdown: [{ label: 'この計算で適用する補正E', value: `${format(pipeline.attackScale * 100)}%` }],
    },
  ]
  const selectedStep = steps.find((step) => step.key === detail?.key)

  return (
    <GoldenglowDetailModal title="最終攻撃力の計算" closeLabel="攻撃力の計算詳細を閉じる" onClose={onClose}>
      <p className="gg-attack-source-note">S{skill.skillIndex} {skill.skillName}・{skill.skillLevelLabel}／昇進2 Lv{level}・信頼100・潜在1・{skill.moduleApplication.moduleName ? `${skill.moduleApplication.moduleName} Lv.${skill.moduleApplication.moduleLevel}` : 'モジュールなし'}</p>
      <h3 className="gg-table-title" id={titleId}>計算フロー</h3>
      <div className="gg-damage-detail-table-wrap" tabIndex={0} role="region" aria-label="最終攻撃力の計算内訳">
        <table className="gg-probability-table gg-damage-detail-table" aria-labelledby={titleId}>
          <thead>
            <tr><th scope="col">計算内容</th><th scope="col">式</th><th scope="col">結果</th></tr>
          </thead>
          <tbody>
            {baseSteps.map((step) => <tr key={step.label}>
              <th scope="row">{step.label}</th>
              <td><code>{step.expression}</code></td>
              <td>{format(step.result)}</td>
            </tr>)}
            {steps.map((step) => <tr key={step.key} className="gg-detail-row" onClick={(event) => {
              const anchor = event.currentTarget.querySelector('button')
              if (!anchor) return
              anchor.focus({ preventScroll: true })
              setDetail((current) => current?.key === step.key ? null : { key: step.key, anchor })
            }}>
              <th scope="row">
                <button type="button" className="gg-detail-trigger" aria-label={`${step.label}の内訳`}
                  aria-haspopup="dialog" aria-expanded={detail?.key === step.key}
                  aria-controls={detail?.key === step.key ? popoverId : undefined}>
                  {step.label}<span aria-hidden="true">›</span>
                </button>
              </th>
              <td><code>{step.expression}</code></td>
              <td>{format(step.result)}</td>
            </tr>)}
            <tr className="gg-attack-final-result">
              <th scope="row">最終攻撃力</th>
              <td>補正E適用後の攻撃力</td>
              <td>{format(skill.effectiveAttack)}</td>
            </tr>
            {attackOverride !== null && <tr>
              <th scope="row">計算に使う攻撃力</th>
              <td>手入力の値を使用</td>
              <td>{format(attackOverride)}</td>
            </tr>}
          </tbody>
        </table>
      </div>
      {detail && selectedStep && <GoldenglowAttackStepPopover
        key={selectedStep.key}
        id={popoverId}
        label={selectedStep.label}
        description={selectedStep.description}
        breakdown={selectedStep.breakdown}
        anchor={detail.anchor}
        onClose={() => setDetail((current) => current?.key === selectedStep.key ? null : current)}
      />}
      <details className="gg-attack-flow-reference">
        <summary>計算記号・参照文書</summary>
        <p>roundは四捨五入、floorは小数点以下の切り捨て、max(0, …)は結果の下限を0にする処理です。補正A〜Eは計算順序を示すための記号です。表示は概数で、計算には表示用に丸める前の値を使います。</p>
        <a href="https://docs.google.com/document/d/1jJgpls4hrtLCNj8CMdIj-URUB3Vdlri-3FWCu2MD00M/edit?tab=t.0" target="_blank" rel="noreferrer">ダメージ計算のフロー</a>
      </details>
    </GoldenglowDetailModal>
  )
}
