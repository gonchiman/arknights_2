import { useId, type ReactNode } from 'react'
import './ChartImageBatchOptions.css'

export function ChartImageBatchOptions({ mode, onModeChange, method, onMethodChange, directoryAvailable, saving, count, children }: {
  mode: 'current' | 'multiple'
  onModeChange: (mode: 'current' | 'multiple') => void
  method: 'file' | 'directory'
  onMethodChange: (method: 'file' | 'directory') => void
  directoryAvailable: boolean
  saving: boolean
  count: number
  children: ReactNode
}) {
  const modeId = useId()
  const methodId = useId()
  return <div className="chart-image-batch-options">
    <fieldset disabled={saving}>
      <legend>出力対象</legend>
      <div className="chart-image-batch-choice-row">
        {([{ key: 'current', label: '現在の条件' }, { key: 'multiple', label: '複数条件' }] as const).map(({ key, label }) =>
          <label key={key}><input type="radio" name={modeId} checked={mode === key}
            onChange={() => onModeChange(key)} />{label}</label>)}
      </div>
    </fieldset>
    {mode === 'multiple' && <>
      <fieldset disabled={saving}>
        <legend>保存方式</legend>
        <div className="chart-image-batch-choice-row">
          <label><input type="radio" name={methodId} checked={method === 'file'}
            onChange={() => onMethodChange('file')} />{count === 1 ? 'PNG' : 'ZIP'}</label>
          <label><input type="radio" name={methodId} checked={method === 'directory'} disabled={!directoryAvailable}
            onChange={() => onMethodChange('directory')} />PNGをフォルダへ{!directoryAvailable && '（非対応）'}</label>
        </div>
      </fieldset>
      {children}
      <div className="chart-image-batch-output-count" role="status">{count}枚{count ? method === 'directory'
        ? ' · PNG（フォルダ）' : count > 1 ? ' · ZIP' : ' · PNG' : ''}</div>
      {method === 'directory' && !directoryAvailable && <p className="chart-image-save-error" role="alert">
        このブラウザーではフォルダ保存を利用できません。
      </p>}
    </>}
  </div>
}

export function ChartImageBatchPreviewChoices({ variants, selectedKey, onSelect, saving, presentation = 'buttons' }: {
  variants: readonly { key: string; label: string }[]
  selectedKey: string
  onSelect: (key: string) => void
  saving: boolean
  presentation?: 'buttons' | 'select'
}) {
  return <fieldset className="chart-image-batch-options" disabled={saving}>
    <legend>プレビュー</legend>
    {presentation === 'select' ? <div className="chart-image-save-aspect-controls">
      <select aria-label="プレビューする出力" value={selectedKey} onChange={event => onSelect(event.target.value)}>
        {variants.map(variant => <option key={variant.key} value={variant.key}>{variant.label}</option>)}
      </select>
    </div> : <div className="chart-image-batch-preview-choices">
      {variants.map(variant => <button type="button" className="button secondary" key={variant.key}
        aria-pressed={variant.key === selectedKey} onClick={() => onSelect(variant.key)}>{variant.label}</button>)}
    </div>}
  </fieldset>
}
