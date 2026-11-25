import { gameDataClient } from './gameDataClient.ts'
import { getOperatorInitial, parseOperatorRarity } from './operatorFilters.ts'
import type { OperatorInitial } from '../types/skill.ts'

export type TdDeployOperator = {
  id: string
  name: string
  position: 'MELEE' | 'RANGED' | 'ALL'
  shortName?: string
}

type RosterOperator = TdDeployOperator & {
  rarity: number
  profession: string
  subProfessionId: string
  subProfessionName: string
}

export type TdDeploymentRosterEntry = RosterOperator & { shortName: string; nameInitial: OperatorInitial }

// Reserve familiar labels before assigning the rest of the roster.
const preferredLabels = new Map([
  ['char_208_melan', 'メラ'], ['char_4006_melnte', 'メナ'],
  ['char_126_shotst', 'メテ'], ['char_219_meteo', 'メリ'],
  ['char_002_amiya', 'アミ'], ['char_124_kroos', 'クル'], ['char_196_sunbr', 'グム'],
  ['char_150_snakek', 'クオ'], ['char_102_texas', 'テキ'], ['char_123_fang', 'フェ'],
  ['char_122_beagle', 'ビー'],
])

function* nameLabels(name: string) {
  const chars = Array.from(name)
  yield chars.slice(0, 2).join('')
  const letters = chars.filter(char => !'・ ー-（）'.includes(char))
  for (const letter of letters.slice(1)) yield letters[0] + letter
  for (let i = 1; i < letters.length - 1; i++) yield letters[i] + letters[i + 1]
}

function labelRoster(operators: readonly RosterOperator[]): TdDeploymentRosterEntry[] {
  const labels = new Map(preferredLabels)
  const used = new Set(labels.values())
  // Short names have fewer possible pairs. Use an ID tie-breaker so input order is immaterial.
  const byLength = [...operators].sort((a, b) => a.name.length - b.name.length || a.id.localeCompare(b.id, 'en'))
  let nextNumber = 1
  for (const op of byLength) {
    if (labels.has(op.id)) continue
    let label = Array.from(nameLabels(op.name)).find(candidate => candidate && !used.has(candidate))
    if (!label) {
      while (used.has(String(nextNumber))) nextNumber++
      label = String(nextNumber++)
    }
    used.add(label)
    labels.set(op.id, label)
  }
  return operators.map(op => ({ ...op, shortName: labels.get(op.id)!, nameInitial: getOperatorInitial(op.name) }))
}

type Character = {
  name?: string
  rarity?: number | string
  position?: string
  displayNumber?: string | null
  profession?: string
  subProfessionId?: string
}

type SubProfessions = Record<string, { subProfessionName?: string }>

function isPosition(value: unknown): value is TdDeployOperator['position'] {
  return value === 'MELEE' || value === 'RANGED' || value === 'ALL'
}

export function buildTdDeploymentRoster(characters: Record<string, Character>, subProfessions: SubProfessions = {}): TdDeploymentRosterEntry[] {
  const operators: RosterOperator[] = []
  for (const [id, character] of Object.entries(characters)) {
    // A display number identifies playable operators, including those without skills.
    if (!character.displayNumber || !character.name || !isPosition(character.position)) continue
    // Hookmasters and Push Strokers can also use ranged tiles through their base trait.
    const subProfessionId = character.subProfessionId ?? ''
    const both = subProfessionId === 'hookmaster' || subProfessionId === 'pusher'
    operators.push({
      id, name: character.name, position: both ? 'ALL' : character.position,
      rarity: parseOperatorRarity(character.rarity),
      profession: character.profession ?? '', subProfessionId,
      subProfessionName: subProfessions[subProfessionId]?.subProfessionName ?? subProfessionId,
    })
  }
  return labelRoster(operators.sort((a, b) => a.name.localeCompare(b.name, 'ja') || a.id.localeCompare(b.id)))
}

async function readRoster(): Promise<TdDeploymentRosterEntry[]> {
  if ((await gameDataClient.getSource()).mode === 'local') {
    const [characters, uniequip] = await Promise.all([
      gameDataClient.readTable<Record<string, Character>>('character'),
      gameDataClient.readTable<{ subProfDict?: SubProfessions }>('uniequip'),
    ])
    return buildTdDeploymentRoster(characters, uniequip.subProfDict)
  }
  const base = import.meta.env?.BASE_URL ?? '/'
  const response = await fetch(base.replace(/\/?$/, '/') + 'data/maps/td-deployment-roster.json')
  if (!response.ok) throw new Error('オペレーター一覧を読み込めませんでした。')
  const roster: unknown = await response.json()
  const invalid = 'オペレーター一覧の形式が正しくありません。'
  if (!Array.isArray(roster)) throw new Error(invalid)
  const operators = roster.map(operator => {
    if (!operator || typeof operator.id !== 'string' || typeof operator.name !== 'string' ||
        !isPosition(operator.position)) throw new Error(invalid)
    // Older bundled lists can still be searched by name during an app update.
    const subProfessionId = typeof operator.subProfessionId === 'string' ? operator.subProfessionId : ''
    return {
      id: operator.id, name: operator.name, position: operator.position,
      rarity: Number.isInteger(operator.rarity) ? operator.rarity : 0,
      profession: typeof operator.profession === 'string' ? operator.profession : '',
      subProfessionId, subProfessionName: typeof operator.subProfessionName === 'string' ? operator.subProfessionName : subProfessionId,
    }
  })
  return labelRoster(operators)
}

let request: Promise<TdDeploymentRosterEntry[]> | null = null

export async function loadTdDeploymentRoster(): Promise<TdDeploymentRosterEntry[]> {
  request ??= readRoster().catch((error: unknown) => {
    request = null
    throw error
  })
  return request
}
