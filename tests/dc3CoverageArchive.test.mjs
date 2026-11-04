import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { archiveDc3Coverage, captureDc3Coverage, exportCoverageRevision, fingerprintCoverageCode } from '../scripts/archiveDc3Coverage.mjs'
import { parseCoverageIndex, parseCoverageSnapshot } from '../src/lib/damageCalculatorThreeCoverageHistory.ts'

const timestamp = '2026-11-04T01:00:00.000Z'
const source = { codeRevision: 'a'.repeat(40), codeDirty: false, codeFingerprint: 'b'.repeat(64),
  gameDataRevision: 'c'.repeat(40), gameDataFingerprint: 'd'.repeat(64), reconstructed: false }
function record(status = 'UNSUPPORTED', index = 1) {
  return { skill: { id: `op:skill_${index}`, operatorId: 'op', operatorName: 'テスト', skillId: `skill_${index}`,
    skillIndex: index, skillName: `スキル${index}`, profession: 'CASTER', professionLabel: '術師', rarity: 6,
    subProfessionName: '中堅術師' }, status, calculationScope: status === 'SUPPORTED' ? ['1攻撃', 'DPS'] : [],
    supportedConditions: [], deferredReasons: [], scopeNotes: [], sections: { skill: status, talent: status, trait: status },
    details: [{ id: 'skill', label: 'スキル', name: `スキル${index}`, status },
      { id: 'talent-1', label: '素質1', name: '素質', status }, { id: 'trait', label: '特性', name: '中堅術師', status }], issues: [] }
}
const snapshot = (rows = [record()], overrides = {}) => ({ schemaVersion: 1, id: 'v1', label: '初回',
  capturedAt: timestamp, source: structuredClone(source), rows, ...overrides })
async function workspace(t) {
  const base = resolve(tmpdir()), root = await mkdtemp(resolve(base, 'dc3-coverage-'))
  t.after(async () => {
    const child = relative(base, root)
    assert.ok(!isAbsolute(child) && child !== '..' && !child.startsWith(`..${sep}`) && child.startsWith('dc3-coverage-'))
    await rm(root, { recursive: true, force: true })
  })
  return root
}
const directory = root => resolve(root, 'public/data/dc3-coverage')
const bytes = (root, file) => readFile(resolve(directory(root), file))

test('archives the complete catalog and appends a verified immutable version without changing prior bytes', async t => {
  const root = await workspace(t)
  const first = await archiveDc3Coverage({ root, snapshot: snapshot([record(), record('SUPPORTED', 2)], {
    source: { ...source, reconstructed: true }, label: '拡張前（再構成）',
  }) })
  assert.equal(first.status, 'created'); assert.equal(first.version.id, 'v1')
  const before = await bytes(root, 'v1.json')
  assert.equal(createHash('sha256').update(before).digest('hex'), first.version.sha256)
  assert.deepEqual(first.version.counts, { SUPPORTED: 1, CONDITIONAL: 0, PENDING: 0, UNSUPPORTED: 1 })
  const frozen = parseCoverageSnapshot(JSON.parse(before))
  assert.equal(frozen.source.reconstructed, true)
  assert.equal(frozen.rows.length, 2)
  assert.equal(frozen.rows[0].status, 'UNSUPPORTED')
  const second = await archiveDc3Coverage({ root, snapshot: snapshot([record('SUPPORTED'), record('SUPPORTED', 2)], {
    source: { ...source, codeDirty: true }, label: '拡張後',
  }) })
  assert.equal(second.version.id, 'v2'); assert.equal(second.version.source.codeDirty, true)
  assert.deepEqual(await bytes(root, 'v1.json'), before)
  const index = parseCoverageIndex(JSON.parse(await bytes(root, 'index.json')))
  assert.deepEqual(index.versions.map(version => version.id), ['v1', 'v2'])
  assert.equal(parseCoverageSnapshot(JSON.parse(await bytes(root, 'v2.json'))).rows[0].status, 'SUPPORTED')
})

test('unchanged coverage ignores metadata and explanation ordering but does not rewrite existing records', async t => {
  const root = await workspace(t), current = record('SUPPORTED')
  current.scopeNotes = ['a', 'b']
  await archiveDc3Coverage({ root, snapshot: snapshot([current]) })
  const original = await bytes(root, 'index.json'), oldSnapshot = await bytes(root, 'v1.json')
  const reordered = structuredClone(current)
  reordered.calculationScope.reverse(); reordered.scopeNotes.reverse(); reordered.details.reverse()
  const result = await archiveDc3Coverage({ root, snapshot: snapshot([reordered], {
    label: '別名', capturedAt: '2026-11-05T01:00:00.000Z', source: { ...source, codeDirty: true, codeRevision: 'e'.repeat(40) },
  }) })
  assert.equal(result.status, 'unchanged'); assert.equal(result.version.id, 'v1')
  assert.deepEqual(await bytes(root, 'index.json'), original)
  assert.deepEqual(await bytes(root, 'v1.json'), oldSnapshot)
  assert.deepEqual((await readdir(directory(root))).sort(), ['index.json', 'v1.json'])
})

test('returning to an earlier result creates a new chronological version', async t => {
  const root = await workspace(t)
  await archiveDc3Coverage({ root, snapshot: snapshot() })
  await archiveDc3Coverage({ root, snapshot: snapshot([record('SUPPORTED')]) })
  const result = await archiveDc3Coverage({ root, snapshot: snapshot() })
  assert.equal(result.version.id, 'v3')
  assert.equal(result.index.versions.length, 3)
})

test('every prior file is hash-checked before a new version is published', async t => {
  const root = await workspace(t)
  await archiveDc3Coverage({ root, snapshot: snapshot() })
  await archiveDc3Coverage({ root, snapshot: snapshot([record('SUPPORTED')]) })
  const originalIndex = await bytes(root, 'index.json')
  await writeFile(resolve(directory(root), 'v1.json'), '{}')
  await assert.rejects(archiveDc3Coverage({ root, snapshot: snapshot([record('PENDING')]) }), /Corrupt/)
  assert.deepEqual(await bytes(root, 'index.json'), originalIndex)
  assert.ok(!(await readdir(directory(root))).includes('v3.json'))
})

test('the index summary must match the frozen file even when the summary itself is syntactically valid', async t => {
  const root = await workspace(t)
  await archiveDc3Coverage({ root, snapshot: snapshot() })
  const index = JSON.parse(await bytes(root, 'index.json'))
  index.versions[0].counts = { SUPPORTED: 1, CONDITIONAL: 0, PENDING: 0, UNSUPPORTED: 0 }
  await writeFile(resolve(directory(root), 'index.json'), JSON.stringify(index))
  await assert.rejects(archiveDc3Coverage({ root, snapshot: snapshot([record('SUPPORTED')]) }), /Inconsistent/)
  assert.ok(!(await readdir(directory(root))).includes('v2.json'))
})

test('an unreferenced file from an interrupted publish is preserved and its ID is not reused', async t => {
  const root = await workspace(t)
  await archiveDc3Coverage({ root, snapshot: snapshot() })
  const orphan = Buffer.from('interrupted publication')
  await writeFile(resolve(directory(root), 'v2.json'), orphan)
  const result = await archiveDc3Coverage({ root, snapshot: snapshot([record('SUPPORTED')]) })
  assert.equal(result.version.id, 'v3')
  assert.deepEqual(await bytes(root, 'v2.json'), orphan)
  assert.deepEqual(result.index.versions.map(version => version.id), ['v1', 'v3'])
})

test('duplicate skills and a concurrent publisher cannot replace an archive', async t => {
  const root = await workspace(t)
  await assert.rejects(archiveDc3Coverage({ root, snapshot: snapshot([record(), record()]) }), /重複/)
  const cache = resolve(root, '.cache/dc3-coverage')
  await mkdir(cache, { recursive: true })
  const lock = '{"pid":123,"token":"other-publisher"}'
  await writeFile(resolve(cache, 'archive.lock'), lock)
  await assert.rejects(archiveDc3Coverage({ root, snapshot: snapshot() }), /locked/)
  assert.equal(await readFile(resolve(cache, 'archive.lock'), 'utf8'), lock)
  assert.ok(!(await readdir(directory(root))).includes('index.json'))
})

test('fingerprints cover source bytes but not generated archive files', async t => {
  const root = await workspace(t)
  for (const folder of ['src/lib', 'src/data', 'src/types']) await mkdir(resolve(root, folder), { recursive: true })
  await writeFile(resolve(root, 'src/lib/calc.ts'), 'export const value = 1\n')
  const first = await fingerprintCoverageCode(root)
  await archiveDc3Coverage({ root, snapshot: snapshot() })
  assert.equal(await fingerprintCoverageCode(root), first)
  await writeFile(resolve(root, 'src/lib/calc.ts'), 'export const value = 2\n')
  assert.notEqual(await fingerprintCoverageCode(root), first)
})

test('historical source export preserves the current checkout and reads the committed blobs', async t => {
  const root = await workspace(t)
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true })
  git(['init', '--quiet'])
  for (const [file, content] of [['src/lib/calc.ts', 'export const value = 1\n'], ['src/data/data.json', '{"x":1}\n'],
    ['src/types/data.ts', 'export type Number = number\n']]) {
    await mkdir(dirname(resolve(root, file)), { recursive: true })
    await writeFile(resolve(root, file), content)
  }
  git(['add', '--', 'src'])
  git(['-c', 'user.name=Archive Test', '-c', 'user.email=archive@example.invalid', 'commit', '--quiet', '-m', 'fixture'])
  const committed = git(['rev-parse', 'HEAD']).trim()
  await writeFile(resolve(root, 'src/lib/calc.ts'), 'export const value = 2\n')
  const result = await exportCoverageRevision(root, committed)
  assert.equal(result.revision, committed)
  assert.equal(await readFile(resolve(result.directory, 'src/lib/calc.ts'), 'utf8'), 'export const value = 1\n')
  assert.equal(await readFile(resolve(root, 'src/lib/calc.ts'), 'utf8'), 'export const value = 2\n')
  assert.equal(git(['rev-parse', 'HEAD']).trim(), committed)
  assert.ok(relative(root, result.directory).startsWith(`.cache${sep}dc3-coverage${sep}`))
})

test('capture requires verified local data and does not silently fetch a different dataset', async t => {
  const root = await workspace(t)
  await assert.rejects(captureDc3Coverage({ root, label: 'empty' }), /hash-verified local game snapshot/)
})
