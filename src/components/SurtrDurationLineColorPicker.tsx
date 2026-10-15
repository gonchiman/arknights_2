import type { CSSProperties } from 'react'
import { SURTR_DURATION_LINE_COLORS } from '../lib/surtrDurationLineColors'
import { ChartColorInput } from './ChartColorInput'
import { HelpPopover } from './HelpPopover'
import './SurtrDurationLineColorPicker.css'

export function SurtrDurationLineColorPicker({ label, color, defaultColor, onChange }: {
  label: string
  color: string
  defaultColor: string
  onChange: (color: string) => void
}) {
  const title = `${label}の線の色`
  return <span className="surtr-duration-line-color-picker" style={{ '--surtr-duration-line-color': color } as CSSProperties}>
    <HelpPopover label={`${title}を変更`} triggerText="" mode="dialog" title={title}>
      <div className="surtr-duration-line-color-options">
        <div className="surtr-duration-line-color-palette" role="group" aria-label="色の候補">
          {SURTR_DURATION_LINE_COLORS.map(option => <button type="button" key={option} aria-label={`色 ${option}`}
            aria-pressed={color === option} title={option} onClick={() => onChange(option)}>
            <span style={{ backgroundColor: option }} />
          </button>)}
        </div>
        <ChartColorInput value={color} onChange={onChange} label={title} />
        <button type="button" className="surtr-duration-line-color-reset" disabled={color === defaultColor}
          onClick={() => onChange(defaultColor)}>初期色に戻す</button>
      </div>
    </HelpPopover>
  </span>
}
