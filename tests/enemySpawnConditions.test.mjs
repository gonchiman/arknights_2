import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeEnemySpawns, resolveEnemySpawnDifficulty } from '../scripts/lib/enemySpawnConditions.mjs'

const spawn = (key = 'enemy_a', count = 2, extra = {}) => ({ actionType: 'SPAWN', key, count, ...extra })
const level = (actions = [spawn()], extra = {}) => ({
  enemyDbRefs: [{ id: 'enemy_a' }, { id: 'enemy_b' }], waves: [{ fragments: [{ actions }] }], ...extra,
})
const rule = (key, target, mask = 'NORMAL', replacement, extra = {}) => ({
  key, difficultyMask: mask, professionMask: 1023, buildableMask: 'ALL',
  blackboard: [{ key: 'key', valueStr: target }, ...(replacement ? [{ key: 'value', valueStr: replacement }] : [])],
  ...extra,
})
const enable = (group, mask = 'NORMAL', extra) => rule('level_hidden_group_enable', group, mask, undefined, extra)
const disable = (group, mask = 'NORMAL', extra) => rule('level_hidden_group_disable', group, mask, undefined, extra)
const replace = (from, to, mask = 'NORMAL', extra) => rule('level_enemy_replace', from, mask, to, extra)

test('stage environment selects its rune mask; unknown or contradictory contexts stay unknown', () => {
  for (const [context, expected] of [
    [{}, 'NORMAL'], [{ difficulty: 'NORMAL', diffGroup: 'NORMAL' }, 'NORMAL'],
    [{ difficulty: 'NORMAL', diffGroup: 'TOUGH' }, 'FOUR_STAR'],
    [{ difficulty: 'FOUR_STAR', diffGroup: 'NONE' }, 'FOUR_STAR'],
    [{ difficulty: 'NORMAL', diffGroup: 'EASY' }, 'EASY'],
    [{ difficulty: 'SIX_STAR' }, 'SIX_STAR'], [{ difficulty: 7 }, null],
    [{ difficulty: 'FUTURE' }, null], [{ diffGroup: 'FUTURE' }, null],
    [{ difficulty: 'EASY', diffGroup: 'TOUGH' }, null], [null, null],
  ]) assert.equal(resolveEnemySpawnDifficulty(context), expected, JSON.stringify(context))
})

test('fixed SPAWNs preserve source indices, evidence and input; display actions do not count', () => {
  const source = level([{ actionType: 'DISPLAY_ENEMY_INFO', key: 'enemy_a', count: 99 }, spawn(), spawn('enemy_a', 3)])
  const before = structuredClone(source)
  const result = analyzeEnemySpawns(source)
  assert.deepEqual(source, before)
  assert.deepEqual([...result.counts], [['enemy_a', 5]])
  assert.deepEqual([...result.reasons], [])
  assert.deepEqual(result.actions.map(({ waveIndex, fragmentIndex, actionIndex, status, resolvedCount }) =>
    [waveIndex, fragmentIndex, actionIndex, status, resolvedCount]), [[0, 0, 1, 'included', 2], [0, 0, 2, 'included', 3]])
  assert.deepEqual(result.actions[0].conditions, ['固定'])
  assert.match(result.actions[0].evidence[0], /waves\[0\].fragments\[0\].actions\[1\]/)
})

test('an explicit matching enable resolves a hidden group and records source evidence', () => {
  const source = level([spawn('enemy_a', 2, { hiddenGroup: 'fstar' })], { runes: [enable('fstar', 'FOUR_STAR')] })
  const result = analyzeEnemySpawns(source, { difficulty: 'NORMAL', diffGroup: 'TOUGH' })
  assert.deepEqual([...result.counts], [['enemy_a', 2]])
  assert.equal(result.reasons.size, 0)
  assert.equal(result.actions[0].status, 'included')
  assert.match(result.actions[0].conditions[0], /厄難で出現/)
  assert.ok(result.actions[0].evidence.some((value) => /runes\[0\].*FOUR_STAR.*fstar/.test(value)))
})

test('a group without a matching enable or disable remains unknown rather than assumed absent', () => {
  for (const runes of [[], [enable('fstar', 'FOUR_STAR')], [disable('fstar', 'FOUR_STAR')], [enable('different')]]) {
    const result = analyzeEnemySpawns(level([spawn('enemy_a', 2, { hiddenGroup: 'fstar' })], { runes }))
    assert.equal(result.actions[0].status, 'unknown')
    assert.equal(result.actions[0].resolvedCount, null)
    assert.deepEqual([...result.reasons], ['hidden-spawn-group'])
    assert.equal(result.counts.size, 0)
  }
})

test('known disabled actions contribute zero even with irrelevant invalid or random fields', () => {
  const source = level([spawn('enemy_a', 3), spawn('', -1, {
    hiddenGroup: 'off', randomSpawnGroupKey: 'random', condition: 'runtime', repeatCount: 8,
  })], { runes: [disable('off')] })
  const result = analyzeEnemySpawns(source)
  assert.equal(result.reasons.size, 0)
  assert.deepEqual([...result.counts], [['enemy_a', 3]])
  assert.equal(result.actions[1].status, 'excluded')
  assert.equal(result.actions[1].resolvedCount, 0)
  assert.match(result.actions[1].conditions[0], /出現しない/)
})

test('inactive invalid or unsupported difficulty rules do not poison ordinary SPAWNs', () => {
  const result = analyzeEnemySpawns(level([spawn()], { runes: [
    { key: 'level_enemy_replace', difficultyMask: 'FOUR_STAR' },
    { key: 'level_hidden_group_enable', difficultyMask: 'FOUR_STAR', professionMask: 36 },
  ] }))
  assert.equal(result.reasons.size, 0)
  assert.equal(result.actions[0].status, 'included')
})

test('numeric mask 7 and profession-restricted rules are not treated as universally applicable', () => {
  for (const runes of [[enable('g', 7)], [enable('g', 'NORMAL', { professionMask: 36 })],
    [disable('g', 'NORMAL', { professionMask: 36 })], [enable('g', 'NORMAL', { buildableMask: 'MELEE' })]]) {
    const result = analyzeEnemySpawns(level([spawn('enemy_a', 2, { hiddenGroup: 'g' })], { runes }))
    assert.equal(result.actions[0].status, 'unknown')
    assert.equal(result.actions[0].resolvedCount, null)
    assert.ok(result.reasons.has('unsupported-rune-difficulty') || result.reasons.has('unsupported-spawn-rule'))
  }
  const result = analyzeEnemySpawns(level([spawn()], { runes: [replace('enemy_a', 'enemy_b', 'NORMAL', { professionMask: 36 })] }))
  assert.equal(result.actions[0].status, 'unknown')
  assert.equal(result.actions[0].resolvedEnemyId, null)
})

test('conflicting hidden-group enable and disable are never resolved by array order', () => {
  for (const runes of [[enable('g'), disable('g')], [disable('g'), enable('g')]]) {
    const result = analyzeEnemySpawns(level([spawn('enemy_a', 2, { hiddenGroup: 'g' })], { runes }))
    assert.equal(result.actions[0].status, 'unknown')
    assert.ok(result.reasons.has('conflicting-hidden-group-rules'))
  }
})

test('ALL and each recognized mask require an appropriate context, including SIX_STAR', () => {
  for (const difficulty of ['NORMAL', 'FOUR_STAR', 'EASY', 'SIX_STAR']) {
    const result = analyzeEnemySpawns(level([spawn('enemy_a', 2, { hiddenGroup: 'g' })], { runes: [enable('g', difficulty)] }), { difficulty })
    assert.equal(result.reasons.size, 0)
  }
  assert.equal(analyzeEnemySpawns(level([spawn('enemy_a', 2, { hiddenGroup: 'g' })], { runes: [enable('g', 'ALL')] }), { difficulty: 'SIX_STAR' }).reasons.size, 0)
  const unknown = analyzeEnemySpawns(level([spawn()], {}), { difficulty: 'FUTURE' })
  assert.ok(unknown.reasons.has('unsupported-difficulty-context'))
  assert.equal(unknown.actions[0].status, 'unknown')
})

test('optional rune selection must be explicit; nonselected or off-difficulty options do not apply', () => {
  const source = level([spawn()], { optionalRunes: { option: [replace('enemy_a', 'enemy_b')] } })
  const pending = analyzeEnemySpawns(source)
  assert.ok(pending.reasons.has('optional-spawn-rule'))
  assert.equal(pending.actions[0].status, 'unknown')
  const selected = analyzeEnemySpawns(source, { selectedRuneIds: ['option'] })
  assert.deepEqual([...selected.counts], [['enemy_b', 2]])
  assert.ok(selected.actions[0].evidence.some((entry) => entry.includes('optionalRunes["option"][0]')))
  const none = analyzeEnemySpawns(source, { selectedRuneIds: [] })
  assert.deepEqual([...none.counts], [['enemy_a', 2]])
  assert.equal(none.reasons.size, 0)
  assert.equal(analyzeEnemySpawns(level([spawn()], { optionalRunes: { option: [replace('enemy_a', 'enemy_b', 'SIX_STAR')] } })).reasons.size, 0)
  assert.ok(analyzeEnemySpawns(source, { selectedRuneIds: ['missing'] }).reasons.has('unknown-selected-rune'))
})

test('simple replacements sum the resolved enemy and never alter registered references', () => {
  const source = level([spawn('enemy_a', 2), spawn('enemy_b', 3)], { runes: [replace('enemy_a', 'enemy_b')] })
  const original = structuredClone(source)
  const result = analyzeEnemySpawns(source)
  assert.deepEqual([...result.counts], [['enemy_b', 5]])
  assert.equal(result.reasons.size, 0)
  assert.equal(result.actions[0].resolvedEnemyId, 'enemy_b')
  assert.match(result.actions[0].conditions[0], /enemy_a → enemy_b/)
  assert.deepEqual(source, original)
})

test('ambiguous replacements, chains and cycles remain unresolved', () => {
  for (const runes of [
    [replace('enemy_a', 'enemy_b'), replace('enemy_a', 'enemy_c')],
    [replace('enemy_a', 'enemy_b'), replace('enemy_b', 'enemy_c')],
    [replace('enemy_a', 'enemy_b'), replace('enemy_b', 'enemy_a')],
    [replace('enemy_a', 'enemy_b', 7)],
  ]) {
    const result = analyzeEnemySpawns(level([spawn()], { runes }))
    assert.equal(result.actions[0].status, 'unknown')
    assert.equal(result.actions[0].resolvedEnemyId, null)
    assert.ok(result.reasons.has('enemy-replacement'))
  }
  const repeated = analyzeEnemySpawns(level([spawn()], { runes: [replace('enemy_a', 'enemy_b'), replace('enemy_a', 'enemy_b')] }))
  assert.deepEqual([...repeated.counts], [['enemy_b', 2]])
})

test('random or runtime schedules are conditional while unresolved hidden groups are unknown', () => {
  for (const extra of [{ randomSpawnGroupKey: 'g' }, { weight: 2 }, { condition: 'boss_dead' }, { managedByScheduler: false }]) {
    const result = analyzeEnemySpawns(level([spawn('enemy_a', 2, extra)]))
    assert.equal(result.actions[0].status, 'conditional')
    assert.equal(result.actions[0].resolvedCount, null)
    assert.equal(result.counts.size, 0)
  }
  const result = analyzeEnemySpawns(level([spawn('enemy_a', 0, { hiddenGroup: 'unknown', randomSpawnGroupKey: 'r' })]))
  assert.equal(result.reasons.size, 0)
  assert.equal(result.actions[0].status, 'excluded')
})

test('branch SPAWNs keep maps unresolved except actions explicitly known to be inactive', () => {
  for (const [action, expected] of [[spawn(), true], [spawn('enemy_a', 0), false], [spawn('enemy_a', 2, { hiddenGroup: 'off' }), false]]) {
    const result = analyzeEnemySpawns(level([spawn()], { runes: [disable('off')], branches: { summon: { phases: [{ actions: [action] }] } } }))
    assert.equal(result.reasons.has('branch-spawn'), expected)
    assert.equal(result.actions.length, 1)
    assert.deepEqual([...result.counts], [['enemy_a', 2]])
  }
})

test('malformed hidden group and unrecognized active rules cannot become fixed counts', () => {
  for (const hiddenGroup of [false, 0, ['g'], {}]) {
    const result = analyzeEnemySpawns(level([spawn('enemy_a', 2, { hiddenGroup })]))
    assert.equal(result.actions[0].status, 'unknown')
  }
  const result = analyzeEnemySpawns(level([spawn()], { runes: [{ key: 'level_hidden_group_future', difficultyMask: 'NORMAL' }] }))
  assert.ok(result.reasons.has('unsupported-spawn-rule'))
})

test('the total across different enemies must remain a safe integer', () => {
  const result = analyzeEnemySpawns(level([spawn('enemy_a', Number.MAX_SAFE_INTEGER), spawn('enemy_b', 1)]))
  assert.ok(result.reasons.has('spawn-total-overflow'))
  const exact = analyzeEnemySpawns(level([spawn('enemy_a', Number.MAX_SAFE_INTEGER - 1), spawn('enemy_b', 1)]))
  assert.equal(exact.reasons.size, 0)
})

test('unknown blackboard parameters remain unresolved even with empty values', () => {
  for (const value of ['dynamic_condition', '', null, 0, false]) {
    for (const makeRule of [enable, disable]) {
      const rune = makeRule('g')
      rune.blackboard.push({ key: 'condition', valueStr: value })
      const result = analyzeEnemySpawns(level([spawn('enemy_a', 2, { hiddenGroup: 'g' })], { runes: [rune] }))
      assert.equal(result.actions[0].status, 'unknown')
      assert.ok(result.reasons.has('unsupported-spawn-rule'))
    }
    const rune = replace('enemy_a', 'enemy_b')
    rune.blackboard.push({ key: 'condition', valueStr: value })
    const result = analyzeEnemySpawns(level([spawn()], { runes: [rune] }))
    assert.equal(result.actions[0].status, 'unknown')
    assert.equal(result.actions[0].resolvedEnemyId, null)
    assert.ok(result.reasons.has('unsupported-spawn-rule'))
  }
  const dictionary = enable('g', 'NORMAL', { blackboard: { key: 'g', condition: '' } })
  assert.equal(analyzeEnemySpawns(level([spawn('enemy_a', 2, { hiddenGroup: 'g' })], { runes: [dictionary] })).actions[0].status, 'unknown')
  const inactive = enable('g', 'FOUR_STAR', { blackboard: { key: 'g', condition: 'dynamic' } })
  assert.equal(analyzeEnemySpawns(level([spawn()], { runes: [inactive] })).reasons.size, 0)
})
