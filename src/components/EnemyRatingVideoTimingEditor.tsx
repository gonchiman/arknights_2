import { useId, useLayoutEffect, useRef, useState, type FocusEvent } from 'react'
import type { EnemyRatingComparisonSideValue } from '../lib/enemyRatingComparison'
import {
  createEnemyRatingVideoTimingDraft, ENEMY_RATING_VIDEO_TEMPOS, getEnemyRatingVideoDefaultDuration, parseEnemyRatingVideoTiming,
  type EnemyRatingVideoPhase, type EnemyRatingVideoShapeMode, type EnemyRatingVideoTempo, type EnemyRatingVideoTextMode,
  type EnemyRatingVideoTimingDraft, type EnemyRatingVideoTimingField, type ParsedEnemyRatingVideoTiming,
} from '../lib/enemyRatingVideoTiming'
import './EnemyRatingVideoTimingEditor.css'

interface EnemyRatingVideoTimingEditorProps {
  draft: EnemyRatingVideoTimingDraft
  onChange: (draft: EnemyRatingVideoTimingDraft) => void
  parsed: ParsedEnemyRatingVideoTiming
  inputError: EnemyRatingVideoDurationError | null
  onInputError: (error: EnemyRatingVideoDurationError | null) => void
  activePhase: EnemyRatingVideoPhase | null
  sideValue?: EnemyRatingComparisonSideValue
  disabled: boolean
}

const tempoLabels: Record<EnemyRatingVideoTempo, string> = { short: '短め', standard: '標準', slow: 'ゆっくり' }
type DurationField = EnemyRatingVideoTimingField | 'finish'
export interface EnemyRatingVideoDurationError { field: DurationField; message: string }

export function EnemyRatingVideoTimingEditor({
  draft, onChange, parsed, inputError, onInputError, activePhase, sideValue, disabled,
}: EnemyRatingVideoTimingEditorProps) {
  const headingId = useId()
  const errorId = useId()
  const focusAfterMove = useRef<HTMLButtonElement | null>(null)
  const [status, setStatus] = useState('')
  const [editing, setEditing] = useState<{ field: DurationField; value: string } | null>(null)

  const labels = {
    title: 'タイトル・条件',
    axes: '軸・目盛り',
    ranks: '階級名',
    bars: '左右の棒',
    values: sideValue === 'rank' ? '階級割合' : '累積割合',
    hold: '完成図の保持',
  }

  useLayoutEffect(() => {
    const button = focusAfterMove.current
    focusAfterMove.current = null
    if (!button) return
    const target = button.disabled ? button.parentElement?.querySelector<HTMLButtonElement>('button:not(:disabled)') : button
    target?.focus({ preventScroll: true })
  }, [draft.order])

  function movePhase(index: number, direction: -1 | 1, button: HTMLButtonElement) {
    const order = [...draft.order]
    const destination = index + direction
    const phase = order[index]
    order[index] = order[destination]
    order[destination] = phase
    if (document.activeElement === button) focusAfterMove.current = button
    setStatus(labels[phase] + 'を' + (destination + 1) + '番目に移動')
    onChange({ ...draft, order })
  }

  function commitDuration(event: FocusEvent<HTMLInputElement>, field: DurationField) {
    const { value, validity } = event.currentTarget
    if (disabled || editing?.field !== field) return
    const next = field === 'finish' ? { ...draft, finishSeconds: value }
      : { ...draft, overrides: { ...draft.overrides, [field]: value || undefined } }
    const error = validity.badInput
      ? field === 'finish' ? '描画完了までの時間は0秒より長くしてください。' : '0以上の秒数を入力してください。'
      : parseEnemyRatingVideoTiming(next).error
    if (error) onInputError({ field, message: error })
    else {
      setEditing(null)
      onInputError(null)
      onChange(next)
    }
  }

  function durationInput(field: DurationField, value: string) {
    const currentError = inputError?.field === field
    return <input type="number" min={0} step="any" inputMode="decimal" disabled={disabled}
      value={editing?.field === field ? editing.value : value}
      aria-invalid={currentError || undefined} aria-describedby={currentError ? errorId : undefined}
      onChange={event => {
        onInputError(null)
        setEditing({ field, value: event.target.value })
      }} onBlur={event => commitDuration(event, field)}
      onKeyDown={event => {
        if (event.key !== 'Enter') return
        event.preventDefault()
        event.currentTarget.blur()
      }} />
  }

  function formatSeconds(seconds: number) {
    return String(Number(seconds.toPrecision(12)))
  }

  const durationError = inputError && <p id={errorId} className="chart-image-save-error" role="alert">{inputError.message}</p>

  return <section className="enemy-rating-video-timing" aria-labelledby={headingId}>
    <div className="enemy-rating-video-timing-heading">
      <h3 id={headingId}>表示順</h3>
      <button type="button" className="filter-reset-button" disabled={disabled} onClick={() => {
        setEditing(null)
        onInputError(null)
        setStatus('既定値に戻しました')
        onChange(createEnemyRatingVideoTimingDraft())
      }}>既定値に戻す</button>
    </div>
    <ol className="enemy-rating-video-order" role="list" aria-labelledby={headingId}>
      {draft.order.map((phase, index) => <li key={phase} aria-current={phase === activePhase ? 'step' : undefined}>
        <span aria-hidden="true">{index + 1}</span>
        <span>{labels[phase]}</span>
        <div className="enemy-rating-video-order-actions">
          <button type="button" className="button secondary" aria-label={labels[phase] + 'を上へ'}
            disabled={disabled || index === 0} onClick={event => movePhase(index, -1, event.currentTarget)}>↑</button>
          <button type="button" className="button secondary" aria-label={labels[phase] + 'を下へ'}
            disabled={disabled || index === draft.order.length - 1} onClick={event => movePhase(index, 1, event.currentTarget)}>↓</button>
        </div>
      </li>)}
    </ol>
    <div className="enemy-rating-video-timing-options">
      <div className="enemy-rating-video-duration-options">
        <div className="enemy-rating-video-tempo" role="group" aria-label="テンポ">
          <span>テンポ</span>
          {ENEMY_RATING_VIDEO_TEMPOS.map(tempo => <button key={tempo} type="button" className="button secondary"
            aria-pressed={!draft.finishSeconds && draft.tempo === tempo} disabled={disabled} onClick={() => {
              setEditing(null)
              onInputError(null)
              onChange({ ...draft, tempo, finishSeconds: '' })
            }}>{tempoLabels[tempo]}</button>)}
        </div>
        <label className="enemy-rating-video-finish">
          <span>描画完了まで（秒）</span>
          {durationInput('finish', draft.finishSeconds || (parsed.finish === null ? '' : formatSeconds(parsed.finish)))}
        </label>
      </div>
      <div className="enemy-rating-video-effect-options">
        <label>
          文字の出し方
          <select value={draft.textMode} disabled={disabled} onChange={event =>
            onChange({ ...draft, textMode: event.target.value as EnemyRatingVideoTextMode })}>
            <option value="fade">フェード</option>
            <option value="instant">一斉に表示</option>
            <option value="stagger">順に表示</option>
          </select>
        </label>
        <label>
          棒・縦線の出し方
          <select value={draft.shapeMode} disabled={disabled} onChange={event =>
            onChange({ ...draft, shapeMode: event.target.value as EnemyRatingVideoShapeMode })}>
            <option value="grow">伸びる</option>
            <option value="stagger">順に表示</option>
          </select>
        </label>
      </div>
    </div>
    {inputError?.field === 'finish' && durationError}
    <details className="enemy-rating-video-timing-precision" onToggle={event => {
      if (!event.currentTarget.open) {
        setEditing(current => current?.field === 'finish' ? current : null)
        if (inputError?.field !== 'finish') onInputError(null)
      }
    }}>
      <summary>秒数で調整</summary>
      <div className="enemy-rating-video-timing-fields">
        {([...draft.order, 'hold'] as const).map(field => {
          const duration = field === 'hold' ? parsed.timing?.hold : parsed.timing?.[field].duration
          const value = draft.overrides[field] ?? formatSeconds(duration ?? getEnemyRatingVideoDefaultDuration(field, draft.tempo))
          return <label key={field}>
            <span>{labels[field]}（秒）</span>
            {durationInput(field, value)}
          </label>
        })}
      </div>
      {inputError?.field !== 'finish' && durationError}
    </details>
    <span className="visually-hidden" aria-live="polite">{status}</span>
  </section>
}
