import type { ReactNode } from 'react'
import './EnemyFilterPanel.css'

export function EnemyFilterPanel({ children }: { children: ReactNode }) {
  return <div className="damage-build-navigation enemy-filter-compact" role="region" aria-label="敵の絞り込み">
    {children}
  </div>
}
