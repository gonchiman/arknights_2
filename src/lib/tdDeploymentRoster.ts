import { gameDataClient } from './gameDataClient.ts'

export type TdDeployOperator = {
  id: string
  name: string
  position: 'MELEE' | 'RANGED' | 'ALL'
  shortName?: string
}

type LabeledOperator = TdDeployOperator & { shortName: string }

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

function labelRoster(operators: readonly TdDeployOperator[]): LabeledOperator[] {
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
  return operators.map(op => ({ ...op, shortName: labels.get(op.id)! }))
}

type Character = {
  name?: string
  position?: string
  displayNumber?: string | null
  subProfessionId?: string
}

function isPosition(value: unknown): value is TdDeployOperator['position'] {
  return value === 'MELEE' || value === 'RANGED' || value === 'ALL'
}

export function buildTdDeploymentRoster(characters: Record<string, Character>): LabeledOperator[] {
  const operators: TdDeployOperator[] = []
  for (const [id, character] of Object.entries(characters)) {
    // A display number identifies playable operators, including those without skills.
    if (!character.displayNumber || !character.name || !isPosition(character.position)) continue
    // Hookmasters and Push Strokers can also use ranged tiles through their base trait.
    const both = character.subProfessionId === 'hookmaster' || character.subProfessionId === 'pusher'
    operators.push({ id, name: character.name, position: both ? 'ALL' : character.position })
  }
  return labelRoster(operators.sort((a, b) => a.name.localeCompare(b.name, 'ja') || a.id.localeCompare(b.id)))
}

async function readRoster(): Promise<LabeledOperator[]> {
  if ((await gameDataClient.getSource()).mode === 'local') {
    return buildTdDeploymentRoster(await gameDataClient.readTable<Record<string, Character>>('character'))
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
    return { id: operator.id, name: operator.name, position: operator.position }
  })
  return labelRoster(operators)
}

let request: Promise<LabeledOperator[]> | null = null

export async function loadTdDeploymentRoster(): Promise<LabeledOperator[]> {
  request ??= readRoster().catch((error: unknown) => {
    request = null
    throw error
  })
  return request
}
