import { useId, useLayoutEffect, useRef, useState, type FocusEvent } from 'react'
import type { EnemyRatingComparisonSideValue } from '../lib/enemyRatingComparison'
import {
  createChartVideoTimingDraft, ENEMY_RATING_VIDEO_DEFINITION, ENEMY_RATING_VIDEO_PHASE_TEMPOS,
  ENEMY_RATING_VIDEO_TEMPOS, ENEMY_RATING_VIDEO_TEMPO_SECONDS, getChartVideoDefaultDuration, parseChartVideoTiming,
  type ChartVideoTimingDefinition, type ChartVideoTimingDraft, type ChartVideoTimingField, type ParsedChartVideoTiming,
  type EnemyRatingVideoBarMode, type EnemyRatingVideoGuideMode, type EnemyRatingVideoPhase, type EnemyRatingVideoPhaseTempo,
  type EnemyRatingVideoTextMode,
} from '../lib/enemyRatingVideoTiming'
import './EnemyRatingVideoTimingEditor.css'

type DurationField<Phase extends string> = ChartVideoTimingField<Phase> | 'finish'
export interface ChartVideoDurationError<Phase extends string> { field: DurationField<Phase>; message: string }
export type EnemyRatingVideoDurationError = ChartVideoDurationError<EnemyRatingVideoPhase>

interface ChartVideoTimingEditorProps<Phase extends string> {
  draft: ChartVideoTimingDraft<Phase>
  onChange: (draft: ChartVideoTimingDraft<Phase>) => void
  parsed: ParsedChartVideoTiming<Phase>
  inputError: ChartVideoDurationError<Phase> | null
  onInputError: (error: ChartVideoDurationError<Phase> | null) => void
  activePhase: Phase | null
  definition: ChartVideoTimingDefinition<Phase>
  phaseLabels: Readonly<Record<Phase, string>>
  guideLabel: string
  dataEffect: 'bars' | 'points'
  disabled: boolean
}

const phaseTempoNumberLabels = ['最短', '短め', '標準', '長め', '最長'] as const

export function EnemyRatingVideoTimingEditor({ sideValue, ...props }: Omit<ChartVideoTimingEditorProps<EnemyRatingVideoPhase>,
  'definition' | 'phaseLabels' | 'guideLabel' | 'dataEffect'> & { sideValue?: EnemyRatingComparisonSideValue }) {
  return <ChartVideoTimingEditor {...props} definition={ENEMY_RATING_VIDEO_DEFINITION}
    phaseLabels={{
      title: 'タイトル・条件',
      axes: '軸・目盛り',
      ranks: '階級名',
      bars: '左右の棒',
      values: sideValue === 'rank' ? '階級割合' : '累積割合',
    }}
    guideLabel="縦線の出し方" dataEffect="bars" />
}

export function ChartVideoTimingEditor<Phase extends string>({
  draft, onChange, parsed, inputError, onInputError, activePhase, definition, phaseLabels, guideLabel, dataEffect, disabled,
}: ChartVideoTimingEditorProps<Phase>) {
  const headingId = useId()
  const errorId = useId()
  const tempoMarksId = useId()
  const focusAfterMove = useRef<HTMLButtonElement | null>(null)
  const [status, setStatus] = useState('')
  const [editing, setEditing] = useState<{ field: DurationField<Phase>; value: string } | null>(null)
  const tempoIndex = ENEMY_RATING_VIDEO_TEMPOS.indexOf(draft.tempo)
  const lastTempoIndex = ENEMY_RATING_VIDEO_TEMPOS.length - 1
  const standardTempoPosition = ENEMY_RATING_VIDEO_TEMPOS.indexOf('standard') / lastTempoIndex * 100
  const customFinish = Boolean(draft.finishSeconds)
  const tempoValue = customFinish ? `${draft.finishSeconds}秒（秒数指定）`
    : `${ENEMY_RATING_VIDEO_TEMPO_SECONDS[draft.tempo]}秒${draft.tempo === 'standard' ? '（標準）' : ''}`

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
    setStatus(phaseLabels[phase] + 'を' + (destination + 1) + '番目に移動')
    onChange({ ...draft, order })
  }

  function commitDuration(event: FocusEvent<HTMLInputElement>, field: DurationField<Phase>) {
    const { value, validity } = event.currentTarget
    if (disabled || editing?.field !== field) return
    const next = field === 'finish' ? { ...draft, finishSeconds: value }
      : { ...draft, overrides: { ...draft.overrides, [field]: value || undefined } }
    const error = validity.badInput
      ? field === 'finish' ? '描画完了までの時間は0秒より長くしてください。' : '0以上の秒数を入力してください。'
      : parseChartVideoTiming(next, definition).error
    if (error) onInputError({ field, message: error })
    else {
      setEditing(null)
      onInputError(null)
      onChange(next)
    }
  }

  function durationInput(field: DurationField<Phase>, value: string) {
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

  function selectTempo(index: number) {
    const tempo = ENEMY_RATING_VIDEO_TEMPOS[index]
    if (tempo === undefined) return
    setEditing(null)
    onInputError(null)
    onChange({ ...draft, tempo, finishSeconds: '' })
  }

  function selectPhaseTempo(phase: Phase, tempo: EnemyRatingVideoPhaseTempo) {
    if (editing?.field === phase) setEditing(null)
    if (inputError?.field === phase) onInputError(null)
    const overrides = { ...draft.overrides }
    delete overrides[phase]
    onChange({ ...draft, overrides, phaseTempos: { ...draft.phaseTempos, [phase]: tempo } })
  }

  const durationError = inputError && <p id={errorId} className="chart-image-save-error" role="alert">{inputError.message}</p>

  return <section className="enemy-rating-video-timing" aria-labelledby={headingId}>
    <div className="enemy-rating-video-timing-heading">
      <h3 id={headingId}>表示順・テンポ</h3>
      <button type="button" className="filter-reset-button" disabled={disabled} onClick={() => {
        setEditing(null)
        onInputError(null)
        setStatus('既定値に戻しました')
        onChange(createChartVideoTimingDraft(definition))
      }}>既定値に戻す</button>
    </div>
    <ol className="enemy-rating-video-order" role="list" aria-labelledby={headingId}>
      {draft.order.map((phase, index) => {
        const duration = parsed.timing?.[phase].duration
        const exact = Boolean(draft.overrides[phase]?.trim())
        return <li key={phase} aria-current={phase === activePhase ? 'step' : undefined}>
          <span aria-hidden="true">{index + 1}</span>
          <span>{phaseLabels[phase]}</span>
          <span className="enemy-rating-video-phase-seconds">
            {duration === undefined ? '—' : `${Number(duration.toFixed(2))}秒${exact ? '指定' : ''}`}
          </span>
          <div className="enemy-rating-video-phase-tempo" role="group" aria-label={phaseLabels[phase] + 'のテンポ'}>
            <span aria-hidden="true">短い</span>
            {ENEMY_RATING_VIDEO_PHASE_TEMPOS.map((tempo, tempoIndex) =>
              <button key={tempo} type="button" className="button secondary" disabled={disabled}
                aria-label={`${tempo}（${phaseTempoNumberLabels[tempoIndex]}）`}
                aria-pressed={!exact && (draft.phaseTempos?.[phase] ?? 3) === tempo}
                onClick={() => selectPhaseTempo(phase, tempo)}>
                {tempo}
              </button>)}
            <span aria-hidden="true">長い</span>
          </div>
          <div className="enemy-rating-video-order-actions">
            <button type="button" className="button secondary" aria-label={phaseLabels[phase] + 'を上へ'}
              disabled={disabled || index === 0} onClick={event => movePhase(index, -1, event.currentTarget)}>↑</button>
            <button type="button" className="button secondary" aria-label={phaseLabels[phase] + 'を下へ'}
              disabled={disabled || index === draft.order.length - 1} onClick={event => movePhase(index, 1, event.currentTarget)}>↓</button>
          </div>
        </li>
      })}
    </ol>
    <div className="enemy-rating-video-timing-options">
      <div className="enemy-rating-video-duration-options">
        <label className="enemy-rating-video-tempo">
          <span>テンポ</span>
          <span className="enemy-rating-video-tempo-track">
            <input type="range" min={0} max={lastTempoIndex} step={1} value={tempoIndex} list={tempoMarksId}
              aria-label="テンポ" aria-valuetext={tempoValue} disabled={disabled} data-custom={customFinish || undefined}
              onChange={event => selectTempo(event.currentTarget.valueAsNumber)}
              onClick={event => {
                if (customFinish) selectTempo(event.currentTarget.valueAsNumber)
              }} />
            <span className="enemy-rating-video-tempo-ticks" aria-hidden="true">
              <span>{ENEMY_RATING_VIDEO_TEMPO_SECONDS[ENEMY_RATING_VIDEO_TEMPOS[0]]}秒</span>
              <span className="enemy-rating-video-tempo-standard" style={{ left: `${standardTempoPosition}%` }}>
                {ENEMY_RATING_VIDEO_TEMPO_SECONDS.standard}秒
              </span>
              <span>{ENEMY_RATING_VIDEO_TEMPO_SECONDS[ENEMY_RATING_VIDEO_TEMPOS[lastTempoIndex]]}秒</span>
            </span>
          </span>
        </label>
        <datalist id={tempoMarksId}>
          {ENEMY_RATING_VIDEO_TEMPOS.map((tempo, index) => <option key={tempo} value={index} />)}
        </datalist>
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
          {dataEffect === 'bars' ? '棒の出し方' : '点の出し方'}
          <select value={draft.barMode} disabled={disabled} onChange={event =>
            onChange({ ...draft, barMode: event.target.value as EnemyRatingVideoBarMode })}>
            <option value="grow">{dataEffect === 'bars' ? '伸びる' : '一斉に表示'}</option>
            <option value="stagger">順に表示</option>
            {dataEffect === 'bars' && <option value="staggerGrow">順に伸びる</option>}
          </select>
        </label>
        <label>
          {guideLabel}
          <select value={draft.guideMode} disabled={disabled} onChange={event =>
            onChange({ ...draft, guideMode: event.target.value as EnemyRatingVideoGuideMode })}>
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
        {draft.order.map(field => {
          const duration = parsed.timing?.[field].duration ?? getChartVideoDefaultDuration(field, draft.tempo, definition)
          const value = draft.overrides[field] ?? formatSeconds(duration)
          return <label key={field}>
            <span>{phaseLabels[field]}（秒）</span>
            {durationInput(field, value)}
          </label>
        })}
        <label>
          <span>完成図の保持（秒）</span>
          {durationInput('hold', draft.overrides.hold ?? formatSeconds(parsed.timing?.hold ?? 0))}
        </label>
      </div>
      {inputError?.field !== 'finish' && durationError}
    </details>
    <span className="visually-hidden" aria-live="polite">{status}</span>
  </section>
}
