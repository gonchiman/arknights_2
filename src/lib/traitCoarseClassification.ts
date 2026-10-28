import { getOperatorPassives } from './operatorProfile.ts'
import { PROFESSION_ORDER } from './operatorFilters.ts'
import { expandSkillDescription } from './skillJsonAnalysis.ts'
import type { OperatorCombatProfile, SkillRecord } from '../types/skill.ts'

export interface TraitCoarseOperator {
  operatorId: string
  operatorName: string
  rarity: number
}

export interface TraitCoarseRecord {
  id: string
  profession: string
  professionLabel: string
  subProfessionId: string
  subProfessionName: string
  description: string
  operators: TraitCoarseOperator[]
  /** One-based index within the profession/job, assigned before filtering. */
  variantIndex: number
}

export const TRAIT_COARSE_CATEGORIES = [
  'ATTACK_BEHAVIOR', 'DAMAGE_TYPE', 'DAMAGE', 'ABILITY', 'BLOCK', 'HP_CHANGE',
  'HEAL_RESTRICTION', 'RESOURCE', 'DEPLOYMENT', 'STATUS', 'SUMMON', 'UNKNOWN',
] as const

export type TraitCoarseCategory = typeof TRAIT_COARSE_CATEGORIES[number]

export const TRAIT_COARSE_CATEGORY_LABELS: Record<TraitCoarseCategory, string> = {
  ATTACK_BEHAVIOR: '攻撃・治療方式',
  DAMAGE_TYPE: 'ダメージ種別',
  DAMAGE: 'ダメージ倍率・補正',
  ABILITY: '能力補正',
  BLOCK: 'ブロック',
  HP_CHANGE: 'HP回復・増減',
  HEAL_RESTRICTION: '被治療制限',
  RESOURCE: 'SP・コスト・弾薬',
  DEPLOYMENT: '配置・再配置',
  STATUS: '状態・強制移動',
  SUMMON: '召喚・設置',
  UNKNOWN: '未分類',
}

export const TRAIT_COARSE_CATEGORY_DESCRIPTIONS: Record<TraitCoarseCategory, string> = {
  ATTACK_BEHAVIOR: '攻撃や治療の対象・範囲・回数・行動条件を定める',
  DAMAGE_TYPE: '物理・術・元素など、与えるダメージの種別を定める',
  DAMAGE: '攻撃倍率やダメージの増減・防御無視を定める',
  ABILITY: '攻撃力・防御力・回避などの能力を変える',
  BLOCK: 'ブロックできる敵数やブロック数を定める',
  HP_CHANGE: 'HPの回復・減少や味方への治療を行う',
  HEAL_RESTRICTION: '味方からの治療を受ける条件を制限する',
  RESOURCE: 'SP・コスト・弾薬の獲得・消費・回復条件を定める',
  DEPLOYMENT: '配置場所・再配置時間や撤退時の扱いを定める',
  STATUS: '状態の付与・無効化や強制移動に関わる',
  SUMMON: '召喚物・支援装置・罠などのユニットに関わる',
  UNKNOWN: '説明文から分類を特定できない特性',
}

export const TRAIT_COARSE_CATEGORY_OPTIONS = TRAIT_COARSE_CATEGORIES.map(value => ({
  value, label: TRAIT_COARSE_CATEGORY_LABELS[value],
}))

export interface TraitCoarseFilters {
  query: string
  profession: string | 'ALL'
  rarity: number | 'ALL'
  category: TraitCoarseCategory | 'ALL'
}

export const DEFAULT_TRAIT_COARSE_FILTERS: TraitCoarseFilters = {
  query: '', profession: 'WARRIOR', rarity: 6, category: 'ALL',
}

export interface TraitCoarseCategorySummary {
  value: TraitCoarseCategory
  label: string
  description: string
  count: number
}

/** Use the site's operator population at maximum promotion/level, potential 1, without modules. */
export function buildTraitCoarseRecords(rows: SkillRecord[]): TraitCoarseRecord[] {
  const operators = new Map(rows.map(row => [row.operatorId, row]))
  const groups = new Map<string, TraitCoarseRecord>()
  for (const operator of operators.values()) {
    const profile = preserveTraitTerms(operator.operatorProfile)
    const phaseIndex = Math.max(0, profile.phases.length - 1)
    const maxLevel = Math.max(1, profile.phases[phaseIndex]?.maxLevel ?? 1)
    const source = getOperatorPassives(profile, phaseIndex, maxLevel, 1).sources
      .find(source => source.sourceKind === 'TRAIT')
    // Unknown values remain visibly unknown; never expose internal placeholder keys or invent numbers.
    const description = cleanText(expandSkillDescription(source?.description ?? '', source?.blackboard ?? [])
      .replace(/\{[^{}]+\}/g, '不明'))
    const id = `trait:${JSON.stringify([operator.profession, operator.subProfessionId, normalizeText(description)])}`
    const group: TraitCoarseRecord = groups.get(id) ?? {
      id, profession: operator.profession, professionLabel: operator.professionLabel,
      subProfessionId: operator.subProfessionId, subProfessionName: operator.subProfessionName,
      description, operators: [], variantIndex: 0,
    }
    group.operators.push({
      operatorId: operator.operatorId, operatorName: operator.operatorName, rarity: operator.rarity,
    })
    groups.set(id, group)
  }
  const result = [...groups.values()].sort((a, b) => (
    professionOrder(a.profession) - professionOrder(b.profession)
    || a.profession.localeCompare(b.profession)
    || a.subProfessionName.localeCompare(b.subProfessionName, 'ja')
    || a.subProfessionId.localeCompare(b.subProfessionId)
    || a.description.localeCompare(b.description, 'ja', { numeric: true })
    || a.id.localeCompare(b.id)
  ))
  const variantCounts = new Map<string, number>()
  for (const row of result) {
    const jobKey = JSON.stringify([row.profession, row.subProfessionId])
    row.variantIndex = (variantCounts.get(jobKey) ?? 0) + 1
    variantCounts.set(jobKey, row.variantIndex)
    row.operators.sort((a, b) => b.rarity - a.rarity
      || a.operatorName.localeCompare(b.operatorName, 'ja') || a.operatorId.localeCompare(b.operatorId))
  }
  return result
}

const ATTACK_BEHAVIOR_PATTERN = /範囲(?:物理|術|確定)?(?:ダメージ|攻撃)|同時に(?:攻撃|回復)|優先(?:して|的に)?(?:攻撃|治療)|遠距離攻撃|中距離射撃|攻撃距離[^。\n]{0,8}(?:長い|短い)|(?:攻撃|治療)範囲(?:が|は)[^。\n]{0,8}(?:広|狭|拡大|縮小)|\d+回の攻撃で\d+回ダメージ|\d+回の範囲|跳躍|一斉発射|投擲|離陸|降下|(?:通常時は?)?攻撃(?:しない|せず)|狙われ(?:にく|やす)|のみ(?:を)?攻撃|のみ攻撃でき|通常攻撃が[^。\n]{0,20}治療|自身の召喚物にブロックされている敵を攻撃可能/i
const DAMAGE_TYPE_PATTERN = /(?:物理|術|確定|元素)(?:範囲)?(?:ダメージ|攻撃)|元素損傷を与える/i
const DAMAGE_PATTERN = /(?:与|被|受ける)?ダメージ[^。、\n]{0,22}(?:上昇|増加|減少|減衰|軽減|[+−-]\s*\d)|与ダメージが攻撃力の\d+(?:\.\d+)?%になる|(?:防御力|術耐性)[^。、\n]{0,15}(?:無視|貫通)|攻撃力が\d+(?:\.\d+)?%(?:まで|に)上昇|\d+(?:\.\d+)?%の攻撃力で|攻撃力の\d+(?:\.\d+)?%の(?:範囲)?(?:物理|術|確定|元素)?ダメージ/i
const ABILITY_PATTERN = /(?:攻撃力|防御力|最大HP|HP上限|攻撃速度|攻撃間隔|術耐性|物理回避|術回避)(?:が|を|は)?[+−-]\s*\d|(?:防御力|術耐性|物理回避|術回避)[^。、\n]{0,18}(?:上昇|増加|低下|減少)|攻撃力上昇効果|(?:能力値|ステータス|戦闘能力|味方ユニット)[^。、\n]{0,15}(?:強化|上昇|増加|低下|減少)/i
const BLOCK_PATTERN = /(?:敵を|敵を最大|空中の敵を)\d+体までブロック|ブロック数(?:が|は|を)?(?:\d+|[+−-]\s*\d|増加|減少)/i
const HEAL_RESTRICTION_PATTERN = /(?:味方(?:から)?の)?治療対象にならない|(?:味方からの)?治療(?:効果)?を受け(?:ない|られない)|治療(?:効果)?(?:が|を)(?:無効|無効化)/i
const HP_CHANGE_PATTERN = /HP(?:(?!SP|コスト|弾薬|弾丸)[^。、\n]){0,35}(?:回復|徐々に減少|消費)|治療(?:量|範囲|行動|する|時)|(?:味方|対象)[^。、\n]{0,12}を治療/i
const RESOURCE_PATTERN = /SP[^。、\n]{0,20}(?:回復|増加|減少|[+−-]\s*\d)|(?:所持コスト|配置コスト|コスト)[^。、\n]{0,20}(?:[+−-]\s*\d|回復|消費|返却|獲得)|弾(?:薬|丸|の装填|が装填)|装弾数/i
const DEPLOYMENT_PATTERN = /再配置(?:までの時間|時間)?[^。、\n]{0,15}(?:短|長|減少|増加|[+−-]\s*\d)|(?:遠距離|近距離)マスにも?配置可能|配置(?:枠|上限|可能数|不可)|配置数に含まれない|撤退時[^。\n]{0,25}(?:返却|コスト)/i
const STATUS_PATTERN = /強制移動|(?:敵|対象)[^。、\n]{0,12}(?:足止め|スタン|バインド|凍結|寒冷|睡眠|浮遊)(?!ユニット|状態の|中の)|(?:鼓舞|スタン|バインド|凍結|寒冷|睡眠|浮遊)状態の効果を受けない|(?:状態異常|状態)[^。、\n]{0,8}(?:解除|無効)/i
const SUMMON_PATTERN = /召喚|支援装置|戦術装置|浮遊ユニット|錬金ユニット|身替り|替身|罠(?:を使用|配置)|設置物/i

/** Display-only candidates; these never select a calculator operation or alter effects. */
export function getTraitCoarseCategories(row: Pick<TraitCoarseRecord, 'description'>): TraitCoarseCategory[] {
  const description = cleanText(row.description)
  const candidates = new Set<TraitCoarseCategory>()
  const rules: [TraitCoarseCategory, RegExp][] = [
    ['ATTACK_BEHAVIOR', ATTACK_BEHAVIOR_PATTERN], ['DAMAGE_TYPE', DAMAGE_TYPE_PATTERN],
    ['DAMAGE', DAMAGE_PATTERN], ['ABILITY', ABILITY_PATTERN], ['BLOCK', BLOCK_PATTERN],
    ['HEAL_RESTRICTION', HEAL_RESTRICTION_PATTERN], ['RESOURCE', RESOURCE_PATTERN],
    ['DEPLOYMENT', DEPLOYMENT_PATTERN], ['STATUS', STATUS_PATTERN], ['SUMMON', SUMMON_PATTERN],
  ]
  for (const [category, pattern] of rules) if (pattern.test(description)) candidates.add(category)
  const healingText = description.replace(new RegExp(HEAL_RESTRICTION_PATTERN.source, 'gi'), '')
  if (HP_CHANGE_PATTERN.test(healingText)) candidates.add('HP_CHANGE')
  if (candidates.size === 0) candidates.add('UNKNOWN')
  return TRAIT_COARSE_CATEGORIES.filter(category => candidates.has(category))
}

/** Filters apply to each member: matches in another operator's name cannot leak into the result. */
export function filterTraitCoarseRows(rows: TraitCoarseRecord[], filters: TraitCoarseFilters): TraitCoarseRecord[] {
  const terms = normalizeText(filters.query).split(/\s+/).filter(Boolean)
  return rows.flatMap(row => {
    if (filters.profession !== 'ALL' && row.profession !== filters.profession) return []
    const categories = getTraitCoarseCategories(row)
    if (filters.category !== 'ALL' && !categories.includes(filters.category)) return []
    const shared = [row.professionLabel, row.subProfessionId, row.subProfessionName,
      `特性${row.variantIndex}`, row.description,
      ...categories.map(category => TRAIT_COARSE_CATEGORY_LABELS[category])].join(' ')
    const operators = row.operators.filter(operator => {
      if (filters.rarity !== 'ALL' && operator.rarity !== filters.rarity) return false
      const searchable = normalizeText(`${operator.operatorId} ${operator.operatorName} ${shared}`)
      return terms.every(term => searchable.includes(term))
    })
    return operators.length ? [{ ...row, operators }] : []
  })
}

export function summarizeTraitCoarseCategories(rows: TraitCoarseRecord[]): TraitCoarseCategorySummary[] {
  const counts = new Map<TraitCoarseCategory, number>()
  for (const row of rows) for (const category of getTraitCoarseCategories(row)) {
    counts.set(category, (counts.get(category) ?? 0) + 1)
  }
  return TRAIT_COARSE_CATEGORIES.map(value => ({
    value, label: TRAIT_COARSE_CATEGORY_LABELS[value],
    description: TRAIT_COARSE_CATEGORY_DESCRIPTIONS[value], count: counts.get(value) ?? 0,
  }))
}

function professionOrder(value: string): number {
  const index = (PROFESSION_ORDER as readonly string[]).indexOf(value)
  return index < 0 ? PROFESSION_ORDER.length : index
}

// Literal game terms such as <支援装置> are content, unlike <@ba.kw> markup.
function preserveNamedTerms(value: string): string {
  return value.replace(/<([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]+)>/gu, '「$1」')
}

function preserveTraitTerms(profile: OperatorCombatProfile): OperatorCombatProfile {
  return {
    ...profile,
    traitDescription: profile.traitDescription == null ? undefined : preserveNamedTerms(profile.traitDescription),
    subProfessionTraitDescription: profile.subProfessionTraitDescription == null
      ? undefined : preserveNamedTerms(profile.subProfessionTraitDescription),
    trait: profile.trait ? { ...profile.trait, candidates: profile.trait.candidates?.map(candidate => ({
      ...candidate,
      overrideDescripton: candidate.overrideDescripton == null ? candidate.overrideDescripton : preserveNamedTerms(candidate.overrideDescripton),
      overrideDescription: candidate.overrideDescription == null ? candidate.overrideDescription : preserveNamedTerms(candidate.overrideDescription),
    })) } : profile.trait,
  }
}

function cleanText(value: string): string {
  return preserveNamedTerms(value).normalize('NFKC').replace(/<[^>]+>/g, '')
    .replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim()
}

function normalizeText(value: string): string {
  return cleanText(value).toLocaleLowerCase('ja')
}
