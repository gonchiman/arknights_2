import { useLayoutEffect, useRef, useState } from 'react'
import { ENEMY_RATING_STATS, type EnemyRatingStat } from '../lib/enemyStatRatings'
import { getChartImageSavePicker, selectChartImageDestination } from '../lib/chartImageDestination'
import { withChartImageAspect } from '../lib/chartImageFilename'
import { parseTableImageAspect, type TableImageAspect } from '../lib/tableImageAspect'
import { ChartImageSaveDialog, type ChartImageAspectSettings } from './ChartImageSaveDialog'
import { EnemyRatingReferenceImage, saveEnemyRatingReferenceImage } from './saveEnemyRatingReferenceImage'
import './EnemyRatingImageSaveDialog.css'

export function EnemyRatingImageSaveDialog({ stats, onStatsChange, onClose, onSaved }: {
  stats: readonly EnemyRatingStat[]
  onStatsChange: (stats: EnemyRatingStat[]) => void
  onClose: () => void
  onSaved?: (message: string) => void
}) {
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [aspectSettings, setAspectSettings] = useState<ChartImageAspectSettings>({ preset: 'auto', width: '16', height: '9' })
  const aspect = aspectSettings.preset === 'auto' ? null : parseTableImageAspect(aspectSettings.width, aspectSettings.height)
  const invalidAspect = aspectSettings.preset !== 'auto' && aspect === null
  const savingRef = useRef(false)
  const selectedStats = ENEMY_RATING_STATS.filter(({ key }) => stats.includes(key))
  const filename = `敵_評価基準${selectedStats.length ? `_${selectedStats.map(({ key, label }) => key === 'maxHp' ? 'HP' : label).join('-')}` : ''}.png`

  async function saveImage(selectedFilename: string) {
    if (savingRef.current || selectedStats.length === 0 || invalidAspect) return
    const snapshot = selectedStats.map(({ key }) => key)
    const aspectSnapshot = aspect ? { ...aspect } : null
    savingRef.current = true
    setSaving(true)
    setSaveError(false)
    try {
      const destination = await selectChartImageDestination(selectedFilename, getChartImageSavePicker())
      if (destination.type === 'cancelled') return
      await saveEnemyRatingReferenceImage({
        stats: snapshot,
        aspect: aspectSnapshot,
        filename: selectedFilename,
        writeBlob: destination.type === 'file' ? destination.write : undefined,
      })
      onSaved?.(destination.type === 'file' ? '画像を保存しました。' : 'ダウンロードを開始しました。')
      onClose()
    } catch {
      setSaveError(true)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return <ChartImageSaveDialog
    initialFilename={filename}
    getDefaultFilename={(ratio) => ratio === undefined ? filename : withChartImageAspect(filename, ratio)}
    aspect={aspectSettings}
    onAspectChange={(next) => { setAspectSettings(next); setSaveError(false) }}
    aspectError={invalidAspect ? '幅と高さは1〜100の整数、縦横比は1:10〜10:1で指定してください。' : undefined}
    aspectHint="表の幅と行の高さを調整します。指定なしでは内容に合わせて自動調整します。"
    canChooseLocation={Boolean(getChartImageSavePicker())}
    saving={saving}
    saveDisabled={selectedStats.length === 0}
    error={saveError}
    helpMode="popover"
    onClose={onClose}
    onSave={(selectedFilename) => { void saveImage(selectedFilename) }}
    preview={<div className="enemy-rating-image-options">
      <fieldset className="enemy-rating-image-stat-picker" disabled={saving}>
        <legend>画像に含める項目</legend>
        <div className="enemy-rating-image-stat-options">
          {ENEMY_RATING_STATS.map(({ key, label }) => <label key={key}>
            <input type="checkbox" checked={stats.includes(key)} onChange={(event) => {
              const next = event.target.checked ? [...stats, key] : stats.filter((stat) => stat !== key)
              onStatsChange(ENEMY_RATING_STATS.filter((stat) => next.includes(stat.key)).map((stat) => stat.key))
              setSaveError(false)
            }} />
            <span>{label}</span>
          </label>)}
        </div>
      </fieldset>
      {selectedStats.length > 0 ? !invalidAspect && <EnemyRatingImagePreview
        key={`${selectedStats.map(({ key }) => key).join(':')}:${aspect?.width ?? 'auto'}:${aspect?.height ?? ''}`}
        stats={stats} aspect={aspect}
      /> : <p className="chart-image-save-error" role="status">項目を1つ以上選んでください。</p>}
    </div>}
  />
}

function EnemyRatingImagePreview({ stats, aspect }: { stats: readonly EnemyRatingStat[]; aspect: TableImageAspect | null }) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [availableWidth, setAvailableWidth] = useState(0)
  const [size, setSize] = useState({ width: 1, height: 1 })
  const [layoutError, setLayoutError] = useState<unknown>(null)
  useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const measure = () => setAvailableWidth(viewport.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])
  const scale = Math.min(1, availableWidth / size.width, 420 / size.height)
  return <div ref={viewportRef} className="enemy-rating-image-preview" role="region" aria-label="評価基準画像のプレビュー" tabIndex={0}>
    {layoutError ? <p className="chart-image-save-error" role="alert">この比率では表を表示できません。比率を変更してください。</p> : <div
      className="enemy-rating-image-preview-size" style={{ width: size.width * scale, height: size.height * scale }}>
      <div className="enemy-rating-image-preview-scale" style={{ transform: `scale(${scale})` }}>
        <EnemyRatingReferenceImage stats={stats} aspect={aspect} onLayout={setSize} onLayoutError={setLayoutError} />
      </div>
    </div>}
  </div>
}
