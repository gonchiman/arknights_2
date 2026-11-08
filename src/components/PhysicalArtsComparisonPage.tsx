import { useMemo, useState } from 'react'
import { evaluateAttackAttributeTables } from '../lib/damageCalculatorThreeAttributeTables'
import { DamageCalculatorThreeAttributeTable } from './DamageCalculatorThreeAttributePage'
import './PhysicalArtsComparisonPage.css'

const INITIAL_ATTACK = 1000
const NUMBER = new Intl.NumberFormat('ja-JP')

export default function PhysicalArtsComparisonPage() {
  const [attack, setAttack] = useState(INITIAL_ATTACK)
  const { physical, arts } = useMemo(() => evaluateAttackAttributeTables(attack), [attack])

  return <section className="calculator-page damage-three-attribute-page">
    <header className="page-intro">
      <h1>物理・術ダメージ比較</h1>
    </header>
    <section className="calculator-panel" aria-labelledby="physical-arts-result-heading">
      <form className="physical-arts-comparison-controls" onSubmit={event => {
        event.preventDefault()
        setAttack(Number(new FormData(event.currentTarget).get('attack')))
      }}>
        <label className="calculator-field">
          <span>攻撃力</span>
          <input name="attack" type="number" inputMode="numeric" min={1} max={1000000} step={1}
            defaultValue={INITIAL_ATTACK} required />
        </label>
        <button className="button" type="submit">出力</button>
      </form>
      <div className="damage-three-attribute-context">
        <h2 id="physical-arts-result-heading" className="physical-arts-comparison-heading">1回の攻撃ダメージ</h2>
        <span role="status">攻撃力 {NUMBER.format(attack)} · 1体あたり</span>
      </div>
      <DamageCalculatorThreeAttributeTable physical={physical} arts={arts} metric="perAttack" />
    </section>
  </section>
}
