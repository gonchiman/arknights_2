import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createTraitStructureHash, type TraitRouteSelection } from '../lib/routes'
import { TRAIT_COARSE_CATEGORY_LABELS } from '../lib/traitCoarseClassification'
import {
  buildTraitStructures, findTraitStructure,
  formatTraitStructureCondition, formatTraitStructureTiming, formatTraitStructureTarget,
  formatTraitStructureEffectItem, formatTraitStructureEffectOperation, formatTraitStructureEffectValue,
  getTraitStructureEffectDefinitionRows, type TraitStructure, type TraitStructureEffect,
} from '../lib/traitStructure'
import type { SkillRecord } from '../types/skill'
import { EMPTY_OPERATOR_FILTERS, OperatorSearch } from './OperatorSearch'
import { StructureTable } from './StructureTable'
import './SkillEffectsPage.css'
import './SkillStructurePage.css'
import './TraitStructurePage.css'

interface Props {
  rows: SkillRecord[]
  loading: boolean
  initialSelection?: TraitRouteSelection
  invalidSelection?: boolean
}
const DEFAULT_SELECTION: TraitRouteSelection = { operatorId: 'char_350_surtr' }
const TABS = [
  ['basic', '基本情報'], ['classification', '分類情報'],
  ['activation', '適用・発動'], ['structure', '効果構造'],
] as const
type StructureTab = typeof TABS[number][0]
const STRUCTURE_STATUS_LABELS = { STRUCTURED: '構造化済み', PARTIAL: '一部保留', UNREVIEWED: '未確認' } as const

export function TraitStructurePage({ rows, loading, initialSelection, invalidSelection = false }: Props) {
  const [activeTab, setActiveTab] = useState<StructureTab>('structure')
  const [operatorSearchOpen, setOperatorSearchOpen] = useState<boolean | null>(null)
  const [operatorFilters, setOperatorFilters] = useState({ ...EMPTY_OPERATOR_FILTERS })
  const operatorTriggerRef = useRef<HTMLButtonElement>(null)
  const searchId = useId()
  const structures = useMemo(() => buildTraitStructures(rows), [rows])
  const supportedRows = useMemo(() => {
    const ids = new Set(structures.map(structure => structure.basicInfo.operatorId))
    return rows.filter(row => ids.has(row.operatorId))
  }, [rows, structures])
  const selection = invalidSelection ? null : initialSelection ?? DEFAULT_SELECTION
  const structure = selection ? findTraitStructure(selection, structures) : null
  const selectedOperator = selection ? rows.find(row => row.operatorId === selection.operatorId) : undefined
  const missingSelection = !loading && !structure
  const searchVisible = operatorSearchOpen ?? missingSelection
  const defaultStructure = findTraitStructure(DEFAULT_SELECTION, structures)

  const chooseTrait = (next: TraitRouteSelection) => {
    const hash = createTraitStructureHash(next)
    if (window.location.hash !== hash) window.location.hash = hash
    setOperatorSearchOpen(false)
  }

  return <section className="skill-effects-page skill-structure-page trait-structure-page">
    <header className="page-intro skill-effects-page-intro"><div>
      <span className="page-kicker">TRAIT STRUCTURE</span><h1>特性構造</h1>
    </div><p><a className="button secondary" href="#/structure-coverage">実装範囲</a></p></header>
    {loading && rows.length === 0 ? <div className="operator-empty-state skill-effects-page-state" role="status">
      <strong>オペレーターデータを読み込み中…</strong>
    </div> : <>
      {missingSelection && <div className="skill-effects-notice" role="status">
        <strong>{invalidSelection ? '特性の指定を確認できません' : '指定された特性の構造を表示できません'}</strong>
        {defaultStructure && <button type="button" onClick={() => chooseTrait(DEFAULT_SELECTION)}>初期の特性を表示</button>}
      </div>}
      <section className="skill-effects-picker" aria-label="表示するオペレーターの選択">
        <div className="skill-effects-picker-row">
          <div className="skill-effects-field skill-effects-operator-field">
            <span>オペレーター</span>
            <button ref={operatorTriggerRef} type="button" className="skill-effects-operator-trigger"
              aria-expanded={searchVisible} aria-controls={searchId}
              onClick={() => setOperatorSearchOpen(!searchVisible)}>
              <span><strong>{selectedOperator?.operatorName ?? 'オペレーターを選択'}</strong>
                {selectedOperator && <small>★{selectedOperator.rarity} · {selectedOperator.professionLabel} / {selectedOperator.subProfessionName}</small>}
              </span><em>{searchVisible ? '検索を閉じる' : '検索して変更'} ↗</em>
            </button>
          </div>
          <div className="skill-effects-field trait-structure-condition-field">
            <span>表示条件</span><strong className="skill-effects-fixed-level">最大昇進・最大Lv・潜在1・MODなし</strong>
          </div>
        </div>
        {searchVisible && <div id={searchId} className="skill-effects-operator-search">
          <div className="skill-effects-search-heading"><strong>オペレーターを検索</strong>
            <button type="button" onClick={() => setOperatorSearchOpen(false)}>閉じる</button></div>
          <OperatorSearch rows={supportedRows} loading={loading} filters={operatorFilters}
            onFiltersChange={setOperatorFilters} onSelect={row => {
              chooseTrait({ operatorId: row.operatorId })
              window.requestAnimationFrame(() => operatorTriggerRef.current?.focus({ preventScroll: true }))
            }} instruction="" actionLabel="表示する →" className="skill-effects-search-results"
            selectedOperatorId={selectedOperator?.operatorId} />
        </div>}
        {structure && <section className="skill-structure-description" aria-label="特性説明文"><p>{structure.source.description}</p></section>}
      </section>
      {structure && <>
        {structure.issues.length > 0 && <div className="skill-effects-notice" role="status">
          <strong>構造化データを確認できない項目があります</strong>
          <ul>{structure.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>
        </div>}
        <TraitStructureContent key={structure.basicInfo.operatorId}
          structure={structure} activeTab={activeTab} onTabChange={setActiveTab} />
      </>}
    </>}
  </section>
}

function TraitStructureContent({ structure, activeTab, onTabChange }: {
  structure: TraitStructure; activeTab: StructureTab; onTabChange: (tab: StructureTab) => void
}) {
  const id = useId()
  const [selectedEffectId, setSelectedEffectId] = useState<string | null>(null)
  const selectedEffect = structure.effects.find(effect => effect.id === selectedEffectId) ?? null
  const effectTriggerRef = useRef<HTMLButtonElement | null>(null)
  const b = structure.basicInfo
  const caption = `${b.operatorName}の特性`
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
      headers={['オペレーター', '職業', '職分', '昇進段階', 'レベル', '潜在', 'MOD', '構造化']} className="trait-structure-basic-table">
      <tr><td>{b.operatorName}</td><td>{b.professionLabel}</td><td>{b.subProfessionName}</td>
        <td>昇進{b.phaseIndex}</td><td>{b.operatorLevel}</td><td>{b.potentialRank}</td><td>未装備</td>
        <td>{STRUCTURE_STATUS_LABELS[structure.status]}</td></tr>
    </StructureTable>,
    classification: <StructureTable caption={`${caption}の分類情報`} headers={['大分類']}>
      {structure.classificationInfo.coarseCategories.map(category => <tr key={category}><td>{TRAIT_COARSE_CATEGORY_LABELS[category]}</td></tr>)}
    </StructureTable>,
    activation: <StructureTable caption={`${caption}の適用・発動`} headers={['適用方式', '発動契機']}>
      {structure.activationSettings.triggers.map((trigger, index) => <tr key={index}>
        <td>パッシブ</td><td>{formatTraitStructureTiming(trigger)}</td>
      </tr>)}
    </StructureTable>,
    structure: <>
      <h3 className="skill-structure-subheading">効果一覧</h3>
      {structure.effects.length === 0 && <p role="status">表示できる構造化済みの効果がありません</p>}
      <StructureTable caption={`${caption}の効果一覧`} headers={['タイミング', '条件', '対象', '項目', '演算', '値']}
        className="trait-structure-effects-table">
        {structure.effects.map(effect => <tr key={effect.id}>
          <td>{formatTraitStructureTiming(effect.timing)}</td><td>{formatTraitStructureCondition(effect.condition)}</td>
          <td>{formatTraitStructureTarget(effect.target)}</td>
          <td><button type="button" className="skill-structure-effect-link"
            aria-label={`${formatTraitStructureEffectItem(effect.item)}の定義`} aria-controls={`${id}-effect-definition`}
            aria-expanded={selectedEffect?.id === effect.id} onClick={event => {
              effectTriggerRef.current = event.currentTarget
              setSelectedEffectId(effect.id)
            }}>{formatTraitStructureEffectItem(effect.item)}</button></td>
          <td>{formatTraitStructureEffectOperation(effect)}</td><td>{formatTraitStructureEffectValue(effect)}</td>
        </tr>)}
      </StructureTable>
      <section id={`${id}-effect-definition`} className="skill-structure-definition" hidden={!selectedEffect}
        aria-labelledby={`${id}-effect-definition-title`} aria-live="polite">
        {selectedEffect && <>
          <header><h3 id={`${id}-effect-definition-title`}>{formatTraitStructureEffectItem(selectedEffect.item)}の定義</h3>
            <button type="button" onClick={() => {
              setSelectedEffectId(null)
              effectTriggerRef.current?.focus({ preventScroll: true })
            }}>閉じる</button></header>
          <TraitEffectDefinitionTable effect={selectedEffect} />
        </>}
      </section>
      {structure.notes.length > 0 && <details className="skill-structure-notes">
        <summary>構造化の保留事項</summary>
        <StructureTable caption={`${caption}の保留事項`} headers={['内容']}>
          {structure.notes.map((note, index) => <tr key={index}><td>{note}</td></tr>)}
        </StructureTable>
      </details>}
    </>,
  }
  return <section className="skill-structure-content trait-structure-content" aria-label="選択した特性の構造">
    <div className="skill-structure-toolbar"><div className="detail-tabs skill-structure-tabs" role="tablist" aria-label="特性構造の区分">
      {TABS.map(([tab, label], index) => <button type="button" key={tab}
        id={`${id}-tab-${tab}`} className={`detail-tab ${activeTab === tab ? 'active' : ''}`}
        role="tab" aria-selected={activeTab === tab} aria-controls={`${id}-panel-${tab}`}
        tabIndex={activeTab === tab ? 0 : -1} onClick={() => onTabChange(tab)}
        onKeyDown={event => changeTabWithKeyboard(event, index)}>{label}</button>)}
    </div></div>
    <div className="skill-structure-tab-panels">
      {TABS.map(([tab, label]) => <section key={tab} id={`${id}-panel-${tab}`} className="skill-structure-tab-panel"
        role="tabpanel" aria-labelledby={`${id}-tab-${tab}`} aria-hidden={activeTab !== tab} inert={activeTab !== tab}>
        <h2>{label}</h2><div className="skill-structure-panel-body">{contents[tab]}</div>
      </section>)}
    </div>
  </section>
}

export function TraitEffectDefinitionTable({ effect }: { effect: TraitStructureEffect }) {
  return <StructureTable caption={`${formatTraitStructureEffectItem(effect.item)}の定義`} headers={['項目', '値']}
    className="skill-structure-definition-table">
    {getTraitStructureEffectDefinitionRows(effect).map(([label, value], index) =>
      <tr key={`${label}:${index}`}><th scope="row">{label}</th><td>{value}</td></tr>)}
  </StructureTable>
}
