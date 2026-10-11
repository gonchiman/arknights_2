import { useEffect, useMemo, useRef, useState } from 'react'
import { buildSkillEffectBreakdown, type SkillEffectBreakdownRow } from '../lib/skillEffectBreakdown'
import {
  findSkillEffectCorrection, getSkillEffectDisplayFields, loadSkillEffectCorrections,
  saveSkillEffectCorrections, updateSkillEffectCorrections, validateSkillEffectDisplayFields,
  type SkillEffectCorrection, type SkillEffectCorrectionContext, type SkillEffectDisplayFields,
} from '../lib/skillEffectCorrections'
import { createSkillSummaryHash, type SkillRouteSelection } from '../lib/routes'
import type { SkillRecord } from '../types/skill'
import { SkillDescriptionSelectionPage } from './SkillDescriptionSelectionPage'
import './SkillSummaryPage.css'

interface Props {
  rows: SkillRecord[]
  loading: boolean
  initialSelection?: SkillRouteSelection
}

export function SkillSummaryPage({ rows, loading, initialSelection }: Props) {
  const [corrections, setCorrections] = useState(() => loadSkillEffectCorrections())
  useEffect(() => {
    const reload = () => setCorrections(loadSkillEffectCorrections())
    window.addEventListener('storage', reload)
    return () => window.removeEventListener('storage', reload)
  }, [])

  const saveCorrection = (context: SkillEffectCorrectionContext, row: SkillEffectBreakdownRow,
    fields: SkillEffectDisplayFields | null): string | null => {
    // Preserve another tab's edits, and never overwrite unreadable saved data implicitly.
    const latest = loadSkillEffectCorrections()
    if (latest.error) return latest.error
    let entries: SkillEffectCorrection[]
    try {
      entries = updateSkillEffectCorrections(latest.entries, context, row, fields)
    } catch (error) {
      return error instanceof Error ? error.message : '修正内容を確認してください。'
    }
    const saved = saveSkillEffectCorrections(entries)
    if (!saved.ok) return saved.error
    setCorrections({ entries, error: null })
    return null
  }

  return (
    <SkillDescriptionSelectionPage
      rows={rows} loading={loading} initialSelection={initialSelection}
      createHash={createSkillSummaryHash} title="スキル効果の分解" kicker="SKILL EFFECTS"
      renderSelection={({ skill, levelIndex, levelLabel }) => (
        <SkillEffectBreakdownContent key={`${skill.operatorId}:${skill.skillId}:${levelIndex}`}
          skill={skill} levelIndex={levelIndex} levelLabel={levelLabel}
          corrections={corrections.entries} storageError={corrections.error} onSave={saveCorrection} />
      )}
    />
  )
}

interface ContentProps {
  skill: SkillRecord
  levelIndex: number
  levelLabel: string
  corrections: SkillEffectCorrection[]
  storageError: string | null
  onSave: (context: SkillEffectCorrectionContext, row: SkillEffectBreakdownRow,
    fields: SkillEffectDisplayFields | null) => string | null
}

function SkillEffectBreakdownContent({ skill, levelIndex, levelLabel, corrections, storageError, onSave }: ContentProps) {
  const sourceDescription = skill.raw.description ?? skill.description
  const result = useMemo(() => buildSkillEffectBreakdown(sourceDescription, skill.raw.blackboard ?? []),
    [sourceDescription, skill.raw.blackboard])
  const context = useMemo(() => ({ operatorId: skill.operatorId, skillId: skill.skillId,
    levelIndex, sourceDescription, description: result.description }),
  [skill.operatorId, skill.skillId, levelIndex, sourceDescription, result.description])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const detailRef = useRef<HTMLElement>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const selected = result.rows.find(row => row.id === selectedId) ?? null
  const displayedRows = useMemo(() => result.rows.map(row => {
    const correction = findSkillEffectCorrection(corrections, context, row)
    return { row, fields: correction?.fields ?? getSkillEffectDisplayFields(row), correction }
  }), [result.rows, corrections, context])
  const selectedDisplay = displayedRows.find(item => item.row.id === selectedId)
  const selectRow = (row: SkillEffectBreakdownRow, trigger: HTMLButtonElement | null) => {
    triggerRef.current = trigger
    setNotice('')
    setSelectedId(row.id)
    window.requestAnimationFrame(() => detailRef.current?.focus({ preventScroll: true }))
  }
  const closeDetail = () => {
    setSelectedId(null)
    triggerRef.current?.focus({ preventScroll: true })
  }
  const json = useMemo(() => JSON.stringify({ schemaVersion: 1, operatorId: skill.operatorId,
    skillId: skill.skillId, levelIndex, levelLabel, sourceDescription, ...result,
    displayCorrections: displayedRows.flatMap(item => item.correction ? [{
      rowId: item.row.id, fields: item.correction.fields,
    }] : []),
  }, null, 2), [skill.operatorId, skill.skillId, levelIndex, levelLabel, sourceDescription, result, displayedRows])

  return (
    <section className="skill-summary-content" aria-label="選択したスキルの効果の分解">
      {storageError && <p className="skill-summary-message" role="alert">{storageError}</p>}
      <section className="skill-summary-panel" aria-labelledby="skill-summary-source-title">
        <header><h2 id="skill-summary-source-title">原文</h2></header>
        <div className="skill-summary-panel-body">
          <p className="skill-summary-source"><HighlightedSource description={result.description} selected={selected} /></p>
        </div>
      </section>
      <section className="skill-summary-panel" aria-labelledby="skill-summary-effects-title">
        <header><h2 id="skill-summary-effects-title">効果一覧</h2><span>{result.rows.length}項目</span></header>
        <div className="skill-summary-table-wrap" tabIndex={0} role="region" aria-label="スキル効果の一覧">
          <table className="skill-summary-table">
            <caption className="visually-hidden">{skill.operatorName} S{skill.skillIndex} {levelLabel}の効果一覧</caption>
            <colgroup><col className="skill-summary-timing-col" /><col className="skill-summary-condition-col" />
              <col className="skill-summary-target-col" /><col className="skill-summary-effect-col" />
              <col className="skill-summary-value-col" /></colgroup>
            <thead><tr><th scope="col">タイミング</th><th scope="col">条件</th><th scope="col">対象</th>
              <th scope="col">効果</th><th scope="col">値</th></tr></thead>
            <tbody>{displayedRows.map(({ row, fields, correction }) => (
              <tr key={row.id} className={selectedId === row.id ? 'skill-summary-selected-row' : ''}
                onClick={event => selectRow(row, event.currentTarget.querySelector('button'))}>
                <td>{fields.timing}</td><td>{fields.condition}</td><td>{fields.target}</td>
                <th scope="row"><button className="skill-summary-effect-button" type="button"
                  aria-label={`${fields.label}の分解内容`} aria-expanded={selectedId === row.id}>
                  {fields.label}</button>
                  {row.status !== 'parsed' && <span className="skill-summary-row-status">
                    {row.status === 'unparsed' ? '未解析' : '一部未解析'}</span>}
                  {correction && <span className="skill-summary-row-status">修正あり</span>}
                </th><td className="skill-summary-effect-value">{fields.valueText}</td>
              </tr>
            ))}
              {!result.rows.length && <tr><td colSpan={5}>説明文がありません。</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      {notice && <p className="skill-summary-message" role="status">{notice}</p>}
      {selected && selectedDisplay && <section className="skill-summary-panel skill-summary-detail"
        ref={detailRef} tabIndex={-1} aria-label="選択した効果の分解内容">
        <SkillEffectDetail key={selected.id} row={selected} fields={selectedDisplay.fields}
          corrected={!!selectedDisplay.correction} onClose={closeDetail}
          onSave={fields => {
            const error = onSave(context, selected, fields)
            if (!error) setNotice(fields ? '修正を保存しました' : '自動解析の表示に戻しました')
            return error
          }} />
      </section>}
      <details className="skill-summary-data"><summary>構造化データ</summary><pre>{json}</pre></details>
      <details className="skill-summary-help"><summary>分解・修正について</summary>
        <p>効果の行を選ぶと、対応する原文と分解内容を確認できます。解析できなかった記述も一覧に残します。</p>
        <p>修正はこのブラウザに保存します。同じスキル・レベル・原文・解析結果の組み合わせに適用します。</p>
        <p>修正は表示項目に反映します。構造化データの抽出値・単位・キーは元の解析結果を保持し、修正内容を別に記録します。</p>
      </details>
    </section>
  )
}

const DETAIL_FIELDS = [
  ['timing', 'タイミング'], ['condition', '条件'], ['target', '対象'],
  ['label', '効果'], ['operation', '演算'], ['valueText', '値'],
] as const

function SkillEffectDetail({ row, fields, corrected, onClose, onSave }: {
  row: SkillEffectBreakdownRow
  fields: SkillEffectDisplayFields
  corrected: boolean
  onClose: () => void
  onSave: (fields: SkillEffectDisplayFields | null) => string | null
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(fields)
  const [error, setError] = useState<string | null>(null)
  const beginEditing = () => { setDraft(fields); setEditing(true); setError(null) }
  return (
    <form onSubmit={event => {
      event.preventDefault()
      const saveError = validateSkillEffectDisplayFields(draft) ?? onSave(draft)
      setError(saveError)
      if (!saveError) setEditing(false)
    }}>
      <header><h2>{fields.label}の分解内容</h2><div className="skill-summary-detail-actions">
        <button type="button" onClick={() => editing ? (setEditing(false), setError(null)) : beginEditing()}>
          {editing ? 'キャンセル' : '修正'}</button>
        <button type="button" onClick={onClose}>閉じる</button>
      </div></header>
      <div className="skill-summary-panel-body">
        <div className="skill-summary-evidence"><span>対応する原文</span><p>{row.sourceText}</p></div>
        <div className="skill-summary-detail-fields">
          {DETAIL_FIELDS.map(([key, label]) => <div className="skill-summary-detail-field" key={key}>
            {editing ? <label><span>{label}</span><input value={draft[key]} maxLength={2000}
              onChange={event => { setDraft(current => ({ ...current, [key]: event.target.value })); setError(null) }} /></label>
              : <><span>{label}</span><p>{fields[key]}</p></>}
          </div>)}
        </div>
        {error && <p className="skill-summary-error" role="alert">{error}</p>}
        {(editing || corrected) && <div className="skill-summary-form-actions">
          {corrected && <button type="button" onClick={() => {
            const resetError = onSave(null)
            setError(resetError)
            if (!resetError) setEditing(false)
          }}>自動解析に戻す</button>}
          {editing && <button type="submit" className="button">一覧に反映</button>}
        </div>}
      </div>
    </form>
  )
}

function HighlightedSource({ description, selected }: { description: string; selected: SkillEffectBreakdownRow | null }) {
  if (!description) return <>説明文がありません。</>
  if (!selected || description.slice(selected.sourceStart, selected.sourceEnd) !== selected.sourceText) return <>{description}</>
  return <>{description.slice(0, selected.sourceStart)}<mark>{selected.sourceText}</mark>{description.slice(selected.sourceEnd)}</>
}
