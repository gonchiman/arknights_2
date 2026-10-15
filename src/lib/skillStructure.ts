import type { SkillCoarseCategory } from './skillCoarseClassification.ts'
import { SKILL_DIRECTORY_SP_TYPE_LABELS } from './skillDirectory.ts'

export type SkillStructureComparison = 'EQ' | 'NE' | 'GT' | 'GTE' | 'LT' | 'LTE'
export type SkillStructureNumericMetric = 'skillActivationCount' | 'actualAttackTargetCount'

/** Conditions remain machine-readable; labels are derived only when displayed. */
export type SkillStructurePredicate =
  | { readonly metric: SkillStructureNumericMetric; readonly comparison: SkillStructureComparison; readonly value: number }
  | { readonly metric: 'attackDistanceType'; readonly comparison: 'EQ' | 'NE'; readonly value: 'RANGED' | 'MELEE' }

export type SkillStructureDuration =
  | { readonly type: 'FIXED_SECONDS'; readonly seconds: number }
  | { readonly type: 'UNTIL_EXIT' }

export type SkillStructureEndCondition =
  | { readonly type: 'SECONDS_ELAPSED'; readonly seconds: number }
  | { readonly type: 'OPERATOR_EXIT' }

export type SkillStructureEffectTiming = 'WHILE_STAGE_ACTIVE' | 'ON_ATTACK'
export type SkillStructureEffectTarget = 'SELF' | 'SELF_ATTACK'
export type SkillStructureEffectOperation = 'ADD_RATIO' | 'ADD_VALUE' | 'EXTEND_FORWARD' | 'REPLACE' | 'SET' | 'MULTIPLY' | 'SET_ENABLED'

interface SkillStructureEffectBase {
  readonly id: string
  readonly timing: SkillStructureEffectTiming
  readonly condition: SkillStructurePredicate | null
  readonly target: SkillStructureEffectTarget
  readonly sourceBinding: string
}

/** Each variant binds an item to its allowed operation, unit and value type. */
export type SkillStructureEffect = SkillStructureEffectBase & (
  | { readonly item: 'ATK_BUFF_RATIO' | 'DEF_BUFF_RATIO'; readonly operation: 'ADD_RATIO'; readonly value: number; readonly unit: 'RATIO' }
  | { readonly item: 'ATTACK_SPEED'; readonly operation: 'ADD_VALUE'; readonly value: number; readonly unit: 'POINT' }
  | { readonly item: 'ATTACK_RANGE'; readonly operation: 'EXTEND_FORWARD'; readonly value: number; readonly unit: 'TILE' }
  | { readonly item: 'ATTACK_RANGE'; readonly operation: 'REPLACE'; readonly value: { readonly rangeId: string }; readonly unit: 'RANGE_DEFINITION' }
  | { readonly item: 'MAX_TARGETS'; readonly operation: 'SET'; readonly value: number; readonly unit: 'ENEMY' }
  | { readonly item: 'ATTACK_SCALE'; readonly operation: 'MULTIPLY'; readonly value: number; readonly unit: 'MULTIPLIER' }
  | { readonly item: 'ATTACK_TREATMENT'; readonly operation: 'SET'; readonly value: 'MELEE' | 'RANGED'; readonly unit: 'ATTACK_MODE' }
  | { readonly item: 'TRAIT_RANGED_ATK_PENALTY'; readonly operation: 'SET_ENABLED'; readonly value: boolean; readonly unit: 'BOOLEAN' }
)

export interface SkillStructureStage {
  readonly id: string
  readonly label: string
  readonly applicability: SkillStructurePredicate | null
  readonly duration: SkillStructureDuration
  readonly endCondition: SkillStructureEndCondition
  readonly effects: readonly SkillStructureEffect[]
}

export interface SkillStructureSelection {
  readonly operatorId: string
  readonly skillId: string
  readonly skillIndex: number
  readonly levelIndex: number
}

export interface SkillStructure {
  readonly basicInfo: SkillStructureSelection & {
    readonly operatorName: string
    readonly skillName: string
    readonly skillLevel: string
  }
  readonly classificationInfo: {
    /** Explicitly verified memberships, not description-classifier candidates. */
    readonly coarseCategories: readonly SkillCoarseCategory[]
  }
  readonly activationSettings: {
    readonly spRecovery: 'INCREASE_WITH_TIME' | 'INCREASE_WHEN_ATTACK' | 'INCREASE_WHEN_TAKEN_DAMAGE' | 'NO_SP'
    readonly initialSp: number
    readonly spCost: number
    readonly maxCharges: number
    readonly activationMethod: 'MANUAL' | 'AUTO' | 'PASSIVE'
    readonly activationTrigger: 'MANUAL_INPUT' | 'SP_FULL' | 'ON_DEPLOY'
  }
  readonly effectStructure: {
    readonly stages: readonly SkillStructureStage[]
    readonly relations?: readonly {
      readonly type: 'BONUS_VALUE_RELATION'
      readonly firstStage: string
      readonly laterStage: string
      readonly items: readonly SkillStructureEffect['item'][]
      readonly multiplier: number
    }[]
    readonly inputRequirements?: readonly SkillStructureNumericMetric[]
  }
  readonly source: {
    readonly description: string
    readonly rawDescription: string
    readonly blackboard: readonly { readonly key: string; readonly value: number; readonly valueStr: string | null }[]
    readonly rangeId: string | null
    readonly duration: number
  }
  readonly notes: readonly string[]
}

export interface SkillStructureRange {
  readonly id: string
  readonly direction: number
  readonly grids: readonly { readonly row: number; readonly col: number }[]
}

type SkillStructureIdentity = Pick<SkillStructureSelection, 'operatorId' | 'skillId' | 'skillIndex'>

/** Level is always matched exactly; a reviewed 特化3 never fills another level. */
export function findSkillStructure(selection: SkillStructureSelection): SkillStructure | null {
  return SKILL_STRUCTURES.find((structure) => sameSkill(structure.basicInfo, selection)
    && structure.basicInfo.levelIndex === selection.levelIndex) ?? null
}

export function isSkillStructureRecord(record: SkillStructureIdentity): boolean {
  return SKILL_STRUCTURES.some((structure) => sameSkill(structure.basicInfo, record))
}

export function getSkillStructureLevelIndices(skill: SkillStructureIdentity): readonly number[] {
  return [...new Set(SKILL_STRUCTURES
    .filter((structure) => sameSkill(structure.basicInfo, skill))
    .map((structure) => structure.basicInfo.levelIndex))].sort((a, b) => a - b)
}

function sameSkill(a: SkillStructureIdentity, b: SkillStructureIdentity): boolean {
  return a.operatorId === b.operatorId && a.skillId === b.skillId && a.skillIndex === b.skillIndex
}

const PREDICATE_METRIC_LABELS = {
  skillActivationCount: '発動回数',
  actualAttackTargetCount: '攻撃対象数',
  attackDistanceType: '攻撃距離',
} satisfies Record<SkillStructurePredicate['metric'], string>

const COMPARISON_LABELS = {
  EQ: '＝', NE: '≠', GT: '＞', GTE: '≧', LT: '＜', LTE: '≦',
} satisfies Record<SkillStructureComparison, string>

export function formatSkillStructurePredicate(
  predicate: SkillStructurePredicate | null,
  emptyLabel = 'なし',
): string {
  if (predicate === null) return emptyLabel
  const value = predicate.metric === 'attackDistanceType'
    ? predicate.value === 'RANGED' ? '遠距離' : '近接'
    : formatNumber(predicate.value)
  return `${PREDICATE_METRIC_LABELS[predicate.metric]}${COMPARISON_LABELS[predicate.comparison]}${value}`
}

export function formatSkillStructureDuration(duration: SkillStructureDuration): string {
  return duration.type === 'FIXED_SECONDS' ? `${formatNumber(duration.seconds)}秒` : '時間制限なし'
}

export function formatSkillStructureEndCondition(condition: SkillStructureEndCondition): string {
  return condition.type === 'SECONDS_ELAPSED' ? `${formatNumber(condition.seconds)}秒経過` : '本人の退場'
}

export function formatSkillStructureSpRecovery(recovery: SkillStructure['activationSettings']['spRecovery']): string {
  return SKILL_DIRECTORY_SP_TYPE_LABELS[recovery]
}

export function formatSkillStructureActivationMethod(method: SkillStructure['activationSettings']['activationMethod']): string {
  return { MANUAL: '手動発動', AUTO: '自動発動', PASSIVE: 'パッシブ' }[method]
}

export function formatSkillStructureActivationTrigger(trigger: SkillStructure['activationSettings']['activationTrigger']): string {
  return { MANUAL_INPUT: '手動操作', SP_FULL: 'SP満了', ON_DEPLOY: '配置時' }[trigger]
}

export function formatSkillStructureEffectTiming(timing: SkillStructureEffectTiming): string {
  return { WHILE_STAGE_ACTIVE: '段階中', ON_ATTACK: '攻撃時' }[timing]
}

export function formatSkillStructureEffectTarget(target: SkillStructureEffectTarget): string {
  return { SELF: '自身', SELF_ATTACK: '自身の攻撃' }[target]
}

export function formatSkillStructureEffectItem(item: SkillStructureEffect['item']): string {
  return {
    ATK_BUFF_RATIO: '攻撃力',
    DEF_BUFF_RATIO: '防御力',
    ATTACK_SPEED: '攻撃速度',
    ATTACK_RANGE: '攻撃範囲',
    MAX_TARGETS: '対象数上限',
    ATTACK_SCALE: '攻撃倍率',
    ATTACK_TREATMENT: '攻撃の扱い',
    TRAIT_RANGED_ATK_PENALTY: '遠距離減衰',
  }[item]
}

export function formatSkillStructureEffectOperation(effect: SkillStructureEffect): string {
  if (effect.item === 'MAX_TARGETS') return '上限設定'
  return {
    ADD_RATIO: '割合加算', ADD_VALUE: '数値加算', EXTEND_FORWARD: '前方延長',
    REPLACE: '範囲置換', SET: '設定', MULTIPLY: '倍率適用', SET_ENABLED: '適用設定',
  }[effect.operation]
}

export function formatSkillStructureEffectValue(effect: SkillStructureEffect): string {
  switch (effect.unit) {
    case 'RATIO': return `${signedNumber(effect.value * 100)}％`
    case 'POINT': return signedNumber(effect.value)
    case 'TILE': return `${signedNumber(effect.value)}マス`
    case 'RANGE_DEFINITION': return `範囲${effect.value.rangeId}`
    case 'ENEMY': return `${formatNumber(effect.value)}体`
    case 'MULTIPLIER': return `×${formatNumber(effect.value)}`
    case 'ATTACK_MODE': return effect.value === 'MELEE' ? '近接攻撃' : '遠距離攻撃'
    case 'BOOLEAN': return effect.value ? '有効' : '無効'
  }
}

function formatNumber(value: number): string {
  return String(Math.round(value * 1_000_000) / 1_000_000)
}

function signedNumber(value: number): string {
  return `${value < 0 ? '－' : '＋'}${formatNumber(Math.abs(value))}`
}

/**
 * Four reviewed examples from the agreed skill structure document, at 特化3 only.
 * These records do not claim calculator support and do not reuse the display-only
 * description breakdown as executable effects.
 */
export const SKILL_STRUCTURES: readonly SkillStructure[] = [
  {
    "basicInfo": {
      "operatorId": "char_263_skadi",
      "operatorName": "スカジ",
      "skillId": "skcom_quickattack[3]",
      "skillIndex": 1,
      "skillName": "迅速攻撃γ",
      "skillLevel": "特化3",
      "levelIndex": 9
    },
    "classificationInfo": {
      "coarseCategories": [
        "SUSTAINED"
      ]
    },
    "activationSettings": {
      "spRecovery": "INCREASE_WITH_TIME",
      "initialSp": 15,
      "spCost": 35,
      "maxCharges": 1,
      "activationMethod": "MANUAL",
      "activationTrigger": "MANUAL_INPUT"
    },
    "effectStructure": {
      "stages": [
        {
          "id": "active",
          "label": "通常",
          "applicability": null,
          "duration": {
            "type": "FIXED_SECONDS",
            "seconds": 35
          },
          "endCondition": {
            "type": "SECONDS_ELAPSED",
            "seconds": 35
          },
          "effects": [
            {
              "id": "atk",
              "timing": "WHILE_STAGE_ACTIVE",
              "condition": null,
              "target": "SELF",
              "item": "ATK_BUFF_RATIO",
              "operation": "ADD_RATIO",
              "value": 0.45,
              "unit": "RATIO",
              "sourceBinding": "atk"
            },
            {
              "id": "aspd",
              "timing": "WHILE_STAGE_ACTIVE",
              "condition": null,
              "target": "SELF",
              "item": "ATTACK_SPEED",
              "operation": "ADD_VALUE",
              "value": 45,
              "unit": "POINT",
              "sourceBinding": "attack_speed"
            }
          ]
        }
      ]
    },
    "source": {
      "description": "攻撃力+45%、攻撃速度+45",
      "rawDescription": "攻撃力<@ba.vup>+{atk:0%}</>、攻撃速度<@ba.vup>+{attack_speed}</>",
      "blackboard": [
        {
          "key": "atk",
          "value": 0.45,
          "valueStr": null
        },
        {
          "key": "attack_speed",
          "value": 45,
          "valueStr": null
        }
      ],
      "rangeId": null,
      "duration": 35
    },
    "notes": [
      "攻撃力は割合加算、攻撃速度は数値加算として保持する。＋45％と＋45を同じ操作にまとめない。"
    ]
  },
  {
    "basicInfo": {
      "operatorId": "char_350_surtr",
      "operatorName": "スルト",
      "skillId": "skchr_surtr_2",
      "skillIndex": 2,
      "skillName": "災厄の巨焔",
      "skillLevel": "特化3",
      "levelIndex": 9
    },
    "classificationInfo": {
      "coarseCategories": [
        "SUSTAINED"
      ]
    },
    "activationSettings": {
      "spRecovery": "INCREASE_WITH_TIME",
      "initialSp": 12,
      "spCost": 18,
      "maxCharges": 1,
      "activationMethod": "MANUAL",
      "activationTrigger": "MANUAL_INPUT"
    },
    "effectStructure": {
      "stages": [
        {
          "id": "active",
          "label": "通常",
          "applicability": null,
          "duration": {
            "type": "FIXED_SECONDS",
            "seconds": 18
          },
          "endCondition": {
            "type": "SECONDS_ELAPSED",
            "seconds": 18
          },
          "effects": [
            {
              "id": "atk",
              "timing": "WHILE_STAGE_ACTIVE",
              "condition": null,
              "target": "SELF",
              "item": "ATK_BUFF_RATIO",
              "operation": "ADD_RATIO",
              "value": 1.2,
              "unit": "RATIO",
              "sourceBinding": "atk"
            },
            {
              "id": "range",
              "timing": "WHILE_STAGE_ACTIVE",
              "condition": null,
              "target": "SELF",
              "item": "ATTACK_RANGE",
              "operation": "EXTEND_FORWARD",
              "value": 1,
              "unit": "TILE",
              "sourceBinding": "ability_range_forward_extend"
            },
            {
              "id": "targets",
              "timing": "WHILE_STAGE_ACTIVE",
              "condition": null,
              "target": "SELF_ATTACK",
              "item": "MAX_TARGETS",
              "operation": "SET",
              "value": 2,
              "unit": "ENEMY",
              "sourceBinding": "attack@max_target"
            },
            {
              "id": "single_target",
              "timing": "ON_ATTACK",
              "condition": {
                "metric": "actualAttackTargetCount",
                "comparison": "EQ",
                "value": 1
              },
              "target": "SELF_ATTACK",
              "item": "ATTACK_SCALE",
              "operation": "MULTIPLY",
              "value": 1.6,
              "unit": "MULTIPLIER",
              "sourceBinding": "attack@surtr_s_2[critical].atk_scale"
            }
          ]
        }
      ]
    },
    "source": {
      "description": "攻撃力+120%、攻撃範囲+1マス、攻撃対象数+1\n攻撃対象が1体のみの場合、攻撃力が160%まで上昇",
      "rawDescription": "攻撃力<@ba.vup>+{atk:0%}</>、攻撃範囲<@ba.vup>+{ability_range_forward_extend}</>マス、攻撃対象数<@ba.vup>+1</>\n攻撃対象が1体のみの場合、攻撃力が<@ba.vup>{attack@surtr_s_2[critical].atk_scale:0%}</>まで上昇",
      "blackboard": [
        {
          "key": "atk",
          "value": 1.2,
          "valueStr": null
        },
        {
          "key": "ability_range_forward_extend",
          "value": 1,
          "valueStr": null
        },
        {
          "key": "attack@max_target",
          "value": 2,
          "valueStr": null
        },
        {
          "key": "attack@surtr_s_2[critical].atk_scale",
          "value": 1.6,
          "valueStr": null
        }
      ],
      "rangeId": null,
      "duration": 18
    },
    "notes": [
      "原文の「攻撃対象数＋1」は、blackboardにある上限2体として記述した。攻撃対象数＝1は実際の攻撃対象の条件で、範囲内の敵数とは分けて保持する。",
      "条件付きの「攻撃力が160％まで上昇」は atk_scale＝1.6 を根拠に攻撃倍率へ分けた。攻撃力＋120％の効果へ合算しない。"
    ]
  },
  {
    "basicInfo": {
      "operatorId": "char_172_svrash",
      "operatorName": "シルバーアッシュ",
      "skillId": "skchr_svrash_3",
      "skillIndex": 3,
      "skillName": "真銀斬",
      "skillLevel": "特化3",
      "levelIndex": 9
    },
    "classificationInfo": {
      "coarseCategories": [
        "SUSTAINED"
      ]
    },
    "activationSettings": {
      "spRecovery": "INCREASE_WITH_TIME",
      "initialSp": 75,
      "spCost": 90,
      "maxCharges": 1,
      "activationMethod": "MANUAL",
      "activationTrigger": "MANUAL_INPUT"
    },
    "effectStructure": {
      "stages": [
        {
          "id": "active",
          "label": "通常",
          "applicability": null,
          "duration": {
            "type": "FIXED_SECONDS",
            "seconds": 30
          },
          "endCondition": {
            "type": "SECONDS_ELAPSED",
            "seconds": 30
          },
          "effects": [
            {
              "id": "def",
              "timing": "WHILE_STAGE_ACTIVE",
              "condition": null,
              "target": "SELF",
              "item": "DEF_BUFF_RATIO",
              "operation": "ADD_RATIO",
              "value": -0.7,
              "unit": "RATIO",
              "sourceBinding": "def"
            },
            {
              "id": "atk",
              "timing": "WHILE_STAGE_ACTIVE",
              "condition": null,
              "target": "SELF",
              "item": "ATK_BUFF_RATIO",
              "operation": "ADD_RATIO",
              "value": 2,
              "unit": "RATIO",
              "sourceBinding": "atk"
            },
            {
              "id": "range",
              "timing": "WHILE_STAGE_ACTIVE",
              "condition": null,
              "target": "SELF",
              "item": "ATTACK_RANGE",
              "operation": "REPLACE",
              "value": {
                "rangeId": "3-7"
              },
              "unit": "RANGE_DEFINITION",
              "sourceBinding": "rangeId"
            },
            {
              "id": "targets",
              "timing": "WHILE_STAGE_ACTIVE",
              "condition": null,
              "target": "SELF_ATTACK",
              "item": "MAX_TARGETS",
              "operation": "SET",
              "value": 6,
              "unit": "ENEMY",
              "sourceBinding": "attack@max_target"
            },
            {
              "id": "attack_mode",
              "timing": "ON_ATTACK",
              "condition": null,
              "target": "SELF_ATTACK",
              "item": "ATTACK_TREATMENT",
              "operation": "SET",
              "value": "MELEE",
              "unit": "ATTACK_MODE",
              "sourceBinding": "description"
            }
          ]
        }
      ]
    },
    "source": {
      "description": "防御力-70%、攻撃力+200%、攻撃範囲拡大、敵最大6体を同時に攻撃（近接攻撃と見なす）",
      "rawDescription": "防御力<@ba.vdown>-{-def:0%}</>、攻撃力<@ba.vup>+{atk:0%}</>、攻撃範囲<@ba.vup>拡大</>、敵最大<@ba.vup>{attack@max_target}</>体を同時に攻撃（近接攻撃と見なす）",
      "blackboard": [
        {
          "key": "def",
          "value": -0.7,
          "valueStr": null
        },
        {
          "key": "atk",
          "value": 2,
          "valueStr": null
        },
        {
          "key": "attack@max_target",
          "value": 6,
          "valueStr": null
        }
      ],
      "rangeId": "3-7",
      "duration": 30
    },
    "notes": [
      "「最大6体」と「近接攻撃と見なす」を別の効果として残す。対象数だけでは、攻撃時の減衰や他の条件を計算する情報が不足する。",
      "攻撃範囲は range_table の範囲3-7を参照する。16セルの形を保持できるため、単に「拡大」とだけ記録する必要がない。"
    ]
  },
  {
    "basicInfo": {
      "operatorId": "char_293_thorns",
      "operatorName": "ソーンズ",
      "skillId": "skchr_thorns_3",
      "skillIndex": 3,
      "skillName": "デストレッツァ",
      "skillLevel": "特化3",
      "levelIndex": 9
    },
    "classificationInfo": {
      "coarseCategories": [
        "SUSTAINED"
      ]
    },
    "activationSettings": {
      "spRecovery": "INCREASE_WHEN_ATTACK",
      "initialSp": 0,
      "spCost": 15,
      "maxCharges": 1,
      "activationMethod": "MANUAL",
      "activationTrigger": "MANUAL_INPUT"
    },
    "effectStructure": {
      "stages": [
        {
          "id": "first",
          "label": "初回",
          "applicability": {
            "metric": "skillActivationCount",
            "comparison": "EQ",
            "value": 1
          },
          "duration": {
            "type": "FIXED_SECONDS",
            "seconds": 30
          },
          "endCondition": {
            "type": "SECONDS_ELAPSED",
            "seconds": 30
          },
          "effects": [
            {
              "id": "range",
              "timing": "WHILE_STAGE_ACTIVE",
              "condition": null,
              "target": "SELF",
              "item": "ATTACK_RANGE",
              "operation": "REPLACE",
              "value": {
                "rangeId": "3-3"
              },
              "unit": "RANGE_DEFINITION",
              "sourceBinding": "rangeId"
            },
            {
              "id": "atk",
              "timing": "WHILE_STAGE_ACTIVE",
              "condition": null,
              "target": "SELF",
              "item": "ATK_BUFF_RATIO",
              "operation": "ADD_RATIO",
              "value": 0.6,
              "unit": "RATIO",
              "sourceBinding": "atk"
            },
            {
              "id": "aspd",
              "timing": "WHILE_STAGE_ACTIVE",
              "condition": null,
              "target": "SELF",
              "item": "ATTACK_SPEED",
              "operation": "ADD_VALUE",
              "value": 25,
              "unit": "POINT",
              "sourceBinding": "attack_speed"
            },
            {
              "id": "ranged_penalty",
              "timing": "ON_ATTACK",
              "condition": {
                "metric": "attackDistanceType",
                "comparison": "EQ",
                "value": "RANGED"
              },
              "target": "SELF_ATTACK",
              "item": "TRAIT_RANGED_ATK_PENALTY",
              "operation": "SET_ENABLED",
              "value": false,
              "unit": "BOOLEAN",
              "sourceBinding": "description"
            }
          ]
        },
        {
          "id": "second_and_later",
          "label": "2回目以降",
          "applicability": {
            "metric": "skillActivationCount",
            "comparison": "GTE",
            "value": 2
          },
          "duration": {
            "type": "UNTIL_EXIT"
          },
          "endCondition": {
            "type": "OPERATOR_EXIT"
          },
          "effects": [
            {
              "id": "range",
              "timing": "WHILE_STAGE_ACTIVE",
              "condition": null,
              "target": "SELF",
              "item": "ATTACK_RANGE",
              "operation": "REPLACE",
              "value": {
                "rangeId": "3-3"
              },
              "unit": "RANGE_DEFINITION",
              "sourceBinding": "rangeId"
            },
            {
              "id": "atk",
              "timing": "WHILE_STAGE_ACTIVE",
              "condition": null,
              "target": "SELF",
              "item": "ATK_BUFF_RATIO",
              "operation": "ADD_RATIO",
              "value": 1.2,
              "unit": "RATIO",
              "sourceBinding": "thorns_s_3[b].atk"
            },
            {
              "id": "aspd",
              "timing": "WHILE_STAGE_ACTIVE",
              "condition": null,
              "target": "SELF",
              "item": "ATTACK_SPEED",
              "operation": "ADD_VALUE",
              "value": 50,
              "unit": "POINT",
              "sourceBinding": "thorns_s_3[b].attack_speed"
            },
            {
              "id": "ranged_penalty",
              "timing": "ON_ATTACK",
              "condition": {
                "metric": "attackDistanceType",
                "comparison": "EQ",
                "value": "RANGED"
              },
              "target": "SELF_ATTACK",
              "item": "TRAIT_RANGED_ATK_PENALTY",
              "operation": "SET_ENABLED",
              "value": false,
              "unit": "BOOLEAN",
              "sourceBinding": "description"
            }
          ]
        }
      ],
      "relations": [
        {
          "type": "BONUS_VALUE_RELATION",
          "firstStage": "first",
          "laterStage": "second_and_later",
          "items": [
            "ATK_BUFF_RATIO",
            "ATTACK_SPEED"
          ],
          "multiplier": 2
        }
      ],
      "inputRequirements": [
        "skillActivationCount"
      ]
    },
    "source": {
      "description": "攻撃範囲拡大、攻撃力+60%、攻撃速度+25、特性による遠距離攻撃時の攻撃力低下が無効化される\n2回目以降スキル使用時、攻撃力と攻撃速度のスキル効果が1回目の2倍になり、退場まで効果継続",
      "rawDescription": "攻撃範囲<@ba.vup>拡大</>、攻撃力<@ba.vup>+{atk:0%}</>、攻撃速度<@ba.vup>+{attack_speed}</>、特性による遠距離攻撃時の攻撃力低下が無効化される\n<@ba.rem>2回目以降スキル使用時、攻撃力と攻撃速度のスキル効果が1回目の2倍になり、退場まで効果継続</>",
      "blackboard": [
        {
          "key": "atk",
          "value": 0.6,
          "valueStr": null
        },
        {
          "key": "attack_speed",
          "value": 25,
          "valueStr": null
        },
        {
          "key": "thorns_s_3[b].atk",
          "value": 1.2,
          "valueStr": null
        },
        {
          "key": "thorns_s_3[b].attack_speed",
          "value": 50,
          "valueStr": null
        },
        {
          "key": "thorns_s_3[b].duration",
          "value": -1,
          "valueStr": null
        }
      ],
      "rangeId": "3-3",
      "duration": 30
    },
    "notes": [
      "2回目以降はスキルによる加算量が2倍になる。初回分を残して重ねる指定ではなく、その段階の＋120％と＋50を使う。範囲と遠距離減衰の無効化も両段階に残す。",
      "発動回数を段階選択の入力として保持する。再配置時に発動回数をどう扱うかは今回の元データに明記がなく、状態管理を実装するときに確認する。"
    ]
  }
]

export const SKILL_STRUCTURE_RANGES: Readonly<Record<string, SkillStructureRange>> = {
  "3-3": {
    "id": "3-3",
    "direction": 1,
    "grids": [
      {
        "row": 1,
        "col": 0
      },
      {
        "row": 1,
        "col": 1
      },
      {
        "row": 1,
        "col": 2
      },
      {
        "row": 1,
        "col": 3
      },
      {
        "row": 0,
        "col": 0
      },
      {
        "row": 0,
        "col": 1
      },
      {
        "row": 0,
        "col": 2
      },
      {
        "row": 0,
        "col": 3
      },
      {
        "row": -1,
        "col": 0
      },
      {
        "row": -1,
        "col": 1
      },
      {
        "row": -1,
        "col": 2
      },
      {
        "row": -1,
        "col": 3
      }
    ]
  },
  "3-7": {
    "id": "3-7",
    "direction": 1,
    "grids": [
      {
        "row": 3,
        "col": 0
      },
      {
        "row": 2,
        "col": 0
      },
      {
        "row": 2,
        "col": 1
      },
      {
        "row": 1,
        "col": 0
      },
      {
        "row": 1,
        "col": 1
      },
      {
        "row": 1,
        "col": 2
      },
      {
        "row": 0,
        "col": 0
      },
      {
        "row": 0,
        "col": 1
      },
      {
        "row": 0,
        "col": 2
      },
      {
        "row": 0,
        "col": 3
      },
      {
        "row": -1,
        "col": 0
      },
      {
        "row": -1,
        "col": 1
      },
      {
        "row": -1,
        "col": 2
      },
      {
        "row": -2,
        "col": 0
      },
      {
        "row": -2,
        "col": 1
      },
      {
        "row": -3,
        "col": 0
      }
    ]
  }
}
