import { useId, useMemo, useRef, useState } from 'react'
import type { OperatorCombatProfile } from '../types/skill'
import { buildOperatorModuleStageComparison, type OperatorModuleComparisonLayout } from '../lib/operatorModuleComparison'
import { getOperatorModuleId, getOperatorModuleLevels, getOperatorModules, getOperatorModuleTypeLabel } from '../lib/operatorModules'
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
  const [selectedLevels, setSelectedLevels] = useState<Record<string, number[]>>({})
  const [includeNone, setIncludeNone] = useState(true)
  const [layout, setLayout] = useState<OperatorModuleComparisonLayout>('columns')
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
  const moduleChoices = useMemo(() => getOperatorModules(profile ?? {}).map((module, index) => ({
    id: getOperatorModuleId(module, index),
    label: getOperatorModuleTypeLabel(module) ?? module.uniEquipName ?? 'MOD',
    levels: getOperatorModuleLevels(module).filter(level => Number.isInteger(level) && level > 0),
  })), [profile])
  const comparison = useMemo(() => profile
    ? buildOperatorModuleStageComparison(profile, selectedLevels, selectedPotential, includeNone)
    : null, [profile, selectedLevels, selectedPotential, includeNone])

  if (!comparison || moduleChoices.length === 0) {
    return <p className="operator-profile-empty">実装済みモジュールはありません。</p>
  }

  const toggleModuleLevel = (choice: typeof moduleChoices[number], level: number, checked: boolean) => {
    setSelectedLevels(previous => {
      const selected = previous[choice.id] ?? [choice.levels.at(-1)!]
      return { ...previous, [choice.id]: choice.levels.filter(candidate => candidate === level ? checked : selected.includes(candidate)) }
    })
    setImageFeedback(null)
  }

  const openImageSaveDialog = () => {
    if (imageSaveInProgress.current || invalidImageAspect || comparison.columns.length === 0) return
    setImageFeedback(null)
    setImageFilename(getOperatorModuleComparisonImageFilename({
      operatorName, operatorId, level: comparison.level, columns: comparison.columns,
      potentialRank: comparison.potentialRank, aspect: imageAspect, layout,
    }))
  }

  const saveImage = async (filename: string) => {
    if (imageSaveInProgress.current || invalidImageAspect || comparison.columns.length === 0) return
    imageSaveInProgress.current = true
    setSavingImage(true)
    setImageFeedback(null)
    try {
      const destination = await selectChartImageDestination(filename, imageSavePicker)
      if (destination.type === 'cancelled') return
      const { saveOperatorModuleComparisonImage } = await import('./saveOperatorModuleComparisonImage')
      await saveOperatorModuleComparisonImage({
        comparison, operatorName, operatorId, aspect: imageAspect, filename, layout,
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
          <div className="operator-module-comparison-stages" role="group" aria-label="比較するMOD・段階">
            <label className="operator-module-comparison-checkbox">
              <input type="checkbox" aria-label="未装備を比較に含める" aria-controls={contentId}
                disabled={savingImage} checked={includeNone}
                onChange={event => { setIncludeNone(event.target.checked); setImageFeedback(null) }} />未装備
            </label>
            {moduleChoices.map(choice => <div key={choice.id} className="operator-module-comparison-stage-group"
              role="group" aria-label={`${choice.label}の比較段階`}>
              <span className="operator-module-comparison-stage-label">{choice.label}</span>
              <div className="operator-module-comparison-stage-options">
                {choice.levels.map(level => <label key={level} className="operator-module-comparison-checkbox">
                  <input type="checkbox" aria-label={`${choice.label} Lv.${level}を比較`} aria-controls={contentId}
                    disabled={savingImage} checked={(selectedLevels[choice.id] ?? [choice.levels.at(-1)!]).includes(level)}
                    onChange={event => toggleModuleLevel(choice, level, event.target.checked)} />Lv.{level}
                </label>)}
                {choice.levels.length === 0 && <span>効果データなし</span>}
              </div>
            </div>)}
          </div>
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
          <label className="operator-module-comparison-layout">
            <span>表示</span>
            <select aria-label="モジュール比較表の表示" value={layout} disabled={savingImage} aria-controls={contentId}
              onChange={event => { setLayout(event.target.value as OperatorModuleComparisonLayout); setImageFeedback(null) }}>
              <option value="columns">レベルを列に</option><option value="rows">レベルを行に</option>
            </select>
          </label>
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
              disabled={savingImage || invalidImageAspect || comparison.columns.length === 0} aria-busy={savingImage}
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
        {comparison.columns.length > 0 ? <OperatorModuleComparisonTable comparison={comparison} layout={layout} />
          : <p className="operator-profile-empty">比較するMOD・段階を選択してください。</p>}
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
