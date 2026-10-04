import type { SurtrDpsSettings } from './surtrDps.ts'
import type { SurtrDpsBarStep, SurtrDpsResistanceRange } from './surtrDpsResistance.ts'
import type { SurtrDpsMetric } from './surtrDpsOutput.ts'
import { isValidSurtrDpsResistanceRange } from './surtrDpsResistance.ts'
import { isValidHpChartYAxisRange, type HpChartYAxisMode } from './goldenglowTargetSwitchHpAxis.ts'

export const SURTR_DPS_PAGE_STATE_KEY = 'arknights-surtr-dps-page-state-v1'

/** User inputs only; calculations, open dialogs and save progress are transient. */
export interface SurtrDpsPageState {
  settings: SurtrDpsSettings
  excluded: string[]
  moduleLevels: Record<string, number>
  chartKind: 'bar' | 'line'
  barStep: SurtrDpsBarStep
  resistanceRange: SurtrDpsResistanceRange
  showValues: boolean
  showResistanceRanks: boolean
  gridStyle: 'none' | 'dashed' | 'solid'
  precision: number
  metric: SurtrDpsMetric
  differenceMetric: 'difference' | 'percent'
  requestedBaselineId: string
  selectedResistance: number | null
  yAxisMode: HpChartYAxisMode
  yAxisDraft: { min: string; max: string }
}

export function createDefaultSurtrDpsPageState(): SurtrDpsPageState {
  return {
    settings: { level: 90, trust: 100, potential: 1, skillLevelIndex: 9, blocking: false },
    excluded: [], moduleLevels: {}, chartKind: 'bar', barStep: 20,
    resistanceRange: { min: 0, max: 100 }, showValues: false, showResistanceRanks: true, gridStyle: 'solid', precision: 0,
    metric: 'total', differenceMetric: 'difference', requestedBaselineId: 'none', selectedResistance: null,
    yAxisMode: 'zero', yAxisDraft: { min: '0', max: '4000' },
  }
}

/** Restore each valid field independently, without accepting UI-inaccessible options. */
export function parseSurtrDpsPageState(value: unknown): SurtrDpsPageState {
  const defaults = createDefaultSurtrDpsPageState()
  const source = object(value)
  if (!source) return defaults
  const settings = object(source.settings)
  const range = object(source.resistanceRange)
  const resistanceRange = range && typeof range.min === 'number' && typeof range.max === 'number'
    && isValidSurtrDpsResistanceRange({ min: range.min, max: range.max })
    ? { min: range.min, max: range.max } : defaults.resistanceRange
  const axis = object(source.yAxisDraft)
  const draft = { min: numericText(axis?.min, defaults.yAxisDraft.min), max: numericText(axis?.max, defaults.yAxisDraft.max) }
  const yAxisDraft = isValidHpChartYAxisRange({ min: Number(draft.min), max: Number(draft.max) })
    ? draft : defaults.yAxisDraft
  const moduleLevels = Object.fromEntries(Object.entries(object(source.moduleLevels) ?? {}).filter(([id, level]) => (
    validId(id) && integer(level, 1, 3)
  ))) as Record<string, number>
  return {
    settings: {
      level: integerOr(settings?.level, 1, 90, defaults.settings.level),
      trust: integerOr(settings?.trust, 0, 100, defaults.settings.trust),
      potential: integerOr(settings?.potential, 1, 6, defaults.settings.potential),
      skillLevelIndex: integerOr(settings?.skillLevelIndex, 0, 9, defaults.settings.skillLevelIndex),
      blocking: booleanOr(settings?.blocking, defaults.settings.blocking),
    },
    excluded: Array.isArray(source.excluded) ? [...new Set(source.excluded.filter((id): id is string => id === '' || validId(id)))] : [],
    moduleLevels,
    chartKind: option(source.chartKind, ['bar', 'line'], defaults.chartKind),
    barStep: source.barStep === 'ratings' || integer(source.barStep, 1, 100) ? source.barStep : defaults.barStep,
    resistanceRange,
    showValues: booleanOr(source.showValues, defaults.showValues),
    showResistanceRanks: booleanOr(source.showResistanceRanks, defaults.showResistanceRanks),
    gridStyle: option(source.gridStyle, ['none', 'dashed', 'solid'], defaults.gridStyle),
    precision: integerOr(source.precision, 0, 3, defaults.precision),
    metric: option(source.metric, ['total', 'difference', 'percent'], defaults.metric),
    differenceMetric: option(source.differenceMetric, ['difference', 'percent'], defaults.differenceMetric),
    requestedBaselineId: validId(source.requestedBaselineId) ? source.requestedBaselineId : defaults.requestedBaselineId,
    selectedResistance: integer(source.selectedResistance, resistanceRange.min, resistanceRange.max) ? source.selectedResistance : null,
    yAxisMode: option(source.yAxisMode, ['zero', 'auto', 'manual'], defaults.yAxisMode),
    yAxisDraft,
  }
}

export function readSurtrDpsPageState(storage: Pick<Storage, 'getItem'> | undefined = sessionStorageOrUndefined()): SurtrDpsPageState {
  try {
    const value = storage?.getItem(SURTR_DPS_PAGE_STATE_KEY)
    return parseSurtrDpsPageState(value ? JSON.parse(value) : null)
  } catch {
    return createDefaultSurtrDpsPageState()
  }
}

export function writeSurtrDpsPageState(state: SurtrDpsPageState, storage: Pick<Storage, 'setItem'> | undefined = sessionStorageOrUndefined()): void {
  try {
    storage?.setItem(SURTR_DPS_PAGE_STATE_KEY, JSON.stringify(parseSurtrDpsPageState(state)))
  } catch {
    // Storage restrictions or quota must not prevent editing and exporting.
  }
}

function sessionStorageOrUndefined(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.sessionStorage
  } catch {
    return undefined
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

function integerOr(value: unknown, min: number, max: number, fallback: number): number {
  return integer(value, min, max) ? value : fallback
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function option<T extends string | number>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? value as T : fallback
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 && value.trim() === value
    && !/[\u0000-\u001f\u007f]/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value)
}

function numericText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)) ? value.trim() : fallback
}
