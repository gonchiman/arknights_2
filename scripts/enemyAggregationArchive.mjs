import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { gunzipSync, gzipSync } from 'node:zlib'
import { setTimeout as delay } from 'node:timers/promises'
import { CURRENT_ENEMY_AGGREGATION_RULE_VERSION, ENEMY_AGGREGATION_FILES,
  parseEnemyAggregationBundle, parseEnemyAggregationIndex } from '../src/lib/enemyAggregationContract.ts'
import { getMapCoverageStatus, summarizeMapCoverage } from '../src/lib/enemyMapCoverage.ts'
import { parseMapIndex } from '../src/lib/mapDatabase.ts'

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const timestampFields = new Set(['generatedAt', 'sourceGeneratedAt'])
const normalise = value => Array.isArray(value) ? value.map(normalise)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).filter(key => !timestampFields.has(key)).sort().map(key => [key, normalise(value[key])]))
    : value
const fingerprint = value => sha256(JSON.stringify(normalise(value)))
function assertInside(root, path) {
  const child = relative(root, path)
  if (isAbsolute(child) || child === '..' || child.startsWith(`..${sep}`)) throw new Error('Invalid aggregation archive path')
}

async function readIndex(directory) {
  try { return parseEnemyAggregationIndex(JSON.parse(await readFile(resolve(directory, 'index.json'), 'utf8'))) }
  catch (error) { if (error.code === 'ENOENT') return null; throw error }
}

async function readBundle(directory, entry) {
  const bytes = await readFile(resolve(directory, entry.file))
  if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) throw new Error(`Corrupt aggregation archive: ${entry.id}`)
  const payload = gunzipSync(bytes)
  if (payload.length !== entry.payloadBytes || sha256(payload) !== entry.payloadSha256) {
    throw new Error(`Corrupt aggregation payload: ${entry.id}`)
  }
  const bundle = parseEnemyAggregationBundle(JSON.parse(payload.toString('utf8')), entry.id)
  if (fingerprint(bundle.files) !== entry.contentSha256) throw new Error(`Aggregation content hash mismatch: ${entry.id}`)
  return bundle
}

async function acquireLock(root, signal) {
  const directory = resolve(root, '.cache/enemy-aggregation')
  await mkdir(directory, { recursive: true })
  const path = resolve(directory, 'publish.lock'), recoveryPath = resolve(directory, 'recovery.lock')
  const token = randomUUID(), deadline = Date.now() + 30_000
  while (true) {
    signal?.throwIfAborted()
    let handle
    try {
      handle = await open(path, 'wx')
      await handle.writeFile(JSON.stringify({ pid: process.pid, token }))
      await handle.close()
      return async () => {
        const current = JSON.parse(await readFile(path, 'utf8'))
        if (current.token === token) await rm(path)
      }
    } catch (error) {
      if (handle) { await handle.close().catch(() => {}); throw error }
      if (error.code !== 'EEXIST') throw error
    }
    // Serialize stale-lock recovery so a second process cannot remove a new owner's lock.
    let recovery
    try {
      recovery = await open(recoveryPath, 'wx')
      const owner = JSON.parse(await readFile(path, 'utf8'))
      if (Number.isInteger(owner.pid) && owner.pid > 0) {
        try { process.kill(owner.pid, 0) }
        catch (error) { if (error.code === 'ESRCH') await rm(path) }
      }
    } catch (error) {
      if (!['EEXIST', 'ENOENT'].includes(error.code) && !(error instanceof SyntaxError)) throw error
    } finally {
      if (recovery) { await recovery.close(); await rm(recoveryPath, { force: true }) }
    }
    if (Date.now() >= deadline) throw new Error('Aggregation archive is being published by another process')
    await delay(50, undefined, { signal })
  }
}

function changesBetween(previous, current) {
  const before = new Map((previous ? parseMapIndex(previous.files['maps/index.json']).maps : [])
    .map(map => [map.levelId, map]))
  const after = new Map(parseMapIndex(current.files['maps/index.json']).maps.map(map => [map.levelId, map]))
  const included = map => map && getMapCoverageStatus(map, 'SPAWNS') === 'included'
  const changes = { addedMapIds: [], removedMapIds: [], changedMapIds: [] }
  for (const id of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const oldMap = before.get(id), newMap = after.get(id)
    if (!included(oldMap) && included(newMap)) changes.addedMapIds.push(id)
    else if (included(oldMap) && !included(newMap)) changes.removedMapIds.push(id)
    else if (oldMap && newMap && fingerprint(oldMap) !== fingerprint(newMap)) changes.changedMapIds.push(id)
  }
  return changes
}

/** Freeze the five aggregation inputs together; the catalogue changes only after the bundle is complete. */
export async function archiveEnemyAggregation({ root, snapshot, ruleVersion = CURRENT_ENEMY_AGGREGATION_RULE_VERSION,
  description, signal } = {}) {
  if (!root || !snapshot?.directory || !/^[a-f0-9]{40}$/.test(snapshot.revision ?? '')
    || !/^[a-f0-9]{64}$/.test(snapshot.generatorVersion ?? '') || !Number.isFinite(Date.parse(snapshot.generatedAt))
    || typeof ruleVersion !== 'string' || !ruleVersion.trim() || (description !== undefined && typeof description !== 'string')) {
    throw new Error('A complete snapshot and its source revision are required')
  }
  const directory = resolve(root, 'public/data/enemy-aggregation')
  const sourceRoot = await realpath(snapshot.directory)
  const files = Object.fromEntries(await Promise.all(ENEMY_AGGREGATION_FILES.map(async name => {
    const path = await realpath(resolve(sourceRoot, name))
    assertInside(sourceRoot, path)
    return [name, JSON.parse(await readFile(path, 'utf8'))]
  })))
  parseEnemyAggregationBundle({ schemaVersion: 1, versionId: 'v1', files })
  for (const name of ENEMY_AGGREGATION_FILES.filter(name => !name.startsWith('runtime/'))) {
    if (files[name].source?.revision !== undefined && files[name].source.revision !== snapshot.revision) {
      throw new Error(`Aggregation source revision mismatch: ${name}`)
    }
  }
  const contentSha256 = fingerprint(files)
  const release = await acquireLock(root, signal)
  let bundlePath, indexTemp, bundleCreated = false, published = false
  try {
    await mkdir(directory, { recursive: true })
    const index = await readIndex(directory)
    const duplicate = index?.versions.find(entry => entry.sourceRevision === snapshot.revision
      && entry.ruleVersion === ruleVersion && entry.contentSha256 === contentSha256)
    if (duplicate) {
      await readBundle(directory, duplicate)
      return { status: 'unchanged', version: duplicate, index }
    }
    const previousEntry = index?.versions.find(entry => entry.id === index.currentVersionId)
    const previousBundle = previousEntry ? await readBundle(directory, previousEntry) : null
    // An interrupted publish may leave an unreferenced complete bundle. Never overwrite it.
    const usedNumbers = (await readdir(directory)).flatMap(name => /^v([1-9]\d*)\.json\.gz$/.exec(name)?.slice(1).map(Number) ?? [])
    const id = `v${Math.max(0, ...usedNumbers, ...(index?.versions.map(entry => Number(entry.id.slice(1))) ?? [])) + 1}`
    const bundle = { schemaVersion: 1, versionId: id, files }
    const payload = Buffer.from(`${JSON.stringify(bundle)}\n`)
    const bytes = gzipSync(payload, { level: 9 })
    const coverage = summarizeMapCoverage(parseMapIndex(files['maps/index.json']).maps, 'SPAWNS')
    const defaultDescription = ruleVersion !== CURRENT_ENEMY_AGGREGATION_RULE_VERSION ? '集計ルール更新'
      : previousEntry?.ruleVersion === ruleVersion && previousEntry.sourceRevision !== snapshot.revision
        ? '元データ更新（下限集計・TN連戦対応）' : 'TNの連戦出現を反映（全WAVEクリア・抑制ユニットによる追加出現なし）'
    const version = {
      id, label: `集計版 ${id}`, createdAt: new Date().toISOString(), generatedAt: snapshot.generatedAt,
      sourceRevision: snapshot.revision, ruleVersion, generatorVersion: snapshot.generatorVersion,
      description: description ?? defaultDescription,
      file: `${id}.json.gz`, sha256: sha256(bytes), payloadSha256: sha256(payload), contentSha256,
      bytes: bytes.length, payloadBytes: payload.length,
      summary: { includedMapCount: coverage.included, excludedMapCount: coverage.excluded, missingMapCount: coverage.missing,
        ...(files['enemy-histogram-counts.json'].summary.lowerBoundMapCount !== undefined
          ? { lowerBoundMapCount: files['enemy-histogram-counts.json'].summary.lowerBoundMapCount } : {}) },
      changes: changesBetween(previousBundle, bundle), ...(previousEntry ? { previousVersionId: previousEntry.id } : {}),
    }
    const next = parseEnemyAggregationIndex({ schemaVersion: 1, currentVersionId: id,
      versions: [...(index?.versions ?? []), version] })
    signal?.throwIfAborted()
    bundlePath = resolve(directory, version.file)
    const bundleHandle = await open(bundlePath, 'wx')
    bundleCreated = true
    try { await bundleHandle.writeFile(bytes) } finally { await bundleHandle.close() }
    await readBundle(directory, version)
    indexTemp = resolve(directory, `index-${randomUUID()}.tmp`)
    await writeFile(indexTemp, `${JSON.stringify(next, null, 2)}\n`, { flag: 'wx' })
    signal?.throwIfAborted()
    await rename(indexTemp, resolve(directory, 'index.json'))
    published = true
    return { status: 'created', version, index: next }
  } finally {
    if (!published && bundleCreated) { assertInside(directory, bundlePath); await rm(bundlePath, { force: true }) }
    if (indexTemp) { assertInside(directory, indexTemp); await rm(indexTemp, { force: true }) }
    await release()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), options = {}
  for (let i = 0; i < args.length; i += 2) {
    if (!['--root', '--rule-version', '--description'].includes(args[i]) || args[i + 1] === undefined) {
      throw new Error('Usage: node scripts/enemyAggregationArchive.mjs [--root path] [--rule-version version] [--description text]')
    }
    options[args[i]] = args[i + 1]
  }
  const root = resolve(options['--root'] ?? '.')
  const { readActiveLocalDataSnapshot, getLocalDataGeneratorVersion } = await import('./refreshLocalGameData.mjs')
  const snapshot = await readActiveLocalDataSnapshot(root)
  if (!snapshot) throw new Error('No complete verified local game-data snapshot is available')
  if (!options['--rule-version'] && snapshot.generatorVersion !== await getLocalDataGeneratorVersion()) {
    throw new Error('Snapshot uses an older generator; refresh it first or explicitly specify its --rule-version')
  }
  const result = await archiveEnemyAggregation({ root, snapshot,
    ...(options['--rule-version'] ? { ruleVersion: options['--rule-version'] } : {}),
    ...(options['--description'] ? { description: options['--description'] } : {}),
  })
  console.log(`${result.version.label}: ${result.status} (${result.version.summary.includedMapCount} maps)`)
}
