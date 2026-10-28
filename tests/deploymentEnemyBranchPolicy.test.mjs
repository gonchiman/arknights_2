import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { getDeploymentBranchExclusions } from '../scripts/lib/deploymentEnemyBranchPolicy.mjs'

const levels = new Map(JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/enemyBranchPolicy/deployment-trigger-levels.json.gz', import.meta.url)))))
const baseId = 'activities/act41side/level_act41side_05'
const context = { levelId: baseId, sourceRevision: '60e3aaf434919fbca931024a59d51088e810a9d3', difficulty: 'NORMAL', diffGroup: 'NONE' }
const base = levels.get(baseId)

test('placement trigger uses device binding, not map or branch names', () => {
  const level = structuredClone(base)
  level.branches.renamed = level.branches.branch_treant_1
  delete level.branches.branch_treant_1
  level.predefines.tokenInsts[0].overrideSkillBlackboard[0].valueStr = 'renamed'
  const result = getDeploymentBranchExclusions(level, { ...context, levelId: 'unseen/map' })
  assert.equal(result.length, 3)
  assert.ok(result.some(entry => entry.branchId === 'renamed'))
  assert.ok(result.every(entry => entry.ruleId === 'adjacent-deployment-treant' && entry.evidence.length))
})

test('normal and challenge placement modifiers share the reviewed trigger', () => {
  for (const [levelId, count] of [[baseId, 3], ['activities/act41side/level_act41side_ex05', 4]]) {
    for (const difficulty of ['NORMAL', 'FOUR_STAR']) {
      assert.equal(getDeploymentBranchExclusions(levels.get(levelId), { ...context, levelId, difficulty }).length, count)
    }
  }
})

test('invalid context level IDs cannot certify a branch exclusion', () => {
  for (const levelId of [undefined, null, '', ' ', 'https://evil.test', 'foo:bar', '/', 'foo//bar', '../foo', 'foo/../bar']) {
    assert.deepEqual(getDeploymentBranchExclusions(base, { ...context, levelId }), [], String(levelId))
  }
})

test('unreviewed terrain and route scripts remain unresolved', () => {
  const checkpoint = { type: 'MOVE', time: 0, position: { row: 1, col: 1 },
    reachOffset: { x: 0, y: 0 }, randomizeReachOffset: false, reachDistance: 0 }
  const mutations = [
    ['unknown map field', l => { l.mapData.activationScript = 'deploy_ally' }],
    ['map effect', l => { l.mapData.effects = [{ key: 'deploy_ally' }] }],
    ['unknown tile', l => { l.mapData.tiles[0].tileKey = 'tile_unreviewed_branch_caller' }],
    ['tile effect', l => { l.mapData.tiles[0].effects = [{ key: 'unknown_branch_script' }] }],
    ['tile blackboard', l => { l.mapData.tiles[0].blackboard = [{ key: 'branch_id', value: 0, valueStr: 'branch_treant_1' }] }],
    ['tile script field', l => { l.mapData.tiles[0].activationScript = 'deploy_ally' }],
    ['unknown route field', l => { l.routes[1].script = 'deploy_ally' }],
    ['unknown movement mode', l => { l.routes[1].motionMode = 'SCRIPTED' }],
    ['unknown checkpoint', l => { l.routes[1].checkpoints = [{ ...checkpoint, type: 'SCRIPT_ACTIVATE' }] }],
    ['checkpoint script field', l => { l.routes[1].checkpoints = [{ ...checkpoint, script: 'deploy_ally' }] }],
    ['extra-route checkpoint', l => { l.extraRoutes[0].checkpoints = [{ ...checkpoint, type: 'ACTIVATE_PREDEFINED' }] }],
    ['malformed grid', l => { l.mapData.map[0][0] = -1 }],
    ['malformed route list', l => { l.extraRoutes = { script: 'deploy_ally' } }],
  ]
  for (const [name, mutate] of mutations) {
    const level = structuredClone(base)
    mutate(level)
    assert.deepEqual(getDeploymentBranchExclusions(level, context), [], name)
  }
})

test('reviewed plant parameters accept numeric tuning but reject unknown behavior', () => {
  const levelId = 'activities/act41side/level_act41side_ex05'
  const level = structuredClone(levels.get(levelId))
  const plant = level.mapData.tiles.find(tile => tile.tileKey === 'tile_ftplant_road')
  plant.blackboard.find(entry => entry.key === 'value').value = 90
  plant.blackboard.find(entry => entry.key === 'interval').value = 2
  level.routes[0].checkpoints[0].time = 10
  level.routes[0].spawnOffset.x = 0.1
  assert.equal(getDeploymentBranchExclusions(level, { ...context, levelId }).length, 4)
  plant.blackboard.push({ key: 'activate_branch', value: 1, valueStr: 'branch_treant_1' })
  assert.deepEqual(getDeploymentBranchExclusions(level, { ...context, levelId }), [])
  plant.blackboard.pop()
  plant.blackboard[0].script = 'deploy_ally'
  assert.deepEqual(getDeploymentBranchExclusions(level, { ...context, levelId }), [])
})

test('does not assume a scripted or modified trigger can be avoided', () => {
  const mutate = [
    l => { l.operaConfig = { script: 'activate_ally' } },
    l => { l.enemies = { enemy_unknown: {} } },
    l => { l.options.forceSpawnAlly = true },
    l => { l.waves[0].fragments[0].actions.push({ actionType: 'SPAWN', key: 'enemy_unknown', count: 1 }) },
    l => { l.predefines.characterInsts = [{ inst: { characterKey: 'char_350_surtr' } }] },
    l => { l.waves[0].fragments[0].actions.push({ actionType: 'ACTIVATE_PREDEFINED', key: 'ally', count: 1 }) },
    l => { l.runes.push({ difficultyMask: 'ALL', key: 'unknown_force_activation', blackboard: [] }) },
    l => { l.predefines.tokenInsts[0].overrideSkillBlackboard.push({ key: 'force', value: 1 }) },
    l => { l.predefines.tokenInsts[0].inst.characterKey = 'trap_unknown' },
    l => { l.enemyDbRefs[0].overwrittenData = { skills: { m_defined: true, m_value: [] } } },
    l => { l.branches.branch_treant_1.phases[0].actions[0].key = 'enemy_unknown' },
  ]
  for (const change of mutate) {
    const level = structuredClone(base); change(level)
    assert.deepEqual(getDeploymentBranchExclusions(level, context), [])
  }
  assert.deepEqual(getDeploymentBranchExclusions(base, { ...context, sourceRevision: 'unreviewed' }), [])
})

test('boss environment and cooperative fortress retain their unresolved conditions', () => {
  for (const id of ['activities/act41side/level_act41side_ex08', 'activities/act2multi/level_act2multi_fortress-hard-01']) {
    assert.deepEqual(getDeploymentBranchExclusions(levels.get(id), { ...context, levelId: id }), [])
  }
})
