import { useMemo, useState } from 'react'
import {
  loadPreferredDefaultOperatorId,
  persistPreferredDefaultOperatorId,
  resolveDamageCalculatorDefaultOperatorId,
} from '../lib/damageCalculatorPreferences'
import {
  createSkillJsonSelectionKey,
  getSkillLevelLabel,
} from '../lib/skillJsonAnalysis'
import type { FilterState } from '../lib/operatorSearchFilters'
import { createSkillJsonHash, type SkillJsonRouteSelection } from '../lib/routes'
import type { RawBlackboardEntry, SkillRecord } from '../types/skill'
import { EMPTY_OPERATOR_FILTERS, OperatorSearch } from './OperatorSearch'
import { SkillJsonViewNav } from './SkillJsonViewNav'
import './SkillJsonPage.css'

interface Props {
  rows: SkillRecord[]
  loading: boolean
  initialSelection?: SkillJsonRouteSelection
}

export function SkillJsonPage({ rows, loading, initialSelection }: Props) {
  const [selectedKey, setSelectedKey] = useState<string | null>(() => (
    initialSelection ? createSkillJsonSelectionKey(initialSelection) : null
  ))
  const [requestedLevelIndex, setRequestedLevelIndex] = useState<number | null>(
    initialSelection?.levelIndex ?? null,
  )
  const [operatorSearchOpen, setOperatorSearchOpen] = useState(false)
  const [operatorFilters, setOperatorFilters] = useState<FilterState>({ ...EMPTY_OPERATOR_FILTERS })
  const [preferredDefaultOperatorId, setPreferredDefaultOperatorId] = useState(loadPreferredDefaultOperatorId)

  const operators = useMemo(() => [...new Map(rows.map((row) => [row.operatorId, row])).values()]
    .sort((a, b) => a.operatorName.localeCompare(b.operatorName, 'ja')), [rows])
  const defaultOperatorId = resolveDamageCalculatorDefaultOperatorId(operators, preferredDefaultOperatorId)
  const defaultOperator = operators.find((operator) => operator.operatorId === defaultOperatorId) ?? null
  const defaultSkill = useMemo(
    () => rows
      .filter((row) => row.operatorId === defaultOperatorId)
      .sort((a, b) => a.skillIndex - b.skillIndex || a.skillName.localeCompare(b.skillName, 'ja'))[0]
      ?? rows[0]
      ?? null,
    [rows, defaultOperatorId],
  )
  const selectedSkill = useMemo(
    () => selectedKey === null
      ? defaultSkill
      : rows.find((row) => createSkillJsonSelectionKey(row) === selectedKey) ?? null,
    [rows, selectedKey, defaultSkill],
  )
  const selectedOperatorId = selectedSkill?.operatorId ?? null
  const operatorSkills = useMemo(
    () => selectedOperatorId
      ? rows
        .filter((row) => row.operatorId === selectedOperatorId)
        .sort((a, b) => a.skillIndex - b.skillIndex || a.skillName.localeCompare(b.skillName, 'ja'))
      : [],
    [rows, selectedOperatorId],
  )

  if (loading && rows.length === 0) {
    return <SkillJsonPageState title="skill_table.json を読み込んでいます" />
  }

  if (!selectedSkill) {
    if (selectedKey !== null && rows.length > 0) {
      return (
        <SkillJsonPageStateShell
          title="リンク先のスキルが見つかりません"
          description="現在のゲームデータには存在しない指定です。キー一覧または個別表示から選び直してください。"
        />
      )
    }
    return (
      <SkillJsonPageState
        title="表示できるスキルがありません"
        description="ゲームデータを取得できる状態か確認してください。"
      />
    )
  }

  const skillLevels = selectedSkill.skillLevels.length > 0
    ? selectedSkill.skillLevels
    : [selectedSkill.raw]
  if (requestedLevelIndex !== null && requestedLevelIndex >= skillLevels.length) {
    return (
      <SkillJsonPageStateShell
        title="リンク先のスキルレベルが見つかりません"
        description="現在のゲームデータには存在しないレベル指定です。キー一覧から選び直してください。"
      />
    )
  }

  const lastLevelIndex = Math.max(0, skillLevels.length - 1)
  const levelIndex = clamp(requestedLevelIndex ?? lastLevelIndex, 0, lastLevelIndex)
  const selectedLevel = skillLevels[levelIndex] ?? selectedSkill.raw
  const blackboard = asBlackboardEntries(selectedLevel.blackboard)
  const selectedIdentity = createSkillJsonSelectionKey(selectedSkill)

  const chooseSkill = (skill: SkillRecord) => {
    const nextLastIndex = Math.max(0, skill.skillLevels.length - 1)
    setSelectedKey(createSkillJsonSelectionKey(skill))
    setRequestedLevelIndex(nextLastIndex)
    navigateToSkillJsonSelection(skill, nextLastIndex)
  }

  const chooseLevel = (nextIndex: number) => {
    setRequestedLevelIndex(nextIndex)
    navigateToSkillJsonSelection(selectedSkill, nextIndex)
  }

  return (
    <section className="skill-json-page">
      <SkillJsonPageHeader />

      <SkillJsonViewNav active="detail" />

      <section className="skill-json-picker" aria-label="オペレーターとスキルの選択">
        <div className="operator-search-summary">
          <div className="calculator-field operator-picker-field">
            <span>選択中のオペレーター</span>
            <button
              type="button"
              className="operator-search-trigger"
              aria-expanded={operatorSearchOpen}
              aria-controls="skill-json-operator-search"
              onClick={() => setOperatorSearchOpen((open) => !open)}
            >
              <strong>{selectedSkill.operatorName}</strong>
              <small>★{selectedSkill.rarity} · {selectedSkill.professionLabel} / {selectedSkill.subProfessionName}</small>
              <em>{operatorSearchOpen ? '検索を閉じる' : '検索して変更'} ↗</em>
            </button>
          </div>
          <div className="default-operator-setting">
            <span>
              起動時の初期オペレーター
              <strong>{defaultOperator?.operatorName ?? '未設定'}</strong>
            </span>
            <button
              type="button"
              disabled={selectedSkill.operatorId === defaultOperatorId}
              onClick={() => {
                persistPreferredDefaultOperatorId(selectedSkill.operatorId)
                setPreferredDefaultOperatorId(selectedSkill.operatorId)
              }}
            >
              {selectedSkill.operatorId === defaultOperatorId ? '初期値に設定済み' : '選択中を初期値に設定'}
            </button>
          </div>
        </div>

        {operatorSearchOpen && (
          <div id="skill-json-operator-search" className="calculator-operator-search">
            <div className="operator-search-heading">
              <div><strong>オペレーターを検索</strong><span>一覧画面と同じ条件で絞り込めます</span></div>
              <button type="button" onClick={() => setOperatorSearchOpen(false)}>閉じる</button>
            </div>
            <OperatorSearch
              rows={rows}
              filters={operatorFilters}
              loading={loading}
              onFiltersChange={setOperatorFilters}
              onSelect={(row) => {
                chooseSkill(row)
                setOperatorSearchOpen(false)
              }}
              instruction="行を選択すると表示対象へ反映します"
              actionLabel="選択する →"
              className="damage-operator-search-results"
              selectedOperatorId={selectedSkill.operatorId}
            />
          </div>
        )}

        <div className="calculator-field skill-picker-field skill-json-skill-picker">
          <span>スキル</span>
          <div className="skill-choice-group" role="group" aria-label="スキル">
            {operatorSkills.map((skill) => {
              const key = createSkillJsonSelectionKey(skill)
              const active = key === selectedIdentity
              return (
                <button
                  type="button"
                  className={active ? 'active' : ''}
                  aria-pressed={active}
                  aria-label={`S${skill.skillIndex} ${skill.skillName}`}
                  onClick={() => chooseSkill(skill)}
                  key={key}
                >
                  <span>S{skill.skillIndex}</span>
                  <strong>{skill.skillName}</strong>
                </button>
              )
            })}
          </div>
        </div>
      </section>

      <section className="skill-json-content" aria-label="選択したスキルレベルのデータ">
        <header className="skill-json-selection-summary">
          <div>
            <span>SELECTED SKILL</span>
            <h2>{selectedSkill.operatorName} · S{selectedSkill.skillIndex} {selectedSkill.skillName}</h2>
          </div>
          <label>
            <span>スキルレベル</span>
            <select
              value={levelIndex}
              onChange={(event) => chooseLevel(Number(event.target.value))}
            >
              {skillLevels.map((_, index) => (
                <option value={index} key={index}>
                  {getSkillLevelLabel(index, skillLevels.length)}
                </option>
              ))}
            </select>
          </label>
        </header>

        <section className="skill-json-block" aria-labelledby="skill-json-description-heading">
          <h3 id="skill-json-description-heading">description</h3>
          <pre className="skill-json-description">{selectedLevel.description || '（description なし）'}</pre>
        </section>

        <section className="skill-json-block" aria-labelledby="skill-json-blackboard-heading">
          <div className="skill-json-block-heading">
            <h3 id="skill-json-blackboard-heading">blackboard</h3>
            <span>{blackboard.length} entries</span>
          </div>
          {blackboard.length === 0 ? (
            <p className="skill-json-empty-row">blackboard に項目はありません。</p>
          ) : (
            <div
              className="table-wrap skill-json-table-wrap"
              role="region"
              aria-label="選択レベルのblackboard。横方向にスクロールできます"
              tabIndex={0}
            >
              <table className="skill-json-blackboard-table">
                <caption className="visually-hidden">選択レベルのblackboard生データ</caption>
                <thead>
                  <tr><th>key</th><th>value</th><th>valueStr</th></tr>
                </thead>
                <tbody>
                  {blackboard.map((entry, index) => (
                    <tr key={`${String(entry.key)}:${index}`}>
                      <td><code>{formatKey(entry.key)}</code></td>
                      <td><code>{formatRawField(entry, 'value')}</code></td>
                      <td><code>{formatRawField(entry, 'valueStr')}</code></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </section>
  )
}

function SkillJsonPageState({ title, description }: { title: string, description?: string }) {
  return (
    <section className="operator-empty-state skill-json-page-state" role="status">
      <span className="page-kicker">SKILL TABLE VIEWER</span>
      <strong>{title}</strong>
      {description && <span>{description}</span>}
    </section>
  )
}

function SkillJsonPageStateShell({ title, description }: { title: string, description: string }) {
  return (
    <section className="skill-json-page">
      <SkillJsonPageHeader />
      <SkillJsonViewNav active="detail" />
      <SkillJsonPageState title={title} description={description} />
    </section>
  )
}

function SkillJsonPageHeader() {
  return (
    <header className="page-intro skill-json-page-intro">
      <div>
        <span className="page-kicker">SKILL TABLE VIEWER</span>
        <h1>Skill JSON 個別表示</h1>
      </div>
      <p>選択したスキルレベルのdescriptionとblackboardを確認できます。</p>
    </header>
  )
}

function navigateToSkillJsonSelection(skill: SkillRecord, levelIndex: number): void {
  const nextHash = createSkillJsonHash({
    operatorId: skill.operatorId,
    skillIndex: skill.skillIndex,
    skillId: skill.skillId,
    levelIndex,
  })
  if (window.location.hash !== nextHash) window.location.hash = nextHash
}

function asBlackboardEntries(value: unknown): RawBlackboardEntry[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is RawBlackboardEntry => (
    typeof entry === 'object' && entry !== null && !Array.isArray(entry)
  ))
}

function formatKey(value: unknown): string {
  if (value === undefined) return 'undefined'
  if (value === null) return 'null'
  if (typeof value === 'string') return value || '""'
  return String(value)
}

function formatRawField(entry: RawBlackboardEntry, field: 'value' | 'valueStr'): string {
  if (!Object.hasOwn(entry, field)) return 'undefined'
  const value = entry[field]
  if (value === null) return 'null'
  return typeof value === 'string' ? JSON.stringify(value) : String(value)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
