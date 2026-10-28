import { normalizeLevelId } from '../generateEnemyStageAppearances.mjs'
import { ENEMY_UNIT_ROLE_SOURCE_REVISION, ENEMY_UNIT_ROLE_SOURCE_BASE,
  getNonEnemyUnitRole, getNonEnemyUnitRoleEvidence } from './enemyUnitRoles.mjs'

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const array = value => Array.isArray(value) ? value : []
const REF_FIELDS = new Set(['id', 'useDb', 'level', 'overwrittenData'])
const DATA_FIELDS = new Set(['name', 'description', 'prefabKey', 'attributes', 'applyWay', 'motion',
  'enemyTags', 'lifePointReduce', 'levelType', 'rangeRadius', 'numOfExtraDrops', 'viewRadius',
  'notCountInTotal', 'talentBlackboard', 'skills', 'spData'])
// These explicit overrides equal the reviewed level-0 database values exactly.
const IDENTICAL_ATTRIBUTES = { enemy_10111_ymgpck: { moveSpeed: 3.5, massLevel: 5 } }
const roleLabel = role => role.startsWith('allied-') ? '味方'
  : role.startsWith('neutral-') ? '中立'
    : role.startsWith('environmental-') ? '環境'
      : role.includes('cinematic') ? '演出'
        : role === 'revival-material' ? '復活素材' : '非戦闘'

// Inactive wrappers and null export placeholders do not override the database.
// Any changed override (including an innocuous-looking numeric one) is held until
// that variant is reviewed. useDb:false must never inherit a familiar ID's role.
const inactive = value => value == null || (record(value) && value.m_defined === false
  && Object.keys(value).every(key => key === 'm_defined' || key === 'm_value'))
// The reviewed tutorial variant disables fear-related HP loss only; its ally
// prefab/identity is unchanged. No other talent modification inherits the role.
const reviewedMinerTalent = (enemyId, value) => enemyId === 'enemy_3010_mcreep'
  && Array.isArray(value) && value.length === 1 && record(value[0])
  && Object.keys(value[0]).every(key => ['key', 'value', 'valueStr'].includes(key))
  && value[0].key === 'FearLoseBlood.value' && value[0].value === 0 && value[0].valueStr == null
function unchangedReference(ref) {
  if (!record(ref) || Object.keys(ref).some(key => !REF_FIELDS.has(key))
    || ref.useDb !== true || ref.level !== 0) return false
  const data = ref.overwrittenData
  if (data == null) return true
  if (!record(data) || Object.keys(data).some(key => !DATA_FIELDS.has(key))) return false
  return Object.entries(data).every(([key, value]) => key === 'attributes'
    ? value == null || (record(value) && Object.entries(value).every(([attribute, setting]) => inactive(setting)
      || (record(setting) && setting.m_defined === true && typeof setting.m_value === 'number'
        && Object.keys(setting).every(field => field === 'm_defined' || field === 'm_value')
        && Object.hasOwn(IDENTICAL_ATTRIBUTES[ref.id] ?? {}, attribute)
        && setting.m_value === IDENTICAL_ATTRIBUTES[ref.id][attribute])))
    : inactive(value) || (key === 'talentBlackboard' && reviewedMinerTalent(ref.id, value)))
}

/** Shared provenance/reference guard for branch classification and histogram
 * contributions. A familiar ID with an unreviewed override is not proof of its
 * allegiance; callers must retain their existing treatment when this is null.
 */
export function getVerifiedNonEnemyUnit(level, context, enemyId) {
  if (!record(level) || !record(context) || context.sourceRevision !== ENEMY_UNIT_ROLE_SOURCE_REVISION
    || typeof context.levelId !== 'string' || /(^|[\\/])\.\.([\\/]|$)/.test(context.levelId)
    || !Array.isArray(level.enemyDbRefs)) return null
  const levelId = normalizeLevelId(context.levelId), role = getNonEnemyUnitRole(enemyId)
  if (!levelId || !role) return null
  const refs = level.enemyDbRefs.filter(ref => ref?.id === enemyId)
  if (refs.length !== 1 || !unchangedReference(refs[0]) || canChangeIdentity(level, enemyId)) return null
  return {
    enemyId, role, ruleId: 'known-non-enemy-unit-v1', condition: `敵以外のユニット（${roleLabel(role)}）`,
    evidence: [
      ...getNonEnemyUnitRoleEvidence(enemyId),
      `${ENEMY_UNIT_ROLE_SOURCE_BASE}/levels/${levelId}.json: enemyDbRefs[${level.enemyDbRefs.indexOf(refs[0])}]: ${enemyId}; useDb=true, level=0, 未上書きまたは確認済みの役割を維持する上書き`,
      ...(reviewedMinerTalent(enemyId, refs[0].overwrittenData?.talentBlackboard) ? [
        `${ENEMY_UNIT_ROLE_SOURCE_BASE}/battle/buff_template_data.json: mcreep_t[fear_blood].ON_BUFF_TRIGGER は value を FixedValueDamage に使用。FearLoseBlood.value=0 の既知上書きはHP減少を抑えるが、味方のprefab・役割を変更しない`,
      ] : []),
    ],
  }
}

function canChangeIdentity(level, enemyId) {
  if (level.runes != null && !Array.isArray(level.runes)) return true
  if (level.optionalRunes != null && !record(level.optionalRunes)) return true
  const optional = Object.values(level.optionalRunes ?? {})
  if (optional.some(value => !Array.isArray(value))) return true
  // Conservatively inspect every difficulty/optional rune here. The caller
  // resolves active runes; this policy never guesses an unknown replacement or
  // a modified ability's allegiance from the source ID alone.
  for (const rune of [...array(level.runes), ...optional.flat()]) {
    if (!record(rune) || typeof rune.key !== 'string') return true
    if (!/^level_enemy_replace|^enemy_(?:dynamic_ability|talent|skill)/.test(rune.key)) continue
    if (!Array.isArray(rune.blackboard)) return true
    const field = rune.key.startsWith('level_enemy_replace') ? 'key' : 'enemy'
    const targets = rune.blackboard.filter(entry => entry?.key === field)
    if (targets.length !== 1 || typeof targets[0].valueStr !== 'string') return true
    const ids = targets[0].valueStr.split('|')
    if (ids.some(id => !/^enemy_[a-zA-Z0-9_]+$/.test(id)) || ids.includes(enemyId)) return true
  }
  return false
}

/** Role-based branch exclusions only. Callers must still validate each action
 * and its resolved ID; this does not infer a branch's execution or spawn count.
 * Same-ID normal waves are intentionally left to the caller's existing contract.
 */
export function getNonEnemyBranchExclusions(level, context = {}) {
  if (!record(level) || !record(context) || context.sourceRevision !== ENEMY_UNIT_ROLE_SOURCE_REVISION
    || typeof context.levelId !== 'string' || /(^|[\\/])\.\.([\\/]|$)/.test(context.levelId)
    || !Array.isArray(level.enemyDbRefs) || !record(level.branches)) return []
  const levelId = normalizeLevelId(context.levelId)
  if (!levelId) return []
  const result = []
  for (const [branchId, branch] of Object.entries(level.branches)) {
    for (const [phaseIndex, phase] of array(branch?.phases).entries()) {
      for (const [actionIndex, action] of array(phase?.actions).entries()) {
        if (!record(action) || action.actionType !== 'SPAWN' || !Number.isSafeInteger(action.count) || action.count <= 0) continue
        const verified = getVerifiedNonEnemyUnit(level, context, action.key)
        if (!verified) continue
        const { enemyId, ruleId, condition, evidence } = verified
        result.push({ branchId, phaseIndex, actionIndex, enemyId, ruleId, condition,
          evidence: [
            ...evidence,
            `${ENEMY_UNIT_ROLE_SOURCE_BASE}/levels/${levelId}.json: branches[${JSON.stringify(branchId)}].phases[${phaseIndex}].actions[${actionIndex}]: ${enemyId}`,
          ] })
      }
    }
  }
  return result
}
