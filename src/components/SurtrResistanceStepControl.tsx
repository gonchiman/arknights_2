import type { SurtrDpsBarStep } from '../lib/surtrDpsResistance'

export function getSurtrResistanceStepError(custom: boolean, draft: string): string {
  const value = Number(draft)
  return custom && (!draft.trim() || !Number.isInteger(value) || value < 1 || value > 100)
    ? '刻みは1〜100の整数で指定してください。' : ''
}

export function SurtrResistanceStepControl({ step, custom, draft, onChange, onCustomChange, onDraftChange,
  ariaLabel = '術耐性の刻み', errorId, defaultStep = 20 }: {
  step: SurtrDpsBarStep
  custom: boolean
  draft: string
  onChange: (step: SurtrDpsBarStep) => void
  onCustomChange: (custom: boolean) => void
  onDraftChange: (draft: string) => void
  ariaLabel?: string
  errorId: string
  defaultStep?: number
}) {
  const error = getSurtrResistanceStepError(custom, draft)
  const changeStep = (value: string) => {
    onCustomChange(value === 'custom')
    if (value === 'custom') {
      const next = typeof step === 'number' ? step : defaultStep
      onDraftChange(String(next))
      onChange(next)
    } else onChange(value === 'ratings' ? 'ratings' : Number(value))
  }
  const updateDraft = (value: string) => {
    onDraftChange(value)
    if (!getSurtrResistanceStepError(true, value)) onChange(Number(value))
  }
  return <div className="surtr-s3-step-control">
    <label className="surtr-s3-output-control"><span>術耐性の刻み</span>
      <select aria-label={ariaLabel} value={custom ? 'custom' : step} onChange={event => changeStep(event.target.value)}>
        <option value={10}>10</option><option value={20}>20</option><option value="ratings">ゲーム内表記</option><option value="custom">指定</option>
      </select>
    </label>
    {custom && <div className="surtr-s3-output-control">
      <input className="surtr-s3-step-input" aria-label={`${ariaLabel}を指定`} type="number" min="1" max="100" step="1"
        value={draft} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined}
        onChange={event => updateDraft(event.target.value)} />
    </div>}
  </div>
}
