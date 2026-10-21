import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchGameDataRevision, loadGameDataSource } from './localGameDataSource.mjs'
import { generateLocalGameData } from './generateLocalGameData.mjs'
import { LOCAL_GAME_DATA_FILES, LOCAL_GAME_DATA_GENERATED_FILES } from '../src/lib/localGameDataContract.ts'

const CODE_ROOT = fileURLToPath(new URL('../', import.meta.url))
const SCHEMA_VERSION = 2
const REQUIRED_FILES = LOCAL_GAME_DATA_FILES
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const cacheDirectory = root => resolve(root, '.cache/local-game-data')
const validId = value => typeof value === 'string' && /^[a-f0-9]{40}-[a-f0-9]{12}-[a-f0-9-]{36}$/.test(value)
const validFile = value => REQUIRED_FILES.includes(value)

function assertInside(root, path) {
  const child = relative(root, path)
  if (isAbsolute(child) || child === '..' || child.startsWith(`..${sep}`)) throw new Error('Invalid local data path')
}

// Include local imports so changes to the existing aggregation/parsing rules
// regenerate the snapshot even when the upstream game data has not changed.
export async function getLocalDataGeneratorVersion() {
  const visited = new Set()
  const entries = []
  async function visit(path) {
    path = resolve(path)
    assertInside(CODE_ROOT, path)
    if (visited.has(path)) return
    visited.add(path)
    const text = await readFile(path, 'utf8')
    entries.push([relative(CODE_ROOT, path).replaceAll('\\', '/'), text])
    const imports = [...text.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+\.(?:mjs|ts))['"]/g)]
    for (const match of imports) await visit(resolve(dirname(path), match[1]))
  }
  await visit(resolve(CODE_ROOT, 'scripts/generateLocalGameData.mjs'))
  await visit(resolve(CODE_ROOT, 'scripts/localGameDataSource.mjs'))
  entries.sort(([a], [b]) => a.localeCompare(b))
  return sha256(JSON.stringify({ schema: SCHEMA_VERSION, entries }))
}

/** Only a complete, hash-verified snapshot may replace the checked-in data. */
export async function readActiveLocalDataSnapshot(root) {
  const cache = cacheDirectory(root)
  try {
    const pointer = JSON.parse(await readFile(resolve(cache, 'current.json'), 'utf8'))
    if (!validId(pointer.id)) return null
    const snapshotRoot = resolve(cache, 'snapshots', pointer.id)
    const manifest = JSON.parse(await readFile(resolve(snapshotRoot, 'manifest.json'), 'utf8'))
    if (![1, SCHEMA_VERSION].includes(manifest.schemaVersion) || manifest.id !== pointer.id
      || !/^[a-f0-9]{40}$/.test(manifest.revision)
      || !/^[a-f0-9]{64}$/.test(manifest.generatorVersion)
      || !Number.isFinite(Date.parse(manifest.generatedAt)) || !Array.isArray(manifest.files)) return null
    const names = manifest.files.map(file => file.path)
    // Keep the previous generated-only snapshot usable while migrating to a
    // snapshot that also includes operator and enemy source tables.
    const required = manifest.schemaVersion === 1 ? LOCAL_GAME_DATA_GENERATED_FILES : REQUIRED_FILES
    if (new Set(names).size !== names.length || required.some(name => !names.includes(name))) return null
    const actualCache = await realpath(cache)
    const directory = await realpath(resolve(snapshotRoot, 'data'))
    assertInside(actualCache, directory)
    for (const file of manifest.files) {
      if (!validFile(file.path) || !/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.size)) return null
      const path = await realpath(resolve(directory, file.path))
      assertInside(directory, path)
      const bytes = await readFile(path)
      if (bytes.length !== file.size || sha256(bytes) !== file.sha256) return null
      JSON.parse(bytes.toString('utf8'))
    }
    return { id: manifest.id, directory, files: names, generatedAt: manifest.generatedAt,
      revision: manifest.revision, generatorVersion: manifest.generatorVersion }
  } catch { return null }
}

async function acquireLock(cache) {
  const path = resolve(cache, 'update.lock')
  const token = randomUUID()
  async function create() {
    const handle = await open(path, 'wx')
    try { await handle.writeFile(JSON.stringify({ pid: process.pid, token })) }
    finally { await handle.close() }
    return async () => {
      try {
        const current = JSON.parse(await readFile(path, 'utf8'))
        if (current.token === token) await rm(path)
      } catch (error) { if (error.code !== 'ENOENT') throw error }
    }
  }
  try { return await create() }
  catch (error) { if (error.code !== 'EEXIST') throw error }
  // Recover a lock abandoned by a stopped/crashed server, but never displace a
  // live writer. A just-created, not-yet-written lock is also treated as busy.
  const recoveryPath = resolve(cache, 'lock-recovery.lock')
  let recovery
  try {
    // Serialize stale-lock recovery as well as normal writers. Re-read the
    // owner under this guard; a concurrent recovery may have finished already.
    recovery = await open(recoveryPath, 'wx')
    let owner
    try { owner = JSON.parse(await readFile(path, 'utf8')) } catch { return null }
    if (!Number.isInteger(owner.pid) || owner.pid <= 0) return null
    try { process.kill(owner.pid, 0); return null }
    catch (error) { if (error.code !== 'ESRCH') return null }
    await rm(path)
    return await create()
  } catch (error) {
    if (error.code === 'EEXIST' || error.code === 'ENOENT') return null
    throw error
  } finally {
    if (recovery) { await recovery.close(); await rm(recoveryPath, { force: true }) }
  }
}

async function publishSnapshot(cache, documents, { revision, generatorVersion, generatedAt, signal }) {
  if (!(documents instanceof Map) || REQUIRED_FILES.some(name => !documents.has(name))) {
    throw new Error('Generated local data is incomplete')
  }
  const id = `${revision}-${generatorVersion.slice(0, 12)}-${randomUUID()}`
  const target = resolve(cache, 'snapshots', id)
  const pointerTemp = resolve(cache, `current-${randomUUID()}.tmp`)
  // A new UUID directory stays invisible until current.json points to it.
  // Avoid renaming populated directories, which Windows indexers can lock.
  await mkdir(resolve(target, 'data'), { recursive: true })
  let published = false
  try {
    const files = []
    for (const [name, document] of documents) {
      signal.throwIfAborted()
      if (!validFile(name) || !document || typeof document !== 'object') throw new Error('Invalid generated data file')
      const bytes = Buffer.from(`${JSON.stringify(document)}\n`)
      const path = resolve(target, 'data', name)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, bytes)
      files.push({ path: name, size: bytes.length, sha256: sha256(bytes) })
    }
    const manifest = { schemaVersion: SCHEMA_VERSION, id, revision, generatorVersion, generatedAt, files }
    await writeFile(resolve(target, 'manifest.json'), JSON.stringify(manifest))
    signal.throwIfAborted()
    await writeFile(pointerTemp, JSON.stringify({ id }))
    signal.throwIfAborted()
    // Readers switch every generated file together via this single pointer.
    await rename(pointerTemp, resolve(cache, 'current.json'))
    published = true
    return { id, directory: resolve(target, 'data'), files: files.map(file => file.path),
      revision, generatorVersion, generatedAt }
  } finally {
    // Both paths are generated within our dedicated cache; never touch public/.
    assertInside(cache, target)
    if (!published) await rm(target, { recursive: true, force: true })
    await rm(pointerTemp, { force: true })
  }
}

export async function refreshLocalGameData({ root, signal, logger = console,
  getRevision = fetchGameDataRevision, loadSource = loadGameDataSource,
  generate = generateLocalGameData, generatorVersion, timeoutMs = 15 * 60 * 1000 } = {}) {
  if (!root) throw new Error('A project root is required')
  const cache = cacheDirectory(root)
  let snapshot = await readActiveLocalDataSnapshot(root)
  let release
  const combinedSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs)
  try {
    await mkdir(cache, { recursive: true })
    release = await acquireLock(cache)
    if (!release) {
      logger.info('[データ更新] 更新ロックを取得できないため、既存データを使用します。')
      return { status: 'busy', snapshot }
    }
    snapshot = await readActiveLocalDataSnapshot(root)
    logger.info('[データ更新] 元データの更新を確認しています。')
    const revision = await getRevision({ signal: combinedSignal })
    if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('Invalid source revision')
    generatorVersion ??= await getLocalDataGeneratorVersion()
    if (snapshot?.revision === revision && snapshot.generatorVersion === generatorVersion
      && REQUIRED_FILES.every(file => snapshot.files.includes(file))) {
      logger.info('[データ更新] 変更はありません。保存済みデータを使用します。')
      return { status: 'unchanged', snapshot }
    }
    let progressAt = 0
    const source = await loadSource({ revision, cacheRoot: resolve(cache, 'source'), signal: combinedSignal,
      onProgress: progress => {
        if (Date.now() - progressAt > 5000 || progress.completed === progress.total) {
          logger.info(`[データ更新] 元データを取得中 ${progress.completed}/${progress.total}`)
          progressAt = Date.now()
        }
      } })
    combinedSignal.throwIfAborted()
    const generatedAt = new Date().toISOString()
    logger.info('[データ更新] 出現数・マップ・章別統計を集計しています。')
    const documents = await generate(source, { generatedAt })
    snapshot = await publishSnapshot(cache, documents, { revision, generatorVersion, generatedAt, signal: combinedSignal })
    logger.info(`[データ更新] 更新完了（${revision.slice(0, 7)}）。`)
    return { status: 'updated', snapshot }
  } catch (error) {
    logger.warn(`[データ更新] 更新できなかったため既存データを使用します。${error.message}`)
    return { status: 'failed', snapshot, error }
  } finally { if (release) await release() }
}
