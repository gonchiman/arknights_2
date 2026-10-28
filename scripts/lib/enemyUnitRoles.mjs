// Reviewed roles, not classifiers derived from ATK, visibility or kill-count flags.
// Soul Chalices and targetable balloons remain enemies even when those flags differ.
export const ENEMY_UNIT_ROLE_SOURCE_REVISION = '60e3aaf434919fbca931024a59d51088e810a9d3'
export const ENEMY_UNIT_ROLE_SOURCE_BASE = `https://github.com/ArknightsAssets/ArknightsGamedata/blob/${ENEMY_UNIT_ROLE_SOURCE_REVISION}/jp/gamedata`

// Preserve the main-trends dataset's existing exclusions and export contract.
export const MAIN_ENEMY_EXCLUSIONS = Object.freeze({
  enemy_3001_upeopl: 'neutral-civilian',
  enemy_3002_ftrtal: 'allied-talulah',
  enemy_3002_ftrtal_s: 'allied-talulah',
  enemy_3007_lrssia: 'cinematic-theresa',
  enemy_3008_lramiy: 'cinematic-amiya',
  enemy_1313_wdfmr: 'neutral-civilian',
  enemy_1540_wdncr: 'cinematic-eblana',
  enemy_1541_wdslms: 'cinematic-shapeshifter',
  enemy_1115_embald: 'untargetable-cinematic-emperors-blade',
  enemy_1276_telex: 'untargetable-cinematic-theresis',
  enemy_1369_bmbcar1: 'neutral-rail-bomb',
  enemy_1370_bmbcar2: 'neutral-rail-bomb',
  enemy_1367_dseed: 'revival-material',
  enemy_1420_lrmm: 'environmental-originium-storm',
  enemy_1421_lrchld: 'environmental-beacon',
  enemy_1555_lrking: 'cinematic-nachzehrer-king',
  enemy_1432_lrccon: 'noncombat-cocoon',
  enemy_1432_lrccon_2: 'cinematic-cocoon',
  enemy_3009_mpprss: 'hidden-cinematic-priestess',
  enemy_10072_mpprhd: 'noncombat-call-command',
  enemy_10082_mpweak: 'noncombat-weakening-node',
  enemy_3010_mcreep: 'allied-miner',
  enemy_3010_mcreep_a: 'allied-miner',
})

export const NON_ENEMY_UNIT_ROLES = Object.freeze({
  ...MAIN_ENEMY_EXCLUSIONS,
  // The handbook explicitly identifies both as untargetable environmental actors,
  // in addition to excluding them from kills and life loss. Damage alone does not
  // decide allegiance: the second actor damages friendly units.
  enemy_10061_cjglon: 'environmental-contact-damage',
  enemy_10062_cjblon: 'environmental-contact-damage',
  enemy_10111_ymgpck: 'environmental-marble',
  // Separately reviewed HI02 actor. Its collision settings differ from HI01;
  // the shared role does not imply interchangeable mechanics or an ID alias.
  enemy_10111_ymgpck_2: 'environmental-marble',
})

const ROLE_EVIDENCE = Object.freeze({
  enemy_1369_bmbcar1: '中立ユニット。敵・味方両方のユニットから狙われやすい',
  enemy_1370_bmbcar2: 'enemy_database: 中立ユニット。敵からダメージを受けると減速し、味方から攻撃を受けると加速',
  enemy_3010_mcreep: '味方ユニット。【医療】の攻撃範囲内でHPが回復できる',
  enemy_3010_mcreep_a: 'enemy_database: 味方の坑夫遊撃隊員',
  enemy_10061_cjglon: '進路上の敵に確定ダメージ。攻撃対象にならず、殲滅数にカウントされず、退場時に耐久値が減少しない',
  enemy_10062_cjblon: '進路上の味方に確定ダメージ。攻撃対象にならず、殲滅数にカウントされず、退場時に耐久値が減少しない',
  enemy_10111_ymgpck: '敵との衝突で祝福を獲得する球体。停止時または一定時間後に消滅',
  enemy_10111_ymgpck_2: 'HI02の別個体。敵との衝突で祝福を獲得する球体。停止時または一定時間後に消滅。HI01と同じ役割だが別ID・別prefab',
})

export function getNonEnemyUnitRole(enemyId) {
  return typeof enemyId === 'string' && Object.hasOwn(NON_ENEMY_UNIT_ROLES, enemyId)
    ? NON_ENEMY_UNIT_ROLES[enemyId] : null
}

export function getNonEnemyUnitRoleEvidence(enemyId) {
  const role = getNonEnemyUnitRole(enemyId)
  if (!role) return []
  const evidence = [
    `${ENEMY_UNIT_ROLE_SOURCE_BASE}/excel/enemy_handbook_table.json: ${enemyId}; ${ROLE_EVIDENCE[enemyId] ?? `既存の検証済み役割 ${role}`}`,
    `${ENEMY_UNIT_ROLE_SOURCE_BASE}/levels/enemydata/enemy_database.json: ${enemyId}, level=0; role=${role}`,
  ]
  if (enemyId === 'enemy_10111_ymgpck' || enemyId === 'enemy_10111_ymgpck_2') evidence.push(
    `${ENEMY_UNIT_ROLE_SOURCE_BASE}/excel/skill_table.json: sktok_pckstp は「ある種の天命」を発射し続ける装置スキル`,
    `${ENEMY_UNIT_ROLE_SOURCE_BASE}/battle/buff_template_data.json: enemy_ymgpck_passive.ON_TAKE_DAMAGE は CancelModifier(UNHURTABLE); ymgpck_t の接触処理は YmgpckTouchTargetGainScoreOrGrade / Act44SideGainGrade`,
  )
  if (enemyId === 'enemy_10111_ymgpck_2') evidence.push(
    `${ENEMY_UNIT_ROLE_SOURCE_BASE}/levels/enemydata/enemy_database.json: enemy_10111_ymgpck_2 は別prefab。HI01との差分は PushEnemy.angle=0（HI01:30）、delta_force=5|5|5|5|5|5|5（HI01:5|5|3|3|0|0|3）、target は自身の別ID、hit_count_duration=3 を追加`,
    `${ENEMY_UNIT_ROLE_SOURCE_BASE}/battle/buff_template_data.json: ymgpck_a[effect] は CheckEnemyId(enemy_10111_ymgpck_2) で two_normal/two_special に分岐。球体の共通処理内に別個体として明示されている`,
  )
  return evidence
}
