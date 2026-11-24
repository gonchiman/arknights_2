import type { SkillRecord } from '../types/skill.ts'
import type { DamageCalculatorThreeOutput } from './damageCalculatorThree.ts'
import type { DamageThreeComparisonEntry } from './damageCalculatorThreeComparison.ts'
import { resolveDamageThreeStageDuration } from './damageCalculatorThreePeriodTotal.ts'
import { sameReviewedBlackboard, sameReviewedDescription } from './expandedCombatRegistry.ts'
import { findSkillStructure, type SkillStructure } from './skillStructure.ts'

export interface SkillDpsUptimeInput {
  entry: DamageThreeComparisonEntry
  output: DamageCalculatorThreeOutput
  skill: SkillRecord
  durationSeconds: number | null
  spCost: number | null
}

export interface SkillDpsUptimeResult {
  percentage: number | null
  reason: string | null
}

interface SkillDpsFixedCycleTiming {
  fullLockSeconds: number
  rechargeSeconds: number
  attackSeconds: number
}

type SkillDpsFixedCycleResult =
  | { timing: SkillDpsFixedCycleTiming; reason: null }
  | { timing: null; reason: string }

interface ReviewedFixedCycle {
  operatorId: string
  skillIndex: number
  skillId: string
  stageId: string
  levelIndex: number
  fullLockSeconds: number
  spCost: number
  startupSeconds: number
}

const fixed = (operatorId: string, skillIndex: number, skillId: string,
  fullLockSeconds: number, spCost: number, stageId = 'active', levelIndex = 9, startupSeconds = 0): ReviewedFixedCycle => (
  { operatorId, skillIndex, skillId, fullLockSeconds, spCost, stageId, levelIndex, startupSeconds }
)

/** Independently reviewed repeatability, not an inference from periodTotal.CONSTANT_RATE.
 * The retained JP sources, recipes and potential-1 talent profiles confirm fixed
 * skill lock, one charge, natural recovery, and no intrinsic SP-cycle modifier.
 * Initial-only SP talents (Eyja/Bagpipe) do not change a repeated cycle. Manual
 * cancellation is not used: these capabilities describe a full-duration cast.
 * Source seconds/SP and stage identity are pinned so a changed duration, level or
 * stage cannot silently inherit this review. Current runtime source metadata is
 * also matched against the exact reviewed DC3 structure below.
 */
const REVIEWED_FIXED_CYCLES: readonly ReviewedFixedCycle[] = [
  // guardSkillSources / guardSkillRecipes, plus their retained talent profiles.
  fixed('char_350_surtr', 2, 'skchr_surtr_2', 18, 18),
  fixed('char_264_f12yin', 3, 'skchr_f12yin_3', 30, 40),
  fixed('char_4037_demetr', 2, 'skchr_demetr_2', 22, 22),
  fixed('char_4082_qiubai', 3, 'skchr_qiubai_3', 30, 55),
  fixed('char_485_pallas', 2, 'skchr_pallas_2', 25, 25),
  fixed('char_485_pallas', 3, 'skchr_pallas_3', 30, 50),
  fixed('char_017_huang', 3, 'skchr_huang_3', 10, 35, 'normal'),
  fixed('char_1026_gvial2', 1, 'skchr_gvial2_1', 25, 25),
  fixed('char_1026_gvial2', 2, 'skchr_gvial2_2', 40, 35),
  fixed('char_1026_gvial2', 3, 'skchr_gvial2_3', 25, 35),
  fixed('char_4098_vvana', 2, 'skchr_vvana_2', 35, 25),
  fixed('char_188_helage', 2, 'skchr_helage_2', 13, 25),
  fixed('char_188_helage', 3, 'skchr_helage_3', 15, 35),
  fixed('char_4011_lessng', 3, 'skchr_lessng_3', 20, 40),
  fixed('char_4064_mlynar', 1, 'skchr_mlynar_1', 30, 30),
  fixed('char_4064_mlynar', 2, 'skchr_mlynar_2', 20, 25),
  fixed('char_4064_mlynar', 3, 'skchr_mlynar_3', 28, 42),
  // expandedMeleeSources / expandedMeleeDefinitions.
  fixed('char_208_melan', 1, 'skcom_atk_up[1]', 20, 40, 'active', 6),
  fixed('char_155_tiger', 2, 'skchr_tiger_2', 25, 50),
  fixed('char_2014_nian', 1, 'skchr_nian_1', 30, 30),
  fixed('char_2014_nian', 3, 'skchr_nian_3', 45, 85),
  fixed('char_311_mudrok', 1, 'skcom_def_up[3]', 40, 30),
  // sleep=10 + awake=20 is one 30-second SP lock, not a 20-second skill.
  fixed('char_311_mudrok', 3, 'skchr_mudrok_3', 30, 25, 'active', 9, 10),
  fixed('char_163_hpsts', 1, 'skchr_hpsts_1', 30, 50),
  fixed('char_163_hpsts', 2, 'skchr_hpsts_2', 30, 50),
  fixed('char_185_frncat', 2, 'skchr_frncat_2', 40, 80),
  fixed('char_4087_ines', 2, 'skchr_ines_2', 12, 20),
  fixed('char_271_spikes', 1, 'skchr_spikes_1', 15, 25),
  fixed('char_271_spikes', 2, 'skchr_spikes_2', 20, 30),
  fixed('char_274_astesi', 1, 'skchr_astesi_1', 30, 30),
  fixed('char_274_astesi', 2, 'skchr_astesi_2', 15, 20),
  fixed('char_355_ethan', 2, 'skchr_ethan_2', 30, 25),
  fixed('char_215_mantic', 2, 'skchr_mantic_2', 40, 20),
  fixed('char_222_bpipe', 1, 'skcom_quickattack[3]', 35, 35),
  fixed('char_222_bpipe', 3, 'skchr_bpipe_3', 20, 40),
  // expandedRangedSources / expandedRangedDefinitions.
  fixed('char_103_angel', 2, 'skchr_angel_2', 15, 35),
  fixed('char_103_angel', 3, 'skchr_angel_3', 15, 30),
  fixed('char_118_yuki', 1, 'skchr_yuki_1', 25, 15),
  fixed('char_197_poca', 1, 'skcom_atk_up[3]', 30, 30),
  fixed('char_197_poca', 2, 'skchr_poca_2', 60, 65),
  // expandedCasterSources / expandedCasterDefinitions; no module SP effects.
  fixed('char_180_amgoat', 1, 'skchr_amgoat_1', 25, 35),
  fixed('char_180_amgoat', 3, 'skchr_amgoat_3', 15, 80),
  fixed('char_2013_cerber', 2, 'skchr_cerber_2', 40, 40),
  fixed('char_2013_cerber', 3, 'skchr_cerber_3', 60, 80),
  fixed('char_306_leizi', 1, 'skcom_atk_up[3]', 30, 30),
  fixed('char_306_leizi', 2, 'skchr_leizi_2', 35, 80),
  fixed('char_1011_lava2', 1, 'skchr_lava2_1', 35, 50),
  fixed('char_2015_dusk', 2, 'skchr_dusk_2', 20, 38, 'body'),
  fixed('char_2015_dusk', 3, 'skchr_dusk_3', 60, 100, 'body'),
  fixed('char_373_lionhd', 1, 'skcom_atk_up[3]', 30, 30),
  fixed('char_4004_pudd', 1, 'skcom_magic_rage[2]', 25, 35),
  fixed('char_4004_pudd', 2, 'skchr_pudd_2', 20, 35),
  fixed('char_472_pasngr', 2, 'skchr_pasngr_2', 35, 40),
  fixed('char_141_nights', 1, 'skcom_atk_up[2]', 25, 35),
  fixed('char_141_nights', 2, 'skchr_nights_2', 25, 25),
  fixed('char_328_cammou', 1, 'skcom_atk_up[2]', 25, 35),
  fixed('char_328_cammou', 2, 'skchr_cammou_2', 30, 45),
  fixed('char_377_gdglow', 1, 'skchr_gdglow_1', 25, 35),
  fixed('char_377_gdglow', 3, 'skchr_gdglow_3', 30, 35),
]

const unavailable = (reason: string): SkillDpsFixedCycleResult => ({ timing: null, reason })
const equal = (left: number | null | undefined, right: number) => typeof left === 'number'
  && Number.isFinite(left) && Math.abs(left - right) <= 1e-9 * Math.max(1, Math.abs(right))

function reviewedCycles(skill: SkillRecord, levelIndex: number) {
  return REVIEWED_FIXED_CYCLES.filter(cycle => cycle.operatorId === skill.operatorId
    && cycle.skillId === skill.skillId && cycle.skillIndex === skill.skillIndex && cycle.levelIndex === levelIndex)
}

/** The numeric analysis counts each skill once, so its selected level must
 * have a single reviewed repeatable cycle, including a definite stage.
 */
export function resolveSkillNumericUptime(skill: SkillRecord, levelIndex: number): number | null {
  const cycles = reviewedCycles(skill, levelIndex)
  if (cycles.length !== 1) return null
  const structure = findSkillStructure({ operatorId: skill.operatorId, skillId: skill.skillId, skillIndex: skill.skillIndex, levelIndex })
  if (!structure) return null
  const [cycle] = cycles
  return cycleUptime(resolveStageFixedCycle(skill, structure, cycle.stageId, cycle)).percentage
}

export function resolveSkillDpsFixedCycle(input: SkillDpsUptimeInput): SkillDpsFixedCycleResult {
  const { entry, output, skill } = input
  const info = entry.structure.basicInfo
  const outputInfo = output.structure?.basicInfo
  if (info.operatorId !== skill.operatorId || info.skillId !== skill.skillId || info.skillIndex !== skill.skillIndex
    || info.levelIndex !== entry.levelIndex || entry.skill.operatorId !== skill.operatorId
    || entry.skill.skillId !== skill.skillId || entry.skill.skillIndex !== skill.skillIndex
    || outputInfo?.operatorId !== info.operatorId || outputInfo.skillId !== info.skillId
    || outputInfo.skillIndex !== info.skillIndex || outputInfo.levelIndex !== info.levelIndex) return unavailable('確認済みソース不一致')
  const cycle = reviewedCycles(skill, entry.levelIndex).find(item => item.stageId === entry.stageId)
  return resolveStageFixedCycle(skill, entry.structure, entry.stageId, cycle, input)
}

/** A full-duration, immediate-recast cycle at 1 SP/second. Initial SP affects
 * only the first cast. The full skill lock includes non-attacking startup.
 */
function resolveStageFixedCycle(skill: SkillRecord, structure: SkillStructure, stageId: string,
  capability: ReviewedFixedCycle | undefined, calculation?: SkillDpsUptimeInput): SkillDpsFixedCycleResult {
  const info = structure.basicInfo
  const raw = skill.skillLevels[info.levelIndex]
  if (!raw || !sameReviewedDescription(raw.description ?? '', structure.source.rawDescription)
    || !sameReviewedBlackboard(raw.blackboard, structure.source.blackboard)
    || raw.duration !== structure.source.duration || (raw.rangeId ?? null) !== structure.source.rangeId
    || raw.spData?.spType !== structure.activationSettings.spRecovery
    || raw.spData?.spCost !== structure.activationSettings.spCost
    || raw.spData?.initSp !== structure.activationSettings.initialSp
    || raw.spData?.maxChargeTime !== structure.activationSettings.maxCharges
    || raw.name !== info.skillName
    || raw.skillType !== structure.activationSettings.activationMethod) return unavailable('確認済みソース不一致')

  const stage = structure.guardRecipe?.stages.find(item => item.id === stageId)
    ?? structure.effectStructure.stages.find(item => item.id === stageId)
  if (!stage || ('kind' in stage && stage.kind !== 'NORMAL') || ('actor' in stage && stage.actor)
    || (calculation && (calculation.entry.kind !== 'NORMAL' || calculation.output.attackKind !== 'NORMAL'
      || calculation.output.actor))) return unavailable('通常攻撃型以外')
  if (calculation && calculation.output.activeStageLabel !== calculation.entry.stageLabel) return unavailable('選択段階不一致')
  if (stage.periodTotal?.kind === 'UNSUPPORTED' && stage.periodTotal.duration === 'AMMO') return unavailable('弾薬制の周期未確認')
  if (raw.durationType !== 'NONE') return unavailable('確認済みソース不一致')
  if (structure.effectStructure.modeTransitions?.length
    || typeof stage.duration === 'object' && 'type' in stage.duration && stage.duration.type === 'UNTIL_MODE_CHANGE') {
    return unavailable('モード切替の周期未確認')
  }
  if ((skill.operatorId === 'char_350_surtr' && skill.skillIndex === 3)
    || (skill.operatorId === 'char_002_amiya' && skill.skillIndex === 3)) return unavailable('退場後の反復不可')
  if (!(raw.duration !== undefined && Number.isFinite(raw.duration) && raw.duration > 0)) return unavailable('永続・退場終了')
  if (structure.activationSettings.spRecovery !== 'INCREASE_WITH_TIME') return unavailable('自然回復以外')
  if (structure.activationSettings.maxCharges !== 1) return unavailable('チャージ周期未確認')
  if (['char_002_amiya', 'char_134_ifrit', 'char_213_mostma'].includes(skill.operatorId)) return unavailable('自己SP回復を含む周期未確認')
  const resolvedDuration = resolveDamageThreeStageDuration(stage, {
    sourceDuration: raw.duration, blackboard: raw.blackboard, conditions: calculation?.output.guard?.conditions,
  })
  const durationSeconds = calculation ? calculation.durationSeconds : resolvedDuration
  const spCost = calculation ? calculation.spCost : structure.activationSettings.spCost
  if (durationSeconds === null || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return unavailable('攻撃可能時間未確定')
  if (spCost === null || !Number.isFinite(spCost) || spCost <= 0) return unavailable('必要SP未確定')

  if (!capability) return unavailable('反復周期の確認なし')
  const attackSeconds = capability.fullLockSeconds - capability.startupSeconds
  if (!equal(raw.duration, capability.fullLockSeconds) || !equal(spCost, capability.spCost)
    || !equal(raw.spData?.spCost, capability.spCost) || !equal(durationSeconds, attackSeconds)
    || !equal(resolvedDuration, attackSeconds)) return unavailable('スキル拘束時間未確認')
  if (capability.startupSeconds > 0) {
    const board = new Map((raw.blackboard ?? []).map(item => [item.key?.toLowerCase(), item.value]))
    if (!equal(board.get('sleep'), capability.startupSeconds) || !equal(board.get('awake'), attackSeconds)) {
      return unavailable('スキル拘束時間未確認')
    }
  }
  return { timing: { fullLockSeconds: capability.fullLockSeconds, rechargeSeconds: spCost, attackSeconds }, reason: null }
}

function cycleUptime({ timing, reason }: SkillDpsFixedCycleResult): SkillDpsUptimeResult {
  if (!timing) return { percentage: null, reason }
  const percentage = timing.attackSeconds / (timing.fullLockSeconds + timing.rechargeSeconds) * 100
  return Number.isFinite(percentage) ? { percentage, reason: null } : { percentage: null, reason: '反復周期の確認なし' }
}

export function resolveSkillDpsUptime(input: SkillDpsUptimeInput): SkillDpsUptimeResult {
  return cycleUptime(resolveSkillDpsFixedCycle(input))
}
