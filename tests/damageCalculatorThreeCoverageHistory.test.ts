import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import {
  canonicalCoverageJson, countCoverageRecords, coverageRecordKey, createCoverageHistoryClient,
  diffCoverageRecords, parseCoverageIndex, parseCoverageSnapshot, toCoverageRecords,
  type CoverageRecord, type CoverageSnapshot, type CoverageVersionInfo,
} from '../src/lib/damageCalculatorThreeCoverageHistory.ts'
import type { DamageCalculatorThreeCoverageRow } from '../src/lib/damageCalculatorThreeCoverage.ts'

function record(operatorId = 'char_example', skillIndex = 1): CoverageRecord {
  return {
    skill: { id: `${operatorId}:skill_shared`, operatorId, operatorName: 'テスト', skillId: 'skill_shared', skillIndex,
      skillName: '強撃', profession: 'WARRIOR', professionLabel: '前衛', rarity: 4, subProfessionName: '勇士' },
    status: 'UNSUPPORTED', sections: { skill: 'UNSUPPORTED', talent: 'NOT_APPLICABLE', trait: 'UNSUPPORTED' },
    details: [{ id: 'skill', label: 'スキル', name: '強撃', status: 'UNSUPPORTED' },
      { id: 'talent-none', label: '素質', name: 'なし', status: 'NOT_APPLICABLE' },
      { id: 'trait', label: '特性', name: '勇士', status: 'UNSUPPORTED' }],
    calculationScope: [], supportedConditions: [], deferredReasons: [], scopeNotes: [], issues: [],
  }
}
function snapshot(rows = [record()]): CoverageSnapshot {
  return { schemaVersion: 1, id: 'v1', label: '拡張前', capturedAt: '2026-11-04T00:00:00.000Z',
    source: { codeRevision: 'a'.repeat(40), codeDirty: false, codeFingerprint: 'b'.repeat(64),
      gameDataRevision: 'c'.repeat(40), gameDataFingerprint: 'd'.repeat(64), reconstructed: true }, rows }
}
function version(value: CoverageSnapshot): CoverageVersionInfo {
  const { rows, ...metadata } = value
  return { ...metadata, file: `${value.id}.json`, sha256: createHash('sha256').update(JSON.stringify(value)).digest('hex'),
    skillCount: rows.length, counts: countCoverageRecords(rows) }
}

test('履歴は未対応を含む母集団と区分・理由を保持し、ライブプロフィールを含めない', () => {
  const row = record()
  const live = { ...row, skill: { ...row.skill, operatorProfile: { phases: [{}, {}, { maxLevel: 70 }] },
    skillLevels: [{ name: '将来更新される値' }] }, selection: { operatorId: row.skill.operatorId, skillId: row.skill.skillId,
    skillIndex: 1, levelIndex: 9 } } as unknown as DamageCalculatorThreeCoverageRow
  const [saved] = toCoverageRecords([live])
  assert.equal(saved.conditionsLabel, '昇進2・Lv70・信頼100・特化3・潜在1・MODなし')
  assert.ok(!('operatorProfile' in saved.skill) && !('skillLevels' in saved.skill))
  assert.equal(saved.sections.talent, 'NOT_APPLICABLE')
  const loaded = parseCoverageSnapshot(snapshot([saved, record('other')]))
  assert.equal(loaded.rows.length, 2)
  assert.deepEqual(countCoverageRecords(loaded.rows), { SUPPORTED: 0, CONDITIONAL: 0, PENDING: 0, UNSUPPORTED: 2 })
  live.skill.operatorName = '新しい名前'
  assert.equal(saved.skill.operatorName, 'テスト')
})

test('共有skillIdの別OP・別S番号を混同せず、カタログ追加・削除と既存行変更を区別する', () => {
  const before = [record('one'), record('two'), record('one', 2)]
  const next = structuredClone(before[0])
  next.status = 'SUPPORTED'
  next.sections.skill = 'SUPPORTED'
  const added = record('three')
  const changes = diffCoverageRecords(before, [next, before[1], added])
  assert.deepEqual(changes.map(change => [change.kind, change.before?.skill.operatorId, change.after?.skill.operatorId]),
    [['CHANGED', 'one', 'one'], ['REMOVED', 'one', undefined], ['ADDED', undefined, 'three']])
  assert.deepEqual(changes[0].fields, ['総合', 'スキル'])
  const replaced = structuredClone(before[0])
  replaced.skill.skillId = 'new_skill_id'
  assert.equal(coverageRecordKey(replaced), coverageRecordKey(before[0]))
  assert.deepEqual(diffCoverageRecords([before[0]], [replaced]).map(change => [change.kind, change.fields]),
    [['CHANGED', ['スキル情報']]])
})

test('総合が同じでも素質・特性・範囲・条件・保留理由・詳細の変化を検出する', () => {
  const before = record(), next = structuredClone(before)
  next.sections.talent = 'SUPPORTED'
  next.details[1] = { id: 'talent-1', label: '素質1', name: '攻撃力上昇', status: 'SUPPORTED' }
  next.details[2] = { ...next.details[2], name: '術戦士' }
  next.calculationScope = ['通常攻撃']
  next.supportedConditions = ['ブロック中']
  next.deferredReasons = ['範囲外']
  next.scopeNotes = ['単体']
  next.issues = [{ id: 'pending', reason: '未確定', relatedSections: ['スキル'], impact: 'BLOCKING' }]
  assert.deepEqual(diffCoverageRecords([before], [next])[0].fields,
    ['素質', '特性', '計算範囲', '対応条件', '保留理由', '対象範囲', '保留事項'])
})

test('表示リストや行の並べ替え・一時的id変更だけでは差分にならず、入力を変更しない', () => {
  const a = record('one'), b = record('two')
  a.supportedConditions = ['条件A', '条件B']
  a.issues = [{ id: 'x', reason: 'a・b：理由', relatedSections: ['スキル', '素質1'], impact: 'BLOCKING', stages: ['a', 'b'] }]
  const copy = structuredClone(a)
  copy.skill.id = 'different-render-key'
  copy.details = [...copy.details].reverse()
  copy.supportedConditions = [...copy.supportedConditions].reverse()
  copy.issues = [{ ...copy.issues[0], reason: 'b・a：理由', relatedSections: ['素質1', 'スキル'], stages: ['b', 'a'] }]
  const original = structuredClone([a, b, copy])
  assert.deepEqual(diffCoverageRecords([a, b], [b, copy]), [])
  assert.deepEqual([a, b, copy], original)
  assert.equal(canonicalCoverageJson({ b: 2, a: 1 }), canonicalCoverageJson({ a: 1, b: 2 }))
})

test('不明な状態・重複スキル・不一致の選択・不正な版パスや件数は拒否する', () => {
  const validSnapshot = snapshot(), validVersion = version(validSnapshot)
  assert.equal(parseCoverageIndex({ schemaVersion: 1, versions: [validVersion] }).versions.length, 1)
  for (const invalid of [
    { ...validSnapshot, schemaVersion: 2 },
    { ...validSnapshot, rows: [record(), record()] },
    { ...validSnapshot, rows: [{ ...record(), status: 'MAYBE' }] },
    { ...validSnapshot, rows: [{ ...record(), details: [...record().details, { id: 'unknown-detail', label: '未知', name: '未知', status: 'SUPPORTED' }] }] },
    { ...validSnapshot, rows: [{ ...record(), selection: { operatorId: 'wrong', skillId: 'skill_shared', skillIndex: 1, levelIndex: 9 } }] },
  ]) assert.throws(() => parseCoverageSnapshot(invalid), /不正|重複/)
  for (const invalid of [
    { ...validVersion, file: '../v1.json' },
    { ...validVersion, skillCount: 99 },
    { ...validVersion, sha256: 'not-a-hash' },
  ]) assert.throws(() => parseCoverageIndex({ schemaVersion: 1, versions: [invalid] }), /不正/)
  assert.throws(() => parseCoverageIndex({ schemaVersion: 1, versions: [validVersion, validVersion] }), /不正/)
  assert.throws(() => diffCoverageRecords([record(), record()], []), /重複/)
})

test('版ファイルをハッシュ・メタデータ・件数で検証し、失敗しても現在版に置き換えない', async () => {
  const value = snapshot(), info = version(value), requests: string[] = []
  const client = createCoverageHistoryClient({ base: '/arknights_2/', fetch: async (url) => {
    requests.push(String(url))
    return new Response(JSON.stringify(String(url).endsWith('index.json') ? { schemaVersion: 1, versions: [info] } : value))
  } })
  assert.equal((await client.loadIndex()).versions[0].id, 'v1')
  assert.deepEqual(await client.loadSnapshot(info), value)
  assert.deepEqual(requests, ['/arknights_2/data/dc3-coverage/index.json', '/arknights_2/data/dc3-coverage/v1.json'])
  await assert.rejects(client.loadSnapshot({ ...info, sha256: 'f'.repeat(64) }), /一致しません/)
  await assert.rejects(client.loadSnapshot({ ...info, label: '別の版' }), /一致しません/)
  await assert.rejects(client.loadSnapshot({ ...info, counts: { SUPPORTED: 1, CONDITIONAL: 0, PENDING: 0, UNSUPPORTED: 0 } }), /一致しません/)
  const missing = createCoverageHistoryClient({ fetch: async () => new Response('', { status: 404 }) })
  await assert.rejects(missing.loadIndex(), /取得できません/)
  await assert.rejects(missing.loadSnapshot(info), /取得できません/)
})

test('読込失敗後に同じ版を再試行でき、キャンセル信号をfetchへ引き継ぐ', async () => {
  const value = snapshot(), info = version(value), controller = new AbortController()
  let attempt = 0
  const client = createCoverageHistoryClient({ fetch: async (_url, init) => {
    assert.equal(init?.signal, controller.signal)
    if (attempt++ === 0) throw new Error('offline')
    return new Response(JSON.stringify(value))
  } })
  await assert.rejects(client.loadSnapshot(info, controller.signal), /offline/)
  assert.deepEqual(await client.loadSnapshot(info, controller.signal), value)
})
