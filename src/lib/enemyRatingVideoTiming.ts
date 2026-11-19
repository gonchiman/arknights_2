export const ENEMY_RATING_VIDEO_PHASES = ['title', 'axes', 'ranks', 'bars', 'values'] as const
export type EnemyRatingVideoPhase = typeof ENEMY_RATING_VIDEO_PHASES[number]
export const ENEMY_RATING_VIDEO_PHASE_TEMPOS = [1, 2, 3, 4, 5] as const
export type EnemyRatingVideoPhaseTempo = typeof ENEMY_RATING_VIDEO_PHASE_TEMPOS[number]
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
export type EnemyRatingVideoGuideMode = 'grow' | 'stagger'
export type EnemyRatingVideoBarMode = EnemyRatingVideoGuideMode | 'staggerGrow'

interface VideoPhaseTiming {
  start: number
  duration: number
}

export type ChartVideoTimingField<Phase extends string> = Phase | 'hold'

export interface ChartVideoTimingDefinition<Phase extends string> {
  phases: readonly Phase[]
  weights: Readonly<Record<Phase, number>>
}

export type ChartVideoTiming<Phase extends string> = Readonly<Record<Phase, Readonly<VideoPhaseTiming>> & {
  hold: number
  textMode: EnemyRatingVideoTextMode
  barMode: EnemyRatingVideoBarMode
  guideMode: EnemyRatingVideoGuideMode
}>

export interface ChartVideoTimingDraft<Phase extends string> {
  order: Phase[]
  animatedPhase?: Phase
  tempo: EnemyRatingVideoTempo
  phaseTempos?: Partial<Record<Phase, EnemyRatingVideoPhaseTempo>>
  finishSeconds: string
  overrides: Partial<Record<ChartVideoTimingField<Phase>, string>>
  textMode: EnemyRatingVideoTextMode
  barMode: EnemyRatingVideoBarMode
  guideMode: EnemyRatingVideoGuideMode
}

export type EnemyRatingVideoTimingField = ChartVideoTimingField<EnemyRatingVideoPhase>
export type EnemyRatingVideoTiming = ChartVideoTiming<EnemyRatingVideoPhase>
export type EnemyRatingVideoTimingDraft = ChartVideoTimingDraft<EnemyRatingVideoPhase>

// The renderer describes each mark using its original position within these phase windows.
const ORIGINAL_PHASE_TIMING: Record<EnemyRatingVideoPhase, VideoPhaseTiming> = {
  title: { start: .04, duration: .38 },
  axes: { start: .42, duration: .68 },
  ranks: { start: .98, duration: .495 },
  bars: { start: 1.37, duration: .88 },
  values: { start: 2.22, duration: 1.205 },
}

export const ENEMY_RATING_VIDEO_DEFINITION: ChartVideoTimingDefinition<EnemyRatingVideoPhase> = {
  phases: ENEMY_RATING_VIDEO_PHASES,
  weights: Object.fromEntries(ENEMY_RATING_VIDEO_PHASES.map(phase => [phase, ORIGINAL_PHASE_TIMING[phase].duration])) as Record<EnemyRatingVideoPhase, number>,
}

const PHASE_TEMPO_WEIGHTS: Record<EnemyRatingVideoPhaseTempo, number> = { 1: .4, 2: .65, 3: 1, 4: 1.5, 5: 2.25 }

export function getChartVideoDefaultDuration<Phase extends string>(
  field: ChartVideoTimingField<Phase>,
  tempo: EnemyRatingVideoTempo,
  definition: ChartVideoTimingDefinition<Phase>,
): number {
  if (field === 'hold') return 0
  const totalWeight = definition.phases.reduce((sum, phase) => sum + definition.weights[phase], 0)
  return definition.weights[field] / totalWeight * ENEMY_RATING_VIDEO_TEMPO_SECONDS[tempo]
}

export function getEnemyRatingVideoDefaultDuration(field: EnemyRatingVideoTimingField, tempo: EnemyRatingVideoTempo) {
  return getChartVideoDefaultDuration(field, tempo, ENEMY_RATING_VIDEO_DEFINITION)
}

export function createChartVideoTimingDraft<Phase extends string>(
  definition: ChartVideoTimingDefinition<Phase>,
): ChartVideoTimingDraft<Phase> {
  return { order: [...definition.phases], tempo: 'standard', finishSeconds: '', overrides: {},
    textMode: 'stagger', barMode: 'stagger', guideMode: 'stagger' }
}

export function createEnemyRatingVideoTimingDraft(): EnemyRatingVideoTimingDraft {
  return createChartVideoTimingDraft(ENEMY_RATING_VIDEO_DEFINITION)
}

export function getChartVideoTimingBounds<Phase extends string>(
  timing: ChartVideoTiming<Phase>,
  definition: ChartVideoTimingDefinition<Phase>,
) {
  const finish = Math.max(...definition.phases.map(phase => timing[phase].start + timing[phase].duration))
  return { finish, duration: finish + timing.hold }
}

export function getEnemyRatingVideoTimingBounds(timing: EnemyRatingVideoTiming) {
  return getChartVideoTimingBounds(timing, ENEMY_RATING_VIDEO_DEFINITION)
}

export type ParsedChartVideoTiming<Phase extends string> =
  | { timing: ChartVideoTiming<Phase>; finish: number; duration: number; error: null }
  | { timing: null; finish: null; duration: null; error: string }

export type ParsedEnemyRatingVideoTiming = ParsedChartVideoTiming<EnemyRatingVideoPhase>

export function parseChartVideoTiming<Phase extends string>(
  draft: ChartVideoTimingDraft<Phase>,
  definition: ChartVideoTimingDefinition<Phase>,
): ParsedChartVideoTiming<Phase> {
  const orderedPhases = new Set(draft.order)
  if (draft.order.length !== definition.phases.length ||
      definition.phases.some(phase => !orderedPhases.has(phase))) {
    return { timing: null, finish: null, duration: null, error: '表示順を確認してください。' }
  }
  if (draft.animatedPhase !== undefined && !definition.phases.includes(draft.animatedPhase)) {
    return { timing: null, finish: null, duration: null, error: '描画対象を確認してください。' }
  }
  const timingDefinition = draft.animatedPhase === undefined ? definition
    : { ...definition, phases: [draft.animatedPhase] }

  const requestedFinish = draft.finishSeconds.trim()
  const durations = {} as Record<ChartVideoTimingField<Phase>, number>
  const automatic: Phase[] = []
  let fixedDrawingTime = 0
  for (const field of [...definition.phases, 'hold' as const]) {
    if (field !== 'hold' && draft.animatedPhase !== undefined && field !== draft.animatedPhase) {
      durations[field] = 0
      continue
    }
    const override = draft.overrides[field]?.trim()
    if (!override) {
      durations[field] = getChartVideoDefaultDuration(field, requestedFinish ? 'standard' : draft.tempo, timingDefinition)
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

  const phases = {} as Record<Phase, VideoPhaseTiming>
  let start = 0
  for (const phase of draft.order) {
    const duration = durations[phase]
    const instant = draft.animatedPhase !== undefined && phase !== draft.animatedPhase
    phases[phase] = { start: instant ? 0 : start, duration }
    start += duration
  }
  const timing = { ...phases, hold: durations.hold, textMode: draft.textMode,
    barMode: draft.barMode, guideMode: draft.guideMode }
  const bounds = getChartVideoTimingBounds(timing, definition)
  if (!Number.isFinite(bounds.duration) || bounds.duration <= 0) {
    return { timing: null, finish: null, duration: null, error: '動画全体には0秒より長い時間を指定してください。' }
  }
  return { timing, ...bounds, error: null }
}

export function parseEnemyRatingVideoTiming(draft: EnemyRatingVideoTimingDraft): ParsedEnemyRatingVideoTiming {
  return parseChartVideoTiming(draft, ENEMY_RATING_VIDEO_DEFINITION)
}

export function createEnemyRatingBarsOnlyDraft(draft: EnemyRatingVideoTimingDraft): EnemyRatingVideoTimingDraft | null {
  const parsed = parseEnemyRatingVideoTiming(draft)
  if (!parsed.timing) return null
  return {
    ...draft,
    order: [...draft.order.filter(phase => phase !== 'bars'), 'bars'],
    animatedPhase: 'bars',
    phaseTempos: draft.phaseTempos && { ...draft.phaseTempos },
    finishSeconds: parsed.finish > 0 ? String(parsed.finish) : '',
    overrides: {
      title: '0', axes: '0', ranks: '0', values: '0',
      ...(draft.overrides.hold !== undefined ? { hold: draft.overrides.hold } : {}),
      ...(parsed.finish === 0 ? { bars: '0' } : {}),
    },
    textMode: 'instant',
    barMode: 'grow',
    guideMode: 'stagger',
  }
}

export function getEnemyRatingVideoBarStep(
  { bars, barMode }: EnemyRatingVideoTiming,
  rankIndex: number,
  rankCount: number,
): VideoPhaseTiming {
  if (barMode === 'grow') return bars
  if (barMode === 'stagger') {
    const fraction = rankIndex / Math.max(rankCount - 1, 1)
    return { start: bars.start + fraction * bars.duration, duration: 0 }
  }
  const duration = bars.duration / rankCount
  return { start: bars.start + rankIndex * duration, duration }
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
