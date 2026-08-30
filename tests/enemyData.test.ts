import test from 'node:test'
import assert from 'node:assert/strict'
import { buildEnemyRecords, cleanGameText, getEnemyStatRating, matchesEnemyFilters } from '../src/lib/enemyData.ts'

const handbook = {
  enemyData: {
    enemy_test: {
      enemyId: 'enemy_test',
      enemyIndex: 'T1',
      sortId: 2,
      name: 'テスト敵',
      enemyLevel: 'ELITE',
      description: '説明 <@ba.kw>強調</>\\n続き',
      abilityList: [
        { text: '攻撃時、<$ba.dt.burning>灼熱</>を付与' },
      ],
      damageType: ['MAGIC'],
      hideInHandbook: false,
      isInvalidKilled: false,
    },
    enemy_hidden: {
      enemyId: 'enemy_hidden',
      name: '非表示敵',
      hideInHandbook: true,
    },
  },
}

const database = {
  enemy_test: [
    {
      level: 1,
      enemyData: {
        attributes: {
          maxHp: { m_defined: true, m_value: 9999 },
        },
      },
    },
    {
      level: 0,
      enemyData: {
        applyWay: { m_defined: true, m_value: 'RANGED' },
        lifePointReduce: { m_defined: true, m_value: 2 },
        attributes: {
          maxHp: { m_defined: true, m_value: 5000 },
          atk: { m_defined: true, m_value: 650 },
          def: { m_defined: true, m_value: 400 },
          magicResistance: { m_defined: true, m_value: 30 },
          moveSpeed: { m_defined: true, m_value: 0.8 },
          attackSpeed: { m_defined: true, m_value: 100 },
          baseAttackTime: { m_defined: true, m_value: 2.5 },
          massLevel: { m_defined: true, m_value: 3 },
          stunImmune: { m_defined: true, m_value: true },
          sleepImmune: { m_defined: true, m_value: false },
          silenceImmune: { m_defined: false, m_value: true },
        },
      },
    },
  ],
}

test('図鑑と基礎戦闘データを敵IDで結合する', () => {
  const rows = buildEnemyRecords(handbook, database)

  assert.equal(rows.length, 1)
  assert.deepEqual(rows[0], {
    id: 'enemy_test',
    index: 'T1',
    sortId: 2,
    name: 'テスト敵',
    levelType: 'ELITE',
    description: '説明 強調 続き',
    abilities: ['攻撃時、灼熱を付与'],
    damageTypes: ['MAGIC'],
    attackWay: 'RANGED',
    lifePointReduce: 2,
    databaseLevel: 0,
    databaseLevelCount: 2,
    statusImmunities: ['スタン'],
    ratings: {
      endurance: 'B',
      attack: 'B',
      defense: 'C',
      resistance: 'B+',
    },
    stats: {
      maxHp: 5000,
      attack: 650,
      defense: 400,
      magicResistance: 30,
      moveSpeed: 0.8,
      attackSpeed: 100,
      baseAttackTime: 2.5,
      massLevel: 3,
    },
  })
})

test('Key/Value配列形式の敵データにも対応する', () => {
  const rows = buildEnemyRecords(handbook, {
    enemies: [{ Key: 'enemy_test', Value: database.enemy_test }],
  })

  assert.equal(rows[0]?.stats.maxHp, 5000)
  assert.equal(rows[0]?.databaseLevel, 0)
})

test('名前・説明・内部IDと区分・攻撃種別で絞り込める', () => {
  const enemy = buildEnemyRecords(handbook, database)[0]

  assert.equal(matchesEnemyFilters(enemy, { query: 'Ｔ１', levelType: 'ALL', damageType: 'ALL' }), true)
  assert.equal(matchesEnemyFilters(enemy, { query: '灼熱', levelType: 'ELITE', damageType: 'MAGIC' }), true)
  assert.equal(matchesEnemyFilters(enemy, { query: 'enemy_test', levelType: 'NORMAL', damageType: 'ALL' }), false)
  assert.equal(matchesEnemyFilters(enemy, { query: '', levelType: 'ALL', damageType: 'PHYSIC' }), false)
})

test('ゲーム内マークアップと改行を表示用テキストから除去する', () => {
  assert.equal(cleanGameText('<@ba.kw>能力</>\\n  説明'), '能力 説明')
})

test('敵の実数ステータスをゲーム内と同じ段階評価へ変換する', () => {
  assert.equal(getEnemyStatRating('maxHp', 550), 'E')
  assert.equal(getEnemyStatRating('maxHp', 5000), 'B')
  assert.equal(getEnemyStatRating('attack', 3000), 'S+')
  assert.equal(getEnemyStatRating('defense', 1200), 'A+')
  assert.equal(getEnemyStatRating('magicResistance', 0), 'E')
  assert.equal(getEnemyStatRating('magicResistance', 30), 'B+')
  assert.equal(getEnemyStatRating('magicResistance', 91), 'SS')
  assert.equal(getEnemyStatRating('maxHp', null), null)
})
