import { useState } from 'react'
import type { SurtrSkillDpsCalculation, SurtrSkillDpsModel } from '../lib/surtrSkillComparison'
import { GoldenglowDetailModal } from './GoldenglowDetailModal'
import './GoldenglowGuidePage.css'
import './GoldenglowExplosionDamageModal.css'
import './SurtrDpsDetailModal.css'

export interface SurtrSkillComparisonDetailSnapshot {
  resistance: number
  conditions: string
  initialSeriesId: string
  initialSkill: 2 | 3
  entries: { id: string; label: string; color: string;
    s2: { model: SurtrSkillDpsModel; calculation: SurtrSkillDpsCalculation };
    s3: { model: SurtrSkillDpsModel; calculation: SurtrSkillDpsCalculation } }[]
}

const number = (value: number) => new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 6 }).format(value)

export function SurtrSkillComparisonDetail({ snapshot, onClose }: { snapshot: SurtrSkillComparisonDetailSnapshot; onClose: () => void }) {
  const [selectedId, setSelectedId] = useState(snapshot.initialSeriesId)
  const [skill, setSkill] = useState<2 | 3>(snapshot.initialSkill)
  const selected = snapshot.entries.find(item => item.id === selectedId) ?? snapshot.entries[0]
  if (!selected) return null
  const { model, calculation: result } = skill === 2 ? selected.s2 : selected.s3
  const base = model.operatorStats.baseAttackBreakdown
  const buffs = result.externalBuffs
  const attackRows = buffs.attackPercent || buffs.attackAddition ? [
    { label: '攻撃力の割合補正', formula: `${number(model.baseAttack)} × (1 + (${number(model.skillAttackBonusPercent)}（S${skill}）+ ${number(buffs.attackPercent)}（外部バフ）) ÷ 100)`, value: number(result.attackPipeline.afterDirectMultiplier) },
    ...(buffs.attackAddition ? [{ label: '攻撃力の固定加算', formula: `${number(result.attackPipeline.afterDirectMultiplier)} + ${number(buffs.attackAddition)}`, value: number(result.attackPipeline.afterFinalAddition) }] : []),
    { label: '攻撃力（切り捨て）', formula: `${number(result.attackPipeline.afterFinalAddition)} の小数点以下を切り捨て`, value: number(result.effectiveAttack) },
  ] : [{ label: `S${skill}の攻撃力補正`, formula: `${number(model.baseAttack)} × (1 + ${number(model.skillAttackBonusPercent)} ÷ 100) の小数点以下を切り捨て`, value: number(result.effectiveAttack) }]
  const rows = [
    { label: '基礎攻撃力', formula: `${number(base.levelAttack)}（レベル）+ ${number(base.trustAttack)}（信頼）+ ${number(base.potentialAttack)}（潜在）+ ${number(base.moduleAttack)}（MOD）を四捨五入`, value: number(model.baseAttack) },
    ...attackRows,
    { label: skill === 2 ? 'S2の単体時倍率' : '攻撃倍率', formula: `${number(result.effectiveAttack)} × ${number(result.attackScale)}${skill === 2 ? `（攻撃対象${result.attackTargetCount}体）` : ''}`, value: number(result.attackPipeline.finalAttack) },
    { label: '術耐性無視', formula: `${number(snapshot.resistance)} − ${number(model.resistanceIgnore)}（0未満は0）`, value: number(result.mitigation.appliedResistance) },
    { label: '術ダメージ', formula: `${number(result.attackPipeline.finalAttack)} × (1 − ${number(result.mitigation.appliedResistance)} ÷ 100)、最低保証5%を適用`, value: number(result.unblockedTargetDamage) },
    { label: '攻撃対象数', formula: `範囲内${result.enemyCount}体、S${skill}の上限${model.maximumTargets}体`, value: String(result.attackTargetCount) },
    ...(result.blockedTargetCount ? [{ label: '自身でブロックする1体', formula: `${number(result.unblockedTargetDamage)} × ${number(1 + model.artsFragility)}`, value: number(result.blockedTargetDamage) }] : []),
    { label: '1回の攻撃の合計ダメージ', formula: [result.unblockedTargetCount ? `${number(result.unblockedTargetDamage)} × ${result.unblockedTargetCount}体` : '', result.blockedTargetCount ? `${number(result.blockedTargetDamage)} × ${result.blockedTargetCount}体` : ''].filter(Boolean).join(' + '), value: number(result.damagePerAttack) },
    { label: '攻撃速度', formula: `${number(model.operatorStats.baseAttackSpeed)} + ${number(model.operatorStats.attackSpeedBonus)}${model.remnantActive ? `（余燼の加速${number(model.remnantAttackSpeedBonus)}を含む）` : ''}${buffs.attackSpeed ? ` + ${number(buffs.attackSpeed)}（外部バフ）` : ''}`, value: number(result.attackSpeed) },
    { label: '攻撃間隔', formula: `${number(model.operatorStats.baseAttackTime)} × 100 ÷ ${number(Math.max(20, result.attackSpeed))}`, value: `${number(result.attackInterval)} 秒` },
    { label: '合計DPS', formula: `${number(result.damagePerAttack)} ÷ ${number(result.attackInterval)}`, value: number(result.totalDps) },
  ]
  const ratio = selected.s3.calculation.totalDps ? selected.s2.calculation.totalDps / selected.s3.calculation.totalDps * 100 : null
  return <GoldenglowDetailModal title={`術耐性 ${snapshot.resistance}のDPS計算`} closeLabel="DPS計算を閉じる" onClose={onClose} closeOnContextMenu className="surtr-dps-detail">
    <p className="surtr-dps-detail-conditions">{snapshot.conditions}</p>
    <div className="surtr-dps-detail-modules" role="group" aria-label="計算を確認するMOD">
      {snapshot.entries.map(item => <button key={item.id} type="button" aria-pressed={item.id === selected.id} onClick={() => setSelectedId(item.id)}><i style={{ backgroundColor: item.color }} aria-hidden="true" />{item.label}</button>)}
    </div>
    <div className="surtr-dps-detail-modules" role="group" aria-label="計算を確認するスキル">
      {([2, 3] as const).map(index => <button key={index} type="button" aria-pressed={index === skill} onClick={() => setSkill(index)}>S{index}</button>)}
    </div>
    <div className="gg-damage-detail-table-wrap" tabIndex={0} role="region" aria-label={`${selected.label} S${skill}の計算フロー`}>
      <table className="gg-probability-table gg-damage-detail-table"><thead><tr><th scope="col">計算内容</th><th scope="col">式</th><th scope="col">結果</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.label}><th scope="row">{row.label}</th><td>{row.formula}</td><td>{row.value}</td></tr>)}
          <tr><th scope="row">S2 − S3</th><td>{number(selected.s2.calculation.totalDps)} − {number(selected.s3.calculation.totalDps)}</td><td>{number(selected.s2.calculation.totalDps - selected.s3.calculation.totalDps)}</td></tr>
          <tr><th scope="row">S2 / S3（％）</th><td>{number(selected.s2.calculation.totalDps)} ÷ {number(selected.s3.calculation.totalDps)} × 100</td><td>{ratio === null ? '—' : `${number(ratio)}%`}</td></tr>
        </tbody>
      </table>
    </div>
  </GoldenglowDetailModal>
}
