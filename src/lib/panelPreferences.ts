type PanelStorage = Pick<Storage, 'getItem' | 'setItem'>

const targetSwitchPanels: Record<string, string> = {
  'ggs-output': 'conditions',
  'ggs-results-panel': 'results',
  'ggs-grid-panel': 'grid',
  'ggs-chart-panel': 'chart',
  'ggs-trial-panel': 'trial',
}

export function getPanelStorageKey(pageId: string, panelId: string): string {
  if (pageId === 'goldenglow-target-switch' && Object.hasOwn(targetSwitchPanels, panelId)) {
    return `arknights-goldenglow-target-switch-panel-${targetSwitchPanels[panelId]}-open-v1`
  }
  return `arknights-panel-open-v1:${encodeURIComponent(pageId)}:${encodeURIComponent(panelId)}`
}

function localStorageOrUndefined(): PanelStorage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

export function readPanelOpen(key: string, defaultOpen: boolean, storage = localStorageOrUndefined()): boolean {
  try {
    const value = storage?.getItem(key)
    return value === 'true' ? true : value === 'false' ? false : defaultOpen
  } catch {
    return defaultOpen
  }
}

export function writePanelOpen(key: string, open: boolean, storage = localStorageOrUndefined()): void {
  try {
    storage?.setItem(key, String(open))
  } catch {
    // A blocked or full browser store must not prevent opening and closing panels.
  }
}
