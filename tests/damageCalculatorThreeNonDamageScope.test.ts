import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { getDamageCalculatorThreeNonDamageScope } from '../src/lib/damageCalculatorThreeNonDamageScope.ts'
import { buildDamageCalculatorThreeCoverage, COVERAGE_STATUS_OPTIONS } from '../src/lib/damageCalculatorThreeCoverage.ts'
import { filterDamageCalculatorThreeCoverage, EMPTY_DAMAGE_THREE_COVERAGE_FILTERS } from '../src/lib/damageCalculatorThreeCoverageFilters.ts'
import { summarizeDamageCalculatorThreeCoverage } from '../src/lib/damageCalculatorThreeCoverageSummary.ts'
import { getCoverageChangeLabel } from '../src/lib/damageCalculatorThreeCoverageComparison.ts'
import { countCoverageRecords, coverageRecordKey, createCoverageHistoryClient, diffCoverageRecords, parseCoverageIndex,
  parseCoverageSnapshot, toCoverageRecords, type CoverageSnapshot, type CoverageVersionInfo } from '../src/lib/damageCalculatorThreeCoverageHistory.ts'
import { getExpandedSource } from '../src/lib/expandedCombatRegistry.ts'
import { classifySkill } from '../src/lib/classifier.ts'
import type { ExpandedOperatorSource } from '../src/lib/expandedCombatTypes.ts'
import type { SkillRecord } from '../src/types/skill.ts'

const sources = JSON.parse(readFileSync(new URL('../src/data/dc3NonDamageSources.json', import.meta.url), 'utf8')) as ExpandedOperatorSource[]
function record(source: ExpandedOperatorSource, index: number): SkillRecord {
  const skill = source.skills.find(entry => entry.skillIndex === index)!, raw = structuredClone(skill.raw)
  return { id: `${source.operatorId}/${index}`, operatorId: source.operatorId, operatorName: source.operatorName,
    profession: source.profession, professionLabel: source.profession, rarity: source.rarity,
    subProfessionId: source.subProfessionId, subProfessionName: source.subProfessionId, nameInitial: 'OTHER',
    skillIndex: index, skillId: skill.skillId, skillName: raw.name!, description: raw.description!,
    duration: raw.duration!, durationType: raw.durationType!, skillType: raw.skillType!,
    spType: raw.spData!.spType!, spCost: raw.spData!.spCost!, initSp: raw.spData!.initSp!,
    classification: classifySkill(raw), raw, skillLevels: Array.from({ length: source.skillLevelIndex + 1 }, () => structuredClone(raw)),
    operatorProfile: structuredClone(source.profile) }
}
const reviewed = sources.flatMap(source => source.skills.map(skill => record(source, skill.skillIndex)))
const coverage = buildDamageCalculatorThreeCoverage(reviewed)
const frozen = toCoverageRecords(coverage)
const readSnapshot = (id: string) => parseCoverageSnapshot(JSON.parse(readFileSync(
  new URL(`../public/data/dc3-coverage/${id}.json`, import.meta.url), 'utf8')))

test('レビュー済み45名82スキルだけを対象外として残し、対応件数へ加算しない', () => {
  assert.equal(sources.length, 45)
  assert.equal(reviewed.length, 82)
  assert.equal(coverage.length, 82)
  for (const row of coverage) {
    assert.equal(row.status, 'NOT_APPLICABLE', `${row.skill.operatorName} S${row.skill.skillIndex}`)
    assert.ok(row.details.every(detail => detail.status === 'NOT_APPLICABLE'))
    assert.deepEqual(row.sections, { skill: 'NOT_APPLICABLE', talent: 'NOT_APPLICABLE', trait: 'NOT_APPLICABLE' })
    assert.deepEqual(row.calculationScope, [])
    assert.deepEqual(row.issues, [])
    assert.equal(row.selection, undefined)
  }
  assert.deepEqual(countCoverageRecords(frozen), { SUPPORTED: 0, CONDITIONAL: 0, PENDING: 0, UNSUPPORTED: 0, NOT_APPLICABLE: 82 })
  assert.ok(COVERAGE_STATUS_OPTIONS.some(option => option.value === 'NOT_APPLICABLE' && option.label === '対象外'))
  const filtered = filterDamageCalculatorThreeCoverage(coverage,
    { ...EMPTY_DAMAGE_THREE_COVERAGE_FILTERS, query: 'フォリニック S1', status: 'NOT_APPLICABLE' })
  assert.equal(filtered.length, 1)
  assert.equal(filterDamageCalculatorThreeCoverage(coverage,
    { ...EMPTY_DAMAGE_THREE_COVERAGE_FILTERS, status: 'SUPPORTED' }).length, 0)
})

test('対象外のスキル・素質・特性やスキル枠が変わると、再レビューまで自動除外しない', () => {
  const original = reviewed.find(skill => skill.operatorId === 'char_147_shining')!
  const mutations: ((skill: SkillRecord) => void)[] = [
    skill => { skill.skillLevels.at(-1)!.description += '敵に術ダメージを与える' },
    skill => { skill.skillLevels.at(-1)!.blackboard![0].value! += 1 },
    skill => { skill.skillLevels.at(-1)!.spData!.spCost! += 1 },
    skill => { skill.operatorProfile.talents!.forEach(talent => talent.candidates!.forEach(candidate => { candidate.description += '反撃する' })) },
    skill => { skill.operatorProfile.traitDescription = '反撃する'; skill.operatorProfile.trait = null },
    skill => { skill.operatorProfile.talents = [] },
    skill => { skill.operatorProfile.phases.pop() },
    skill => { skill.skillLevels.pop() },
    skill => { skill.skillLevels.push(structuredClone(skill.raw)) },
    skill => { skill.skillId = 'future-skill' },
    skill => { skill.profession = 'CASTER' },
    skill => { skill.subProfessionId = 'incantationmedic' },
  ]
  for (const mutate of mutations) {
    const changed = structuredClone(original)
    mutate(changed)
    assert.equal(getDamageCalculatorThreeNonDamageScope(changed), null)
    assert.notEqual(buildDamageCalculatorThreeCoverage([changed])[0].status, 'NOT_APPLICABLE')
  }
  // Presentation markup is not a semantic source change.
  const formatting = structuredClone(original)
  formatting.skillLevels.at(-1)!.description = ` ${formatting.skillLevels.at(-1)!.description} `
  assert.ok(getDamageCalculatorThreeNonDamageScope(formatting))
})

test('職業や回復キーワードで対象外にせず、医療の攻撃・反撃・通常攻撃継続を除外しない', () => {
  for (const [id, index] of [['char_1020_reed2', 1], ['char_1020_reed2', 2], ['char_1020_reed2', 3],
    ['char_484_robrta', 1], ['char_4162_cathy', 1], ['char_4212_nasti', 1],
    ['char_4212_nasti', 3], ['char_358_lisa', 1], ['char_183_skgoat', 1]] as const) {
    const skill = record(getExpandedSource(id)!, index)
    assert.equal(getDamageCalculatorThreeNonDamageScope(skill), null, `${id} S${index}`)
    assert.notEqual(buildDamageCalculatorThreeCoverage([skill])[0].status, 'NOT_APPLICABLE')
  }
  for (const [id, index] of [['char_003_kalts', 1], ['char_4179_monstr', 1], ['char_1052_kalts2', 1],
    ['char_4056_titi', 1], ['char_4222_taraxa', 1], ['char_4184_dolris', 1],
    ['char_345_folnic', 2], ['char_1012_skadi2', 3], ['char_4134_cetsyr', 2], ['char_381_bubble', 2],
    ['char_123_fang', 1], ['char_452_bstalk', 1]] as const) {
    const skill = { ...structuredClone(reviewed[0]), operatorId: id, skillIndex: index }
    assert.equal(getDamageCalculatorThreeNonDamageScope(skill), null, `${id} S${index}`)
  }
})

test('915スキルの母集団は対象外82件を含み、版差分で新規対応と区別する', () => {
  const previous = readSnapshot('v3').rows
  const excluded = new Map(frozen.map(row => [coverageRecordKey(row), row]))
  const current = previous.map(row => excluded.get(coverageRecordKey(row)) ?? row)
  assert.equal(current.length, 915)
  const summary = summarizeDamageCalculatorThreeCoverage(current)
  assert.equal(summary.count, 915)
  for (const section of summary.sections) assert.equal(section.buckets.reduce((sum, bucket) => sum + bucket.count, 0), 915)
  const overall = summary.sections[0].buckets
  assert.equal(overall.find(bucket => bucket.status === 'NOT_APPLICABLE')!.count, 82)
  assert.equal(overall.find(bucket => bucket.status === 'NOT_APPLICABLE')!.proportion, 82 / 915)
  const changes = diffCoverageRecords(previous, current)
  assert.equal(changes.length, 82)
  assert.ok(changes.every(change => getCoverageChangeLabel(change) === '対象外に分類'))
  const supported = { ...frozen[0], status: 'SUPPORTED' as const }
  assert.equal(getCoverageChangeLabel(diffCoverageRecords([frozen[0]], [supported])[0]), '新規対応')
})

test('旧v1-v3の4キー件数とハッシュを維持し、N/Aなしを0として読み込む', async () => {
  const index = parseCoverageIndex(JSON.parse(readFileSync(new URL('../public/data/dc3-coverage/index.json', import.meta.url), 'utf8')))
  const client = createCoverageHistoryClient({ fetch: async url => new Response(readFileSync(
    new URL(`../public${String(url)}`, import.meta.url))) })
  for (const version of index.versions.filter(version => ['v1', 'v2', 'v3'].includes(version.id))) {
    assert.equal(Object.hasOwn(version.counts, 'NOT_APPLICABLE'), false)
    const snapshot = await client.loadSnapshot(version)
    assert.equal(snapshot.rows.length, 915)
    assert.deepEqual(countCoverageRecords(snapshot.rows), version.counts)
  }
})

test('対象外を含む新しい版の保存形式を検証し、不正件数や未知の状態を受け入れない', async () => {
  const snapshot: CoverageSnapshot = { ...readSnapshot('v3'), id: 'v4', label: '対象外区分', rows: frozen }
  const bytes = JSON.stringify(snapshot), { rows, ...metadata } = snapshot
  const version: CoverageVersionInfo = { ...metadata, file: 'v4.json', sha256: createHash('sha256').update(bytes).digest('hex'),
    skillCount: rows.length, counts: countCoverageRecords(rows) }
  assert.deepEqual(parseCoverageSnapshot(snapshot), snapshot)
  assert.deepEqual(parseCoverageIndex({ schemaVersion: 1, versions: [version] }).versions[0], version)
  const client = createCoverageHistoryClient({ fetch: async () => new Response(bytes) })
  assert.deepEqual(await client.loadSnapshot(version), snapshot)
  for (const value of [undefined, -1, 1.5, 81, '82']) {
    assert.throws(() => parseCoverageIndex({ schemaVersion: 1, versions: [{ ...version,
      counts: { ...version.counts, NOT_APPLICABLE: value } }] }), /不正/)
  }
  assert.throws(() => parseCoverageSnapshot({ ...snapshot, rows: [{ ...frozen[0], status: 'NO_DAMAGE' }] }), /不正/)
})
