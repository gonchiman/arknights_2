import { getOperatorPassives } from './operatorProfile.ts'
import type { SkillRecord } from '../types/skill.ts'

export interface TalentCoarseRecord {
  id: string
  operatorId: string
  operatorName: string
  profession: string
  professionLabel: string
  rarity: number
  subProfessionName: string
  /** Original talent slot, before hidden or empty entries are removed. */
  talentIndex: number
  talentName: string
  description: string
}

export const TALENT_COARSE_CATEGORIES = [
  'ABILITY', 'DAMAGE', 'ADDITIONAL_DAMAGE', 'STATUS', 'SURVIVAL',
  'RESOURCE', 'DEPLOYMENT', 'ATTACK_BEHAVIOR', 'SUMMON', 'UNKNOWN',
] as const

export type TalentCoarseCategory = typeof TALENT_COARSE_CATEGORIES[number]

export const TALENT_COARSE_CATEGORY_LABELS: Record<TalentCoarseCategory, string> = {
  ABILITY: '能力補正',
  DAMAGE: 'ダメージ補正・防御無視',
  ADDITIONAL_DAMAGE: '追加攻撃・継続ダメージ',
  STATUS: '状態付与・解除',
  SURVIVAL: '回復・生存',
  RESOURCE: 'SP・コスト・弾薬',
  DEPLOYMENT: '配置・再配置',
  ATTACK_BEHAVIOR: '攻撃方式・索敵',
  SUMMON: '召喚・設置',
  UNKNOWN: '未分類',
}

export const TALENT_COARSE_CATEGORY_DESCRIPTIONS: Record<TalentCoarseCategory, string> = {
  ABILITY: '攻撃力・攻撃速度などの能力値を変える',
  DAMAGE: '与ダメージ・被ダメージや敵の防御性能の扱いを変える',
  ADDITIONAL_DAMAGE: '追加攻撃・反撃・周期的なダメージを発生させる',
  STATUS: '状態異常や強化状態を付与・解除する',
  SURVIVAL: 'HP回復・回避・シールドなどで生存に関わる',
  RESOURCE: 'SP・配置コスト・弾薬などを変える',
  DEPLOYMENT: '配置枠・再配置時間などを変える',
  ATTACK_BEHAVIOR: '攻撃の方式・対象・範囲や索敵を変える',
  SUMMON: '召喚物・設置物や独立したユニットに関わる',
  UNKNOWN: '説明文から分類を特定できない効果',
}

export const TALENT_COARSE_CATEGORY_OPTIONS = TALENT_COARSE_CATEGORIES.map(value => ({
  value, label: TALENT_COARSE_CATEGORY_LABELS[value],
}))

export interface TalentCoarseFilters {
  query: string
  profession: string | 'ALL'
  rarity: number | 'ALL'
  category: TalentCoarseCategory | 'ALL'
}

export const DEFAULT_TALENT_COARSE_FILTERS: TalentCoarseFilters = {
  query: '', profession: 'WARRIOR', rarity: 6, category: 'ALL',
}

export interface TalentCoarseCategorySummary {
  value: TalentCoarseCategory
  label: string
  description: string
  count: number
}

/** Use the site's operator population and the same unlocked candidates as OP information. */
export function buildTalentCoarseRecords(rows: SkillRecord[]): TalentCoarseRecord[] {
  const operators = new Map(rows.map(row => [row.operatorId, row]))
  return [...operators.values()].flatMap(operator => {
    const profile = operator.operatorProfile
    const phaseIndex = Math.max(0, profile.phases.length - 1)
    const maxLevel = Math.max(1, profile.phases[phaseIndex]?.maxLevel ?? 1)
    return getOperatorPassives(profile, phaseIndex, maxLevel, 1).sources.flatMap(source => {
      if (source.sourceKind !== 'TALENT' || source.talentIndex === null || !source.description.trim()) return []
      return [{
        id: `${operator.operatorId}:talent:${source.talentIndex}`,
        operatorId: operator.operatorId,
        operatorName: operator.operatorName,
        profession: operator.profession,
        professionLabel: operator.professionLabel,
        rarity: operator.rarity,
        subProfessionName: operator.subProfessionName,
        talentIndex: source.talentIndex,
        talentName: source.sourceName || '名称なし',
        description: source.description,
      }]
    })
  })
}

const ABILITY_PATTERN = /(?:攻撃力|防御力|最大HP|HP上限|攻撃速度|攻撃間隔|術耐性|ブロック数|ブロック上限)(?:が|を|は)?(?:[+−-]\s*\d|[^。\n]{0,12}(?:上昇|増加|低下|減少|倍増))|(?:能力値|ステータス)[^。\n]{0,15}(?:上昇|増加|低下|減少)/i
const DAMAGE_PATTERN = /(?:与(?:える)?|被|受ける)(?:物理|術|確定)?ダメージ[^。\n]{0,20}(?:[+−-]\s*\d|上昇|増加|低下|減少|倍増)|(?:物理|術|確定)ダメージ[+−-]\s*\d|(?:防御力|術耐性)[^。\n]{0,20}(?:無視|貫通)|攻撃力が\s*\d+(?:\.\d+)?%まで上昇|(?:攻撃|ダメージ)(?:の)?倍率/i
const EXTRA_DAMAGE_PATTERN = /追加[^。\n]{0,18}(?:攻撃|ダメージ)|(?:反撃|継続ダメージ)|毎秒[^。\n]{0,35}(?:ダメージ|損傷)|\d+(?:\.\d+)?秒ごとに[^。\n]{0,100}(?:ダメージ|損傷)|(?:物理|術|確定)(?:範囲)?ダメージ(?:を)?(?:与える(?!際|時|たび|度)|与え(?:、|[。.]|$))/i
const STATUS_PATTERN = /(?:足止め|バインド|スタン|凍結|寒冷|睡眠|浮遊|戦慄|恐怖|沈黙|感電|虚弱|脆弱|加護|レジスト|迷彩|ステルス|無敵|勇猛|不屈|流血)[^。\n]{0,18}(?:付与|解除|無効|させる|状態になる|状態を獲得|にする)|(?:対象|敵)[^。\n]{0,15}\d+(?:\.\d+)?秒(?:間)?(?:足止め|バインド|スタン|凍結|寒冷|睡眠|浮遊|戦慄|恐怖|沈黙)|(?:対象|敵)(?:の)?(?:攻撃力|防御力|術耐性)[^。\n]{0,20}(?:[−-]\s*\d|低下|減少)|移動速度[−-]\s*\d/i
const SURVIVAL_PATTERN = /(?:HP|体力)(?:(?!SP|コスト|弾薬|弾丸)[^。\n]){0,35}(?:回復|残る|奪取)|(?:治療|加護|シールド|バリア|被ダメージ|無敵|回避|致命的|自己再生)|受ける(?:物理|術|確定)?ダメージ[^。\n]{0,12}(?:[−-]\s*\d|減少|軽減)/i
const RESOURCE_PATTERN = /SP[^。\n]{0,22}(?:回復|増加|減少|上昇|低下|[+−-]\s*\d)|(?:配置コスト|コスト|弾薬|弾丸)[^。\n]{0,22}(?:[+−-]\s*\d|回復|増加|減少|上昇|低下|消費|獲得|返却|上限)/i
const DEPLOYMENT_PATTERN = /再配置(?:時間)?[^。\n]{0,20}(?:[+−-]\s*\d|短縮|延長|減少|増加)|配置(?:枠|上限|可能数)|配置数に含まれない|撤退[^。\n]{0,15}(?:返却|コスト)/i
const ATTACK_BEHAVIOR_PATTERN = /(?:攻撃|治療)範囲(?:が|を)?(?:[+−-]\s*\d|拡大|縮小|延長|変化)|攻撃対象数(?:が|を)?[+−-]\s*\d|攻撃が[^。\n]{0,25}(?:変化|変わ|追尾)|常時攻撃|狙われ(?:やす|にく)|(?:ステルス|迷彩)[^。\n]{0,15}(?:無効|解除)|攻撃範囲を[^。\n]{0,25}攻撃範囲と見なす|優先(?:して|的に)?(?:攻撃|治療)|(?:飛行ユニット|敵|対象)(?:を|に)?(?:攻撃|治療)(?:不可|できない|できなくなる)|離陸|着陸/i
const SUMMON_PATTERN = /召喚|罠|「[^」]+」を配置可能|設置(?:物|可能|でき|する)|浮遊ユニット|ドローン|支援装置|戦術装置|身替り|替身/i

/** Display-only candidates; these never select a calculator operation or alter effects. */
export function getTalentCoarseCategories(row: Pick<TalentCoarseRecord, 'description'>): TalentCoarseCategory[] {
  const description = cleanText(row.description)
  const candidates = new Set<TalentCoarseCategory>()
  const rules: [TalentCoarseCategory, RegExp][] = [
    ['ABILITY', ABILITY_PATTERN], ['DAMAGE', DAMAGE_PATTERN], ['ADDITIONAL_DAMAGE', EXTRA_DAMAGE_PATTERN],
    ['STATUS', STATUS_PATTERN], ['SURVIVAL', SURVIVAL_PATTERN], ['RESOURCE', RESOURCE_PATTERN],
    ['DEPLOYMENT', DEPLOYMENT_PATTERN], ['ATTACK_BEHAVIOR', ATTACK_BEHAVIOR_PATTERN], ['SUMMON', SUMMON_PATTERN],
  ]
  for (const [category, pattern] of rules) if (pattern.test(description)) candidates.add(category)
  if (candidates.size === 0) candidates.add('UNKNOWN')
  return TALENT_COARSE_CATEGORIES.filter(category => candidates.has(category))
}

export function filterTalentCoarseRows(rows: TalentCoarseRecord[], filters: TalentCoarseFilters): TalentCoarseRecord[] {
  const terms = normalizeText(filters.query).split(/\s+/).filter(Boolean)
  return rows.filter(row => {
    if (filters.profession !== 'ALL' && row.profession !== filters.profession) return false
    if (filters.rarity !== 'ALL' && row.rarity !== filters.rarity) return false
    const categories = getTalentCoarseCategories(row)
    if (filters.category !== 'ALL' && !categories.includes(filters.category)) return false
    const searchable = normalizeText([
      row.operatorId, row.operatorName, row.professionLabel, row.subProfessionName,
      `素質${row.talentIndex + 1}`, row.talentName, row.description,
      ...categories.map(category => TALENT_COARSE_CATEGORY_LABELS[category]),
    ].join(' '))
    return terms.every(term => searchable.includes(term))
  })
}

export function summarizeTalentCoarseCategories(rows: TalentCoarseRecord[]): TalentCoarseCategorySummary[] {
  const counts = new Map<TalentCoarseCategory, number>()
  for (const row of rows) for (const category of getTalentCoarseCategories(row)) {
    counts.set(category, (counts.get(category) ?? 0) + 1)
  }
  return TALENT_COARSE_CATEGORIES.map(value => ({
    value, label: TALENT_COARSE_CATEGORY_LABELS[value],
    description: TALENT_COARSE_CATEGORY_DESCRIPTIONS[value], count: counts.get(value) ?? 0,
  }))
}

function cleanText(value: string): string {
  return value.normalize('NFKC').replace(/<[^>]+>/g, '').replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim()
}

function normalizeText(value: string): string {
  return cleanText(value).toLocaleLowerCase('ja')
}
