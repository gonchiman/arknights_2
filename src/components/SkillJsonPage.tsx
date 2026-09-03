import { useMemo, useState } from 'react'
import {
  loadPreferredDefaultOperatorId,
  persistPreferredDefaultOperatorId,
  resolveDamageCalculatorDefaultOperatorId,
} from '../lib/damageCalculatorPreferences'
import {
  createSkillJsonSelectionKey,
  diffBlackboards,
  getSkillLevelLabel,
  inspectSkillLevel,
  type BlackboardDiffKind,
} from '../lib/skillJsonAnalysis'
import type { FilterState } from '../lib/operatorSearchFilters'
import type { RawBlackboardEntry, SkillRecord } from '../types/skill'
import { EMPTY_OPERATOR_FILTERS, OperatorSearch } from './OperatorSearch'
import './SkillJsonPage.css'

interface Props {
  rows: SkillRecord[]
  loading: boolean
}

const DIFF_LABELS: Record<BlackboardDiffKind, string> = {
  ADDED: '追加',
  REMOVED: '削除',
  CHANGED: '変更',
  UNCHANGED: '同一',
}

export function SkillJsonPage({ rows, loading }: Props) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [requestedLevelIndex, setRequestedLevelIndex] = useState<number | null>(null)
  const [requestedCompareIndex, setRequestedCompareIndex] = useState<number | null>(null)
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
    () => rows.find((row) => createSkillJsonSelectionKey(row) === selectedKey) ?? defaultSkill,
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
    return (
      <SkillJsonPageState
        title="表示できるスキルがありません"
        description="ゲームデータを取得できる状態か確認してください。"
      />
    )
  }

  const lastLevelIndex = Math.max(0, selectedSkill.skillLevels.length - 1)
  const levelIndex = clamp(requestedLevelIndex ?? lastLevelIndex, 0, lastLevelIndex)
  const compareIndex = clamp(
    requestedCompareIndex ?? Math.max(0, levelIndex - 1),
    0,
    lastLevelIndex,
  )
  const inspection = inspectSkillLevel(selectedSkill, levelIndex)
  const compareLevel = selectedSkill.skillLevels[compareIndex] ?? selectedSkill.raw
  const diffRows = diffBlackboards(
    asBlackboardEntries(compareLevel.blackboard),
    asBlackboardEntries(inspection.level.blackboard),
  )
  const changedDiffCount = diffRows.filter((row) => row.kind !== 'UNCHANGED').length
  const unreferencedBlackboardCount = inspection.blackboardRows
    .filter((row) => row.referencedBy.length === 0).length
  const selectedIdentity = createSkillJsonSelectionKey(selectedSkill)

  const chooseSkill = (skill: SkillRecord) => {
    const nextLastIndex = Math.max(0, skill.skillLevels.length - 1)
    setSelectedKey(createSkillJsonSelectionKey(skill))
    setRequestedLevelIndex(nextLastIndex)
    setRequestedCompareIndex(Math.max(0, nextLastIndex - 1))
  }

  const chooseLevel = (nextIndex: number) => {
    setRequestedLevelIndex(nextIndex)
    setRequestedCompareIndex(Math.max(0, nextIndex - 1))
  }

  return (
    <section className="skill-json-page">
      <header className="page-intro skill-json-page-intro">
        <div>
          <span className="page-kicker">SKILL TABLE INSPECTOR</span>
          <h1>Skill JSON</h1>
        </div>
        <p>skill_table.json の生データと、description との照合結果を分けて確認できます。</p>
      </header>

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
              instruction="行を選択すると確認対象へ反映します"
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

      <div className="skill-json-content">
          <header className="skill-json-selection-summary">
            <div>
              <span>SELECTED RECORD</span>
              <h2>{selectedSkill.operatorName} · S{selectedSkill.skillIndex} {selectedSkill.skillName}</h2>
              <p>★{selectedSkill.rarity} · {selectedSkill.professionLabel} / {selectedSkill.subProfessionName}</p>
            </div>
            <label>
              <span>スキルレベル</span>
              <select
                value={levelIndex}
                onChange={(event) => chooseLevel(Number(event.target.value))}
              >
                {selectedSkill.skillLevels.map((_, index) => (
                  <option value={index} key={index}>
                    {getSkillLevelLabel(index, selectedSkill.skillLevels.length)}
                  </option>
                ))}
              </select>
            </label>
          </header>

          <dl className="skill-json-record-identity">
            <div><dt>operatorId</dt><dd><code>{selectedSkill.operatorId}</code></dd></div>
            <div><dt>skillIndex</dt><dd><code>{selectedSkill.skillIndex}</code></dd></div>
            <div><dt>skillId</dt><dd><code>{selectedSkill.skillId}</code></dd></div>
            <div className="skill-json-selection-key"><dt>選択キー</dt><dd><code>{selectedIdentity}</code></dd></div>
          </dl>

          <section className="skill-json-section skill-json-raw-section" aria-labelledby="skill-json-raw-heading">
            <SectionHeading
              id="skill-json-raw-heading"
              kicker="RAW DATA"
              title="生データ"
              description={`${inspection.levelLabel} · skill_table.json の値を意味付けせず表示`}
            />

            <div className="skill-json-block">
              <h3>元の description</h3>
              <pre className="skill-json-description source">{inspection.sourceDescription || '（description なし）'}</pre>
            </div>

            <div className="skill-json-block">
              <div className="skill-json-block-heading">
                <h3>blackboard</h3>
                <span>{inspection.blackboardRows.length} entries</span>
              </div>
              {inspection.blackboardRows.length === 0 ? (
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
                      <tr><th>#</th><th>key</th><th>value</th><th>valueStr</th></tr>
                    </thead>
                    <tbody>
                      {inspection.blackboardRows.map(({ entry, index }) => (
                        <tr key={`${entry.key ?? 'undefined'}:${index}`}>
                          <td>{index + 1}</td>
                          <td><code>{formatKey(entry.key)}</code></td>
                          <td><code>{formatRawField(entry, 'value')}</code></td>
                          <td><code>{formatRawField(entry, 'valueStr')}</code></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="skill-json-json-grid">
              <details className="raw-json" open>
                <summary>選択レベルの JSON</summary>
                <pre>{JSON.stringify(inspection.level, null, 2)}</pre>
              </details>
              <details className="raw-json">
                <summary>保持している全レベルの JSON（{selectedSkill.skillLevels.length} levels）</summary>
                <pre>{JSON.stringify(selectedSkill.skillLevels, null, 2)}</pre>
              </details>
            </div>
          </section>

          <section className="skill-json-section skill-json-interpretation-section" aria-labelledby="skill-json-interpretation-heading">
            <SectionHeading
              id="skill-json-interpretation-heading"
              kicker="INTERPRETATION"
              title="照合・表示上の解釈"
              description="description の参照関係とレベル差分だけを算出"
            />

            <div className="skill-json-interpretation-notice" role="note">
              <strong>キー名からゲーム内の意味を断定しません。</strong>
              <span>description 本文の自然言語は自動でblackboard化せず、人が検証する情報として保持します。</span>
              <span><code>times</code> を含む全キーは未解釈のままです。<code>times</code> を連撃回数（hitCount）へ自動変換しません。</span>
            </div>

            <div className="skill-json-block">
              <h3>blackboard を展開した description</h3>
              <pre className="skill-json-description expanded">{inspection.expandedDescription || '（description なし）'}</pre>
            </div>

            <div className="skill-json-block">
              <div className="skill-json-block-heading">
                <h3>description プレースホルダー対応</h3>
                <span>
                  {inspection.placeholders.filter((item) => item.status === 'MATCHED').length}
                  {' / '}{inspection.placeholders.length} 対応
                </span>
              </div>
              {inspection.placeholders.length === 0 ? (
                <p className="skill-json-empty-row">description にプレースホルダーはありません。</p>
              ) : (
                <div
                  className="table-wrap skill-json-table-wrap"
                  role="region"
                  aria-label="descriptionプレースホルダー対応表。横方向にスクロールできます"
                  tabIndex={0}
                >
                  <table className="skill-json-placeholder-table">
                    <caption className="visually-hidden">descriptionプレースホルダーとblackboardの対応</caption>
                    <thead>
                      <tr>
                        <th>#</th><th>placeholder</th><th>照合key</th><th>blackboard</th><th>format</th><th>符号</th><th>展開値</th><th>対応</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inspection.placeholders.map((placeholder) => (
                        <tr key={`${placeholder.occurrence}:${placeholder.placeholder}`}>
                          <td>{placeholder.occurrence}</td>
                          <td><code>{placeholder.placeholder}</code></td>
                          <td><code>{placeholder.lookupKey}</code></td>
                          <td>{placeholder.blackboardIndex === null ? '—' : `#${placeholder.blackboardIndex + 1}`}</td>
                          <td><code>{placeholder.format ?? '—'}</code></td>
                          <td>{placeholder.negative ? '負号あり' : 'そのまま'}</td>
                          <td><code>{placeholder.expandedValue ?? '—'}</code></td>
                          <td>
                            <span className={`skill-json-status ${placeholder.status.toLowerCase()}`}>
                              {placeholder.status === 'UNMATCHED'
                                ? '未対応'
                                : placeholder.expandedValue === null
                                  ? '対応（表示値なし）'
                                  : '対応'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="skill-json-block">
              <div className="skill-json-block-heading">
                <h3>blackboard から見た参照状況</h3>
                <span>{unreferencedBlackboardCount} / {inspection.blackboardRows.length} description参照なし · 意味解釈なし</span>
              </div>
              {inspection.blackboardRows.length === 0 ? (
                <p className="skill-json-empty-row">照合対象のblackboard項目はありません。</p>
              ) : (
                <div
                  className="table-wrap skill-json-table-wrap"
                  role="region"
                  aria-label="blackboard参照状況表。横方向にスクロールできます"
                  tabIndex={0}
                >
                  <table className="skill-json-reference-table">
                    <caption className="visually-hidden">blackboard項目ごとのdescription参照状況</caption>
                    <thead>
                      <tr><th>key</th><th>descriptionからの参照</th><th>意味の自動解釈</th></tr>
                    </thead>
                    <tbody>
                      {inspection.blackboardRows.map((row) => (
                        <tr key={`${row.entry.key ?? 'undefined'}:${row.index}`}>
                          <td><code>{formatKey(row.entry.key)}</code></td>
                          <td>
                            {row.referencedBy.length > 0
                              ? row.referencedBy.map((item) => item.placeholder).join(' / ')
                              : '参照なし'}
                          </td>
                          <td>
                            <span className="skill-json-status uninterpreted">
                              {row.semanticStatus === 'UNINTERPRETED' ? '未解釈' : row.semanticStatus}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="skill-json-block">
              <div className="skill-json-diff-heading">
                <div>
                  <h3>レベル間 blackboard 差分</h3>
                  <p>{changedDiffCount} 件の追加・削除・値変更</p>
                </div>
                <div className="skill-json-diff-controls">
                  <label>
                    <span>比較元</span>
                    <select value={compareIndex} onChange={(event) => setRequestedCompareIndex(Number(event.target.value))}>
                      {selectedSkill.skillLevels.map((_, index) => (
                        <option value={index} key={index}>{getSkillLevelLabel(index, selectedSkill.skillLevels.length)}</option>
                      ))}
                    </select>
                  </label>
                  <span aria-hidden="true">→</span>
                  <div>
                    <span>比較先</span>
                    <strong>{inspection.levelLabel}</strong>
                  </div>
                </div>
              </div>

              {diffRows.length === 0 ? (
                <p className="skill-json-empty-row">比較するblackboard項目はありません。</p>
              ) : (
                <div
                  className="table-wrap skill-json-table-wrap"
                  role="region"
                  aria-label="レベル間blackboard差分表。横方向にスクロールできます"
                  tabIndex={0}
                >
                  <table className="skill-json-diff-table">
                    <caption className="visually-hidden">レベル間のblackboard差分</caption>
                    <thead>
                      <tr>
                        <th>状態</th><th>key</th><th>比較元 value</th><th>比較元 valueStr</th><th>比較先 value</th><th>比較先 valueStr</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diffRows.map((row) => (
                        <tr className={`diff-${row.kind.toLowerCase()}`} key={row.id}>
                          <td><span className={`skill-json-status ${row.kind.toLowerCase()}`}>{DIFF_LABELS[row.kind]}</span></td>
                          <td>
                            <code>{formatKey(row.key)}</code>
                            {row.occurrence > 1 && <small>#{row.occurrence}</small>}
                          </td>
                          <td className={row.changedFields.includes('value') ? 'changed-cell' : undefined}>
                            <code>{formatDiffField(row.before, 'value')}</code>
                          </td>
                          <td className={row.changedFields.includes('valueStr') ? 'changed-cell' : undefined}>
                            <code>{formatDiffField(row.before, 'valueStr')}</code>
                          </td>
                          <td className={row.changedFields.includes('value') ? 'changed-cell' : undefined}>
                            <code>{formatDiffField(row.after, 'value')}</code>
                          </td>
                          <td className={row.changedFields.includes('valueStr') ? 'changed-cell' : undefined}>
                            <code>{formatDiffField(row.after, 'valueStr')}</code>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
      </div>
    </section>
  )
}

function SectionHeading({
  id,
  kicker,
  title,
  description,
}: {
  id: string
  kicker: string
  title: string
  description: string
}) {
  return (
    <header className="skill-json-section-heading">
      <div>
        <span>{kicker}</span>
        <h2 id={id}>{title}</h2>
      </div>
      <p>{description}</p>
    </header>
  )
}

function SkillJsonPageState({ title, description }: { title: string, description?: string }) {
  return (
    <section className="operator-empty-state skill-json-page-state" role="status">
      <span className="page-kicker">SKILL TABLE INSPECTOR</span>
      <strong>{title}</strong>
      {description && <span>{description}</span>}
    </section>
  )
}

function asBlackboardEntries(value: unknown): RawBlackboardEntry[] {
  return Array.isArray(value) ? value as RawBlackboardEntry[] : []
}

function formatKey(value: string | null | undefined): string {
  if (value === undefined) return 'undefined'
  if (value === null) return 'null'
  return value || '""'
}

function formatRawField(entry: RawBlackboardEntry, field: 'value' | 'valueStr'): string {
  if (!Object.hasOwn(entry, field)) return 'undefined'
  const value = entry[field]
  if (value === null) return 'null'
  return typeof value === 'string' ? JSON.stringify(value) : String(value)
}

function formatDiffField(entry: RawBlackboardEntry | null, field: 'value' | 'valueStr'): string {
  return entry ? formatRawField(entry, field) : '—'
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
