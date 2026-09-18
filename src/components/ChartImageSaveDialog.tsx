import { useId, useRef, useState, type ReactNode } from 'react'
import { GoldenglowDetailModal } from './GoldenglowDetailModal'
import { HelpPopover } from './HelpPopover'
import './ChartImageSaveDialog.css'

const imageAspectPresets = ['16:9', '2:1', '21:9', '3:1'] as const

export interface ChartImageAspectSettings {
  preset: string
  width: string
  height: string
}

export function ChartImageSaveDialog({ initialFilename, aspect, onAspectChange, canChooseLocation, saving, error, onClose, onSave, helpMode = 'inline', preview }: {
  initialFilename: string
  aspect?: ChartImageAspectSettings
  onAspectChange?: (aspect: ChartImageAspectSettings) => void
  canChooseLocation: boolean
  saving: boolean
  error: boolean
  onClose: () => void
  onSave: (filename: string, aspectRatio?: number) => void
  helpMode?: 'inline' | 'popover'
  preview?: ReactNode
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
  const aspectHintId = `${id}-aspect-hint`
  const aspectErrorId = `${id}-aspect-error`
  const invalidAspect = aspect?.preset === 'custom'
    && ![aspect.width, aspect.height].every((value) => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 100)
  const aspectRatio = !aspect || aspect.preset === 'auto' ? undefined : Number(aspect.width) / Number(aspect.height)
  const filenameHint = '.png は省略できます。'
  const aspectHint = 'タイトル・凡例を含む画像全体の比率です。指定なしでは内容に合わせて自動調整します。'
  const destinationHint = canChooseLocation
    ? '次の画面で保存先フォルダを選べます。'
    : 'このブラウザーでは保存先フォルダを選択できません。ブラウザーの設定に従ってダウンロードします。'
  const popoverHelp = helpMode === 'popover'
  const hasPreview = Boolean(preview)

  return <GoldenglowDetailModal title="画像を保存" closeLabel="画像の保存を閉じる"
    className={`chart-image-save-dialog${hasPreview ? ' chart-image-save-dialog-with-preview' : ''}`} initialFocusRef={inputRef} closeDisabled={saving} onClose={onClose}>
    <form className="chart-image-save-form" aria-busy={saving}
      onSubmit={(event) => {
        event.preventDefault()
        if (!saving && !composing.current && !validationError && !invalidAspect) onSave(filename.trim(), aspectRatio)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && (composing.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) {
          event.preventDefault()
        }
      }}>
      <div className="chart-image-save-field">
        {popoverHelp ? <div className="chart-image-save-field-heading">
          <HelpPopover label="ファイル名の説明" triggerText="ファイル名">
            <p>{filenameHint}</p>
          </HelpPopover>
        </div> : <label htmlFor={inputId}>ファイル名</label>}
        <input ref={inputRef} id={inputId} type="text" aria-label="ファイル名" value={filename} disabled={saving}
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
        <p id={hintId} className={popoverHelp ? 'visually-hidden' : 'chart-image-save-hint'}>{filenameHint}</p>
        {validationError && <p id={validationId} className="chart-image-save-error" role="alert">{validationError}</p>}
      </div>
      {aspect && onAspectChange && <fieldset className="chart-image-save-aspect" disabled={saving} aria-describedby={aspectHintId}>
        <legend>{popoverHelp ? <HelpPopover label="画像の縦横比の説明" triggerText="画像の縦横比（幅:高さ）">
          <p>{aspectHint}</p>
        </HelpPopover> : '画像の縦横比（幅:高さ）'}</legend>
        <div className="chart-image-save-aspect-controls">
          <select aria-label="画像の縦横比" value={aspect.preset} onChange={(event) => {
            const preset = event.target.value
            const [width, height] = preset.split(':')
            onAspectChange(preset === 'auto' || preset === 'custom'
              ? { ...aspect, preset }
              : { preset, width, height })
          }}>
            <option value="auto">指定なし</option>
            {imageAspectPresets.map((preset) => <option key={preset} value={preset}>{preset}</option>)}
            <option value="custom">カスタム</option>
          </select>
          <button type="button" className="button secondary" onClick={() => {
            onAspectChange({ preset: 'auto', width: '16', height: '9' })
          }}>自動に戻す</button>
        </div>
        {aspect.preset === 'custom' && <div className="chart-image-save-ratio">
          {(['width', 'height'] as const).map((key) => <label key={key} className="chart-image-save-field">
            <span>比率の{key === 'width' ? '幅' : '高さ'}</span>
            <input type="number" min={1} max={100} step={1} required value={aspect[key]}
              aria-invalid={invalidAspect}
              aria-describedby={invalidAspect ? aspectErrorId : undefined}
              onChange={(event) => onAspectChange({ ...aspect, [key]: event.target.value })} />
          </label>)}
        </div>}
        {invalidAspect && <p id={aspectErrorId} className="chart-image-save-error" role="alert">幅と高さを1〜100の整数で入力してください。</p>}
        <p id={aspectHintId} className={popoverHelp ? 'visually-hidden' : 'chart-image-save-hint'}>{aspectHint}</p>
      </fieldset>}
      {hasPreview && <div className="chart-image-save-preview">{preview}</div>}
      {!popoverHelp && <p className="chart-image-save-hint">{destinationHint}</p>}
      {error && <p className="chart-image-save-error" role="alert">画像を保存できませんでした。保存先を確認して、もう一度お試しください。</p>}
      <div className="chart-image-save-actions">
        <button type="button" className="button secondary" disabled={saving} onClick={onClose}>キャンセル</button>
        <button type="submit" className="button" disabled={saving || !!validationError || invalidAspect}>
          {saving ? '画像を保存中…' : canChooseLocation ? '保存先を選ぶ' : 'ダウンロード'}
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
