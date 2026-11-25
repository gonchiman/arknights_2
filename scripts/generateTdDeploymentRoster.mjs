import { readFile, writeFile } from 'node:fs/promises'
import { buildTdDeploymentRoster } from '../src/lib/tdDeploymentRoster.ts'

const charactersPath = process.argv[2]
if (!charactersPath) throw new Error('日本版の character_table.json のパスを指定してください。')
const roster = buildTdDeploymentRoster(JSON.parse(await readFile(charactersPath, 'utf8')))
  .map(({ id, name, position }) => ({ id, name, position }))
if (!roster.length) throw new Error('配置可能なオペレーターが見つかりません。')
const output = new URL('../public/data/maps/td-deployment-roster.json', import.meta.url)
const rows = roster.map(({ id, name, position }) => '  ' + JSON.stringify({ id, name, position }))
await writeFile(output, '[\n' + rows.join(',\n') + '\n]\n')
console.log(`TD配置オペレーター ${roster.length}人`)
