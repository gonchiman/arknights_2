import { useMemo, useRef, useState, type ReactNode } from 'react'
import {
  loadPreferredDefaultOperatorId,
  resolveDamageCalculatorDefaultOperatorId,
} from '../lib/damageCalculatorPreferences'
import { classifySkill } from '../lib/classifier'
import type { FilterState } from '../lib/operatorSearchFilters'
import type { SkillRouteSelection } from '../lib/routes'
import { createSkillJsonSelectionKey, expandSkillDescription, getSkillLevelLabel } from '../lib/skillJsonAnalysis'
import type { SkillRecord } from '../types/skill'
import { EMPTY_OPERATOR_FILTERS, OperatorSearch } from './OperatorSearch'
import './SkillEffectsPage.css'

export interface SkillDescriptionSelectionContext {
  skill: SkillRecord
  levelIndex: number
  levelLabel: string
  description: string
}

interface Props {
  rows: SkillRecord[]
  loading: boolean
  initialSelection?: SkillRouteSelection
  createHash: (selection: SkillRouteSelection) => string
  title: string
  kicker: string
  intro?: ReactNode
  getAvailableLevelIndices?: (skill: SkillRecord) => readonly number[]
  selectionActionLabel?: string
  renderSelectionFooter?: (context: SkillDescriptionSelectionContext) => ReactNode
  renderSelection: (context: SkillDescriptionSelectionContext) => ReactNode
}

export function SkillDescriptionSelectionPage({
  rows,
  loading,
  initialSelection,
  createHash,
  title,
  kicker,
  intro,
  getAvailableLevelIndices,
  selectionActionLabel = '解析する',
  renderSelectionFooter,
  renderSelection,
}: Props) {
  const selection = initialSelection ?? null
  const operatorTriggerRef = useRef<HTMLButtonElement>(null)
  const [operatorSearchOpen, setOperatorSearchOpen] = useState<boolean | null>(null)
  const [operatorFilters, setOperatorFilters] = useState<FilterState>({ ...EMPTY_OPERATOR_FILTERS })
  const [preferredDefaultOperatorId] = useState(loadPreferredDefaultOperatorId)

  const operators = useMemo(() => [...new Map(rows.map((row) => [row.operatorId, row])).values()]
    .sort((a, b) => a.operatorName.localeCompare(b.operatorName, 'ja')), [rows])
  const defaultOperatorId = resolveDamageCalculatorDefaultOperatorId(operators, preferredDefaultOperatorId)
  const defaultSkill = useMemo(() => rows
    .filter((row) => row.operatorId === defaultOperatorId)
    .sort(compareSkills)[0] ?? rows[0] ?? null, [rows, defaultOperatorId])
  const selectedSkill = useMemo(
    () => selection === null
      ? defaultSkill
      : rows.find((row) => createSkillJsonSelectionKey(row) === createSkillJsonSelectionKey(selection)) ?? null,
    [rows, selection, defaultSkill],
  )
  const selectedOperatorId = selectedSkill?.operatorId ?? selection?.operatorId
  const selectedOperator = operators.find((operator) => operator.operatorId === selectedOperatorId)
  const operatorSkills = useMemo(() => rows
    .filter((row) => row.operatorId === selectedOperatorId)
    .sort(compareSkills), [rows, selectedOperatorId])
  const skillLevels = selectedSkill
    ? selectedSkill.skillLevels.length > 0 ? selectedSkill.skillLevels : [selectedSkill.raw]
    : []
  const availableLevelIndices = selectedSkill ? getAvailableLevelIndices?.(selectedSkill) : undefined
  const selectableLevelIndices = skillLevels.map((_, index) => index)
    .filter(index => !availableLevelIndices || availableLevelIndices.includes(index))
  const levelIndex = selection?.levelIndex ?? selectableLevelIndices.at(-1) ?? 0
  const invalidLevel = !!selectedSkill && (
    !Number.isInteger(levelIndex) || !selectableLevelIndices.includes(levelIndex)
  )
  const missingSkill = rows.length > 0 && !selectedSkill && selection !== null
  const searchVisible = operatorSearchOpen ?? missingSkill
  const selectedLevel = !invalidLevel ? skillLevels[levelIndex] : undefined
  const displaySkill: SkillRecord | null = selectedSkill && selectedLevel ? {
    ...selectedSkill,
    skillName: selectedLevel.name ?? selectedSkill.skillName,
    description: selectedLevel.description ?? '',
    duration: typeof selectedLevel.duration === 'number' ? selectedLevel.duration : null,
    durationType: selectedLevel.durationType ?? 'UNKNOWN',
    skillType: selectedLevel.skillType ?? 'UNKNOWN',
    spType: selectedLevel.spData?.spType ?? 'UNKNOWN',
    initSp: typeof selectedLevel.spData?.initSp === 'number' ? selectedLevel.spData.initSp : null,
    spCost: typeof selectedLevel.spData?.spCost === 'number' ? selectedLevel.spData.spCost : null,
    classification: classifySkill(selectedLevel),
    raw: selectedLevel,
  } : null
  const description = displaySkill ? expandSkillDescription(displaySkill.description, displaySkill.raw.blackboard ?? [])
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<(?:\/?[A-Za-z@$][^>]*|\/)>/g, '')
    .replace(/\\n/g, '\n')
    .trim() : ''
  const levelLabel = getSkillLevelLabel(levelIndex, skillLevels.length)

  const chooseSelection = (skill: SkillRecord, nextLevelIndex: number) => {
    const nextSelection = {
      operatorId: skill.operatorId,
      skillIndex: skill.skillIndex,
      skillId: skill.skillId,
      levelIndex: nextLevelIndex,
    }
    const nextHash = createHash(nextSelection)
    if (window.location.hash !== nextHash) window.location.hash = nextHash
  }

  const chooseSkill = (skill: SkillRecord) => {
    const lastLevelIndex = Math.max(0, skill.skillLevels.length - 1)
    const available = getAvailableLevelIndices?.(skill)
    const nextLevelIndex = available
      ? [...available].filter(index => Number.isInteger(index) && index >= 0 && index <= lastLevelIndex)
        .sort((a, b) => b - a)[0]
      : lastLevelIndex
    if (nextLevelIndex === undefined) return
    chooseSelection(skill, nextLevelIndex)
    setOperatorSearchOpen(false)
  }

  return (
    <section className="skill-effects-page">
      <header className="page-intro skill-effects-page-intro">
        <div>
          <span className="page-kicker">{kicker}</span>
          <h1>{title}</h1>
        </div>
        {intro && <p>{intro}</p>}
      </header>

      {rows.length === 0 ? (
        <div className="operator-empty-state skill-effects-page-state" role="status">
          <strong>{loading ? 'スキルデータを読み込んでいます' : '解析できるスキルがありません'}</strong>
          {!loading && <span>ゲームデータを取得できる状態か確認して、ページを再読み込みしてください。</span>}
          {!loading && <button type="button" className="button secondary" onClick={() => window.location.reload()}>再読み込み</button>}
        </div>
      ) : (
        <>
          {missingSkill && (
            <div className="skill-effects-notice" role="status">
              <strong>リンク先のスキルが見つかりません</strong>
              <p>現在のゲームデータには存在しない指定です。下の検索やスキルの選択から選び直してください。</p>
              {defaultSkill && <button type="button" onClick={() => chooseSkill(defaultSkill)}>初期スキルを表示</button>}
            </div>
          )}

          <section className="skill-effects-picker" aria-label={`${selectionActionLabel}オペレーターとスキルの選択`}>
            <div className="skill-effects-picker-row">
              <div className="skill-effects-field skill-effects-operator-field">
                <span>オペレーター</span>
                <button
                  ref={operatorTriggerRef}
                  type="button"
                  className="skill-effects-operator-trigger"
                  aria-expanded={searchVisible}
                  aria-controls="skill-effects-operator-search"
                  onClick={() => setOperatorSearchOpen(!searchVisible)}
                >
                  <span>
                    <strong>{selectedOperator?.operatorName ?? 'オペレーターを選択'}</strong>
                    {selectedOperator && <small>★{selectedOperator.rarity} · {selectedOperator.professionLabel} / {selectedOperator.subProfessionName}</small>}
                  </span>
                  <em>{searchVisible ? '検索を閉じる' : '検索して変更'} ↗</em>
                </button>
              </div>

              {selectedSkill && (
                <label className="skill-effects-field skill-effects-level-field">
                  <span>スキルレベル</span>
                  {getAvailableLevelIndices && selectableLevelIndices.length === 1 && !invalidLevel
                    ? <strong className="skill-effects-fixed-level">{levelLabel}</strong>
                    : <select
                    value={invalidLevel ? '' : levelIndex}
                    onChange={(event) => chooseSelection(selectedSkill, Number(event.target.value))}
                  >
                    {invalidLevel && <option value="" disabled>レベルを選択してください</option>}
                    {selectableLevelIndices.map(index => (
                      <option value={index} key={index}>{getSkillLevelLabel(index, skillLevels.length)}</option>
                    ))}
                  </select>}
                </label>
              )}
            </div>

            {searchVisible && (
              <div id="skill-effects-operator-search" className="skill-effects-operator-search">
                <div className="skill-effects-search-heading">
                  <strong>オペレーターを検索</strong>
                  <button type="button" onClick={() => setOperatorSearchOpen(false)}>閉じる</button>
                </div>
                <OperatorSearch
                  rows={rows}
                  filters={operatorFilters}
                  loading={loading}
                  onFiltersChange={setOperatorFilters}
                  onSelect={(skill) => {
                    chooseSkill(skill)
                    window.requestAnimationFrame(() => operatorTriggerRef.current?.focus())
                  }}
                  instruction={selectionActionLabel === '解析する' ? 'オペレーターを選ぶと、スキルの効果を解析します' : ''}
                  actionLabel={`${selectionActionLabel} →`}
                  className="skill-effects-search-results"
                  selectedOperatorId={selectedOperator?.operatorId}
                />
              </div>
            )}

            {operatorSkills.length > 0 && (
              <div className="skill-effects-field skill-effects-skill-field">
                <span>スキル</span>
                <div className="skill-effects-skill-choices" role="group" aria-label={`${selectionActionLabel}スキル`}>
                  {operatorSkills.map((skill) => {
                    const identity = createSkillJsonSelectionKey(skill)
                    const active = selectedSkill !== null && identity === createSkillJsonSelectionKey(selectedSkill)
                    return (
                      <button
                        type="button"
                        className={active ? 'active' : ''}
                        aria-pressed={active}
                        aria-label={`S${skill.skillIndex} ${skill.skillName}`}
                        onClick={() => chooseSkill(skill)}
                        key={identity}
                      >
                        <span>S{skill.skillIndex}</span>
                        <strong>{skill.skillName}</strong>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            {displaySkill && renderSelectionFooter?.({ skill: displaySkill, levelIndex, levelLabel, description })}
          </section>

          {invalidLevel && (
            <div className="skill-effects-notice" role="status">
              <strong>リンク先のスキルレベルが見つかりません</strong>
              <p>{getAvailableLevelIndices ? 'このページで表示できないレベル指定です。' : '現在のゲームデータには存在しないレベル指定です。'}上のスキルレベルから選び直してください。</p>
            </div>
          )}

          {displaySkill && renderSelection({ skill: displaySkill, levelIndex, levelLabel, description })}
        </>
      )}
    </section>
  )
}

function compareSkills(a: SkillRecord, b: SkillRecord): number {
  return a.skillIndex - b.skillIndex || a.skillName.localeCompare(b.skillName, 'ja')
}
