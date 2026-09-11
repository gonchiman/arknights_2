import { useContext, useEffect, useState } from 'react'
import { PanelStateScope } from './PanelStateScope'
import { getPanelStorageKey, readPanelOpen, writePanelOpen } from './panelPreferences'

export function usePanelOpen(panelId: string, defaultOpen = true) {
  const pageId = useContext(PanelStateScope)
  const key = getPanelStorageKey(pageId, panelId)
  const [state, setState] = useState(() => ({ key, open: readPanelOpen(key, defaultOpen) }))
  // A reused component must read its new identity before displaying a previous panel's state.
  const open = state.key === key ? state.open : readPanelOpen(key, defaultOpen)

  useEffect(() => {
    setState((previous) => previous.key === key ? previous : { key, open: readPanelOpen(key, defaultOpen) })
  }, [key, defaultOpen])

  const setOpen = (nextOpen: boolean) => {
    setState({ key, open: nextOpen })
    writePanelOpen(key, nextOpen)
  }
  return [open, setOpen] as const
}
