import { useState } from 'react'
import type { SurtrDpsCalculationBreakdown } from '../lib/surtrDpsCalculation'
import type { SurtrDpsMetric } from '../lib/surtrDpsOutput'
import { GoldenglowDetailModal } from './GoldenglowDetailModal'
import './GoldenglowGuidePage.css'
import './GoldenglowExplosionDamageModal.css'
import './SurtrDpsDetailModal.css'

export interface SurtrDpsDetailSnapshot {
  resistance: number
  conditions: string
  series: { id: string; label: string; color: string; calculation: SurtrDpsCalculationBreakdown; value: number | null }[]
  initialSeriesId: string
  metric: SurtrDpsMetric
  baselineId: string
  precision: number
}

const number = (value: number) => new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 6 }).format(value)

export function SurtrDpsDetailModal({ snapshot, onClose }: { snapshot: SurtrDpsDetailSnapshot; onClose: () => void }) {
  const [selectedId, setSelectedId] = useState(snapshot.initialSeriesId)
  const selected = snapshot.series.find(item => item.id === selectedId) ?? snapshot.series[0]
  if (!selected) return null
  const calculation = selected.calculation
  const { baseAttack: base, attackPipeline: attack, mitigation, artsFragilityMultiplier } = calculation
  const baseline = snapshot.series.find(item => item.id === snapshot.baselineId)
  const intervalFormula = `${number(calculation.baseAttackTime)} × 100 ÷ ${number(calculation.appliedAttackSpeed)}`
  const rows = [
    { label: '攻撃力を合計', formula: `${number(base.levelAttack)}（レベル）+ ${number(base.trustAttack)}（信頼）+ ${number(base.potentialAttack)}（潜在）+ ${number(base.moduleAttack)}（MOD）`, result: number(base.beforeRounding) },
    { label: '基礎攻撃力', formula: `${number(base.beforeRounding)} を四捨五入`, result: number(base.result) },
    { label: 'S3の攻撃力補正', formula: `${number(base.result)} × (1 + ${number(attack.directMultiplierPercent)} ÷ 100)`, result: number(attack.afterDirectMultiplier) },
    { label: 'スキル中の攻撃力', formula: `${number(attack.afterDirectMultiplier)} の小数点以下を切り捨て`, result: number(attack.finalAttack) },
    { label: '術耐性無視を適用', formula: `${number(mitigation.inputResistance)} − ${number(mitigation.resistanceIgnoreFixed)}（0未満は0）`, result: number(mitigation.appliedResistance) },
    { label: '術耐性による軽減', formula: `${number(attack.finalAttack)} × (1 − ${number(mitigation.appliedResistance)} ÷ 100)`, result: number(mitigation.afterResistance!) },
    { label: '最低保証を反映', formula: `${number(mitigation.afterResistance!)} と ${number(attack.finalAttack)} × 5% の大きい方`, result: number(mitigation.result) },
    ...(artsFragilityMultiplier !== 1 ? [{ label: '術脆弱を反映', formula: `${number(mitigation.result)} × ${number(artsFragilityMultiplier)}`, result: number(calculation.perHit) }] : []),
    { label: '攻撃速度', formula: `${number(calculation.baseAttackSpeed)} + ${number(calculation.attackSpeedBonus)}`, result: number(calculation.attackSpeed) },
    ...(calculation.attackSpeed !== calculation.appliedAttackSpeed ? [{ label: '攻撃速度の下限', formula: `${number(calculation.attackSpeed)} と 20 の大きい方`, result: number(calculation.appliedAttackSpeed) }] : []),
    { label: '攻撃間隔', formula: intervalFormula, result: `${number(calculation.attackInterval)} 秒` },
    { label: 'DPS（1秒あたり）', formula: `${number(calculation.perHit)} ÷ (${intervalFormula})`, result: number(calculation.dps) },
    ...(snapshot.metric !== 'total' && baseline ? [
      { label: `基準：${baseline.label}`, formula: '同じ術耐性・比較条件でのDPS', result: number(baseline.calculation.dps) },
      { label: snapshot.metric === 'percent' ? '基準からの増加率' : '基準とのDPS差',
        formula: snapshot.metric === 'percent'
          ? baseline.calculation.dps === 0 ? '基準のDPSが0のため算出できません' : `(${number(calculation.dps)} ÷ ${number(baseline.calculation.dps)} − 1) × 100`
          : `${number(calculation.dps)} − ${number(baseline.calculation.dps)}`,
        result: selected.value === null ? '—' : `${number(selected.value)}${snapshot.metric === 'percent' ? '%' : ''}` },
    ] : []),
  ]
  const rounded = selected.value === null ? null : Number(selected.value.toFixed(snapshot.precision))
  const tableValue = rounded === null ? '—' : new Intl.NumberFormat('ja-JP', {
    minimumFractionDigits: snapshot.precision, maximumFractionDigits: snapshot.precision,
  }).format(rounded === 0 ? 0 : rounded) + (snapshot.metric === 'percent' ? '%' : '')

  return <GoldenglowDetailModal title={`術耐性 ${snapshot.resistance}のダメージ計算`} closeLabel="ダメージ計算を閉じる" onClose={onClose} closeOnContextMenu className="surtr-dps-detail">
    <p className="surtr-dps-detail-conditions">{snapshot.conditions}</p>
    <div className="surtr-dps-detail-modules" role="group" aria-label="計算を確認するMOD">
      {snapshot.series.map(item => <button key={item.id} type="button" aria-pressed={item.id === selected.id} onClick={() => setSelectedId(item.id)}>
        <i style={{ backgroundColor: item.color }} aria-hidden="true" />{item.label}
      </button>)}
    </div>
    <div className="gg-damage-detail-table-wrap" tabIndex={0} role="region" aria-label={`${selected.label}の計算フロー`}>
      <table className="gg-probability-table gg-damage-detail-table">
        <thead><tr><th scope="col">計算内容</th><th scope="col">式</th><th scope="col">結果</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.label}><th scope="row">{row.label}</th><td>{row.formula}</td><td>{row.result}</td></tr>)}
          <tr className="surtr-dps-detail-result"><th scope="row">表の表示</th><td>小数点以下{snapshot.precision}桁に丸める</td><td>{tableValue}</td></tr>
        </tbody>
      </table>
    </div>
    <details className="surtr-dps-detail-notes"><summary>計算・表示について</summary>
      <p>途中の数値は小数点以下6桁まで表示しています。計算には表示用に丸める前の値を使います。攻撃間隔のフレーム単位の丸めと素質2「余燼」は含めません。</p>
    </details>
  </GoldenglowDetailModal>
}
