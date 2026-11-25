import { useEffect, useId, useMemo, useState, type CSSProperties } from 'react'
import { buildTdEnemyTimeline, getTdEnemyPositions } from '../lib/tdEnemyTimeline'
import type { MapDetail, MapIndex, MapSummary } from '../types/map'
import { TdDeploymentBoard } from './TdDeploymentBoard'
import { useTdDeployment } from './TdDeploymentContext'
import { TdMapImage } from './TdMapImage'
import './TdEnemyTimelinePanel.css'

const COLORS = ['#8c4a87', '#1a687f', '#a34b18', '#416d43']

interface EnemyKind { name: string; letter: string; color: string }
interface OccupiedCell {
  x: number
  y: number
  firstX: number
  firstY: number
  total: number
  counts: Map<string, number>
}

function groupPositions(positions: ReturnType<typeof getTdEnemyPositions>, excluded: Set<string>, rows: number) {
  const cells = new Map<string, OccupiedCell>()
  let moving = 0
  let waiting = 0
  let hidden = 0
  for (const position of positions) {
    if (excluded.has(position.enemyId)) continue
    if (position.state === 'hidden') {
      hidden++
      continue
    }
    if (position.state === 'moving') moving++
    else waiting++
    const screenY = rows - 1 - position.row
    const x = Math.round(position.col)
    const y = Math.round(screenY)
    const key = `${x}:${y}`
    let cell = cells.get(key)
    if (!cell) {
      cell = { x, y, firstX: position.col, firstY: screenY, counts: new Map(), total: 0 }
      cells.set(key, cell)
    }
    cell.total++
    cell.counts.set(position.enemyId, (cell.counts.get(position.enemyId) ?? 0) + 1)
  }
  return { cells, moving, waiting, hidden }
}

function breakdown(cell: OccupiedCell, kinds: Map<string, EnemyKind>) {
  return [...cell.counts].map(([id, n]) => `${kinds.get(id)?.name ?? id} ${n}体`).join(' ／ ')
}

function CellMarker({ cell, rows, columns, kinds, expanded, onSelect }: {
  cell: OccupiedCell; rows: number; columns: number; kinds: Map<string, EnemyKind>
  expanded: boolean; onSelect: () => void
}) {
  const stacked = cell.total > 1
  const style: CSSProperties = {
    left: `${((stacked ? cell.x : cell.firstX) + 0.5) * 100 / columns}%`,
    top: `${((stacked ? cell.y : cell.firstY) + 0.5) * 100 / rows}%`,
  }
  const firstKind = kinds.get(cell.counts.keys().next().value!)
  if (!stacked) {
    return <span className="td-time-mark" role="img" aria-label={firstKind?.name}
      style={{ ...style, background: firstKind?.color }}>{firstKind?.letter}</span>
  }
  let end = 0
  const stops = [...cell.counts].map(([id, count]) => {
    const start = end
    end += count * 100 / cell.total
    return `${kinds.get(id)?.color ?? 'var(--accent)'} ${start}% ${end}%`
  })
  const background = stops.length === 1 ? firstKind?.color : `conic-gradient(${stops.join(', ')})`
  return <button className="td-time-mark td-time-stack" type="button" style={{ ...style, background }}
    aria-expanded={expanded} aria-label={`上から${cell.y + 1}行・左から${cell.x + 1}列の内訳：${breakdown(cell, kinds)}`}
    onClick={onSelect}><span>{cell.total}</span></button>
}

export function TdEnemyTimelinePanel({ map, detail, index, active }: {
  map: MapSummary; detail: MapDetail; index: MapIndex; active: boolean
}) {
  const sliderId = useId()
  const editing = useTdDeployment()?.editing ?? false
  const timeline = useMemo(() => buildTdEnemyTimeline(detail, index), [detail, index])
  const kinds = useMemo(() => new Map(detail.enemies.map(({ id }, i) => {
    const name = index.enemies[id]?.name ?? id
    const letter = Array.from(name.replace(/^[「『【]+/u, ''))[0] ?? '敵'
    return [id, { name, letter, color: COLORS[i % COLORS.length] }]
  })), [detail, index])
  const [seconds, setSeconds] = useState(0)
  const [startTime, setStartTime] = useState<number | null>(null)
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set())
  const [selectedCell, setSelectedCell] = useState<string | null>(null)
  const duration = timeline?.duration ?? 0
  const displayedSecond = Math.floor(seconds)
  const playing = startTime !== null && active && !editing
  useEffect(() => {
    if (startTime === null) return
    if (!active || editing || document.hidden) {
      setStartTime(null)
      return
    }
    let frame: number
    let lastPaint = -Infinity
    const animate = (now: number) => {
      const time = Math.min(duration, Math.max(0, (now - startTime) / 1000))
      if (now - lastPaint >= 60 || time >= duration) {
        setSeconds(time)
        lastPaint = now
      }
      if (time >= duration) setStartTime(null)
      else frame = window.requestAnimationFrame(animate)
    }
    const onVisibility = () => { if (document.hidden) setStartTime(null) }
    document.addEventListener('visibilitychange', onVisibility)
    frame = window.requestAnimationFrame(animate)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [active, editing, duration, startTime])

  if (!timeline) return <p className="map-empty" role="status">このマップは敵の位置を推定できません。</p>
  const { fragmentStarts, spawns } = timeline
  const spawnedCount = spawns.filter(spawn => spawn.start <= seconds).length
  const currentFragment = fragmentStarts.reduce((current, start, i) => start <= seconds ? i : current, -1)
  const rows = detail.grid.length
  const columns = detail.grid[0].length
  const { cells, moving, waiting, hidden } = groupPositions(getTdEnemyPositions(timeline, seconds), excluded, rows)
  const selected = selectedCell === null ? undefined : cells.get(selectedCell)
  const selectedDetail = selected && selected.total > 1
    ? `上から${selected.y + 1}行・左から${selected.x + 1}列　${breakdown(selected, kinds)}` : null
  const visibleKinds = [...kinds].filter(([id]) => !excluded.has(id))
  const selectionName = excluded.size === 0 ? '全敵' : visibleKinds.map(([, kind]) => kind.name).join('・') || '敵未選択'
  function seek(second: number) {
    setStartTime(null)
    setSeconds(Math.min(duration, Math.max(0, second)))
    setSelectedCell(null)
  }
  function togglePlayback() {
    if (playing) { setStartTime(null); return }
    const from = seconds >= duration ? 0 : seconds
    setSeconds(from)
    setSelectedCell(null)
    setStartTime(performance.now() - from * 1000)
  }
  function toggleEnemy(id: string) {
    setExcluded(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setSelectedCell(null)
  }
  return <div className="td-time-panel">
    <div className="td-time-heading td-time-clock">
      <div><label htmlFor={sliderId}>マップ開始から</label>{' '}
        <output htmlFor={sliderId} aria-live="off">{displayedSecond} 秒</output></div>
      {currentFragment >= 0 && <span>区間{currentFragment + 1}の開始から {Math.floor(seconds - fragmentStarts[currentFragment])} 秒</span>}
    </div>
    <div className="td-time-controls" hidden={editing}>
      <div className="td-time-transport">
        <button type="button" className="button secondary" disabled={duration === 0}
          onClick={togglePlayback}>{playing ? '一時停止' : '再生'}</button>
        <div className="td-time-seek">
          <button type="button" className="button secondary" aria-label="1秒戻す"
            disabled={displayedSecond === 0} onClick={() => seek(displayedSecond - 1)}>−1秒</button>
          <div className="td-time-range">
            <input id={sliderId} type="range" min={0} max={duration} step={1} value={displayedSecond}
              aria-valuetext={`${displayedSecond}秒`} onChange={event => seek(event.currentTarget.valueAsNumber)} />
            <div className="td-time-fragment-ticks" aria-hidden="true">
              {fragmentStarts.map((start, i) => <span key={i} style={{ left: `${duration ? 100 * start / duration : 0}%` }} />)}
            </div>
            <div className="td-time-limits" aria-hidden="true"><span>0 秒</span><span>{duration} 秒</span></div>
          </div>
          <button type="button" className="button secondary" aria-label="1秒進める"
            disabled={displayedSecond === duration} onClick={() => seek(displayedSecond + 1)}>＋1秒</button>
        </div>
      </div>
      <div className="map-wave-fragments td-time-fragments" role="group" aria-label="区間の先頭に移動">
        {fragmentStarts.map((start, i) => <button key={i} type="button" aria-pressed={currentFragment === i}
          onClick={() => seek(start)}>
          <span>区間{i + 1}</span><small>{start.toLocaleString('ja-JP')} 秒</small>
        </button>)}
      </div>
      <div className="td-time-progress">
        <div className="td-time-heading">
          <span>出現済み <strong>{spawnedCount} / {spawns.length}体</strong></span>
          <span>未出現 <strong>{spawns.length - spawnedCount}体</strong></span>
        </div>
        <progress aria-label="敵の出現進捗" value={spawnedCount} max={spawns.length}
          aria-valuetext={`全${spawns.length}体のうち${spawnedCount}体が出現済み`} />
      </div>
      <div className="td-time-heading"><span>表示する敵</span>
        <button type="button" className="button secondary" disabled={excluded.size === 0}
          onClick={() => { setExcluded(new Set()); setSelectedCell(null) }}>全種を表示</button></div>
      <div className="td-time-filters" role="group" aria-label="表示する敵">
        {[...kinds].map(([id, kind]) => <label key={id}>
          <input type="checkbox" checked={!excluded.has(id)} onChange={() => toggleEnemy(id)} />
          <span className="td-time-key" style={{ background: kind.color }} aria-hidden="true">{kind.letter}</span>
          {kind.name}
        </label>)}
      </div>
    </div>
    <TdMapImage map={map} filenameParts={['時間別の位置', `${displayedSecond}秒`, selectionName]}
      caption={`マップ開始から ${displayedSecond} 秒${currentFragment >= 0 ? ` · 区間${currentFragment + 1}` : ''}`}
      onOpen={() => setStartTime(null)}
      imageDetails={<div className="td-time-image-details">
        <div className="td-time-image-legend">
          {visibleKinds.length === 0 ? '表示する敵が未選択' : visibleKinds.map(([id, kind]) =>
            <span key={id}><span className="td-time-key" style={{ background: kind.color }}>{kind.letter}</span>{kind.name}</span>)}
        </div>
        <div>出現済み {spawnedCount} / {spawns.length}体　未出現 {spawns.length - spawnedCount}体　地図上 {moving + waiting}体</div>
        {selectedDetail && <div>{selectedDetail}</div>}
        <div>推定位置 · ブロック・減速・撃破なし</div>
      </div>}>
      <TdDeploymentBoard detail={detail} name={`${map.code} 時間別の位置`} showEntranceLabels={false} boardOverlay={
        [...cells].map(([key, cell]) => <CellMarker key={key} cell={cell} rows={rows} columns={columns} kinds={kinds}
          expanded={key === selectedCell} onSelect={() => {
            setStartTime(null)
            setSelectedCell(current => current === key ? null : key)
          }} />)
      } />
    </TdMapImage>
    {!editing && <div className="td-time-footer"><strong aria-live={playing ? 'off' : 'polite'}>
      {excluded.size === kinds.size ? '表示する敵が未選択' : <>
        地図上 {moving + waiting}体　移動 {moving}・待機 {waiting}{hidden > 0 && `　消失中 ${hidden}`}
      </>}
    </strong><span>推定位置 · ブロック・減速・撃破なし</span></div>}
    {!editing && selectedDetail && <p className="td-time-detail" role="status">{selectedDetail}</p>}
  </div>
}
