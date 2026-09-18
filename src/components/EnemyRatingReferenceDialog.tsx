import { useEffect, useId, useRef, useState } from 'react'
import { ENEMY_RATING_STATS, getEnemyRatingRanges, type EnemyRatingStat } from '../lib/enemyStatRatings'
import './EnemyRatingReferenceDialog.css'

export function EnemyRatingReferenceDialog({ onClose }: { onClose: () => void }) {
  const [stat, setStat] = useState<EnemyRatingStat>('magicResistance')
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const backdropPointerDownRef = useRef(false)
  const titleId = useId()
  const statId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (!dialog.open) dialog.showModal()
    const focusFrame = window.requestAnimationFrame(() => closeRef.current?.focus())
    const previousOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'

    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.documentElement.style.overflow = previousOverflow
      if (dialog.open) dialog.close()
    }
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className="enemy-rating-dialog"
      aria-labelledby={titleId}
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onPointerDown={(event) => {
        backdropPointerDownRef.current = event.target === event.currentTarget
      }}
      onPointerCancel={() => { backdropPointerDownRef.current = false }}
      onClick={(event) => {
        if (backdropPointerDownRef.current && event.target === event.currentTarget) onClose()
        backdropPointerDownRef.current = false
      }}
    >
      <div className="enemy-rating-reference">
        <header className="enemy-rating-reference-header">
          <h2 id={titleId}>評価基準</h2>
          <button ref={closeRef} type="button" aria-label="評価基準を閉じる" onClick={onClose}>閉じる</button>
        </header>
        <div className="enemy-rating-reference-body" tabIndex={0} role="region" aria-label="評価基準の内容">
          <div className="enemy-rating-stat-picker">
            <label htmlFor={statId}>項目</label>
            <select id={statId} value={stat} onChange={(event) => setStat(event.target.value as EnemyRatingStat)}>
              {ENEMY_RATING_STATS.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
            </select>
          </div>
          <table className="enemy-rating-reference-table" aria-label={`${ENEMY_RATING_STATS.find(({ key }) => key === stat)!.label}の評価基準`}>
            <thead>
              <tr><th scope="col">評価</th><th scope="col">実数値の範囲</th></tr>
            </thead>
            <tbody>
              {getEnemyRatingRanges(stat).map(({ rating, label }) => (
                <tr key={rating}><th scope="row">{rating}</th><td>{label}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="enemy-rating-reference-notes">
            <p>このサイトでは基礎ステータスの実数値から換算します。ステージ固有の補正は含みません。並べ替えも実数値が基準です。</p>
            <p>データがない場合は「—」と表示します。</p>
          </div>
        </div>
      </div>
    </dialog>
  )
}
