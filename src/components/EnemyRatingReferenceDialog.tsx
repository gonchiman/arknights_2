import { useEffect, useId, useRef, useState } from 'react'
import { ENEMY_RATING_STATS, type EnemyRatingStat } from '../lib/enemyStatRatings'
import { lockPageScroll } from '../lib/pageScrollLock'
import { EnemyRatingReferenceTable } from './EnemyRatingReferenceTable'
import { EnemyRatingImageSaveDialog } from './EnemyRatingImageSaveDialog'
import './EnemyRatingReferenceDialog.css'

export function EnemyRatingReferenceDialog({
  onClose,
  initialStat = 'magicResistance',
  context = 'database',
}: {
  onClose: () => void
  initialStat?: EnemyRatingStat
  context?: 'database' | 'histogram'
}) {
  const [stat, setStat] = useState<EnemyRatingStat>(initialStat)
  const [imageSaveOpen, setImageSaveOpen] = useState(false)
  const [imageStats, setImageStats] = useState<EnemyRatingStat[]>([initialStat])
  const [saveStatus, setSaveStatus] = useState('')
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
    const unlockScroll = lockPageScroll(document.documentElement)

    return () => {
      window.cancelAnimationFrame(focusFrame)
      unlockScroll()
      if (dialog.open) dialog.close()
    }
  }, [])

  return (
    <><dialog
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
          <div className="enemy-rating-reference-actions">
            <button type="button" onClick={() => {
              setImageStats([stat])
              setSaveStatus('')
              setImageSaveOpen(true)
            }}>画像を保存</button>
            <button ref={closeRef} type="button" aria-label="評価基準を閉じる" onClick={onClose}>閉じる</button>
          </div>
        </header>
        <div className="enemy-rating-reference-body" tabIndex={0} role="region" aria-label="評価基準の内容">
          <div className="enemy-rating-stat-picker">
            <label htmlFor={statId}>項目</label>
            <select id={statId} value={stat} onChange={(event) => {
              setStat(event.target.value as EnemyRatingStat)
              setSaveStatus('')
            }}>
              {ENEMY_RATING_STATS.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
            </select>
          </div>
          <span className="visually-hidden" role="status">{saveStatus}</span>
          <EnemyRatingReferenceTable stat={stat} />
          <div className="enemy-rating-reference-notes">
            {context === 'histogram' ? (
              <>
                <p>このサイトでは基礎ステータスの実数値から換算します。ステージ固有の補正は含みません。</p>
                <p>ヒストグラムではE〜SSの評価ごとに集計します。対象項目のデータがない敵は、評価別の集計から除外します。</p>
              </>
            ) : (
              <>
                <p>このサイトでは基礎ステータスの実数値から換算します。ステージ固有の補正は含みません。並べ替えも実数値が基準です。</p>
                <p>データがない場合は「—」と表示します。</p>
              </>
            )}
          </div>
        </div>
      </div>
    </dialog>
    {imageSaveOpen && <EnemyRatingImageSaveDialog stats={imageStats} onStatsChange={setImageStats}
      onClose={() => setImageSaveOpen(false)} onSaved={setSaveStatus} />}
    </>
  )
}
