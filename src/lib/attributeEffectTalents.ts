import type { OperatorTalentRecord, SkillRecord } from '../types/skill.ts'
import type { AttributeEffectRow } from './attributeEffectCatalog.ts'
import { formatCombatNumber, resolveCombatNumericValue } from './combatEffectStructure.ts'
import { getOperatorPassives } from './operatorProfile.ts'
import { createTalentStructureHash } from './routes.ts'
import { expandSkillDescription } from './skillJsonAnalysis.ts'
import { buildTalentStructures, type TalentStructure, type TalentStructureEffect } from './talentStructure.ts'

// Each entry identifies a reviewed effect in the talent structure. A damage type on an
// additional hit, an attack multiplier or a defensive talent is insufficient on its own.
interface TalentEntry {
  id: string
  condition: string
  amount?: string
  damageScale?: 'physicalDealt' | 'physicalTaken' | 'artsDealt' | 'artsTaken'
}

const entries: Record<string, TalentEntry[]> = {
  'char_350_surtr/0': [{ id: 'resistance-ignore', condition: '自身の攻撃時' }],
  'char_4009_irene/0': [{ id: 'ground-defense-ignore', condition: '' }],
  'char_4037_demetr/0': [{ id: 'defense_reduction_ratio', amount: '{attack@def:0%}/回',
    condition: '攻撃した敵に{attack@def_dec_duration}秒間、最大{attack@limited_stack_cnt}回重複' }],
  'char_4182_oblvns/0': [
    { id: 'note-defense-ignore', amount: '{def_penetrate_ratio:0%}/個', condition: '味方Ave Mujicaの攻撃。戦場の音符数に応じて最大{max_cnt}個分' },
    { id: 'note-resistance-ignore', amount: '{magic_resist_penetrate_ratio:0%}/個', condition: '味方Ave Mujicaの攻撃。戦場の音符数に応じて最大{max_cnt}個分' },
  ],
  'char_4116_blkkgt/1': [{ id: 'tremble-defense-ignore', condition: '戦慄状態の敵への攻撃時' }],
  'char_4098_vvana/0': [{ id: 'damage_scale', damageScale: 'artsDealt', amount: '+{damage_scale_m:0%}',
    condition: '攻撃範囲内にエリート・ボスがいる時は{super_scale}倍' }],
  'char_1014_nearl2/1': [{ id: 'defense-ignore', condition: '自身の攻撃時' }],
  'char_466_qanik/0': [{ id: 'damage-scale', damageScale: 'artsTaken', condition: '攻撃範囲内の空中の敵' }],
  'char_166_skfire/0': [{ id: 'damage-scale', damageScale: 'artsTaken', condition: '配置中、ブロックされている敵' }],
  'char_134_ifrit/0': [{ id: 'resistance-reduction', condition: '攻撃範囲内の敵' }],
  'char_1020_reed2/0': [{ id: 'damage-scale', damageScale: 'artsTaken',
    condition: '灼痕の付いた敵。与ダメージ時に{prob:0%}の確率で{duration}秒間付与、S3中は確定' }],
  'char_1024_hbisc2/0': [{ id: 'damage-scale', damageScale: 'artsTaken', condition: '攻撃した敵に{weak[magic][limit]}秒間' }],
  'char_141_nights/0': [{ id: 'active-resistance-reduction', condition: '攻撃した敵に{duration}秒間' }],
  'char_4178_alanna/0': [{ id: 'device-defense-ignore', amount: '{def_penetrate_fixed_bb}', condition: '支援装置の前方の味方1名の攻撃。S2中は装置効果が増幅' }],
  'char_377_gdglow/1': [{ id: 'resistance-ignore', condition: '自身と浮遊ユニットの攻撃時' }],
  'char_4133_logos/1': [
    { id: 'resistance-debuff', condition: '攻撃した敵に{duration}秒間' },
    { id: 'arts-addition', condition: '攻撃した敵に{duration}秒間' },
  ],
  'char_4142_laios/0': [{ id: 'known-enemy-ignore', condition: '自身が倒した敵と同名の敵への攻撃時' }],
  'char_1502_crosly/1': [{ id: 'damage-scale', damageScale: 'physicalDealt', condition: '自身にまだダメージを与えていない地上の敵' }],
  'char_4125_rdoc/0': [{ id: 'fixed-defense-ignore', condition: '自身の攻撃時' }],
  'char_2027_wang/1': [{ id: 'stone-resistance-ignore', amount: '{attack@per_magic_resist_penetrate_fixed}/個',
    condition: '一直線につながった碁石の起動時。連続した碁石の数に応じて最大{attack@max_trigger_cnt}個分' }],
  'char_106_franka/0': [{ id: 'thermite-defense-ignore', condition: '攻撃時に{prob:0%}の確率で発動' }],
  'char_4025_aprot2/1': [{ id: 'existing-resistance-debuff', condition: '攻撃時に{prob:0%}の確率で{duration}秒間付与' }],
  'char_379_sesa/0': [{ id: 'physical-vulnerability', damageScale: 'physicalTaken', condition: '配置中、ブロックされている敵' }],
  'char_4043_erato/0': [{ id: 'sleep-defense-ignore', condition: '睡眠状態の敵への攻撃時' }],
  'char_197_poca/0': [{ id: 'weight-defense-ignore', condition: '重量ランク{value}以上の敵への攻撃時' }],
  'char_279_excu/0': [{ id: 'defense-ignore', condition: '自身の攻撃時' }],
  'char_2012_typhon/0': [{ id: 'stack-defense-ignore', amount: '{def_penetrate:0%}/回',
    condition: '連続攻撃時に最大{max_stack_cnt}回重複。{duration}秒間攻撃しないとリセット' }],
  'char_4055_bgsnow/1': [{ id: 'typewriter-defense-reduction', condition: 'タイプライターが攻撃した敵に4秒間。隣接4マスに自身がいると強化' }],
  'char_4117_ray/0': [{ id: 'sandbeast-damage', damageScale: 'physicalDealt', condition: 'サンドビーストの周囲8マスの敵への自身の攻撃' }],
  'char_391_rosmon/0': [{ id: 'equipment-defense-ignore', condition: '自身の攻撃時' }],
  'char_113_cqbw/1': [{ id: 'stun-physical-vulnerability', damageScale: 'physicalTaken', condition: '攻撃範囲内のスタン状態の敵' }],
  'char_340_shwaz/0': [{ id: 'lethal-arrow-defense-down', condition: '攻撃時に{prob:0%}の確率で{defdown_duration}秒間付与' }],
  'char_4138_narant/0': [{ id: 'stolen-target-defense', amount: '−{attack@steal_def}/回', condition: '自身の攻撃命中時、最大{attack@steal_def_max}まで奪取' }],
  'char_4015_spuria/0': [{ id: 'selected-penetration', condition: '攻撃時に{prob:0%}で素質発動。3つの効果のうち防御力無視が選ばれた時' }],
  'char_4036_forcer/0': [{ id: 'heavy-target-penetration', condition: '重量ランク{value}以上の敵への攻撃時' }],
  'char_427_vigil/1': [{ id: 'wolf-defense-ignore', condition: '狼の群れがブロック中の敵に対する、自身と狼の群れの攻撃' }],
}

const registeredOperators = new Set(Object.keys(entries).map(key => key.split('/')[0]))

type EffectKind = readonly [AttributeEffectRow['attribute'], string]
const typedItems: Partial<Record<TalentStructureEffect['item'], EffectKind>> = {
  DEFENSE_IGNORE_RATIO: ['physical', '防御力無視'], DEFENSE_IGNORE_FIXED: ['physical', '防御力無視'],
  RESISTANCE_IGNORE_RATIO: ['arts', '術耐性無視'], RESISTANCE_IGNORE_FIXED: ['arts', '術耐性無視'],
  DEFENSE_REDUCTION_RATIO: ['physical', '防御力低下'], DEFENSE_REDUCTION_FINAL_FIXED: ['physical', '防御力低下'],
  RESISTANCE_REDUCTION_FIXED: ['arts', '術耐性低下'], RESISTANCE_REDUCTION_RATIO: ['arts', '術耐性低下'],
  ARTS_DAMAGE_FLAT_ADDITION: ['arts', '被ダメージ加算（軽減前）'],
}
const damageScales: Record<NonNullable<TalentEntry['damageScale']>, EffectKind> = {
  physicalDealt: ['physical', '与ダメージ増加'], artsDealt: ['arts', '与ダメージ増加'],
  physicalTaken: ['physical', '被ダメージ増加'], artsTaken: ['arts', '被ダメージ増加'],
}

function effectAmount(effect: TalentStructureEffect): string | null {
  if (!('value' in effect) || effect.value === undefined || typeof effect.value === 'boolean') return null
  if (effect.id === 'typewriter-defense-reduction') {
    const normal = resolveCombatNumericValue(effect.value, { typewriterDefenseReduction: 'NORMAL' })
    const adjacent = resolveCombatNumericValue(effect.value, { typewriterDefenseReduction: 'ADJACENT' })
    return normal === null || adjacent === null ? null : `−${formatCombatNumber(normal * 100)}%／隣接時 −${formatCombatNumber(adjacent * 100)}%`
  }
  const value = resolveCombatNumericValue(effect.value, {})
  if (value === null) return null
  if (effect.item === 'DAMAGE_SCALE') return `+${formatCombatNumber((value - 1) * 100)}%`
  const sign = effect.item.includes('_REDUCTION_') ? '−' : effect.item === 'ARTS_DAMAGE_FLAT_ADDITION' ? '+' : ''
  return sign + (effect.unit === 'RATIO' ? `${formatCombatNumber(value * 100)}%` : formatCombatNumber(value))
}

function talentRows(talent: TalentStructure): AttributeEffectRow[] {
  const { operatorId, operatorName, talentName, talentIndex } = talent.basicInfo
  if (talent.issues.length) return []
  const expand = (template: string) => expandSkillDescription(template, [...talent.source.blackboard])
  return (entries[`${operatorId}/${talentIndex}`] ?? []).flatMap(entry => {
    const effect = talent.effects.find(candidate => candidate.id === entry.id)
    if (!effect) return []
    const kind = entry.damageScale && effect.item === 'DAMAGE_SCALE' ? damageScales[entry.damageScale] : typedItems[effect.item]
    if (!kind) return []
    const amount = entry.amount ? expand(entry.amount) : effectAmount(effect)
    // Irene has separate air/ground procedure records for one conditional penetration talent.
    const condition = entry.condition ? expand(entry.condition) : talent.source.description
    if (!amount || amount.includes('{') || condition.includes('{')) return []
    return [{ id: `talent:${operatorId}:${talentIndex}:${effect.id}`, operatorName, source: 'talent',
      sourceLabel: `素質${talentIndex + 1}`, name: talentName, attribute: kind[0], effect: kind[1],
      amount, condition, href: createTalentStructureHash(talent.basicInfo) }]
  })
}

// These base talents have no corresponding DC3 talent structure. Read the
// reviewed clause from the same potential-one candidate as the source text.
const sourceTalents: Readonly<Record<string, {
  talentIndex: number
  kind: EffectKind
  clause: string
  valueKey: 'damage_scale' | 'magic_resistance'
  condition: string
}>> = {
  char_1051_headb2: { talentIndex: 0, kind: ['physical', '与ダメージ増加'], clause: '特性による範囲物理攻撃の与ダメージ',
    valueKey: 'damage_scale', condition: '特性による範囲物理攻撃時' },
  char_4136_phonor: { talentIndex: 0, kind: ['arts', '被ダメージ増加'], clause: '対術脆弱',
    valueKey: 'damage_scale', condition: '配置後{duration}秒間、攻撃範囲内の敵全員' },
  char_4227_gallus: { talentIndex: 0, kind: ['arts', '術耐性低下'], clause: '対象の術耐性',
    valueKey: 'magic_resistance', condition: '配置後{duration}秒間、攻撃した敵に{buff_duration}秒間' },
}

function sourceTalentRows({ operatorId, operatorName, operatorProfile }: OperatorTalentRecord): AttributeEffectRow[] {
  const entry = sourceTalents[operatorId]
  if (!entry) return []
  const phaseIndex = operatorProfile.phases.length - 1
  const level = operatorProfile.phases[phaseIndex]?.maxLevel
  if (!level) return []
  const { sources } = getOperatorPassives({ ...operatorProfile, favorKeyFrames: [] }, phaseIndex, level, 1)
  const source = sources.find(candidate => candidate.talentIndex === entry.talentIndex)
  if (!source || !source.description.includes(entry.clause)) return []
  const value = source.blackboard.find(item => item.key === entry.valueKey)?.value
  if (typeof value !== 'number' || !Number.isFinite(value)) return []
  const isIncrease = entry.valueKey === 'damage_scale'
  if (isIncrease ? value <= 1 : value >= 0) return []
  const amount = isIncrease ? `+${formatCombatNumber((value - 1) * 100)}%` : `−${formatCombatNumber(-value * 100)}%`
  const condition = expandSkillDescription(entry.condition, source.blackboard)
  if (condition.includes('{')) return []
  return [{
    id: `talent:${operatorId}:${entry.talentIndex}:${entry.valueKey}`, operatorName, source: 'talent',
    sourceLabel: `素質${entry.talentIndex + 1}`, name: source.sourceName, attribute: entry.kind[0], effect: entry.kind[1],
    amount, condition, href: null, description: expandSkillDescription(source.description, source.blackboard),
  }]
}

export function buildAttributeEffectTalents(rows: readonly SkillRecord[], operators: readonly OperatorTalentRecord[] = []): AttributeEffectRow[] {
  const candidates = rows.filter(row => registeredOperators.has(row.operatorId))
  const byOperator = new Map<string, OperatorTalentRecord>()
  for (const operator of [...rows, ...operators]) {
    if (sourceTalents[operator.operatorId]) byOperator.set(operator.operatorId, operator)
  }
  return [...buildTalentStructures(candidates).flatMap(talentRows), ...[...byOperator.values()].flatMap(sourceTalentRows)]
}
