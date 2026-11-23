import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { getMapDetail, parseMapDetailShard, parseMapIndex } from '../src/lib/mapDatabase.ts'
import { selectTdMapIndex } from '../src/lib/tdMaps.ts'

const bundledMaps = fileURLToPath(new URL('../public/data/maps/', import.meta.url))
const readJson = async path => JSON.parse(await readFile(path, 'utf8'))

/** Package one complete event from the regular generated map index and its matching detail shards. */
export async function generateTdMaps(mapDirectory, outputPath = resolve(bundledMaps, 'td-event.json')) {
  const source = await readJson(resolve(mapDirectory, 'index.json'))
  const index = parseMapIndex(selectTdMapIndex(source))
  if (!index.maps.length) throw new Error('指定のマップデータにはTDステージが含まれていません。')
  if (index.maps.some(map => !map.hasRouteGeometry)) throw new Error('TD経路を収録したマップデータを再生成してください。')
  const details = { schemaVersion: 1, generatedAt: index.generatedAt, maps: {} }
  const files = new Set(index.maps.flatMap(map => map.detailFile ? [map.detailFile] : []))
  for (const file of files) {
    const shard = await readJson(resolve(mapDirectory, file))
    if (shard.generatedAt !== index.generatedAt) throw new Error(`一覧と詳細の版が異なります: ${file}`)
    const maps = index.maps.filter(map => map.detailFile === file)
    const selected = parseMapDetailShard({ ...shard,
      maps: Object.fromEntries(maps.map(map => [map.levelId, shard.maps[map.levelId]])) })
    for (const map of maps) details.maps[map.levelId] = getMapDetail(selected, map)
  }
  await writeFile(outputPath, JSON.stringify({ source: source.source, index, details }) + '\n', 'utf8')
  return index
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [, , mapDirectory = bundledMaps, outputPath] = process.argv
  const index = await generateTdMaps(mapDirectory, outputPath)
  console.log(`TDマップ ${index.maps.length}件 · ${index.generatedAt}`)
}
