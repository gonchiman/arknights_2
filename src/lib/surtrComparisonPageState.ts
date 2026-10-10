import {
  SURTR_DPS_PAGE_STATE_KEY, createDefaultSurtrDpsPageState, parseSurtrDpsPageState,
  type SurtrDpsPageState,
} from './surtrDpsPageState.ts'

export const SURTR_COMPARISON_PAGE_STATE_KEY = 'arknights-surtr-comparison-page-state-v1'

/** Comparison inputs are independent from the graph after the first visit. */
export type SurtrComparisonPageState = Pick<SurtrDpsPageState,
  'settings' | 'excluded' | 'moduleLevels' | 'resistanceRange' | 'precision' | 'selectedResistance'
  | 'unequippedLayout' | 'unequippedMetric' | 'unequippedComparisonBase' | 'unequippedStep'
  | 'unequippedRankMode' | 'unequippedColumnOrder' | 'unequippedColorScale' | 'unequippedColorScaleMode'
> & { unequippedPotentials: number[] }

function fromDpsState(state: SurtrDpsPageState): SurtrComparisonPageState {
  return {
    settings: { ...state.settings, blocking: false },
    excluded: [...state.excluded],
    moduleLevels: Object.fromEntries(Object.entries(state.moduleLevels).map(([id, levels]) => [id, [...levels]])),
    resistanceRange: { ...state.resistanceRange }, precision: state.precision, selectedResistance: state.selectedResistance,
    unequippedLayout: state.unequippedLayout, unequippedMetric: state.unequippedMetric,
    unequippedComparisonBase: state.unequippedComparisonBase,
    unequippedPotentials: [...(state.unequippedPotentials ?? [state.settings.potential])],
    unequippedStep: state.unequippedStep, unequippedRankMode: state.unequippedRankMode,
    unequippedColumnOrder: state.unequippedColumnOrder, unequippedColorScale: state.unequippedColorScale,
    unequippedColorScaleMode: state.unequippedColorScaleMode,
  }
}

function comparisonDpsDefaults(): SurtrDpsPageState {
  return {
    ...createDefaultSurtrDpsPageState(),
    unequippedLayout: 'comparison', unequippedColumnOrder: 'blocking', unequippedMetric: 'percent',
    unequippedStep: 20, unequippedRankMode: 'merged',
  }
}

export function createDefaultSurtrComparisonPageState(): SurtrComparisonPageState {
  return fromDpsState(comparisonDpsDefaults())
}

/** Reuse the existing validated settings and table options rather than adding a second validator. */
export function parseSurtrComparisonPageState(value: unknown): SurtrComparisonPageState {
  return fromDpsState(parseSurtrDpsPageState(value, comparisonDpsDefaults()))
}

export function readSurtrComparisonPageState(storage: Pick<Storage, 'getItem'> | undefined = sessionStorageOrUndefined()): SurtrComparisonPageState {
  try {
    const saved = storage?.getItem(SURTR_COMPARISON_PAGE_STATE_KEY)
    // A present comparison key always wins, including an intentionally empty selection.
    if (saved !== null && saved !== undefined) return parseSurtrComparisonPageState(JSON.parse(saved))
    const legacy = storage?.getItem(SURTR_DPS_PAGE_STATE_KEY)
    return parseSurtrComparisonPageState(legacy ? JSON.parse(legacy) : null)
  } catch {
    return createDefaultSurtrComparisonPageState()
  }
}

export function writeSurtrComparisonPageState(state: SurtrComparisonPageState, storage: Pick<Storage, 'setItem'> | undefined = sessionStorageOrUndefined()): void {
  try {
    storage?.setItem(SURTR_COMPARISON_PAGE_STATE_KEY, JSON.stringify(parseSurtrComparisonPageState(state)))
  } catch {
    // Restricted storage must not prevent calculation, copying or image output.
  }
}

function sessionStorageOrUndefined(): Storage | undefined {
  try { return typeof window === 'undefined' ? undefined : window.sessionStorage } catch { return undefined }
}
