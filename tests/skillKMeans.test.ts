import test from 'node:test'
import assert from 'node:assert/strict'
import { classifySkill } from '../src/lib/classifier.ts'
import {
  buildSkillKMeansCorpus,
  createSkillKMeansEngine,
  createSkillKMeansFeatures,
  type SkillKMeansConfig,
  type SkillKMeansDocument,
  type SkillKMeansFeatures,
  type SkillKMeansResult,
} from '../src/lib/skillKMeans.ts'
import type { SkillKMeansWorkerRequest, SkillKMeansWorkerResponse } from '../src/lib/skillKMeans.worker.ts'
import type { SkillRecord } from '../src/types/skill.ts'

function close(actual: number, expected: number, tolerance = 1e-10): void {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`)
}

function document(description: string, index: number): SkillKMeansDocument {
  return { id: `document-${index}`, description, recordIds: [`source-${index}`], operatorName: 'テスト名', skillName: '名称', skillIndex: 1 }
}

function denseFeatures(rows: number[][]): SkillKMeansFeatures {
  return {
    terms: rows[0].map((_, index) => `term${index}`),
    vectors: rows.map((row) => ({ indices: row.map((_, index) => index), values: row })),
    documentIndices: rows.map((_, index) => index), excludedIndices: [], documentCount: rows.length,
  }
}

const config: SkillKMeansConfig = { k: 2, seed: 2, maxIterations: 30 }

function train(features: SkillKMeansFeatures, settings: SkillKMeansConfig = config): SkillKMeansResult {
  const engine = createSkillKMeansEngine(features, settings)
  while (!engine.snapshot().converged) engine.step()
  return engine.snapshot()
}

test('平均二乗距離は次元数では割らず、各説明文と中心の二乗距離を説明文数で平均する', () => {
  const features = denseFeatures([[1, 0], [0, 1]])
  const engine = createSkillKMeansEngine(features, { ...config, k: 1 })
  close(engine.snapshot().history[0].meanSquaredDistance, 1)
  engine.step()
  const result = engine.snapshot()
  // Center=(0.5, 0.5); both squared distances are 0.5, not 0.25.
  close(result.history.at(-1)!.meanSquaredDistance, 0.5)
  assert.equal(result.stopReason, 'stable-assignments')
  assert.equal(result.history.at(-1)!.changes, 0)
})

test('同じ初期値は同じ結果を返し、分離した二群を復元する', () => {
  const features = denseFeatures([[1, 0], [0.99, 0.01], [0, 1], [0.01, 0.99]])
  const first = train(features)
  assert.deepEqual(first, train(features))
  assert.equal(first.assignments[0], first.assignments[1])
  assert.equal(first.assignments[2], first.assignments[3])
  assert.notEqual(first.assignments[0], first.assignments[2])
  assert.deepEqual(first.counts, [2, 2])
  close(first.history.at(-1)!.meanSquaredDistance, 0.00005)
  first.representativeIndices.forEach((index, cluster) => assert.equal(first.assignments[index], cluster))
})

test('反復で目的関数が増加せず、所属変更数と件数が整合する', () => {
  const rows = Array.from({ length: 40 }, (_, index) => [1 + (index % 5) / 9, index % 7, (index * 3) % 11])
  for (const k of [1, 2, 4, 8]) {
    for (const seed of [0, 1, 42, 99999]) {
      const engine = createSkillKMeansEngine(denseFeatures(rows), { ...config, k, seed })
      let previous = engine.snapshot()
      while (!previous.converged) {
        engine.step()
        const result = engine.snapshot()
        assert.ok(result.history.at(-1)!.meanSquaredDistance <= previous.history.at(-1)!.meanSquaredDistance + 1e-10)
        const changes = result.assignments.reduce((sum, value, index) => sum + Number(value !== previous.assignments[index]), 0)
        assert.equal(result.history.at(-1)!.changes, changes)
        assert.equal(result.counts.reduce((sum, count) => sum + count, 0), rows.length)
        result.counts.forEach((count, cluster) => assert.equal(count, result.assignments.filter((value) => value === cluster).length))
        previous = result
      }
      assert.ok(previous.iteration <= config.maxIterations)
      assert.ok(previous.history.every((point) => Number.isFinite(point.meanSquaredDistance) && point.meanSquaredDistance >= 0))
      engine.step()
      assert.deepEqual(engine.snapshot(), previous)
    }
  }
})

test('空クラスタは架空の所属を作らず、代表文なしと空の代表語で返す', () => {
  const result = train(denseFeatures([[1, 0], [1, 0], [1, 0]]), { ...config, k: 3 })
  assert.deepEqual(result.counts, [3, 0, 0])
  assert.deepEqual(result.representativeIndices.slice(1), [-1, -1])
  assert.deepEqual(result.representativeTerms.slice(1), [[], []])
  close(result.history.at(-1)!.meanSquaredDistance, 0)
})

test('反復上限の終了理由を収束と区別する', () => {
  const rows = Array.from({ length: 40 }, (_, index) => [1 + index % 5, index % 7, (index * 3) % 11])
  const results = Array.from({ length: 10 }, (_, seed) => train(denseFeatures(rows), { ...config, seed, maxIterations: 1 }))
  const limited = results.find((result) => result.stopReason === 'max-iterations')
  assert.ok(limited, 'one initialization must still move assignments at the cap')
  assert.equal(limited.iteration, 1)
  assert.equal(limited.converged, true)
  assert.ok(limited.history.at(-1)!.changes! > 0)
})

test('スナップショットの編集が学習状態や設定を変更しない', () => {
  const settings = { ...config }
  const engine = createSkillKMeansEngine(denseFeatures([[1, 0], [0, 1]]), settings)
  const original = engine.snapshot()
  const edited = engine.snapshot()
  edited.assignments[0] = -100
  edited.config.k = 100
  edited.history[0].meanSquaredDistance = 99
  edited.representativeTerms[0].push('fake')
  assert.deepEqual(engine.snapshot(), original)
  assert.deepEqual(settings, config)
  settings.k = 99
  settings.maxIterations = 0
  engine.step()
  assert.deepEqual(engine.snapshot().config, config)
  assert.equal(engine.snapshot().counts.length, 2)
})

test('軽量評価は特徴量の行順で返し、代表語なしでスナップショットと同じ目的関数を返す', () => {
  const features = denseFeatures([[1, 0], [0.9, 0.1], [0, 1], [0.1, 0.9]])
  features.documentIndices = [0, 2, 4, 5]
  features.excludedIndices = [1, 3]
  features.documentCount = 6
  const engine = createSkillKMeansEngine(features, config)
  while (!engine.step()) { /* train */ }
  const evaluation = engine.evaluate()
  const snapshot = engine.snapshot()
  close(evaluation.meanSquaredDistance, snapshot.history.at(-1)!.meanSquaredDistance)
  assert.deepEqual(evaluation.assignments, features.documentIndices.map((index) => snapshot.assignments[index]))
  assert.deepEqual(evaluation.counts, snapshot.counts)
  assert.equal(evaluation.stopReason, snapshot.stopReason)
  assert.equal(evaluation.iteration, snapshot.iteration)
  assert.ok(!('representativeTerms' in evaluation))
  const before = engine.evaluate()
  evaluation.assignments[0] = -1
  evaluation.counts[0] = -1
  assert.deepEqual(engine.evaluate(), before)
  assert.equal(engine.step(), true)
})

test('K・初期値・反復上限と不正な特徴量を拒否する', () => {
  const features = denseFeatures([[1, 0], [0, 1]])
  for (const k of [0, -1, 1.5, 3, NaN, Infinity]) {
    assert.throws(() => createSkillKMeansEngine(features, { ...config, k }), RangeError)
  }
  for (const seed of [-1, 1.5, 2 ** 32, NaN]) {
    assert.throws(() => createSkillKMeansEngine(features, { ...config, seed }), RangeError)
  }
  for (const maxIterations of [0, -1, 1.5, 1001, NaN]) {
    assert.throws(() => createSkillKMeansEngine(features, { ...config, maxIterations }), RangeError)
  }
  assert.throws(() => createSkillKMeansEngine({ ...features, documentIndices: [0, 0] }, config), RangeError)
  assert.throws(() => createSkillKMeansEngine({ ...features, vectors: [{ indices: [0], values: [NaN] }] }, config), RangeError)
  assert.throws(() => createSkillKMeansEngine(createSkillKMeansFeatures([]), config), RangeError)
})

test('説明文を展開してから同一skillIdと同一表示文を重複排除し、全元レコードへの対応を保持する', () => {
  const rows = [
    skill('a:one', 'same-skill', '<@ba.vup>攻撃力+{atk:0%}</>\\n防御力上昇'),
    skill('b:one', 'same-skill', '異なる表現でも共有スキル'),
    skill('c:two', 'other-skill', '攻撃力+１００% 防御力上昇'),
    skill('d:three', 'third-skill', '味方のHPを回復'),
    skill('e:empty', 'empty-skill', '  <b> </b>\\n '),
  ]
  const result = buildSkillKMeansCorpus(rows)
  assert.equal(result.sourceCount, 5)
  assert.equal(result.duplicateCount, 2)
  assert.equal(result.emptyCount, 1)
  assert.equal(result.documents.length, 2)
  assert.equal(result.documents[0].description, '攻撃力+100% 防御力上昇')
  assert.deepEqual(result.documents[0].recordIds, ['a:one', 'b:one', 'c:two'])
  assert.deepEqual(buildSkillKMeansCorpus([...rows].reverse()), result)
  assert.deepEqual(result.documents.flatMap((row) => row.recordIds).sort(), rows.slice(0, 4).map((row) => row.id))
})

test('特徴量は語のTF-IDFを正規化し、数値・名前・既存分類を入力しない', () => {
  const documents = [document('テスト名 攻撃ダメージ 攻撃ダメージ 100%', 0), document('治療 回復 200%', 1), document('100% 20秒 の に を', 2)]
  const features = createSkillKMeansFeatures(documents)
  assert.deepEqual(features.documentIndices, [0, 1])
  assert.deepEqual(features.excludedIndices, [2])
  assert.ok(!features.terms.some((term) => /\d|テスト名/u.test(term)))
  features.vectors.forEach((vector) => close(vector.values.reduce((sum, value) => sum + value ** 2, 0), 1))
  const result = train(features)
  assert.equal(result.assignments[2], -1)
  assert.equal(result.counts.reduce((sum, count) => sum + count, 0), 2)
  assert.throws(() => createSkillKMeansEngine(features, { ...config, k: 3 }), RangeError)
  const first = skill('a', 'first', '攻撃力+100%')
  const changedLabel = { ...first, classification: classifySkill({ description: '回復する' }) }
  assert.deepEqual(createSkillKMeansFeatures(buildSkillKMeansCorpus([first]).documents), createSkillKMeansFeatures(buildSkillKMeansCorpus([changedLabel]).documents))
})

test('短いオペレーター名は単語全体との一致時だけ除外し、ダウン・カウント・カウンターを壊さない', () => {
  const source = { ...document('ウン ダウン カウント カウンター 攻撃', 0), operatorName: 'ウン' }
  const features = createSkillKMeansFeatures([source])
  assert.ok(!features.terms.includes('ウン'))
  for (const word of ['ダウン', 'カウント', 'カウンター', '攻撃']) assert.ok(features.terms.includes(word), word)
  assert.deepEqual(features.documentIndices, [0])
})

test('複合名の各単語と数字を含む名前も説明文と同じ正規化で除外する', () => {
  const sources = [
    { ...document('シヴィライト・エテルナ 攻撃 防御 上昇', 0), operatorName: 'シヴィライト・エテルナ' },
    { ...document('Mon3tr 治療 回復 ダウン カウント', 1), operatorName: 'Mon3tr' },
  ]
  const features = createSkillKMeansFeatures(sources)
  for (const word of ['シヴィライト', 'エテルナ', 'mon', 'tr', 'mon3tr']) assert.ok(!features.terms.includes(word), word)
  for (const word of ['攻撃', '防御', '上昇', '治療', '回復', 'ダウン', 'カウント']) assert.ok(features.terms.includes(word), word)
  assert.deepEqual(features.documentIndices, [0, 1])
})

test('Workerは初回結果・1反復・一時停止・再開を返し、古いrequestIdを無視する', async () => {
  const messages: SkillKMeansWorkerResponse[] = []
  const scope = { onmessage: null as ((event: MessageEvent<SkillKMeansWorkerRequest>) => void) | null, postMessage: (message: SkillKMeansWorkerResponse) => messages.push(message) }
  const globals = globalThis as unknown as { self: typeof scope }
  const previousSelf = globals.self
  globals.self = scope
  const originalSetTimeout = globalThis.setTimeout
  const originalClearTimeout = globalThis.clearTimeout
  const scheduled = new Map<number, () => void>()
  let nextTimer = 1
  try {
    await import('../src/lib/skillKMeans.worker.ts')
    globalThis.setTimeout = ((callback: () => void) => { const id = nextTimer++; scheduled.set(id, callback); return id }) as unknown as typeof setTimeout
    globalThis.clearTimeout = ((id: number) => { scheduled.delete(id) }) as unknown as typeof clearTimeout
    const send = (request: SkillKMeansWorkerRequest) => scope.onmessage!({ data: request } as MessageEvent<SkillKMeansWorkerRequest>)
    const documents = [
      '攻撃 ダメージ 物理', '攻撃 ダメージ 術', '攻撃 範囲 物理', '攻撃 範囲 術',
      '治療 回復 味方', '回復 味方 範囲', '回復 治療 攻撃', '攻撃 速度 上昇',
    ].map(document)
    const settings: SkillKMeansConfig = { ...config, k: 3 }
    send({ type: 'start', requestId: 1, documents, config: settings, stepOnly: true })
    assert.equal(messages.length, 2)
    const initial = messages[0]
    const stepped = messages[1]
    assert.equal(initial.type, 'result')
    assert.equal(stepped.type, 'result')
    if (initial.type !== 'result' || stepped.type !== 'result') assert.fail('results expected')
    assert.equal(initial.result.iteration, 0)
    assert.equal(stepped.result.iteration, 1)
    assert.deepEqual(stepped.result.config, settings)
    assert.equal('results' in stepped, false)
    assert.equal(scheduled.size, 0)
    assert.equal(stepped.paused, !stepped.complete)
    assert.ok(stepped.elapsedMs >= 0)
    send({ type: 'pause', requestId: 0 })
    assert.equal(messages.length, 2)
    send({ type: 'resume', requestId: 1 })
    let turns = 0
    while (scheduled.size && turns < 100) {
      const [id, callback] = scheduled.entries().next().value!
      scheduled.delete(id)
      callback()
      turns += 1
    }
    assert.ok(turns < 100)
    const finished = messages.at(-1)!
    assert.equal(finished.type, 'result')
    if (finished.type !== 'result') assert.fail('completed result expected')
    assert.equal(finished.complete, true)
    assert.equal(finished.paused, false)
    assert.deepEqual(finished.result, train(createSkillKMeansFeatures(documents), settings))
    send({ type: 'start', requestId: 2, documents, config: settings, stepOnly: false })
    assert.equal(scheduled.size, 1)
    const oldTimer = scheduled.values().next().value!
    send({ type: 'pause', requestId: 2 })
    assert.equal(scheduled.size, 0)
    const pausedResult = messages.at(-1)!
    assert.equal(pausedResult.type, 'result')
    if (pausedResult.type === 'result') assert.equal(pausedResult.paused, true)
    send({ type: 'step', requestId: 2 })
    const nextResult = messages.at(-1)!
    if (nextResult.type === 'result') assert.equal(nextResult.result.iteration, 1)
    send({ type: 'start', requestId: 3, documents: [], config: settings, stepOnly: false })
    assert.equal(messages.at(-1)!.type, 'error')
    assert.equal(messages.at(-1)!.requestId, 3)
    const messageCount = messages.length
    oldTimer()
    assert.equal(messages.length, messageCount)
    assert.equal(scheduled.size, 0)
  } finally {
    globalThis.setTimeout = originalSetTimeout
    globalThis.clearTimeout = originalClearTimeout
    globals.self = previousSelf
  }
})

function skill(id: string, skillId: string, description: string): SkillRecord {
  const raw = { description, blackboard: [{ key: 'atk', value: 1 }] }
  return {
    id, operatorId: id.split(':')[0], operatorName: id.split(':')[0], profession: 'WARRIOR', professionLabel: '前衛',
    subProfessionId: 'test', subProfessionName: 'テスト', nameInitial: 'T_ROW', rarity: 6,
    skillIndex: 1, skillId, skillName: skillId, description,
    duration: null, durationType: 'NONE', skillType: 'MANUAL', spType: 'INCREASE_WITH_TIME', initSp: 0, spCost: 10,
    classification: classifySkill(raw), skillLevels: [raw], operatorProfile: { phases: [], favorKeyFrames: [] }, raw,
  }
}
