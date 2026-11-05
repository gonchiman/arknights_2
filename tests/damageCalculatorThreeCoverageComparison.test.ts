import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  compareCoverageVersionRows, getCoverageChangeLabel, summarizeCoverageVersions,
  type CoverageComparisonFilters,
} from '../src/lib/damageCalculatorThreeCoverageComparison.ts'
import {
  canonicalCoverageJson, countCoverageRecords, coverageRecordKey, parseCoverageIndex, parseCoverageSnapshot,
  type CoverageRecord, type CoverageSnapshot, type CoverageVersionInfo,
} from '../src/lib/damageCalculatorThreeCoverageHistory.ts'

const all: CoverageComparisonFilters = { profession: 'ALL', rarity: 'ALL' }
const index = parseCoverageIndex(JSON.parse(readFileSync(new URL('../public/data/dc3-coverage/index.json', import.meta.url), 'utf8')))
const versions = ['v1', 'v2'].map(id => index.versions.find(version => version.id === id)!)
const saved = versions.map(version => parseCoverageSnapshot(JSON.parse(readFileSync(
  new URL(`../public/data/dc3-coverage/${version.file}`, import.meta.url), 'utf8'))))
const snapshots = Object.fromEntries(versions.map((version, i) => [canonicalCoverageJson(version), saved[i]]))
const totals = (summary: ReturnType<typeof summarizeCoverageVersions>[number]['summary'], section = 0) =>
  summary.sections[section].buckets.map(bucket => bucket.count)

test('保存済みv3は同じ母集団で新規44・保留解除10を記録し、既存対応を後退させない', () => {
  const info = index.versions.find(version => version.id === 'v3')!
  assert.ok(info)
  const v3 = parseCoverageSnapshot(JSON.parse(readFileSync(
    new URL(`../public/data/dc3-coverage/${info.file}`, import.meta.url), 'utf8')))
  assert.equal(v3.rows.length, 915)
  assert.equal(v3.source.gameDataFingerprint, saved[1].source.gameDataFingerprint)
  assert.deepEqual(countCoverageRecords(v3.rows), { SUPPORTED: 339, CONDITIONAL: 11, PENDING: 85, UNSUPPORTED: 480 })
  const previous = new Map(saved[1].rows.map(row => [coverageRecordKey(row), row]))
  const usable = (status: CoverageRecord['status']) => status === 'SUPPORTED' || status === 'CONDITIONAL'
  const added = v3.rows.filter(row => usable(row.status) && !usable(previous.get(coverageRecordKey(row))!.status))
  assert.equal(added.length, 54)
  assert.equal(new Set(added.map(row => row.skill.operatorId)).size, 37)
  assert.equal(added.filter(row => previous.get(coverageRecordKey(row))!.status === 'PENDING').length, 10)
  assert.equal(added.filter(row => previous.get(coverageRecordKey(row))!.status === 'UNSUPPORTED').length, 44)
  for (const row of v3.rows) if (usable(previous.get(coverageRecordKey(row))!.status)) assert.ok(usable(row.status))
  assert.equal(v3.rows.find(row => row.skill.operatorId === 'char_4027_heyak' && row.skill.skillIndex === 2)?.status, 'CONDITIONAL')
})

function fixture(operatorId: string, status: CoverageRecord['status'] = 'UNSUPPORTED'): CoverageRecord {
  const source = structuredClone(saved[0].rows[0])
  return { ...source, selection: undefined, skill: { ...source.skill, operatorId, id: operatorId, skillIndex: 1,
    skillId: 'shared_skill', profession: 'WARRIOR', professionLabel: '前衛', rarity: 4 }, status }
}
function copyVersion(source: CoverageVersionInfo, snapshot: CoverageSnapshot, id: string, rows = snapshot.rows) {
  const nextSnapshot: CoverageSnapshot = { ...snapshot, id, label: id, rows }
  const version: CoverageVersionInfo = { ...source, id, label: id, file: `${id}.json`,
    skillCount: rows.length, counts: countCoverageRecords(rows) }
  return { version, snapshot: nextSnapshot }
}

test('保存済みv1・v2を同じ915スキルで集計し、4区分の内訳と変更71件を保持する', () => {
  const summaries = summarizeCoverageVersions(versions, snapshots, ['v2', 'v1'], all)
  assert.deepEqual(summaries.map(entry => entry.version.id), ['v1', 'v2'])
  assert.deepEqual(summaries.map(entry => entry.summary.count), [915, 915])
  assert.deepEqual(summaries.map(entry => totals(entry.summary)), [[242, 10, 63, 600, 0], [286, 10, 77, 542, 0]])
  assert.deepEqual(summaries.map(entry => totals(entry.summary, 1)), [[248, 7, 60, 600, 0], [292, 7, 74, 542, 0]])
  assert.deepEqual(summaries.map(entry => totals(entry.summary, 2)), [[213, 6, 5, 600, 91], [255, 6, 5, 542, 107]])
  assert.deepEqual(summaries.map(entry => totals(entry.summary, 3)), [[129, 1, 1, 652, 132], [153, 1, 1, 590, 170]])
  const changes = compareCoverageVersionRows(saved[0].rows, saved[1].rows, all)
  assert.equal(changes.length, 71)
  assert.deepEqual(Object.fromEntries(['新規対応', '登録追加', '変更', 'カタログ追加', 'カタログ削除']
    .map(label => [label, changes.filter(change => getCoverageChangeLabel(change) === label).length])),
  { 新規対応: 44, 登録追加: 14, 変更: 13, カタログ追加: 0, カタログ削除: 0 })
  // Asking for a change list must not reduce the chart denominator to the 71 changed rows.
  assert.deepEqual(summaries.map(entry => entry.summary.count), [915, 915])
  const tableFilters = { ...all, query: 'スルト', status: 'SUPPORTED' as const }
  assert.deepEqual(summarizeCoverageVersions(versions, snapshots, ['v1', 'v2'], tableFilters)
    .map(entry => entry.summary.count), [915, 915])
})

test('職業・レアリティは各版の同じ条件へ適用し、版データを変更しない', () => {
  const before = canonicalCoverageJson(snapshots)
  const guards = summarizeCoverageVersions(versions, snapshots, ['v1', 'v2'], { ...all, profession: 'WARRIOR' })
  assert.deepEqual(guards.map(entry => entry.summary.count), [189, 189])
  assert.deepEqual(guards.map(entry => totals(entry.summary)), [[116, 7, 14, 52, 0], [127, 7, 17, 38, 0]])
  const sixStar = summarizeCoverageVersions(versions, snapshots, ['v1', 'v2'], { profession: 'WARRIOR', rarity: 6 })
  assert.deepEqual(sixStar.map(entry => entry.summary.count), [90, 90])
  assert.ok(sixStar.every(entry => entry.rows.every(row => row.skill.profession === 'WARRIOR' && row.skill.rarity === 6)))
  const empty = summarizeCoverageVersions(versions, snapshots, ['v2'], { profession: 'WARRIOR', rarity: 1 })[0]
  assert.equal(empty.summary.count, 0)
  assert.ok(empty.summary.sections.every(section => section.buckets.every(bucket => bucket.count === 0 && bucket.proportion === 0)))
  assert.equal(canonicalCoverageJson(snapshots), before)
})

test('職業やレアリティが変更されても、絞り込み境界を越えただけでカタログ追加・削除にしない', () => {
  const before = fixture('changed'), after = structuredClone(before)
  after.skill.profession = 'CASTER'; after.skill.professionLabel = '術師'; after.skill.rarity = 5
  after.status = 'SUPPORTED'
  for (const filters of [{ profession: 'WARRIOR', rarity: 4 }, { profession: 'CASTER', rarity: 5 }] as const) {
    const changes = compareCoverageVersionRows([before], [after], filters)
    assert.equal(changes.length, 1)
    assert.equal(changes[0].kind, 'CHANGED')
    assert.equal(changes[0].key, coverageRecordKey(before))
    assert.deepEqual(changes[0].fields, ['スキル情報', '総合'])
    assert.equal(getCoverageChangeLabel(changes[0]), '新規対応')
  }
  assert.deepEqual(compareCoverageVersionRows([before], [after], { profession: 'MEDIC', rarity: 'ALL' }), [])
})

test('真のカタログ追加・削除を新規対応と分離し、版ごとの母集団を保存する', () => {
  const retained = fixture('retained', 'SUPPORTED'), removed = fixture('removed', 'SUPPORTED'), added = fixture('added', 'SUPPORTED')
  const first = copyVersion(versions[0], saved[0], 'v1', [retained, removed])
  const second = copyVersion(versions[1], saved[1], 'v2', [retained, added, fixture('extra')])
  const cache = Object.fromEntries([first, second].map(entry => [canonicalCoverageJson(entry.version), entry.snapshot]))
  const summaries = summarizeCoverageVersions([first.version, second.version], cache, ['v1', 'v2'], all)
  assert.deepEqual(summaries.map(entry => entry.summary.count), [2, 3])
  const changes = compareCoverageVersionRows(first.snapshot.rows, second.snapshot.rows, all)
  assert.deepEqual(changes.map(change => [change.after?.skill.operatorId ?? change.before?.skill.operatorId, getCoverageChangeLabel(change)]),
    [['added', 'カタログ追加'], ['extra', 'カタログ追加'], ['removed', 'カタログ削除']])
})

test('選択した版がない・未読込・メタデータが変わった場合に部分的な集計へ置き換えない', () => {
  assert.throws(() => summarizeCoverageVersions(versions, {}, ['v1', 'v2'], all), /読み込まれていません/)
  const firstOnly = { [canonicalCoverageJson(versions[0])]: saved[0] }
  assert.throws(() => summarizeCoverageVersions(versions, firstOnly, ['v1', 'v2'], all), /v2.*読み込まれていません/)
  assert.throws(() => summarizeCoverageVersions(versions, snapshots, ['v3'], all), /バージョン「v3」がありません/)
  const altered = [{ ...versions[0], label: '差し替えられたメタデータ' }, versions[1]]
  assert.throws(() => summarizeCoverageVersions(altered, snapshots, ['v1'], all), /読み込まれていません/)
  assert.deepEqual(summarizeCoverageVersions(versions, {}, [], all), [])
})

test('3版以上と選択の順序・重複を扱い、v10をv2より後へ並べる', () => {
  const tenth = copyVersion(versions[1], saved[1], 'v10')
  const unordered = [tenth.version, versions[1], versions[0]]
  const cache = { ...snapshots, [canonicalCoverageJson(tenth.version)]: tenth.snapshot }
  const summaries = summarizeCoverageVersions(unordered, cache, ['v10', 'v1', 'v2', 'v2'], all)
  assert.deepEqual(summaries.map(entry => entry.version.id), ['v1', 'v2', 'v10'])
  assert.equal(unordered[0].id, 'v10')
})

test('条件付き対応を利用可能に含め、逆方向の比較を新規対応としない', () => {
  const before = fixture('one', 'PENDING'), after = { ...before, status: 'CONDITIONAL' as const }
  assert.equal(getCoverageChangeLabel(compareCoverageVersionRows([before], [after], all)[0]), '新規対応')
  assert.equal(getCoverageChangeLabel(compareCoverageVersionRows([after], [before], all)[0]), '変更')
  const supported = { ...before, status: 'SUPPORTED' as const }
  assert.equal(getCoverageChangeLabel(compareCoverageVersionRows([supported], [after], all)[0]), '変更')
})
