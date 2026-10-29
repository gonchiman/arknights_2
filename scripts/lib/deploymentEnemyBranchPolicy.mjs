import { normalizeLevelId } from '../generateEnemyStageAppearances.mjs'

const REVISION = '60e3aaf434919fbca931024a59d51088e810a9d3'
const SOURCE = `https://github.com/ArknightsAssets/ArknightsGamedata/blob/${REVISION}/jp/gamedata`
const DEVICE = 'trap_219_fttreant'
const TARGETS = new Set(['enemy_10069_ftlsj', 'enemy_10069_ftlsj_2'])
const TOKENS = new Set([DEVICE, 'trap_218_fttree', 'trap_221_ftshad'])
const ACTORS = new Set(['enemy_1288_duskls', 'enemy_1288_duskls_2', 'enemy_1294_duchns', ...Array.from({ length: 7 }, (_, i) =>
  `enemy_${10064 + i}_${['ftyzss', 'ftzlc', 'ftxjl', 'ftsjc', 'ftxsr', 'ftlsj', 'ftkbtt'][i]}`)
    .flatMap(id => [id, `${id}_2`])])
const empty = value => value == null || value === '' || (Array.isArray(value) && !value.length)
  || (typeof value === 'object' && !Object.keys(value).length)
const list = value => Array.isArray(value) ? value : empty(value) ? [] : null
const fields = (value, allowed) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).every(key => allowed.includes(key))
function parameters(value) {
  const entries = list(value)
  if (!entries) return null
  const result = new Map()
  for (const entry of entries) {
    if (!fields(entry, ['key', 'value', 'valueStr']) || typeof entry.key !== 'string'
      || result.has(entry.key) || !Number.isFinite(entry.value)
      || (entry.valueStr != null && typeof entry.valueStr !== 'string')) return null
    result.set(entry.key, entry.valueStr ?? entry.value)
  }
  return result
}
function noDefinedOverrides(value) {
  if (empty(value)) return true
  return Object.entries(value).every(([key, setting]) => key === 'attributes'
    ? noDefinedOverrides(setting) : setting?.m_defined === false)
}

const finite = value => typeof value === 'number' && Number.isFinite(value)
const nonnegative = value => finite(value) && value >= 0
const coordinate = (value, keys) => fields(value, keys) && keys.every(key => finite(value[key]))
const TILE_KEYS = new Set(['tile_forbidden', 'tile_end', 'tile_road', 'tile_floor', 'tile_wall',
  'tile_fence_bound', 'tile_start', 'tile_ftplant_road', 'tile_ftplant_roadf'])
const CHECKPOINT_TYPES = new Set(['MOVE', 'WAIT_FOR_SECONDS', 'WAIT_CURRENT_FRAGMENT_TIME', 'DISAPPEAR', 'APPEAR_AT_POS'])

function safeGeometry(level) {
  const map = level.mapData
  if (!fields(map, ['map', 'tiles', 'blockEdges', 'tags', 'effects', 'layerRects'])
    || ['blockEdges', 'tags', 'effects', 'layerRects'].some(key => !empty(map[key]))
    || !Array.isArray(map.tiles) || !map.tiles.length || !Array.isArray(map.map) || !map.map.length) return false
  if (map.tiles.some(tile => {
    if (!fields(tile, ['tileKey', 'heightType', 'buildableType', 'passableMask', 'playerSideMask', 'blackboard', 'effects'])
      || !TILE_KEYS.has(tile.tileKey) || !empty(tile.effects)
      || !['LOWLAND', 'HIGHLAND'].includes(tile.heightType)
      || !['NONE', 'MELEE', 'RANGED', 'ALL'].includes(tile.buildableType)
      || !['NONE', 'ALL', 'WALK_ONLY', 'FLY_ONLY'].includes(tile.passableMask) || tile.playerSideMask !== 'ALL') return true
    // These plant tiles belong to the reviewed environment; their numeric
    // parameters affect the plants, not operator placement or branch dispatch.
    if (tile.tileKey === 'tile_ftplant_road' || tile.tileKey === 'tile_ftplant_roadf') {
      const params = parameters(tile.blackboard)
      return !params || params.size !== 3 || !finite(params.get('interval')) || params.get('interval') <= 0
        || !nonnegative(params.get('value')) || params.get('tree_target') !== 1
    }
    return !empty(tile.blackboard)
  })) return false
  const width = map.map[0]?.length
  if (!width || map.map.some(row => !Array.isArray(row) || row.length !== width
    || row.some(tile => !Number.isSafeInteger(tile) || tile < 0 || tile >= map.tiles.length))) return false
  for (const routes of [level.routes, level.extraRoutes]) {
    const entries = list(routes)
    if (!entries || entries.some(route => {
      if (!fields(route, ['motionMode', 'startPosition', 'endPosition', 'spawnRandomRange', 'spawnOffset',
        'checkpoints', 'allowDiagonalMove', 'visitEveryTileCenter', 'visitEveryNodeCenter', 'visitEveryCheckPoint'])
        || !['WALK', 'FLY', 'E_NUM'].includes(route.motionMode)
        || !coordinate(route.startPosition, ['row', 'col']) || !coordinate(route.endPosition, ['row', 'col'])
        || !coordinate(route.spawnRandomRange, ['x', 'y']) || !coordinate(route.spawnOffset, ['x', 'y'])
        || ['allowDiagonalMove', 'visitEveryTileCenter', 'visitEveryNodeCenter', 'visitEveryCheckPoint']
          .some(key => typeof route[key] !== 'boolean')) return true
      const checkpoints = list(route.checkpoints)
      // E_NUM is the empty placeholder route in the reviewed raw level.
      if (!checkpoints || (route.motionMode === 'E_NUM' && checkpoints.length)) return true
      return checkpoints.some(point => !fields(point, ['type', 'time', 'position', 'reachOffset', 'randomizeReachOffset', 'reachDistance'])
        || !CHECKPOINT_TYPES.has(point.type) || !nonnegative(point.time) || !nonnegative(point.reachDistance)
        || !coordinate(point.position, ['row', 'col']) || !coordinate(point.reachOffset, ['x', 'y'])
        || typeof point.randomizeReachOffset !== 'boolean')
    })) return false
  }
  return true
}

/** A reviewed placement trigger, independent of map ID and branch naming.
 * The handbook states that adjacent operator deployment wakes Shield and Wall.
 * trap_fttreant_passive summons only with has_target; the aura sets that flag.
 * Unknown environments, scripted placements and modified devices stay held.
 */
export function getDeploymentBranchExclusions(level, context = {}) {
  if (context?.sourceRevision !== REVISION || !['NORMAL', 'FOUR_STAR'].includes(context.difficulty)
    || typeof context.levelId !== 'string' || /(^|[\\/])\.\.([\\/]|$)/.test(context.levelId)
    || !normalizeLevelId(context.levelId)
    || !['NONE', 'NORMAL', 'TOUGH'].includes(context.diffGroup) || !empty(context.selectedRuneIds)
    || !fields(level, ['options', 'levelId', 'mapId', 'bgmEvent', 'environmentSe', 'mapData',
      'tilesDisallowToLocate', 'runes', 'optionalRunes', 'globalBuffs', 'routes', 'extraRoutes',
      'enemies', 'enemyDbRefs', 'waves', 'branches', 'predefines', 'hardPredefines',
      'excludeCharIdList', 'randomSeed', 'operaConfig', 'cameraPlugin'])
    || !level.branches || !empty(level.globalBuffs) || !empty(level.optionalRunes)
    || !empty(level.operaConfig) || !empty(level.enemies)
    || !fields(level.options, ['characterLimit', 'maxLifePoint', 'initialCost', 'maxCost', 'costIncreaseTime',
      'moveMultiplier', 'steeringEnabled', 'reachableCheckIgnoreStartTile', 'isTrainingLevel',
      'isHardTrainingLevel', 'isPredefinedCardsSelectable', 'displayRestTime', 'maxPlayTime',
      'functionDisableMask', 'configBlackBoard'])
    || !empty(level.options?.configBlackBoard) || level.options?.isTrainingLevel !== false || !safeGeometry(level)
    || !empty(level.hardPredefines) && Object.values(level.hardPredefines).some(value => !empty(value))) return []
  const pre = level.predefines
  if (!fields(pre, ['characterInsts', 'tokenInsts', 'characterCards', 'tokenCards'])
    || !Array.isArray(pre.tokenInsts) || !pre.tokenInsts.some(token => token.inst?.characterKey === DEVICE)
    || ['characterInsts', 'characterCards', 'tokenCards'].some(key => !empty(pre[key]))) return []
  if (!Array.isArray(level.enemyDbRefs) || level.enemyDbRefs.some(ref => !ACTORS.has(ref.id)
    || ref.useDb !== true || ref.level !== 0 || !noDefinedOverrides(ref.overwrittenData))) return []
  const refs = new Set(level.enemyDbRefs.map(ref => ref.id))
  if (!Array.isArray(level.waves) || level.waves.some(wave => !empty(wave.advancedWaveTag)
    || !Array.isArray(wave.fragments) || wave.fragments.some(fragment => !Array.isArray(fragment.actions)
      || fragment.actions.some(action => !['SPAWN', 'DISPLAY_ENEMY_INFO', 'PREVIEW_CURSOR'].includes(action.actionType)
        || action.actionType === 'SPAWN' && !refs.has(action.key))))) return []
  const difficulty = context.diffGroup === 'TOUGH' ? 'FOUR_STAR' : context.difficulty
  const aliases = new Set(), bindings = []
  for (const [index, token] of pre.tokenInsts.entries()) {
    if (!fields(token, ['position', 'direction', 'hidden', 'alias', 'uniEquipIds', 'showSpIllust',
      'masterInfos', 'inst', 'skillIndex', 'mainSkillLvl', 'skinId', 'tmplId', 'overrideSkillBlackboard', 'overrideTalents'])
      || !TOKENS.has(token.inst?.characterKey) || !empty(token.overrideTalents) || !empty(token.masterInfos)
      || !empty(token.uniEquipIds) || !empty(token.tmplId) || typeof token.alias !== 'string'
      || typeof token.hidden !== 'boolean') return []
    aliases.add(token.alias)
    if (token.inst.characterKey !== DEVICE) {
      if (!empty(token.overrideSkillBlackboard)) return []
      continue
    }
    if (token.inst.level !== 1 || token.inst.phase !== 'PHASE_0' || token.inst.potentialRank !== 0
      || token.skillIndex !== 0 || token.mainSkillLvl !== 1) return []
    const params = parameters(token.overrideSkillBlackboard), branchId = params?.get('branch_id')
    if (params?.size !== 1 || typeof branchId !== 'string' || !branchId
      || bindings.some(binding => binding.branchId === branchId)) return []
    const branch = level.branches[branchId], phase = branch?.phases?.[0], action = phase?.actions?.[0]
    if (branch?.phases?.length !== 1 || phase?.actions?.length !== 1 || action.actionType !== 'SPAWN'
      || !TARGETS.has(action.key) || !refs.has(action.key) || action.count !== 1
      || !Number.isSafeInteger(action.routeIndex) || action.routeIndex < 0
      || ![level.routes?.[action.routeIndex], level.extraRoutes?.[action.routeIndex]].some(Boolean)) return []
    bindings.push({ branchId, action, token, index })
  }
  // Validate modifiers rather than assuming an unfamiliar rune is irrelevant.
  if (!list(level.runes)) return []
  for (const rune of list(level.runes)) {
    if (!['ALL', 'NORMAL', 'FOUR_STAR', 'EASY', 'SIX_STAR'].includes(rune.difficultyMask)) return []
    if (!['ALL', difficulty].includes(rune.difficultyMask)) continue
    const params = parameters(rune.blackboard)
    if (!params || rune.professionMask !== 1023 || rune.buildableMask !== 'ALL') return []
    if (rune.key === 'env_system_new' && params.size === 1 && params.get('key') === 'env_026_act41side') continue
    if (rune.key === 'enemy_attribute_mul' && [...params].every(([key, v]) =>
      ['atk', 'def', 'max_hp'].includes(key) && typeof v === 'number' && v > 0)) continue
    if (rune.key === 'global_lifepoint' && params.size === 1 && params.get('value') > 0) continue
    if (rune.key === 'global_forbid_location' && params.size === 1 && typeof params.get('location') === 'string') continue
    if (rune.key === 'level_predefines_enable' && [...params].every(([key, v]) => aliases.has(key) && [0, 1].includes(v))) continue
    return []
  }
  return bindings.map(({ branchId, action, token, index }) => ({
    branchId, phaseIndex: 0, actionIndex: 0, enemyId: action.key,
    ruleId: 'adjacent-deployment-treant', condition: '盾と壁に隣接する4マスへの配置を行わない',
    evidence: [
      `${SOURCE}/excel/enemy_handbook_table.json: ${action.key}; 盾と壁の隣接4マスにオペレーターを配置すると出現`,
      `${SOURCE}/battle/buff_template_data.json: trap_fttreant_passive; has_target時だけSummonEnemiesFollowBranchRouteを実行。trap_fttreant[aura]がhas_targetを設定`,
      `predefines.tokenInsts[${index}]: ${DEVICE} (${token.alias}); branch_id=${branchId}; branches[${JSON.stringify(branchId)}].phases[0].actions[0]; count=1`,
      '通常波に配置スクリプトなし。固定配置の味方なし。確認済み装置・敵・環境の組み合わせに限定。',
    ],
  }))
}
