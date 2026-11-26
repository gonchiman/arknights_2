import type { ReactNode } from 'react'
import { ElementLocationCopyButton } from './ElementLocationCopyButton'
import { PersistentDetails } from './PersistentDetails'

export function EnemyDataContent({ loading, error, onRetry, children }: {
  loading: boolean
  error: string | null
  onRetry: () => void
  children: ReactNode
}) {
  if (loading) {
    return <div className="enemy-load-state" role="status">敵データを読み込んでいます…</div>
  }

  if (error) {
    return (
      <div className="enemy-load-state" role="alert">
        <strong>敵データを読み込めませんでした</strong>
        <span>{error}</span>
        <button type="button" className="button secondary" onClick={onRetry}>
          再読み込み
        </button>
      </div>
    )
  }

  return <>{children}</>
}

const NOTES_TITLE = 'データの範囲と表記'

export function EnemyDataNotes({ parentLocation }: { parentLocation?: readonly string[] }) {
  const notes = (
    <PersistentDetails persistenceId="enemy-data-notes" className="enemy-data-details">
      <summary>{NOTES_TITLE}<span aria-hidden="true" /></summary>
      <p className="enemy-data-note">
        登場ステージ数は通常ステージ集計（stage_table内の戦闘ステージをlevelId単位で重複除去）です。ローグライク等の別管理ステージは含みません。「—」は集計データ未取得を示します。ステージ固有の補正は基礎ステータスへ反映していません。
      </p>
    </PersistentDetails>
  )
  if (!parentLocation) return notes
  return <div className="enemy-data-notes-with-copy">
    {notes}
    <ElementLocationCopyButton segments={[...parentLocation, NOTES_TITLE]} />
  </div>
}
