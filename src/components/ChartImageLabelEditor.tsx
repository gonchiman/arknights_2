import { useId } from 'react'
import {
  CHART_IMAGE_LABEL_MAX_LENGTH,
  type ChartImageLabelDefaults, type ChartImageLabelOverrides,
} from '../lib/chartImageLabels'
import './ChartImageLabelEditor.css'

export function ChartImageLabelEditor({ defaults, value, onChange, disabled = false }: {
  defaults: ChartImageLabelDefaults
  value: ChartImageLabelOverrides
  onChange: (value: ChartImageLabelOverrides) => void
  disabled?: boolean
}) {
  const id = useId()
  return <details className="chart-image-label-editor">
    <summary>タイトル・ラベル</summary>
    <fieldset className="chart-image-label-fields" disabled={disabled}>
      {([
        ['title', 'タイトル'], ['xAxis', '横軸名'], ['yAxis', '縦軸名'],
      ] as const).map(([key, label]) => <label key={key} className={`chart-image-save-field${key === 'title' ? ' chart-image-label-title' : ''}`}
        htmlFor={`${id}-${key}`}>
        <span>{label}</span>
        <input id={`${id}-${key}`} type="text" value={value[key] ?? defaults[key]}
          maxLength={CHART_IMAGE_LABEL_MAX_LENGTH} autoComplete="off"
          onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) event.preventDefault() }}
          onChange={event => onChange({ ...value, [key]: event.target.value })} />
      </label>)}
      <div className="chart-image-label-series">
        {defaults.series.map((series, index) => <label key={series.id} className="chart-image-save-field"
          htmlFor={`${id}-series-${index}`}>
          <span>凡例：{series.label}</span>
          <input id={`${id}-series-${index}`} type="text" value={value.series?.[series.id] ?? series.label}
            maxLength={CHART_IMAGE_LABEL_MAX_LENGTH} autoComplete="off"
            onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) event.preventDefault() }}
            onChange={event => onChange({ ...value, series: { ...value.series, [series.id]: event.target.value } })} />
        </label>)}
      </div>
    </fieldset>
  </details>
}
