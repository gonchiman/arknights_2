import { useEffect, useState } from 'react'

type PanelId = 'conditions' | 'results' | 'grid' | 'chart' | 'trial'

export function useGoldenglowTargetSwitchPanelOpen(panelId: PanelId) {
  const storageKey = `arknights-goldenglow-target-switch-panel-${panelId}-open-v1`
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined') return true
    try {
      // 未保存・不正な保存値の場合は、従来どおり開いて表示する。
      return window.localStorage.getItem(storageKey) !== 'false'
    } catch {
      return true
    }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, String(open))
    } catch {
      // 保存できない環境でも、その画面での開閉は使えるようにする。
    }
  }, [storageKey, open])

  return [open, setOpen] as const
}
