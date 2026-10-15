import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createSkillStructureHash, type SkillRouteSelection } from '../lib/routes'
import { SKILL_COARSE_CATEGORY_LABELS } from '../lib/skillCoarseClassification'
import {
  findSkillStructure, formatSkillStructureActivationMethod, formatSkillStructureActivationTrigger,
  formatSkillStructureDuration, formatSkillStructureEffectItem, formatSkillStructureEffectOperation,
  formatSkillStructureEffectTarget, formatSkillStructureEffectTiming, formatSkillStructureEffectValue,
  formatSkillStructureEndCondition, formatSkillStructurePredicate, formatSkillStructureSpRecovery,
  getSkillStructureLevelIndices, isSkillStructureRecord,
  type SkillStructure, type SkillStructureEffect, type SkillStructureStage,
} from '../lib/skillStructure'
import type { SkillRecord } from '../types/skill'
import { SkillDescriptionSelectionPage } from './SkillDescriptionSelectionPage'
import './SkillStructurePage.css'

interface Props {
  rows: SkillRecord[]
  loading: boolean
  initialSelection?: SkillRouteSelection
}

const TABS = [
  ['basic', '基本情報'], ['classification', '分類情報'],
  ['activation', '発動設定'], ['structure', '効果構造'],
] as const
type StructureTab = typeof TABS[number][0]

const DEFAULT_SELECTION: SkillRouteSelection = {
  operatorId: 'char_350_surtr', skillIndex: 2, skillId: 'skchr_surtr_2', levelIndex: 9,
}

export function SkillStructurePage({ rows, loading, initialSelection }: Props) {
  const supportedRows = useMemo(() => rows.filter(isSkillStructureRecord), [rows])
  const [activeTab, setActiveTab] = useState<StructureTab>('structure')

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
    structure: <>
      <h3 className="skill-structure-subheading">段階</h3>
      <StructureTable caption={`${caption}の段階`} className="skill-structure-stage-table"
        headers={['段階', '段階の適用条件', '持続時間', '終了条件']}>
        {structure.effectStructure.stages.map(stage => <tr key={stage.id}>
          <th scope="row">{stage.label}</th>
          <td>{formatSkillStructurePredicate(stage.applicability, '追加条件なし')}</td>
          <td>{formatSkillStructureDuration(stage.duration)}</td>
          <td>{formatSkillStructureEndCondition(stage.endCondition)}</td>
        </tr>)}
      </StructureTable>
      <h3 className="skill-structure-subheading">効果一覧</h3>
      <div className="table-wrap skill-structure-table-wrap" tabIndex={0} role="region" aria-label={`${caption}の効果一覧`}>
        <table className="skill-structure-table skill-structure-effects-table">
          <caption className="visually-hidden">{caption}の効果一覧</caption>
          <colgroup><col className="skill-structure-stage-col" /><col className="skill-structure-timing-col" />
            <col className="skill-structure-condition-col" /><col className="skill-structure-target-col" />
            <col className="skill-structure-item-col" /><col className="skill-structure-operation-col" /><col /></colgroup>
          <thead><tr>{['段階', 'タイミング', '条件', '対象', '項目', '演算', '値'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
          {structure.effectStructure.stages.map(stage => <tbody key={stage.id}>
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
      {structure.notes.length > 0 && <details className="skill-structure-notes"><summary>構造化の補足</summary>
        {structure.notes.map(note => <p key={note}>{note}</p>)}
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

function StructureTable({ caption, headers, className = '', children }: {
  caption: string; headers: readonly string[]; className?: string; children: ReactNode
}) {
  return <div className="table-wrap skill-structure-table-wrap" tabIndex={0} role="region" aria-label={caption}>
    <table className={`skill-structure-table ${className}`.trim()}>
      <caption className="visually-hidden">{caption}</caption>
      <thead><tr>{headers.map(header => <th scope="col" key={header}>{header}</th>)}</tr></thead>
      <tbody>{children}</tbody>
    </table>
  </div>
}

function EffectDefinitionTable({ stage, effect }: { stage: SkillStructureStage; effect: SkillStructureEffect }) {
  const condition = effect.condition
  const rows: [string, string | number][] = [
    ['段階', stage.label], ['タイミング', formatSkillStructureEffectTiming(effect.timing)],
    ...(condition ? [
      ['条件の項目', condition.metric], ['条件の比較', condition.comparison], ['条件の値', condition.value],
    ] as [string, string | number][] : [['条件', 'なし']] as [string, string][]),
    ['対象', formatSkillStructureEffectTarget(effect.target)],
    ['項目キー', effect.item], ['演算', effect.operation],
    ['値', typeof effect.value === 'object' ? effect.value.rangeId : String(effect.value)], ['単位', effect.unit],
  ]
  return <StructureTable caption={`${stage.label}の${formatSkillStructureEffectItem(effect.item)}の定義`}
    headers={['項目', '値']} className="skill-structure-definition-table">
    {rows.map(([label, value]) => <tr key={label}><th scope="row">{label}</th><td>{value}</td></tr>)}
  </StructureTable>
}
