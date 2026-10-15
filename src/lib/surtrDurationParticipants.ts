import type { EnemyRecord } from '../types/enemy.ts'
import type { RawAttributeData, RawAttributeKeyFrame, RawBlackboardCollection, SkillRecord } from '../types/skill.ts'
import { calculateAttackPipeline, calculateDamageBreakdown, getOperatorStats, type DamageType } from './damageCalculator.ts'
import { getComparisonMaximumSkillLevelIndex, getComparisonMinimumPhaseIndex } from './operatorBuildComparison.ts'
import { getOperatorModuleId, getOperatorModulePhase, getOperatorModules } from './operatorModules.ts'
import { getOperatorPassives } from './operatorProfile.ts'
import { getOperatorPotentialApplication } from './operatorPotentials.ts'
import { deriveSurtrDurationModel, type SurtrDurationSettings } from './surtrDuration.ts'
import type { SurtrDurationExternalAction } from './surtrDurationCombat.ts'

export interface SurtrDurationEnemyParticipant {
  id: string
  enemyId: string
  count: number
  /** First normal-attack hit, in seconds from the S3 activation button. */
  firstTime: number
}

export interface SurtrDurationHealerParticipant {
  id: string
  operatorId: string
  phaseIndex: number
  level: number
  trust: number
  potential: number
  /** Empty means normal healing only. Modules are not equipped. */
  skillId: string
  skillLevelIndex: number
  firstTime: number
  /** One manually timed skill use; SP and automatic repeat uses are not simulated. */
  skillStart: number
  /** First healing hit during the skill. Defaults to one skill interval after skillStart. */
  skillFirstTime?: number
}

export interface SurtrDurationCondition {
  name: string
  settings: SurtrDurationSettings
  moduleId: string
  moduleLevel: number
  enemies: SurtrDurationEnemyParticipant[]
  healers: SurtrDurationHealerParticipant[]
}

export interface SurtrDurationHealerOption {
  operatorId: string
  name: string
  records: SkillRecord[]
}

export interface SurtrDurationHealerSkillOption {
  skillId: string
  label: string
  record: SkillRecord
  supported: boolean
  reason: string | null
}

export interface SurtrDurationEnemyPreview {
  participant: SurtrDurationEnemyParticipant
  enemy: EnemyRecord
  amount: number
  interval: number
  damageType: DamageType
}

export interface SurtrDurationHealerPreview {
  participant: SurtrDurationHealerParticipant
  record: SkillRecord
  amount: number
  interval: number
  skillAmount: number | null
  skillInterval: number | null
  skillDuration: number | null
}

export interface SurtrDurationParticipants {
  defense: number
  magicResistance: number
  actions: SurtrDurationExternalAction[]
  enemies: SurtrDurationEnemyPreview[]
  healers: SurtrDurationHealerPreview[]
  unsupportedReasons: string[]
}

// Verified against JP character_table/skill_table on 2026-10-15. Keep the
// supported identities explicit: a MEDIC profession alone does not imply that
// its healing mechanics or passive effects are compatible with this model.
const HEALER_SKILLS: Readonly<Record<string, readonly string[]>> = {
  char_212_ansel: ['skcom_range_extend'],
  char_120_hibisc: ['skcom_heal_up[1]'],
  char_298_susuro: ['skcom_heal_up[2]', 'skchr_susuro_2'],
}
const SKILL_KEYS = new Set(['atk', 'attack_speed', 'ability_range_forward_extend', 'skill_max_trigger_time'])

export function createSurtrDurationCondition(record: SkillRecord): SurtrDurationCondition {
  return {
    name: '', settings: {
      level: record.operatorProfile.phases[2]?.maxLevel ?? 90,
      trust: 100, potential: 1, skillLevelIndex: Math.max(0, record.skillLevels.length - 1),
    },
    moduleId: '', moduleLevel: 3, enemies: [], healers: [],
  }
}

export function createSurtrDurationEnemyParticipant(enemy: EnemyRecord, id = newParticipantId('enemy')): SurtrDurationEnemyParticipant {
  const interval = enemyInterval(enemy)
  return { id, enemyId: enemy.id, count: 1, firstTime: interval ?? 1 }
}

export function getSurtrDurationHealerOptions(records: readonly SkillRecord[]): SurtrDurationHealerOption[] {
  return Object.keys(HEALER_SKILLS).flatMap(operatorId => {
    const found = records.filter(record => record.operatorId === operatorId).sort((a, b) => a.skillIndex - b.skillIndex)
    return found.length ? [{ operatorId, name: found[0].operatorName, records: found }] : []
  })
}

export function getSurtrDurationHealerSkillOptions(records: readonly SkillRecord[], operatorId: string): SurtrDurationHealerSkillOption[] {
  return records.filter(record => record.operatorId === operatorId).sort((a, b) => a.skillIndex - b.skillIndex).map(record => {
    const reason = supportedSkillReason(record)
    return { skillId: record.skillId, label: `S${record.skillIndex} ${record.skillName}`, record, supported: reason === null, reason }
  })
}

export function createSurtrDurationHealerParticipant(
  records: readonly SkillRecord[], operatorId = 'char_212_ansel', id = newParticipantId('healer'),
): SurtrDurationHealerParticipant | null {
  const options = getSurtrDurationHealerOptions(records)
  const option = options.find(candidate => candidate.operatorId === operatorId) ?? options[0]
  if (!option) return null
  const record = option.records[0]
  const phaseIndex = Math.max(0, record.operatorProfile.phases.length - 1)
  const level = record.operatorProfile.phases[phaseIndex]?.maxLevel ?? 1
  const stats = getOperatorStats(record.operatorProfile, phaseIndex, level, 100)
  return {
    id, operatorId: option.operatorId, phaseIndex, level, trust: 100, potential: 1,
    skillId: '', skillLevelIndex: getComparisonMaximumSkillLevelIndex(record, phaseIndex),
    firstTime: stats.attackInterval, skillStart: 0,
  }
}

/** Enemy specials and stage modifiers are deliberately outside normal attacks. */
export function getSurtrDurationEnemySupportReason(enemy: EnemyRecord): string | null {
  if (!nonNegative(enemy.stats.attack) || !enemyInterval(enemy)) return '攻撃力または攻撃間隔のデータが不足しています。'
  if (!enemyDamageType(enemy)) return '複数のダメージ種別・不明なダメージ種別には対応していません。'
  return null
}

export function deriveSurtrDurationParticipants(
  surtrRecord: SkillRecord,
  condition: SurtrDurationCondition,
  enemyRecords: readonly EnemyRecord[],
  skillRecords: readonly SkillRecord[],
): SurtrDurationParticipants {
  const result: SurtrDurationParticipants = {
    defense: 0, magicResistance: 0, actions: [], enemies: [], healers: [], unsupportedReasons: [],
  }
  const errors = result.unsupportedReasons
  const model = deriveSurtrDurationModel(surtrRecord, condition.settings, condition.moduleId, condition.moduleLevel)
  if (!model) { errors.push('スルトの育成・スキル・MOD設定を確認してください。'); return result }
  const profile = surtrRecord.operatorProfile
  const potential = getOperatorPotentialApplication(profile, condition.settings.potential)
  const frames = profile.phases[2]?.attributesKeyFrames
  const trustLevel = Math.max(0, ...profile.favorKeyFrames.map(frame => frame.level ?? 0)) * condition.settings.trust / 100
  const module = getOperatorModules(profile).find((candidate, index) => getOperatorModuleId(candidate, index) === condition.moduleId)
  const moduleBoard = readBoard(getOperatorModulePhase(module, condition.moduleLevel)?.attributeBlackboard)
  const defense = attribute(frames, condition.settings.level, 'def')
  const resistance = attribute(frames, condition.settings.level, 'magicResistance')
  const trustDefense = attribute(profile.favorKeyFrames, trustLevel, 'def') ?? 0
  const trustResistance = attribute(profile.favorKeyFrames, trustLevel, 'magicResistance') ?? 0
  const potentialStat = (name: string) => potential.effects.filter(effect => effect.attributeType === name).reduce((sum, effect) => sum + (effect.value ?? 0), 0)
  if (!nonNegative(defense) || !nonNegative(resistance)) { errors.push('スルトの防御力・術耐性のデータが不足しています。'); return result }
  result.defense = Math.round(defense + trustDefense + potentialStat('DEF') + (moduleBoard.get('def') ?? 0))
  result.magicResistance = resistance + trustResistance + potentialStat('MAGIC_RESISTANCE') + (moduleBoard.get('magic_resistance') ?? 0)
  if (!nonNegative(result.defense) || !nonNegative(result.magicResistance)) { errors.push('防御力・術耐性を計算できません。'); return result }

  const ids = [...condition.enemies, ...condition.healers].map(participant => participant.id)
  if (ids.some(id => !id.trim()) || new Set(ids).size !== ids.length) errors.push('対象の識別情報が重複または不足しています。')
  for (const participant of condition.enemies) {
    const enemy = enemyRecords.find(candidate => candidate.id === participant.enemyId)
    if (!enemy) { errors.push('選択した敵のデータが見つかりません。'); continue }
    const supportReason = getSurtrDurationEnemySupportReason(enemy)
    if (supportReason) { errors.push(`${enemy.name}：${supportReason}`); continue }
    if (!Number.isInteger(participant.count) || participant.count < 1 || participant.count > 100
      || !nonNegative(participant.firstTime)) { errors.push(`${enemy.name}：体数・最初の命中時刻を確認してください。`); continue }
    const damageType = enemyDamageType(enemy)!
    const amount = calculateDamageBreakdown(enemy.stats.attack!, damageType, result.defense, result.magicResistance).result
    const interval = enemyInterval(enemy)!
    result.enemies.push({ participant, enemy, amount, interval, damageType })
    result.actions.push({ id: participant.id, kind: 'damage', amount, interval, firstTime: participant.firstTime, count: participant.count })
  }

  for (const participant of condition.healers) {
    const record = skillRecords.find(candidate => candidate.operatorId === participant.operatorId
      && (!participant.skillId || candidate.skillId === participant.skillId))
    const errorPrefix = record?.operatorName ?? '回復役'
    const fail = (message: string) => errors.push(`${errorPrefix}：${message}`)
    if (!record || !HEALER_SKILLS[participant.operatorId]) { fail('対応する回復役のデータが見つかりません。'); continue }
    const healerProfile = record.operatorProfile
    const phase = healerProfile.phases[participant.phaseIndex]
    if (!Number.isInteger(participant.phaseIndex) || !phase || !Number.isInteger(participant.level)
      || participant.level < 1 || participant.level > (phase.maxLevel ?? 0)
      || !nonNegative(participant.trust) || participant.trust > 100
      || !nonNegative(participant.firstTime) || !nonNegative(participant.skillStart)
      || !Number.isInteger(participant.potential) || participant.potential < 1) { fail('育成条件・最初の回復時刻を確認してください。'); continue }
    const healerPotential = getOperatorPotentialApplication(healerProfile, participant.potential)
    if (healerPotential.potentialRank !== participant.potential || healerPotential.unsupportedReasons.length) { fail('潜在能力を計算できません。'); continue }
    if (!phase.attributesKeyFrames?.length || phase.attributesKeyFrames.some(frame => !positive(frame.data?.atk)
      || !positive(frame.data?.baseAttackTime) || !positive(frame.data?.attackSpeed))) {
      fail('攻撃力・回復間隔のデータが不足しています。'); continue
    }
    const stats = getOperatorStats(healerProfile, participant.phaseIndex, participant.level, participant.trust, {
      potentialAttack: healerPotential.potentialAttack, attackSpeedBonus: healerPotential.attackSpeedBonus,
    })
    if (!positive(stats.attack) || !positive(stats.attackInterval)) { fail('攻撃力・回復間隔を計算できません。'); continue }
    const passives = getOperatorPassives(healerProfile, participant.phaseIndex, participant.level, participant.potential)
    let passiveAttack = 0
    let unsupportedPassive = false
    for (const source of passives.sources.filter(source => source.sourceKind === 'TALENT')) {
      const board = readBoard(source.blackboard)
      const keys = [...board.keys()]
      if (participant.operatorId === 'char_120_hibisc' && keys.length === 1 && keys[0] === 'atk' && nonNegative(board.get('atk'))) {
        passiveAttack += board.get('atk')!
      } else if (participant.operatorId === 'char_212_ansel' && keys.length === 1 && keys[0] === 'attack@prob') {
        // This heals an additional, different recipient. Surtr's own heal is unchanged.
      } else if (participant.operatorId === 'char_298_susuro' && keys.length === 2 && keys.includes('cost') && keys.includes('heal_scale')
        && positive(board.get('cost')) && positive(board.get('heal_scale'))) {
        const surtrCost = attribute(frames, condition.settings.level, 'cost')
        if (surtrCost === null || surtrCost <= board.get('cost')!) unsupportedPassive = true
        // Surtr's initial deployment cost exceeds this talent's <=10 condition.
      } else { unsupportedPassive = true }
    }
    if (unsupportedPassive) { fail('未対応の素質効果が含まれています。'); continue }
    const amount = calculateAttackPipeline(stats.attack, { directMultiplierPercent: passiveAttack * 100 }).finalAttack
    const interval = stats.attackInterval
    if (!participant.skillId) {
      result.healers.push({ participant, record, amount, interval, skillAmount: null, skillInterval: null, skillDuration: null })
      result.actions.push({ id: participant.id, kind: 'heal', amount, interval, firstTime: participant.firstTime, count: 1 })
      continue
    }
    const supportReason = supportedSkillReason(record)
    const level = record.skillLevels[participant.skillLevelIndex]
    if (supportReason) { fail(supportReason); continue }
    if (participant.phaseIndex < getComparisonMinimumPhaseIndex(record)
      || !Number.isInteger(participant.skillLevelIndex) || participant.skillLevelIndex < 0
      || participant.skillLevelIndex > getComparisonMaximumSkillLevelIndex(record, participant.phaseIndex) || !level) { fail('昇進段階に対応するスキルランクを選択してください。'); continue }
    const board = readBoard(level.blackboard)
    const skillAttack = board.get('atk') ?? 0
    const speed = board.get('attack_speed') ?? 0
    if ([...board.keys()].some(key => !SKILL_KEYS.has(key)) || !nonNegative(skillAttack)
      || !nonNegative(speed) || !positive(level.duration)) { fail('未対応のスキル効果が含まれています。'); continue }
    const skillAmount = calculateAttackPipeline(stats.attack, { directMultiplierPercent: (passiveAttack + skillAttack) * 100 }).finalAttack
    const skillInterval = stats.baseAttackTime * 100 / Math.max(20, stats.attackSpeed + speed)
    const skillDuration = level.duration
    const end = participant.skillStart + skillDuration
    const skillFirstTime = participant.skillFirstTime ?? (participant.skillStart + skillInterval)
    if (!nonNegative(skillFirstTime) || skillFirstTime < participant.skillStart || skillFirstTime >= end) {
      fail('スキル中の最初の回復は、スキル開始から終了までの範囲で指定してください。'); continue
    }
    result.healers.push({ participant, record, amount, interval, skillAmount, skillInterval, skillDuration })
    // Explicit approximation: fixed healing cycles, one skill use. During the
    // skill, its independent first hit is explicit (default one skill interval
    // after skillStart); afterwards, a new
    // normal cycle begins one normal interval after the skill ends. This is
    // not a claim about the native game's attack-CT transition behavior.
    if (participant.skillStart > participant.firstTime) result.actions.push({
      id: `${participant.id}:before`, kind: 'heal', amount, interval,
      firstTime: participant.firstTime, count: 1, activeUntil: participant.skillStart,
    })
    result.actions.push({
      id: `${participant.id}:skill`, kind: 'heal', amount: skillAmount, interval: skillInterval,
      firstTime: skillFirstTime, count: 1,
      activeFrom: participant.skillStart, activeUntil: end,
    })
    result.actions.push({
      id: `${participant.id}:after`, kind: 'heal', amount, interval,
      firstTime: Math.max(end + interval, participant.firstTime), count: 1, activeFrom: end,
    })
  }
  result.unsupportedReasons = [...new Set(errors)]
  // Partial actions must never masquerade as the complete requested condition.
  if (result.unsupportedReasons.length) result.actions = []
  return result
}

function supportedSkillReason(record: SkillRecord): string | null {
  if (!HEALER_SKILLS[record.operatorId]?.includes(record.skillId)) return 'この回復スキルにはまだ対応していません。'
  return !record.skillLevels.length || record.skillLevels.some(level => !positive(level.duration) || !nonNegative(readBoard(level.blackboard).get('atk'))
    || [...readBoard(level.blackboard).keys()].some(key => !SKILL_KEYS.has(key)))
    ? '未対応のスキル効果が含まれています。' : null
}

function enemyDamageType(enemy: EnemyRecord): DamageType | null {
  const types = [...new Set(enemy.damageTypes)]
  if (types.length !== 1) return null
  if (types[0] === 'PHYSIC' || types[0] === 'PHYSICAL') return 'PHYSICAL'
  if (types[0] === 'MAGIC' || types[0] === 'ARTS') return 'ARTS'
  if (types[0] === 'TRUE') return 'TRUE'
  return null
}

function enemyInterval(enemy: EnemyRecord): number | null {
  if (!positive(enemy.stats.baseAttackTime) || !positive(enemy.stats.attackSpeed)) return null
  const interval = enemy.stats.baseAttackTime * 100 / enemy.stats.attackSpeed
  return positive(interval) ? interval : null
}

function readBoard(value: RawBlackboardCollection | undefined): Map<string, number> {
  if (Array.isArray(value)) return new Map(value.flatMap(entry => typeof entry.key === 'string' && typeof entry.value === 'number'
    ? [[entry.key.toLowerCase(), entry.value] as const] : []))
  return new Map(Object.entries(value ?? {}).flatMap(([key, item]) => typeof item === 'number' ? [[key.toLowerCase(), item] as const] : []))
}

function attribute(frames: RawAttributeKeyFrame[] | undefined, level: number, key: keyof RawAttributeData): number | null {
  if (!frames?.length || frames.some(frame => !nonNegative(frame.level) || !nonNegative(frame.data?.[key]))) return null
  const sorted = [...frames].sort((a, b) => a.level! - b.level!)
  if (level <= sorted[0].level!) return sorted[0].data![key]!
  if (level >= sorted.at(-1)!.level!) return sorted.at(-1)!.data![key]!
  const upperIndex = sorted.findIndex(frame => frame.level! >= level)
  const upper = sorted[upperIndex]
  const lower = sorted[upperIndex - 1]
  return lower.data![key]! + (upper.data![key]! - lower.data![key]!) * (level - lower.level!) / (upper.level! - lower.level!)
}

function newParticipantId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
}
function positive(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value > 0 }
function nonNegative(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0 }
