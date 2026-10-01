import { useMemo, useState } from 'react'
import {
  calculateManualDamage,
  createEmptyManualDamageInputs,
  type ManualDamageField,
} from '../lib/manualDamageVerification'
import { HOME_LINK } from '../lib/navigation'
import { PageBreadcrumbs } from './PageBreadcrumbs'
import './ManualDamageVerificationPage.css'

interface InputField {
  key: ManualDamageField
  label: string
  unit?: string
  rounding?: boolean
}

const INPUT_GROUPS: readonly { id: string; title: string; fields: readonly InputField[] }[] = [
  { id: 'base', title: '攻撃力の合計', fields: [
    { key: 'base', label: '基礎攻撃力' },
    { key: 'trust', label: '信頼の加算' },
    { key: 'module', label: 'MODの加算' },
  ] },
  { id: 'attack', title: 'スキルによる増加', fields: [
    { key: 'skill', label: '攻撃力の増加率', unit: '%' },
    { key: 'attackRound', label: '増加後の端数処理', rounding: true },
  ] },
  { id: 'resistance', title: '術耐性の計算', fields: [
    { key: 'res', label: '敵の術耐性' },
    { key: 'ignore', label: '素質で無視する固定値' },
    { key: 'modIgnore', label: 'MODの追加無視値' },
  ] },
  { id: 'damage', title: '一撃のダメージ', fields: [
    { key: 'minimum', label: '最低保証の割合', unit: '%' },
    { key: 'multiplier', label: '追加ダメージ倍率', unit: '倍' },
    { key: 'damageRound', label: 'ダメージの端数処理', rounding: true },
  ] },
  { id: 'interval', title: '攻撃間隔とDPS', fields: [
    { key: 'interval', label: '基本攻撃間隔', unit: '秒' },
    { key: 'speed', label: '基礎攻撃速度' },
    { key: 'speedAdd', label: '攻撃速度の加算' },
  ] },
]

export function ManualDamageVerificationPage() {
  const [inputs, setInputs] = useState(createEmptyManualDamageInputs)
  const calculation = useMemo(() => calculateManualDamage(inputs), [inputs])
  const change = (key: ManualDamageField, value: string) => setInputs(previous => ({ ...previous, [key]: value }))

  return <section className="manual-damage-page" aria-labelledby="manual-damage-title">
    <div className="page-heading-with-breadcrumbs">
      <PageBreadcrumbs parents={[HOME_LINK]} current="ダメージ検証" />
      <header className="manual-damage-heading">
        <h1 id="manual-damage-title">ダメージ計算の検証</h1>
        <span>術ダメージ・単体・1回1ヒット</span>
      </header>
    </div>
    <div className="manual-damage-layout">
      <section className="manual-damage-panel" aria-labelledby="manual-damage-input-title">
        <h2 id="manual-damage-input-title" className="manual-damage-panel-heading">入力値</h2>
        <form autoComplete="off" onSubmit={event => event.preventDefault()} noValidate>
          {INPUT_GROUPS.map((group, index) => <fieldset key={group.id} className="manual-damage-input-group">
            <legend><span>{index + 1}.</span> {group.title}</legend>
            <div className="manual-damage-fields">
              {group.fields.map(field => {
                const id = `manual-damage-${field.key}`
                const error = calculation.errors[field.key]
                return <div key={field.key} className={`manual-damage-field${field.rounding ? ' manual-damage-rounding' : ''}`}>
                  <label htmlFor={id}>{field.label}</label>
                  <div className="manual-damage-control">
                    {field.rounding ? <select id={id} name={field.key} value={inputs[field.key]}
                      aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}
                      onChange={event => change(field.key, event.target.value)}>
                      <option value="">選択する</option>
                      <option value="none">丸めない</option>
                      <option value="floor">小数点以下を切り捨て</option>
                      <option value="round">整数に四捨五入</option>
                    </select> : <input id={id} name={field.key} type="text" inputMode="decimal"
                      value={inputs[field.key]} placeholder="未入力" maxLength={64} spellCheck={false}
                      aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}
                      onChange={event => change(field.key, event.target.value)} />}
                    {field.unit && <span className="manual-damage-unit">{field.unit}</span>}
                  </div>
                  {error && <span id={`${id}-error`} className="manual-damage-error" role="alert">{error}</span>}
                </div>
              })}
            </div>
          </fieldset>)}
        </form>
      </section>
      <section className="manual-damage-panel" aria-labelledby="manual-damage-working-title">
        <h2 id="manual-damage-working-title" className="manual-damage-panel-heading">計算過程</h2>
        <div className="manual-damage-working">
          {calculation.stages.map((stage, index) => <section className="manual-damage-stage" key={stage.id}
            aria-labelledby={`manual-damage-stage-${stage.id}`}>
            <h3 id={`manual-damage-stage-${stage.id}`}><span>{index + 1}.</span> {stage.title}</h3>
            <dl className="manual-damage-steps">
              {stage.steps.map(step => <div className={`manual-damage-step manual-damage-step-${step.status}`} key={step.label}>
                <dt>{step.label}</dt>
                <dd>{step.expression ?? <span aria-label={step.status === 'invalid' ? '入力エラーのため未計算' : '入力待ち'}>—</span>}</dd>
              </div>)}
            </dl>
          </section>)}
        </div>
        <div className="manual-damage-results" aria-live="polite" aria-atomic="true">
          <div><span>一撃のダメージ</span><output aria-label="一撃のダメージ">{calculation.damage ?? '—'}</output></div>
          <div><span>DPS</span><output aria-label="DPS">{calculation.dps ?? '—'}</output></div>
        </div>
      </section>
    </div>
    <details className="manual-damage-help">
      <summary>入力と計算について</summary>
      <p>加算や無視の効果がなければ0、追加ダメージ倍率がなければ1を入力します。空欄を0として扱うことはありません。</p>
      <p>入力した小数は丸めずに計算し、選んだ段階でのみ端数処理を適用します。割り切れない値は分数で表示します。</p>
      <p>DPSは一撃のダメージを攻撃間隔で割った値です。攻撃のフレーム単位への丸め、追撃、継続ダメージは含みません。</p>
    </details>
  </section>
}
