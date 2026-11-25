import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, readFile, realpath, rm, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { LOCAL_GAME_DATA_RUNTIME_FILES } from '../src/lib/localGameDataContract.ts'
import { exportCoverageRevision, installTypeScriptResolver } from './archiveDc3Coverage.mjs'
import { readActiveLocalDataSnapshot } from './refreshLocalGameData.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const archiveDirectory = resolve(root, 'src/data/attribute-effect-catalog')

export async function readLocalAttributeEffectCatalog(codeDirectory = root) {
  const game = await readActiveLocalDataSnapshot(root)
  if (!game || !game.files.includes(LOCAL_GAME_DATA_RUNTIME_FILES.character)) {
    throw new Error('日本版のローカルデータが必要です。開発サーバーでデータを更新してから再実行してください。')
  }
  const client = {
    readTable: async key => JSON.parse(await readFile(resolve(game.directory, LOCAL_GAME_DATA_RUNTIME_FILES[key]), 'utf8')),
  }
  const { buildAttributeEffectCatalog } = await import(pathToFileURL(resolve(codeDirectory, 'src/lib/attributeEffectCatalog.ts')).href)
  const loader = await import(pathToFileURL(resolve(codeDirectory, 'src/lib/arknightsData.ts')).href)
  // v1 built its catalog from skill rows alone.
  const { operators, rows } = loader.loadOperatorAndSkillRecords
    ? await loader.loadOperatorAndSkillRecords(client)
    : { rows: await loader.loadSkillRecords(client) }
  return { game, operators, rows, catalog: buildAttributeEffectCatalog(rows, operators) }
}

async function captureVersion(version, revision) {
  const source = await exportCoverageRevision(root, revision)
  try {
    const resolver = installTypeScriptResolver()
    try {
      const { game, catalog } = await readLocalAttributeEffectCatalog(source.directory)
      if (new Set(catalog.map(row => row.id)).size !== catalog.length) throw new Error('効果IDが重複しています。')
      return { version, codeRevision: source.revision, gameDataRevision: game.revision, rows: catalog }
    } finally { resolver.deregister() }
  } finally {
    const cache = await realpath(resolve(root, '.cache/dc3-coverage'))
    const directory = await realpath(source.directory)
    if (dirname(directory) !== cache || basename(directory) !== basename(source.directory)
        || !basename(directory).startsWith('reconstructed-' + source.revision + '-')) {
      throw new Error('Unexpected archive cache directory')
    }
    await rm(directory, { recursive: true })
  }
}

export async function archiveAttributeEffects(version, revision = 'HEAD', directory = archiveDirectory) {
  if (!/^v[1-9]\d*$/.test(version)) throw new Error('版番号は v3 のように指定してください。')
  const snapshot = await captureVersion(version, revision)
  const target = resolve(directory, version + '.json')
  const temporary = resolve(directory, '.' + version + '-' + randomUUID() + '.tmp')
  try {
    await writeFile(temporary, JSON.stringify(snapshot, null, 2) + '\n', { flag: 'wx' })
    await copyFile(temporary, target, constants.COPYFILE_EXCL)
  } finally {
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error })
  }
  return snapshot
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [version, revision, ...extra] = process.argv.slice(2)
  if (!version || extra.length) throw new Error('Usage: npm run archive:attribute-effects -- v3 [revision]')
  try {
    const snapshot = await archiveAttributeEffects(version, revision)
    console.log(version + ' を保存しました（' + snapshot.rows.length + '件）。')
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    console.error(version + ' は保存済みです。新しい版番号を指定してください。')
    process.exitCode = 1
  }
}
