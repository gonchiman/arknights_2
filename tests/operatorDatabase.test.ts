import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildOperatorDatabaseRecords,
  filterOperatorDatabaseRecords,
  sortOperatorDatabaseRecords,
  type OperatorDatabaseFilters,
} from '../src/lib/operatorDatabase.ts'
import type { OperatorCombatProfile, RawOperatorModule, SkillRecord } from '../src/types/skill.ts'

test('スキル行を1人1レコードへ集約し、最大育成ステータスと全情報を保持する', () => {
  const profile = createProfile()
  const rows = [
    createSkill({
      id: 'char_test:skill_2',
      skillId: 'skill_2',
      skillIndex: 2,
      skillName: '第二スキル',
      description: '攻撃力が{atk:0%}上昇',
      raw: { description: '攻撃力が{atk:0%}上昇', blackboard: [{ key: 'atk', value: 0.5 }] },
      profile,
    }),
    createSkill({
      id: 'char_test:skill_1',
      skillId: 'skill_1',
      skillIndex: 1,
      skillName: '第一スキル',
      description: '物理ダメージを与える',
      profile,
    }),
  ]

  const records = buildOperatorDatabaseRecords(rows)

  assert.equal(records.length, 1)
  const record = records[0]
  assert.equal(record.name, 'テスト')
  assert.deepEqual(record.stats, {
    maxHp: 1100,
    attack: 330,
    defense: 220,
    magicResistance: 15,
    deploymentCost: 20,
    blockCount: 2,
    redeployTime: 70,
    attackSpeed: 100,
    attackInterval: 1.2,
  })
  assert.match(record.statsCondition, /昇進1 Lv\.80・信頼度100/)
  assert.deepEqual(record.potentials.map((potential) => potential.description), ['配置コスト-1', '再配置時間-4秒'])
  assert.deepEqual(record.talents, [{ name: '基礎素質', description: '攻撃力+10%' }])
  assert.deepEqual(record.skills.map((skill) => [skill.index, skill.name]), [
    [1, '第一スキル'],
    [2, '第二スキル'],
  ])
  assert.equal(record.skills[1].description, '攻撃力が50%上昇')
  assert.deepEqual(record.modules.map((module) => module.name), ['モジュールα'])
  assert.equal(record.modules[0].unlockLabel, '昇進2 Lv.60')
  assert.equal('description' in record.modules[0], false)
  assert.deepEqual(record.modules[0].effects, [
    {
      level: 1,
      attributeBonuses: ['最大HP +100', '攻撃力 +30'],
      traitChanges: ['攻撃力が130%まで上昇'],
      talentChanges: [],
    },
    {
      level: 2,
      attributeBonuses: ['最大HP +130', '攻撃力 +40'],
      traitChanges: ['攻撃力が130%まで上昇'],
      talentChanges: ['基礎素質：攻撃力+15%'],
    },
    {
      level: 3,
      attributeBonuses: ['最大HP +150', '攻撃力 +50'],
      traitChanges: ['攻撃力が130%まで上昇'],
      talentChanges: ['基礎素質：攻撃力+18%'],
    },
  ])
})

test('戦闘用モジュールデータが欠落しても物語説明へ戻さず安全に空効果を返す', () => {
  const profile = createProfile()
  profile.modules = [{
    uniEquipId: 'module_without_battle_data',
    uniEquipName: '効果データなし',
    uniEquipDesc: 'これはモジュールの物語説明です',
    type: 'ADVANCED',
  }]

  const module = buildOperatorDatabaseRecords([createSkill({ profile })])[0].modules[0]

  assert.deepEqual(module.effects, [])
  assert.equal('description' in module, false)
  assert.equal(JSON.stringify(module).includes('物語説明'), false)
})

test('名前・職分・潜在能力・素質・スキル・モジュールを正規化して検索できる', () => {
  const sniper = buildOperatorDatabaseRecords([createSkill({ profile: createProfile() })])[0]
  const caster = buildOperatorDatabaseRecords([createSkill({
    id: 'char_caster:skill_caster',
    operatorId: 'char_caster',
    operatorName: 'アーミヤ',
    nameInitial: 'A_ROW',
    profession: 'CASTER',
    professionLabel: '術師',
    subProfessionId: 'core_caster',
    subProfessionName: '中堅術師',
    rarity: 5,
    skillName: '魔法スキル',
    profile: {
      phases: [],
      favorKeyFrames: [],
      talents: [],
      potentialRanks: [],
      modules: [],
    },
  })])[0]
  const records = [sniper, caster]

  assert.deepEqual(
    filterOperatorDatabaseRecords(records, filters({ query: 'ﾓｼﾞｭｰﾙα' })).map((record) => record.operatorId),
    ['char_test'],
  )
  assert.deepEqual(
    filterOperatorDatabaseRecords(records, filters({ query: '第一スキル' })).map((record) => record.operatorId),
    ['char_test'],
  )
  assert.deepEqual(
    filterOperatorDatabaseRecords(records, filters({
      nameInitial: 'A_ROW',
      profession: 'CASTER',
      rarity: 5,
    })).map((record) => record.operatorId),
    ['char_caster'],
  )
})

test('数値を指定方向へ並べ、欠落値は末尾で安定させる', () => {
  const records = buildOperatorDatabaseRecords([
    createSkill({ profile: createProfile(), operatorName: 'テスト' }),
    createSkill({
      id: 'char_empty:skill_empty',
      operatorId: 'char_empty',
      operatorName: 'データなし',
      profile: { phases: [], favorKeyFrames: [], talents: [], potentialRanks: [], modules: [] },
    }),
  ])

  assert.deepEqual(
    sortOperatorDatabaseRecords(records, { key: 'attack', direction: 'desc' }).map((record) => record.name),
    ['テスト', 'データなし'],
  )
  assert.deepEqual(
    sortOperatorDatabaseRecords(records, { key: 'operator', direction: 'asc' }).map((record) => record.name),
    ['データなし', 'テスト'],
  )
})

function filters(overrides: Partial<OperatorDatabaseFilters>): OperatorDatabaseFilters {
  return {
    query: '',
    nameInitial: 'ALL',
    profession: 'ALL',
    subProfession: 'ALL',
    rarity: 'ALL',
    ...overrides,
  }
}

function createProfile(): OperatorCombatProfile {
  return {
    phases: [
      {
        maxLevel: 50,
        attributesKeyFrames: [{ level: 50, data: { maxHp: 500, atk: 150, def: 100, magicResistance: 0 } }],
      },
      {
        maxLevel: 80,
        attributesKeyFrames: [
          { level: 80, data: {
            maxHp: 1000,
            atk: 300,
            def: 200,
            magicResistance: 10,
            cost: 20,
            blockCnt: 2,
            respawnTime: 70,
            attackSpeed: 100,
            baseAttackTime: 1.2,
          } },
          { level: 1, data: { maxHp: 600, atk: 200, def: 120, magicResistance: 5 } },
        ],
      },
    ],
    favorKeyFrames: [
      { level: 0, data: { maxHp: 0, atk: 0, def: 0, magicResistance: 0 } },
      { level: 50, data: { maxHp: 100, atk: 30, def: 20, magicResistance: 5, attackSpeed: 0 } },
    ],
    traitDescription: '敵を2体までブロック',
    talents: [{ candidates: [
      {
        unlockCondition: { phase: 'PHASE_1', level: 1 },
        requiredPotentialRank: 0,
        name: '基礎素質',
        description: '攻撃力+10%',
      },
      {
        unlockCondition: { phase: 'PHASE_1', level: 1 },
        requiredPotentialRank: 1,
        name: '強化素質',
        description: '攻撃力+12%',
      },
    ] }],
    potentialRanks: [
      { description: '<b>配置コスト-1</b>' },
      { description: '再配置時間-4秒' },
    ],
    modules: [
      { uniEquipId: 'original', uniEquipName: '証章', type: 'INITIAL' },
      { uniEquipId: 'special', uniEquipName: '限定記章', type: 'SPECIAL' },
      {
        uniEquipId: 'module_alpha',
        uniEquipName: 'モジュールα',
        uniEquipDesc: '能力を強化\\nする',
        type: 'ADVANCED',
        typeName1: 'X',
        unlockEvolvePhase: 'PHASE_2',
        unlockLevel: 60,
        phases: [
          createModulePhase(1, 100, 30),
          createModulePhase(2, 130, 40, '攻撃力<@ba.talpu>+15%</>'),
          createModulePhase(3, 150, 50, '攻撃力<@ba.talpu>+18%</>'),
        ],
      },
    ],
  }
}

function createModulePhase(
  level: number,
  maxHp: number,
  attack: number,
  talentDescription?: string,
): NonNullable<RawOperatorModule['phases']>[number] {
  return {
    equipLevel: level,
    attributeBlackboard: [
      { key: 'max_hp', value: maxHp },
      { key: 'atk', value: attack },
    ],
    parts: [
      {
        target: 'TRAIT',
        isToken: false,
        overrideTraitDataBundle: {
          candidates: [
            {
              requiredPotentialRank: 0,
              overrideDescripton: '攻撃力が<@ba.kw>{atk_scale:0%}</>まで上昇',
              blackboard: [{ key: 'atk_scale', value: 1.3 }],
            },
            {
              requiredPotentialRank: 4,
              overrideDescripton: '攻撃力が<@ba.kw>{atk_scale:0%}</>まで上昇',
              blackboard: [{ key: 'atk_scale', value: 1.35 }],
            },
          ],
        },
      },
      ...(talentDescription ? [{
        target: 'TALENT_DATA_ONLY',
        isToken: false,
        addOrOverrideTalentDataBundle: {
          candidates: [
            {
              requiredPotentialRank: 0,
              name: '基礎素質',
              upgradeDescription: talentDescription,
            },
            {
              requiredPotentialRank: 4,
              name: '基礎素質',
              upgradeDescription: '攻撃力+20%',
            },
          ],
        },
      }] : []),
    ],
  }
}

interface SkillFixture {
  id?: string
  operatorId?: string
  operatorName?: string
  nameInitial?: SkillRecord['nameInitial']
  profession?: string
  professionLabel?: string
  subProfessionId?: string
  subProfessionName?: string
  rarity?: number
  skillId?: string
  skillIndex?: number
  skillName?: string
  description?: string
  raw?: SkillRecord['raw']
  profile: OperatorCombatProfile
}

function createSkill(fixture: SkillFixture): SkillRecord {
  const skillId = fixture.skillId ?? 'skill_test'
  const description = fixture.description ?? 'テスト説明'
  const raw = fixture.raw ?? { description }

  return {
    id: fixture.id ?? `char_test:${skillId}`,
    operatorId: fixture.operatorId ?? 'char_test',
    operatorName: fixture.operatorName ?? 'テスト',
    profession: fixture.profession ?? 'SNIPER',
    professionLabel: fixture.professionLabel ?? '狙撃',
    subProfessionId: fixture.subProfessionId ?? 'marksman',
    subProfessionName: fixture.subProfessionName ?? '速射手',
    nameInitial: fixture.nameInitial ?? 'T_ROW',
    rarity: fixture.rarity ?? 6,
    skillIndex: fixture.skillIndex ?? 1,
    skillId,
    skillName: fixture.skillName ?? '第一スキル',
    description,
    duration: null,
    durationType: 'NONE',
    skillType: 'MANUAL',
    spType: 'INCREASE_WITH_TIME',
    initSp: 0,
    spCost: 10,
    classification: {} as SkillRecord['classification'],
    skillLevels: [raw],
    operatorProfile: fixture.profile,
    raw,
  }
}
