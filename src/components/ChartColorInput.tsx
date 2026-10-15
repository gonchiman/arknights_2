import { useState } from 'react'
import './ChartColorInput.css'

function normalizeColor(value: string): string | null {
  const match = value.match(/^#?([0-9a-fA-F]{6})$/)
  return match ? `#${match[1].toLowerCase()}` : null
}

export function ChartColorInput({ value, onChange, label, disabled = false }: {
  value: string
  onChange: (color: string) => void
  label: string
  disabled?: boolean
}) {
  const color = normalizeColor(value) ?? '#000000'
  const [draft, setDraft] = useState({ color, text: color })
  const text = draft.color === color ? draft.text : color

  return <div className="chart-color-input">
    <input className="chart-color-input-picker" type="color" aria-label={label} value={color} disabled={disabled}
      onChange={event => {
        const next = normalizeColor(event.target.value)
        if (!next) return
        setDraft({ color: next, text: next })
        onChange(next)
      }} />
    <input className="chart-color-input-code" type="text" aria-label={`${label}コード`} value={text} disabled={disabled}
      spellCheck={false} autoCapitalize="off" autoComplete="off" maxLength={7} aria-invalid={normalizeColor(text) === null}
      onChange={event => {
        const nextText = event.target.value
        const nextColor = normalizeColor(nextText)
        setDraft({ color: nextColor ?? color, text: nextText })
        if (nextColor) onChange(nextColor)
      }} onBlur={() => setDraft({ color, text: color })} />
  </div>
}
