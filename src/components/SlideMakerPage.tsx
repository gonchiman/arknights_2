import { useEffect, useLayoutEffect, useRef, useState, type DragEvent } from 'react'
import {
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  containRect,
  imageFileError,
  legacyPortraitImageRect,
  loadSlideImage,
  portraitImageRect,
  renderSlide,
  slideFilename,
  slideLayout,
  transformPortraitRect,
  type SlideImage,
  type SlideTheme,
} from '../lib/slideComposer'
import { readPortraitBaseline, writePortraitBaseline } from '../lib/slidePortraitBaseline'
import './SlideMakerPage.css'

type ImageSlot = 'main' | 'portrait'
type ImageState = { asset: SlideImage | null; loading: boolean; error: string }
const emptyImage = (): ImageState => ({ asset: null, loading: false, error: '' })
const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp'
const PORTRAIT_ZOOM_MIN = 25
const PORTRAIT_ZOOM_MAX = 200

type ImageUploadProps = {
  slot: ImageSlot
  state: ImageState
  disabled: boolean
  onSelect: (file: File) => void
  onRemove: () => void
  onError: (message: string) => void
}

function AdjustmentNumber({ label, unit, value, min, max, step, disabled, onChange }: {
  label: string
  unit: string
  value: number
  min: number
  max: number
  step: number
  disabled: boolean
  onChange: (value: number) => void
}) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  return (
    <div className="slide-maker-adjustment-value">
      <input
        type="number" aria-label={label} min={min} max={max} step={step}
        value={draft} disabled={disabled}
        onChange={(event) => {
          setDraft(event.currentTarget.value)
          const next = event.currentTarget.valueAsNumber
          if (Number.isFinite(next) && next >= min && next <= max) onChange(next)
        }}
        onBlur={() => {
          const next = draft.trim() ? Number(draft) : value
          const bounded = Number.isFinite(next) ? Math.min(max, Math.max(min, next)) : value
          const resolved = Number((Math.round(bounded / step) * step).toFixed(6))
          onChange(resolved)
          setDraft(String(resolved))
        }}
      />
      <span>{unit}</span>
    </div>
  )
}

function ImageUpload({ slot, state, disabled, onSelect, onRemove, onError }: ImageUploadProps) {
  const [dragging, setDragging] = useState(false)
  const isMain = slot === 'main'
  const inputId = `slide-${slot}-file`
  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    setDragging(false)
    if (disabled) return
    if (event.dataTransfer.files.length !== 1) {
      onError('画像は1枚ずつ選択してください。')
      return
    }
    onSelect(event.dataTransfer.files[0])
  }

  return (
    <div className="slide-maker-upload-group" aria-busy={state.loading}>
      <label
        className={`slide-maker-upload${dragging ? ' is-dragging' : ''}`}
        htmlFor={inputId}
        onDragOver={(event) => { event.preventDefault(); if (!disabled) setDragging(true) }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
        }}
        onDrop={onDrop}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="1" />
          <circle cx="8" cy="8" r="1.5" />
          <path d="m3 17 5-5 4 4 4-6 5 7" />
        </svg>
        <strong>{state.asset ? '画像を差し替える' : isMain ? '画像を選択' : '立ち絵を選択'}</strong>
        <input
          id={inputId}
          type="file"
          accept={IMAGE_ACCEPT}
          aria-label={isMain ? '表示する画像を選択' : '立ち絵を選択'}
          aria-describedby={`${inputId}-hint${state.asset || state.loading ? ` ${inputId}-info` : ''}${state.error ? ` ${inputId}-error` : ''}`}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ''
            if (file) onSelect(file)
          }}
        />
      </label>
      <p className="slide-maker-hint" id={`${inputId}-hint`}>
        PNG・JPEG・WebP／25 MBまで
      </p>
      {(state.asset || state.loading) && <div className="slide-maker-file-row">
        <p id={`${inputId}-info`}>
          {state.loading ? '読み込み中…' : state.asset
            ? `${state.asset.name} · ${state.asset.width} × ${state.asset.height}`
            : ''}
        </p>
        <button className="text-button" type="button" onClick={onRemove}>
          {isMain ? '画像を外す' : '立ち絵を外す'}
        </button>
      </div>}
      {state.error && <p className="slide-maker-error" id={`${inputId}-error`} role="alert">{state.error}</p>}
    </div>
  )
}

export function SlideMakerPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mounted = useRef(false)
  const sequence = useRef({ main: 0, portrait: 0 })
  const [images, setImages] = useState<Record<ImageSlot, ImageState>>({ main: emptyImage(), portrait: emptyImage() })
  const [showPortrait, setShowPortrait] = useState(true)
  const [portraitBaseline, setPortraitBaseline] = useState(readPortraitBaseline)
  const [portraitScale, setPortraitScale] = useState(100)
  const [portraitPosition, setPortraitPosition] = useState({ x: 0, y: 0 })
  const [portraitBehindCaption, setPortraitBehindCaption] = useState(portraitBaseline.behindCaption)
  const [baselineNotice, setBaselineNotice] = useState('')
  const [title, setTitle] = useState('')
  const [caption, setCaption] = useState('')
  const [theme, setTheme] = useState<SlideTheme>('light')
  const [fontsReady, setFontsReady] = useState(false)
  const [textFit, setTextFit] = useState({ titleFits: true, captionFits: true })
  const [canvasReady, setCanvasReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState(false)
  const savingRef = useRef(false)
  const portraitAsset = images.portrait.asset
  const portraitBox = slideLayout().portrait
  const baselineRect = portraitAsset
    ? (portraitBaseline.coordinateSpace === 'slide' ? portraitImageRect : legacyPortraitImageRect)(
      portraitAsset.width, portraitAsset.height, portraitBox,
      portraitBaseline.scale, portraitBaseline.x, portraitBaseline.y,
    )
    : null
  const portraitRect = baselineRect
    ? transformPortraitRect(baselineRect, portraitScale, portraitPosition.x, portraitPosition.y)
    : null
  const renderedPortraitScale = portraitAsset && portraitRect
    ? portraitRect.height / containRect(portraitAsset.width, portraitAsset.height, portraitBox).height * 100
    : portraitBaseline.scale
  const portraitControlsDisabled = !portraitAsset || images.portrait.loading
  const portraitAtBaseline = portraitScale === 100
    && portraitPosition.x === 0
    && portraitPosition.y === 0
    && portraitBehindCaption === portraitBaseline.behindCaption

  const changePortraitScale = (value: number) => {
    if (!Number.isFinite(value)) return
    setPortraitScale(Math.min(PORTRAIT_ZOOM_MAX, Math.max(PORTRAIT_ZOOM_MIN, value)))
    setBaselineNotice('')
  }

  const changePortraitPosition = (axis: 'x' | 'y', value: number) => {
    if (!Number.isFinite(value)) return
    const limit = axis === 'x' ? SLIDE_WIDTH : SLIDE_HEIGHT
    setPortraitPosition((current) => ({ ...current, [axis]: Math.round(Math.min(limit, Math.max(-limit, value))) }))
    setBaselineNotice('')
  }

  const restorePortraitBaseline = () => {
    setPortraitScale(100)
    setPortraitPosition({ x: 0, y: 0 })
    setPortraitBehindCaption(portraitBaseline.behindCaption)
    setBaselineNotice('')
  }

  const capturePortraitBaseline = () => {
    if (portraitControlsDisabled || !portraitRect) return
    const baseline = {
      scale: renderedPortraitScale,
      x: portraitRect.x,
      y: portraitRect.y,
      behindCaption: portraitBehindCaption,
      coordinateSpace: 'slide' as const,
    }
    setPortraitBaseline(baseline)
    setPortraitScale(100)
    setPortraitPosition({ x: 0, y: 0 })
    const persisted = writePortraitBaseline(baseline)
    setBaselineNotice(persisted
      ? '現在の配置を基準として保存しました。次に開いたときも使用します。'
      : 'この画面の基準を更新しました。ブラウザーに保存できないため、ページを閉じると元に戻ります。')
  }

  useEffect(() => {
    mounted.current = true
    void Promise.resolve(document.fonts?.ready).then(() => {
      if (mounted.current) setFontsReady(true)
    })
    return () => {
      mounted.current = false
      sequence.current.main++
      sequence.current.portrait++
    }
  }, [])

  useLayoutEffect(() => {
    const context = canvasRef.current?.getContext('2d')
    setCanvasReady(Boolean(context))
    if (!context) return
    setTextFit(renderSlide(context, {
      main: images.main.asset,
      portrait: images.portrait.asset,
      title,
      caption,
      theme,
      showPortrait,
      portraitScale: renderedPortraitScale,
      portraitPositionX: portraitRect?.x,
      portraitPositionY: portraitRect?.y,
      portraitBehindCaption,
    }))
    setSaved(false)
    setSaveError('')
  }, [images.main.asset, images.portrait.asset, title, caption, theme, showPortrait, renderedPortraitScale, portraitRect?.x, portraitRect?.y, portraitBehindCaption, fontsReady])

  const updateImage = (slot: ImageSlot, change: Partial<ImageState>) => {
    setImages((current) => ({ ...current, [slot]: { ...current[slot], ...change } }))
  }

  const selectImage = async (slot: ImageSlot, file: File) => {
    if (savingRef.current) return
    const request = ++sequence.current[slot]
    const error = imageFileError(file)
    setSaved(false)
    setSaveError('')
    updateImage(slot, { loading: !error, error })
    if (error) return
    try {
      const asset = await loadSlideImage(file)
      if (mounted.current && request === sequence.current[slot]) {
        updateImage(slot, { asset, loading: false, error: '' })
      }
    } catch (reason) {
      if (mounted.current && request === sequence.current[slot]) {
        updateImage(slot, {
          loading: false,
          error: reason instanceof Error ? reason.message : '画像を読み込めませんでした。別の画像を選択してください。',
        })
      }
    }
  }

  const removeImage = (slot: ImageSlot) => {
    sequence.current[slot]++
    updateImage(slot, emptyImage())
    setSaveError('')
    setSaved(false)
  }

  const loading = images.main.loading || (showPortrait && images.portrait.loading)
  const textFits = textFit.titleFits && textFit.captionFits
  const canSave = Boolean(images.main.asset) && !loading && !saving && fontsReady && textFits && canvasReady
  const saveSlide = async () => {
    const canvas = canvasRef.current
    if (!canvas || !canSave || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setSaveError('')
    setSaved(false)
    const filename = slideFilename(title)
    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => result ? resolve(result) : reject(new Error('PNGを作成できませんでした。')), 'image/png')
      })
      if (!mounted.current) return
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
      setSaved(true)
    } catch (reason) {
      if (mounted.current) setSaveError(reason instanceof Error ? reason.message : '保存できませんでした。もう一度お試しください。')
    } finally {
      savingRef.current = false
      if (mounted.current) setSaving(false)
    }
  }

  const status = saving ? 'PNGを作成しています…'
    : loading ? '画像を読み込んでいます…'
      : !canvasReady ? 'このブラウザーではスライドを表示できません。'
        : !fontsReady ? '文字の表示を準備しています…'
          : !textFits ? '文章を調整すると保存できます。'
            : saved ? 'PNGの保存を開始しました。'
              : ''

  return (
    <div className="slide-maker-page">
      <div className="slide-maker-workspace">
        <form className="slide-maker-editor" aria-label="スライドの素材と文章" onSubmit={(event) => event.preventDefault()}>
          <fieldset disabled={saving}>
            <section className="slide-maker-panel">
              <h2><span className="slide-maker-step">01</span>表示する画像 <small>必須</small></h2>
              <ImageUpload slot="main" state={images.main} disabled={saving} onSelect={(file) => { void selectImage('main', file) }} onRemove={() => removeImage('main')} onError={(error) => { sequence.current.main++; updateImage('main', { error, loading: false }) }} />
            </section>

            <section className="slide-maker-panel">
              <h2><span className="slide-maker-step">02</span>立ち絵 <small>任意</small></h2>
              <label className="slide-maker-check"><input type="checkbox" checked={showPortrait} onChange={(event) => setShowPortrait(event.target.checked)} />立ち絵のスペースを使う</label>
              {showPortrait && (
                <>
                  <ImageUpload slot="portrait" state={images.portrait} disabled={saving} onSelect={(file) => { void selectImage('portrait', file) }} onRemove={() => removeImage('portrait')} onError={(error) => { sequence.current.portrait++; updateImage('portrait', { error, loading: false }) }} />
                  <div className="slide-maker-portrait-size">
                    <div className="slide-maker-size-heading">
                      <label htmlFor="slide-portrait-size">立ち絵のサイズ</label>
                      <AdjustmentNumber label="立ち絵のサイズ（数値）" unit="%" min={PORTRAIT_ZOOM_MIN} max={PORTRAIT_ZOOM_MAX} step={0.1} value={portraitScale} disabled={portraitControlsDisabled} onChange={changePortraitScale} />
                    </div>
                    <div className="slide-maker-range-row">
                      <div>
                        <input
                          id="slide-portrait-size"
                          type="range"
                          min={PORTRAIT_ZOOM_MIN}
                          max={PORTRAIT_ZOOM_MAX}
                          step={0.1}
                          value={portraitScale}
                          disabled={portraitControlsDisabled}
                          onChange={(event) => changePortraitScale(event.currentTarget.valueAsNumber)}
                          aria-valuetext={`${portraitScale}%（基準100%）`}
                        />
                        <div className="slide-maker-size-limits"><span>{PORTRAIT_ZOOM_MIN}%</span><span>基準 100%</span><span>{PORTRAIT_ZOOM_MAX}%</span></div>
                      </div>
                      <button className="slide-maker-control-reset" type="button" aria-label="立ち絵のサイズをリセット" title="サイズを100%に戻す" disabled={portraitControlsDisabled || portraitScale === 100} onClick={() => changePortraitScale(100)}>リセット</button>
                    </div>
                    <div className="slide-maker-position-control">
                      <div className="slide-maker-size-heading">
                        <label htmlFor="slide-portrait-x">横位置</label>
                        <AdjustmentNumber label="横位置（数値）" unit="px" min={-SLIDE_WIDTH} max={SLIDE_WIDTH} step={1} value={portraitPosition.x} disabled={portraitControlsDisabled} onChange={(value) => changePortraitPosition('x', value)} />
                      </div>
                      <div className="slide-maker-range-row">
                        <div>
                          <input id="slide-portrait-x" type="range" min={-SLIDE_WIDTH} max={SLIDE_WIDTH} step={1} value={portraitPosition.x} disabled={portraitControlsDisabled} onChange={(event) => changePortraitPosition('x', event.currentTarget.valueAsNumber)} aria-valuetext={`基準から${portraitPosition.x}px（マイナスで左、プラスで右）`} />
                          <div className="slide-maker-size-limits"><span>左 −</span><span>基準 0</span><span>右 ＋</span></div>
                        </div>
                        <button className="slide-maker-control-reset" type="button" aria-label="横位置をリセット" title="横位置を0pxに戻す" disabled={portraitControlsDisabled || portraitPosition.x === 0} onClick={() => changePortraitPosition('x', 0)}>リセット</button>
                      </div>
                    </div>
                    <div className="slide-maker-position-control">
                      <div className="slide-maker-size-heading">
                        <label htmlFor="slide-portrait-y">縦位置</label>
                        <AdjustmentNumber label="縦位置（数値）" unit="px" min={-SLIDE_HEIGHT} max={SLIDE_HEIGHT} step={1} value={portraitPosition.y} disabled={portraitControlsDisabled} onChange={(value) => changePortraitPosition('y', value)} />
                      </div>
                      <div className="slide-maker-range-row">
                        <div>
                          <input id="slide-portrait-y" type="range" min={-SLIDE_HEIGHT} max={SLIDE_HEIGHT} step={1} value={portraitPosition.y} disabled={portraitControlsDisabled} onChange={(event) => changePortraitPosition('y', event.currentTarget.valueAsNumber)} aria-valuetext={`基準から${portraitPosition.y}px（マイナスで上、プラスで下）`} />
                          <div className="slide-maker-size-limits"><span>上 −</span><span>基準 0</span><span>下 ＋</span></div>
                        </div>
                        <button className="slide-maker-control-reset" type="button" aria-label="縦位置をリセット" title="縦位置を0pxに戻す" disabled={portraitControlsDisabled || portraitPosition.y === 0} onClick={() => changePortraitPosition('y', 0)}>リセット</button>
                      </div>
                    </div>
                    <div className="slide-maker-position-control">
                      <label className="slide-maker-check">
                        <input type="checkbox" checked={portraitBehindCaption} onChange={(event) => { setPortraitBehindCaption(event.target.checked); setBaselineNotice('') }} />
                        立ち絵を字幕の下に表示
                      </label>
                    </div>
                    <div className="slide-maker-baseline-actions">
                      <button className="button secondary" type="button" disabled={portraitControlsDisabled || portraitAtBaseline} onClick={restorePortraitBaseline}>基準の配置に戻す</button>
                      <button className="text-button" type="button" disabled={portraitControlsDisabled || portraitAtBaseline} onClick={capturePortraitBaseline}>現在の配置を基準にする</button>
                    </div>
                    {baselineNotice && <p className="slide-maker-hint" role="status">{baselineNotice}</p>}
                  </div>
                </>
              )}
            </section>

            <section className="slide-maker-panel">
              <h2><span className="slide-maker-step">03</span>タイトル・字幕</h2>
              <label className="slide-maker-field" htmlFor="slide-title">
                <span>章タイトル</span>
                <input id="slide-title" type="text" maxLength={60} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例：ゴールデングローのスキル解説" autoComplete="off" aria-invalid={!textFit.titleFits} aria-describedby={!textFit.titleFits ? 'slide-title-error' : undefined} />
              </label>
              {!textFit.titleFits && <p className="slide-maker-error" id="slide-title-error" role="alert">タイトルを短くしてください。1行に収まると保存できます。</p>}
              <label className="slide-maker-field" htmlFor="slide-caption">
                <span>字幕</span>
                <textarea id="slide-caption" rows={3} maxLength={120} value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="ここに解説の字幕を入力" aria-invalid={!textFit.captionFits} aria-describedby={!textFit.captionFits ? 'slide-caption-error' : undefined} />
              </label>
              {!textFit.captionFits && <p className="slide-maker-error" id="slide-caption-error" role="alert">字幕の改行を減らすか、文章を短くしてください。2行に収まると保存できます。</p>}
              <label className="slide-maker-field" htmlFor="slide-theme">
                <span>スライドの背景</span>
                <select id="slide-theme" value={theme} onChange={(event) => setTheme(event.target.value as SlideTheme)}><option value="light">ライト</option><option value="dark">ダーク</option></select>
              </label>
            </section>
          </fieldset>
        </form>

        <section className="slide-maker-preview" aria-label="作成するスライド">
          <div className="slide-maker-preview-heading"><h2>プレビュー</h2><span>1920 × 1080 ／ 16:9</span></div>
          <div className="slide-maker-preview-surface">
            <canvas ref={canvasRef} width={SLIDE_WIDTH} height={SLIDE_HEIGHT} aria-label="画像・立ち絵・タイトル・字幕を配置したスライド">
              このブラウザーではプレビューを表示できません。
            </canvas>
          </div>
          <div className="slide-maker-preview-footer">
            <p role="status" aria-live="polite">{status}</p>
            <button className="button" type="button" disabled={!canSave} onClick={() => { void saveSlide() }}>{saving ? '保存中…' : 'PNGで保存'}</button>
          </div>
          {saveError && <p className="slide-maker-error" role="alert">{saveError}</p>}
        </section>
      </div>
    </div>
  )
}
