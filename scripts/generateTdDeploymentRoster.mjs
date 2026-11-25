import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { buildTdDeploymentRoster } from '../src/lib/tdDeploymentRoster.ts'

const charactersPath = process.argv[2]
if (!charactersPath) throw new Error('日本版の character_table.json のパスを指定してください。')
const [characters, uniequip] = await Promise.all([
  readFile(charactersPath, 'utf8'),
  readFile(join(dirname(charactersPath), 'uniequip_table.json'), 'utf8'),
])
const roster = buildTdDeploymentRoster(JSON.parse(characters), JSON.parse(uniequip).subProfDict)
if (!roster.length) throw new Error('配置可能なオペレーターが見つかりません。')
const output = new URL('../public/data/maps/td-deployment-roster.json', import.meta.url)
const rows = roster.map(({ shortName, nameInitial, ...operator }) => '  ' + JSON.stringify(operator))
await writeFile(output, '[\n' + rows.join(',\n') + '\n]\n')
console.log(`TD配置オペレーター ${roster.length}人`)
