import type { SkillRecord } from '../types/skill.ts'
import type { AttributeEffectRow } from './attributeEffectCatalog.ts'
import { createSkillEffectsHash } from './routes.ts'
import { expandSkillDescription } from './skillJsonAnalysis.ts'

const effects = {
  defenseIgnore: ['physical', '防御力無視'],
  resistanceIgnore: ['arts', '術耐性無視'],
  defenseDown: ['physical', '防御力低下'],
  resistanceDown: ['arts', '術耐性低下'],
  artsDealt: ['arts', '与ダメージ増加'],
  artsTaken: ['arts', '被ダメージ増加'],
} as const

// Templates use the same blackboard syntax as the in-game skill descriptions.
// Some summon effects have an explicit number only in the description text.
type SkillEffect = readonly [kind: keyof typeof effects, amount: string | RegExp, condition: string]
const waterDefenseDown: SkillEffect = ['defenseDown', '{attack@def}', '攻撃時に生成する水域内の敵（水域は{attack@projectile_life_time}秒間、重複不可）']
const skillEffects: Readonly<Record<string, readonly SkillEffect[]>> = {
  skchr_dusk_2: [['artsDealt', '{damage_scale:0.00}倍', '対象のHPが{hp_ratio:0%}以下']],
  skchr_radian_3: [['artsTaken', '{damage_scale:0.00}倍', '発動中、自身・召喚物がダメージを与えた敵に{weak[magic][limit]}秒間']],
  skchr_demkni_3: [['artsTaken', '+{fake.b:0%}', 'スキル中、自身の周囲の敵']],
  skchr_sbell2_3: [['resistanceIgnore', '{magic_resist_penetrate_fixed}', 'スキル中の攻撃']],
  skchr_tiger_1: [['defenseIgnore', '{def_penetrate:0%}', '次の通常攻撃']],
  skchr_tachak_1: [['defenseIgnore', '{def_penetrate_fixed}', '自身の燃焼エリア内の敵を攻撃時']],
  skchr_bena_1: [['defenseIgnore', '{def_penetrate:0%}', 'スキル中の攻撃']],
  skchr_ela_2: [['defenseIgnore', '{def_penetrate_fixed}', 'シールド展開中の通常攻撃']],
  skchr_pinecn_1: [['defenseIgnore', '{def_penetrate_fixed}', 'スキル攻撃']],
  skchr_excu2_1: [['defenseIgnore', '{def_penetrate_fixed}', 'スキル中の攻撃']],
  skchr_lolxh_2: [['defenseIgnore', '{attack@def_penetrate_fixed}', '対象のHPが{attack@hp_ratio:0%}未満のときの追加攻撃']],
  skchr_lionhd_2: [['resistanceDown', '{magic_resistance:0%}', 'スキルが命中した敵に{duration}秒間']],
  skchr_slbell_2: [
    ['defenseDown', '{def:0%}', 'スキル中、攻撃範囲内の敵'],
    ['resistanceDown', '{magic_resistance:0%}', 'スキル中、攻撃範囲内の敵'],
  ],
  skchr_vodfox_2: [['defenseDown', '{def:0%}', '呪いの人形の周囲の敵']],
  skchr_elysm_2: [['defenseDown', '{def:0%}', 'スキル中、マークした周囲の敵最大{max_target}体']],
  skchr_toddi_1: [['defenseDown', '{def:0%}', 'マークした敵1体（最も重いサルカズを優先）']],
  skchr_chen2_2: [waterDefenseDown],
  skchr_chen2_3: [waterDefenseDown],
  skchr_surfer_2: [['defenseDown', '−{def_steal}/回', '攻撃した敵から最大{def_steal_max}まで奪取。スキル終了または自身の退場まで']],
  skchr_amgoat_2: [['resistanceDown', '{magic_resistance:0%}', '次の通常攻撃で{duration}秒間']],
  skchr_ifrit_2: [['defenseDown', '{def}', '次の通常攻撃で3秒間']],
  skchr_ifrit_3: [['resistanceDown', '{magic_resistance}', 'スキル中、攻撃範囲内の地上の敵']],
  skchr_wulfen_2: [['defenseDown', '{def:0%}', '鉱石の爆発が命中した敵に{duration}秒間（重複不可）']],
  skchr_doroth_1: [['defenseDown', '{def:0%}', '罠が命中した敵に{duration}秒間']],
  skchr_chiave_2: [['resistanceDown', '{magic_resistance:0%}', 'スキルが命中した敵に{duration}秒間']],
  skchr_meteo_2: [['defenseDown', '{def}', '榴弾が命中した敵に{duration}秒間']],
  skchr_rosmon_3: [['defenseDown', /戦術装備にブロックされている敵の防御力(-\d+)/, '戦術装備がブロックしている敵']],
  skchr_shotst_1: [['defenseDown', '{def:0%}', '次の通常攻撃で{duration}秒間']],
  skchr_shotst_2: [['defenseDown', '{def:0%}', 'スキルが命中した敵に{duration}秒間']],
  skchr_texas2_2: [['resistanceDown', '{magic_resistance:0%}', '配置時の攻撃が命中した敵に{debuff_duration}秒間']],
  skchr_thorn2_3: [
    ['defenseDown', '{def:0%}～{max_def:0%}', '錬金ユニットが囲んだ範囲内の敵。{max_stack_cnt}秒で最大、重複不可'],
    ['resistanceDown', '{magic_resistance:0%}～{max_magic_resistance:0%}', '錬金ユニットが囲んだ範囲内の敵。{max_stack_cnt}秒で最大、重複不可'],
  ],
}

export function buildAttributeEffectSkills(rows: readonly SkillRecord[]): AttributeEffectRow[] {
  const entries = new Map<string, AttributeEffectRow>()
  for (const skill of rows) {
    const definitions = skillEffects[skill.skillId]
    const level = skill.skillLevels.at(-1)
    if (!definitions || !level) continue
    const blackboard = level.blackboard ?? []
    const href = createSkillEffectsHash({ ...skill, levelIndex: skill.skillLevels.length - 1 })
    for (const [kind, amountTemplate, conditionTemplate] of definitions) {
      const amount = typeof amountTemplate === 'string'
        ? expandSkillDescription(amountTemplate, blackboard)
        : (level.description ?? '').replace(/<[^>]*>/g, '').match(amountTemplate)?.[1]
      const condition = expandSkillDescription(conditionTemplate, blackboard)
      if (!amount || amount.includes('{') || condition.includes('{')) continue
      const id = `skill:${skill.operatorId}:${skill.skillId}:${kind}`
      const [attribute, effect] = effects[kind]
      entries.set(id, {
        id, operatorName: skill.operatorName, source: 'skill', sourceLabel: `S${skill.skillIndex}`,
        name: level.name ?? skill.skillName, attribute, effect, amount, condition, href,
      })
    }
  }
  return [...entries.values()]
}
