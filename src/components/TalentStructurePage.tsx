import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createTalentStructureHash, type TalentRouteSelection } from '../lib/routes'
import { TALENT_COARSE_CATEGORY_LABELS } from '../lib/talentCoarseClassification'
import {
  TALENT_STRUCTURE_OPERATOR_IDS,
  buildTalentStructures,
  findTalentStructure,
  formatTalentStructureCondition,
  formatTalentStructureTiming,
  formatTalentStructureTarget,
  formatTalentStructureEffectItem,
  formatTalentStructureEffectOperation,
  formatTalentStructureEffectValue,
  getTalentStructureEffectDefinitionRows,
  type TalentStructure,
  type TalentStructureEffect,
} from '../lib/talentStructure'
import type { SkillRecord } from '../types/skill'
import { EMPTY_OPERATOR_FILTERS, OperatorSearch } from './OperatorSearch'
import { StructureTable } from './StructureTable'
import './SkillEffectsPage.css'
import './SkillStructurePage.css'
import './TalentStructurePage.css'

interface Props {
  rows: SkillRecord[]
  loading: boolean
  initialSelection?: TalentRouteSelection
  invalidSelection?: boolean
}

const DEFAULT_SELECTION: TalentRouteSelection = { operatorId: 'char_350_surtr', talentIndex: 0 }
const TABS = [
  ['basic', '基本情報'], ['classification', '分類情報'],
  ['activation', '適用・発動'], ['structure', '効果構造'],
] as const
type StructureTab = typeof TABS[number][0]

export function TalentStructurePage({ rows, loading, initialSelection, invalidSelection = false }: Props) {
  const [activeTab, setActiveTab] = useState<StructureTab>('structure')
  const [operatorSearchOpen, setOperatorSearchOpen] = useState<boolean | null>(null)
  const [operatorFilters, setOperatorFilters] = useState({ ...EMPTY_OPERATOR_FILTERS })
  const operatorTriggerRef = useRef<HTMLButtonElement>(null)
  const searchId = useId()
  const supportedRows = useMemo(() => rows.filter(row => TALENT_STRUCTURE_OPERATOR_IDS.some(id => id === row.operatorId)), [rows])
  const structures = useMemo(() => buildTalentStructures(supportedRows), [supportedRows])
  const selection = invalidSelection ? null : initialSelection ?? DEFAULT_SELECTION
  const structure = selection ? findTalentStructure(selection, structures) : null
  const selectedOperator = selection ? supportedRows.find(row => row.operatorId === selection.operatorId) : undefined
  const operatorTalents = structures.filter(candidate => candidate.basicInfo.operatorId === selection?.operatorId)
    .sort((a, b) => a.basicInfo.talentIndex - b.basicInfo.talentIndex)
  const missingSelection = !loading && !structure
  const searchVisible = operatorSearchOpen ?? missingSelection
  const defaultStructure = findTalentStructure(DEFAULT_SELECTION, structures)

  const chooseTalent = (next: TalentRouteSelection) => {
    const hash = createTalentStructureHash(next)
    if (window.location.hash !== hash) window.location.hash = hash
    setOperatorSearchOpen(false)
  }

  return <section className="skill-effects-page skill-structure-page talent-structure-page">
    <header className="page-intro skill-effects-page-intro"><div>
      <span className="page-kicker">TALENT STRUCTURE</span><h1>素質構造</h1>
    </div></header>
    {loading && rows.length === 0 ? <div className="operator-empty-state skill-effects-page-state" role="status">
      <strong>オペレーターデータを読み込み中…</strong>
    </div> : <>
      {missingSelection && <div className="skill-effects-notice" role="status">
        <strong>{invalidSelection ? '素質の指定を確認できません' : '指定された素質の構造を表示できません'}</strong>
        <p>オペレーターと素質を選び直してください。</p>
        {defaultStructure && <button type="button" onClick={() => chooseTalent(DEFAULT_SELECTION)}>初期の素質を表示</button>}
      </div>}
      <section className="skill-effects-picker" aria-label="表示するオペレーターと素質の選択">
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
          <div className="skill-effects-field talent-structure-condition-field">
            <span>表示条件</span><strong className="skill-effects-fixed-level">最大昇進・最大Lv・潜在1・MODなし</strong>
          </div>
        </div>
        {searchVisible && <div id={searchId} className="skill-effects-operator-search">
          <div className="skill-effects-search-heading"><strong>オペレーターを検索</strong>
            <button type="button" onClick={() => setOperatorSearchOpen(false)}>閉じる</button></div>
          <OperatorSearch rows={supportedRows} loading={loading} filters={operatorFilters}
            onFiltersChange={setOperatorFilters} onSelect={row => {
              const next = structures.find(candidate => candidate.basicInfo.operatorId === row.operatorId)
              if (!next) return
              chooseTalent(next.basicInfo)
              window.requestAnimationFrame(() => operatorTriggerRef.current?.focus({ preventScroll: true }))
            }} instruction="" actionLabel="表示する →" className="skill-effects-search-results"
            selectedOperatorId={selectedOperator?.operatorId} />
        </div>}
        {operatorTalents.length > 0 && <div className="skill-effects-field skill-effects-skill-field">
          <span>素質</span><div className="skill-effects-skill-choices" role="group" aria-label="表示する素質">
            {operatorTalents.map(candidate => {
              const basic = candidate.basicInfo
              const active = structure?.basicInfo.talentIndex === basic.talentIndex
              return <button type="button" key={basic.talentIndex} className={active ? 'active' : ''}
                aria-pressed={active} aria-label={`素質${basic.talentIndex + 1} ${basic.talentName}`}
                onClick={() => chooseTalent(basic)}>
                <span>素質{basic.talentIndex + 1}</span><strong>{basic.talentName}</strong>
              </button>
            })}
          </div>
        </div>}
        {structure && <section className="skill-structure-description talent-structure-description" aria-label="素質説明文"><p>{structure.source.description}</p></section>}
      </section>
      {structure && <>
        {structure.issues.length > 0 && <div className="skill-effects-notice" role="status">
          <strong>構造化データを確認できない項目があります</strong>
          <ul>{structure.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>
        </div>}
        <TalentStructureContent key={`${structure.basicInfo.operatorId}:${structure.basicInfo.talentIndex}`}
          structure={structure} activeTab={activeTab} onTabChange={setActiveTab} />
      </>}
    </>}
  </section>
}

function TalentStructureContent({ structure, activeTab, onTabChange }: {
  structure: TalentStructure
  activeTab: StructureTab
  onTabChange: (tab: StructureTab) => void
}) {
  const id = useId()
  const [selectedEffect, setSelectedEffect] = useState<TalentStructureEffect | null>(null)
  const effectTriggerRef = useRef<HTMLButtonElement | null>(null)
  const b = structure.basicInfo
  const caption = `${b.operatorName} 素質${b.talentIndex + 1} ${b.talentName}`
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
      headers={['オペレーター', '素質番号', '素質名', '昇進段階', 'レベル', '潜在', 'MOD']}
      className="talent-structure-basic-table">
      <tr><td>{b.operatorName}</td><td>{b.talentIndex + 1}</td><td>{b.talentName}</td>
        <td>昇進{b.phaseIndex}</td><td>{b.operatorLevel}</td><td>{b.potentialRank}</td><td>未装備</td></tr>
    </StructureTable>,
    classification: <StructureTable caption={`${caption}の分類情報`} headers={['大分類']}>
      {structure.classificationInfo.coarseCategories.map(category => <tr key={category}><td>{TALENT_COARSE_CATEGORY_LABELS[category]}</td></tr>)}
    </StructureTable>,
    activation: <StructureTable caption={`${caption}の適用・発動`} headers={['適用方式', '発動契機']}>
      {structure.activationSettings.triggers.map((trigger, index) => <tr key={index}>
        <td>パッシブ</td><td>{formatTalentStructureTiming(trigger)}</td>
      </tr>)}
    </StructureTable>,
    structure: <>
      <h3 className="skill-structure-subheading">効果一覧</h3>
      <StructureTable caption={`${caption}の効果一覧`} headers={['タイミング', '条件', '対象', '項目', '演算', '値']}
        className="talent-structure-effects-table">
        {structure.effects.map(effect => <tr key={effect.id}>
          <td>{formatTalentStructureTiming(effect.timing)}</td><td>{formatTalentStructureCondition(effect.condition)}</td>
          <td>{formatTalentStructureTarget(effect.target)}</td>
          <td><button type="button" className="skill-structure-effect-link"
            aria-label={`${formatTalentStructureEffectItem(effect.item)}の定義`} aria-controls={`${id}-effect-definition`}
            aria-expanded={selectedEffect?.id === effect.id} onClick={event => {
              effectTriggerRef.current = event.currentTarget
              setSelectedEffect(effect)
            }}>{formatTalentStructureEffectItem(effect.item)}</button></td>
          <td>{formatTalentStructureEffectOperation(effect)}</td><td>{formatTalentStructureEffectValue(effect)}</td>
        </tr>)}
      </StructureTable>
      <section id={`${id}-effect-definition`} className="skill-structure-definition" hidden={!selectedEffect}
        aria-labelledby={`${id}-effect-definition-title`} aria-live="polite">
        {selectedEffect && <>
          <header><h3 id={`${id}-effect-definition-title`}>{formatTalentStructureEffectItem(selectedEffect.item)}の定義</h3>
            <button type="button" onClick={() => {
              setSelectedEffect(null)
              effectTriggerRef.current?.focus({ preventScroll: true })
            }}>閉じる</button></header>
          <TalentEffectDefinitionTable effect={selectedEffect} />
        </>}
      </section>
      {(structure.notes.length > 0 || structure.deferred.length > 0) && <details className="skill-structure-notes">
        <summary>{structure.deferred.length > 0 ? '構造化の補足・保留事項' : '構造化の補足'}</summary>
        {structure.notes.map(note => <p key={note}>{note}</p>)}
        {structure.deferred.map(entry => <StructureTable key={entry.id} caption={`${caption}の保留事項：${entry.title}`}
          headers={['項目', '内容']} className="skill-structure-definition-table">
          {[
            ['保留項目', entry.title], ['状態', '保留'], ['未確定の内容', entry.unresolved],
            ['現在の扱い', entry.currentTreatment], ['影響する計算', entry.impact], ['再開条件', entry.resumeWhen],
          ].map(([label, value]) => <tr key={label}><th scope="row">{label}</th><td>{value}</td></tr>)}
          {entry.references.map((reference, index) => <tr key={reference.href}>
            <th scope="row">参照先{index + 1}</th><td><a href={reference.href}
              {...(reference.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{reference.label}</a></td>
          </tr>)}
        </StructureTable>)}
      </details>}
    </>,
  }

  return <section className="skill-structure-content talent-structure-content" aria-label="選択した素質の構造">
    <div className="skill-structure-toolbar"><div className="detail-tabs skill-structure-tabs" role="tablist" aria-label="素質構造の区分">
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

export function TalentEffectDefinitionTable({ effect }: { effect: TalentStructureEffect }) {
  const rows = getTalentStructureEffectDefinitionRows(effect)
  return <StructureTable caption={`${formatTalentStructureEffectItem(effect.item)}の定義`} headers={['項目', '値']}
    className="skill-structure-definition-table">
    {rows.map(([label, value], index) => <tr key={`${label}:${index}`}><th scope="row">{label}</th><td>{value}</td></tr>)}
  </StructureTable>
}
