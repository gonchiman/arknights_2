export type PortraitBaseline = {
  scale: number
  x: number
  y: number
  behindCaption: boolean
  coordinateSpace: 'legacy' | 'slide'
}

type PortraitBaselineStorage = Pick<Storage, 'getItem' | 'setItem'>

const STORAGE_KEY = 'arknights-slide-portrait-baseline-v2'
const LEGACY_STORAGE_KEY = 'arknights-slide-portrait-baseline-v1'

export const DEFAULT_PORTRAIT_BASELINE: Readonly<PortraitBaseline> = Object.freeze({
  scale: 165,
  x: 100,
  y: 100,
  behindCaption: true,
  coordinateSpace: 'legacy',
})

function localStorageOrUndefined(): PortraitBaselineStorage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

function isWithin(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
}

function isPortraitBaseline(value: unknown): value is PortraitBaseline {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  if (typeof candidate.behindCaption !== 'boolean') return false
  if (candidate.coordinateSpace === 'legacy') {
    return isWithin(candidate.scale, 50, 200)
      && isWithin(candidate.x, 0, 100)
      && isWithin(candidate.y, 0, 100)
  }
  return candidate.coordinateSpace === 'slide'
    && typeof candidate.scale === 'number' && Number.isFinite(candidate.scale) && candidate.scale > 0
    && typeof candidate.x === 'number' && Number.isFinite(candidate.x)
    && typeof candidate.y === 'number' && Number.isFinite(candidate.y)
}

function copyBaseline(value: PortraitBaseline): PortraitBaseline {
  return {
    scale: value.scale,
    x: value.x,
    y: value.y,
    behindCaption: value.behindCaption,
    coordinateSpace: value.coordinateSpace,
  }
}

export function readPortraitBaseline(storage = localStorageOrUndefined()): PortraitBaseline {
  try {
    const stored = storage?.getItem(STORAGE_KEY)
    if (stored !== null && stored !== undefined) {
      const value: unknown = JSON.parse(stored)
      if (isPortraitBaseline(value) && (value as PortraitBaseline & { version?: unknown }).version === 2) {
        return copyBaseline(value)
      }
    } else {
      const legacyStored = storage?.getItem(LEGACY_STORAGE_KEY)
      if (legacyStored) {
        const legacy: unknown = JSON.parse(legacyStored)
        if (legacy && typeof legacy === 'object' && !Array.isArray(legacy)) {
          const candidate = { ...legacy, coordinateSpace: 'legacy' as const }
          if ((legacy as { version?: unknown }).version === 1 && isPortraitBaseline(candidate)) {
            return copyBaseline(candidate)
          }
        }
      }
    }
  } catch {
    // Missing or blocked browser storage must not prevent editing the slide.
  }
  return copyBaseline(DEFAULT_PORTRAIT_BASELINE)
}

export function writePortraitBaseline(
  baseline: PortraitBaseline,
  storage = localStorageOrUndefined(),
): boolean {
  try {
    if (!storage || !isPortraitBaseline(baseline)) return false
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, ...copyBaseline(baseline) }))
    return true
  } catch {
    return false
  }
}
