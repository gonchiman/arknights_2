import type { ElementalBuildupResult } from '../lib/elementalBuildup'
import { ELEMENT_LABELS } from '../lib/elementalBuildup'
import './DamageCalculatorTwo.css'
import './ElementalBuildupTable.css'

const STATUS_LABELS: Record<ElementalBuildupResult['status'], string> = {
  APPLIED: '蓄積', BURST_ACTIVE: '爆発中・蓄積なし', IMMUNE: '無効',
}
const BASIS_LABELS: Record<ElementalBuildupResult['basis'], string> = {
  ATK_STAT: '攻撃力', DEALT_DAMAGE: '与ダメージ', HP_LOST: '実HP減少量', FIXED: '固定値',
}

export function ElementalBuildupTable({ groups, contextLabel = '条件', precision = 1 }: {
  groups: readonly { label: string; values: readonly ElementalBuildupResult[] }[]
  contextLabel?: string
  precision?: number
}) {
  if (!groups.some(group => group.values.length)) return null
  const number = new Intl.NumberFormat('ja-JP', { minimumFractionDigits: precision, maximumFractionDigits: precision })
  return <div className="damage-two-table-wrap elemental-buildup-wrap" role="region" aria-label="元素損傷の計算結果" tabIndex={0}>
    <table className="damage-two-table elemental-buildup-table">
      <caption>元素損傷（HPダメージとは別）</caption>
      <thead><tr>
        <th scope="col">{contextLabel}</th><th scope="col">元素</th><th scope="col">効果</th><th scope="col">計算基準</th>
        <th scope="col">1体・1回の損傷</th><th scope="col">全対象・1回の損傷</th>
        <th scope="col">蓄積後の残り元素値</th><th scope="col">状態</th>
      </tr></thead>
      <tbody>{groups.flatMap((group, groupIndex) => group.values.map((value, index) => <tr key={`${groupIndex}:${index}`}>
        <th scope="row">{group.label}</th><td>{ELEMENT_LABELS[value.elementId] ?? value.elementId}</td>
        <td>{value.label}</td>
        <td>{BASIS_LABELS[value.basis]}</td>
        <td>{number.format(value.perApplication)}</td><td>{number.format(value.allTargetsPerApplication)}</td>
        <td>{value.remainingGaugeAfter === null ? '—' : number.format(value.remainingGaugeAfter)}</td>
        <td>{STATUS_LABELS[value.status]}</td>
      </tr>))}</tbody>
    </table>
  </div>
}
