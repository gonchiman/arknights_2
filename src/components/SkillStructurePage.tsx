import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createSkillStructureHash, type SkillRouteSelection } from '../lib/routes'
import { SKILL_COARSE_CATEGORY_LABELS } from '../lib/skillCoarseClassification'
import {
  findSkillStructure, formatSkillStructureActivationMethod, formatSkillStructureActivationTrigger,
  formatSkillStructureDuration, formatSkillStructureEffectItem, formatSkillStructureEffectOperation,
  formatSkillStructureEffectTarget, formatSkillStructureEffectTiming, formatSkillStructureEffectValue,
  formatSkillStructureEndCondition, formatSkillStructureMode, formatSkillStructurePredicate, formatSkillStructureSpRecovery,
  getSkillStructureEffectValueRows, getSkillStructureLevelIndices, isSkillStructureRecord,
  type SkillStructure, type SkillStructureEffect, type SkillStructureStage,
} from '../lib/skillStructure'
import type { SkillRecord } from '../types/skill'
import type { GuardDamageAction, GuardInput, GuardSkillRecipe, GuardStage, GuardValue } from '../lib/guardCombatTypes'
import { usesBaseAttackHitCount } from '../lib/guardCombatValues'
import { getSkillStructureDeferredCases, type SkillStructureDeferredCase } from '../lib/skillStructureDeferredCases'
import { SkillDescriptionSelectionPage } from './SkillDescriptionSelectionPage'
import { StructureTable } from './StructureTable'
import { SkillEffectFlow } from './SkillEffectFlow'
import './SkillStructurePage.css'

interface Props {
  rows: SkillRecord[]
  loading: boolean
  initialSelection?: SkillRouteSelection
}

const TABS = [
  ['basic', '基本情報'], ['classification', '分類情報'],
  ['activation', '発動設定'], ['flow', '効果フロー'], ['structure', '効果構造'],
] as const
type StructureTab = typeof TABS[number][0]

const DEFAULT_SELECTION: SkillRouteSelection = {
  operatorId: 'char_350_surtr', skillIndex: 2, skillId: 'skchr_surtr_2', levelIndex: 9,
}

export function SkillStructurePage({ rows, loading, initialSelection }: Props) {
  const supportedRows = useMemo(() => rows.filter(isSkillStructureRecord), [rows])
  const [activeTab, setActiveTab] = useState<StructureTab>('flow')

  return (
    <div className="skill-structure-page">
      <SkillDescriptionSelectionPage
        rows={supportedRows} loading={loading} initialSelection={initialSelection ?? DEFAULT_SELECTION}
        createHash={createSkillStructureHash} title="スキル構造" kicker="SKILL STRUCTURE"
        getAvailableLevelIndices={getSkillStructureLevelIndices} selectionActionLabel="表示する"
        renderSelectionFooter={({ skill, levelIndex }) => {
          const structure = findSkillStructure({ ...skill, levelIndex })
          return structure && <section className="skill-structure-description" aria-label="スキル説明文">
            <p>{structure.source.description}</p>
          </section>
        }}
        renderSelection={({ skill, levelIndex }) => {
          const structure = findSkillStructure({ ...skill, levelIndex })
          return structure && <SkillStructureContent
            key={`${skill.operatorId}:${skill.skillId}:${levelIndex}`} structure={structure}
            activeTab={activeTab} onTabChange={setActiveTab} />
        }}
      />
    </div>
  )
}

function SkillStructureContent({ structure, activeTab, onTabChange }: {
  structure: SkillStructure
  activeTab: StructureTab
  onTabChange: (tab: StructureTab) => void
}) {
  const id = useId()
  const [selectedEffect, setSelectedEffect] = useState<{ stage: SkillStructureStage; effect: SkillStructureEffect } | null>(null)
  const effectTriggerRef = useRef<HTMLButtonElement | null>(null)
  const b = structure.basicInfo
  const a = structure.activationSettings
  const caption = `${b.operatorName} S${b.skillIndex} ${b.skillLevel}`
  const deferredCases = getSkillStructureDeferredCases(b)

  const changeTabWithKeyboard = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % TABS.length
    if (event.key === 'ArrowLeft') nextIndex = (index + TABS.length - 1) % TABS.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = TABS.length - 1
    if (nextIndex === null) return
    event.preventDefault()
    const nextTab = TABS[nextIndex][0]
    onTabChange(nextTab)
    window.requestAnimationFrame(() => document.getElementById(`${id}-tab-${nextTab}`)?.focus({ preventScroll: true }))
  }

  const contents: Record<StructureTab, ReactNode> = {
    flow: <SkillEffectFlow structure={structure} />,
    basic: <StructureTable caption={`${caption}の基本情報`}
      headers={['オペレーター', 'スキル番号', 'スキル名', 'スキルレベル']}
      className="skill-structure-basic-table">
      <tr><td>{b.operatorName}</td><td>S{b.skillIndex}</td><td>{b.skillName}</td><td>{b.skillLevel}</td></tr>
    </StructureTable>,
    classification: <StructureTable caption={`${caption}の分類情報`} headers={['大分類']}>
      {structure.classificationInfo.coarseCategories.map(category => <tr key={category}>
        <td>{SKILL_COARSE_CATEGORY_LABELS[category]}</td>
      </tr>)}
    </StructureTable>,
    activation: <StructureTable caption={`${caption}の発動設定`}
      headers={['SP回復方法', '初期SP', '必要SP', '蓄積上限', '発動方式', '発動契機']}
      className="skill-structure-activation-table">
      <tr><td>{formatSkillStructureSpRecovery(a.spRecovery)}</td><td>{a.initialSp}</td><td>{a.spCost}</td>
        <td>{a.maxCharges}</td><td>{formatSkillStructureActivationMethod(a.activationMethod)}</td>
        <td>{formatSkillStructureActivationTrigger(a.activationTrigger)}</td></tr>
    </StructureTable>,
    structure: structure.guardRecipe ? <GuardRecipeStructure recipe={structure.guardRecipe}
      source={structure.source} caption={caption} /> : <>
      <h3 className="skill-structure-subheading">段階</h3>
      <StructureTable caption={`${caption}の段階`} className="skill-structure-stage-table"
        headers={['段階', '段階の適用条件', '持続時間', '終了条件',
          ...(structure.effectStructure.targetSelection ? ['対象の初期状態'] : [])]}>
        {structure.effectStructure.stages.map(stage => <tr key={stage.id}>
          <th scope="row">{stage.label}</th>
          <td>{formatSkillStructurePredicate(stage.applicability, '追加条件なし')}</td>
          <td>{formatSkillStructureDuration(stage.duration)}</td>
          <td>{formatSkillStructureEndCondition(stage.endCondition)}</td>
          {structure.effectStructure.targetSelection && <td>{structure.effectStructure.targetSelection.initialState === 'USER_DEFINED' ? '地上・飛行を選択' : '地上'}</td>}
        </tr>)}
      </StructureTable>
      {structure.effectStructure.modeTransitions && <>
        <h3 className="skill-structure-subheading">状態切替</h3>
        <StructureTable caption={`${caption}の状態切替`} headers={['契機', '切替前', '切替後']}>
          {structure.effectStructure.modeTransitions.map(transition => <tr key={transition.from}>
            <td>スキル発動</td><td>{formatSkillStructureMode(transition.from)}</td><td>{formatSkillStructureMode(transition.to)}</td>
          </tr>)}
        </StructureTable>
      </>}
      <h3 className="skill-structure-subheading">効果一覧</h3>
      <div className="table-wrap skill-structure-table-wrap" tabIndex={0} role="region" aria-label={`${caption}の効果一覧`}>
        <table className="skill-structure-table skill-structure-effects-table">
          <caption className="visually-hidden">{caption}の効果一覧</caption>
          <colgroup><col className="skill-structure-stage-col" /><col className="skill-structure-timing-col" />
            <col className="skill-structure-condition-col" /><col className="skill-structure-target-col" />
            <col className="skill-structure-item-col" /><col className="skill-structure-operation-col" /><col /></colgroup>
          <thead><tr>{['段階', 'タイミング', '条件', '対象', '項目', '演算', '値'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
          {structure.effectStructure.stages.map(stage => <tbody key={stage.id}>
            {stage.effects.length === 0 && <tr><th scope="row">{stage.label}</th><td colSpan={6}>スキルによる変更なし</td></tr>}
            {stage.effects.map((effect, index) => <tr key={effect.id}>
              {index === 0 && <th scope="rowgroup" rowSpan={stage.effects.length}>{stage.label}</th>}
              <td>{formatSkillStructureEffectTiming(effect.timing)}</td>
              <td>{formatSkillStructurePredicate(effect.condition)}</td>
              <td>{formatSkillStructureEffectTarget(effect.target)}</td>
              <td><button type="button" className="skill-structure-effect-link"
                aria-label={`${stage.label}の${formatSkillStructureEffectItem(effect.item)}の定義`}
                aria-controls={`${id}-effect-definition`}
                aria-expanded={selectedEffect?.stage.id === stage.id && selectedEffect.effect.id === effect.id}
                onClick={event => {
                  effectTriggerRef.current = event.currentTarget
                  setSelectedEffect({ stage, effect })
                }}>{formatSkillStructureEffectItem(effect.item)}</button></td>
              <td>{formatSkillStructureEffectOperation(effect)}</td>
              <td>{formatSkillStructureEffectValue(effect)}</td>
            </tr>)}
          </tbody>)}
        </table>
      </div>
      <section id={`${id}-effect-definition`} className="skill-structure-definition" hidden={!selectedEffect}
        aria-labelledby={`${id}-effect-definition-title`} aria-live="polite">
        {selectedEffect && <>
          <header><h3 id={`${id}-effect-definition-title`}>{selectedEffect.stage.label}の{formatSkillStructureEffectItem(selectedEffect.effect.item)}の定義</h3>
            <button type="button" onClick={() => {
              setSelectedEffect(null)
              effectTriggerRef.current?.focus({ preventScroll: true })
            }}>閉じる</button></header>
          <EffectDefinitionTable stage={selectedEffect.stage} effect={selectedEffect.effect} />
        </>}
      </section>
      {(structure.notes.length > 0 || deferredCases.length > 0) && <details className="skill-structure-notes">
        <summary>{deferredCases.length > 0 ? '構造化の補足・保留事項' : '構造化の補足'}</summary>
        {structure.notes.map(note => <p key={note}>{note}</p>)}
        {deferredCases.map(entry => <DeferredCaseTable key={entry.id} entry={entry} caption={caption} />)}
      </details>}
    </>,
  }

  return (
    <section className="skill-structure-content" aria-label="選択したスキルの構造">
      <div className="skill-structure-toolbar">
        <div className="detail-tabs skill-structure-tabs" role="tablist" aria-label="スキル構造の区分">
          {TABS.map(([tab, label], index) => <button type="button" key={tab}
            id={`${id}-tab-${tab}`} className={`detail-tab ${activeTab === tab ? 'active' : ''}`}
            role="tab" aria-selected={activeTab === tab} aria-controls={`${id}-panel-${tab}`}
            tabIndex={activeTab === tab ? 0 : -1} onClick={() => onTabChange(tab)}
            onKeyDown={event => changeTabWithKeyboard(event, index)}>{label}</button>)}
        </div>
      </div>
      <div className="skill-structure-tab-panels">
        {TABS.map(([tab, label]) => <section key={tab} id={`${id}-panel-${tab}`}
          className="skill-structure-tab-panel" role="tabpanel" aria-labelledby={`${id}-tab-${tab}`}
          aria-hidden={activeTab !== tab} inert={activeTab !== tab}>
          <h2>{label}</h2><div className="skill-structure-panel-body">{contents[tab]}</div>
        </section>)}
      </div>
    </section>
  )
}

const GUARD_COMPARISONS = { EQ: '＝', LT: '＜', LTE: '≦', GT: '＞', GTE: '≧' } as const
const GUARD_ATTACK_KINDS = { NORMAL: '通常攻撃', NEXT_ATTACK: '次の通常攻撃', SKILL_ACTION: '選択段階1回' } as const
const GUARD_DAMAGE_TYPES = { PHYSICAL: '物理', ARTS: '術', TRUE: '確定' } as const

/** The same expressions execute in the calculator; source keys are kept in their own column. */
export function GuardRecipeStructure({ recipe, source, caption }: {
  recipe: GuardSkillRecipe
  source: SkillStructure['source']
  caption: string
}) {
  const labels = new Map(recipe.inputs.map(input => [input.key, input.label]))
  const values = new Map(source.blackboard.map(entry => [entry.key, entry.value]))
  const expression = (value: GuardValue | undefined) => formatGuardExpression(value, labels, values)
  const effectRows = recipe.stages.flatMap(stage => guardStageRows(stage).map(row => ({ ...row, stage })))
  const unresolved = recipe.stages.flatMap(stage => (stage.unresolved ?? []).map(reason => ({ stage: stage.label, reason })))
  const notes = [...(recipe.notes ?? []), ...recipe.stages.flatMap(stage => stage.notes ?? [])]
  return <>
    <h3 className="skill-structure-subheading">段階</h3>
    <StructureTable caption={`${caption}の段階`} className="skill-structure-stage-table"
      headers={['段階', '段階の適用条件', '攻撃の単位', '持続時間']}>
      {recipe.stages.map(stage => <tr key={stage.id}>
        <th scope="row">{stage.label}</th>
        <td>{stage.when ? guardWhen(stage.when, recipe.inputs) : '追加条件なし'}</td>
        <td>{GUARD_ATTACK_KINDS[stage.kind]}</td>
        <td>{stage.duration === 'UNTIL_EXIT' ? '退場まで' : stage.duration !== undefined
          ? `${expression(stage.duration)}秒` : stage.kind === 'NORMAL' && source.duration > 0 ? `${source.duration}秒` : '—'}</td>
      </tr>)}
    </StructureTable>
    {recipe.inputs.length > 0 && <>
      <h3 className="skill-structure-subheading">条件</h3>
      <StructureTable caption={`${caption}の条件入力`} headers={['項目', 'キー', '初期値', '範囲']}>
        {recipe.inputs.map(input => <tr key={input.key}>
          <th scope="row">{input.label}</th><td>{input.key}</td><td>{guardInputLabel(input, input.defaultValue)}</td>
          <td>{input.options ? input.options.map(option => option.label).join(' / ')
            : input.kind === 'boolean' ? 'なし / あり' : `${input.min ?? '下限なし'}〜${input.max ?? '上限なし'}`}</td>
        </tr>)}
      </StructureTable>
    </>}
    <h3 className="skill-structure-subheading">効果一覧</h3>
    <StructureTable caption={`${caption}の効果一覧`} className="skill-structure-effects-table"
      headers={['段階', '区分', '項目', '値', '参照']}>
      {effectRows.map((row, index) => <tr key={`${row.stage.id}/${row.group}/${row.item}/${index}`}>
        <th scope="row">{row.stage.label}</th><td>{row.group}</td><td>{row.item}</td>
        <td>{row.text ?? (row.value !== undefined ? guardDefinitionValue(row, expression(row.value)) : '—')}</td>
        <td>{row.value !== undefined ? guardExpressionReferences(row.value, labels).join(' / ') || '定数' : '定義'}</td>
      </tr>)}
    </StructureTable>
    {unresolved.length > 0 && <>
      <h3 className="skill-structure-subheading">保留事項</h3>
      <StructureTable caption={`${caption}の保留事項`} headers={['段階', '未確定の内容']}>
        {unresolved.map((entry, index) => <tr key={`${entry.stage}/${index}`}>
          <th scope="row">{entry.stage}</th><td>{entry.reason}</td>
        </tr>)}
      </StructureTable>
    </>}
    {notes.length > 0 && <details className="skill-structure-notes">
      <summary>構造化の補足</summary>{[...new Set(notes)].map(note => <p key={note}>{note}</p>)}
    </details>}
  </>
}

type GuardDefinitionRow = { group: string; item: string; value?: GuardValue; text?: string; unit?: string; percentage?: boolean }

function guardDefinitionValue(row: GuardDefinitionRow, expression: string): string {
  if (!row.percentage) return `${expression}${row.unit ?? ''}`
  const numeric = Number(expression)
  return expression !== '' && Number.isFinite(numeric) ? `${Math.round(numeric * 100_000_000) / 1_000_000}％` : `（${expression}）×100％`
}

function guardStageRows(stage: GuardStage): GuardDefinitionRow[] {
  const rows: GuardDefinitionRow[] = []
  const add = (group: string, item: string, value: GuardValue | undefined, unit = '', percentage = false) => {
    if (value !== undefined) rows.push({ group, item, value, unit, percentage })
  }
  add('自身', '攻撃力増加割合', stage.atk, '', true)
  add('自身', '攻撃速度', stage.aspd)
  add('自身の攻撃', '攻撃間隔の倍率', stage.intervalScale, '倍')
  add('自身の攻撃', '攻撃間隔の加算', stage.intervalAdd, '秒')
  add('自身', 'ブロック数の加算', stage.blockCountAdd, '体')
  add('自身', '特性の攻撃力上昇倍率', stage.traitAttackRatioScale, '倍')
  if (stage.maxTargets === null) rows.push({ group: '自身の攻撃', item: '対象数上限', text: '上限なし' })
  else add('自身の攻撃', '対象数上限', stage.maxTargets, '体')
  add('攻撃対象', '防御力の無視割合', stage.defenseIgnoreRatio, '', true)
  add('攻撃対象', '防御力の固定値無視', stage.defenseIgnoreFixed)
  add('攻撃対象', '術耐性の固定値無視', stage.resistanceIgnoreFixed)
  for (const action of stage.actions) rows.push(...guardActionRows(stage, action))
  return rows
}

function guardActionRows(stage: GuardStage, action: GuardDamageAction): GuardDefinitionRow[] {
  const group = action.label
  const rows: GuardDefinitionRow[] = [
    { group, item: 'タイミング', text: action.timing === 'PER_SECOND' ? '毎秒' : action.timing === 'ON_DEPLOY' ? '配置時' : '攻撃時' },
    { group, item: 'ダメージ種別', text: GUARD_DAMAGE_TYPES[action.damageType] },
    { group, item: 'ダメージの基準', text: action.basis === 'TARGET_CURRENT_HP' ? '対象の現在HP' : '自身の攻撃力' },
    { group, item: 'スキル倍率', value: action.scale, unit: '倍' },
    usesBaseAttackHitCount(stage, action) ? { group, item: '打撃回数', text: '通常攻撃に準拠' }
      : { group, item: '打撃回数', value: action.hits ?? 1, unit: '回' },
  ]
  if (action.targets !== undefined) rows.push({ group, item: '合計命中対象数', value: action.targets, unit: '体' })
  if (action.attackBonus !== undefined) rows.push({ group, item: '攻撃力増加割合', value: action.attackBonus, percentage: true })
  if (action.probability !== undefined) rows.push({ group, item: '発動確率', value: action.probability, percentage: true })
  if (action.flatDamage !== undefined) rows.push({ group, item: '固定ダメージ', value: action.flatDamage })
  if (action.minimumAttackScale !== undefined) rows.push({ group, item: '最低攻撃倍率', value: action.minimumAttackScale, unit: '倍' })
  return rows
}

function guardInputLabel(input: GuardInput | undefined, value: number | string | boolean): string {
  return input?.options?.find(option => option.value === value)?.label
    ?? (typeof value === 'boolean' ? value ? 'あり' : 'なし' : String(value))
}

function guardWhen(when: NonNullable<GuardStage['when']>, inputs: readonly GuardInput[]): string {
  const input = inputs.find(candidate => candidate.key === when.input)
  return `${input?.label ?? when.input}${GUARD_COMPARISONS[when.comparison]}${guardInputLabel(input, when.value)}`
}

function formatGuardExpression(value: GuardValue | undefined, labels: Map<string, string>, values: Map<string, number>): string {
  if (value === undefined) return '—'
  if (typeof value === 'number') return String(value)
  if ('key' in value) return values.has(value.key) ? String(values.get(value.key)) : '未取得'
  if (!('op' in value)) return labels.get(value.input) ?? value.input
  if (value.op === 'if') return `（${labels.get(value.input) ?? value.input}${GUARD_COMPARISONS[value.comparison]}${guardInputLabel(undefined, value.value)}：${formatGuardExpression(value.yes, labels, values)}／それ以外：${formatGuardExpression(value.no, labels, values)}）`
  const args = value.args.map(arg => formatGuardExpression(arg, labels, values))
  if (value.op === 'min' || value.op === 'max') return `${value.op === 'min' ? '最小' : '最大'}（${args.join('、')}）`
  return `（${args.join(value.op === 'add' ? '＋' : '×')}）`
}

function guardExpressionReferences(value: GuardValue, labels: Map<string, string>): string[] {
  if (typeof value === 'number') return []
  if ('key' in value) return [`blackboard.${value.key}`]
  if (!('op' in value)) return [`条件：${labels.get(value.input) ?? value.input}`]
  if (value.op === 'if') return [...new Set([
    `条件：${labels.get(value.input) ?? value.input}`,
    ...guardExpressionReferences(value.yes, labels), ...guardExpressionReferences(value.no, labels),
  ])]
  return [...new Set(value.args.flatMap(arg => guardExpressionReferences(arg, labels)))]
}

function EffectDefinitionTable({ stage, effect }: { stage: SkillStructureStage; effect: SkillStructureEffect }) {
  const condition = effect.condition
  const rows: [string, string | number][] = [
    ['段階', stage.label], ['タイミング', formatSkillStructureEffectTiming(effect.timing)],
    ...(condition ? [
      ['条件の項目', condition.metric], ['条件の比較', condition.comparison], ['条件の値', String(condition.value)],
    ] as [string, string | number][] : [['条件', 'なし']] as [string, string][]),
    ['対象', formatSkillStructureEffectTarget(effect.target)],
    ['項目キー', effect.item], ['演算', effect.operation],
    ...getSkillStructureEffectValueRows(effect), ['単位', effect.unit],
    ['根拠キー', effect.sourceBinding],
    ...Object.entries(effect.parameterBindings ?? {}).map(([key, binding]) => [`根拠キー（${key}）`, binding] as [string, string]),
    ...(effect.afterEffects ?? []).map((id, index) => [`先に適用する効果${index + 1}`, id] as [string, string]),
  ]
  return <StructureTable caption={`${stage.label}の${formatSkillStructureEffectItem(effect.item)}の定義`}
    headers={['項目', '値']} className="skill-structure-definition-table">
    {rows.map(([label, value]) => <tr key={label}><th scope="row">{label}</th><td>{value}</td></tr>)}
  </StructureTable>
}

function DeferredCaseTable({ entry, caption }: { entry: SkillStructureDeferredCase; caption: string }) {
  const rows = [
    ['保留項目', entry.title], ['状態', '保留'], ['未確定の内容', entry.unresolved],
    ['現在の扱い', entry.currentTreatment], ['保留理由', entry.reason],
    ['影響する計算', entry.impact], ['再開条件', entry.resumeWhen],
  ] as const
  return <StructureTable caption={`${caption}の保留事項：${entry.title}`} headers={['項目', '内容']} className="skill-structure-definition-table">
    {rows.map(([label, value]) => <tr key={label}><th scope="row">{label}</th><td>{value}</td></tr>)}
    {entry.references.map((reference, index) => <tr key={reference.href}>
      <th scope="row">参照先{index + 1}</th><td><a href={reference.href}
        {...(reference.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{reference.label}</a></td>
    </tr>)}
  </StructureTable>
}
