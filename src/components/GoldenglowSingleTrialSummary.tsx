import type { GoldenglowTargetSwitchTotals } from '../lib/goldenglowTargetSwitch'
import './GoldenglowSingleTrialSummary.css'

const damageFormat = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 })
const decimalFormat = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 1 })
const countFormat = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 })

export function GoldenglowSingleTrialSummary({ totals, skillIndex, showDecimals }: {
  totals: GoldenglowTargetSwitchTotals
  skillIndex: number
  showDecimals: boolean
}) {
  const valueFormat = showDecimals ? damageFormat : countFormat
  const fractionFormat = showDecimals ? decimalFormat : countFormat
  const damageParts = [
    ...(skillIndex === 3 ? [] : [{ key: 'body', label: '本体攻撃', damage: totals.bodyDamage }]),
    { key: 'normal', label: skillIndex === 3 ? '通常攻撃' : '浮遊ユニットの通常攻撃', damage: totals.normalDamage },
    { key: 'explosion', label: '自爆', damage: totals.explosionDamage },
  ]
  const damageSum = damageParts.reduce((sum, part) => sum + part.damage, 0)
  const parts = damageParts.map((part) => ({ ...part, share: damageSum > 0 ? part.damage / damageSum * 100 : 0 }))
  const metrics = [
    { label: '総ダメージ', value: valueFormat.format(totals.rawDamage) },
    { label: 'DPS', value: fractionFormat.format(totals.rawDps) },
    { label: '撃破', value: countFormat.format(totals.kills), unit: '体' },
    { label: '自爆回数', value: countFormat.format(totals.explosions), unit: '回' },
  ]

  return <div className="gg-single-summary">
    <section className="gg-single-summary-frame" aria-label="結果の概要とダメージ内訳">
      <dl className="gg-single-summary-metrics">
        {metrics.map((metric) => <div key={metric.label}>
          <dt>{metric.label}</dt>
          <dd><span>{metric.value}</span>{metric.unit && <small>{metric.unit}</small>}</dd>
        </div>)}
      </dl>
      <div className="gg-single-summary-breakdown">
        <h3>ダメージ内訳</h3>
        <div className="gg-single-summary-bar" aria-hidden="true">
          {parts.map((part) => <span key={part.key} className={`gg-single-summary-${part.key}`} style={{ width: `${part.share}%` }} />)}
        </div>
        <dl className="gg-single-summary-parts">
          {parts.map((part) => <div key={part.key}>
            <dt><span className={`gg-single-summary-key gg-single-summary-${part.key}`} aria-hidden="true" />{part.label}</dt>
            <dd><span>{valueFormat.format(part.damage)}</span><small>{fractionFormat.format(part.share)}%</small></dd>
          </div>)}
        </dl>
      </div>
    </section>
    <details className="gg-single-summary-help">
      <summary>数値の意味</summary>
      <p>総ダメージは、敵の残りHPを超える分も含みます。DPSは総ダメージを計測時間で割った値です。</p>
      {skillIndex === 3 && <p>通常攻撃は浮遊ユニットの通常攻撃によるダメージです。</p>}
    </details>
  </div>
}
