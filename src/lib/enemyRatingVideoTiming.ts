export const ENEMY_RATING_VIDEO_PHASES = ['title', 'axes', 'ranks', 'bars', 'values'] as const
export type EnemyRatingVideoPhase = typeof ENEMY_RATING_VIDEO_PHASES[number]
export const ENEMY_RATING_VIDEO_PHASE_TEMPOS = [1, 2, 3, 4, 5] as const
export type EnemyRatingVideoPhaseTempo = typeof ENEMY_RATING_VIDEO_PHASE_TEMPOS[number]
export type EnemyRatingVideoTimingField = EnemyRatingVideoPhase | 'hold'
export const ENEMY_RATING_VIDEO_TEMPOS = [
  'veryShort', 'short', 'mediumShort', 'standard', 'mediumSlow', 'slow', 'verySlow', 'slow12', 'slow15', 'slow20',
] as const
export type EnemyRatingVideoTempo = typeof ENEMY_RATING_VIDEO_TEMPOS[number]
export const ENEMY_RATING_VIDEO_TEMPO_SECONDS = {
  veryShort: 2.5,
  short: 3.5,
  mediumShort: 4,
  standard: 5,
  mediumSlow: 6,
  slow: 7,
  verySlow: 10,
  slow12: 12,
  slow15: 15,
  slow20: 20,
} as const satisfies Record<EnemyRatingVideoTempo, number>
export const ENEMY_RATING_VIDEO_TEXT_MODES = ['fade', 'instant', 'stagger'] as const
export type EnemyRatingVideoTextMode = typeof ENEMY_RATING_VIDEO_TEXT_MODES[number]
export type EnemyRatingVideoShapeMode = 'grow' | 'stagger'

interface VideoPhaseTiming {
  start: number
  duration: number
}

export type EnemyRatingVideoTiming = Readonly<Record<EnemyRatingVideoPhase, Readonly<VideoPhaseTiming>> & {
  hold: number
  textMode: EnemyRatingVideoTextMode
  shapeMode: EnemyRatingVideoShapeMode
}>
export interface EnemyRatingVideoTimingDraft {
  order: EnemyRatingVideoPhase[]
  tempo: EnemyRatingVideoTempo
  phaseTempos?: Partial<Record<EnemyRatingVideoPhase, EnemyRatingVideoPhaseTempo>>
  finishSeconds: string
  overrides: Partial<Record<EnemyRatingVideoTimingField, string>>
  textMode: EnemyRatingVideoTextMode
  shapeMode: EnemyRatingVideoShapeMode
}

// The renderer describes each mark using its original position within these phase windows.
const ORIGINAL_PHASE_TIMING: Record<EnemyRatingVideoPhase, VideoPhaseTiming> = {
  title: { start: .04, duration: .38 },
  axes: { start: .42, duration: .68 },
  ranks: { start: .98, duration: .495 },
  bars: { start: 1.37, duration: .88 },
  values: { start: 2.22, duration: 1.205 },
}

const ORIGINAL_DRAWING_SECONDS = ENEMY_RATING_VIDEO_PHASES.reduce((sum, phase) => sum + ORIGINAL_PHASE_TIMING[phase].duration, 0)
const TIMING_FIELDS = [...ENEMY_RATING_VIDEO_PHASES, 'hold'] as const
const PHASE_TEMPO_WEIGHTS: Record<EnemyRatingVideoPhaseTempo, number> = { 1: .4, 2: .65, 3: 1, 4: 1.5, 5: 2.25 }

export function getEnemyRatingVideoDefaultDuration(field: EnemyRatingVideoTimingField, tempo: EnemyRatingVideoTempo) {
  if (field === 'hold') return 0
  return ORIGINAL_PHASE_TIMING[field].duration / ORIGINAL_DRAWING_SECONDS * ENEMY_RATING_VIDEO_TEMPO_SECONDS[tempo]
}

export function createEnemyRatingVideoTimingDraft(): EnemyRatingVideoTimingDraft {
  return { order: [...ENEMY_RATING_VIDEO_PHASES], tempo: 'standard', finishSeconds: '', overrides: {},
    textMode: 'stagger', shapeMode: 'stagger' }
}

export function getEnemyRatingVideoTimingBounds(timing: EnemyRatingVideoTiming) {
  const finish = Math.max(...ENEMY_RATING_VIDEO_PHASES.map(phase => timing[phase].start + timing[phase].duration))
  return { finish, duration: finish + timing.hold }
}

export type ParsedEnemyRatingVideoTiming =
  | { timing: EnemyRatingVideoTiming; finish: number; duration: number; error: null }
  | { timing: null; finish: null; duration: null; error: string }

export function parseEnemyRatingVideoTiming(draft: EnemyRatingVideoTimingDraft): ParsedEnemyRatingVideoTiming {
  const orderedPhases = new Set(draft.order)
  if (draft.order.length !== ENEMY_RATING_VIDEO_PHASES.length ||
      ENEMY_RATING_VIDEO_PHASES.some(phase => !orderedPhases.has(phase))) {
    return { timing: null, finish: null, duration: null, error: '表示順を確認してください。' }
  }

  const requestedFinish = draft.finishSeconds.trim()
  const durations = {} as Record<EnemyRatingVideoTimingField, number>
  const automatic: EnemyRatingVideoPhase[] = []
  let fixedDrawingTime = 0
  for (const field of TIMING_FIELDS) {
    const override = draft.overrides[field]?.trim()
    if (!override) {
      durations[field] = getEnemyRatingVideoDefaultDuration(field, requestedFinish ? 'standard' : draft.tempo)
      if (field !== 'hold') automatic.push(field)
      continue
    }
    const seconds = Number(override)
    if (!Number.isFinite(seconds) || seconds < 0) {
      return { timing: null, finish: null, duration: null, error: '0以上の秒数を入力してください。' }
    }
    durations[field] = seconds
    if (field !== 'hold') fixedDrawingTime += seconds
  }

  let automaticDrawingTime = automatic.reduce((sum, phase) => sum + durations[phase], 0)
  if (requestedFinish) {
    const target = Number(requestedFinish)
    if (!Number.isFinite(target) || target <= 0) {
      return { timing: null, finish: null, duration: null, error: '描画完了までの時間は0秒より長くしてください。' }
    }
    const remaining = target - fixedDrawingTime
    const tolerance = Number.EPSILON * 8 * Math.max(target, fixedDrawingTime)
    if (!Number.isFinite(fixedDrawingTime) || remaining < -tolerance) {
      return { timing: null, finish: null, duration: null, error: '個別に指定した描画時間の合計以上を入力してください。' }
    }
    if (automatic.length === 0 && remaining > tolerance) {
      return { timing: null, finish: null, duration: null, error: 'すべての描画時間を指定している場合は、その合計を入力してください。' }
    }
    automaticDrawingTime = Math.max(0, remaining)
  }

  if (requestedFinish || automatic.some(phase => (draft.phaseTempos?.[phase] ?? 3) !== 3)) {
    // Keep explicitly timed phases and distribute the time available for automatic phases.
    const weights = automatic.map(phase => durations[phase] * PHASE_TEMPO_WEIGHTS[draft.phaseTempos?.[phase] ?? 3])
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)
    let usedWeight = 0
    let start = 0
    for (const [index, phase] of automatic.entries()) {
      usedWeight += weights[index]
      const end = usedWeight / totalWeight * automaticDrawingTime
      durations[phase] = end - start
      start = end
    }
  }

  const phases = {} as Record<EnemyRatingVideoPhase, VideoPhaseTiming>
  let start = 0
  for (const phase of draft.order) {
    const duration = durations[phase]
    phases[phase] = { start, duration }
    start += duration
  }
  const timing = { ...phases, hold: durations.hold, textMode: draft.textMode, shapeMode: draft.shapeMode }
  const bounds = getEnemyRatingVideoTimingBounds(timing)
  if (!Number.isFinite(bounds.duration) || bounds.duration <= 0) {
    return { timing: null, finish: null, duration: null, error: '動画全体には0秒より長い時間を指定してください。' }
  }
  return { timing, ...bounds, error: null }
}

/** Preserve the relative order and easing of the individual marks within a phase. */
export function retimeEnemyRatingVideoStep(
  timing: EnemyRatingVideoTiming,
  phase: EnemyRatingVideoPhase,
  start: number,
  duration: number,
): VideoPhaseTiming {
  const original = ORIGINAL_PHASE_TIMING[phase]
  const target = timing[phase]
  if (target.start === original.start && target.duration === original.duration) return { start, duration }
  const offset = (start - original.start) / original.duration
  return { start: target.start + offset * target.duration, duration: duration / original.duration * target.duration }
}

export function retimeEnemyRatingVideoText(
  timing: EnemyRatingVideoTiming,
  phase: EnemyRatingVideoPhase,
  start: number,
  duration: number,
): VideoPhaseTiming {
  if (timing.textMode === 'instant') return { start: timing[phase].start, duration: 0 }
  const text = retimeEnemyRatingVideoStep(timing, phase, start, duration)
  return timing.textMode === 'stagger' ? { start: text.start, duration: 0 } : text
}
