import { getOperatorPassives } from '../src/lib/operatorProfile.ts'
import { expandSkillDescription } from '../src/lib/skillJsonAnalysis.ts'
import { readLocalAttributeEffectCatalog } from './archiveAttributeEffects.mjs'

const { game, operators, rows, catalog } = await readLocalAttributeEffectCatalog()

// A hit is a prompt for a human review. In particular, a negative DEF value can target the caster.
const clues = [
  ['防御力無視', 'physical', /防御力?[^。、]{0,20}無視/, /def_penetr/],
  ['術耐性無視', 'arts', /術耐性[^。、]{0,20}無視/, /(?:magic_resist|res)_penetr/],
  ['防御力低下', 'physical', /防御力(?:が|を)?(?:(?:\d+秒間)?\s*[−-]\s*\d|[^。、]{0,12}(?:低下|減少|奪取))/, /steal_def|def_steal|(?:^|[@.])def=-/],
  ['術耐性低下', 'arts', /術耐性(?:が|を)?(?:(?:\d+秒間)?\s*[−-]\s*\d|[^。、]{0,12}(?:低下|減少|奪取))/, /(?:^|[@.])magic_resistance=-/],
  ['与ダメージ増加', 'physical', /物理(?:攻撃)?の?与ダメージ|与える物理ダメージ[^。、]{0,18}(?:まで上昇|増加)/],
  ['与ダメージ増加', 'arts', /術(?:攻撃)?の?与ダメージ|与える術ダメージ[^。、]{0,18}(?:まで上昇|増加)/],
  ['被ダメージ増加', 'physical', /対物理脆弱|(?:受ける物理ダメージ|物理の?被ダメージ)(?:が)?(?:\s*\+?\d+(?:\.\d+)?%|増加|上昇)/],
  ['被ダメージ増加', 'arts', /対術脆弱|(?:受ける術ダメージ|術の?被ダメージ)(?:が)?(?:\s*\+?\d+(?:\.\d+)?%|増加|上昇)/],
  ['被ダメージ加算（軽減前）', 'arts', /(?:受ける術ダメージ|術の?被ダメージ)\s*\+\d+(?:\.\d+)?(?![\d.%])/],
]

function clean(text) {
  return text.replace(/<[^>]+>/g, '').replace(/\\n|\s+/g, ' ').trim()
}

const registered = new Set(catalog.map(row =>
  [row.id.slice(0, row.id.lastIndexOf(':')), row.attribute, row.effect].join('|')))
const candidates = []
function inspect(id, label, description, blackboard) {
  const entries = Array.isArray(blackboard) ? blackboard : []
  const text = clean(expandSkillDescription(description, entries))
  const keys = entries.map(entry => entry.key + '=' + entry.value)
  for (const [effect, attribute, pattern, keyPattern] of clues) {
    if (registered.has([id, attribute, effect].join('|'))) continue
    if (!pattern.test(text) && !(keyPattern && keys.some(key => keyPattern.test(key)))) continue
    candidates.push({ label, effect, attribute, text })
  }
}

const skillsByOperator = Map.groupBy(rows, row => row.operatorId)
let talentCount = 0
let summonSkillCount = 0
for (const { operatorId, operatorName, operatorProfile } of operators) {
  const phase = operatorProfile.phases.length - 1
  if (phase < 0) continue
  const { sources } = getOperatorPassives(operatorProfile, phase, operatorProfile.phases[phase].maxLevel, 1)
  const talents = sources.filter(source => source.sourceKind === 'TALENT')
  for (const talent of talents) {
    talentCount++
    inspect('talent:' + operatorId + ':' + talent.talentIndex,
      operatorName + ' 素質' + (talent.talentIndex + 1) + ' ' + talent.sourceName, talent.description, talent.blackboard)
  }
  const skills = skillsByOperator.get(operatorId) ?? []
  for (const skill of skills) {
    inspect('skill:' + skill.id, operatorName + ' S' + skill.skillIndex + ' ' + skill.skillName,
      skill.raw.description ?? '', skill.raw.blackboard)
  }
  for (const summon of Object.values(skills[0]?.operatorProfile.summonProfiles ?? {})) {
    const talent = talents.find(passive => passive.tokenKey === summon.tokenKey)
    const overrides = skills.filter(record => record.overrideTokenKey === summon.tokenKey)
    const seen = new Set()
    for (const source of summon.skills) {
      const level = source.levels.at(-1)
      if (!level?.description) continue
      // Trap skills use the owner's skill ID with a token prefix and the same name.
      const skill = skills.find(record => record.skillId.replace(/^skchr_/, 'sktok_') === source.skillId
        && record.skillName === level.name) ?? (overrides.length === 1 ? overrides[0] : null)
      const id = skill ? 'skill:' + skill.id : talent ? 'talent:' + operatorId + ':' + talent.talentIndex
        : 'summon:' + operatorId + ':' + summon.tokenKey
      const text = clean(expandSkillDescription(level.description, level.blackboard ?? []))
      const key = id + '|' + text
      if (seen.has(key)) continue
      seen.add(key)
      summonSkillCount++
      inspect(id, operatorName + ' 召喚物 ' + summon.name + ' ' + (level.name ?? ''), level.description, level.blackboard)
    }
  }
}

console.log('JPデータ ' + game.revision + '（生成 ' + game.generatedAt + '）')
console.log('走査　' + operators.length + '人・' + rows.length + 'スキル・' + talentCount + '素質・召喚物のスキル説明' + summonSkillCount + '件')
console.log('登録　' + catalog.length + '効果　未掲載候補（説明文・数値キー照合）' + candidates.length + '件')
for (const { label, effect, attribute, text } of candidates) {
  console.log('\n' + label + '　' + (attribute === 'physical' ? '物理' : '術') + ' / ' + effect + '\n' + text)
}
