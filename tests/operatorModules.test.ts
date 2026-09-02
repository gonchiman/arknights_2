import test from 'node:test'
import assert from 'node:assert/strict'
import { getOperatorStats } from '../src/lib/damageCalculator.ts'
import { evaluateOperatorEffects } from '../src/lib/operatorEffects.ts'
import {
  applyOperatorModule,
  getOperatorModuleLevels,
  getOperatorModules,
  isOperatorModuleUnlocked,
} from '../src/lib/operatorModules.ts'
import { getOperatorPassives } from '../src/lib/operatorProfile.ts'
import type { OperatorCombatProfile, RawOperatorModule } from '../src/types/skill.ts'

test('標準モジュールだけを列挙し、解放条件とLvを判定する', () => {
  const advanced = createModule()
  const profile = createProfile()
  profile.modules = [
    { uniEquipId: 'initial', uniEquipName: '証章', type: 'INITIAL' },
    advanced,
  ]

  assert.deepEqual(getOperatorModules(profile), [advanced])
  assert.deepEqual(getOperatorModuleLevels(advanced), [1, 2, 3])
  assert.equal(isOperatorModuleUnlocked(advanced, 1, 80), false)
  assert.equal(isOperatorModuleUnlocked(advanced, 2, 59), false)
  assert.equal(isOperatorModuleUnlocked(advanced, 2, 60), true)
})

test('モジュールLvの攻撃力・攻撃速度と素質上書きを計算モデルへ渡す', () => {
  const profile = createProfile()
  const basePassives = getOperatorPassives(profile, 2, 90)
  const application = applyOperatorModule(basePassives, createModule(), 3)

  assert.equal(application.moduleName, 'テストモジュール')
  assert.equal(application.moduleLevel, 3)
  assert.equal(application.moduleAttack, 60)
  assert.equal(application.attackSpeedBonus, 5)
  assert.deepEqual(
    application.attributeEffects.map((effect) => [effect.key, effect.status]),
    [
      ['atk', 'APPLIED'],
      ['attack_speed', 'APPLIED'],
      ['max_hp', 'NO_DIRECT_EFFECT'],
    ],
  )
  assert.equal(application.passives.talents[0].description, '攻撃時、対象の術耐性を26無視')

  const talentSource = application.passives.sources.find((source) => (
    source.sourceKind === 'TALENT' && source.talentIndex === 0
  ))
  assert.deepEqual(talentSource?.blackboard, [
    { key: 'magic_resist_penetrate_fixed', value: 26, valueStr: null },
  ])
  const traitSource = application.passives.sources.find((source) => source.sourceKind === 'TRAIT')
  assert.equal(
    application.passives.traitDescription,
    '敵に術ダメージを与える 未ブロック時、攻撃速度+8',
  )
  assert.equal(traitSource?.description, application.passives.traitDescription)
  assert.equal(traitSource?.blackboard.some((entry) => entry.key === 'attack_speed' && entry.value === 8), true)
  assert.equal(application.passives.sources.some((source) => source.sourceKind === 'MODULE'), true)

  const effects = evaluateOperatorEffects('char_350_surtr', application.passives, 'ARTS')
  assert.equal(effects.modifiers.resistanceIgnoreFixed, 26)
  assert.equal(effects.effects.some((effect) => (
    effect.sourceKind === 'MODULE' && effect.status === 'UNSUPPORTED'
  )), true)
  assert.equal(effects.effects.some((effect) => (
    effect.sourceKind === 'TRAIT'
      && effect.status === 'UNSUPPORTED'
      && effect.valueLabel.includes('attack_speed')
  )), true)
})

test('モジュール能力値を基礎攻撃力と攻撃間隔へ反映する', () => {
  const profile = createProfile()
  const stats = getOperatorStats(profile, 2, 90, 100, {
    moduleAttack: 60,
    attackSpeedBonus: 5,
  })

  assert.equal(stats.baseAttackBreakdown.levelAttack, 600)
  assert.equal(stats.baseAttackBreakdown.trustAttack, 50)
  assert.equal(stats.baseAttackBreakdown.moduleAttack, 60)
  assert.equal(stats.attack, 710)
  assert.equal(stats.attackSpeed, 105)
  assert.ok(Math.abs(stats.attackInterval - (1.25 * 100 / 105)) < 1e-9)
})

test('召喚物向けモジュール効果は本体へ混ぜず未対応理由を返す', () => {
  const module = createModule()
  const phase = module.phases?.[2]
  assert.ok(phase)
  phase.tokenAttributeBlackboard = {
    token_1: [{ key: 'atk', value: 80 }],
  }
  phase.parts?.push({
    target: 'TALENT',
    isToken: true,
    addOrOverrideTalentDataBundle: {
      candidates: [{
        talentIndex: 0,
        requiredPotentialRank: 0,
        name: '召喚物強化',
        upgradeDescription: '召喚物の攻撃力+20%',
        blackboard: [{ key: 'atk', value: 0.2 }],
      }],
    },
  })

  const basePassives = getOperatorPassives(createProfile(), 2, 90)
  const application = applyOperatorModule(basePassives, module, 3)

  assert.equal(application.moduleAttack, 60)
  assert.equal(application.changes.some((change) => change.kind === 'TOKEN'), true)
  assert.equal(application.unsupportedReasons.some((reason) => reason.includes('召喚物')), true)
  assert.equal(application.passives.talents[0].description, '攻撃時、対象の術耐性を26無視')
})

test('モジュールの特性上書きと追加説明を表示用特性・出典へ同時に反映する', () => {
  const module = createModule()
  const phase = module.phases?.[2]
  assert.ok(phase)
  phase.parts = [{
    target: 'TRAIT',
    isToken: false,
    overrideTraitDataBundle: {
      candidates: [{
        requiredPotentialRank: 0,
        overrideDescripton: '   ',
        overrideDescription: '通常攻撃が{atk_scale:0%}の物理ダメージを与える',
        additionalDescription: 'さらに攻撃速度+{attack_speed}',
        blackboard: [
          { key: 'atk_scale', value: 1.2 },
          { key: 'attack_speed', value: 8 },
        ],
      }],
    },
  }]

  const basePassives = getOperatorPassives(createProfile(), 2, 90)
  const application = applyOperatorModule(basePassives, module, 3)
  const traitSource = application.passives.sources.find((source) => source.sourceKind === 'TRAIT')

  assert.equal(
    application.passives.traitDescription,
    '通常攻撃が120%の物理ダメージを与える さらに攻撃速度+8',
  )
  assert.equal(traitSource?.description, application.passives.traitDescription)
  assert.equal(traitSource?.blackboard.some((entry) => entry.key === 'atk_scale' && entry.value === 1.2), true)
  assert.equal(traitSource?.blackboard.some((entry) => entry.key === 'attack_speed' && entry.value === 8), true)
  assert.deepEqual(
    application.changes.filter((change) => change.kind === 'TRAIT').map((change) => change.description),
    [
      '通常攻撃が120%の物理ダメージを与える',
      'さらに攻撃速度+8',
    ],
  )
  assert.equal(basePassives.traitDescription, '敵に術ダメージを与える')
})

function createProfile(): OperatorCombatProfile {
  return {
    phases: [
      { maxLevel: 50, attributesKeyFrames: [{ level: 1, data: { atk: 100 } }] },
      { maxLevel: 80, attributesKeyFrames: [{ level: 80, data: { atk: 400 } }] },
      {
        maxLevel: 90,
        attributesKeyFrames: [{
          level: 90,
          data: { atk: 600, attackSpeed: 100, baseAttackTime: 1.25 },
        }],
      },
    ],
    favorKeyFrames: [
      { level: 0, data: { atk: 0 } },
      { level: 50, data: { atk: 50 } },
    ],
    traitDescription: '敵に術ダメージを与える',
    trait: {
      candidates: [{
        unlockCondition: { phase: 'PHASE_0', level: 1 },
        requiredPotentialRank: 0,
        blackboard: [],
      }],
    },
    talents: [{
      candidates: [{
        unlockCondition: { phase: 'PHASE_2', level: 1 },
        requiredPotentialRank: 0,
        prefabKey: '1',
        name: '劫火',
        description: '攻撃時、対象の術耐性を20無視',
        blackboard: [{ key: 'magic_resist_penetrate_fixed', value: 20 }],
      }],
    }],
  }
}

function createModule(): RawOperatorModule {
  return {
    uniEquipId: 'uniequip_test',
    uniEquipName: 'テストモジュール',
    type: 'ADVANCED',
    typeName1: 'X',
    unlockEvolvePhase: 'PHASE_2',
    unlockLevel: 60,
    phases: [
      createModulePhase(1, 30, 0, 20),
      createModulePhase(2, 48, 0, 24),
      createModulePhase(3, 60, 5, 26),
    ],
  }
}

function createModulePhase(level: number, attack: number, attackSpeed: number, resistanceIgnore: number) {
  return {
    equipLevel: level,
    attributeBlackboard: {
      atk: attack,
      attack_speed: attackSpeed,
      max_hp: 100 + level * 10,
    },
    parts: [
      {
        target: 'TRAIT',
        isToken: false,
        overrideTraitDataBundle: {
          candidates: [{
            requiredPotentialRank: 0,
            additionalDescription: '未ブロック時、攻撃速度+{attack_speed}',
            blackboard: [{ key: 'attack_speed', value: 8 }],
          }],
        },
      },
      {
        target: 'TALENT_DATA_ONLY',
        isToken: false,
        addOrOverrideTalentDataBundle: {
          candidates: [
            {
              talentIndex: 0,
              requiredPotentialRank: 0,
              prefabKey: '1',
              name: '劫火',
              upgradeDescription: `攻撃時、対象の術耐性を${resistanceIgnore}無視`,
              blackboard: [{ key: 'magic_resist_penetrate_fixed', value: resistanceIgnore }],
            },
            {
              talentIndex: 0,
              requiredPotentialRank: 4,
              prefabKey: '1',
              name: '劫火',
              upgradeDescription: '潜在強化値',
              blackboard: [{ key: 'magic_resist_penetrate_fixed', value: 99 }],
            },
          ],
        },
      },
      {
        target: 'TALENT',
        isToken: false,
        addOrOverrideTalentDataBundle: {
          candidates: [{
            talentIndex: -1,
            requiredPotentialRank: 0,
            isHideTalent: true,
            blackboard: [{ key: 'atk_scale', value: 1.1 }],
          }],
        },
      },
    ],
    tokenAttributeBlackboard: {},
  }
}
