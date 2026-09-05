import { useMemo, useRef, useState } from 'react'
import {
  loadPreferredDefaultOperatorId,
  resolveDamageCalculatorDefaultOperatorId,
} from '../lib/damageCalculatorPreferences'
import type { FilterState } from '../lib/operatorSearchFilters'
import { createSkillEffectsHash, type SkillEffectsRouteSelection } from '../lib/routes'
import { createSkillJsonSelectionKey, expandSkillDescription, getSkillLevelLabel } from '../lib/skillJsonAnalysis'
import type { SkillRecord } from '../types/skill'
import { EMPTY_OPERATOR_FILTERS, OperatorSearch } from './OperatorSearch'
import { SkillDescriptionConverter } from './SkillDescriptionConverter'
import './SkillEffectsPage.css'

interface Props {
  rows: SkillRecord[]
  loading: boolean
  initialSelection?: SkillEffectsRouteSelection
}

export function SkillEffectsPage({ rows, loading, initialSelection }: Props) {
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
  const levelIndex = selection?.levelIndex ?? Math.max(0, skillLevels.length - 1)
  const invalidLevel = !!selectedSkill && (
    !Number.isInteger(levelIndex) || levelIndex < 0 || levelIndex >= skillLevels.length
  )
  const missingSkill = rows.length > 0 && !selectedSkill && selection !== null
  const searchVisible = operatorSearchOpen ?? missingSkill
  const selectedLevel = !invalidLevel ? skillLevels[levelIndex] : undefined
  const displaySkill: SkillRecord | null = selectedSkill && selectedLevel ? {
    ...selectedSkill,
    description: selectedLevel.description ?? '',
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
    const nextHash = createSkillEffectsHash(nextSelection)
    if (window.location.hash !== nextHash) window.location.hash = nextHash
  }

  const chooseSkill = (skill: SkillRecord) => {
    chooseSelection(skill, Math.max(0, skill.skillLevels.length - 1))
    setOperatorSearchOpen(false)
  }

  return (
    <section className="skill-effects-page">
      <header className="page-intro skill-effects-page-intro">
        <div>
          <span className="page-kicker">SKILL EFFECTS</span>
          <h1>スキル効果の解析</h1>
        </div>
        <p>スキルとレベルを選ぶと、説明文から読み取った効果と内容を表示します。</p>
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

          <section className="skill-effects-picker" aria-label="解析するオペレーターとスキルの選択">
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
                  <select
                    value={invalidLevel ? '' : levelIndex}
                    onChange={(event) => chooseSelection(selectedSkill, Number(event.target.value))}
                  >
                    {invalidLevel && <option value="" disabled>レベルを選択してください</option>}
                    {skillLevels.map((_, index) => (
                      <option value={index} key={index}>{getSkillLevelLabel(index, skillLevels.length)}</option>
                    ))}
                  </select>
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
                  instruction="オペレーターを選ぶと、スキルの効果を解析します"
                  actionLabel="解析する →"
                  className="skill-effects-search-results"
                  selectedOperatorId={selectedOperator?.operatorId}
                />
              </div>
            )}

            {operatorSkills.length > 0 && (
              <div className="skill-effects-field skill-effects-skill-field">
                <span>スキル</span>
                <div className="skill-effects-skill-choices" role="group" aria-label="解析するスキル">
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
          </section>

          {invalidLevel && (
            <div className="skill-effects-notice" role="status">
              <strong>リンク先のスキルレベルが見つかりません</strong>
              <p>現在のゲームデータには存在しないレベル指定です。上のスキルレベルから選び直してください。</p>
            </div>
          )}

          {displaySkill && (
            <section className="skill-effects-content" aria-label="選択したスキルの解析">
              <header className="skill-effects-selection-summary">
                <h2>{displaySkill.operatorName} · S{displaySkill.skillIndex} {displaySkill.skillName}</h2>
                <span>{levelLabel}</span>
              </header>
              <section className="skill-effects-description" aria-labelledby="skill-effects-description-heading">
                <h3 id="skill-effects-description-heading">スキル説明文</h3>
                <p>{description || '説明文がありません。'}</p>
              </section>
              <SkillDescriptionConverter
                key={`${createSkillJsonSelectionKey(displaySkill)}:${levelIndex}`}
                skill={displaySkill}
                levelIndex={levelIndex}
                levelLabel={levelLabel}
              />
            </section>
          )}
        </>
      )}
    </section>
  )
}

function compareSkills(a: SkillRecord, b: SkillRecord): number {
  return a.skillIndex - b.skillIndex || a.skillName.localeCompare(b.skillName, 'ja')
}
