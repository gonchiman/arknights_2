import { createHash } from 'node:crypto'
import { normalizeLevelId } from '../generateEnemyStageAppearances.mjs'

// Pin reviewed device/skill/enemy mechanics, not a list of maps.
const SOURCE_REVISION = '60e3aaf434919fbca931024a59d51088e810a9d3'
const SOURCE_BASE = `https://github.com/ArknightsAssets/ArknightsGamedata/blob/${SOURCE_REVISION}/jp/gamedata`
const ARMOR = new Map([
  ['trap_075_bgarmn', ['enemy_1255_lybgpa', 'sktok_bgarmn_1']],
  ['trap_076_bgarms', ['enemy_1255_lybgpa_2', 'sktok_bgarms_1']],
  ['trap_077_rmtarmn', ['enemy_1256_lyacpa', 'sktok_rmtarmn_1']],
  ['trap_078_rmtarms', ['enemy_1256_lyacpa_2', 'sktok_rmtarms_1']],
])
// No forced activation in these actors. bbrain is deliberately absent: its
// second form activates every surviving inactive suit.
const ENEMIES = new Set(['enemy_1249_lysdb', 'enemy_1250_lyengs', 'enemy_1251_lysyta',
  'enemy_1252_lysytb', 'enemy_1253_lysytc', 'enemy_1254_lypa', 'enemy_1255_lybgpa',
  'enemy_1256_lyacpa'].flatMap(id => [id, `${id}_2`]).concat('enemy_1257_lydrty'))
const ALLIES = new Set(['char_4048_doroth', 'char_108_silent', 'char_202_demkni'])
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const empty = value => value == null || (Array.isArray(value) && value.length === 0)
  || (record(value) && Object.keys(value).length === 0)
const fields = (value, keys) => record(value) && Object.keys(value).every(key => keys.includes(key))
const list = value => Array.isArray(value) ? value : empty(value) ? [] : null
const text = value => typeof value === 'string' && value.trim().length > 0

function canonicalJson(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))) return JSON.stringify(value)
  if ((!Array.isArray(value) && (!record(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))))
    || ancestors.has(value)) throw new TypeError('Expected JSON source data')
  ancestors.add(value)
  const result = Array.isArray(value) ? `[${Array.from(value, entry => canonicalJson(entry, ancestors)).join(',')}]`
    : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key], ancestors)}`).join(',')}}`
  ancestors.delete(value)
  return result
}

function blackboard(value) {
  if (!Array.isArray(value)) return null
  const result = new Map()
  for (const entry of value) {
    if (!fields(entry, ['key', 'value', 'valueStr']) || !text(entry.key) || result.has(entry.key)
      || !Number.isFinite(entry.value) || (entry.valueStr != null && typeof entry.valueStr !== 'string')) return null
    result.set(entry.key, entry.valueStr == null ? entry.value : entry.valueStr)
  }
  return result
}

function safeRunes(runes, difficulty, aliases) {
  const entries = list(runes)
  const placements = new Map()
  return entries !== null && entries.every(rune => {
    if (!fields(rune, ['key', 'difficultyMask', 'professionMask', 'buildableMask', 'blackboard'])
      || !['ALL', 'NORMAL', 'FOUR_STAR', 'EASY', 'SIX_STAR'].includes(rune.difficultyMask)) return false
    if (rune.difficultyMask !== 'ALL' && rune.difficultyMask !== difficulty) return true
    const params = blackboard(rune.blackboard)
    if (!params || rune.buildableMask !== 'ALL' || !Number.isSafeInteger(rune.professionMask)) return false
    if (rune.key === 'global_lifepoint') return params.size === 1 && Number.isSafeInteger(params.get('value')) && params.get('value') > 0
    if (['enemy_attribute_mul', 'char_attribute_mul'].includes(rune.key)) {
      return params.size > 0 && [...params].every(([key, value]) => ['atk', 'def', 'max_hp'].includes(key)
        ? typeof value === 'number' && value > 0
        : key === 'char' && rune.key === 'char_attribute_mul' && text(value) && value.split('|').every(id => ARMOR.has(id)))
    }
    if (rune.key === 'level_predefines_enable') {
      // Placing an inactive suit does not give it SP or call its spawn branch.
      return params.size > 0 && [...params].every(([key, value]) => {
        if (!aliases.has(key) || ![0, 1].includes(value) || (placements.has(key) && placements.get(key) !== value)) return false
        placements.set(key, value)
        return true
      })
    }
    if (rune.key === 'char_exclude') return params.size === 1 && text(params.get('char'))
      && params.get('char').split('|').every(id => ALLIES.has(id))
    if (rune.key === 'enemy_dynamic_ability_new') return params.size === 2
      && params.get('enemy') === 'enemy_1257_lydrty' && params.get('key') === 'invisible'
    return false
  })
}

function safeEnemyOverride(value) {
  if (empty(value)) return true
  if (!fields(value, ['name', 'description', 'prefabKey', 'attributes', 'applyWay', 'motion',
    'enemyTags', 'lifePointReduce', 'levelType', 'rangeRadius', 'numOfExtraDrops', 'viewRadius',
    'notCountInTotal', 'talentBlackboard', 'skills', 'spData'])) return false
  const inactive = entry => entry == null || (fields(entry, ['m_defined', 'm_value']) && entry.m_defined === false)
  return Object.entries(value).every(([key, entry]) => key === 'attributes'
    ? record(entry) && Object.entries(entry).every(([attribute, setting]) => inactive(setting)
      || (attribute === 'massLevel' && fields(setting, ['m_defined', 'm_value'])
        && setting.m_defined === true && Number.isFinite(setting.m_value) && setting.m_value >= 0))
    : inactive(entry))
}

function standardLevel(level) {
  if (!fields(level, ['options', 'levelId', 'mapId', 'bgmEvent', 'environmentSe', 'mapData',
    'tilesDisallowToLocate', 'runes', 'optionalRunes', 'globalBuffs', 'routes', 'extraRoutes', 'enemies',
    'enemyDbRefs', 'waves', 'branches', 'predefines', 'hardPredefines', 'excludeCharIdList',
    'randomSeed', 'operaConfig', 'cameraPlugin']) || !empty(level.globalBuffs) || !empty(level.optionalRunes)
    || !empty(level.enemies) || !empty(level.operaConfig)) return false
  const options = level.options
  if (!fields(options, ['characterLimit', 'maxLifePoint', 'initialCost', 'maxCost', 'costIncreaseTime',
    'moveMultiplier', 'steeringEnabled', 'reachableCheckIgnoreStartTile', 'isTrainingLevel',
    'isHardTrainingLevel', 'isPredefinedCardsSelectable', 'displayRestTime', 'maxPlayTime',
    'functionDisableMask', 'configBlackBoard']) || options.isTrainingLevel !== false
    || options.isHardTrainingLevel !== false || options.isPredefinedCardsSelectable !== false
    || options.reachableCheckIgnoreStartTile !== false || options.maxPlayTime !== 0
    || options.functionDisableMask !== 'NONE' || !empty(options.configBlackBoard)) return false
  if (!fields(level.mapData, ['map', 'tiles', 'blockEdges', 'tags', 'effects', 'layerRects'])
    || ['blockEdges', 'tags', 'effects', 'layerRects'].some(key => !empty(level.mapData[key]))) return false
  const tiles = list(level.mapData.tiles)
  const knownTiles = new Set(['tile_forbidden', 'tile_road', 'tile_wall', 'tile_floor', 'tile_start',
    'tile_end', 'tile_fence', 'tile_telin', 'tile_telout', 'tile_bigforce', 'tile_hole', 'tile_infection'])
  if (!tiles?.length || tiles.some(tile => !fields(tile, ['tileKey', 'heightType', 'buildableType', 'passableMask',
    'playerSideMask', 'blackboard', 'effects']) || !knownTiles.has(tile.tileKey) || !empty(tile.effects)
    || (tile.blackboard != null && (!blackboard(tile.blackboard)
      || [...blackboard(tile.blackboard).keys()].some(key => !['HP_RECOVERY_PER_SEC_BY_MAX_HP_RATIO',
        'base_force_level', 'damage', 'duration', 'atk', 'attack_speed'].includes(key)))))) return false
  for (const routes of [level.routes, level.extraRoutes]) {
    if (!list(routes) || list(routes).some(route => !fields(route, ['motionMode', 'startPosition', 'endPosition',
      'spawnRandomRange', 'spawnOffset', 'checkpoints', 'allowDiagonalMove', 'visitEveryTileCenter', 'visitEveryNodeCenter', 'visitEveryCheckPoint'])
      || !list(route.checkpoints) || list(route.checkpoints).some(point => !fields(point,
        ['type', 'time', 'position', 'reachOffset', 'randomizeReachOffset', 'reachDistance'])
        || !['MOVE', 'WAIT_FOR_SECONDS', 'WAIT_CURRENT_FRAGMENT_TIME', 'DISAPPEAR', 'APPEAR_AT_POS'].includes(point.type)))) return false
  }
  if (!Array.isArray(level.enemyDbRefs) || level.enemyDbRefs.some(ref => !fields(ref, ['useDb', 'id', 'level', 'overwrittenData'])
    || ref.useDb !== true || !ENEMIES.has(ref.id)
    || (ref.level !== 0 && !(ref.id === 'enemy_1257_lydrty' && ref.level === 1))
    || !safeEnemyOverride(ref.overwrittenData))) return false
  const refs = new Set(level.enemyDbRefs.map(ref => ref.id))
  if (!Array.isArray(level.waves) || level.waves.some(wave => !fields(wave, ['preDelay', 'postDelay', 'maxTimeWaitingForNextWave', 'fragments', 'advancedWaveTag'])
    || (!empty(wave.advancedWaveTag) && wave.advancedWaveTag !== '')
    || !Array.isArray(wave.fragments) || wave.fragments.some(fragment => !fields(fragment, ['preDelay', 'actions'])
      || !Array.isArray(fragment.actions) || fragment.actions.some(action => !['SPAWN', 'DISPLAY_ENEMY_INFO', 'PREVIEW_CURSOR'].includes(action.actionType)
        || (action.actionType === 'SPAWN' && !refs.has(action.key)))))) return false
  return true
}

const INSTANCE_FIELDS = ['position', 'direction', 'hidden', 'alias', 'uniEquipIds', 'showSpIllust',
  'masterInfos', 'inst', 'skillIndex', 'mainSkillLvl', 'skinId', 'tmplId', 'overrideSkillBlackboard', 'overrideTalents']
function plainInstance(token) {
  return fields(token, INSTANCE_FIELDS) && fields(token.inst, ['characterKey', 'level', 'phase', 'favorPoint', 'potentialRank'])
    && empty(token.overrideTalents) && empty(token.uniEquipIds) && empty(token.masterInfos) && empty(token.tmplId)
}

/** Classify the reviewed R-series activation mechanism on every compatible map.
 * Device bindings, actors and applicable modifiers are checked instead of map
 * IDs or whole-level hashes. Unknown callers/forces keep their branches held.
 */
export function getOptionalBranchExclusions(level, context = {}) {
  if (!record(level) || !record(context) || context.sourceRevision !== SOURCE_REVISION
    || !text(context.levelId) || /(^|[\\/])\.\.([\\/]|$)/.test(context.levelId)
    || !['NORMAL', 'FOUR_STAR'].includes(context.difficulty) || !['NONE', 'NORMAL', 'TOUGH'].includes(context.diffGroup)
    || (context.selectedRuneIds !== undefined && (!Array.isArray(context.selectedRuneIds) || context.selectedRuneIds.length))) return []
  if (!Array.isArray(level.predefines?.tokenInsts)
    || !level.predefines.tokenInsts.some(token => ARMOR.has(token?.inst?.characterKey))) return []
  const levelId = normalizeLevelId(context.levelId)
  if (!levelId) return []
  const difficulty = context.diffGroup === 'TOUGH' ? 'FOUR_STAR' : context.difficulty
  let fingerprint
  try {
    if (!standardLevel(level)) return []
    fingerprint = createHash('sha256').update(canonicalJson(level)).digest('hex')
  } catch { return [] }
  const predefinedFields = ['characterInsts', 'tokenInsts', 'characterCards', 'tokenCards']
  const pre = level.predefines
  if (!fields(pre, predefinedFields) || !empty(pre.characterCards) || !empty(pre.tokenCards)
    || (!empty(level.hardPredefines) && (!fields(level.hardPredefines, predefinedFields)
      || Object.values(level.hardPredefines).some(value => !empty(value))))) return []
  // Fixed friendly helpers cannot force enemy suit activation. Scripted card
  // delivery / tutorial actions were rejected above.
  if (!list(pre.characterInsts) || list(pre.characterInsts).some(ally => !plainInstance(ally)
    || !ALLIES.has(ally.inst.characterKey) || !empty(ally.overrideSkillBlackboard))) return []
  if (!Array.isArray(pre.tokenInsts) || pre.tokenInsts.length === 0 || !record(level.branches)) return []
  const bindings = [], aliases = new Set(), targets = new Set()
  for (const [index, token] of pre.tokenInsts.entries()) {
    const mechanism = ARMOR.get(token?.inst?.characterKey)
    if (!mechanism || !plainInstance(token) || token.inst.level !== 1 || token.inst.phase !== 'PHASE_0'
      || token.inst.potentialRank !== 0 || token.skillIndex !== 0 || token.mainSkillLvl !== 1
      || typeof token.hidden !== 'boolean' || !text(token.alias) || aliases.has(token.alias)) return []
    const params = blackboard(token.overrideSkillBlackboard)
    if (!params || params.size !== 2 || !text(params.get('branch_id')) || params.get('action_index') !== 0) return []
    const branchId = params.get('branch_id'), branch = level.branches[branchId]
    if (targets.has(branchId) || !fields(branch, ['phases']) || !Array.isArray(branch.phases) || branch.phases.length !== 1) return []
    const phase = branch.phases[0], action = phase?.actions?.[0]
    if (!fields(phase, ['preDelay', 'actions']) || phase.preDelay !== 0 || !Array.isArray(phase.actions) || phase.actions.length !== 1
      || !fields(action, ['actionType', 'managedByScheduler', 'key', 'count', 'preDelay', 'interval',
        'routeIndex', 'blockFragment', 'autoPreviewRoute', 'autoDisplayEnemyInfo', 'isUnharmfulAndAlwaysCountAsKilled',
        'hiddenGroup', 'randomSpawnGroupKey', 'randomSpawnGroupPackKey', 'randomType', 'refreshType',
        'weight', 'dontBlockWave', 'forceBlockWaveInBranch'])
      || action.actionType !== 'SPAWN' || action.key !== mechanism[0] || action.count !== 1
      || action.managedByScheduler !== true || action.isUnharmfulAndAlwaysCountAsKilled !== false
      || action.forceBlockWaveInBranch !== false
      || !empty(action.hiddenGroup) || !empty(action.randomSpawnGroupKey) || !empty(action.randomSpawnGroupPackKey)
      || action.randomType !== 'ALWAYS' || action.refreshType !== 'ALWAYS' || action.weight !== 0
      || !Number.isSafeInteger(action.routeIndex) || action.routeIndex < 0 || !level.routes[action.routeIndex]
      || !level.enemyDbRefs.some(ref => ref.id === action.key)) return []
    aliases.add(token.alias); targets.add(branchId)
    bindings.push({ index, token, branchId, mechanism })
  }
  if (!safeRunes(level.runes, difficulty, aliases)) return []
  // Extra branches may have other callers affecting the suits; keep them held
  // until their mechanism is understood.
  if (Object.keys(level.branches).some(id => !targets.has(id))) return []
  return bindings.map(({ index, token, branchId, mechanism: [enemyId, skillId] }) => {
    let placed = !token.hidden
    for (const rune of list(level.runes)) {
      if (rune.key !== 'level_predefines_enable' || !['ALL', difficulty].includes(rune.difficultyMask)) continue
      const value = blackboard(rune.blackboard).get(token.alias)
      if (value !== undefined) placed = value === 1
    }
    return {
      branchId, phaseIndex: 0, actionIndex: 0, enemyId,
      ruleId: 'inactive-power-armor-v2',
      condition: placed ? 'パワードスーツを起動させずにクリア可能' : '選択中の難易度では起動前の装置が配置されない',
      evidence: [
        `${SOURCE_BASE}/levels/${levelId}.json: source SHA-256=${fingerprint}; ${difficulty}; optionalRunesなし; 強制起動する敵・スクリプトなし`,
        `predefines.tokenInsts[${index}]: ${token.inst.characterKey} (${token.alias}); hidden=${token.hidden}; rune適用後の配置=${placed}; branch_id=${branchId}; action_index=0; branches[${JSON.stringify(branchId)}].phases[0].actions[0]: ${enemyId}, count=1`,
        `${SOURCE_BASE}/excel/skill_table.json: ${skillId}; 実験産物の吸収でSPを獲得して起動; spCost=100, initSp=0, increment=0`,
        `${SOURCE_BASE}/excel/character_table.json: 起動前のRシリーズ4種の装置・スキルと分岐指定を照合。起動前に破壊または実験産物の吸収を阻止する方針`,
        `${SOURCE_BASE}/battle/buff_template_data.json: trap_bgarmn[summon_enemy] の ON_BUFF_FINISH は生存確認後に生成。4種からこのbuffへの直接参照は公開データにないため、共通スキル定義と分岐指定に基づく判定`,
      ],
    }
  })
}
