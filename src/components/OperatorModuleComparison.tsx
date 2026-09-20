import { useId, useMemo, useRef, useState } from 'react'
import type { OperatorCombatProfile } from '../types/skill'
import { buildOperatorModuleComparison } from '../lib/operatorModuleComparison'
import { getOperatorModuleComparisonImageFilename } from '../lib/operatorModuleComparisonImageFilename'
import { getChartImageSavePicker, selectChartImageDestination } from '../lib/chartImageDestination'
import { parseTableImageAspect } from '../lib/tableImageAspect'
import { ChartImageSaveDialog } from './ChartImageSaveDialog'
import { OperatorEffectLegend, OperatorModuleComparisonTable } from './OperatorModuleComparisonTable'
import './OperatorModuleComparison.css'

const IMAGE_ASPECT_PRESETS = ['16:9', '4:3', '1:1', '2:1', '9:16'] as const

export function OperatorModuleComparison({ profile, operatorName, operatorId }: {
  profile?: OperatorCombatProfile
  operatorName: string
  operatorId: string
}) {
  const contentId = useId()
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null)
  const [selectedPotential, setSelectedPotential] = useState(1)
  const imageSaveInProgress = useRef(false)
  const [savingImage, setSavingImage] = useState(false)
  const [imageFilename, setImageFilename] = useState<string | null>(null)
  const [imageFeedback, setImageFeedback] = useState<'saved' | 'downloaded' | 'failed' | null>(null)
  const imageSavePicker = getChartImageSavePicker()
  const [imageAspectPreset, setImageAspectPreset] = useState('auto')
  const [customImageAspect, setCustomImageAspect] = useState({ width: '16', height: '9' })
  const imageAspectParts = imageAspectPreset.split(':')
  const imageAspect = imageAspectPreset === 'auto' ? null
    : imageAspectPreset === 'custom'
      ? parseTableImageAspect(customImageAspect.width, customImageAspect.height)
      : parseTableImageAspect(imageAspectParts[0], imageAspectParts[1])
  const invalidImageAspect = imageAspectPreset !== 'auto' && imageAspect === null
  const imageAspectErrorId = `${contentId}-image-aspect-error`
  const comparison = useMemo(() => profile
    ? buildOperatorModuleComparison(profile, selectedLevel, selectedPotential)
    : null, [profile, selectedLevel, selectedPotential])

  if (!comparison || comparison.columns.length < 2) {
    return <p className="operator-profile-empty">実装済みモジュールはありません。</p>
  }

  const openImageSaveDialog = () => {
    if (imageSaveInProgress.current || invalidImageAspect) return
    setImageFeedback(null)
    setImageFilename(getOperatorModuleComparisonImageFilename({
      operatorName, operatorId, level: comparison.level, potentialRank: comparison.potentialRank, aspect: imageAspect,
    }))
  }

  const saveImage = async (filename: string) => {
    if (imageSaveInProgress.current || invalidImageAspect) return
    imageSaveInProgress.current = true
    setSavingImage(true)
    setImageFeedback(null)
    try {
      const destination = await selectChartImageDestination(filename, imageSavePicker)
      if (destination.type === 'cancelled') return
      const { saveOperatorModuleComparisonImage } = await import('./saveOperatorModuleComparisonImage')
      await saveOperatorModuleComparisonImage({
        comparison, operatorName, operatorId, aspect: imageAspect, filename,
        writeBlob: destination.type === 'file' ? destination.write : undefined,
      })
      setImageFeedback(destination.type === 'file' ? 'saved' : 'downloaded')
      setImageFilename(null)
    } catch {
      setImageFeedback('failed')
    } finally {
      imageSaveInProgress.current = false
      setSavingImage(false)
    }
  }

  return (
    <div className="operator-module-comparison">
      <div className="operator-module-comparison-controls">
        <div className="operator-module-comparison-selections">
          {comparison.levels.length > 0 && (
            <div className="operator-module-comparison-levels">
              <span>モジュールレベル</span>
              <div role="group" aria-label="モジュールレベル">
                {comparison.levels.map((level) => (
                  <button type="button" key={level}
                    aria-pressed={level === comparison.level}
                    aria-controls={contentId}
                    disabled={savingImage}
                    onClick={() => { setSelectedLevel(level); setImageFeedback(null) }}
                  >Lv.{level}</button>
                ))}
              </div>
            </div>
          )}
          <div className="operator-module-comparison-potentials">
            <span>潜在</span>
            <div role="group" aria-label="潜在（全MOD共通）">
              {comparison.potentialRanks.map((potential) => (
                <button type="button" key={potential}
                  aria-label={`潜在${potential}`}
                  aria-pressed={potential === comparison.potentialRank}
                  aria-controls={contentId}
                  disabled={savingImage}
                  onClick={() => { setSelectedPotential(potential); setImageFeedback(null) }}
                >{potential}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="operator-module-comparison-actions">
          <OperatorEffectLegend />
          <div className="operator-module-comparison-image-settings" role="group" aria-label="画像の保存設定">
            <label className="operator-module-comparison-image-preset">
              <span>画像比率</span>
              <select aria-label="保存画像の比率（横：縦）" value={imageAspectPreset} disabled={savingImage}
                onChange={(event) => { setImageAspectPreset(event.target.value); setImageFeedback(null) }}>
                <option value="auto">自動</option>
                {IMAGE_ASPECT_PRESETS.map((aspect) => <option key={aspect} value={aspect}>{aspect}</option>)}
                <option value="custom">カスタム</option>
              </select>
            </label>
            {imageAspectPreset === 'custom' && (
              <div className="operator-module-comparison-image-custom" role="group" aria-label="画像の比率（横：縦）">
                {(['width', 'height'] as const).map((dimension) => (
                  <label key={dimension}>
                    <span>{dimension === 'width' ? '横' : '縦'}</span>
                    <input type="number" inputMode="numeric" min={1} max={100} step={1}
                      aria-label={`保存画像の比率・${dimension === 'width' ? '横' : '縦'}`}
                      aria-invalid={invalidImageAspect}
                      aria-describedby={invalidImageAspect ? imageAspectErrorId : undefined}
                      disabled={savingImage} value={customImageAspect[dimension]}
                      onChange={(event) => {
                        setCustomImageAspect({ ...customImageAspect, [dimension]: event.target.value })
                        setImageFeedback(null)
                      }}
                    />
                  </label>
                ))}
              </div>
            )}
            <button type="button" className="button secondary operator-module-comparison-save"
              aria-label="モジュール比較テーブルをPNG画像で保存"
              aria-haspopup="dialog"
              disabled={savingImage || invalidImageAspect} aria-busy={savingImage}
              onClick={openImageSaveDialog}
            >{savingImage ? '画像を保存中…' : '画像を保存'}</button>
          </div>
        </div>
      </div>
      {invalidImageAspect && <p id={imageAspectErrorId} role="alert" className="operator-module-comparison-save-error">
        横・縦は1〜100の整数で、比率が1:10〜10:1になるように入力してください。
      </p>}
      <p role="status" className="visually-hidden">
        {imageFeedback === 'saved' ? 'PNG画像を保存しました。'
          : imageFeedback === 'downloaded' ? 'PNG画像のダウンロードを開始しました。' : ''}
      </p>
      <div className="operator-module-comparison-condition" aria-live="polite">
        <span>{comparison.condition}（全列共通）</span>
        {comparison.potentialEffects.length > 0 && <span>{comparison.potentialEffects.join(' ／ ')}</span>}
      </div>
      <div id={contentId} className="operator-module-comparison-scroll" aria-live="polite">
        <OperatorModuleComparisonTable comparison={comparison} />
      </div>
      {imageFilename !== null && <ChartImageSaveDialog
        initialFilename={imageFilename}
        canChooseLocation={!!imageSavePicker}
        saving={savingImage}
        error={imageFeedback === 'failed'}
        onClose={() => {
          if (imageSaveInProgress.current) return
          setImageFilename(null)
          setImageFeedback(null)
        }}
        onSave={(filename) => void saveImage(filename)}
      />}
    </div>
  )
}
