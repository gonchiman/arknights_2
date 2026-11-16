import { useId, useRef, useState, type ReactNode } from 'react'
import { GoldenglowDetailModal } from './GoldenglowDetailModal'
import { HelpPopover } from './HelpPopover'
import './ChartImageSaveDialog.css'

export const CHART_IMAGE_ASPECT_PRESETS = ['16:9', '2:1', '21:9', '3:1'] as const

export interface ChartImageAspectSettings {
  preset: string
  width: string
  height: string
}

export function ChartImageSaveDialog({ initialFilename, getDefaultFilename, aspect, onAspectChange, aspectError, aspectPresets = CHART_IMAGE_ASPECT_PRESETS, aspectHint, canChooseLocation, saving, saveDisabled = false, error, onClose, onSave, additionalSaveAction, helpMode = 'inline', options, preview, videoExtension, cancelWhileSaving = false }: {
  initialFilename: string
  getDefaultFilename?: (aspectRatio?: number) => string
  aspect?: ChartImageAspectSettings
  onAspectChange?: (aspect: ChartImageAspectSettings) => void
  aspectError?: string
  aspectPresets?: readonly string[]
  aspectHint?: string
  canChooseLocation: boolean
  saving: boolean
  saveDisabled?: boolean
  error: boolean | string
  videoExtension?: 'mp4' | 'webm'
  cancelWhileSaving?: boolean
  onClose: () => void
  onSave: (filename: string, aspectRatio?: number) => void
  additionalSaveAction?: {
    label: string
    onSave: (filename: string, aspectRatio?: number) => void
  }
  helpMode?: 'inline' | 'popover'
  options?: ReactNode
  preview?: ReactNode
}) {
  const [customFilename, setCustomFilename] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const selectedInitialName = useRef(false)
  const composing = useRef(false)
  const id = useId()
  const inputId = `${id}-filename`
  const hintId = `${id}-hint`
  const validationId = `${id}-validation`
  const aspectHintId = `${id}-aspect-hint`
  const aspectErrorId = `${id}-aspect-error`
  const aspectValidationError = aspect?.preset === 'custom'
    && ![aspect.width, aspect.height].every((value) => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 100)
    ? '幅と高さを1〜100の整数で入力してください。' : aspectError
  const invalidAspect = Boolean(aspectValidationError)
  const aspectRatio = !aspect || aspect.preset === 'auto' ? undefined : Number(aspect.width) / Number(aspect.height)
  const filename = customFilename ?? (getDefaultFilename?.(invalidAspect ? undefined : aspectRatio) ?? initialFilename)
  const extensionPattern = videoExtension ? /\.(?:mp4|webm)$/i : /\.png$/i
  const validationError = validateFilename(filename, extensionPattern)
  const filenameHint = `.${videoExtension ?? 'png'} は省略できます。`
  const destinationHint = canChooseLocation
    ? '次の画面で保存先フォルダを選べます。'
    : 'このブラウザーでは保存先フォルダを選択できません。ブラウザーの設定に従ってダウンロードします。'
  const popoverHelp = helpMode === 'popover'
  const hasPreview = Boolean(preview)
  const mediaLabel = videoExtension ? '動画' : '画像'
  const aspectLabel = `${mediaLabel}の縦横比`
  const aspectDescription = aspectHint ?? `タイトル・凡例を含む${mediaLabel}全体の比率です。指定なしでは内容に合わせて自動調整します。`
  const closeDisabled = saving && !cancelWhileSaving
  const errorMessage = error === true
    ? `${mediaLabel}を保存できませんでした。保存先を確認して、もう一度お試しください。`
    : error

  return <GoldenglowDetailModal title={`${mediaLabel}を保存`} closeLabel={`${mediaLabel}の保存を閉じる`}
    className={`chart-image-save-dialog${hasPreview ? ' chart-image-save-dialog-with-preview' : ''}`} initialFocusRef={inputRef} closeDisabled={closeDisabled} onClose={onClose}>
    <form className="chart-image-save-form" aria-busy={saving}
      onSubmit={(event) => {
        event.preventDefault()
        if (!saving && !saveDisabled && !composing.current && !validationError && !invalidAspect) onSave(filename.trim(), aspectRatio)
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
          onChange={(event) => setCustomFilename(event.target.value)}
          onCompositionStart={() => { composing.current = true }}
          onCompositionEnd={() => { composing.current = false }}
          onFocus={(event) => {
            if (selectedInitialName.current) return
            selectedInitialName.current = true
            const value = event.currentTarget.value
            event.currentTarget.setSelectionRange(0, value.replace(extensionPattern, '').length)
          }} />
        <p id={hintId} className={popoverHelp ? 'visually-hidden' : 'chart-image-save-hint'}>{filenameHint}</p>
        {validationError && <p id={validationId} className="chart-image-save-error" role="alert">{validationError}</p>}
      </div>
      {aspect && onAspectChange && <fieldset className="chart-image-save-aspect" disabled={saving} aria-describedby={aspectHintId}>
        <legend>{popoverHelp ? <HelpPopover label={`${aspectLabel}の説明`} triggerText={`${aspectLabel}（幅:高さ）`}>
          <p>{aspectDescription}</p>
        </HelpPopover> : `${aspectLabel}（幅:高さ）`}</legend>
        <div className="chart-image-save-aspect-controls">
          <select aria-label={aspectLabel} value={aspect.preset} onChange={(event) => {
            const preset = event.target.value
            const [width, height] = preset.split(':')
            onAspectChange(preset === 'auto' || preset === 'custom'
              ? { ...aspect, preset }
              : { preset, width, height })
          }}>
            <option value="auto">指定なし</option>
            {aspectPresets.map((preset) => <option key={preset} value={preset}>{preset}</option>)}
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
        {invalidAspect && <p id={aspectErrorId} className="chart-image-save-error" role="alert">{aspectValidationError}</p>}
        <p id={aspectHintId} className={popoverHelp ? 'visually-hidden' : 'chart-image-save-hint'}>{aspectDescription}</p>
      </fieldset>}
      {options}
      {hasPreview && <div className="chart-image-save-preview">{preview}</div>}
      {!popoverHelp && <p className="chart-image-save-hint">{destinationHint}</p>}
      {errorMessage && <p className="chart-image-save-error" role="alert">{errorMessage}</p>}
      <div className="chart-image-save-actions">
        <button type="button" className="button secondary" disabled={closeDisabled} onClick={onClose}>キャンセル</button>
        {additionalSaveAction && <button type="button" className="button secondary"
          disabled={saving || saveDisabled || !!validationError || invalidAspect}
          onClick={() => { if (!composing.current) additionalSaveAction.onSave(filename.trim(), aspectRatio) }}>
          {additionalSaveAction.label}
        </button>}
        <button type="submit" className="button" disabled={saving || saveDisabled || !!validationError || invalidAspect}>
          {saving ? `${mediaLabel}を保存中…` : canChooseLocation ? '保存先を選ぶ' : 'ダウンロード'}
        </button>
      </div>
    </form>
  </GoldenglowDetailModal>
}

function validateFilename(value: string, extensionPattern: RegExp): string | null {
  const filename = value.trim()
  if (!filename.replace(extensionPattern, '').trim()) return 'ファイル名を入力してください。'
  if (/[<>:"/\\|?*\u0000-\u001f]/.test(filename)) return 'ファイル名に使えない文字が含まれています。'
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(filename)) return 'このファイル名は使用できません。別の名前を入力してください。'
  return null
}
