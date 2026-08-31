import test from 'node:test'
import assert from 'node:assert/strict'
import {
  evaluateOperatorEffects,
  getPassiveSourceStatus,
} from '../src/lib/operatorEffects.ts'
import { getOperatorPassives } from '../src/lib/operatorProfile.ts'
import type { OperatorCombatProfile } from '../src/types/skill.ts'

const emptyStats = {
  phases: [],
  favorKeyFrames: [],
}

test('潜在0の最新候補を選び、出典・blackboard・素質番号を保持する', () => {
  const passives = getOperatorPassives(createSurtrProfile(), 2, 90)

  assert.deepEqual(passives.talents, [
    { name: '劫火', description: '攻撃時、対象の術耐性を20無視' },
    { name: '余燼', description: '致命的なダメージを受けてもHPが1残る 効果発動から8秒後強制退場' },
  ])

  const trait = passives.sources.find((source) => source.sourceKind === 'TRAIT')
  const conflagration = passives.sources.find((source) => source.talentIndex === 0)
  const ember = passives.sources.find((source) => source.talentIndex === 1)

  assert.equal(trait?.description, '敵に術ダメージを与える')
  assert.equal(conflagration?.sourceName, '劫火')
  assert.equal(conflagration?.unlockCondition?.phase, 'PHASE_2')
  assert.equal(conflagration?.requiredPotentialRank, 0)
  assert.deepEqual(conflagration?.blackboard, [
    { key: 'magic_resist_penetrate_fixed', value: 20, valueStr: null },
  ])
  assert.equal(ember?.talentIndex, 1)
  assert.deepEqual(ember?.blackboard, [
    { key: 'surtr_t_2[withdraw].interval', value: 8, valueStr: null },
  ])
})

test('スルトの術ダメージと術耐性固定無視を構造化して評価する', () => {
  const passives = getOperatorPassives(createSurtrProfile(), 2, 90)
  const evaluation = evaluateOperatorEffects('char_350_surtr', passives, 'ARTS')

  assert.equal(evaluation.recommendedDamageType, 'ARTS')
  assert.deepEqual(evaluation.modifiers, {
    attackAddition: 0,
    attackMultiplierPercent: 0,
    attackSpeedBonus: 0,
    defenseIgnoreFixed: 0,
    resistanceIgnoreFixed: 20,
  })
  assert.equal(findEffect(evaluation.effects, '術耐性固定無視').status, 'APPLIED')
  assert.equal(findEffect(evaluation.effects, '術耐性固定無視').valueLabel, '20')
  assert.equal(findEffect(evaluation.effects, '強制退場までの時間').status, 'NO_DIRECT_EFFECT')
  assert.equal(findEffect(evaluation.effects, '強制退場までの時間').valueLabel, '8秒')

  const trait = passives.sources.find((source) => source.sourceKind === 'TRAIT')
  const firstTalent = passives.sources.find((source) => source.talentIndex === 0)
  assert.equal(getPassiveSourceStatus('char_350_surtr', trait, 'ARTS'), 'APPLIED')
  assert.equal(getPassiveSourceStatus('char_350_surtr', firstTalent, 'PHYSICAL'), 'NOT_APPLIED')
  assert.equal(
    evaluateOperatorEffects('char_350_surtr', passives, 'PHYSICAL').modifiers.resistanceIgnoreFixed,
    0,
  )
})

test('エクシアの攻撃速度と自己攻撃力を反映し、最大HPを直接影響なしとする', () => {
  const passives = getOperatorPassives(createExusiaiProfile(), 2, 90)
  const evaluation = evaluateOperatorEffects('char_103_angel', passives, 'PHYSICAL')

  assert.equal(evaluation.recommendedDamageType, null)
  assert.deepEqual(evaluation.modifiers, {
    attackAddition: 0,
    attackMultiplierPercent: 6,
    attackSpeedBonus: 12,
    defenseIgnoreFixed: 0,
    resistanceIgnoreFixed: 0,
  })
  assert.equal(findEffect(evaluation.effects, '攻撃速度').valueLabel, '+12')
  assert.equal(findEffect(evaluation.effects, '攻撃力補正B').valueLabel, '+6%')
  assert.equal(findEffect(evaluation.effects, '最大HP').status, 'NO_DIRECT_EFFECT')

  const trait = passives.sources.find((source) => source.sourceKind === 'TRAIT')
  const blessing = passives.sources.find((source) => source.talentIndex === 1)
  assert.equal(getPassiveSourceStatus('char_103_angel', trait), 'NO_DIRECT_EFFECT')
  assert.equal(getPassiveSourceStatus('char_103_angel', blessing), 'APPLIED')
})

test('シルバーアッシュの自己攻撃力だけを反映し、遠距離補正は条件入力待ちにする', () => {
  const passives = getOperatorPassives(createSilverAshProfile(), 2, 90)
  const evaluation = evaluateOperatorEffects('char_172_svrash', passives, 'PHYSICAL')

  assert.deepEqual(evaluation.modifiers, {
    attackAddition: 0,
    attackMultiplierPercent: 10,
    attackSpeedBonus: 0,
    defenseIgnoreFixed: 0,
    resistanceIgnoreFixed: 0,
  })
  assert.equal(findEffect(evaluation.effects, '遠距離攻撃時の攻撃力補正E').status, 'REQUIRES_INPUT')
  assert.equal(findEffect(evaluation.effects, '遠距離攻撃時の攻撃力補正E').valueLabel, '80%')
  assert.equal(findEffect(evaluation.effects, '再配置時間').status, 'NO_DIRECT_EFFECT')
  assert.equal(findEffect(evaluation.effects, 'ステルス無効').status, 'NO_DIRECT_EFFECT')

  const trait = passives.sources.find((source) => source.sourceKind === 'TRAIT')
  const charisma = passives.sources.find((source) => source.talentIndex === 0)
  assert.equal(getPassiveSourceStatus('char_172_svrash', trait), 'REQUIRES_INPUT')
  assert.equal(getPassiveSourceStatus('char_172_svrash', charisma), 'APPLIED')
})

test('未登録オペレーターの直接効果を推測で適用せずUNSUPPORTEDにする', () => {
  const profile: OperatorCombatProfile = {
    ...emptyStats,
    talents: [{
      candidates: [{
        unlockCondition: { phase: 'PHASE_0', level: 1 },
        requiredPotentialRank: 0,
        name: '未知の素質',
        description: '攻撃力+20%',
        blackboard: [{ key: 'atk', value: 0.2 }],
      }],
    }],
  }
  const passives = getOperatorPassives(profile, 0, 1)
  const evaluation = evaluateOperatorEffects('char_unknown', passives)

  assert.equal(evaluation.modifiers.attackMultiplierPercent, 0)
  assert.equal(evaluation.effects.some((effect) => effect.status === 'UNSUPPORTED'), true)
  assert.equal(getPassiveSourceStatus('char_unknown', passives.sources[0]), 'UNSUPPORTED')
})

test('素質の追加術ダメージを通常攻撃のダメージ種別として推測しない', () => {
  const profile: OperatorCombatProfile = {
    ...emptyStats,
    talents: [{
      candidates: [{
        unlockCondition: { phase: 'PHASE_0', level: 1 },
        requiredPotentialRank: 0,
        name: '追加攻撃テスト',
        description: '攻撃時、追加で20%の術ダメージを与える',
        blackboard: [{ key: 'damage_scale', value: 0.2 }],
      }],
    }],
  }
  const passives = getOperatorPassives(profile, 0, 1)
  const evaluation = evaluateOperatorEffects('char_unknown', passives)

  assert.equal(evaluation.recommendedDamageType, null)
  assert.equal(evaluation.effects.some((effect) => effect.label === 'ダメージ種別'), false)
  assert.equal(evaluation.effects.some((effect) => effect.status === 'UNSUPPORTED'), true)
})

function createSurtrProfile(): OperatorCombatProfile {
  return {
    ...emptyStats,
    traitDescription: '敵に<@ba.kw>術ダメージ</>を与える',
    talents: [
      {
        candidates: [
          talentCandidate('PHASE_1', 0, '劫火', '攻撃時、対象の術耐性を12無視', 'magic_resist_penetrate_fixed', 12),
          talentCandidate('PHASE_2', 0, '劫火', '攻撃時、対象の術耐性を20無視', 'magic_resist_penetrate_fixed', 20),
          talentCandidate('PHASE_2', 4, '劫火', '攻撃時、対象の術耐性を22無視', 'magic_resist_penetrate_fixed', 22),
        ],
      },
      {
        candidates: [
          talentCandidate('PHASE_1', 0, '余燼', '致命的なダメージを受けてもHPが1残る\n効果発動から4秒後強制退場', 'surtr_t_2[withdraw].interval', 4),
          talentCandidate('PHASE_2', 0, '余燼', '致命的なダメージを受けてもHPが1残る\n効果発動から8秒後強制退場', 'surtr_t_2[withdraw].interval', 8),
          talentCandidate('PHASE_2', 2, '余燼', '致命的なダメージを受けてもHPが1残る\n効果発動から9秒後強制退場', 'surtr_t_2[withdraw].interval', 9),
        ],
      },
    ],
  }
}

function createExusiaiProfile(): OperatorCombatProfile {
  return {
    ...emptyStats,
    traitDescription: '飛行ユニットを優先して攻撃',
    talents: [
      {
        candidates: [
          talentCandidate('PHASE_1', 0, 'スピードリロード', '攻撃速度+6', 'attack_speed', 6),
          talentCandidate('PHASE_2', 0, 'スピードリロード', '攻撃速度+12', 'attack_speed', 12),
          talentCandidate('PHASE_2', 2, 'スピードリロード', '攻撃速度+15', 'attack_speed', 15),
        ],
      },
      {
        candidates: [
          {
            unlockCondition: { phase: 'PHASE_2', level: 1 },
            requiredPotentialRank: 0,
            name: '天使の祝福',
            description: '自身の攻撃力+6%、最大HP+10%。配置中、ランダムな味方1人に同じ効果を付与',
            blackboard: [
              { key: 'max_hp', value: 0.1 },
              { key: 'atk', value: 0.06 },
            ],
          },
          {
            unlockCondition: { phase: 'PHASE_2', level: 1 },
            requiredPotentialRank: 5,
            name: '天使の祝福',
            description: '自身の攻撃力+8%、最大HP+13%。配置中、ランダムな味方1人に同じ効果を付与',
            blackboard: [
              { key: 'max_hp', value: 0.13 },
              { key: 'atk', value: 0.08 },
            ],
          },
        ],
      },
    ],
  }
}

function createSilverAshProfile(): OperatorCombatProfile {
  return {
    ...emptyStats,
    traitDescription: '80%の攻撃力で遠距離攻撃も行える',
    trait: {
      candidates: [{
        unlockCondition: { phase: 'PHASE_0', level: 1 },
        requiredPotentialRank: 0,
        blackboard: [{ key: 'atk_scale', value: 0.8 }],
        overrideDescripton: null,
      }],
    },
    talents: [
      {
        candidates: [
          {
            unlockCondition: { phase: 'PHASE_1', level: 1 },
            requiredPotentialRank: 0,
            name: 'カリスマ',
            description: '攻撃力+5%。編成中、味方全員の再配置時間-5%',
            blackboard: [{ key: 'atk', value: 0.05 }, { key: 'respawn_time', value: -0.05 }],
          },
          {
            unlockCondition: { phase: 'PHASE_2', level: 1 },
            requiredPotentialRank: 0,
            name: 'カリスマ',
            description: '攻撃力+10%。編成中、味方全員の再配置時間-10%',
            blackboard: [{ key: 'atk', value: 0.1 }, { key: 'respawn_time', value: -0.1 }],
          },
          {
            unlockCondition: { phase: 'PHASE_2', level: 1 },
            requiredPotentialRank: 4,
            name: 'カリスマ',
            description: '攻撃力+12%。編成中、味方全員の再配置時間-12%',
            blackboard: [{ key: 'atk', value: 0.12 }, { key: 'respawn_time', value: -0.12 }],
          },
        ],
      },
      {
        candidates: [{
          unlockCondition: { phase: 'PHASE_2', level: 1 },
          requiredPotentialRank: 0,
          name: 'ホークビジョン',
          description: '攻撃範囲内の敵のステルス状態を無効にする',
          blackboard: [],
        }],
      },
    ],
  }
}

function talentCandidate(
  phase: string,
  requiredPotentialRank: number,
  name: string,
  description: string,
  key: string,
  value: number,
) {
  return {
    unlockCondition: { phase, level: 1 },
    requiredPotentialRank,
    name,
    description,
    blackboard: [{ key, value }],
  }
}

function findEffect(
  effects: ReturnType<typeof evaluateOperatorEffects>['effects'],
  label: string,
) {
  const effect = effects.find((candidate) => candidate.label === label)
  assert.ok(effect, `効果「${label}」が見つかりません`)
  return effect
}
