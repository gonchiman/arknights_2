import { createHash } from 'node:crypto'
import { normalizeLevelId } from '../generateEnemyStageAppearances.mjs'

const REVISION = '60e3aaf434919fbca931024a59d51088e810a9d3'
const SOURCE = `https://github.com/ArknightsAssets/ArknightsGamedata/blob/${REVISION}/jp/gamedata/levels/`
const CONDITION = '防衛の初回WAVEで時限内に出現する敵のみ（下限）'
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const fields = (value, names) => record(value) && Object.keys(value).every(key => names.includes(key))
const nonnegative = value => Number.isFinite(value) && value >= 0
const canonical = value => JSON.stringify(value, (_, item) => record(item)
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)
const fingerprint = value => createHash('sha256').update(canonical(value)).digest('hex')

// Reviewed Fortress environment/control profiles, not complete-map hashes.
// Spawn counts, timing, hidden/random selectors and numeric enemy attributes
// are deliberately not fingerprinted: they are evaluated below and by the
// ordinary spawn resolver. A different controller, rune, story or enemy skill
// override needs review because it could change the wave's dispatch/timeout.
const CONTROL_PROFILES = new Set([
  '8dd6128717765b72c8ed7c58df8dd4c857120c6f0281f430cd10b92cc93aa929',
  'bb842dec7f25145741a8305ceea68cfcfb533d0921904298149f0772ceb566ba',
  'c27555ec499f4ee51ae78d47542f6a4e66139f53b1dbad0ff03bcfc93b600479',
  '71d9bbba6ef238d6bc15bdb8781aec431df493161dd78b8469249aaaf8dbf1b5',
  '82d5811c35b80f117fcef27476b75b681206b1ba83c5527b95db4b05d7ff2eef',
  'd835206be2cb156c133d44e2708f7073757ef274f669df086bf96e4ed35186ad',
  '4b0afbfb421c048296c0b6a22173728ec414d096df1620f3a8c26272a884e506',
  'dd956b956c621e801b855f8896e6760e71859ccc576fa99b78971fdfeabdddee',
  'ef98e163889a2437caa721e090d4dcf048d2bf61b7b2677c9bde7e02991db170',
  '4e97af2807fdb505b270f7212ea5d0bbdd17fbbed03fb22d9bc63ce0e697b1ff',
  '2ff7c52be34603c8717ad5bc6c5d65e4a06ec9c0b84064b7d23228ebc5a4805c',
  '782575070f48a7564ca53f4addf69d3132c08740265cb0f7111889a69d7b6f38',
])
const ACTION_FIELDS = ['actionType', 'key', 'count', 'managedByScheduler', 'preDelay', 'interval', 'routeIndex',
  'blockFragment', 'autoPreviewRoute', 'autoDisplayEnemyInfo', 'isUnharmfulAndAlwaysCountAsKilled',
  'hiddenGroup', 'randomSpawnGroupKey', 'randomSpawnGroupPackKey', 'randomType', 'refreshType',
  'weight', 'dontBlockWave', 'forceBlockWaveInBranch', 'isValid', 'condition', 'conditions']
const LEVEL_FIELDS = ['options', 'levelId', 'mapId', 'bgmEvent', 'environmentSe', 'mapData', 'tilesDisallowToLocate',
  'runes', 'optionalRunes', 'globalBuffs', 'routes', 'extraRoutes', 'enemies', 'enemyDbRefs', 'waves', 'branches',
  'predefines', 'hardPredefines', 'excludeCharIdList', 'randomSeed', 'operaConfig', 'cameraPlugin']

function controlProfile(level) {
  return {
    options: level.options, globalBuffs: level.globalBuffs, runes: level.runes, optionalRunes: level.optionalRunes,
    predefines: level.predefines, hardPredefines: level.hardPredefines, enemies: level.enemies,
    enemyDbRefs: level.enemyDbRefs.map(ref => ({ ...ref, overwrittenData: ref.overwrittenData
      && Object.fromEntries(Object.entries(ref.overwrittenData).filter(([key]) => key !== 'attributes')) })),
    otherActions: level.waves.map(wave => wave.fragments.map(fragment => fragment.actions.filter(action => action.actionType !== 'SPAWN'))),
    branches: level.branches, operaConfig: level.operaConfig,
  }
}

function timerValue(buff, key) {
  const bb = buff?.blackboard
  if (Array.isArray(bb)) {
    const values = bb.filter(entry => entry?.key === key)
    return values.length === 1 ? values[0].value : null
  }
  return record(bb) ? bb[key] : null
}

/** Resolve only the timed, non-blocked prefix of the first Fortress WAVE.
 * Native evidence (installed JP GameAssembly.dll SHA-256 c673ec1964a8f2b51b8cb867b5fb697b1f3f283452aeb4b568cd749d5dfc3864):
 * - CooperateDefenceModeManager.HookGetNextWave RVA 0x958340 does not select a
 *   different initial wave; OnWaveWillStart 0x958A90 resets skipCurWave.
 * - Scheduler._DealAction 0x6DF620 queues fragmentPreDelay + preDelay + i*interval.
 *   _DealFragment.MoveNext 0x6E6120 registers the whole fragment before executing
 *   its queue; <_DealFragment>b__121_1 0x6DECE0 waits for blockCounter > 0.
 * - CooperateGameModeWaveHandler.ExecuteActionQueue.MoveNext 0x6FF290 dispatches
 *   that queue. Scheduler._DoStory.MoveNext 0x6E9280 starts a story and yields
 *   once; it does not wait for story completion in this action queue.
 * - CooperateFortressGlobalBuff.OnTick 0x3A55020 sets skipCurWave at 0x3A551E4
 *   and calls FinishCurrentWave(true) at 0x3A55210. Later waves therefore are
 *   NOT an unconditional sequential sum. Football uses score-based selection
 *   (TryGetNextWaveIndexInGameMode 0x95AE10) and is outside this policy.
 * This only removes unsupported-wave-tag for individual eligible SPAWNs.
 * Hidden groups, random selectors, replacements and unresolved branches still
 * require the usual independent validation; no source action is changed.
 */
export function getCooperateWaveResolution(level, context = {}) {
  if (!record(level) || !record(context) || typeof context.levelId !== 'string'
    || /(^|[\\/])\.\.([\\/]|$)/.test(context.levelId)) return null
  const levelId = normalizeLevelId(context.levelId)
  if (!/^activities\/act(1multi|2multi|2vmulti)\/level_act\1_(?:fortress(?:[_-][\w-]+)?|tr03)$/.test(levelId ?? '')) return null
  // Recognizing the timed mode and proving a particular spawn are separate.
  // An unreviewed revision/context/controller must NOT fall back to generic
  // untagged-wave counting: defer all actions until a proof is available.
  const result = { wavePolicyApplies: true, actions: new Map(), aggregationConditions: [] }
  if (context.sourceRevision !== REVISION || context.difficulty !== 'NORMAL' || context.diffGroup !== 'NONE'
    || (context.selectedRuneIds !== undefined && (!Array.isArray(context.selectedRuneIds) || context.selectedRuneIds.length))
    || !fields(level, LEVEL_FIELDS) || !Array.isArray(level.waves) || !level.waves.length || !Array.isArray(level.enemyDbRefs)
    || !level.enemyDbRefs.every(record) || !Array.isArray(level.globalBuffs)) return result
  for (const wave of level.waves) {
    if (!record(wave) || !Array.isArray(wave.fragments)) return result
    for (const fragment of wave.fragments) {
      if (!record(fragment) || !Array.isArray(fragment.actions) || !fragment.actions.every(record)) return result
    }
  }
  if (!CONTROL_PROFILES.has(fingerprint(controlProfile(level)))) return result
  // The caller must defer every other SPAWN in this timed schedule, including
  // later waves with an empty advancedWaveTag. Returning an empty action map
  // still signals a recognized timed mode; it must not restore generic counts.
  result.aggregationConditions = [CONDITION]
  const wave = level.waves[0]
  if (!fields(wave, ['fragments', 'preDelay', 'postDelay', 'maxTimeWaitingForNextWave', 'advancedWaveTag'])
    || wave.advancedWaveTag !== 'stage' || wave.maxTimeWaitingForNextWave !== -1
    || !nonnegative(wave.preDelay) || !nonnegative(wave.postDelay)) return result
  const buffs = level.globalBuffs.filter(buff => buff?.prefabKey === 'cooperate_fortress_global_buff')
  if (buffs.length !== 1) return result
  const timeout = timerValue(buffs[0], level.waves.length === 1 ? 'wave_time_last' : 'wave_time')
  if (!Number.isFinite(timeout) || timeout <= 0) return result
  const enemyIds = new Set(level.enemyDbRefs.map(ref => ref.id)), actions = result.actions
  let prefixTime = wave.preDelay
  const evidence = [SOURCE + levelId + '.json: reviewed Fortress controls; source SHA-256=' + fingerprint(level),
    'GameAssembly.dll: Fortress timer 0x3A55020; action queue 0x6FF290; fragment dispatch 0x6E6120; block predicate 0x6DECE0']
  for (const [fragmentIndex, fragment] of wave.fragments.entries()) {
    if (!fields(fragment, ['preDelay', 'actions']) || !nonnegative(fragment.preDelay)) break
    // Malformed or unscheduled actions have no trustworthy dispatch time.
    if (fragment.actions.some(action => !fields(action, ACTION_FIELDS)
      || action.managedByScheduler !== true || !Number.isSafeInteger(action.count) || action.count < 0
      || typeof action.blockFragment !== 'boolean' || !nonnegative(action.preDelay) || !nonnegative(action.interval))) break
    prefixTime += fragment.preDelay
    // A reviewed but unresolved executor (e.g. TRIGGER_PREDEFINED) cannot
    // affect earlier actions in the time-sorted queue. Keep that earlier
    // prefix, exclude simultaneous/later spawns and stop before the next
    // fragment. This does not infer the trigger's gameplay effect.
    const unresolvedAt = Math.min(Infinity, ...fragment.actions.filter(action =>
      !['SPAWN', 'ACTIVATE_PREDEFINED', 'STORY', 'PREVIEW_CURSOR'].includes(action.actionType))
      .map(action => prefixTime + action.preDelay))
    const lastTime = action => prefixTime + action.preDelay + Math.max(0, action.count - 1) * action.interval
    for (const [actionIndex, action] of fragment.actions.entries()) {
      // Keep a full second clear of the deadline, so boundary/tick ordering is
      // never used to claim a guaranteed spawn. Partial action counts are not
      // rewritten: an action must fit completely to enter this lower bound.
      if (action.actionType === 'SPAWN' && action.count > 0 && enemyIds.has(action.key)
        && lastTime(action) < timeout - 1 && lastTime(action) < unresolvedAt) actions.set(`0/${fragmentIndex}/${actionIndex}`, {
        conditions: [CONDITION], evidence: [...evidence,
          `waves[0].fragments[${fragmentIndex}].actions[${actionIndex}]: latest scheduled time <= ${lastTime(action)}s < ${timeout}s timeout`],
      })
    }
    // The current fragment's actions are all queued before block-counter wait.
    // Its following fragment has no finite upper bound when any action blocks.
    if (Number.isFinite(unresolvedAt) || fragment.actions.some(action => action.blockFragment === true)) break
    prefixTime += Math.max(0, ...fragment.actions.map(action => action.preDelay + Math.max(0, action.count - 1) * action.interval))
  }
  return result
}
