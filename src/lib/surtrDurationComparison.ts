import type { EnemyRecord } from '../types/enemy.ts'
import type { SkillRecord } from '../types/skill.ts'
import { getOperatorModuleId, getOperatorModules } from './operatorModules.ts'
import type { SurtrDurationCondition } from './surtrDurationParticipants.ts'

export interface SurtrDurationComparisonLine {
  id: string
  condition: SurtrDurationCondition
  timeLimit: number
  visible: boolean
}

const number = (value: number) => new Intl.NumberFormat('ja-JP', { useGrouping: false, maximumFractionDigits: 3 }).format(value)

export function getSurtrDurationModuleLabel(record: SkillRecord, condition: SurtrDurationCondition): string {
  if (!condition.moduleId) return '未装備'
  const module = getOperatorModules(record.operatorProfile).find((item, index) => getOperatorModuleId(item, index) === condition.moduleId)
  return `MOD ${module?.typeName2 ?? '?'} Lv.${condition.moduleLevel}`
}

export function getSurtrDurationConditionName(
  record: SkillRecord,
  condition: SurtrDurationCondition,
  enemies: readonly EnemyRecord[],
  skills: readonly SkillRecord[],
): string {
  const custom = condition.name.trim()
  if (custom) return custom
  const actors = [
    ...condition.enemies.map(item => `${enemies.find(enemy => enemy.id === item.enemyId)?.name ?? '敵'}${item.count > 1 ? `×${item.count}` : ''}（初回${number(item.firstTime)}秒）`),
    ...condition.healers.map(item => {
      const healer = skills.find(skill => skill.operatorId === item.operatorId)
      const skill = skills.find(skill => skill.operatorId === item.operatorId && skill.skillId === item.skillId)
      return `${healer?.operatorName ?? '回復役'} ${skill ? `S${skill.skillIndex}（発動${number(item.skillStart)}秒）` : `通常（初回${number(item.firstTime)}秒）`}`
    }),
  ]
  return [getSurtrDurationModuleLabel(record, condition), actors.length ? actors.join('＋') : '外部作用なし'].join('・')
}

/** Readable snapshot metadata shared by table export and graph filenames. */
export function describeSurtrDurationCondition(
  record: SkillRecord,
  condition: SurtrDurationCondition,
  timeLimit: number,
  enemies: readonly EnemyRecord[],
  skills: readonly SkillRecord[],
): string[] {
  const settings = condition.settings
  const level = record.skillLevels[settings.skillLevelIndex]
  const skillLabel = settings.skillLevelIndex < 7 ? `ランク${settings.skillLevelIndex + 1}` : `特化${settings.skillLevelIndex - 6}`
  return [
    `${level?.name ?? record.skillName} ${skillLabel}・昇進2 Lv.${settings.level}・信頼${settings.trust}・潜在${settings.potential}・${getSurtrDurationModuleLabel(record, condition)}`,
    ...condition.enemies.map(item => {
      const enemy = enemies.find(candidate => candidate.id === item.enemyId)
      return `${enemy?.name ?? item.enemyId} ${item.count}体・初回命中${number(item.firstTime)}秒・通常攻撃`
    }),
    ...condition.healers.map(item => {
      const healer = skills.find(candidate => candidate.operatorId === item.operatorId)
      const skill = skills.find(candidate => candidate.operatorId === item.operatorId && candidate.skillId === item.skillId)
      const rank = item.skillLevelIndex < 7 ? `ランク${item.skillLevelIndex + 1}` : `特化${item.skillLevelIndex - 6}`
      return `${healer?.operatorName ?? item.operatorId}・昇進${item.phaseIndex} Lv.${item.level}・信頼${item.trust}・潜在${item.potential}・初回回復${number(item.firstTime)}秒・${item.skillId ? `${skill?.skillName ?? item.skillId} ${rank}・発動${number(item.skillStart)}秒・スキル中初回${item.skillFirstTime === undefined ? '自動' : `${number(item.skillFirstTime)}秒`}` : '通常回復'}`
    }),
    ...(condition.enemies.length ? [] : ['被ダメージなし']),
    ...(condition.healers.length ? [] : ['外部回復なし']),
    `外部HPバフなし・計算上限${number(timeLimit)}秒`,
  ]
}

export function getSurtrDurationFilenameParts(
  record: SkillRecord,
  condition: SurtrDurationCondition,
  timeLimit: number,
  enemies: readonly EnemyRecord[],
  skills: readonly SkillRecord[],
): string[] {
  const settings = condition.settings
  const skillLabel = settings.skillLevelIndex < 7 ? `ランク${settings.skillLevelIndex + 1}` : `特化${settings.skillLevelIndex - 6}`
  return [
    `${skillLabel}-${getSurtrDurationModuleLabel(record, condition)}-潜在${settings.potential}`,
    ...condition.enemies.map(item => `${enemies.find(enemy => enemy.id === item.enemyId)?.name ?? item.enemyId}${item.count}体初回${number(item.firstTime)}秒`),
    ...condition.healers.map(item => {
      const healer = skills.find(skill => skill.operatorId === item.operatorId)
      const skill = skills.find(skill => skill.operatorId === item.operatorId && skill.skillId === item.skillId)
      return `${healer?.operatorName ?? item.operatorId}${skill ? `S${skill.skillIndex}発動${number(item.skillStart)}秒初回${item.skillFirstTime === undefined ? '自動' : number(item.skillFirstTime)}` : `通常初回${number(item.firstTime)}秒`}`
    }),
    ...(condition.enemies.length ? [] : ['被ダメージなし']),
    ...(condition.healers.length ? [] : ['外部回復なし']),
    `上限${number(timeLimit)}秒`, `昇進2Lv${settings.level}信頼${settings.trust}`,
    ...condition.healers.map(item => `回復役昇進${item.phaseIndex}Lv${item.level}信頼${item.trust}潜在${item.potential}スキルLv${item.skillLevelIndex + 1}`),
  ]
}
