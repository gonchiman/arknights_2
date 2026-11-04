import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, open, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { registerHooks } from 'node:module'
import { readActiveLocalDataSnapshot } from './refreshLocalGameData.mjs'
import { canonicalCoverageJson, countCoverageRecords, diffCoverageRecords, parseCoverageIndex,
  parseCoverageSnapshot, toCoverageRecords } from '../src/lib/damageCalculatorThreeCoverageHistory.ts'

const DEFAULT_ROOT = fileURLToPath(new URL('../', import.meta.url))
const CODE_PATHS = ['src/lib', 'src/data', 'src/types']
const GAME_FILES = { character: 'runtime/character_table.json', skill: 'runtime/skill_table.json',
  uniequip: 'runtime/uniequip_table.json', battleEquip: 'runtime/battle_equip_table.json',
  handbookTeam: 'runtime/handbook_team_table.json' }
const sha256 = value => createHash('sha256').update(value).digest('hex')
const fingerprint = value => sha256(canonicalCoverageJson(value))

function assertInside(root, path) {
  const child = relative(root, path)
  if (isAbsolute(child) || child === '..' || child.startsWith(`..${sep}`)) throw new Error('Invalid DC3 archive path')
}
const git = (root, args, options = {}) => execFileSync('git', args, {
  cwd: root, maxBuffer: 128 * 1024 * 1024, windowsHide: true, ...options,
})

/** Hash the source bytes used by coverage; archive files are deliberately outside this set. */
export async function fingerprintCoverageCode(root) {
  const entries = []
  async function walk(path) {
    assertInside(root, await realpath(path))
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = resolve(path, entry.name)
      if (entry.isSymbolicLink()) throw new Error('Coverage source symlinks are not supported')
      if (entry.isDirectory()) await walk(child)
      else if (entry.isFile()) entries.push([relative(root, child).replaceAll('\\', '/'), sha256(await readFile(child))])
    }
  }
  for (const path of CODE_PATHS) await walk(resolve(root, path))
  return fingerprint(entries.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))
}

/** Export reviewed Git blobs into a fresh cache directory, without a checkout or a worktree mutation. */
export async function exportCoverageRevision(root, requestedRevision) {
  const revision = git(root, ['rev-parse', '--verify', '--end-of-options', `${requestedRevision}^{commit}`], { encoding: 'utf8' }).trim()
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('Invalid Git revision')
  const cache = resolve(root, '.cache/dc3-coverage')
  await mkdir(cache, { recursive: true })
  assertInside(root, await realpath(cache))
  const directory = resolve(cache, `reconstructed-${revision}-${randomUUID()}`)
  await mkdir(directory)
  const listing = git(root, ['ls-tree', '-r', '-z', revision, '--', ...CODE_PATHS]).toString('utf8')
  const entries = listing.split('\0').filter(Boolean).map(line => {
    const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/.exec(line)
    if (!match) throw new Error('Unsupported source entry in historical Git tree')
    const path = resolve(directory, match[3])
    assertInside(directory, path)
    return { hash: match[2], path }
  })
  if (!entries.length) throw new Error('No coverage sources found at the requested revision')
  const blobs = git(root, ['cat-file', '--batch'], { input: entries.map(entry => entry.hash).join('\n') + '\n' })
  let offset = 0
  for (const entry of entries) {
    const end = blobs.indexOf(10, offset)
    const header = blobs.subarray(offset, end).toString('ascii')
    const match = /^([a-f0-9]{40}) blob (\d+)$/.exec(header)
    if (!match || match[1] !== entry.hash) throw new Error('Invalid historical source blob')
    const size = Number(match[2]), start = end + 1
    if (!Number.isSafeInteger(size) || size < 0 || start + size >= blobs.length || blobs[start + size] !== 10) {
      throw new Error('Incomplete historical source blob')
    }
    await mkdir(dirname(entry.path), { recursive: true })
    await writeFile(entry.path, blobs.subarray(start, start + size), { flag: 'wx' })
    offset = start + size + 1
  }
  await writeFile(resolve(directory, 'package.json'), '{"type":"module"}\n', { flag: 'wx' })
  return { revision, directory }
}

function installTypeScriptResolver() {
  return registerHooks({ resolve(specifier, context, nextResolve) {
    try { return nextResolve(specifier, context) }
    catch (error) {
      if (error.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(specifier)) {
        const candidate = new URL(`${specifier}.ts`, context.parentURL)
        if (existsSync(fileURLToPath(candidate))) return nextResolve(candidate.href, context)
      }
      throw error
    }
  } })
}

/** Capture all catalog skills using one frozen local game dataset, optionally with historical code. */
export async function captureDc3Coverage({ root = DEFAULT_ROOT, label, revision, capturedAt = new Date().toISOString() } = {}) {
  root = await realpath(root)
  if (typeof label !== 'string' || !label.trim()) throw new Error('A non-empty --label is required')
  const game = await readActiveLocalDataSnapshot(root)
  if (!game || Object.values(GAME_FILES).some(file => !game.files.includes(file))) {
    throw new Error('A complete, hash-verified local game snapshot is required. Start the development server to prepare it.')
  }
  const tables = {}
  const gameEntries = []
  for (const [key, file] of Object.entries(GAME_FILES)) {
    const path = await realpath(resolve(game.directory, file))
    assertInside(game.directory, path)
    const bytes = await readFile(path)
    tables[key] = JSON.parse(bytes)
    gameEntries.push([file, sha256(bytes)])
  }
  const historical = revision === undefined ? null : await exportCoverageRevision(root, revision)
  const codeRoot = historical?.directory ?? root
  const codeRevision = historical?.revision ?? git(root, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const codeDirty = historical ? false : Boolean(git(root,
    ['status', '--porcelain', '--untracked-files=all', '--', ...CODE_PATHS], { encoding: 'utf8' }).trim())
  const codeFingerprint = await fingerprintCoverageCode(codeRoot)
  const resolver = installTypeScriptResolver()
  let records
  try {
    const { loadSkillRecords } = await import(pathToFileURL(resolve(codeRoot, 'src/lib/arknightsData.ts')).href)
    const { buildDamageCalculatorThreeCoverage } = await import(pathToFileURL(resolve(codeRoot, 'src/lib/damageCalculatorThreeCoverage.ts')).href)
    const { getExpandedDefinition } = await import(pathToFileURL(resolve(codeRoot, 'src/lib/expandedCombatRegistry.ts')).href)
    const skills = await loadSkillRecords({ readTable: async key => {
      if (!(key in tables)) throw new Error(`Unexpected runtime table: ${key}`)
      return tables[key]
    } })
    records = toCoverageRecords(buildDamageCalculatorThreeCoverage(skills), id => getExpandedDefinition(id)?.phaseIndex)
  } finally { resolver.deregister() }
  if (codeFingerprint !== await fingerprintCoverageCode(codeRoot)) {
    throw new Error('Coverage source files changed during capture. Retry after edits finish.')
  }
  return parseCoverageSnapshot({ schemaVersion: 1, id: 'v1', label: label.trim(), capturedAt,
    source: { codeRevision, codeDirty, codeFingerprint, gameDataRevision: game.revision,
      gameDataFingerprint: fingerprint(gameEntries), reconstructed: historical !== null }, rows: records })
}

async function readIndex(directory) {
  try { return parseCoverageIndex(JSON.parse(await readFile(resolve(directory, 'index.json'), 'utf8'))) }
  catch (error) { if (error.code === 'ENOENT') return { schemaVersion: 1, versions: [] }; throw error }
}

async function readVersion(directory, version) {
  const path = await realpath(resolve(directory, version.file))
  assertInside(directory, path)
  const bytes = await readFile(path)
  if (sha256(bytes) !== version.sha256) throw new Error(`Corrupt DC3 coverage snapshot: ${version.id}`)
  const snapshot = parseCoverageSnapshot(JSON.parse(bytes))
  const { file: _file, sha256: _hash, skillCount, counts, ...metadata } = version
  const { rows, ...actual } = snapshot
  if (canonicalCoverageJson(metadata) !== canonicalCoverageJson(actual) || skillCount !== rows.length
    || canonicalCoverageJson(counts) !== canonicalCoverageJson(countCoverageRecords(rows))) {
    throw new Error(`Inconsistent DC3 coverage metadata: ${version.id}`)
  }
  return snapshot
}

/** Append an immutable version, publishing the index only after a verified complete file exists. */
export async function archiveDc3Coverage({ root = DEFAULT_ROOT, snapshot } = {}) {
  root = await realpath(root)
  const candidate = parseCoverageSnapshot(snapshot)
  const cache = resolve(root, '.cache/dc3-coverage')
  const directory = resolve(root, 'public/data/dc3-coverage')
  await mkdir(cache, { recursive: true })
  await mkdir(directory, { recursive: true })
  assertInside(root, await realpath(cache)); assertInside(root, await realpath(directory))
  const lockPath = resolve(cache, 'archive.lock'), token = randomUUID()
  let lock
  try { lock = await open(lockPath, 'wx') }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('DC3 coverage archive is locked. Check .cache/dc3-coverage/archive.lock before retrying.')
    throw error
  }
  let temporary
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, token }))
    await lock.close()
    const index = await readIndex(directory)
    const ordered = [...index.versions].sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)))
    let previous = null
    for (const version of ordered) previous = await readVersion(directory, version)
    if (previous && diffCoverageRecords(previous.rows, candidate.rows).length === 0) {
      return { status: 'unchanged', version: ordered.at(-1), index }
    }
    const used = (await readdir(directory)).flatMap(file => /^v([1-9]\d*)\.json$/.exec(file)?.slice(1).map(Number) ?? [])
    const next = Math.max(0, ...used, ...ordered.map(version => Number(version.id.slice(1)))) + 1
    if (!Number.isSafeInteger(next)) throw new Error('DC3 version number is outside the supported range')
    const id = `v${next}`, frozen = parseCoverageSnapshot({ ...candidate, id })
    const bytes = Buffer.from(`${JSON.stringify(frozen)}\n`)
    const { rows, ...metadata } = frozen
    const version = { ...metadata, file: `${id}.json`, sha256: sha256(bytes),
      skillCount: rows.length, counts: countCoverageRecords(rows) }
    const updated = parseCoverageIndex({ schemaVersion: 1, versions: [...index.versions, version] })
    await writeFile(resolve(directory, version.file), bytes, { flag: 'wx' })
    await readVersion(directory, version)
    temporary = resolve(directory, `index-${randomUUID()}.tmp`)
    await writeFile(temporary, `${JSON.stringify(updated, null, 2)}\n`, { flag: 'wx' })
    await rename(temporary, resolve(directory, 'index.json'))
    return { status: 'created', version, index: updated }
  } finally {
    await lock.close().catch(() => {})
    if (temporary) await rm(temporary, { force: true })
    const owner = await readFile(lockPath, 'utf8').then(text => {
      try { return JSON.parse(text) } catch { return null }
    }).catch(error => { if (error.code === 'ENOENT') return null; throw error })
    if (owner?.token === token) await rm(lockPath)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), options = {}
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]
    if (!['--root', '--label', '--revision'].includes(key) || args[index + 1] === undefined || key in options) {
      throw new Error('Usage: npm run archive:dc3-coverage -- --label text [--revision commit] [--root path]')
    }
    options[key] = args[index + 1]
  }
  const root = options['--root'] ?? DEFAULT_ROOT
  const snapshot = await captureDc3Coverage({ root, label: options['--label'], revision: options['--revision'] })
  const result = await archiveDc3Coverage({ root, snapshot })
  console.log(JSON.stringify({ status: result.status, id: result.version.id, label: result.version.label,
    skillCount: result.version.skillCount, counts: result.version.counts }, null, 2))
}
