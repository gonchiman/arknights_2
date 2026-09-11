import type { ReactNode } from 'react'
import './EnemyFilterPanel.css'

export function EnemyFilterPanel({ children, sharedSettings }: { children: ReactNode; sharedSettings: ReactNode }) {
  return <div className="damage-build-navigation enemy-filter-compact" role="region" aria-label="敵の絞り込み・統計設定">
    {children}
    {sharedSettings}
  </div>
}
