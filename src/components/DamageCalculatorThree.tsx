import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { DAMAGE_TYPE_LABELS } from '../lib/damageCalculator'
import { getOperatorPassives } from '../lib/operatorProfile'
import { expandSkillDescription } from '../lib/skillJsonAnalysis'
import {
  buildDamageCalculatorThreeOutput,
  getDamageCalculatorThreeStructures,
  type DamageCalculatorThreeConditions,
  type DamageCalculatorThreeInput,
  type DamageCalculatorThreeOutput,
} from '../lib/damageCalculatorThree'
import { buildDamageCalculatorThreeApplicationRows } from '../lib/damageCalculatorThreeApplications'
import { buildDamageCalculatorThreeSkillInformation } from '../lib/damageCalculatorThreeSkillInformation'
import { EFFECT_APPLICATION_STATUS_LABELS, type EffectApplicationRow } from '../lib/effectApplication'
import type { SkillStructureSelection } from '../lib/skillStructure'
import type { SkillRecord } from '../types/skill'
import type { GuardConditions, GuardInput } from '../lib/guardCombatTypes'
import { AnalysisTabs } from './AnalysisTabs'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { EMPTY_OPERATOR_FILTERS, OperatorSearch } from './OperatorSearch'
import { OperatorDetailLink } from './OperatorDetailLink'
import { SkillInformationTable } from './SkillInformationTable'
import './DamageCalculator.css'
import './DamageCalculatorTwo.css'
import './DamageCalculatorThree.css'

interface Props {
  rows: SkillRecord[]
  loading: boolean
  initialSelection?: SkillStructureSelection
}

export function DamageCalculatorThree({ rows, loading, initialSelection }: Props) {
  const [selection, setSelection] = useState<SkillStructureSelection | null>(initialSelection ?? null)
  const [operatorLevel, setOperatorLevel] = useState(90)
  const [trust, setTrust] = useState(100)
  const [conditions, setConditions] = useState<DamageCalculatorThreeConditions>({})
  const [precision, setPrecision] = useState(0)
  const [searchOpen, setSearchOpen] = useState(false)
  const [filters, setFilters] = useState({ ...EMPTY_OPERATOR_FILTERS })
  const available = useMemo(() => getDamageCalculatorThreeStructures().flatMap(structure => {
    const skill = rows.find(row => sameSkill(row, structure.basicInfo))
    return skill ? [{ structure, skill }] : []
  }), [rows])
  const requested = selection ?? available[0]?.structure.basicInfo
  const selected = available.find(({ structure }) => requested && sameSelection(structure.basicInfo, requested))
  const operator = selected?.skill
  const structure = selected?.structure
  const phaseIndex = 2
  const maxLevel = operator?.operatorProfile.phases[phaseIndex]?.maxLevel ?? 90
  const safeLevel = clampInteger(operatorLevel, 1, maxLevel)
  const passiveDescriptions = useMemo(() => operator
    ? getOperatorPassives(operator.operatorProfile, phaseIndex, safeLevel, 1).sources.flatMap(source =>
      source.sourceKind === 'TRAIT' || (source.sourceKind === 'TALENT' && source.talentIndex !== null) ? [{
        id: source.sourceKind === 'TRAIT' ? 'damage-three-trait-description' : `damage-three-talent-description-${source.talentIndex}`,
        className: source.sourceKind === 'TRAIT' ? 'damage-three-trait-description' : 'damage-three-talent-description',
        heading: source.sourceKind === 'TRAIT' ? '特性' : `素質${source.talentIndex! + 1}　${source.sourceName}`,
        description: expandSkillDescription(source.description, source.blackboard)
          .replace(/<[^>]+>/g, '').replace(/\\n/g, '\n').trim() || '説明文を取得できません。',
      }] : [])
    : [], [operator, safeLevel])
  const calculationInput = useMemo<DamageCalculatorThreeInput | null>(() => operator && structure ? {
    operator, skill: operator, phaseIndex, operatorLevel: safeLevel, trust,
    skillLevelIndex: structure.basicInfo.levelIndex, conditions,
  } : null, [operator, structure, safeLevel, trust, conditions])
  const output = useMemo(() => calculationInput ? buildDamageCalculatorThreeOutput(calculationInput) : null, [calculationInput])
  const applicationRows = useMemo(() => calculationInput && output
    ? buildDamageCalculatorThreeApplicationRows(calculationInput, output) : [], [calculationInput, output])
  const operatorSkills = available.filter(({ structure: candidate }) => candidate.basicInfo.operatorId === requested?.operatorId)
    .sort((a, b) => a.structure.basicInfo.skillIndex - b.structure.basicInfo.skillIndex)

  function chooseSkill(next: SkillStructureSelection) {
    setSelection(next)
    setConditions({})
    setSearchOpen(false)
  }

  function selectOperator(row: SkillRecord) {
    const next = available.find(({ structure: candidate }) => candidate.basicInfo.operatorId === row.operatorId)
    if (next) {
      chooseSkill(next.structure.basicInfo)
      setOperatorLevel(row.operatorProfile.phases[phaseIndex]?.maxLevel ?? 90)
    }
  }

  if (rows.length === 0) return <p className="calculator-loading" role="status">
    {loading ? 'オペレーターデータを読み込み中…' : 'オペレーターデータを取得できません。'}
  </p>

  return <section className="calculator-page damage-two-page damage-three-page">
    <h1 className="visually-hidden">Damage Calculator 3</h1>
    <div><a className="button secondary" href="#/damage-3/coverage">実装範囲</a></div>
    <CollapsibleCalculatorPanel id="damage-three-operator" number="01" title="オペレーター・スキル"
      summary={operator?.operatorName ?? '未選択'} collapsedLabel="選択を表示">
      <div className="damage-three-selection-grid">
        <div className="calculator-field">
          <span>オペレーター</span>
          <div className="damage-three-operator-summary">
            <div className="damage-three-operator-meta">
              {operator ? <OperatorDetailLink operatorId={operator.operatorId} source="damage-three"
                className="damage-three-operator-name" aria-label={`${operator.operatorName}のオペレーター情報を開く`}>
                {operator.operatorName} <span aria-hidden="true">→</span>
              </OperatorDetailLink> : <strong>オペレーターを選択</strong>}
              {operator && <small>★{operator.rarity} · {operator.professionLabel} / {operator.subProfessionName}</small>}
            </div>
            <button type="button" className="damage-three-operator-change" aria-expanded={searchOpen}
              aria-controls="damage-three-search" onClick={() => setSearchOpen(open => !open)}>
              {searchOpen ? '検索を閉じる' : '検索して変更'}
            </button>
          </div>
        </div>
      </div>
      {searchOpen && <div id="damage-three-search" className="calculator-operator-search">
        <div className="operator-search-heading"><strong>オペレーターを検索</strong>
          <button type="button" onClick={() => setSearchOpen(false)}>閉じる</button></div>
        <OperatorSearch rows={available.map(entry => entry.skill)} loading={loading} filters={filters}
          onFiltersChange={setFilters} onSelect={selectOperator} instruction="" actionLabel="選択する →"
          className="damage-operator-search-results" selectedOperatorId={operator?.operatorId} />
      </div>}
      {!selected ? <div className="damage-two-unavailable damage-three-selection-notice" role="status">
        <strong>{available.length ? '指定されたスキル・レベルは計算機３の対象外です。' : '計算対象のスキルデータを取得できません。'}</strong>
        {available.length > 0 && <button type="button" className="button secondary"
          onClick={() => chooseSkill(available[0].structure.basicInfo)}>対応スキルを表示</button>}
      </div> : <>
        <div className="calculator-form-grid growth-form-grid damage-three-growth">
          <div className="calculator-field"><span>昇進段階</span><div className="damage-three-fixed-value">昇進2</div></div>
          <label className="calculator-field"><span>オペレーターレベル</span>
            <input type="number" aria-label="オペレーターレベル" min={1} max={maxLevel} step={1} value={safeLevel}
              onChange={event => setOperatorLevel(clampInteger(Number(event.target.value), 1, maxLevel))} /></label>
          <label className="calculator-field"><span>信頼度（%）</span>
            <input type="number" aria-label="信頼度（%）" min={0} max={100} step={1} value={trust}
              onChange={event => setTrust(clampInteger(Number(event.target.value), 0, 100))} /></label>
          <div className="calculator-field"><span>スキルレベル</span><div className="damage-three-fixed-value">{structure?.basicInfo.skillLevel}</div></div>
        </div>
        <div className="damage-three-descriptions">
          <div className="damage-three-skills">
            <AnalysisTabs idPrefix="damage-three-skill" label="スキル選択"
              tabs={operatorSkills.map(({ structure: candidate }) => [candidate.basicInfo.skillId,
                `S${candidate.basicInfo.skillIndex} ${candidate.basicInfo.skillName}`] as const)}
              activeTab={selected.structure.basicInfo.skillId} onChange={skillId => {
                const next = operatorSkills.find(({ structure: candidate }) => candidate.basicInfo.skillId === skillId)
                if (next && skillId !== selected.structure.basicInfo.skillId) chooseSkill(next.structure.basicInfo)
              }} />
          </div>
          {operatorSkills.map(({ structure: candidate, skill }) => <div key={candidate.basicInfo.skillId}
            id={`damage-three-skill-panel-${candidate.basicInfo.skillId}`} role="tabpanel"
            aria-labelledby={`damage-three-skill-tab-${candidate.basicInfo.skillId}`}
            hidden={candidate.basicInfo.skillId !== selected.structure.basicInfo.skillId}
            className="damage-three-skill-panel">
            <SkillInformationTable information={buildDamageCalculatorThreeSkillInformation(candidate, skill,
              candidate.basicInfo.skillId === selected.structure.basicInfo.skillId ? output : null)} />
            <p className="damage-three-description">{candidate.source.description}</p>
          </div>)}
          {passiveDescriptions.map(source => <section className={source.className} key={source.id}
            aria-labelledby={source.id}>
            <h3 id={source.id}>{source.heading}</h3>
            <p>{source.description}</p>
          </section>)}
        </div>
      </>}
    </CollapsibleCalculatorPanel>

    {selected && output && <>
      <CollapsibleCalculatorPanel id="damage-three-conditions" number="02" title="戦闘条件"
        summary={[output.activeStageLabel !== '通常' ? output.activeStageLabel : null, `攻撃対象${output.actualTargetCount}体`].filter(Boolean).join(' · ')}
        collapsedLabel="条件を表示">
        <div className="calculator-form-grid damage-three-condition-grid">
          {output.guard && <GuardConditionFields inputs={output.guard.inputs}
            values={{ ...output.guard.conditions, ...conditions.guard }}
            onChange={(key, value) => setConditions(previous => ({ ...previous,
              guard: { ...previous.guard, [key]: value },
            }))} />}
          {output.conditionInputs.map(input => <label className="calculator-field" key={input.metric}>
            <span>{input.label}</span>
            {input.kind === 'number' && input.control === 'input' ? <input type="number" aria-label={input.label}
              min={input.min} max={input.max} step={input.step ?? 1}
              value={Number.isFinite(conditions[input.metric] ?? input.defaultValue) ? conditions[input.metric] ?? input.defaultValue ?? '' : ''}
              onChange={event => setConditions(previous => ({ ...previous, [input.metric]: event.target.valueAsNumber }))} />
              : <select aria-label={input.label} value={input.kind === 'boolean' ? String(conditions[input.metric] ?? input.defaultValue) : conditions[input.metric] ?? input.defaultValue ?? ''}
              onChange={event => setConditions(previous => ({ ...previous,
                [input.metric]: input.kind === 'number' ? Number(event.target.value) : input.kind === 'boolean' ? event.target.value === 'true' : event.target.value,
              }))}>
              {(input.kind !== 'number' ? input.options : input.options
                ?? Array.from({ length: input.max - input.min + 1 }, (_, index) => ({
                  value: input.min + index, label: `${input.min + index}${input.metric === 'actualAttackTargetCount' ? '体' : '回'}`,
                }))).map(option => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}
            </select>}
          </label>)}
            {output.initialTargetState === 'GROUND' && !output.conditionInputs.some(input => input.metric === 'targetInitialState') && <div className="calculator-field"><span>敵の初期状態</span>
            <div className="damage-three-fixed-value">地上</div></div>}
          {!output.guard && !output.conditionInputs.some(input => input.metric === 'actualAttackTargetCount') && <div className="calculator-field"><span>実際の攻撃対象数</span>
            <div className="damage-three-fixed-value">{output.actualTargetCount}体</div></div>}
          <div className="calculator-field"><span>対象数上限</span><div className="damage-three-fixed-value">{output.maxTargetCount === null ? '上限なし' : `${output.maxTargetCount}体`}</div></div>
          <div className="calculator-field"><span>ダメージ種別</span><div className="damage-three-fixed-value">
            {output.damageType ? DAMAGE_TYPE_LABELS[output.damageType] : output.guard && output.unsupportedReasons.length === 0 ? '混合' : '未確定'}</div></div>
        </div>
        <details className="damage-two-help"><summary>計算範囲</summary>
          <p>{calculationScope(output)}</p>
          <p>全対象には同じ防御力・術耐性を使います。DPSはスキル発動中に攻撃し続けた場合の値で、SP回復中の時間を含めません。</p>
          {output.scopeNotes.map(note => <p key={note}>{note}</p>)}
        </details>
      </CollapsibleCalculatorPanel>

      <CollapsibleCalculatorPanel id="damage-three-talents" number="03" title="効果の適用"
        summary={`${applicationRows.filter(entry => entry.status === 'APPLIED').length}件適用`}
        collapsedLabel="効果を表示" bodyClassName="damage-three-passives-body">
        <DamageCalculatorThreeApplicationTable rows={applicationRows} />
      </CollapsibleCalculatorPanel>

      <CollapsibleCalculatorPanel id="damage-three-results" number="04" title="計算結果"
        summary={output.axisLabel} collapsedLabel="結果を表示"
        headerActions={<label className="damage-two-precision">小数点以下
          <select aria-label="結果の小数点以下" value={precision} onChange={event => setPrecision(Number(event.target.value))}>
            {[0, 1, 2, 3].map(digits => <option key={digits} value={digits}>{digits}桁</option>)}
          </select></label>}>
        <p className="damage-two-context" role="status" aria-live="polite">
          {operator?.operatorName} · S{structure?.basicInfo.skillIndex} {structure?.basicInfo.skillLevel} · 攻撃対象{output.actualTargetCount}体
          {output.activeStageLabel && output.activeStageLabel !== '通常' && <> · {output.activeStageLabel}</>}
          {output.initialTargetState === 'GROUND' && <> · 地上の敵</>}
          {output.initialTargetState === 'AIRBORNE' && <> · 飛行の敵</>}
          {output.damageOverTime && <> · 敵の術耐性{output.damageOverTime.enemyResistance}
            {output.canShowDps && output.damageOverTime.steadyDps !== null && <> · 同一対象へ連続攻撃</>}</>}
          {output.hasUnsupportedTalentDamage && <> · 直接攻撃分（継続ダメージを除く）</>}
        </p>
        {output.unsupportedReasons.length > 0 ? <div className="damage-two-unavailable" role="status">
          <strong>この条件では計算できません。</strong><ul>{output.unsupportedReasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
        </div> : <>
          {output.damageOverTime && <h3 className="damage-three-result-heading">直接攻撃</h3>}
          <DamageCalculatorThreeResultTable output={output} precision={precision} />
          {output.guard && output.rows.some(row => row.damageOverTimeDps !== null) && <>
            <h3 className="damage-three-result-heading">{output.canShowDps ? '継続ダメージ・合計DPS' : '継続ダメージ'}</h3>
            <GuardPeriodicDamageTable output={output} precision={precision} />
          </>}
          {output.hasAttackSequence && <>
            <h3 className="damage-three-result-heading">攻撃内訳</h3>
            <DamageCalculatorThreeAttackComponentTable output={output} precision={precision} />
          </>}
          {output.rows.some(hasMinimumDamageApplied) && <p className="damage-two-note">＊ 最低保証ダメージ</p>}
          {output.dpsReason && <p className="damage-two-note">DPS：{output.dpsReason}</p>}
          {!output.dpsReason && output.damageOverTime?.steadyDpsReason && <p className="damage-two-note">定常DPS：{output.damageOverTime.steadyDpsReason}</p>}
          {output.damageOverTime && <>
            <h3 className="damage-three-result-heading">継続ダメージ</h3>
            <DamageCalculatorThreeDotTable output={output} precision={precision} />
            {output.canShowDps && output.damageOverTime.steadyDps !== null && <>
              <h3 className="damage-three-result-heading">定常DPS</h3>
              <DamageCalculatorThreeSteadyDpsTable output={output} precision={precision} />
            </>}
          </>}
          <details className="damage-two-help"><summary>計算に使った値</summary>
            <UsedValueTable output={output} />
          </details>
        </>}
        <div className="damage-three-scope">{calculationScope(output)}</div>
      </CollapsibleCalculatorPanel>
    </>}
  </section>
}

export function DamageCalculatorThreeResultTable({ output, precision }: { output: DamageCalculatorThreeOutput; precision: number }) {
  const format = resultNumberFormatter(precision)
  const damageLabel = `${output.attackKind === 'NORMAL' ? '1攻撃ダメージ' : output.attackKind === 'SKILL_ACTION'
    ? output.guard ? '選択段階1回のダメージ' : 'スキル1回の総ダメージ'
    : `${output.attackLabel}1回のダメージ`}${output.hasProbabilisticDamage ? '期待値' : ''}`
  return <div className="damage-two-table-wrap" tabIndex={0} role="region" aria-label="計算機３のダメージ計算結果">
    <table className={`damage-two-table damage-three-result-table${output.canShowDps ? '' : ' damage-three-single-attack-table'}`}>
      <caption className="visually-hidden">{output.hasUnsupportedTalentDamage && '直接攻撃分（継続ダメージを除く）：'}敵の防御性能別の1体・全対象の{output.canShowDps ? 'ダメージとDPS' : damageLabel}</caption>
      <thead><tr><th scope="col">{output.axisLabel}</th><th scope="col">{output.hasRandomTargets ? '1体平均の' : '1体への'}<br />{damageLabel}</th>
        {output.canShowDps && <th scope="col">1体への<br />DPS</th>}
        <th scope="col">全対象の<br />{damageLabel}</th>{output.canShowDps && <th scope="col">全対象の<br />DPS</th>}</tr></thead>
      <tbody>{output.rows.map(row => <tr key={row.axisValue}>
        <th scope="row">{output.damageType === 'TRUE' ? '軽減なし' : formatCompact(row.axisValue)}</th>
        <td>{format(row.perAttack)}{hasMinimumDamageApplied(row) && <sup aria-label="最低保証ダメージ">＊</sup>}</td>
        {output.canShowDps && <td>{format(row.dps)}</td>}<td>{format(row.allTargetsPerAttack)}</td>
        {output.canShowDps && <td>{format(row.allTargetsDps)}</td>}
      </tr>)}</tbody>
    </table>
  </div>
}

export function DamageCalculatorThreeAttackComponentTable({ output, precision }: { output: DamageCalculatorThreeOutput; precision: number }) {
  if (!output.hasAttackSequence) return null
  const format = resultNumberFormatter(precision)
  if (output.guard) return <div className="damage-two-table-wrap" tabIndex={0} role="region" aria-label="攻撃ごとのダメージ内訳">
    <table className="damage-two-table damage-three-attack-component-table">
      <caption className="visually-hidden">攻撃ごとのダメージ内訳</caption>
      <thead><tr><th scope="col">{output.axisLabel}</th><th scope="col">区分</th><th scope="col">ダメージ種別</th>
        <th scope="col">攻撃倍率</th><th scope="col">打撃回数</th><th scope="col">1体平均の命中回数</th>
        <th scope="col">1体平均のダメージ{output.hasProbabilisticDamage ? '期待値' : ''}</th></tr></thead>
      <tbody>{output.rows.flatMap(row => row.attackComponents.map(component => <tr key={`${row.axisValue}/${component.id}`}>
        <th scope="row">{output.damageType === 'TRUE' ? '軽減なし' : formatCompact(row.axisValue)}</th>
        <td>{component.label}</td><td>{DAMAGE_TYPE_LABELS[component.damageType]}</td>
        <td>×{formatCompact(component.attackScale)}</td><td>{formatCompact(component.count)}</td>
        <td>{formatCompact(component.expectedHitCount)}</td><td>{format(component.expectedDamage)}</td>
      </tr>))}</tbody>
    </table>
  </div>
  const skillAction = output.attackKind === 'SKILL_ACTION'
  return <div className="damage-two-table-wrap" tabIndex={0} role="region" aria-label="順序付き攻撃の内訳">
    <table className={`damage-two-table damage-three-attack-component-table${skillAction ? ' damage-three-skill-action-components' : ''}`}>
      <caption className="visually-hidden">順序付き攻撃の内訳</caption>
      <thead><tr><th scope="col">{output.axisLabel}</th><th scope="col">{skillAction ? '区分' : '攻撃順'}</th>
        {skillAction && <><th scope="col">打撃回数</th><th scope="col">1体平均の命中回数</th></>}<th scope="col">命中時状態</th>
        <th scope="col">防御無視の確率</th><th scope="col">{output.hasRandomTargets ? '1体平均のダメージ期待値' : 'ダメージ期待値'}</th></tr></thead>
      <tbody>{output.rows.flatMap(row => row.attackComponents.map(component => <tr key={`${row.axisValue}/${component.id}`}>
        <th scope="row">{formatCompact(row.axisValue)}</th><td>{skillAction ? component.label : component.order}</td>
        {skillAction && <><td>{component.count}</td><td>{formatCompact(component.expectedHitCount)}</td></>}
        <td>{component.targetAirborne ? output.initialTargetState === 'GROUND' ? '浮遊' : '空中' : '地上'}</td><td>{formatProbability(component.defenseIgnoreChance)}</td>
        <td>{format(component.expectedDamage)}</td>
      </tr>))}</tbody>
    </table>
  </div>
}

export function GuardConditionFields({ inputs, values, onChange }: {
  inputs: readonly GuardInput[]
  values: GuardConditions
  onChange: (key: string, value: number | boolean | string) => void
}) {
  return <>{inputs.map(input => {
    const value = values[input.key] ?? input.defaultValue
    const options = input.options ?? (input.kind === 'boolean'
      ? [{ value: false, label: 'なし' }, { value: true, label: 'あり' }] : [])
    const invalid = input.kind === 'number' && (typeof value !== 'number' || !Number.isFinite(value)
      || (input.min !== undefined && value < input.min) || (input.max !== undefined && value > input.max))
    return <label className="calculator-field" key={input.key}>
      <span>{input.label}</span>
      {input.kind === 'number' && options.length === 0 ? <input type="number" aria-label={input.label}
        min={input.min} max={input.max} step={input.step ?? 1} aria-invalid={invalid || undefined}
        value={typeof value === 'number' && Number.isFinite(value) ? value : ''}
        onChange={event => onChange(input.key, event.target.valueAsNumber)} />
        : <select aria-label={input.label} value={String(value)} onChange={event => {
          const option = options.find(candidate => String(candidate.value) === event.target.value)
          if (option) onChange(input.key, option.value)
        }}>{options.map(option => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}</select>}
    </label>
  })}</>
}

export function DamageCalculatorThreeApplicationTable({ rows }: { rows: readonly EffectApplicationRow[] }) {
  const hasStages = rows.some(row => row.stage !== undefined)
  const hasProbability = rows.some(row => row.probability !== undefined)
  const unsupported = [...new Set(rows.filter(row => row.status === 'UNSUPPORTED' && row.reason)
    .map(row => `${row.name}：${row.reason}`))]
  return <>
    <div className="damage-two-table-wrap" tabIndex={0} role="region" aria-label="効果の適用状態">
      <table className={`damage-two-table damage-three-application-table${hasStages ? ' has-stages' : ''}${hasProbability ? ' has-probability' : ''}`}>
        <caption className="visually-hidden">スキル・特性・素質の適用状態</caption>
        <colgroup><col className="application-category" /><col className="application-name" />
          {hasStages && <col className="application-stage" />}<col className="application-item" />
          <col className="application-value" /><col className="application-timing" />
          {hasProbability && <col className="application-probability" />}<col className="application-condition" />
          <col className="application-status" /></colgroup>
        <thead><tr><th scope="col">区分</th><th scope="col">名称</th>{hasStages && <th scope="col">段階</th>}
          <th scope="col">項目</th><th scope="col">値</th><th scope="col">タイミング</th>
          {hasProbability && <th scope="col">発動確率</th>}<th scope="col">条件</th><th scope="col">状態</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.id} data-effect-category={row.category} data-effect-status={row.status}>
          <td>{row.categoryLabel ?? { SKILL: 'スキル', TRAIT: '特性', TALENT: '素質' }[row.category]}</td>
          <td>{row.name}</td>{hasStages && <td>{row.stage ?? '—'}</td>}
          <th scope="row">{row.item}</th><td>{row.value}</td><td>{row.timing}</td>
          {hasProbability && <td>{row.probability ?? '—'}</td>}<td>{row.condition}</td>
          <td>{EFFECT_APPLICATION_STATUS_LABELS[row.status]}</td>
        </tr>)}</tbody>
      </table>
    </div>
    {unsupported.length > 0 && <details className="damage-two-help"><summary>未対応の条件</summary>
      {unsupported.map(reason => <p key={reason}>{reason}</p>)}
    </details>}
  </>
}

export function GuardPeriodicDamageTable({ output, precision }: { output: DamageCalculatorThreeOutput; precision: number }) {
  if (!output.guard || !output.rows.some(row => row.damageOverTimeDps !== null)) return null
  const format = resultNumberFormatter(precision)
  return <div className="damage-two-table-wrap" tabIndex={0} role="region" aria-label="継続ダメージと合計DPS">
    <table className="damage-two-table damage-three-steady-table">
      <caption className="visually-hidden">継続ダメージと合計DPS</caption>
      <thead><tr><th scope="col">{output.axisLabel}</th>
        {output.canShowDps && <th scope="col">1体の直接DPS</th>}
        <th scope="col">1体の継続ダメージ/秒</th>
        {output.canShowDps ? <><th scope="col">1体の合計DPS</th><th scope="col">全対象の合計DPS</th></>
          : <th scope="col">全対象の継続ダメージ/秒</th>}</tr></thead>
      <tbody>{output.rows.map(row => <tr key={row.axisValue}>
        <th scope="row">{output.damageType === 'TRUE' ? '軽減なし' : formatCompact(row.axisValue)}</th>
        {output.canShowDps && <td>{format(row.dps)}</td>}<td>{format(row.damageOverTimeDps)}</td>
        {output.canShowDps ? <><td>{format(row.combinedDps)}</td><td>{format(row.allTargetsCombinedDps)}</td></>
          : <td>{format(row.damageOverTimeDps === null ? null : row.damageOverTimeDps * output.actualTargetCount)}</td>}
      </tr>)}</tbody>
    </table>
  </div>
}

export function DamageCalculatorThreeDotTable({ output, precision }: { output: DamageCalculatorThreeOutput; precision: number }) {
  const damage = output.damageOverTime
  if (!damage) return null
  const format = resultNumberFormatter(precision)
  return <div className="damage-two-table-wrap" tabIndex={0} role="region" aria-label="付与中の継続ダメージ">
    <table className="damage-two-table damage-three-dot-table">
      <caption className="visually-hidden">付与中の継続ダメージ</caption>
      <thead><tr><th scope="col">対象</th><th scope="col">付与中のダメージ/秒</th></tr></thead>
      <tbody><tr><th scope="row">1体</th><td>{format(damage.damagePerSecond)}</td></tr>
        <tr><th scope="row">全対象</th><td>{format(damage.allTargetsDamagePerSecond)}</td></tr></tbody>
    </table>
  </div>
}

export function DamageCalculatorThreeSteadyDpsTable({ output, precision }: { output: DamageCalculatorThreeOutput; precision: number }) {
  if (!output.damageOverTime || !output.canShowDps || output.damageOverTime.steadyDps === null) return null
  const format = resultNumberFormatter(precision)
  return <div className="damage-two-table-wrap" tabIndex={0} role="region" aria-label="同一対象へ連続攻撃したときの定常DPS">
    <table className="damage-two-table damage-three-steady-table">
      <caption className="visually-hidden">同一対象へ連続攻撃したときの定常DPS</caption>
      <thead><tr><th scope="col">{output.axisLabel}</th><th scope="col">1体の直接DPS</th>
        <th scope="col">1体の継続DPS</th><th scope="col">1体の合計DPS</th><th scope="col">全対象の合計DPS</th></tr></thead>
      <tbody>{output.rows.map(row => <tr key={row.axisValue}>
        <th scope="row">{formatCompact(row.axisValue)}</th><td>{format(row.dps)}</td>
        <td>{format(row.damageOverTimeDps)}</td><td>{format(row.combinedDps)}</td><td>{format(row.allTargetsCombinedDps)}</td>
      </tr>)}</tbody>
    </table>
  </div>
}

function UsedValueTable({ output }: { output: DamageCalculatorThreeOutput }) {
  const model = output.model
  const rows: [string, ReactNode][] = [
    ['基礎攻撃力', formatCompact(output.stats.attack)],
    ['攻撃力増加（スキル）', model ? `＋${formatCompact(model.directMultiplierPercent)}％` : '未確認'],
    ['攻撃力増加（素質）', model ? `＋${formatCompact(output.talentAttackRatio * 100)}％` : '未確認'],
    ['攻撃力増加（合計）', model ? `＋${formatCompact(model.directMultiplierPercent + output.talentAttackRatio * 100)}％` : '未確認'],
    ['術耐性固定無視', model ? formatCompact(output.resistanceIgnoreFixed) : '未確認'],
    ...(!output.hasAttackSequence ? [
      ['攻撃倍率', `×${formatCompact((model?.attackScalePercent ?? 100) / 100)}`] as [string, ReactNode],
      ['軽減前の攻撃ダメージ', output.effectiveAttack === null ? '—' : formatCompact(output.effectiveAttack)] as [string, ReactNode],
      ['特性による遠距離倍率', `×${formatCompact(output.rangePenaltyMultiplier)}`] as [string, ReactNode],
    ] : []),
    ...(output.attackKind === 'SKILL_ACTION' ? [] : output.attackKind === 'COUNTER' ? [
      ['反撃の最短再発動間隔', output.counterCooldownSeconds === null ? '—' : `${formatCompact(output.counterCooldownSeconds)}秒`] as [string, ReactNode],
    ] : [
      ['攻撃速度', output.attackSpeed === null ? '—' : formatCompact(output.attackSpeed)] as [string, ReactNode],
      ...(!output.hasAttackSequence ? [['計算上の攻撃間隔', model ? `${formatCompact(model.attackInterval)}秒` : '—'] as [string, ReactNode]] : []),
    ]),
    output.hasAttackSequence
      ? ['攻撃の内訳数', output.rows[0]?.attackComponents.length ?? '未確認']
      : [output.attackKind === 'COUNTER' ? '反撃1回のヒット数' : '1攻撃のヒット数', model?.hitCount ?? '—'],
    ['実際の攻撃対象数', `${output.actualTargetCount}体`],
  ]
  return <div className="damage-two-table-wrap damage-three-detail-wrap">
    <table className="damage-two-table damage-three-value-table"><caption className="visually-hidden">計算に使った値</caption>
      <thead><tr><th scope="col">項目</th><th scope="col">値</th></tr></thead>
      <tbody>{rows.map(([label, value]) => <tr key={label}><th scope="row">{label}</th><td>{value}</td></tr>)}</tbody>
    </table>
  </div>
}

function calculationScope(output: DamageCalculatorThreeOutput) {
  if (output.guard && output.unsupportedReasons.length > 0) return '計算保留 · 潜在1 · MODなし · 外部バフなし'
  const scope = output.hasUnsupportedTalentDamage
    ? '直接攻撃分（継続ダメージを除く）'
    : '基礎性能＋スキル効果＋適用中の素質'
  return `${scope} · 潜在1 · MODなし · 外部バフなし`
}

function sameSkill(a: Pick<SkillRecord, 'operatorId' | 'skillId' | 'skillIndex'>, b: SkillStructureSelection) {
  return a.operatorId === b.operatorId && a.skillId === b.skillId && a.skillIndex === b.skillIndex
}

function sameSelection(a: SkillStructureSelection, b: SkillStructureSelection) {
  return sameSkill(a, b) && a.levelIndex === b.levelIndex
}

function clampInteger(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? Math.round(value) : min))
}

function formatCompact(value: number) {
  return new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 4 }).format(value)
}

function formatProbability(value: number | null) {
  return value === null ? '未確認' : `${formatCompact(value * 100)}％`
}

function hasMinimumDamageApplied(row: DamageCalculatorThreeOutput['rows'][number]) {
  if (row.attackComponents.length > 0) return row.attackComponents.some(component => component.branches
    .some(branch => branch.probability > 0 && branch.mitigation.minimumApplied))
  return row.breakdown?.mitigation.minimumApplied ?? false
}

function resultNumberFormatter(precision: number) {
  const formatter = new Intl.NumberFormat('ja-JP', { minimumFractionDigits: precision, maximumFractionDigits: precision })
  return (value: number | null) => value === null ? '—' : formatter.format(value)
}
