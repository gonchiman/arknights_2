import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { DAMAGE_TYPE_LABELS } from '../lib/damageCalculator'
import {
  buildDamageCalculatorThreeOutput,
  getDamageCalculatorThreeStructures,
  type DamageCalculatorThreeConditions,
  type DamageCalculatorThreeOutput,
} from '../lib/damageCalculatorThree'
import {
  formatSkillStructureEffectItem,
  formatSkillStructureEffectValue,
  formatSkillStructurePredicate,
  type SkillStructureSelection,
} from '../lib/skillStructure'
import {
  formatTalentStructureCondition,
  formatTalentStructureEffectItem,
  formatTalentStructureEffectValue,
  formatTalentStructureTarget,
  type TalentStructureEffect,
} from '../lib/talentStructure'
import type { SkillRecord } from '../types/skill'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { EMPTY_OPERATOR_FILTERS, OperatorSearch } from './OperatorSearch'
import { OperatorDetailLink } from './OperatorDetailLink'
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
  const output = useMemo(() => operator && structure ? buildDamageCalculatorThreeOutput({
    operator, skill: operator, phaseIndex, operatorLevel: safeLevel, trust,
    skillLevelIndex: structure.basicInfo.levelIndex, conditions,
  }) : null, [operator, structure, safeLevel, trust, conditions])
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
        <div className="calculator-field"><span>スキル</span>
          {operatorSkills.length > 0 ? <div className="skill-choice-group damage-three-skills" role="group" aria-label="スキル選択">
            {operatorSkills.map(({ structure: candidate }) => {
              const active = candidate.basicInfo.skillId === structure?.basicInfo.skillId
              return <button type="button" key={candidate.basicInfo.skillId}
                className={active ? 'active' : ''} aria-pressed={active}
                aria-label={`S${candidate.basicInfo.skillIndex} ${candidate.basicInfo.skillName}`}
                onClick={() => { if (!active) chooseSkill(candidate.basicInfo) }}>
                <span>S{candidate.basicInfo.skillIndex}</span><strong>{candidate.basicInfo.skillName}</strong>
              </button>
            })}
          </div> : <div className="damage-three-fixed-value">スキルを選択</div>}
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
        <div className="damage-three-description">{structure?.source.description}</div>
      </>}
    </CollapsibleCalculatorPanel>

    {selected && output && <>
      <CollapsibleCalculatorPanel id="damage-three-conditions" number="02" title="戦闘条件"
        summary={[output.activeStageLabel !== '通常' ? output.activeStageLabel : null, `攻撃対象${output.actualTargetCount}体`].filter(Boolean).join(' · ')}
        collapsedLabel="条件を表示">
        <div className="calculator-form-grid damage-three-condition-grid">
          {output.conditionInputs.map(input => <label className="calculator-field" key={input.metric}>
            <span>{input.label}</span>
            {input.kind === 'number' && input.control === 'input' ? <input type="number" aria-label={input.label}
              min={input.min} max={input.max} step={input.step ?? 1}
              value={Number.isFinite(conditions[input.metric] ?? input.defaultValue) ? conditions[input.metric] ?? input.defaultValue : ''}
              onChange={event => setConditions(previous => ({ ...previous, [input.metric]: event.target.valueAsNumber }))} />
              : <select aria-label={input.label} value={conditions[input.metric] ?? input.defaultValue}
              onChange={event => setConditions(previous => ({ ...previous,
                [input.metric]: input.kind === 'number' ? Number(event.target.value) : event.target.value,
              }))}>
              {(input.kind === 'select' ? input.options : input.options
                ?? Array.from({ length: input.max - input.min + 1 }, (_, index) => ({
                  value: input.min + index, label: `${input.min + index}${input.metric === 'actualAttackTargetCount' ? '体' : '回'}`,
                }))).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>}
          </label>)}
          {!output.conditionInputs.some(input => input.metric === 'actualAttackTargetCount') && <div className="calculator-field"><span>実際の攻撃対象数</span>
            <div className="damage-three-fixed-value">{output.actualTargetCount}体</div></div>}
          <div className="calculator-field"><span>対象数上限</span><div className="damage-three-fixed-value">{output.maxTargetCount}体</div></div>
          <div className="calculator-field"><span>ダメージ種別</span><div className="damage-three-fixed-value">
            {output.damageType ? DAMAGE_TYPE_LABELS[output.damageType] : '未確定'}</div></div>
        </div>
        <details className="damage-two-help"><summary>適用する効果</summary>
          <DamageCalculatorThreeEffectTable effects={output.effects} />
        </details>
        <details className="damage-two-help"><summary>計算範囲</summary>
          <p>{calculationScope(output)}</p>
          <p>全対象には同じ防御力・術耐性を使います。DPSはスキル発動中に攻撃し続けた場合の値で、SP回復中の時間を含めません。</p>
          {output.scopeNotes.map(note => <p key={note}>{note}</p>)}
        </details>
      </CollapsibleCalculatorPanel>

      <CollapsibleCalculatorPanel id="damage-three-talents" number="03" title="素質の適用"
        summary={`${output.talentEffects.filter(entry => entry.status === 'APPLIED').length}件適用`}
        collapsedLabel="素質を表示">
        <DamageCalculatorThreeTalentTable effects={output.talentEffects} />
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
          {output.damageOverTime && <> · 敵の術耐性{output.damageOverTime.enemyResistance}
            {output.canShowDps && output.damageOverTime.steadyDps !== null && <> · 同一対象へ連続攻撃</>}</>}
          {output.hasUnsupportedTalentDamage && <> · 直接攻撃分（継続ダメージを除く）</>}
        </p>
        {output.unsupportedReasons.length > 0 ? <div className="damage-two-unavailable" role="status">
          <strong>この条件では計算できません。</strong><ul>{output.unsupportedReasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
        </div> : <>
          {output.damageOverTime && <h3 className="damage-three-result-heading">直接攻撃</h3>}
          <DamageCalculatorThreeResultTable output={output} precision={precision} />
          {output.rows.some(row => row.breakdown.mitigation.minimumApplied) && <p className="damage-two-note">＊ 最低保証ダメージ</p>}
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
  const damageLabel = output.attackKind === 'NORMAL' ? '1攻撃ダメージ' : `${output.attackLabel}1回のダメージ`
  return <div className="damage-two-table-wrap" tabIndex={0} role="region" aria-label="計算機３のダメージ計算結果">
    <table className={`damage-two-table damage-three-result-table${output.canShowDps ? '' : ' damage-three-single-attack-table'}`}>
      <caption className="visually-hidden">{output.hasUnsupportedTalentDamage && '直接攻撃分（継続ダメージを除く）：'}敵の防御性能別の1体・全対象の{output.canShowDps ? 'ダメージとDPS' : damageLabel}</caption>
      <thead><tr><th scope="col">{output.axisLabel}</th><th scope="col">1体への<br />{damageLabel}</th>
        {output.canShowDps && <th scope="col">1体への<br />DPS</th>}
        <th scope="col">全対象の<br />{damageLabel}</th>{output.canShowDps && <th scope="col">全対象の<br />DPS</th>}</tr></thead>
      <tbody>{output.rows.map(row => <tr key={row.axisValue}>
        <th scope="row">{output.damageType === 'TRUE' ? '軽減なし' : formatCompact(row.axisValue)}</th>
        <td>{format(row.perAttack)}{row.breakdown.mitigation.minimumApplied && <sup aria-label="最低保証ダメージ">＊</sup>}</td>
        {output.canShowDps && <td>{format(row.dps)}</td>}<td>{format(row.allTargetsPerAttack)}</td>
        {output.canShowDps && <td>{format(row.allTargetsDps)}</td>}
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

export function DamageCalculatorThreeEffectTable({ effects }: { effects: DamageCalculatorThreeOutput['effects'] }) {
  const hasStages = new Set(effects.map(entry => entry.stageId)).size > 1
  return <div className="damage-two-table-wrap damage-three-detail-wrap">
    <table className="damage-two-table damage-three-effect-table">
      <caption className="visually-hidden">構造化された効果の適用状態</caption>
      <thead><tr>{hasStages && <th scope="col">段階</th>}<th scope="col">項目</th><th scope="col">値</th><th scope="col">条件</th><th scope="col">計算への適用</th></tr></thead>
      <tbody>{effects.map(entry => <tr key={`${entry.stageId}/${entry.effect.id}`}>
        {hasStages && <td>{entry.stageLabel}</td>}
        <th scope="row">{formatSkillStructureEffectItem(entry.effect.item)}</th>
        <td>{formatSkillStructureEffectValue(entry.effect)}</td><td>{formatSkillStructurePredicate(entry.effect.condition)}</td>
        <td>{{ APPLIED: '適用', CONDITION_FALSE: '不適用', NOT_RELEVANT: '対象外', UNSUPPORTED: '未対応', INACTIVE_STAGE: '別の段階' }[entry.status]}</td>
      </tr>)}</tbody>
    </table>
  </div>
}

export function DamageCalculatorThreeTalentTable({ effects }: { effects: DamageCalculatorThreeOutput['talentEffects'] }) {
  return <div className="damage-two-table-wrap" tabIndex={0} role="region" aria-label="構造化された素質の適用状態">
    <table className="damage-two-table damage-three-talent-table">
      <caption className="visually-hidden">構造化された素質の適用状態</caption>
      <thead><tr><th scope="col">区分</th><th scope="col">名称</th><th scope="col">項目</th>
        <th scope="col">値</th><th scope="col">条件</th><th scope="col">状態</th></tr></thead>
      <tbody>{effects.map((entry, index) => <tr key={`${entry.operatorId}/${entry.talentIndex}/${entry.effect?.id ?? index}`}>
        <th scope="row">素質{entry.talentIndex + 1}</th><td>{entry.talentName}</td>
        <td>{entry.effect ? formatTalentStructureEffectItem(entry.effect.item) : '未確認'}</td>
        <td>{entry.effect ? formatTalentStructureEffectValue(entry.effect) : '未確認'}</td>
        <td>{entry.effect ? formatTalentApplicationCondition(entry.effect) : '未確認'}</td>
        <td>{{ APPLIED: '適用', CONDITION_FALSE: '条件不成立', NOT_RELEVANT: '対象外', UNSUPPORTED: '未対応', UNVERIFIED: '未確認' }[entry.status]}</td>
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
    ['攻撃倍率', `×${formatCompact((model?.attackScalePercent ?? 100) / 100)}`],
    ['軽減前の攻撃ダメージ', output.effectiveAttack === null ? '—' : formatCompact(output.effectiveAttack)],
    ['特性による遠距離倍率', `×${formatCompact(output.rangePenaltyMultiplier)}`],
    ...(output.attackKind === 'COUNTER' ? [
      ['反撃の最短再発動間隔', output.counterCooldownSeconds === null ? '—' : `${formatCompact(output.counterCooldownSeconds)}秒`] as [string, ReactNode],
    ] : [
      ['攻撃速度', output.attackSpeed === null ? '—' : formatCompact(output.attackSpeed)] as [string, ReactNode],
      ['計算上の攻撃間隔', model ? `${formatCompact(model.attackInterval)}秒` : '—'] as [string, ReactNode],
    ]),
    [output.attackKind === 'COUNTER' ? '反撃1回のヒット数' : '1攻撃のヒット数', model?.hitCount ?? '—'],
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
  const scope = output.hasUnsupportedTalentDamage
    ? '直接攻撃分（継続ダメージを除く）'
    : '基礎性能＋スキル効果＋適用中の素質'
  return `${scope} · 潜在1 · MODなし · 外部バフなし`
}

function formatTalentApplicationCondition(effect: TalentStructureEffect) {
  const conditions: string[] = []
  if (effect.target.factionIds.length > 0 || effect.target.tagIds.length > 0) {
    conditions.push(formatTalentStructureTarget(effect.target))
  }
  if (effect.condition) conditions.push(formatTalentStructureCondition(effect.condition))
  return conditions.join(' かつ ') || 'なし'
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

function resultNumberFormatter(precision: number) {
  const formatter = new Intl.NumberFormat('ja-JP', { minimumFractionDigits: precision, maximumFractionDigits: precision })
  return (value: number | null) => value === null ? '—' : formatter.format(value)
}
