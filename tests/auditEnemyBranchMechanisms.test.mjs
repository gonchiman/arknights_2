import assert from 'node:assert/strict'
import test from 'node:test'
import { auditEnemyBranchMechanisms } from '../scripts/auditEnemyBranchMechanisms.mjs'

const revision = 'test-source-revision'
const spawn = (key = 'enemy_test', extra = {}) => ({ actionType: 'SPAWN', key, count: 1, ...extra })
const branch = (...actions) => ({ phases: [{ actions }] })
const bb = (key, valueStr) => ({ key, value: 0, valueStr })
const proof = (branchId = 'first', extra = {}) => ({ branchId, phaseIndex: 0, actionIndex: 0,
  enemyId: 'enemy_test', ruleId: 'reviewed-mechanism', condition: 'Reviewed condition', evidence: ['source/path'], ...extra })
const map = (levelId, extra = {}) => ({ levelId, code: levelId, status: 'excluded', difficulty: 'NORMAL', diffGroup: 'NONE', ...extra })
const archive = (maps, excluded, versionId = 'v3') => ({ versionId, files: {
  'maps/index.json': { source: { revision }, maps },
  'enemy-histogram-counts.json': { diagnostics: { excludedLevelIds: [],
    excludedLevels: excluded.map(([levelId, reasons]) => ({ levelId, reasons })) } },
} })

function fixture(levels = [['test/map', { branches: { first: branch(spawn()) } }]]) {
  const maps = levels.map(([id]) => map(id))
  const exclusions = maps.map(({ levelId }) => [levelId, ['branch-spawn']])
  return { source: { revision, levels, database: { enemy_test: [] }, character: {}, skill: {} },
    baselineArchive: archive(maps, exclusions, 'v2'), archive: archive(maps, exclusions) }
}

const dereference = (object, path) => path.slice(1).split('/').reduce((value, key) =>
  value[key.replaceAll('~1', '/').replaceAll('~0', '~')], object)

test('the baseline cohort retains resolved maps and reports branches outside it separately', () => {
  const data = fixture([
    ['test/a', { branches: { first: branch(spawn()) } }],
    ['test/b', { branches: { first: branch(spawn()) } }],
  ])
  data.archive = archive([
    map('test/a', { status: 'supported', omittedBranchSpawns: [proof()] }), map('test/b'), map('test/new'),
  ], [['test/b', ['branch-spawn', 'weighted-spawn']], ['test/new', ['branch-spawn']]])
  const result = auditEnemyBranchMechanisms(data)
  assert.equal(result.summary.cohortMapCount, 2)
  assert.equal(result.summary.resolvedInArchiveMapCount, 1)
  assert.equal(result.summary.remainingBranchExcludedMapCount, 1)
  assert.equal(result.summary.branchPlusOtherReasonsMapCount, 1)
  assert.deepEqual(result.summary.outsideCohortCurrentBranchIds, ['test/new'])
  assert.equal(result.maps[0].branches[0].spawnActions[0].disposition, 'optional-omitted')
  assert.deepEqual(result.maps[0].branches[0].spawnActions[0].proof.evidence, ['source/path'])
  assert.deepEqual(result.maps[1].holdReasons, ['external-caller-or-default-binding-unresolved', 'other-exclusion:weighted-spawn'])
})

test('duplicate branch parameters and prefixed keys retain separate source evidence', () => {
  const data = fixture([['test/map', { branches: { first: branch(spawn()), second: branch(spawn()) },
    predefines: { tokenInsts: [{ inst: { characterKey: 'trap_001_test' }, alias: 'device#1',
      overrideSkillBlackboard: [bb('branch_id', 'first'), bb('branch_id', 'second'), bb('attack@branch_id', 'first')] }] } }]])
  const result = auditEnemyBranchMechanisms(data)
  const refs = result.maps[0].references
  assert.equal(refs.length, 3)
  assert.deepEqual(refs.map(ref => ref.key), ['branch_id', 'branch_id', 'attack@branch_id'])
  assert.ok(refs.every(ref => ref.ownerId === 'trap_001_test' && ref.ownerAlias === 'device#1'))
  assert.ok(refs.every(ref => dereference(data.source, ref.sourcePath) === ref.target))
  assert.equal(result.summary.branchesWithParameterReferenceCount, 2)
  assert.equal(result.groups.caller[0].mapCount, 1)
  assert.equal(result.maps[0].classification, 'parameter-binding-found')
  assert.ok(result.maps[0].holdReasons.includes('caller-execution-condition-and-multiplicity-unverified'))
})

test('matching aliases and random group names are not counted as branch parameter callers', () => {
  const data = fixture([['test/map', { branches: { first: branch(spawn()) },
    waves: [{ fragments: [{ actions: [spawn('enemy_test', { randomSpawnGroupKey: 'first' })] }] }],
    predefines: { tokenInsts: [{ alias: 'first', inst: { characterKey: 'trap_test' } }] } }]])
  const result = auditEnemyBranchMechanisms(data)
  assert.equal(result.summary.mapsWithParameterReferenceCount, 0)
  assert.equal(result.maps[0].branches[0].callerStatus, 'untyped-match-only')
  assert.equal(result.maps[0].classification, 'caller-unresolved')
  assert.ok(result.maps[0].references.every(ref => ref.certainty === 'string-equality-only'))
})

test('enemy base and selected database rows are research candidates with working source pointers', () => {
  const data = fixture([['test/map', { branches: { first: branch(spawn()), second: branch(spawn()) },
    enemyDbRefs: [{ id: 'enemy_test', level: 1, overwrittenData: {
      talentBlackboard: [bb('Reborn.branch_id', 'second')],
      skills: { m_defined: false, m_value: [{ blackboard: [bb('branch_id', 'stale')] }] },
    } }] }]])
  data.source.database = { enemies: [{ Key: 'enemy_test', Value: [
    { level: 0, enemyData: { talentBlackboard: [bb('branch_id', 'first')] } },
    { level: 1, enemyData: { skills: [{ blackboard: [bb('Summon.branch_id', 'second')] }] } },
    { level: 2, enemyData: { talentBlackboard: [bb('branch_id', 'not-selected')] } },
  ] }] }
  const result = auditEnemyBranchMechanisms(data)
  const refs = result.maps[0].references
  assert.equal(refs.length, 3)
  assert.ok(refs.every(ref => dereference(data.source, ref.sourcePath) === ref.target))
  assert.ok(refs.filter(ref => ref.classification === 'enemy-database-parameter').every(ref =>
    ref.applicability === 'base-or-selected-row-override-precedence-unverified'))
  assert.ok(result.maps[0].signals.some(signal => signal.reason === 'state-transition-or-reappearance-trigger-unverified'))
})

test('device skill defaults and environment presence are explicit candidates, not optionality proofs', () => {
  const data = fixture([['test/map', { branches: { first: branch(spawn()) },
    predefines: { tokenInsts: [{ inst: { characterKey: 'trap_001_test' }, skillIndex: 0, mainSkillLvl: 1 }] },
    runes: [{ key: 'env_system_new', difficultyMask: 'FOUR_STAR', blackboard: [bb('key', 'env_test')] }],
  }]])
  data.source.character.trap_001_test = { skills: [{ skillId: 'skill_test' }], talents: [] }
  data.source.skill.skill_test = { levels: [{ blackboard: [bb('branch_id', 'first')] }] }
  const result = auditEnemyBranchMechanisms(data)
  assert.equal(result.groups.referenceKind[0].id, 'character-skill-parameter')
  assert.equal(result.maps[0].environments[0].certainty, 'environment-presence-only')
  assert.equal(result.maps[0].environments[0].difficultyMask, 'FOUR_STAR')
  assert.equal(result.maps[0].branches[0].spawnActions[0].disposition, 'unresolved')
})

test('buff template loops and random selectors keep unproven name affinity visible', () => {
  const data = fixture([['test/map', { branches: { first: branch(spawn('enemy_test', { weight: 2 })) },
    enemyDbRefs: [{ id: 'enemy_001_test', level: 0 }] }]])
  data.buffTemplates = { 'enemy_test[summon]': { eventToActions: { ON_BUFF_TRIGGER: [
    { $type: 'Torappu.MoveNextLevelBranch', _isLoop: true, _branchId: '' },
    { $type: 'Torappu.PickRandomBranchPhase', _blockGameFinish: false },
  ] } } }
  const result = auditEnemyBranchMechanisms(data)
  assert.equal(result.summary.buffCatalogNodeCount, 2)
  assert.equal(result.maps[0].classification, 'buff-template-name-candidate')
  assert.equal(result.maps[0].buffCandidates[0].certainty, 'name-affinity-only')
  assert.equal(result.summary.branchesWithoutParameterReferenceCount, 1)
  assert.ok(result.maps[0].holdReasons.includes('possible-repeating-caller-template-binding-unverified'))
  assert.ok(result.maps[0].holdReasons.includes('possible-random-phase-template-binding-unverified'))
  assert.ok(result.maps[0].holdReasons.includes('random-or-selection-dependent-action'))
  assert.equal(result.buffTemplateCatalog[0].event, 'ON_BUFF_TRIGGER')
})

test('non-enemy and mandatory archive certificates retain distinct dispositions', () => {
  const data = fixture([['test/map', { branches: { first: branch(spawn()), second: branch(spawn('char_test')) } }]])
  data.source.character.char_test = {}
  data.archive = archive([map('test/map', { status: 'supported',
    omittedBranchSpawns: [proof('second', { enemyId: 'char_test', kind: 'non-enemy' })],
    countedBranchSpawns: [proof('first', { count: 1 })],
  })], [])
  const result = auditEnemyBranchMechanisms(data)
  assert.deepEqual(result.maps[0].branches.map(branch => branch.spawnActions[0].disposition), ['mandatory-counted', 'non-enemy'])
  assert.equal(result.maps[0].branches[1].spawnActions[0].targetRegistry, 'character')
  assert.deepEqual(result.maps[0].holdReasons, [])
})

test('unreferenced and missing-source maps remain in the audit and are never called unused', () => {
  const data = fixture()
  data.source.levels = []
  const result = auditEnemyBranchMechanisms(data)
  assert.equal(result.summary.cohortMapCount, 1)
  assert.equal(result.summary.sourceAvailableMapCount, 0)
  assert.ok(result.maps[0].holdReasons.includes('source-level-missing'))
  assert.equal(result.maps[0].sourcePath, null)
  assert.equal(result.maps[0].classification, 'caller-unresolved')
})

test('revision mismatch, disappearing cohort maps, and duplicate source IDs fail visibly', () => {
  const data = fixture()
  const mismatch = structuredClone(data)
  mismatch.source.revision = 'different'
  assert.throws(() => auditEnemyBranchMechanisms(mismatch), /revision mismatch/)
  const missing = structuredClone(data)
  missing.archive.files['maps/index.json'].maps = []
  assert.throws(() => auditEnemyBranchMechanisms(missing), /absent from current archive/)
  const duplicate = structuredClone(data)
  duplicate.source.levels.push(structuredClone(duplicate.source.levels[0]))
  assert.throws(() => auditEnemyBranchMechanisms(duplicate), /Duplicate source/)
})

test('the report is deterministic and has source pointers for every literal reference', () => {
  const data = fixture([['test/map', { branches: { 'a/b~c': branch(spawn()) },
    predefines: { tokenInsts: [{ overrideSkillBlackboard: [bb('branch_id', 'a/b~c')] }] } }]])
  const first = auditEnemyBranchMechanisms(data)
  assert.equal(JSON.stringify(first), JSON.stringify(auditEnemyBranchMechanisms(data)))
  const action = first.maps[0].branches[0].spawnActions[0]
  assert.deepEqual(dereference(data.source, action.sourcePath), action.action)
})
