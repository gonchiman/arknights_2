import sources from '../data/dc3NonDamageSources.json' with { type: 'json' }
import type { SkillRecord } from '../types/skill.ts'
import type { ExpandedOperatorSource } from './expandedCombatTypes.ts'
import { sameReviewedPassive, sameReviewedSkill } from './expandedCombatRegistry.ts'
import { getOperatorPassives } from './operatorProfile.ts'

/** Explicitly reviewed skill slots, not a profession/description classifier.
 * Normal attacks that continue during a defensive or utility skill remain in DC3.
 * Only the listed healing/attack-replacement states are outside damage calculation.
 */
const REVIEWED_SKILLS: Readonly<Record<string, readonly number[]>> = {
  char_147_shining: [1, 2, 3], char_179_cgbird: [1, 2, 3], char_4042_lumen: [1, 2, 3],
  char_1016_agoat2: [1, 2, 3], char_436_whispr: [1, 2], char_4224_turdus: [1, 2],
  char_108_silent: [1, 2], char_348_ceylon: [1, 2], char_402_tuye: [1, 2],
  char_4173_nowell: [1, 2], char_449_glider: [1, 2], char_4139_papyrs: [1, 2],
  char_4071_peper: [1, 2], char_4114_harold: [1, 2], char_128_plosis: [1, 2],
  char_275_breeze: [1, 2], char_473_mberry: [1, 2], char_4196_reckpr: [1, 2],
  char_4163_rosesa: [1, 2], char_171_bldsk: [1, 2], char_187_ccheal: [1, 2],
  char_298_susuro: [1, 2], char_385_finlpp: [1, 2], char_4041_chnut: [1, 2],
  char_181_flower: [1, 2], char_117_myrrh: [1, 2], char_212_ansel: [1], char_120_hibisc: [1],
  char_345_folnic: [1],
  char_101_sora: [1, 2], char_4045_heidi: [1, 2], char_1012_skadi2: [1, 2], char_4134_cetsyr: [1, 3],
  char_183_skgoat: [2], char_358_lisa: [3], char_258_podego: [1],
  char_484_robrta: [2], char_4162_cathy: [2], char_4212_nasti: [2],
  char_325_bison: [2], char_150_snakek: [2], char_226_hmau: [1, 2],
  char_4109_baslin: [1, 2], char_4143_sensi: [2], char_304_zebra: [1, 2],
  char_1031_slent2: [1, 2, 3], char_492_quercu: [1, 2], char_4172_xingzh: [1, 2],
  char_343_tknogi: [1, 2], char_4019_ncdeer: [1, 2], char_1022_flwr2: [1, 2], char_4202_haruka: [1],
  char_4179_monstr: [1, 2], char_1052_kalts2: [1, 3], char_4222_taraxa: [1, 2],
  char_479_sleach: [1, 2], char_401_elysm: [1, 2], char_4119_wanqin: [1, 2], char_151_myrtle: [1, 2],
  char_202_demkni: [1], char_2025_shu: [1, 2], char_148_nearl: [1, 2], char_196_sunbr: [1, 2], char_284_spot: [1],
}

const reviewedSources = new Map((sources as unknown as ExpandedOperatorSource[]).map(source => [source.operatorId, source]))

/** A changed skill, visible talent, or trait must be reviewed again before exclusion. */
export function getDamageCalculatorThreeNonDamageScope(skill: SkillRecord): string | null {
  if (!REVIEWED_SKILLS[skill.operatorId]?.includes(skill.skillIndex)) return null
  const source = reviewedSources.get(skill.operatorId)
  const expected = source?.skills.find(entry => entry.skillIndex === skill.skillIndex && entry.skillId === skill.skillId)
  if (!source || !expected || skill.profession !== source.profession || skill.subProfessionId !== source.subProfessionId
    || skill.skillLevels.length - 1 !== source.skillLevelIndex
    || !sameReviewedSkill(skill.skillLevels[source.skillLevelIndex], expected.raw)) return null
  const profile = skill.operatorProfile
  const phase = profile?.phases[source.phaseIndex]
  if (!phase || phase.maxLevel === undefined || profile.phases.length !== source.profile.phases.length
    || phase.maxLevel !== source.profile.phases[source.phaseIndex]?.maxLevel) return null
  const actualPassives = getOperatorPassives(profile, source.phaseIndex, phase.maxLevel, 1).sources
  const expectedPassives = getOperatorPassives(source.profile, source.phaseIndex, phase.maxLevel, 1).sources
  if (actualPassives.length !== expectedPassives.length || !actualPassives.every((passive, index) =>
    sameReviewedPassive(passive, expectedPassives[index]))) return null
  return '対象のスキル効果では、本人の攻撃・素質・特性による敵へのダメージがない。回復・味方支援の効果量はダメージ計算の対象外。'
}
