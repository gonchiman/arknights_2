import { useMemo, useState } from 'react'
import { getMainStorySpawnImageRange, isMainStorySpawnImageRangeTooTall } from '../lib/mainStorySpawnImageRange'
import { ComparisonTableImageDialog, type ComparisonTableImageSnapshot } from './ComparisonTableImageDialog'

type RowRange = NonNullable<ReturnType<typeof getMainStorySpawnImageRange>>

export interface MainStorySpawnImageSelection {
  currentPageRange: RowRange
  totalRows: number
  createSnapshot: (range: RowRange) => ComparisonTableImageSnapshot
}

export function MainStorySpawnImageDialog({ selection, onClose }: {
  selection: MainStorySpawnImageSelection
  onClose: () => void
}) {
  const [start, setStart] = useState(() => String(selection.currentPageRange.start))
  const [end, setEnd] = useState(() => String(selection.currentPageRange.end))
  const range = useMemo(() => getMainStorySpawnImageRange(start, end, selection.totalRows),
    [start, end, selection.totalRows])
  const selectionError = range === null
    ? `1〜${selection.totalRows.toLocaleString('ja-JP')}行の範囲で、開始行から終了行を指定してください。`
    : isMainStorySpawnImageRangeTooTall(range) ? '画像に収まるように、出力する行を減らしてください。' : undefined
  const outputRange = range && !selectionError ? range : selection.currentPageRange
  const snapshot = useMemo(() => selection.createSnapshot(outputRange), [selection, outputRange])

  return <ComparisonTableImageDialog snapshot={snapshot} onClose={onClose} selectionError={selectionError}
    options={saving => <fieldset className="chart-image-save-aspect" disabled={saving}>
      <legend>出力範囲</legend>
      <div className="chart-image-save-ratio">
        <label className="chart-image-save-field">
          <span>開始行</span>
          <input type="number" min={1} max={selection.totalRows} step={1} required value={start}
            aria-invalid={Boolean(selectionError)} onChange={event => setStart(event.target.value)} />
        </label>
        <label className="chart-image-save-field">
          <span>終了行</span>
          <input type="number" min={1} max={selection.totalRows} step={1} required value={end}
            aria-invalid={Boolean(selectionError)} onChange={event => setEnd(event.target.value)} />
        </label>
      </div>
    </fieldset>} />
}
