import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { getMapDetail, parseMapDetailShard, parseMapIndex } from '../src/lib/mapDatabase.ts'
import { buildTdEnemyTimeline, getTdEnemyPositions } from '../src/lib/tdEnemyTimeline.ts'

const event = JSON.parse(readFileSync(new URL('../public/data/maps/td-event.json', import.meta.url), 'utf8'))
const index = parseMapIndex(event.index)
const stage = index.maps.find(map => map.code === 'TD-8')!
const detail = getMapDetail(parseMapDetailShard(event.details), stage)
const dog = 'enemy_10129_pycdog'
const lizard = 'enemy_10130_pycpok'
const boss = 'enemy_1573_pyczog'

test('TD-8 places all 59 spawns on one clock and seeks across fragment boundaries', () => {
  const timeline = buildTdEnemyTimeline(detail, index)
  assert.ok(timeline)
  assert.equal(timeline.spawns.length, 59)
  assert.deepEqual(timeline.fragmentStarts, [0, 18, 79, 141])
  assert.equal(timeline.duration, 261)
  const opening = getTdEnemyPositions(timeline, 0)
  assert.deepEqual(opening.map(p => p.enemyId).sort(), [dog, dog, dog, lizard, lizard, lizard, lizard])
  assert.ok(opening.every(p => p.state === 'waiting'))
  const seven = getTdEnemyPositions(timeline, 7)
  assert.equal(seven.filter(p => p.state === 'waiting').length, 6)
  assert.deepEqual(seven.filter(p => p.state === 'moving').map(p => p.enemyId), [dog])

  assert.ok(!getTdEnemyPositions(timeline, 29.99).some(p => p.enemyId === boss))
  assert.deepEqual(getTdEnemyPositions(timeline, 30).find(p => p.enemyId === boss),
    { enemyId: boss, row: 6, col: 1, state: 'moving' })
  const later = getTdEnemyPositions(timeline, 34)
  assert.equal(later.length, 12)
  assert.equal(later.filter(p => p.state === 'moving').length, 4)
  assert.deepEqual(later.find(p => p.enemyId === boss), { enemyId: boss, row: 6, col: 2, state: 'waiting' })
  const thirdStart = timeline.fragmentStarts[2]
  const before = getTdEnemyPositions(timeline, thirdStart - 1)
  const after = getTdEnemyPositions(timeline, thirdStart)
  assert.deepEqual(before.map(p => p.enemyId), [dog, dog])
  assert.deepEqual(after.map(p => p.enemyId), [dog, dog, dog])
  assert.ok(after[0].col > before[0].col && after[1].col > before[1].col)
  assert.equal(after[2].col, 0)
  assert.deepEqual(getTdEnemyPositions(timeline, timeline.duration), [])
  assert.deepEqual(getTdEnemyPositions(timeline, 0), opening)
})

test('fragment starts preserve wave delays and simultaneous empty fragments after the last enemy leaves', () => {
  const wave = detail.waves![0]
  const first = wave.fragments[0]
  const empty = { ...first, actions: [] }
  const fragments = [first, { ...empty, preDelay: 400.25 }, { ...empty, preDelay: 0 }]
  const timeline = buildTdEnemyTimeline({ ...detail, waves: [{ ...wave, preDelay: 3.5, fragments }] }, index)
  assert.ok(timeline)
  assert.deepEqual(timeline.fragmentStarts, [3.5, 403.75, 403.75])
  assert.equal(timeline.duration, 404)
  assert.deepEqual(getTdEnemyPositions(timeline, 403.75), [])
})

test('co-located species keep individual positions and movement states', () => {
  const timeline = buildTdEnemyTimeline(detail, index)
  assert.ok(timeline)
  const together = getTdEnemyPositions(timeline, 11).filter(p =>
    Math.round(detail.grid.length - 1 - p.row) === 3 && Math.round(p.col) === 4)
  assert.deepEqual(together.map(p => [p.enemyId, p.state]).sort(), [[dog, 'waiting'], [lizard, 'moving']])
})

test('a three-second disappearance hides the enemy, then resumes from the transfer exit', () => {
  const wave = detail.waves![0]
  const fragment = wave.fragments[0]
  const solo = { ...detail, waves: [{ ...wave, fragments: [{ ...fragment, actions: [fragment.actions[0]] }] }] }
  const timeline = buildTdEnemyTimeline(solo, index)
  assert.ok(timeline)
  assert.equal(getTdEnemyPositions(timeline, 47.99)[0].state, 'moving')
  for (const time of [48, 50.99]) assert.equal(getTdEnemyPositions(timeline, time)[0].state, 'hidden')
  const reappeared = getTdEnemyPositions(timeline, 51)[0]
  assert.equal(reappeared.state, 'moving')
  assert.equal(Math.round(reappeared.row), 3)
  assert.equal(Math.round(reappeared.col), 1)
})

test('missing route geometry, missing speed, and combat-dependent timings produce no estimate', () => {
  assert.equal(buildTdEnemyTimeline({ ...detail, routes: null }, index), null)
  assert.equal(buildTdEnemyTimeline(detail, { ...index, enemies: { ...index.enemies,
    [boss]: { ...index.enemies[boss], moveSpeed: null },
  } }), null)
  const gated = structuredClone(detail)
  gated.waves![0].fragments[0].actions[0].blockFragment = true
  assert.equal(buildTdEnemyTimeline(gated, index), null)
})
