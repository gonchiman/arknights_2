import { createHash } from 'node:crypto'
import { normalizeLevelId } from '../generateEnemyStageAppearances.mjs'

// The revision pins the reviewed actor and buff mechanics, not particular maps.
const SOURCE_REVISION = '60e3aaf434919fbca931024a59d51088e810a9d3'
const SOURCE_BASE = 'https://github.com/ArknightsAssets/ArknightsGamedata/blob/' + SOURCE_REVISION + '/jp/gamedata'
const LARVA = 'trap_086_larva'
const APOSTLE = 'enemy_1266_nhapos'
const SHIELD = 'trap_087_allady'
const KNIGHT = 'enemy_1533_stmkgt'
// These reviewed actors do not spawn/redeploy larva or call its branch. The
// nurse only heals it; the airship summons flies following its own route.
const ACTORS = new Set(['enemy_1229_darmy', 'enemy_1267_nhpbr', 'enemy_1268_nhnrs',
  'enemy_1269_nhfly', 'enemy_1270_nhstlk', 'enemy_1271_nhkodo', 'enemy_1272_nhtank',
  'enemy_1273_stmgun', 'enemy_1274_stmram', 'enemy_1275_dwlock', 'enemy_1071_dftman']
  .flatMap(id => [id, id + '_2']).concat(APOSTLE, KNIGHT, 'enemy_1321_wdarft'))
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const empty = value => value == null || (Array.isArray(value) && value.length === 0)
  || (record(value) && Object.keys(value).length === 0)
const fields = (value, keys) => record(value) && Object.keys(value).every(key => keys.includes(key))
const list = value => Array.isArray(value) ? value : empty(value) ? [] : null
const text = value => typeof value === 'string' && value.trim().length > 0
const nonnegative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0
const positive = value => nonnegative(value) && value > 0

function canonicalJson(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))) return JSON.stringify(value)
  if ((!Array.isArray(value) && (!record(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))))
    || ancestors.has(value)) throw new TypeError('Expected JSON source data')
  ancestors.add(value)
  const result = Array.isArray(value) ? '[' + Array.from(value, entry => canonicalJson(entry, ancestors)).join(',') + ']'
    : '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalJson(value[key], ancestors)).join(',') + '}'
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

const ACTION_FIELDS = ['actionType', 'managedByScheduler', 'key', 'count', 'preDelay', 'interval',
  'routeIndex', 'blockFragment', 'autoPreviewRoute', 'autoDisplayEnemyInfo', 'isUnharmfulAndAlwaysCountAsKilled',
  'hiddenGroup', 'randomSpawnGroupKey', 'randomSpawnGroupPackKey', 'randomType', 'refreshType',
  'weight', 'dontBlockWave', 'forceBlockWaveInBranch']
function plainAction(action) {
  return fields(action, ACTION_FIELDS) && text(action.key) && action.managedByScheduler === true
    && Number.isSafeInteger(action.count) && action.count >= 0
    && nonnegative(action.preDelay) && nonnegative(action.interval)
    && Number.isSafeInteger(action.routeIndex) && action.routeIndex >= 0
    && ['blockFragment', 'autoPreviewRoute', 'autoDisplayEnemyInfo', 'isUnharmfulAndAlwaysCountAsKilled',
      'dontBlockWave', 'forceBlockWaveInBranch'].every(key => typeof action[key] === 'boolean')
    && empty(action.hiddenGroup) && empty(action.randomSpawnGroupKey) && empty(action.randomSpawnGroupPackKey)
    && action.randomType === 'ALWAYS' && action.refreshType === 'ALWAYS' && action.weight === 0
}

const INSTANCE_FIELDS = ['position', 'direction', 'hidden', 'alias', 'uniEquipIds', 'showSpIllust',
  'masterInfos', 'inst', 'skillIndex', 'mainSkillLvl', 'skinId', 'tmplId', 'overrideSkillBlackboard', 'overrideTalents']
function plainInstance(token, card = false) {
  return fields(token, card ? [...INSTANCE_FIELDS, 'initialCnt'] : INSTANCE_FIELDS)
    && fields(token.inst, ['characterKey', 'level', 'phase', 'favorPoint', 'potentialRank'])
    && token.inst.level === 1 && token.inst.phase === 'PHASE_0' && token.inst.potentialRank === 0
    && token.skillIndex === 0 && token.mainSkillLvl === 1 && typeof token.hidden === 'boolean'
    && empty(token.overrideTalents) && empty(token.uniEquipIds) && empty(token.masterInfos) && empty(token.tmplId)
}

function safeShield(card) {
  if (!plainInstance(card, true) || card.inst.characterKey !== SHIELD
    || !Number.isSafeInteger(card.initialCnt) || card.initialCnt < 0) return false
  if (empty(card.overrideSkillBlackboard)) return true
  const params = blackboard(card.overrideSkillBlackboard)
  return params && [...params].every(([key, value]) => ['dynamic', 'shield_duration',
    'attack@dynamic', 'attack@shield_duration'].includes(key) && nonnegative(value))
}

function safeKnightSkills(value) {
  const skills = list(value)
  const seen = new Set()
  return skills !== null && skills.every(skill => {
    if (!fields(skill, ['prefabKey', 'priority', 'cooldown', 'initCooldown', 'spCost', 'blackboard'])
      || !['Boost', 'HeroBomb[first_state]', 'HeroBomb[second_state]'].includes(skill.prefabKey)
      || seen.has(skill.prefabKey) || !['priority', 'cooldown', 'initCooldown', 'spCost'].every(key => nonnegative(skill[key]))) return false
    seen.add(skill.prefabKey)
    const params = blackboard(skill.blackboard)
    const keys = skill.prefabKey === 'Boost'
      ? ['move_speed', 'attack_speed', 'boost_duration', 'stun', 'damage_resistance'] : ['atk_scale', 'mark_duration']
    return params && [...params].every(([key, value]) => key === 'is_hard_level'
      ? ['true', 'false'].includes(value) : keys.includes(key) && nonnegative(value))
  })
}

function safeEnemyOverride(ref) {
  const value = ref.overwrittenData
  if (empty(value)) return true
  if (!fields(value, ['name', 'description', 'prefabKey', 'attributes', 'applyWay', 'motion',
    'enemyTags', 'lifePointReduce', 'levelType', 'rangeRadius', 'numOfExtraDrops', 'viewRadius',
    'notCountInTotal', 'talentBlackboard', 'skills', 'spData'])) return false
  const inactive = entry => entry == null || (fields(entry, ['m_defined', 'm_value']) && entry.m_defined === false)
  return Object.entries(value).every(([key, entry]) => {
    if (key === 'attributes') return record(entry) && Object.values(entry).every(inactive)
    if (key === 'skills' && ref.id === KNIGHT) return safeKnightSkills(entry)
    if (key === 'talentBlackboard' && ref.id === KNIGHT && !empty(entry)) {
      const params = blackboard(entry)
      return params && [...params].every(([name, setting]) => name === 'reborn.move_speed' && nonnegative(setting))
    }
    return inactive(entry)
  })
}

function safeLayout(level) {
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
  const map = level.mapData
  if (!fields(map, ['map', 'tiles', 'blockEdges', 'tags', 'effects', 'layerRects'])
    || !empty(map.effects) || !empty(map.blockEdges) || !empty(map.layerRects)
    || !list(map.tags)?.every(text) || !Array.isArray(map.map) || !map.map.length
    || !Array.isArray(map.tiles) || !map.tiles.length) return false
  const tiles = new Set(['tile_forbidden', 'tile_end', 'tile_road', 'tile_floor', 'tile_wall',
    'tile_telout', 'tile_hole', 'tile_telin', 'tile_start', 'tile_fence_bound', 'tile_flystart', 'tile_infection'])
  if (map.tiles.some(tile => !fields(tile, ['tileKey', 'heightType', 'buildableType', 'passableMask',
    'playerSideMask', 'blackboard', 'effects']) || !tiles.has(tile.tileKey) || !empty(tile.effects)
    || (tile.blackboard != null && (!blackboard(tile.blackboard) || [...blackboard(tile.blackboard)]
      .some(([key, value]) => !['HP_RECOVERY_PER_SEC_BY_MAX_HP_RATIO', 'atk', 'attack_speed', 'damage', 'duration'].includes(key) || !Number.isFinite(value)))))) return false
  const width = map.map[0]?.length
  if (!width || map.map.some(row => !Array.isArray(row) || row.length !== width
    || row.some(tile => !Number.isSafeInteger(tile) || tile < 0 || tile >= map.tiles.length))) return false
  for (const routes of [level.routes, level.extraRoutes]) {
    if (!list(routes) || list(routes).some(route => !fields(route, ['motionMode', 'startPosition', 'endPosition',
      'spawnRandomRange', 'spawnOffset', 'checkpoints', 'allowDiagonalMove', 'visitEveryTileCenter',
      'visitEveryNodeCenter', 'visitEveryCheckPoint']) || !list(route.checkpoints)
      || list(route.checkpoints).some(point => !fields(point, ['type', 'time', 'position', 'reachOffset',
        'randomizeReachOffset', 'reachDistance']) || !['MOVE', 'WAIT_FOR_SECONDS', 'WAIT_CURRENT_FRAGMENT_TIME',
        'DISAPPEAR', 'APPEAR_AT_POS'].includes(point.type)))) return false
  }
  if (!Array.isArray(level.enemyDbRefs) || level.enemyDbRefs.some(ref => !fields(ref, ['useDb', 'id', 'level', 'overwrittenData'])
    || ref.useDb !== true || !ACTORS.has(ref.id) || (ref.level !== 0 && !(ref.id === KNIGHT && ref.level === 1))
    || !safeEnemyOverride(ref))) return false
  const refs = new Set(level.enemyDbRefs.map(ref => ref.id))
  if (refs.size !== level.enemyDbRefs.length) return false
  return Array.isArray(level.waves) && level.waves.length > 0 && level.waves.every(wave =>
    fields(wave, ['preDelay', 'postDelay', 'maxTimeWaitingForNextWave', 'fragments', 'advancedWaveTag'])
    && (empty(wave.advancedWaveTag) || wave.advancedWaveTag === '') && Array.isArray(wave.fragments)
    && wave.fragments.every(fragment => fields(fragment, ['preDelay', 'actions']) && Array.isArray(fragment.actions)
      && fragment.actions.every(action => plainAction(action)
        && ['SPAWN', 'DISPLAY_ENEMY_INFO', 'PREVIEW_CURSOR'].includes(action.actionType)
        && (action.actionType !== 'SPAWN' || (refs.has(action.key) && level.routes[action.routeIndex])))))
}

function placementsFor(runes, difficulty, tokens) {
  const entries = list(runes), placements = new Map(tokens.map(token => [token.alias, !token.hidden]))
  const changes = new Map()
  if (!entries) return null
  for (const rune of entries) {
    if (!fields(rune, ['key', 'difficultyMask', 'professionMask', 'buildableMask', 'blackboard'])
      || !['ALL', 'NORMAL', 'FOUR_STAR', 'EASY', 'SIX_STAR'].includes(rune.difficultyMask)) return null
    if (rune.difficultyMask !== 'ALL' && rune.difficultyMask !== difficulty) continue
    const params = blackboard(rune.blackboard)
    if (!params || rune.buildableMask !== 'ALL') return null
    if (rune.key === 'char_exclude' && rune.professionMask === 34
      && params.size === 1 && params.get('include_predefined') === 0) continue
    if (rune.professionMask !== 1023) return null
    if (rune.key === 'enemy_attribute_mul' && params.size > 0
      && [...params].every(([key, value]) => key === 'enemy'
        ? text(value) && value.split('|').every(id => ACTORS.has(id))
        : ['atk', 'def', 'max_hp'].includes(key) && positive(value))) continue
    if (rune.key === 'enemy_talent_blackb_mul' && params.size > 0
      && [...params].every(([key, value]) => ['PollutedDie.polluted_damage_low', 'PollutedDie.polluted_damage_high',
        'PollutedArea.Polluted_damage_low', 'PollutedArea.Polluted_damage_high'].includes(key) && positive(value))) continue
    if (rune.key === 'enemy_skill_blackb_mul' && params.get('enemy') === 'enemy_1272_nhtank|enemy_1272_nhtank_2'
      && params.get('skill') === 'PollutedRangedAtk' && params.size > 2
      && [...params].every(([key, value]) => ['enemy', 'skill'].includes(key)
        || (['polluted_damage_high', 'polluted_damage_low'].includes(key) && positive(value)))) continue
    if (rune.key !== 'level_predefines_enable' || !params.size) return null
    for (const [alias, value] of params) {
      if (!placements.has(alias) || ![0, 1].includes(value) || (changes.has(alias) && changes.get(alias) !== value)) return null
      changes.set(alias, value)
      placements.set(alias, value === 1)
    }
  }
  return placements
}

/** Return complete counts for precisely bound branch actions, never a map total.
 * A larva's sole death summons once; its level-progress trigger kills any
 * survivor when the ordinary enemies are gone. Unknown callers keep it held.
 */
export function getMandatoryBranchResolutions(level, context = {}) {
  if (!record(level) || !record(context) || context.sourceRevision !== SOURCE_REVISION
    || !text(context.levelId) || /(^|[\\/])\.\.([\\/]|$)/.test(context.levelId)
    || !['NORMAL', 'FOUR_STAR'].includes(context.difficulty) || !['NONE', 'NORMAL', 'TOUGH'].includes(context.diffGroup)
    || (context.selectedRuneIds !== undefined && (!Array.isArray(context.selectedRuneIds) || context.selectedRuneIds.length))) return []
  const levelId = normalizeLevelId(context.levelId)
  if (!levelId || !Array.isArray(level.predefines?.tokenInsts)
    || !level.predefines.tokenInsts.some(token => token?.inst?.characterKey === LARVA)) return []
  try {
    if (!safeLayout(level)) return []
    const pre = level.predefines, preFields = ['characterInsts', 'tokenInsts', 'characterCards', 'tokenCards']
    if (!fields(pre, preFields) || !empty(pre.characterInsts) || !empty(pre.characterCards)
      || !list(pre.tokenCards)?.every(safeShield) || (!empty(level.hardPredefines)
        && (!fields(level.hardPredefines, preFields) || Object.values(level.hardPredefines).some(value => !empty(value))))
      || !record(level.branches)) return []
    const tokens = pre.tokenInsts, aliases = new Set(), positions = new Set(), targets = new Set(), bindings = []
    for (const [index, token] of tokens.entries()) {
      if (!plainInstance(token) || token.inst.characterKey !== LARVA || !text(token.alias) || aliases.has(token.alias)
        || !fields(token.position, ['row', 'col']) || !Number.isSafeInteger(token.position.row)
        || !Number.isSafeInteger(token.position.col) || token.position.row < 0 || token.position.col < 0
        || token.position.row >= level.mapData.map.length || token.position.col >= level.mapData.map[0].length) return []
      const position = token.position.row + ':' + token.position.col
      if (positions.has(position)) return []
      positions.add(position); aliases.add(token.alias)
      const params = blackboard(token.overrideSkillBlackboard)
      if (!params || !text(params.get('branch_id')) || params.get('action_index') !== 0
        || [...params].some(([key, value]) => !['branch_id', 'action_index'].includes(key)
          && (!['polluted_damage_low', 'polluted_damage_high'].includes(key) || !nonnegative(value)))) return []
      const branchId = params.get('branch_id'), branch = level.branches[branchId]
      if (targets.has(branchId) || !fields(branch, ['phases']) || !Array.isArray(branch.phases) || branch.phases.length !== 1) return []
      const phase = branch.phases[0], action = phase?.actions?.[0]
      if (!fields(phase, ['preDelay', 'actions']) || phase.preDelay !== 0 || !Array.isArray(phase.actions) || phase.actions.length !== 1
        || !plainAction(action) || action.actionType !== 'SPAWN' || action.key !== APOSTLE || action.count !== 1
        || action.isUnharmfulAndAlwaysCountAsKilled !== false || action.forceBlockWaveInBranch !== false
        || !level.extraRoutes[action.routeIndex] || !level.enemyDbRefs.some(ref => ref.id === APOSTLE)) return []
      targets.add(branchId)
      bindings.push({ index, token, branchId })
    }
    if (Object.keys(level.branches).some(id => !targets.has(id))) return []
    const difficulty = context.diffGroup === 'TOUGH' ? 'FOUR_STAR' : context.difficulty
    const placements = placementsFor(level.runes, difficulty, tokens)
    if (!placements) return []
    const fingerprint = createHash('sha256').update(canonicalJson(level)).digest('hex')
    return bindings.map(({ index, token, branchId }) => ({
      branchId, phaseIndex: 0, actionIndex: 0, enemyId: APOSTLE,
      count: placements.get(token.alias) ? 1 : 0,
      ruleId: 'larva-mandatory-apostle-v1',
      condition: placements.get(token.alias) ? '渇欲の枯枝1基につき使徒1体が必ず出現' : '選択中の難易度では枯枝が配置されない',
      evidence: [
        SOURCE_BASE + '/levels/' + levelId + '.json: source SHA-256=' + fingerprint + '; ' + difficulty,
        'predefines.tokenInsts[' + index + ']: ' + LARVA + ' (' + token.alias + '); hidden=' + token.hidden
          + '; rune適用後の配置=' + placements.get(token.alias) + '; branch_id=' + branchId + '; action_index=0; 1回×1体',
        SOURCE_BASE + '/excel/stage_table.json: 渇欲の枯枝は破壊時または敵全滅時にナハツェーラーの使徒を生成',
        SOURCE_BASE + '/excel/skill_table.json: sktok_larva; level_progress_ratio=1; この閾値のoverrideなし',
        SOURCE_BASE + '/battle/buff_template_data.json: trap_larva_t[summon]; ON_OWNER_KILLEDでSummonEnemiesFollowBranchRouteを1回実行; ON_BUFF_TRIGGERは進行率>=1でInstantKill; _summonAllRoute=false',
        '配置済み装置と分岐を1対1で照合。既知のHP回復・汚染ダメージ・防御バリア・蒸気騎士の戦闘技能は生成回数を変えない。追加呼出元・再配置・任意ルーン・未知の変更なし',
      ],
    }))
  } catch { return [] }
}
