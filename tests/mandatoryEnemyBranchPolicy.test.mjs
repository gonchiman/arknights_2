import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import test from 'node:test'
import { getMandatoryBranchResolutions } from '../scripts/lib/mandatoryEnemyBranchPolicy.mjs'

// Raw primary levels and selected primary mechanics from the same immutable
// source revision; no cache/network dependency during tests.
const fixture = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/enemyBranchPolicy/larva-levels.json.gz', import.meta.url))))
const sourceLevels = new Map(fixture.levels)
const mainId = 'obt/main/level_main_11-06'
const raw = (id = mainId) => structuredClone(sourceLevels.get(id))
const context = (levelId = mainId) => ({ levelId, sourceRevision: fixture.sourceRevision,
  difficulty: 'NORMAL', diffGroup: levelId.includes('level_tough_') ? 'TOUGH' : 'NORMAL' })
const resolve = (level = raw(), ctx = context()) => getMandatoryBranchResolutions(level, ctx)
const bb = (key, value) => ({ key, value: typeof value === 'number' ? value : 0, valueStr: typeof value === 'string' ? value : null })
const placementRune = (value, difficultyMask = 'ALL') => ({ key: 'level_predefines_enable', difficultyMask,
  professionMask: 1023, buildableMask: 'ALL', blackboard: [bb('trap_086_larva#1', value)] })

test('primary mechanics make the summon mandatory and one-shot, including untouched larva', () => {
  assert.match(fixture.mechanics.stageDescription, /破壊された時または敵全滅時/)
  const skill = fixture.mechanics.larvaSkill.levels[0]
  assert.equal(skill.blackboard.find(entry => entry.key === 'level_progress_ratio').value, 1)
  const events = fixture.mechanics.larvaBuff.eventToActions
  assert.deepEqual(Object.keys(events).sort(), ['ON_BUFF_TRIGGER', 'ON_OWNER_KILLED'])
  assert.equal(events.ON_OWNER_KILLED.length, 1)
  assert.match(events.ON_OWNER_KILLED[0].$type, /SummonEnemiesFollowBranchRoute/)
  assert.equal(events.ON_OWNER_KILLED[0]._summonAllRoute, false)
  assert.equal(events.ON_OWNER_KILLED[0]._alwaysCountAsKilled, false)
  assert.equal(events.ON_BUFF_TRIGGER[0]._conditionNode._levelProgressKey, 'level_progress_ratio')
  assert.equal(events.ON_BUFF_TRIGGER[0]._conditionNode._condType, 'GE')
  assert.ok(events.ON_BUFF_TRIGGER[0]._succeedNodes.some(node => /InstantKill/.test(node.$type)))
})

test('all compatible raw layouts use the same mechanism, including tough and H stages', () => {
  const expected = {
    'obt/main/level_main_11-06': 1, 'obt/main/level_main_11-07': 1,
    'obt/main/level_main_11-08': 3, 'obt/main/level_main_11-10': 2, 'obt/main/level_main_11-13': 5,
    'obt/main/level_tough_11-06': 3, 'obt/main/level_tough_11-07': 2,
    'obt/main/level_tough_11-08': 3, 'obt/main/level_tough_11-10': 2, 'obt/main/level_tough_11-13': 5,
    'obt/hard/level_hard_11-02': 8, 'obt/hard/level_hard_11-04': 4,
    'obt/campaign/level_camp_r_19': 14,
  }
  for (const [id, level] of fixture.levels) {
    const result = resolve(level, context(id))
    assert.equal(result.length, expected[id] ?? 0, id)
    assert.equal(result.reduce((sum, entry) => sum + entry.count, 0), expected[id] ?? 0, id)
    for (const entry of result) {
      assert.equal(entry.enemyId, 'enemy_1266_nhapos')
      assert.equal(entry.ruleId, 'larva-mandatory-apostle-v1')
      assert.deepEqual([entry.phaseIndex, entry.actionIndex], [0, 0])
      assert.ok(entry.evidence.some(text => text.includes(fixture.sourceRevision)))
    }
  }
})

test('11-7 has 50 ordinary spawns plus one mandatory apostle, without modifying input', () => {
  const level = raw(), before = JSON.stringify(level)
  const direct = level.waves.flatMap(wave => wave.fragments.flatMap(fragment => fragment.actions))
    .filter(action => action.actionType === 'SPAWN').reduce((sum, action) => sum + action.count, 0)
  const extra = resolve(level)
  assert.equal(direct, 50)
  assert.equal(direct + extra.reduce((sum, entry) => sum + entry.count, 0), 51)
  assert.equal(JSON.stringify(level), before)
})

test('map IDs, branch IDs and aliases are not an allowlist', () => {
  const level = raw()
  level.branches['a-new-branch'] = level.branches.route1
  delete level.branches.route1
  level.predefines.tokenInsts[0].alias = 'new-larva'
  level.predefines.tokenInsts[0].overrideSkillBlackboard[0].valueStr = 'a-new-branch'
  const result = resolve(level, { ...context(), levelId: 'activities/new_event/new_level' })
  assert.equal(result.length, 1)
  assert.equal(result[0].branchId, 'a-new-branch')
  assert.equal(result[0].count, 1)
})

test('active difficulty placement determines zero or one invocation', () => {
  const level = raw()
  level.predefines.tokenInsts[0].hidden = true
  assert.equal(resolve(level)[0].count, 0)
  level.runes.push(placementRune(1, 'FOUR_STAR'))
  assert.equal(resolve(level)[0].count, 0)
  assert.equal(resolve(level, { ...context(), diffGroup: 'TOUGH' })[0].count, 1)
  assert.equal(resolve(level, { ...context(), difficulty: 'FOUR_STAR' })[0].count, 1)
  level.runes = [placementRune(0)]
  level.predefines.tokenInsts[0].hidden = false
  assert.equal(resolve(level)[0].count, 0)
})

test('reviewed combat changes do not alter the number of larva deaths', () => {
  const id = 'obt/hard/level_hard_11-04', level = raw(id)
  const knight = level.enemyDbRefs.find(ref => ref.id === 'enemy_1533_stmkgt')
  knight.overwrittenData.skills[0].cooldown = 50
  knight.overwrittenData.skills[0].blackboard.find(entry => entry.key === 'attack_speed').value = 120
  assert.equal(resolve(level, context(id)).length, 4)
  assert.match(JSON.stringify(fixture.mechanics.nurseBuff), /HealViaMaxHpRatio/)
  assert.match(JSON.stringify(fixture.mechanics.airshipBuff), /SummonEnemiesFollowMyRoute/)
  assert.doesNotMatch(JSON.stringify(fixture.mechanics.airshipBuff), /SummonEnemiesFollowBranchRoute/)
  assert.doesNotMatch(JSON.stringify(fixture.mechanics.knightBuffs), /trap_086_larva|SummonEnemiesFollowBranchRoute|MoveNextLevelBranch/)
})

test('missing revision, invalid context and unresolved rune selection keep the branch held', () => {
  for (const override of [{ sourceRevision: undefined }, { sourceRevision: 'new-source' }, { levelId: '' },
    { levelId: 'https://invalid.test' }, { levelId: '../invalid' }, { difficulty: undefined },
    { difficulty: 'EASY' }, { diffGroup: undefined }, { diffGroup: 'UNKNOWN' },
    { selectedRuneIds: null }, { selectedRuneIds: 'x' }, { selectedRuneIds: ['x'] }]) {
    assert.deepEqual(resolve(raw(), { ...context(), ...override }), [], JSON.stringify(override))
  }
  assert.equal(resolve(raw(), { ...context(), selectedRuneIds: [] }).length, 1)
})

const unsafeChanges = {
  'unknown global buff': level => { level.globalBuffs = [{ prefabKey: 'new' }] },
  'optional rune pool': level => { level.optionalRunes = [{ key: 'new' }] },
  'unknown SP rune': level => { level.runes.push({ ...placementRune(1), key: 'char_sp_recovery_per_sec' }) },
  'unknown active blackboard rune': level => { level.runes.push({ ...placementRune(1), key: 'enemy_talent_blackb_mul', blackboard: [bb('Spawn.branch_id', 'route1')] }) },
  'placement on a different actor': level => { const rune = placementRune(1); rune.blackboard[0].key = 'unreviewed'; level.runes.push(rune) },
  'filtered placement': level => { level.runes.push({ ...placementRune(1), professionMask: 34 }) },
  'conflicting placement': level => { level.runes.push(placementRune(0), placementRune(1)) },
  'progress threshold override': level => { level.predefines.tokenInsts[0].overrideSkillBlackboard.push(bb('level_progress_ratio', 0.5)) },
  'SP override': level => { level.predefines.tokenInsts[0].overrideSkillBlackboard.push(bb('sp', 10)) },
  'duplicate blackboard key': level => { level.predefines.tokenInsts[0].overrideSkillBlackboard.push(bb('branch_id', 'route1')) },
  'talent override': level => { level.predefines.tokenInsts[0].overrideTalents = [{ prefabKey: 'summon' }] },
  'different device skill': level => { level.predefines.tokenInsts[0].skillIndex = 1 },
  'different device level': level => { level.predefines.tokenInsts[0].inst.level = 30 },
  'unknown token': level => { level.predefines.tokenInsts[0].inst.characterKey = 'trap_unknown' },
  'extra caller sharing a branch': level => { const token = structuredClone(level.predefines.tokenInsts[0]); token.alias = 'extra'; token.position.col--; level.predefines.tokenInsts.push(token) },
  'extra branch': level => { level.branches.extra = structuredClone(level.branches.route1) },
  'extra phase': level => { level.branches.route1.phases.push(structuredClone(level.branches.route1.phases[0])) },
  'extra action': level => { level.branches.route1.phases[0].actions.push(structuredClone(level.branches.route1.phases[0].actions[0])) },
  'different spawned unit': level => { level.branches.route1.phases[0].actions[0].key = 'enemy_1267_nhpbr' },
  'different per-call count': level => { level.branches.route1.phases[0].actions[0].count = 2 },
  'unscheduled branch': level => { level.branches.route1.phases[0].actions[0].managedByScheduler = false },
  'missing extra route': level => { level.extraRoutes = [] },
  'unreviewed scripted action': level => { level.waves[0].fragments[0].actions[0].actionType = 'ACTIVATE_PREDEFINED' },
  'unknown actor': level => { level.enemyDbRefs.push({ useDb: true, id: 'enemy_unknown', level: 0, overwrittenData: null }) },
  'actor prefab override': level => { level.enemyDbRefs[0].overwrittenData = { prefabKey: { m_defined: true, m_value: 'enemy_unknown' } } },
  'actor summon skill override': level => { level.enemyDbRefs[0].overwrittenData = { skills: [{ prefabKey: 'Summon' }] } },
  'unknown card': level => { level.predefines.tokenCards[0].inst.characterKey = 'trap_unknown' },
  'shield becomes caller': level => { level.predefines.tokenCards[0].overrideSkillBlackboard = [bb('branch_id', 'route1')] },
  'hard predefined actor': level => { level.hardPredefines.tokenInsts = [structuredClone(level.predefines.tokenInsts[0])] },
  'unreviewed map effect': level => { level.mapData.effects = [{ key: 'new' }] },
  'unreviewed tile effect': level => { level.mapData.tiles[0].effects = [{ key: 'new' }] },
  'unreviewed route checkpoint': level => { level.extraRoutes[0].checkpoints = [{ type: 'TRIGGER_BRANCH' }] },
  'unknown top-level source field': level => { level.newMechanic = true },
  'non-JSON source value': level => { level.cameraPlugin = new Date() },
}
for (const [name, mutate] of Object.entries(unsafeChanges)) test(name + ' keeps mandatory resolution held', () => {
  const level = raw()
  mutate(level)
  assert.deepEqual(resolve(level), [])
})

test('an unrelated Knight skill cannot enter through the reviewed override path', () => {
  const id = 'obt/hard/level_hard_11-04', level = raw(id)
  level.enemyDbRefs.find(ref => ref.id === 'enemy_1533_stmkgt').overwrittenData.skills[0].prefabKey = 'Summon'
  assert.deepEqual(resolve(level, context(id)), [])
})
