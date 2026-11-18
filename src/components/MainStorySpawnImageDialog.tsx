import { useId, useMemo, useState } from 'react'
import { getMainStorySpawnImageRange, isMainStorySpawnImageRangeTooTall } from '../lib/mainStorySpawnImageRange'
import {
  parseMainStorySpawnImageHighlightRows,
  type MainStorySpawnImageColumnKey, type MainStorySpawnImageHighlights,
} from '../lib/mainStorySpawnImageHighlights'
import { ComparisonTableImageDialog, type ComparisonTableImageSnapshot } from './ComparisonTableImageDialog'
import './MainStorySpawnImageDialog.css'

type RowRange = NonNullable<ReturnType<typeof getMainStorySpawnImageRange>>
const EMPTY_ROWS: readonly number[] = []
const EMPTY_COLUMNS: readonly MainStorySpawnImageColumnKey[] = []

export interface MainStorySpawnImageSelection {
  currentPageRange: RowRange
  totalRows: number
  columns: readonly (readonly [MainStorySpawnImageColumnKey, string])[]
  createSnapshot: (range: RowRange, highlights: MainStorySpawnImageHighlights) => ComparisonTableImageSnapshot
}

export function MainStorySpawnImageDialog({ selection, onClose }: {
  selection: MainStorySpawnImageSelection
  onClose: () => void
}) {
  const [start, setStart] = useState(() => String(selection.currentPageRange.start))
  const [end, setEnd] = useState(() => String(selection.currentPageRange.end))
  const [highlightEnabled, setHighlightEnabled] = useState(true)
  const [highlightRowInput, setHighlightRowInput] = useState('')
  const [highlightColumns, setHighlightColumns] = useState<readonly MainStorySpawnImageColumnKey[]>([])
  const rowInputId = useId()
  const range = useMemo(() => getMainStorySpawnImageRange(start, end, selection.totalRows),
    [start, end, selection.totalRows])
  const rangeError = range === null
    ? `1〜${selection.totalRows.toLocaleString('ja-JP')}行の範囲で、開始行から終了行を指定してください。`
    : isMainStorySpawnImageRangeTooTall(range) ? '画像に収まるように、出力する行を減らしてください。' : undefined
  const parsedHighlightRows = useMemo(
    () => highlightEnabled && range ? parseMainStorySpawnImageHighlightRows(highlightRowInput, range) : EMPTY_ROWS,
    [highlightEnabled, highlightRowInput, range],
  )
  const highlightError = range && parsedHighlightRows === null && !rangeError
    ? `強調する行番号は、出力範囲の${range.start.toLocaleString('ja-JP')}〜${range.end.toLocaleString('ja-JP')}行から指定してください。`
    : undefined
  const selectionError = rangeError ?? highlightError
  const outputRange = range && !rangeError ? range : selection.currentPageRange
  const highlights = useMemo<MainStorySpawnImageHighlights>(() => ({
    rows: selectionError ? EMPTY_ROWS : parsedHighlightRows ?? EMPTY_ROWS,
    columns: highlightEnabled ? highlightColumns : EMPTY_COLUMNS,
  }), [selectionError, parsedHighlightRows, highlightEnabled, highlightColumns])
  const snapshot = useMemo(() => selection.createSnapshot(outputRange, highlights), [selection, outputRange, highlights])

  function toggleColumn(key: MainStorySpawnImageColumnKey) {
    setHighlightColumns(previous => previous.includes(key)
      ? previous.filter(column => column !== key)
      : [...previous, key])
  }

  return <ComparisonTableImageDialog snapshot={snapshot} onClose={onClose} selectionError={selectionError} fixedOutputWidth={1920}
    options={saving => <><fieldset className="chart-image-save-aspect" disabled={saving}>
      <legend>出力範囲</legend>
      <div className="chart-image-save-ratio">
        <label className="chart-image-save-field">
          <span>開始行</span>
          <input type="number" min={1} max={selection.totalRows} step={1} required value={start}
            aria-invalid={Boolean(rangeError)} onChange={event => setStart(event.target.value)} />
        </label>
        <label className="chart-image-save-field">
          <span>終了行</span>
          <input type="number" min={1} max={selection.totalRows} step={1} required value={end}
            aria-invalid={Boolean(rangeError)} onChange={event => setEnd(event.target.value)} />
        </label>
      </div>
    </fieldset>
    <fieldset className="chart-image-save-aspect main-story-spawn-image-highlights" disabled={saving}>
      <legend>ハイライト</legend>
      <label className="main-story-spawn-image-highlight-toggle">
        <input type="checkbox" checked={highlightEnabled}
          onChange={event => setHighlightEnabled(event.target.checked)} />
        選択した行・列を強調
      </label>
      <div className="chart-image-save-field main-story-spawn-image-highlight-rows">
        <label htmlFor={rowInputId}>行番号</label>
        <input id={rowInputId} type="text" value={highlightRowInput} placeholder="11,18-20"
          aria-label="強調する行番号" aria-invalid={Boolean(highlightError)} disabled={!highlightEnabled}
          autoComplete="off" spellCheck={false} onChange={event => setHighlightRowInput(event.target.value)} />
      </div>
      <fieldset className="main-story-spawn-image-highlight-columns" disabled={!highlightEnabled}>
        <legend>列</legend>
        <div role="group" aria-label="強調する列">
          {selection.columns.map(([key, label]) => <label key={key}>
            <input type="checkbox" checked={highlightColumns.includes(key)} onChange={() => toggleColumn(key)} />
            {label}
          </label>)}
        </div>
      </fieldset>
    </fieldset></>} />
}
