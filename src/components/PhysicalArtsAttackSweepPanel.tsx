import { useMemo, useState, type FormEvent } from 'react'
import {
  getPhysicalArtsAttackSweepChartPoints, getPhysicalArtsAttackSweepRowCount, getPhysicalArtsAttackSweepRows,
  MAX_ATTACK_SWEEP_ROWS, type PhysicalArtsAttackSweepInput, type PhysicalArtsAttackSweepPoint,
} from '../lib/physicalArtsAttackSweep'
import { ComparisonTableImageDialog, type ComparisonTableImageSnapshot } from './ComparisonTableImageDialog'
import {
  DamageCalculatorThreeAttributeChartImageDialog, type DamageCalculatorThreeAttributeChartImageSnapshot,
} from './DamageCalculatorThreeAttributeChartImageDialog'
import { AttributeButtons } from './DamageCalculatorThreeAttributePage'
import { PhysicalArtsAttackSweepChart } from './PhysicalArtsAttackSweepChart'
import { PhysicalArtsComparisonImageLegend } from './PhysicalArtsComparisonChart'

const INITIAL_INPUT: PhysicalArtsAttackSweepInput = {
  defense: 1200, resistance: 60, minAttack: 500, maxAttack: 4000, attackStep: 500,
}
const NUMBER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 })
const VIEWS = [['table', '表'], ['chart', 'グラフ']] as const
const ATTACK_FIELDS = [['minAttack', '下限'], ['maxAttack', '上限'], ['attackStep', '表の刻み']] as const
const TABLE_LABEL = '攻撃力別の一撃ダメージ（1体あたり）'
const TITLE = '物理・術ダメージ比較（攻撃力別）'
type ResultImage =
  | { view: 'table'; snapshot: ComparisonTableImageSnapshot }
  | { view: 'chart'; snapshot: DamageCalculatorThreeAttributeChartImageSnapshot }

export function PhysicalArtsAttackSweepPanel() {
  const [applied, setApplied] = useState(INITIAL_INPUT)
  const [view, setView] = useState<typeof VIEWS[number][0]>('table')
  const [rangeError, setRangeError] = useState(false)
  const [image, setImage] = useState<ResultImage | null>(null)
  const rowCount = getPhysicalArtsAttackSweepRowCount(applied)
  const tooManyRows = rowCount > MAX_ATTACK_SWEEP_ROWS
  const rows = useMemo(() => getPhysicalArtsAttackSweepRows(applied), [applied])
  const points = useMemo(() => getPhysicalArtsAttackSweepChartPoints(applied), [applied])
  const { defense, resistance, minAttack, maxAttack, attackStep } = applied
  const conditions = [`防御力 ${NUMBER.format(defense)}`, `術耐性 ${NUMBER.format(resistance)}`, '1体あたり']
  const chartView = view === 'chart'

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const next = {
      defense: Number(data.get('defense')),
      resistance: Number(data.get('resistance')),
      minAttack: Number(data.get('minAttack')),
      maxAttack: Number(data.get('maxAttack')),
      attackStep: Number(data.get('attackStep')),
    }
    const invalidRange = next.maxAttack <= next.minAttack
    setRangeError(invalidRange)
    if (!invalidRange) setApplied(next)
  }

  function openImage() {
    const filenameParts = [`防御力${defense}`, `術耐性${resistance}`, `攻撃力${minAttack}-${maxAttack}`]
    if (view === 'table' && rows.length) {
      setImage({ view, snapshot: {
        title: '物理・術ダメージ比較表（攻撃力別）',
        conditions: [...conditions, `攻撃力 ${NUMBER.format(minAttack)}〜${NUMBER.format(maxAttack)}（${NUMBER.format(attackStep)}刻み）`],
        filenameConditions: [...filenameParts.slice(0, 2), `${filenameParts[2]}刻み${attackStep}`],
        table: <AttackSweepTable rows={rows} forImage />,
      } })
    } else if (view === 'chart') {
      setImage({ view, snapshot: {
        title: TITLE,
        axisTitle: '攻撃力',
        conditions,
        filenameParts,
        legend: <PhysicalArtsComparisonImageLegend />,
        chart: ({ height }) => <PhysicalArtsAttackSweepChart points={points} imageHeight={height} />,
      } })
    }
  }

  return <>
    <section className="calculator-panel" aria-labelledby="physical-arts-attack-result-heading">
      <form className="physical-arts-comparison-controls physical-arts-attack-sweep-controls" onSubmit={apply}>
        <label className="calculator-field">
          <span>防御力</span>
          <input name="defense" type="number" inputMode="numeric" min={0} max={1000000} step={1}
            defaultValue={INITIAL_INPUT.defense} required />
        </label>
        <label className="calculator-field">
          <span>術耐性</span>
          <input name="resistance" type="number" inputMode="numeric" min={0} max={100} step={1}
            defaultValue={INITIAL_INPUT.resistance} required />
        </label>
        <div className="physical-arts-comparison-ranges">
          <fieldset>
            <legend>攻撃力</legend>
            {ATTACK_FIELDS.map(([name, label]) => <label className="calculator-field" key={name}>
              <span>{label}</span>
              <input name={name} type="number" inputMode="numeric" min={1} max={1000000} step={1}
                defaultValue={INITIAL_INPUT[name]} required aria-label={name === 'attackStep' ? label : `攻撃力の${label}`}
                aria-invalid={rangeError && name !== 'attackStep' || undefined}
                aria-describedby={rangeError && name !== 'attackStep' ? 'physical-arts-attack-range-error' : undefined}
                onInput={name === 'attackStep' ? undefined : () => setRangeError(false)} />
            </label>)}
          </fieldset>
        </div>
        <button className="button" type="submit">出力</button>
        {rangeError && <p className="physical-arts-comparison-error" id="physical-arts-attack-range-error" role="alert">
          攻撃力の上限は下限より大きい値を入力してください。
        </p>}
      </form>
      <div className="damage-three-attribute-context">
        <h2 id="physical-arts-attack-result-heading" className="physical-arts-comparison-heading">1回の攻撃ダメージ</h2>
        <span role="status">{conditions.join(' · ')}</span>
      </div>
      <div className="damage-three-attribute-toolbar">
        <AttributeButtons label="表示形式" options={VIEWS} value={view} onChange={setView} />
        <button type="button" className="button secondary damage-three-attribute-image-button"
          aria-label={`物理・術ダメージ比較${chartView ? 'グラフ' : '表'}をPNG画像で保存`}
          aria-haspopup="dialog" disabled={!chartView && !rows.length} onClick={openImage}>画像を保存</button>
      </div>
      {chartView ? <PhysicalArtsAttackSweepChart points={points} />
        : tooManyRows ? <p className="physical-arts-comparison-error" role="alert">
          表が{MAX_ATTACK_SWEEP_ROWS}行以内になるように刻みを大きくしてください。
        </p>
        : <AttackSweepTable rows={rows} />}
    </section>
    {image?.view === 'table' && <ComparisonTableImageDialog snapshot={image.snapshot} onClose={() => setImage(null)} />}
    {image?.view === 'chart' && <DamageCalculatorThreeAttributeChartImageDialog snapshot={image.snapshot} onClose={() => setImage(null)} />}
  </>
}

function AttackSweepTable({ rows, forImage = false }: { rows: readonly PhysicalArtsAttackSweepPoint[]; forImage?: boolean }) {
  const table = <table className={`damage-two-table damage-three-attribute-table physical-arts-attack-sweep-table${forImage ? ' damage-three-attribute-table-image' : ''}`}
    aria-label={TABLE_LABEL}>
    <thead><tr><th scope="col">攻撃力</th><th scope="col">物理</th><th scope="col">術</th></tr></thead>
    <tbody>{rows.map(({ attack, physical, arts }) => <tr key={attack}>
      <th scope="row">{NUMBER.format(attack)}</th>
      <td data-table-image-number="true">{NUMBER.format(physical)}</td>
      <td data-table-image-number="true">{NUMBER.format(arts)}</td>
    </tr>)}</tbody>
  </table>
  return forImage ? table : <div className="damage-two-table-wrap" role="region" aria-label={TABLE_LABEL} tabIndex={0}>
    {table}
  </div>
}
