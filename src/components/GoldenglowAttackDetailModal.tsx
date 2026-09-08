import { useId } from 'react'
import type { GoldenglowGuideSkill } from '../lib/goldenglowGuideSkill'
import { GoldenglowDetailModal } from './GoldenglowDetailModal'
import './GoldenglowExplosionDamageModal.css'

const format = (value: number) => new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 }).format(value)

export function GoldenglowAttackDetailModal({ skill, attackOverride, onClose }: {
  skill: GoldenglowGuideSkill
  attackOverride: number | null
  onClose: () => void
}) {
  const titleId = useId()
  const { level, base, pipeline, skillBonusPercent, passiveBonusPercent } = skill.attackCalculation
  const baseTerms = [base.levelAttack, base.trustAttack]
  if (base.potentialAttack !== 0) baseTerms.push(base.potentialAttack)
  if (base.moduleAttack !== 0) baseTerms.push(base.moduleAttack)
  const baseExpression = baseTerms.map(format).join(' + ')
  const beforeFloor = pipeline.afterFinalAddition * pipeline.finalMultiplier

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
            <tr>
              <th scope="row">レベル分の攻撃力</th>
              <td>昇進2 Lv{level}</td>
              <td>{format(base.levelAttack)}</td>
            </tr>
            <tr>
              <th scope="row">信頼度の加算</th>
              <td>信頼100</td>
              <td>{format(base.trustAttack)}</td>
            </tr>
            {base.potentialAttack !== 0 && <tr><th scope="row">潜在の加算</th><td>潜在による攻撃力</td><td>{format(base.potentialAttack)}</td></tr>}
            {base.moduleAttack !== 0 && <tr><th scope="row">モジュールの加算</th><td>モジュールによる攻撃力</td><td>{format(base.moduleAttack)}</td></tr>}
            <tr>
              <th scope="row">基礎攻撃力</th>
              <td><code>{baseExpression}{base.beforeRounding !== base.result ? '（四捨五入）' : ''}</code></td>
              <td>{format(base.result)}</td>
            </tr>
            {pipeline.directAddition !== 0 && <tr>
              <th scope="row">素質の固定加算</th>
              <td><code>{format(pipeline.baseAttack)} + {format(pipeline.directAddition)}</code></td>
              <td>{format(pipeline.afterDirectAddition)}</td>
            </tr>}
            {passiveBonusPercent !== 0 && <tr>
              <th scope="row">スキルと素質の補正合計</th>
              <td><code>{format(skillBonusPercent)}% + {format(passiveBonusPercent)}%</code></td>
              <td>{format(pipeline.directMultiplierPercent)}%</td>
            </tr>}
            <tr>
              <th scope="row">{passiveBonusPercent !== 0 ? '攻撃力補正を適用' : `S${skill.skillIndex}の攻撃力補正`}</th>
              <td><code>{format(pipeline.afterDirectAddition)} × (1 + {format(pipeline.directMultiplierPercent)}%)</code></td>
              <td>{format(pipeline.afterDirectMultiplier)}</td>
            </tr>
            <tr>
              <th scope="row">最終攻撃力</th>
              <td><code>{format(beforeFloor)}</code> の小数点以下を切り捨て</td>
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
    </GoldenglowDetailModal>
  )
}
