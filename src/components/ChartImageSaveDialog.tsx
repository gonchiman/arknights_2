import { useId, useRef, useState } from 'react'
import { GoldenglowDetailModal } from './GoldenglowDetailModal'
import './ChartImageSaveDialog.css'

export function ChartImageSaveDialog({ initialFilename, saving, error, onClose, onSave }: {
  initialFilename: string
  saving: boolean
  error: boolean
  onClose: () => void
  onSave: (filename: string) => void
}) {
  const [filename, setFilename] = useState(initialFilename)
  const inputRef = useRef<HTMLInputElement>(null)
  const selectedInitialName = useRef(false)
  const composing = useRef(false)
  const id = useId()
  const inputId = `${id}-filename`
  const hintId = `${id}-hint`
  const validationId = `${id}-validation`
  const validationError = validateFilename(filename)

  return <GoldenglowDetailModal title="画像を保存" closeLabel="画像の保存を閉じる"
    className="chart-image-save-dialog" initialFocusRef={inputRef} closeDisabled={saving} onClose={onClose}>
    <form className="chart-image-save-form" aria-busy={saving}
      onSubmit={(event) => {
        event.preventDefault()
        if (!saving && !composing.current && !validationError) onSave(filename.trim())
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && (composing.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) {
          event.preventDefault()
        }
      }}>
      <div className="chart-image-save-field">
        <label htmlFor={inputId}>ファイル名</label>
        <input ref={inputRef} id={inputId} type="text" value={filename} disabled={saving}
          autoComplete="off" spellCheck={false} aria-required="true" aria-invalid={!!validationError}
          aria-describedby={`${hintId}${validationError ? ` ${validationId}` : ''}`}
          onChange={(event) => setFilename(event.target.value)}
          onCompositionStart={() => { composing.current = true }}
          onCompositionEnd={() => { composing.current = false }}
          onFocus={(event) => {
            if (selectedInitialName.current) return
            selectedInitialName.current = true
            const value = event.currentTarget.value
            event.currentTarget.setSelectionRange(0, /\.png$/i.test(value) ? value.length - 4 : value.length)
          }} />
        <p id={hintId} className="chart-image-save-hint">.png は省略できます。</p>
        {validationError && <p id={validationId} className="chart-image-save-error" role="alert">{validationError}</p>}
      </div>
      {error && <p className="chart-image-save-error" role="alert">画像を保存できませんでした。もう一度「保存」を押してください。</p>}
      <div className="chart-image-save-actions">
        <button type="button" className="button secondary" disabled={saving} onClick={onClose}>キャンセル</button>
        <button type="submit" className="button" disabled={saving || !!validationError}>
          {saving ? '画像を作成中…' : '保存'}
        </button>
      </div>
    </form>
  </GoldenglowDetailModal>
}

function validateFilename(value: string): string | null {
  const filename = value.trim()
  if (!filename || /^\.png$/i.test(filename)) return 'ファイル名を入力してください。'
  if (/[<>:"/\\|?*\u0000-\u001f]/.test(filename)) return 'ファイル名に使えない文字が含まれています。'
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(filename)) return 'このファイル名は使用できません。別の名前を入力してください。'
  return null
}
