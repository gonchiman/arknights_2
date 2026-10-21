import { lazy, Suspense, useCallback, useId, useMemo, useRef, useState } from 'react'
import type { OperatorCombatProfile } from '../types/skill'
import { buildOperatorModuleStageComparison, type OperatorModuleComparison as ModuleComparison, type OperatorModuleComparisonLayout } from '../lib/operatorModuleComparison'
import { buildOperatorModulePotentialComparison, type OperatorModulePotentialComparison } from '../lib/operatorModulePotentialComparison'
import { getOperatorModuleTalentPotentialRanks } from '../lib/operatorModuleTalentPotentials'
import { getOperatorModuleId, getOperatorModuleLevels, getOperatorModules, getOperatorModuleTypeLabel } from '../lib/operatorModules'
import { getOperatorModuleComparisonImageFilename } from '../lib/operatorModuleComparisonImageFilename'
import { getChartImageSavePicker, selectChartImageDestination } from '../lib/chartImageDestination'
import { parseTableImageAspect } from '../lib/tableImageAspect'
import { ChartImageSaveDialog, type ChartImageAspectSettings } from './ChartImageSaveDialog'
import { OperatorEffectLegend, OperatorModuleComparisonTable } from './OperatorModuleComparisonTable'
import './OperatorModuleComparison.css'

const IMAGE_ASPECT_PRESETS = ['16:9', '4:3', '1:1', '2:1', '9:16'] as const
const ModuleImagePreview = lazy(() => import('./saveOperatorModuleComparisonImage')
  .then(module => ({ default: module.OperatorModulePotentialComparisonImagePreview })))

export function OperatorModuleComparison({ profile, operatorName, operatorId }: {
  profile?: OperatorCombatProfile
  operatorName: string
  operatorId: string
}) {
  const contentId = useId()
  const [selectedLevels, setSelectedLevels] = useState<Record<string, number[]>>({})
  const [includeNone, setIncludeNone] = useState(true)
  const [layout, setLayout] = useState<OperatorModuleComparisonLayout>('columns')
  const [selectedPotentials, setSelectedPotentials] = useState<number[]>([1])
  const [potentialLayout, setPotentialLayout] = useState<OperatorModuleComparisonLayout>('columns')
  const [merge, setMerge] = useState(true)
  const [showPotentialAttributes, setShowPotentialAttributes] = useState(true)
  const imageSaveInProgress = useRef(false)
  const [savingImage, setSavingImage] = useState(false)
  const [imageSnapshot, setImageSnapshot] = useState<{
    comparison: ModuleComparison; potentialComparison: OperatorModulePotentialComparison
    layout: OperatorModuleComparisonLayout; potentialLayout: OperatorModuleComparisonLayout; merge: boolean
    showPotentialAttributes: boolean
    operatorName: string; operatorId: string
  } | null>(null)
  const [imageFeedback, setImageFeedback] = useState<'saved' | 'downloaded' | 'failed' | null>(null)
  const [layoutError, setLayoutError] = useState('')
  const [layoutReady, setLayoutReady] = useState(false)
  const reportLayoutError = useCallback((cause: unknown) => {
    setLayoutReady(false)
    setLayoutError(cause instanceof Error ? cause.message : '表のプレビューを表示できませんでした。')
  }, [])
  const reportLayoutReady = useCallback(() => { setLayoutError(''); setLayoutReady(true) }, [])
  const imageSavePicker = getChartImageSavePicker()
  const [aspect, setAspect] = useState<ChartImageAspectSettings>({ preset: 'auto', width: '16', height: '9' })
  const imageAspect = aspect.preset === 'auto' ? null : parseTableImageAspect(aspect.width, aspect.height)
  const invalidImageAspect = aspect.preset !== 'auto' && imageAspect === null
  const moduleChoices = useMemo(() => getOperatorModules(profile ?? {}).map((module, index) => ({
    id: getOperatorModuleId(module, index),
    label: getOperatorModuleTypeLabel(module) ?? module.uniEquipName ?? 'MOD',
    levels: getOperatorModuleLevels(module).filter(level => Number.isInteger(level) && level > 0),
  })), [profile])
  const potentialChoices = useMemo(() => profile ? getOperatorModuleTalentPotentialRanks(profile) : [1], [profile])
  const comparedPotentials = useMemo(() => selectedPotentials.filter(rank => potentialChoices.includes(rank)),
    [selectedPotentials, potentialChoices])
  const potentialComparison = useMemo(() => profile
    ? buildOperatorModulePotentialComparison(profile, selectedLevels, comparedPotentials, includeNone, showPotentialAttributes)
    : null, [profile, selectedLevels, comparedPotentials, includeNone, showPotentialAttributes])
  const comparison = useMemo(() => potentialComparison?.comparisons[0] ?? (profile
    ? buildOperatorModuleStageComparison(profile, selectedLevels, 1, includeNone) : null),
  [potentialComparison, profile, selectedLevels, includeNone])

  if (!comparison || !potentialComparison || moduleChoices.length === 0) {
    return <p className="operator-profile-empty">実装済みモジュールはありません。</p>
  }

  const hasSelection = potentialComparison.selectedPotentials.length > 0 && comparison.columns.length > 0

  const toggleModuleLevel = (choice: typeof moduleChoices[number], level: number, checked: boolean) => {
    setSelectedLevels(previous => {
      const selected = previous[choice.id] ?? [choice.levels.at(-1)!]
      return { ...previous, [choice.id]: choice.levels.filter(candidate => candidate === level ? checked : selected.includes(candidate)) }
    })
    setImageFeedback(null)
  }

  const openImageSaveDialog = () => {
    if (imageSaveInProgress.current || !hasSelection) return
    setImageFeedback(null)
    setLayoutError('')
    setLayoutReady(false)
    setImageSnapshot(structuredClone({ comparison, potentialComparison, layout, potentialLayout, merge,
      showPotentialAttributes, operatorName, operatorId }))
  }

  const saveImage = async (filename: string) => {
    if (imageSaveInProgress.current || invalidImageAspect || layoutError || !layoutReady
      || !imageSnapshot || imageSnapshot.comparison.columns.length === 0) return
    imageSaveInProgress.current = true
    setSavingImage(true)
    setImageFeedback(null)
    try {
      const destination = await selectChartImageDestination(filename, imageSavePicker)
      if (destination.type === 'cancelled') return
      const { saveOperatorModuleComparisonImage } = await import('./saveOperatorModuleComparisonImage')
      await saveOperatorModuleComparisonImage({
        ...imageSnapshot, aspect: imageAspect, filename,
        writeBlob: destination.type === 'file' ? destination.write : undefined,
      })
      setImageFeedback(destination.type === 'file' ? 'saved' : 'downloaded')
      setImageSnapshot(null)
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
            <span>比較する潜在</span>
            <div className="operator-module-comparison-stage-options" role="group" aria-label="比較する潜在">
              {potentialChoices.map((potential) => (
                <label key={potential} className="operator-module-comparison-checkbox">
                  <input type="checkbox" aria-label={`潜在${potential}を比較`} aria-controls={contentId}
                    disabled={savingImage} checked={selectedPotentials.includes(potential)}
                    onChange={event => {
                      const checked = event.target.checked
                      setSelectedPotentials(previous => potentialChoices.filter(rank => rank === potential
                        ? checked : previous.includes(rank)))
                      setImageFeedback(null)
                    }} />潜在{potential}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="operator-module-comparison-actions">
          <label className="operator-module-comparison-layout">
            <span>MODレベルの配置</span>
            <select aria-label="モジュール比較表の表示" value={layout} disabled={savingImage} aria-controls={contentId}
              onChange={event => { setLayout(event.target.value as OperatorModuleComparisonLayout); setImageFeedback(null) }}>
              <option value="columns">レベルを列に</option><option value="rows">レベルを行に</option>
            </select>
          </label>
          <label className="operator-module-comparison-layout">
            <span>潜在の配置</span>
            <select aria-label="潜在の配置" value={potentialLayout} disabled={savingImage} aria-controls={contentId}
              onChange={event => { setPotentialLayout(event.target.value as OperatorModuleComparisonLayout); setImageFeedback(null) }}>
              <option value="columns">潜在を列に</option><option value="rows">潜在を行に</option>
            </select>
          </label>
          <label className="operator-module-comparison-checkbox">
            <input type="checkbox" checked={merge} disabled={savingImage} aria-controls={contentId}
              onChange={event => { setMerge(event.target.checked); setImageFeedback(null) }} />共通の効果をまとめる
          </label>
          <label className="operator-module-comparison-checkbox">
            <input type="checkbox" checked={showPotentialAttributes} disabled={savingImage} aria-controls={contentId}
              onChange={event => { setShowPotentialAttributes(event.target.checked); setImageFeedback(null) }} />潜在の能力値補正を表示
          </label>
          <OperatorEffectLegend />
            <button type="button" className="button secondary operator-module-comparison-save"
              aria-label="モジュール比較テーブルをPNG画像で保存"
              aria-haspopup="dialog"
              disabled={savingImage || !hasSelection} aria-busy={savingImage}
              onClick={openImageSaveDialog}
            >{savingImage ? '画像を保存中…' : '画像を保存'}</button>
        </div>
      </div>
      <p role="status" className="visually-hidden">
        {imageFeedback === 'saved' ? 'PNG画像を保存しました。'
          : imageFeedback === 'downloaded' ? 'PNG画像のダウンロードを開始しました。' : ''}
      </p>
      <div className="operator-module-comparison-condition" aria-live="polite">
        <span>{potentialComparison.condition}</span>
      </div>
      <div id={contentId} className="operator-module-comparison-scroll" role="region" aria-label="モジュール比較表" tabIndex={0}>
        {hasSelection ? <OperatorModuleComparisonTable comparison={comparison} potentialComparison={potentialComparison}
          layout={layout} potentialLayout={potentialLayout} merge={merge} />
          : <p className="operator-profile-empty" role="status">{potentialComparison.selectedPotentials.length === 0
            ? '比較する潜在を選択してください。' : '比較するMOD・段階を選択してください。'}</p>}
      </div>
      {imageSnapshot !== null && <ChartImageSaveDialog
        initialFilename={getOperatorModuleComparisonImageFilename({
          ...imageSnapshot, level: imageSnapshot.comparison.level, columns: imageSnapshot.comparison.columns,
          potentialRank: imageSnapshot.comparison.potentialRank, aspect: imageAspect,
          potentialRanks: imageSnapshot.potentialComparison.selectedPotentials,
        })}
        getDefaultFilename={() => getOperatorModuleComparisonImageFilename({
          ...imageSnapshot, level: imageSnapshot.comparison.level, columns: imageSnapshot.comparison.columns,
          potentialRank: imageSnapshot.comparison.potentialRank, aspect: imageAspect,
          potentialRanks: imageSnapshot.potentialComparison.selectedPotentials,
        })}
        aspect={aspect}
        aspectPresets={IMAGE_ASPECT_PRESETS}
        onAspectChange={value => { setAspect(value); setImageFeedback(null); setLayoutReady(false); setLayoutError('') }}
        aspectError={invalidImageAspect ? '幅・高さは1〜100の整数で、比率が1:10〜10:1になるように入力してください。' : undefined}
        aspectHint="指定なしでは表の内容に合わせます。比率を指定しても表全体を保存します。"
        helpMode="popover"
        canChooseLocation={!!imageSavePicker}
        saving={savingImage}
        saveDisabled={Boolean(layoutError) || !layoutReady}
        error={imageFeedback === 'failed'}
        onClose={() => {
          if (imageSaveInProgress.current) return
          setImageSnapshot(null)
          setImageFeedback(null)
        }}
        onSave={(filename) => void saveImage(filename)}
        preview={!invalidImageAspect && <Suspense fallback={<p role="status">プレビューを準備中…</p>}>
          <ModuleImagePreview {...imageSnapshot} aspect={imageAspect}
            onLayoutError={reportLayoutError} onLayoutReady={reportLayoutReady} />
        </Suspense>}
      />}
    </div>
  )
}
