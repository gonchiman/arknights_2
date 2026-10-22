import type { GuardSource } from './guardCombatTypes.ts'

/** Reviewed JP skill snapshot (2026-10-21): 25 additional operators, 75 skills.
 * Skill descriptions and blackboard values are retained here.
 * Talent effects are read from the runtime operatorProfile; full source talents remain in the test fixture.
 */
export const GUARD_SKILL_SOURCES = [
  {
    "id": "char_264_f12yin",
    "name": "マウンテン",
    "subProfessionId": "fighter",
    "trait": "敵を1体までブロック",
    "talents": [],
    "skills": [
      {
        "skillIndex": 1,
        "skillId": "skchr_f12yin_1",
        "supported": false,
        "raw": {
          "name": "左鉤突き",
          "rangeId": null,
          "description": "次の通常攻撃時、攻撃力が<@ba.vup>{atk_scale:0%}</>まで上昇、攻撃対象数+1",
          "skillType": "AUTO",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WHEN_ATTACK",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 3,
            "initSp": 0,
            "increment": 1
          },
          "prefabId": "skchr_f12yin_1",
          "duration": 0,
          "blackboard": [
            {
              "key": "atk_scale",
              "value": 2.3,
              "valueStr": null
            },
            {
              "key": "max_target",
              "value": 2,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 2,
        "skillId": "skchr_f12yin_2",
        "supported": false,
        "raw": {
          "name": "猛虎の構え",
          "rangeId": "0-1",
          "description": "<@ba.rem>発動するたび初期状態と次の状態とが切り替わる：</>\n防御力<@ba.vdown>-{-def:0%}</>、攻撃範囲<@ba.vdown>縮小</>、攻撃力<@ba.vup>+{atk:0%}</>、ブロック数<@ba.vup>+{block_cnt}</>、ブロック中の敵全員を同時に攻撃、1秒ごとにHPが最大値の<@ba.vup>{HP_RECOVERY_PER_SEC_BY_MAX_HP_RATIO:0.0%}</>回復",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 5,
            "initSp": 0,
            "increment": 1
          },
          "prefabId": "skchr_f12yin_2",
          "duration": 0,
          "blackboard": [
            {
              "key": "atk",
              "value": 0.8,
              "valueStr": null
            },
            {
              "key": "def",
              "value": -0.2,
              "valueStr": null
            },
            {
              "key": "hp_recovery_per_sec_by_max_hp_ratio",
              "value": 0.07,
              "valueStr": null
            },
            {
              "key": "block_cnt",
              "value": 1,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 3,
        "skillId": "skchr_f12yin_3",
        "supported": false,
        "raw": {
          "name": "震地砕岩撃",
          "rangeId": "x-5",
          "description": "通常攻撃の間隔を<@ba.vdown>延長</>し、攻撃力<@ba.vup>+{atk:0%}</>、攻撃が<@ba.vup>2</>連撃になり、第一素質の発動確率が<@ba.vup>{talent@prob:0%}</>まで上昇、周囲一定範囲内の敵最大<@ba.vup>{attack@max_target}</>体を同時に攻撃し、<@ba.vup>相当の力で</>突き飛ばす",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 40,
            "initSp": 25,
            "increment": 1
          },
          "prefabId": "skchr_f12yin_3",
          "duration": 30,
          "blackboard": [
            {
              "key": "base_attack_time",
              "value": 0.7,
              "valueStr": null
            },
            {
              "key": "atk",
              "value": 1,
              "valueStr": null
            },
            {
              "key": "talent@prob",
              "value": 0.75,
              "valueStr": null
            },
            {
              "key": "attack@force",
              "value": 1,
              "valueStr": null
            },
            {
              "key": "attack@max_target",
              "value": 4,
              "valueStr": null
            }
          ]
        }
      }
    ]
  },
  {
    "id": "char_2024_chyue",
    "name": "チョンユエ",
    "subProfessionId": "fighter",
    "trait": "敵を1体までブロック",
    "talents": [],
    "skills": [
      {
        "skillIndex": 1,
        "skillId": "skchr_chyue_1",
        "supported": false,
        "raw": {
          "name": "満盈",
          "rangeId": null,
          "description": "敵1体に攻撃力の<@ba.vup>{atk_scale:0%}</>の物理ダメージを与える。スキルが最大までチャージされている場合は、それをすべて消費し、そのチャージ数と同じ回数分のダメージを与える\n<@ba.rem>（3回チャージ可能）</>",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WHEN_ATTACK",
            "levelUpCost": null,
            "maxChargeTime": 3,
            "spCost": 3,
            "initSp": 0,
            "increment": 1
          },
          "prefabId": "skchr_chyue_1",
          "duration": 0,
          "blackboard": [
            {
              "key": "atk_scale",
              "value": 4,
              "valueStr": null
            },
            {
              "key": "cnt",
              "value": 3,
              "valueStr": null
            },
            {
              "key": "times",
              "value": 3,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 2,
        "skillId": "skchr_chyue_2",
        "supported": false,
        "raw": {
          "name": "払塵",
          "rangeId": "x-4",
          "description": "周囲にいる敵最大<@ba.vup>{max_target}</>体に攻撃力の<@ba.vup>{atk_scale:0%}</>の物理ダメージを与え、その中で第一素質の効果が発動した対象を<$ba.levitate>浮遊</>させる。その後、周囲の<$ba.levitate>浮遊</>している敵全員の<$ba.levitate>浮遊</>状態を解除し、対象に100%の確率で再度第一素質の効果を発動し、攻撃力の<@ba.vup>{atk_scale_down:0%}</>の物理ダメージを与える\n<@ba.rem>2回チャージ可能</>",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 2,
            "spCost": 10,
            "initSp": 9,
            "increment": 1
          },
          "prefabId": "skchr_chyue_2",
          "duration": 0,
          "blackboard": [
            {
              "key": "max_target",
              "value": 4,
              "valueStr": null
            },
            {
              "key": "atk_scale_down",
              "value": 6.5,
              "valueStr": null
            },
            {
              "key": "atk_scale",
              "value": 4.5,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 3,
        "skillId": "skchr_chyue_3",
        "supported": false,
        "raw": {
          "name": "我無",
          "rangeId": null,
          "description": "目標とその周囲の敵全員に攻撃力の<@ba.vup>{atk_scale:0%}</>の物理ダメージを与える\nこのスキルを合計<@ba.vup>5回</>発動すると、チョンユエの<@ba.vup>攻撃範囲が拡大</>し、通常攻撃が<@ba.vup>2連撃</>になる。また、スキルが<@ba.vdown>自動発動</>になり、<@ba.vup>ダメージ発生回数+1</>",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WHEN_ATTACK",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 8,
            "initSp": 0,
            "increment": 1
          },
          "prefabId": "skchr_chyue_3",
          "duration": 0,
          "blackboard": [
            {
              "key": "atk_scale",
              "value": 3.8,
              "valueStr": null
            },
            {
              "key": "cast_cnt",
              "value": 5,
              "valueStr": null
            }
          ]
        }
      }
    ]
  },
  {
    "id": "char_4037_demetr",
    "name": "ベッローネ",
    "subProfessionId": "fighter",
    "trait": "敵を1体までブロック",
    "talents": [],
    "skills": [
      {
        "skillIndex": 1,
        "skillId": "skchr_demetr_1",
        "supported": false,
        "raw": {
          "name": "当主の余裕",
          "rangeId": null,
          "description": "次の通常攻撃時、2回連続で攻撃力の<@ba.vup>{atk_scale:0%}</>の物理ダメージを与える",
          "skillType": "AUTO",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WHEN_ATTACK",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 3,
            "initSp": 0,
            "increment": 1
          },
          "prefabId": "skchr_demetr_1",
          "duration": 0,
          "blackboard": [
            {
              "key": "atk_scale",
              "value": 2.5,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 2,
        "skillId": "skchr_demetr_2",
        "supported": false,
        "raw": {
          "name": "参謀の手管",
          "rangeId": "3-13",
          "description": "攻撃範囲が拡大し、攻撃速度<@ba.vup>+{attack_speed}</>、通常攻撃時敵最大<@ba.vup>{attack@max_target}</>体に攻撃力<@ba.vup>{attack@atk_scale:0%}</>の物理ダメージを与える。スキル発動中、第一素質による防御力低下効果が最大<@ba.vup>8</>回まで重複可能となり、最大まで重複した敵を<$ba.sluggish>足止め</>し続ける",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 22,
            "initSp": 14,
            "increment": 1
          },
          "prefabId": "skchr_demetr_2",
          "duration": 22,
          "blackboard": [
            {
              "key": "attack@atk_scale",
              "value": 2,
              "valueStr": null
            },
            {
              "key": "attack@max_target",
              "value": 3,
              "valueStr": null
            },
            {
              "key": "attack_speed",
              "value": 80,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 3,
        "skillId": "skchr_demetr_3",
        "supported": false,
        "raw": {
          "name": "代償の清算",
          "rangeId": null,
          "description": "攻撃力<@ba.vup>+{attack@demetr_s3[bonus].atk:0%}</>、攻撃速度<@ba.vup>+{attack@demetr_s3[bonus].attack_speed}</>、通常攻撃時に<@ba.vup>{attack@demetr_s3[bonus].prob:0%}</>の確率で攻撃力<@ba.vup>{attack@demetr_s3[bonus].prob_atk_scale:0%}</>の物理ダメージを与える。スキル発動後、即座に周囲一定範囲内にいる地上の敵1体を選択し、対象の滞在マスが配置可能な場合、自身がその位置に<$ba.addash>移動</>して攻撃を行う。自身が攻撃している敵【エリート】・【リーダー】が撃破されるか、自身が<@ba.vup>1</>秒間攻撃を行わなかった場合、即座に新たな目標を選択する\n<@ba.rem>致命的なダメージを受けてもHPが1残るが、スキルが終了する。スキルが終了すると、初期位置に戻る</>",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 35,
            "initSp": 27,
            "increment": 1
          },
          "prefabId": "skchr_demetr_3",
          "duration": 30,
          "blackboard": [
            {
              "key": "attack@demetr_s3[bonus].attack_speed",
              "value": 50,
              "valueStr": null
            },
            {
              "key": "attack@demetr_s3[bonus].atk",
              "value": 1.7,
              "valueStr": null
            },
            {
              "key": "attack@demetr_s3[bonus].prob_atk_scale",
              "value": 1.85,
              "valueStr": null
            },
            {
              "key": "attack@demetr_s3[bonus].prob",
              "value": 0.5,
              "valueStr": null
            },
            {
              "key": "attack@demetr_s3[target_timer].time_stack",
              "value": 2,
              "valueStr": null
            },
            {
              "key": "attack@finish_listener_duration",
              "value": 3,
              "valueStr": null
            },
            {
              "key": "attack@demetr_s3[target_timer].interval",
              "value": 0.5,
              "valueStr": null
            }
          ]
        }
      }
    ]
  },
  {
    "id": "char_4082_qiubai",
    "name": "チューバイ",
    "subProfessionId": "lord",
    "trait": "80%の攻撃力で<@ba.kw>遠距離攻撃</>も行える",
    "talents": [],
    "skills": [
      {
        "skillIndex": 1,
        "skillId": "skchr_qiubai_1",
        "supported": false,
        "raw": {
          "name": "留羽",
          "rangeId": null,
          "description": "次の通常攻撃時、対象を<@ba.vup>{duration}</>秒間<$ba.root>バインド</>させる。<$ba.root>バインド</>終了時、対象とその周囲の敵全員に攻撃力の<@ba.vup>{aoe_scale:0%}</>の術ダメージを与える",
          "skillType": "AUTO",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WHEN_ATTACK",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 4,
            "initSp": 0,
            "increment": 1
          },
          "prefabId": "skchr_qiubai_1",
          "duration": -1,
          "blackboard": [
            {
              "key": "aoe_scale",
              "value": 3,
              "valueStr": null
            },
            {
              "key": "duration",
              "value": 3,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 2,
        "skillId": "skchr_qiubai_2",
        "supported": false,
        "raw": {
          "name": "承影",
          "rangeId": "4-1",
          "description": "前方範囲内の地面にいる敵に攻撃力の<@ba.vup>{sword_begin_atk_scale:0%}</>の術ダメージを与える\n攻撃範囲が<@ba.vup>変化</>し、攻撃力<@ba.vup>+{atk:0%}</>、攻撃範囲内の地面にいる敵全員を<$ba.sluggish>足止め</>する。スキル終了時、範囲内の地面にいる敵に攻撃力の<@ba.vup>{sword_end_atk_scale:0%}</>の物理ダメージを与える",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WHEN_ATTACK",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 10,
            "initSp": 5,
            "increment": 1
          },
          "prefabId": "skchr_qiubai_2",
          "duration": 5,
          "blackboard": [
            {
              "key": "sword_begin_atk_scale",
              "value": 3,
              "valueStr": null
            },
            {
              "key": "sword_end_atk_scale",
              "value": 3,
              "valueStr": null
            },
            {
              "key": "atk",
              "value": 1.4,
              "valueStr": null
            },
            {
              "key": "sword_end_duration",
              "value": 4.88,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 3,
        "skillId": "skchr_qiubai_3",
        "supported": false,
        "raw": {
          "name": "問雪",
          "rangeId": "3-1",
          "description": "攻撃範囲が<@ba.vup>拡大</>し、攻撃力<@ba.vup>+{atk:0%}</>。通常攻撃が術攻撃になり、攻撃対象数+2、第一素質の与ダメージが<@ba.vup>{talent_scale}</>倍まで上昇。特性による遠距離攻撃時の攻撃力低下が無効化され、攻撃するたびに自身の攻撃速度<@ba.vup>+{attack_speed}</>（最大<@ba.vup>{max_stack_cnt}</>回まで）",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 55,
            "initSp": 45,
            "increment": 1
          },
          "prefabId": "skchr_qiubai_3",
          "duration": 30,
          "blackboard": [
            {
              "key": "atk",
              "value": 0.55,
              "valueStr": null
            },
            {
              "key": "attack_speed",
              "value": 13,
              "valueStr": null
            },
            {
              "key": "max_stack_cnt",
              "value": 8,
              "valueStr": null
            },
            {
              "key": "talent_scale",
              "value": 2,
              "valueStr": null
            }
          ]
        }
      }
    ]
  },
  {
    "id": "char_4182_oblvns",
    "name": "豊川祥子",
    "subProfessionId": "lord",
    "trait": "80%の攻撃力で<@ba.kw>遠距離攻撃</>も行える",
    "talents": [],
    "skills": [
      {
        "skillIndex": 1,
        "skillId": "skchr_oblvns_1",
        "supported": false,
        "raw": {
          "name": "新月の目覚め",
          "rangeId": null,
          "description": "<@ba.vup>8</>つの音符を演奏する。それぞれの音符が与える術ダメージは、攻撃力の<@ba.vup>{atk_scale:0%}</>から<@ba.vup>{atk_scale_8:0%}</>まで徐々に減少する\n<@ba.rem>2回チャージ可能、スキルが最大までチャージされている場合は自動発動</>",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WHEN_ATTACK",
            "levelUpCost": null,
            "maxChargeTime": 2,
            "spCost": 3,
            "initSp": 0,
            "increment": 1
          },
          "prefabId": "skchr_oblvns_1",
          "duration": -1,
          "blackboard": [
            {
              "key": "atk_scale",
              "value": 1,
              "valueStr": null
            },
            {
              "key": "atk_scale_2",
              "value": 0.92,
              "valueStr": null
            },
            {
              "key": "atk_scale_3",
              "value": 0.75,
              "valueStr": null
            },
            {
              "key": "atk_scale_4",
              "value": 0.58,
              "valueStr": null
            },
            {
              "key": "atk_scale_5",
              "value": 0.42,
              "valueStr": null
            },
            {
              "key": "atk_scale_6",
              "value": 0.33,
              "valueStr": null
            },
            {
              "key": "atk_scale_7",
              "value": 0.17,
              "valueStr": null
            },
            {
              "key": "atk_scale_8",
              "value": 0.05,
              "valueStr": null
            },
            {
              "key": "angle",
              "value": 15,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 2,
        "skillId": "skchr_oblvns_2",
        "supported": false,
        "raw": {
          "name": "満月の舞踏会",
          "rangeId": null,
          "description": "<@ba.rem>発動するたび<@ba.vup>「ピアノ」（初期状態）</>の音色と<@ba.vup>「オルガン」</>の音色とが切り替わる</>\n<@ba.vup>「ピアノ」</>：攻撃力<@ba.vup>+{attack@atk:0%}</>、音符の飛行速度が上昇、命中した敵を貫通する。<@ba.vup>物理ダメージ</>を与える\n<@ba.vup>「オルガン」</>：攻撃速度<@ba.vup>+{attack@attack_speed}</>、音符の飛行速度が低下。<@ba.vup>術ダメージ</>を与える\n<@ba.rem><$ba.fever>Fever</>状態中は現在の音色による2連撃になる</>",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WHEN_ATTACK",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 5,
            "initSp": 0,
            "increment": 1
          },
          "prefabId": "skchr_oblvns_2",
          "duration": -1,
          "blackboard": [
            {
              "key": "attack@attack_speed",
              "value": 140,
              "valueStr": null
            },
            {
              "key": "attack@atk",
              "value": 1.1,
              "valueStr": null
            },
            {
              "key": "attack@passby_delay",
              "value": 0.5,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 3,
        "skillId": "skchr_oblvns_3",
        "supported": false,
        "raw": {
          "name": "残月の余韻",
          "rangeId": "3-21",
          "description": "攻撃範囲拡大、同時に<@ba.vup>「ピアノ」</>と<@ba.vup>「オルガン」</>の音色で演奏し、攻撃力の<@ba.vup>{attack@atk_scale:0%}</>の物理、術ダメージを与える音符をそれぞれ<@ba.vup>2</>つ生成する。物理ダメージを与える音符は術耐性が最も高い敵を、術ダメージを与える音符は防御力が最も高い敵を追尾する\n<@ba.rem><$ba.fever>Fever</>状態中、味方<$ba.mujica>Ave Mujica</>が致命的なダメージを受けてもHPは1以下にならず、<$ba.fever>Fever</>状態終了後に強制退場</>",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WHEN_ATTACK",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 42,
            "initSp": 34,
            "increment": 1
          },
          "prefabId": "skchr_oblvns_3",
          "duration": 25,
          "blackboard": [
            {
              "key": "attack@attack_speed",
              "value": 0,
              "valueStr": null
            },
            {
              "key": "attack@atk_scale",
              "value": 2.2,
              "valueStr": null
            }
          ]
        }
      }
    ]
  },
  {
    "id": "char_4088_hodrer",
    "name": "ヘドリー",
    "subProfessionId": "crusher",
    "trait": "ブロック中の<@ba.kw>敵全員</>を同時に攻撃",
    "talents": [],
    "skills": [
      {
        "skillIndex": 1,
        "skillId": "skchr_hodrer_1",
        "supported": false,
        "raw": {
          "name": "消えぬ炎刃",
          "rangeId": null,
          "description": "次の通常攻撃時、対象に攻撃力の<@ba.vup>{atk_scale:0%}</>の物理ダメージを与え、自身のHPを最大値の<@ba.vup>{hp_ratio:0%}</>回復する",
          "skillType": "AUTO",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WHEN_ATTACK",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 2,
            "initSp": 0,
            "increment": 1
          },
          "prefabId": "skchr_hodrer_1",
          "duration": -1,
          "blackboard": [
            {
              "key": "atk_scale",
              "value": 2.6,
              "valueStr": null
            },
            {
              "key": "hp_ratio",
              "value": 0.25,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 2,
        "skillId": "skchr_hodrer_2",
        "supported": false,
        "raw": {
          "name": "重たき余燼",
          "rangeId": null,
          "description": "パッシブ：攻撃力<@ba.vup>+{atk:0%}</>\n<@ba.rem>アクティブ：発動するたび初期状態と次の状態とが切り替わる：</>\n攻撃間隔を<@ba.vdown>わずかに延長</>し、ブロック数<@ba.vup>+{block_cnt}</>、攻撃した対象を<@ba.vup>{attack@stun}</>秒間<$ba.stun>スタン</>させる",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 5,
            "initSp": 0,
            "increment": 1
          },
          "prefabId": "skchr_hodrer_2",
          "duration": -1,
          "blackboard": [
            {
              "key": "atk",
              "value": 0.4,
              "valueStr": null
            },
            {
              "key": "base_attack_time",
              "value": 0.5,
              "valueStr": null
            },
            {
              "key": "block_cnt",
              "value": 1,
              "valueStr": null
            },
            {
              "key": "attack@stun",
              "value": 1,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 3,
        "skillId": "skchr_hodrer_3",
        "supported": false,
        "raw": {
          "name": "死地の硝煙",
          "rangeId": null,
          "description": "1秒ごとにHPを<@ba.vdown>{attack@value}</>失い、スキル発動中に自身が攻撃した敵、および自身を攻撃した敵に、1秒ごとに<@ba.vup>{attack@damage}</>の確定ダメージを与える。攻撃距離<@ba.vup>+{ability_range_forward_extend}</>、最大HP<@ba.vup>+{max_hp:0%}</>、攻撃力<@ba.vup>+{atk:0%}</>、攻撃するたびに自身のHPを<@ba.vup>{attack@hp_ratio:0%}</>回復し、<@ba.vup>{attack@buff_prob:0%}</>の確率で対象を<@ba.vup>{attack@stun}</>秒<$ba.stun>スタン</>させる",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 50,
            "initSp": 40,
            "increment": 1
          },
          "prefabId": "skchr_hodrer_3",
          "duration": 70,
          "blackboard": [
            {
              "key": "max_hp",
              "value": 0.6,
              "valueStr": null
            },
            {
              "key": "atk",
              "value": 1.2,
              "valueStr": null
            },
            {
              "key": "attack@hp_ratio",
              "value": 0.05,
              "valueStr": null
            },
            {
              "key": "attack@buff_prob",
              "value": 0.25,
              "valueStr": null
            },
            {
              "key": "attack@stun",
              "value": 5,
              "valueStr": null
            },
            {
              "key": "ability_range_forward_extend",
              "value": 1,
              "valueStr": null
            },
            {
              "key": "attack@value",
              "value": 100,
              "valueStr": null
            },
            {
              "key": "attack@damage",
              "value": 200,
              "valueStr": null
            }
          ]
        }
      }
    ]
  },
  {
    "id": "char_4145_ulpia",
    "name": "ウルピアヌス",
    "subProfessionId": "crusher",
    "trait": "ブロック中の<@ba.kw>敵全員</>を同時に攻撃",
    "talents": [],
    "skills": [
      {
        "skillIndex": 1,
        "skillId": "skchr_ulpia_1",
        "supported": false,
        "raw": {
          "name": "成すべき接触",
          "rangeId": "3-2",
          "description": "前方に錨を投げ、目標地点の周囲一定範囲内にいる最大2体の敵を<@ba.vup>相当の力</>で引き寄せ、攻撃力の<@ba.vup>{atk_scale:0%}</>の物理ダメージを与える",
          "skillType": "AUTO",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 4,
            "initSp": 0,
            "increment": 1
          },
          "prefabId": "skchr_ulpia_1",
          "duration": -1,
          "blackboard": [
            {
              "key": "atk_scale",
              "value": 2.7,
              "valueStr": null
            },
            {
              "key": "max_target",
              "value": 2,
              "valueStr": null
            },
            {
              "key": "force",
              "value": 1,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 2,
        "skillId": "skchr_ulpia_2",
        "supported": false,
        "raw": {
          "name": "維持すべき境界",
          "rangeId": null,
          "description": "第一素質の効果が<@ba.vup>{talent_scale}</>倍まで上昇、ブロック数<@ba.vup>+1</>、最大HP<@ba.vup>+{max_hp:0%}</>、攻撃力<@ba.vup>+{atk:0%}</>\n<@ba.rem>退場まで効果継続</>",
          "skillType": "AUTO",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 70,
            "initSp": 0,
            "increment": 1
          },
          "prefabId": "skchr_ulpia_2",
          "duration": -1,
          "blackboard": [
            {
              "key": "talent_scale",
              "value": 2,
              "valueStr": null
            },
            {
              "key": "atk",
              "value": 1.6,
              "valueStr": null
            },
            {
              "key": "max_hp",
              "value": 0.6,
              "valueStr": null
            },
            {
              "key": "block_cnt",
              "value": 1,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 3,
        "skillId": "skchr_ulpia_3",
        "supported": false,
        "raw": {
          "name": "拓くべき活路",
          "rangeId": "6-1",
          "description": "最大HP<@ba.vup>+{max_hp:0%}</>、攻撃力<@ba.vup>+{atk:0%}</>。前方に錨を投げ、敵に当たるか最大距離に達すると、その周囲にいる敵全員に攻撃力の<@ba.vup>{atk_scale:0%}</>の物理ダメージ与え、<@ba.vup>{stun}</>秒間スタンさせる。錨の停止した位置が配置可能なマスの場合、ウルピアヌスはそのマスに<$ba.addash>移動</>する\n<@ba.rem>手動でスキルを中止することができ、スキル終了時ウルピアヌスは元の位置に戻る</>",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 25,
            "initSp": 20,
            "increment": 1
          },
          "prefabId": "skchr_ulpia_3",
          "duration": 25,
          "blackboard": [
            {
              "key": "max_hp",
              "value": 0.8,
              "valueStr": null
            },
            {
              "key": "atk",
              "value": 2.6,
              "valueStr": null
            },
            {
              "key": "atk_scale",
              "value": 1.6,
              "valueStr": null
            },
            {
              "key": "stun",
              "value": 6,
              "valueStr": null
            },
            {
              "key": "projectile_range",
              "value": 1.8,
              "valueStr": null
            }
          ]
        }
      }
    ]
  },
  {
    "id": "char_4058_pepe",
    "name": "ペペ",
    "subProfessionId": "hammer",
    "trait": "攻撃対象の周囲にいる敵に攻撃力の<@ba.kw>50%</>の<@ba.kw>範囲</>物理ダメージを与える",
    "talents": [],
    "skills": [
      {
        "skillIndex": 1,
        "skillId": "skchr_pepe_1",
        "supported": false,
        "raw": {
          "name": "ぺったん！",
          "rangeId": null,
          "description": "次の攻撃で攻撃力の<@ba.vup>{atk_scale:0%}</>の物理ダメージを与える。<$ba.debuff>状態異常</>時にもスキルは発動し、その際<$ba.debuff>状態異常</>を解除する\n<@ba.rem>2回チャージ可能</>",
          "skillType": "AUTO",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 2,
            "spCost": 5,
            "initSp": 0,
            "increment": 1
          },
          "prefabId": "skchr_pepe_1",
          "duration": -1,
          "blackboard": [
            {
              "key": "atk_scale",
              "value": 2.9,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 2,
        "skillId": "skchr_pepe_2",
        "supported": false,
        "raw": {
          "name": "トラブル解決術",
          "rangeId": "2-5",
          "description": "攻撃範囲<@ba.vup>拡大</>、攻撃力<@ba.vup>+{atk:0%}</>、攻撃速度<@ba.vup>+{attack_speed}</>、ランダムで攻撃範囲内の敵を攻撃する\n<@ba.rem>発動するたびに、その次に発動するスキルの攻撃速度+{attack_speed_extra}（最大{max_stack_cnt}回まで効果重複可能）</>",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 25,
            "initSp": 18,
            "increment": 1
          },
          "prefabId": "skchr_pepe_2",
          "duration": 18,
          "blackboard": [
            {
              "key": "atk",
              "value": 0.9,
              "valueStr": null
            },
            {
              "key": "attack_speed",
              "value": 80,
              "valueStr": null
            },
            {
              "key": "attack_speed_extra",
              "value": 40,
              "valueStr": null
            },
            {
              "key": "max_stack_cnt",
              "value": 2,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 3,
        "skillId": "skchr_pepe_3",
        "supported": false,
        "raw": {
          "name": "時の激震",
          "rangeId": null,
          "description": "通常攻撃の間隔が<@ba.vdown>わずかに延長</>し、攻撃力<@ba.vup>+{atk:0%}</>、攻撃主対象を<@ba.vup>{attack@stun_main}</>秒、範囲ダメージを受けた対象を<@ba.vup>{attack@stun}</>秒<$ba.stun>スタン</>させる。攻撃するたびにダメージ発生範囲が<@ba.vup>拡大</>し、攻撃力<@ba.vup>+{attack@atk:0%}</>（最大4回まで効果重複可能）",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 45,
            "initSp": 35,
            "increment": 1
          },
          "prefabId": "skchr_pepe_3",
          "duration": 40,
          "blackboard": [
            {
              "key": "atk",
              "value": 2.4,
              "valueStr": null
            },
            {
              "key": "attack@stun",
              "value": 0.8,
              "valueStr": null
            },
            {
              "key": "attack@atk",
              "value": 0.25,
              "valueStr": null
            },
            {
              "key": "attack@stun_main",
              "value": 1.5,
              "valueStr": null
            },
            {
              "key": "attack@ability_range_forward_extend",
              "value": 0.25,
              "valueStr": null
            },
            {
              "key": "attack@max_stack_cnt",
              "value": 4,
              "valueStr": null
            },
            {
              "key": "base_attack_time",
              "value": 0.2,
              "valueStr": null
            }
          ]
        }
      }
    ]
  },
  {
    "id": "char_1051_headb2",
    "name": "怒潮ズィマー",
    "subProfessionId": "hammer",
    "trait": "攻撃対象の周囲にいる敵に攻撃力の<@ba.kw>50%</>の<@ba.kw>範囲</>物理ダメージを与える",
    "talents": [],
    "skills": [
      {
        "skillIndex": 1,
        "skillId": "skchr_headb2_1",
        "supported": false,
        "raw": {
          "name": "折れぬ信念",
          "rangeId": null,
          "description": "攻撃力<@ba.vup>+{atk:0%}</>、攻撃速度<@ba.vup>+{attack_speed}</>",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 30,
            "initSp": 20,
            "increment": 1
          },
          "prefabId": "skchr_headb2_1",
          "duration": 30,
          "blackboard": [
            {
              "key": "atk",
              "value": 0.5,
              "valueStr": null
            },
            {
              "key": "attack_speed",
              "value": 50,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 2,
        "skillId": "skchr_headb2_2",
        "supported": false,
        "raw": {
          "name": "挫けぬ闘志",
          "rangeId": "2-5",
          "description": "パッシブ：高台に対して第一素質の効果が発動するたび、SPを<@ba.vup>{sp_per_highland}</>回復\nアクティブ：攻撃範囲<@ba.vup>拡大</>、攻撃力<@ba.vup>+{atk:0%}</>、防御力<@ba.vup>+{def:0%}</>\n<@ba.rem>2回目以降スキル使用時、攻撃力と防御力の上昇効果が1回目の2倍になり、退場まで効果継続</>",
          "skillType": "AUTO",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 50,
            "initSp": 36,
            "increment": 1
          },
          "prefabId": "skchr_headb2_2",
          "duration": 16,
          "blackboard": [
            {
              "key": "atk",
              "value": 0.9,
              "valueStr": null
            },
            {
              "key": "def",
              "value": 0.6,
              "valueStr": null
            },
            {
              "key": "headb2_s_2[second].atk",
              "value": 1.8,
              "valueStr": null
            },
            {
              "key": "headb2_s_2[second].def",
              "value": 1.2,
              "valueStr": null
            },
            {
              "key": "sp_per_highland",
              "value": 1,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 3,
        "skillId": "skchr_headb2_3",
        "supported": false,
        "raw": {
          "name": "阻まれぬ進撃",
          "rangeId": null,
          "description": "攻撃力<@ba.vup>+{atk_base:0%}</>、前方1マスに特性のダメージ発生範囲が拡大した5連撃を行う。5連撃は1撃ごとに攻撃力の<@ba.vup>{atk_scale:0%}</>の物理ダメージを与え、都度追加で攻撃力<@ba.vup>+{atk_step:0%}</>。スキル発動中、高台に対して第一素質の効果が発動すると、対象の高台に隣接する高台へその効果を拡散（最大拡散回数は連撃数とともに増加）し、第一素質で与えるダメージが<@ba.vup>{splash_atk_scale_bonus}</>倍になり、与える状態異常が<@ba.vup>{unmovable}</>秒間の<$ba.root>バインド</>に変化する",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 27,
            "initSp": 20,
            "increment": 1
          },
          "prefabId": "skchr_headb2_3",
          "duration": 0,
          "blackboard": [
            {
              "key": "atk_scale",
              "value": 2.4,
              "valueStr": null
            },
            {
              "key": "atk_step",
              "value": 0.3,
              "valueStr": null
            },
            {
              "key": "splash_atk_scale_bonus",
              "value": 3.5,
              "valueStr": null
            },
            {
              "key": "unmovable",
              "value": 2,
              "valueStr": null
            },
            {
              "key": "atk_base",
              "value": 1,
              "valueStr": null
            }
          ]
        }
      }
    ]
  },
  {
    "id": "char_010_chen",
    "name": "チェン",
    "subProfessionId": "sword",
    "trait": "通常攻撃時、1回の攻撃で<@ba.kw>2回</>ダメージを与える",
    "talents": [],
    "skills": [
      {
        "skillIndex": 1,
        "skillId": "skchr_chen_1",
        "supported": false,
        "raw": {
          "name": "鞘打ち",
          "rangeId": null,
          "description": "次の通常攻撃時、敵に攻撃力の<@ba.vup>{atk_scale:0%}</>の物理ダメージを与え、<@ba.vup>{stun}</>秒間<$ba.stun>スタン</>させる",
          "skillType": "AUTO",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WHEN_ATTACK",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 4,
            "initSp": 0,
            "increment": 1
          },
          "prefabId": "skchr_chen_1",
          "duration": 0,
          "blackboard": [
            {
              "key": "atk_scale",
              "value": 3.2,
              "valueStr": null
            },
            {
              "key": "stun",
              "value": 1.5,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 2,
        "skillId": "skchr_chen_2",
        "supported": false,
        "raw": {
          "name": "赤霄・抜刀",
          "rangeId": "3-12",
          "description": "前方一定範囲内の敵最大<@ba.vup>{max_target}</>体に攻撃力の<@ba.vup>{atk_scale:0%}</>の<@ba.rem>物理</>ダメージと攻撃力の<@ba.vup>{atk_scale:0%}</>の<@ba.rem>術</>ダメージを与える",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WHEN_ATTACK",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 20,
            "initSp": 20,
            "increment": 1
          },
          "prefabId": "skchr_chen_2",
          "duration": 0,
          "blackboard": [
            {
              "key": "atk_scale",
              "value": 5,
              "valueStr": null
            },
            {
              "key": "max_target",
              "value": 7,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 3,
        "skillId": "skchr_chen_3",
        "supported": false,
        "raw": {
          "name": "赤霄・絶影",
          "rangeId": "x-1",
          "description": "周囲一定範囲内の最も近い敵に対して攻撃力<@ba.vup>{atk_scale:0%}</>の物理ダメージを<@ba.vup>{times}</>回与え、最後の1回で<@ba.vup>{stun}</>秒間<$ba.stun>スタン</>させる\n10回未満かつ他に敵がいる場合、攻撃し続ける",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WHEN_ATTACK",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 30,
            "initSp": 20,
            "increment": 1
          },
          "prefabId": "skchr_chen_3",
          "duration": 0,
          "blackboard": [
            {
              "key": "atk_scale",
              "value": 3.2,
              "valueStr": null
            },
            {
              "key": "times",
              "value": 10,
              "valueStr": null
            },
            {
              "key": "stun",
              "value": 4,
              "valueStr": null
            }
          ]
        }
      }
    ]
  },
  {
    "id": "char_4116_blkkgt",
    "name": "デーゲンブレヒャー",
    "subProfessionId": "sword",
    "trait": "通常攻撃時、1回の攻撃で<@ba.kw>2回</>ダメージを与える",
    "talents": [],
    "skills": [
      {
        "skillIndex": 1,
        "skillId": "skchr_blkkgt_1",
        "supported": false,
        "raw": {
          "name": "純粋なる力",
          "rangeId": "x-4",
          "description": "次の通常攻撃時、周囲の地上にいる最大<@ba.vup>{max_target}</>体の敵に、攻撃力の<@ba.vup>{atk_scale_s1:0%}</>の物理ダメージを2回与える",
          "skillType": "AUTO",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WHEN_ATTACK",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 3,
            "initSp": 0,
            "increment": 1
          },
          "prefabId": "skchr_blkkgt_1",
          "duration": 0,
          "blackboard": [
            {
              "key": "atk_scale_s1",
              "value": 2.2,
              "valueStr": null
            },
            {
              "key": "max_target",
              "value": 6,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 2,
        "skillId": "skchr_blkkgt_2",
        "supported": false,
        "raw": {
          "name": "声なき嘲笑",
          "rangeId": "1-4",
          "description": "前方一定範囲内の地面にいる最大<@ba.vup>{max_target}</>体の敵に対して、<@ba.vup>{blkkgt_s_2[not_blocked].trig_cnt}</>回の斬撃を行う。ブロックされている敵が対象である場合、斬撃回数が<@ba.vup>{blkkgt_s_2[blocked].trig_cnt}</>回になり、素質の発動率が<@ba.vup>{prob:0%}</>に上昇する。斬撃は1回ごとに対象に攻撃力の<@ba.vup>{dot_scale:0%}</>の物理ダメージを与える\n<@ba.rem>2回チャージ可能</>",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WHEN_ATTACK",
            "levelUpCost": null,
            "maxChargeTime": 2,
            "spCost": 12,
            "initSp": 10,
            "increment": 1
          },
          "prefabId": "skchr_blkkgt_2",
          "duration": 0,
          "blackboard": [
            {
              "key": "dot_scale",
              "value": 3.1,
              "valueStr": null
            },
            {
              "key": "max_target",
              "value": 6,
              "valueStr": null
            },
            {
              "key": "blkkgt_s_2[not_blocked].trig_cnt",
              "value": 2,
              "valueStr": null
            },
            {
              "key": "blkkgt_s_2[blocked].trig_cnt",
              "value": 3,
              "valueStr": null
            },
            {
              "key": "prob",
              "value": 1,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 3,
        "skillId": "skchr_blkkgt_3",
        "supported": false,
        "raw": {
          "name": "静寂に帰す",
          "rangeId": "x-1",
          "description": "範囲内の敵を対象に合計<@ba.vup>10</>回の斬撃を発動、同時に素質の発動率が<@ba.vup>{prob:0%}</>に上昇。斬撃のたびに最大<@ba.vup>{max_target}</>体の敵に攻撃力の<@ba.vup>{d_atk_scale:0%}</>の物理ダメージを与えると同時に<@ba.vup>相当の力で</>引き寄せ、最後に攻撃力の<@ba.vup>{e_atk_scale_end:0%}</>の物理ダメージを1回与えると同時に<@ba.vup>かなりの力で</>引き寄せる",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 30,
            "initSp": 20,
            "increment": 1
          },
          "prefabId": "skchr_blkkgt_3",
          "duration": 0,
          "blackboard": [
            {
              "key": "prob",
              "value": 1,
              "valueStr": null
            },
            {
              "key": "max_target",
              "value": 6,
              "valueStr": null
            },
            {
              "key": "d_atk_scale",
              "value": 2.35,
              "valueStr": null
            },
            {
              "key": "d_hit_interval",
              "value": 0.3,
              "valueStr": null
            },
            {
              "key": "p_force",
              "value": 1,
              "valueStr": null
            },
            {
              "key": "p_hit_interval",
              "value": 1,
              "valueStr": null
            },
            {
              "key": "e_atk_scale_end",
              "value": 3.3,
              "valueStr": null
            },
            {
              "key": "e_force",
              "value": 2,
              "valueStr": null
            }
          ]
        }
      }
    ]
  },
  {
    "id": "char_017_huang",
    "name": "ブレイズ",
    "subProfessionId": "centurion",
    "trait": "ブロック中の<@ba.kw>敵全員</>を同時に攻撃",
    "talents": [],
    "skills": [
      {
        "skillIndex": 1,
        "skillId": "skchr_huang_1",
        "supported": false,
        "raw": {
          "name": "強撃γ",
          "rangeId": null,
          "description": "次の通常攻撃時、攻撃力が<@ba.vup>{atk_scale:0%}</>まで上昇",
          "skillType": "AUTO",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WHEN_ATTACK",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 2,
            "initSp": 0,
            "increment": 1
          },
          "prefabId": "skchr_huang_1",
          "duration": 0,
          "blackboard": [
            {
              "key": "atk_scale",
              "value": 2.9,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 2,
        "skillId": "skchr_huang_2",
        "supported": false,
        "raw": {
          "name": "鎖鋸拡張モジュール",
          "rangeId": "2-2",
          "description": "攻撃力<@ba.vup>+{atk:0%}</>、防御力<@ba.vup>+{def:0%}</>、攻撃範囲<@ba.vup>拡大</>\n<@ba.rem>退場まで効果継続</>",
          "skillType": "AUTO",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 70,
            "initSp": 0,
            "increment": 1
          },
          "prefabId": "skchr_huang_2",
          "duration": -1,
          "blackboard": [
            {
              "key": "atk",
              "value": 1,
              "valueStr": null
            },
            {
              "key": "def",
              "value": 0.35,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 3,
        "skillId": "skchr_huang_3",
        "supported": false,
        "raw": {
          "name": "ボイリングバースト",
          "rangeId": null,
          "description": "攻撃力と防御力が徐々に<@ba.vup>+{atk:0%}</>まで上昇し、前方1マスにいる敵全員を攻撃。効果時間終了後、一定範囲内の敵全員に攻撃力の<@ba.vup>{damage_by_atk_scale:0%}</>の物理ダメージを与え、自身のHPが<@ba.vdown>{hp_ratio:0%}</>減少",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 35,
            "initSp": 25,
            "increment": 1
          },
          "prefabId": "skchr_huang_3",
          "duration": 10,
          "blackboard": [
            {
              "key": "atk",
              "value": 0.8,
              "valueStr": null
            },
            {
              "key": "def",
              "value": 0.8,
              "valueStr": null
            },
            {
              "key": "hp_ratio",
              "value": 0.25,
              "valueStr": null
            },
            {
              "key": "damage_by_atk_scale",
              "value": 4,
              "valueStr": null
            }
          ]
        }
      }
    ]
  },
  {
    "id": "char_1026_gvial2",
    "name": "百錬ガヴィル",
    "subProfessionId": "centurion",
    "trait": "ブロック中の<@ba.kw>敵全員</>を同時に攻撃",
    "talents": [],
    "skills": [
      {
        "skillIndex": 1,
        "skillId": "skchr_gvial2_1",
        "supported": false,
        "raw": {
          "name": "ピンポイントヒット",
          "rangeId": null,
          "description": "攻撃力<@ba.vup>+{atk:0%}</>、攻撃時、自身のHPを与ダメージの<@ba.vup>{heal_scale:0%}</>回復",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 25,
            "initSp": 10,
            "increment": 1
          },
          "prefabId": "skchr_gvial2_1",
          "duration": 25,
          "blackboard": [
            {
              "key": "atk",
              "value": 0.8,
              "valueStr": null
            },
            {
              "key": "heal_scale",
              "value": 0.4,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 2,
        "skillId": "skchr_gvial2_2",
        "supported": false,
        "raw": {
          "name": "ブレイクラッシュ",
          "rangeId": "2-5",
          "description": "攻撃範囲<@ba.vup>拡大</>、攻撃力<@ba.vup>+{atk:0%}</>、防御力<@ba.vup>+{def:0%}</>、未ブロックの敵を攻撃時、対象を<@ba.vup>相当の力で</> 引き寄せる",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 35,
            "initSp": 25,
            "increment": 1
          },
          "prefabId": "skchr_gvial2_2",
          "duration": 40,
          "blackboard": [
            {
              "key": "atk",
              "value": 1.8,
              "valueStr": null
            },
            {
              "key": "def",
              "value": 0.5,
              "valueStr": null
            },
            {
              "key": "block_cnt",
              "value": 0,
              "valueStr": null
            },
            {
              "key": "attack@force",
              "value": 1,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 3,
        "skillId": "skchr_gvial2_3",
        "supported": false,
        "raw": {
          "name": "ジャングルソウル",
          "rangeId": null,
          "description": "攻撃力<@ba.vup>+{atk:0%}</>、攻撃速度<@ba.vup>+{attack_speed}</>、ブロック数<@ba.vup>+{block_cnt}</>、スキル発動中は被ダメージを<@ba.vup>{damage_resistance:0%}</>に軽減。スキル終了後、<@ba.vup>{final_duration}</>秒間にかけてスキル効果によって軽減したダメージ分のHPを継続的に失う",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 35,
            "initSp": 25,
            "increment": 1
          },
          "prefabId": "skchr_gvial2_3",
          "duration": 25,
          "blackboard": [
            {
              "key": "atk",
              "value": 1.4,
              "valueStr": null
            },
            {
              "key": "attack_speed",
              "value": 100,
              "valueStr": null
            },
            {
              "key": "damage_resistance",
              "value": 0.5,
              "valueStr": null
            },
            {
              "key": "final_duration",
              "value": 20,
              "valueStr": null
            },
            {
              "key": "interval",
              "value": 0.1,
              "valueStr": null
            },
            {
              "key": "priority",
              "value": 1000,
              "valueStr": null
            },
            {
              "key": "block_cnt",
              "value": 2,
              "valueStr": null
            }
          ]
        }
      }
    ]
  },
  {
    "id": "char_4098_vvana",
    "name": "ヴィヴィアナ",
    "subProfessionId": "artsfghter",
    "trait": "敵に<@ba.kw>術ダメージ</>を与える",
    "talents": [],
    "skills": [
      {
        "skillIndex": 1,
        "skillId": "skchr_vvana_1",
        "supported": false,
        "raw": {
          "name": "光影穿つ剣",
          "rangeId": null,
          "description": "次の通常攻撃時、攻撃力が<@ba.vup>{atk_scale:0%}</>まで上昇し、攻撃対象を2回攻撃する\n<$ba.charged>オーバーチャージ</>追加効果：攻撃距離<@ba.vup>+2</>、攻撃の回数が3回になる",
          "skillType": "AUTO",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 2,
            "spCost": 4,
            "initSp": 0,
            "increment": 1
          },
          "prefabId": "skchr_vvana_1",
          "duration": -1,
          "blackboard": [
            {
              "key": "atk_scale",
              "value": 2,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 2,
        "skillId": "skchr_vvana_2",
        "supported": false,
        "raw": {
          "name": "影払う燭火",
          "rangeId": null,
          "description": "攻撃力<@ba.vup>+{atk:0%}</>、防御力<@ba.vup>+{def:0%}</>、ブロック数<@ba.vup>+{block_cnt}</>、ブロック中の敵全員を同時に攻撃。攻撃時、<@ba.vup>{attack@prob_twice:0%}</>の確率で攻撃が攻撃力の<@ba.vup>{attack@atk_scale_twice:0%}</>の2連撃に変化し、対象の攻撃速度を<@ba.vup>{attack@steal_atk_speed}</><$ba.steal>奪取</>（最大{attack@steal_atk_speed_max}まで奪取可能。スキル終了、またはヴィヴィアナの退場まで効果継続）",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 25,
            "initSp": 15,
            "increment": 1
          },
          "prefabId": "skchr_vvana_2",
          "duration": 35,
          "blackboard": [
            {
              "key": "atk",
              "value": 0.4,
              "valueStr": null
            },
            {
              "key": "def",
              "value": 1.6,
              "valueStr": null
            },
            {
              "key": "block_cnt",
              "value": 1,
              "valueStr": null
            },
            {
              "key": "attack@atk_scale_twice",
              "value": 1.5,
              "valueStr": null
            },
            {
              "key": "attack@prob_once",
              "value": 0.8,
              "valueStr": null
            },
            {
              "key": "attack@prob_twice",
              "value": 0.2,
              "valueStr": null
            },
            {
              "key": "attack@steal_atk_speed",
              "value": 40,
              "valueStr": null
            },
            {
              "key": "attack@steal_atk_speed_max",
              "value": 40,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 3,
        "skillId": "skchr_vvana_3",
        "supported": false,
        "raw": {
          "name": "「明滅」",
          "rangeId": "1-1",
          "description": "攻撃間隔<@ba.vdown>延長</>、攻撃力<@ba.vup>+{atk:0%}</>、防御力<@ba.vup>+{def:0%}</>、術耐性<@ba.vup>+{magic_resistance}</>、通常攻撃が2連撃になり、第二素質の発動確率が<@ba.vup>{talent_scale:0.0}</>倍まで上昇し、優先して敵【エリート】・【ボス】を攻撃する\n<@ba.rem>2回目以降スキル使用時、攻撃距離+2、通常攻撃が3連撃になり、持続時間が25秒まで延長</>",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 25,
            "initSp": 18,
            "increment": 1
          },
          "prefabId": "skchr_vvana_3",
          "duration": 15,
          "blackboard": [
            {
              "key": "base_attack_time",
              "value": 0.5,
              "valueStr": null
            },
            {
              "key": "atk",
              "value": 1.1,
              "valueStr": null
            },
            {
              "key": "def",
              "value": 0.9,
              "valueStr": null
            },
            {
              "key": "magic_resistance",
              "value": 25,
              "valueStr": null
            },
            {
              "key": "enhance_duration",
              "value": 25,
              "valueStr": null
            },
            {
              "key": "talent_scale",
              "value": 2.5,
              "valueStr": null
            },
            {
              "key": "duration_plus",
              "value": 15,
              "valueStr": null
            }
          ]
        }
      }
    ]
  },
  {
    "id": "char_1019_siege2",
    "name": "ヴィーナ・ヴィクトリア",
    "subProfessionId": "artsfghter",
    "trait": "敵に<@ba.kw>術ダメージ</>を与える",
    "talents": [],
    "skills": [
      {
        "skillIndex": 1,
        "skillId": "skchr_siege2_1",
        "supported": false,
        "raw": {
          "name": "栄光再鋳",
          "rangeId": "x-5",
          "description": "次の通常攻撃時、隣接4マスの地面上にいる敵全員に追加で攻撃力の<@ba.vup>{atk_scale:0%}</>の<@ba.vup>確定</>ダメージを与える",
          "skillType": "AUTO",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 5,
            "initSp": 0,
            "increment": 1
          },
          "prefabId": "skchr_siege2_1",
          "duration": 0,
          "blackboard": [
            {
              "key": "atk_scale",
              "value": 1.8,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 2,
        "skillId": "skchr_siege2_2",
        "supported": false,
        "raw": {
          "name": "故地への進撃",
          "rangeId": "2-2",
          "description": "パッシブ：第一素質の効果範囲内に2名以上の味方ユニットがいる場合、自身のSP回復速度<@ba.vup>+{sp_recovery_per_sec}sp/秒</>\n自動発動：攻撃範囲<@ba.vup>+1</>マス、攻撃力<@ba.vup>+{atk:0%}</>、攻撃対象数<@ba.vup>+1</> \n<@ba.rem>退場まで効果継続</>",
          "skillType": "AUTO",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 70,
            "initSp": 0,
            "increment": 1
          },
          "prefabId": "skchr_siege2_2",
          "duration": -1,
          "blackboard": [
            {
              "key": "sp_recovery_per_sec",
              "value": 0.5,
              "valueStr": null
            },
            {
              "key": "atk",
              "value": 1.8,
              "valueStr": null
            },
            {
              "key": "attack@max_target",
              "value": 2,
              "valueStr": null
            },
            {
              "key": "buff_stack_cnt",
              "value": 2,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 3,
        "skillId": "skchr_siege2_3",
        "supported": false,
        "raw": {
          "name": "我が名において",
          "rangeId": null,
          "description": "第一素質の効果範囲内の配置可能な地面マスに「黄金の誓い」を召喚する。スキル発動中、自身は第一素質の効果範囲内の味方ユニットがブロック中の敵を攻撃でき、攻撃力<@ba.vup>+{atk:0%}</>、攻撃対象数<@ba.vup>+3</>、攻撃間隔<@ba.vup>短縮</>、通常攻撃が対象に<@ba.vup>確定</>ダメージを与えるようになる",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 50,
            "initSp": 35,
            "increment": 1
          },
          "prefabId": "skchr_siege2_3",
          "duration": 25,
          "blackboard": [
            {
              "key": "base_attack_time",
              "value": -0.25,
              "valueStr": null
            },
            {
              "key": "atk",
              "value": 1.9,
              "valueStr": null
            },
            {
              "key": "attack@max_target",
              "value": 4,
              "valueStr": null
            }
          ]
        }
      }
    ]
  },
  {
    "id": "char_1050_chen3",
    "name": "赤刃明霄チェン",
    "subProfessionId": "artsfghter",
    "trait": "敵に<@ba.kw>術ダメージ</>を与える",
    "talents": [],
    "skills": [
      {
        "skillIndex": 1,
        "skillId": "skchr_chen3_1",
        "supported": false,
        "raw": {
          "name": "赤霄・奔夜",
          "rangeId": null,
          "description": "攻撃力<@ba.vup>+{atk:0%}</>、通常攻撃が2連撃になる。攻撃時、対象の一部の特殊能力をスキル終了まで無効化する",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 20,
            "initSp": 10,
            "increment": 1
          },
          "prefabId": "skchr_chen3_1",
          "duration": 18,
          "blackboard": [
            {
              "key": "atk",
              "value": 1.2,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 2,
        "skillId": "skchr_chen3_2",
        "supported": false,
        "raw": {
          "name": "赤霄・絶影-馳",
          "rangeId": "x-1",
          "description": "周囲一定範囲内の最も近い敵に対して<@ba.vup>10</>回斬撃をしかけ、1回につき攻撃力の<@ba.vup>{atk_scale:0%}</>の術ダメージを与える。斬撃中に対象が撃破された場合、残りの斬撃回数を<@ba.vup>+1</>し、対象に最も近い敵1体を新たな斬撃の対象とする。斬撃終了時、対象が撃破されておらず、かつ対象のいるマスが配置可能な場合、自身がそのマスに<$ba.addash>移動</>する。その後、攻撃力<@ba.vup>+{chen3_s2[respawn_buff].atk:0%}</>、物理・術回避<@ba.vup>+{chen3_s2[respawn_buff].prob:0%}</>",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 20,
            "initSp": 15,
            "increment": 1
          },
          "prefabId": "skchr_chen3_2",
          "duration": 6,
          "blackboard": [
            {
              "key": "atk_scale",
              "value": 4.8,
              "valueStr": null
            },
            {
              "key": "chen3_s2[respawn_buff].atk",
              "value": 3,
              "valueStr": null
            },
            {
              "key": "chen3_s2[respawn_buff].prob",
              "value": 0.6,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 3,
        "skillId": "skchr_chen3_3",
        "supported": false,
        "raw": {
          "name": "赤霄・天喟",
          "rangeId": "3-12",
          "description": "スキル発動時、進行不能になると方向転換する剣気を前方に放ち、接触した敵に、対象の現在HPの<@ba.vup>{hp_ratio:0%}</>の術ダメージを与える（必ず自身の攻撃力の<@ba.vup>{projectile_min_atk_scale:0%}</>以上の術ダメージを与える）。攻撃範囲が拡大し、攻撃時に最大<@ba.vup>{attack@max_target}</>体の地上の敵に攻撃力の<@ba.vup>{attack@atk_scale:0%}</>の術ダメージを<@ba.vup>3</>回与える",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 25,
            "initSp": 18,
            "increment": 1
          },
          "prefabId": "skchr_chen3_3",
          "duration": 20,
          "blackboard": [
            {
              "key": "hp_ratio",
              "value": 0.06,
              "valueStr": null
            },
            {
              "key": "projectile_min_atk_scale",
              "value": 5.8,
              "valueStr": null
            },
            {
              "key": "attack@atk_scale",
              "value": 2.1,
              "valueStr": null
            },
            {
              "key": "attack@max_target",
              "value": 4,
              "valueStr": null
            }
          ]
        }
      }
    ]
  },
  {
    "id": "char_188_helage",
    "name": "ヘラグ",
    "subProfessionId": "musha",
    "trait": "味方の治療対象にならない\n敵を攻撃するたび自身のHPを<@ba.kw>{value}</>回復",
    "talents": [],
    "skills": [
      {
        "skillIndex": 1,
        "skillId": "skchr_helage_1",
        "supported": false,
        "raw": {
          "name": "新月",
          "rangeId": null,
          "description": "次の通常攻撃時、攻撃力が<@ba.vup>{atk_scale:0%}</>まで上昇し、攻撃対象に2回攻撃",
          "skillType": "AUTO",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WHEN_ATTACK",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 2,
            "initSp": 0,
            "increment": 1
          },
          "prefabId": "skchr_helage_1",
          "duration": 0,
          "blackboard": [
            {
              "key": "atk_scale",
              "value": 1.75,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 2,
        "skillId": "skchr_helage_2",
        "supported": false,
        "raw": {
          "name": "弦月",
          "rangeId": null,
          "description": "攻撃力<@ba.vup>+{atk:0%}</>、通常攻撃が2回攻撃になり、物理回避率<@ba.vup>+{prob:0%}</>",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 25,
            "initSp": 15,
            "increment": 1
          },
          "prefabId": "skchr_helage_2",
          "duration": 13,
          "blackboard": [
            {
              "key": "atk",
              "value": 0.8,
              "valueStr": null
            },
            {
              "key": "prob",
              "value": 0.75,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 3,
        "skillId": "skchr_helage_3",
        "supported": false,
        "raw": {
          "name": "満月",
          "rangeId": null,
          "description": "攻撃力<@ba.vup>+{atk:0%}</>、攻撃範囲<@ba.vup>+{ability_range_forward_extend}</>マス、敵最大<@ba.vup>{attack@max_target}</>体を同時に攻撃",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 35,
            "initSp": 15,
            "increment": 1
          },
          "prefabId": "skchr_helage_3",
          "duration": 15,
          "blackboard": [
            {
              "key": "atk",
              "value": 1,
              "valueStr": null
            },
            {
              "key": "ability_range_forward_extend",
              "value": 2,
              "valueStr": null
            },
            {
              "key": "attack@max_target",
              "value": 3,
              "valueStr": null
            }
          ]
        }
      }
    ]
  },
  {
    "id": "char_4121_zuole",
    "name": "ズオ・ラウ",
    "subProfessionId": "musha",
    "trait": "味方の治療対象にならない\n敵を攻撃するたび自身のHPを<@ba.kw>{value}</>回復",
    "talents": [],
    "skills": [
      {
        "skillIndex": 1,
        "skillId": "skchr_zuole_1",
        "supported": false,
        "raw": {
          "name": "破虜",
          "rangeId": null,
          "description": "次の通常攻撃時、攻撃力が<@ba.vup>{atk_scale:0%}</>まで上昇し、自身のHPが最大値の<@ba.vup>{hp_ratio_double:0%}</>を下回っている場合ダメージ発生回数<@ba.vup>+1</>、<@ba.vup>{hp_ratio_tripple:0%}</>を下回っている場合は代わりに<@ba.vup>+2</>になる\n<@ba.rem>3回チャージ可能</>",
          "skillType": "AUTO",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 3,
            "spCost": 4,
            "initSp": 6,
            "increment": 1
          },
          "prefabId": "skchr_zuole_1",
          "duration": 0,
          "blackboard": [
            {
              "key": "atk_scale",
              "value": 2,
              "valueStr": null
            },
            {
              "key": "hp_ratio_double",
              "value": 0.8,
              "valueStr": null
            },
            {
              "key": "hp_ratio_tripple",
              "value": 0.5,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 2,
        "skillId": "skchr_zuole_2",
        "supported": false,
        "raw": {
          "name": "行険",
          "rangeId": null,
          "description": "HPが現在値の<@ba.vdown>{hp_ratio:0%}</>減少し、最大HPの<@ba.vup>{scale:0%}</>の<$ba.barrier>バリア</>を獲得し、攻撃力<@ba.vup>+{atk:0%}</>、ブロック数<@ba.vup>+{block_cnt}</>、さらにブロック中の敵全員に攻撃\n<@ba.rem><$ba.barrier>バリア</>は最大HPの{max_scale}倍まで獲得でき、スキル終了後、残りのバリア値を徐々に失う</>",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 20,
            "initSp": 13,
            "increment": 1
          },
          "prefabId": "skchr_zuole_2",
          "duration": 12,
          "blackboard": [
            {
              "key": "atk",
              "value": 1.7,
              "valueStr": null
            },
            {
              "key": "hp_ratio",
              "value": 0.5,
              "valueStr": null
            },
            {
              "key": "scale",
              "value": 1.2,
              "valueStr": null
            },
            {
              "key": "block_cnt",
              "value": 1,
              "valueStr": null
            },
            {
              "key": "max_scale",
              "value": 2,
              "valueStr": null
            },
            {
              "key": "shield_decrease",
              "value": -200,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 3,
        "skillId": "skchr_zuole_3",
        "supported": false,
        "raw": {
          "name": "右序有炎",
          "rangeId": "3-2",
          "description": "前方に<@ba.vup>{times}</>回斬撃を繰り出し、毎回最大<@ba.vup>3</>体の敵に攻撃力の<@ba.vup>{atk_scale:0%}</>の物理ダメージを与える（最後の一撃のダメージ係数は2倍、さらに対象を<@ba.vup>{stun}</>秒間<$ba.stun>スタン</>させる）。スキル発動中、特性によるHP回復は回復量の<@ba.vup>{shield_scale}</>倍に値する<$ba.barrier>バリア</>を獲得に変わる\n<@ba.rem><$ba.barrier>バリア</>は最大HPの{max_scale}倍まで獲得でき、{shield_duration}秒間持続可能</>",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 25,
            "initSp": 10,
            "increment": 1
          },
          "prefabId": "skchr_zuole_3",
          "duration": 0,
          "blackboard": [
            {
              "key": "atk_scale",
              "value": 2.45,
              "valueStr": null
            },
            {
              "key": "times",
              "value": 7,
              "valueStr": null
            },
            {
              "key": "stun",
              "value": 5,
              "valueStr": null
            },
            {
              "key": "last_atk_bonus",
              "value": 2,
              "valueStr": null
            },
            {
              "key": "shield_scale",
              "value": 3,
              "valueStr": null
            },
            {
              "key": "shield_duration",
              "value": 15,
              "valueStr": null
            },
            {
              "key": "max_scale",
              "value": 2,
              "valueStr": null
            }
          ]
        }
      }
    ]
  },
  {
    "id": "char_485_pallas",
    "name": "パラス",
    "subProfessionId": "instructor",
    "trait": "攻撃距離が<@ba.kw>やや長い</>、自身がブロックしていない敵を攻撃時、攻撃力が120%まで上昇",
    "talents": [],
    "skills": [
      {
        "skillIndex": 1,
        "skillId": "skchr_pallas_1",
        "supported": false,
        "raw": {
          "name": "勝敗分かつ連撃",
          "rangeId": null,
          "description": "次の通常攻撃時、2回連続で攻撃力の<@ba.vup>{atk_scale:0%}</>の物理ダメージを与える",
          "skillType": "AUTO",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WHEN_ATTACK",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 2,
            "initSp": 0,
            "increment": 1
          },
          "prefabId": "skchr_pallas_1",
          "duration": 0,
          "blackboard": [
            {
              "key": "atk_scale",
              "value": 1.75,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 2,
        "skillId": "skchr_pallas_2",
        "supported": false,
        "raw": {
          "name": "信念宿りし長鞭",
          "rangeId": null,
          "description": "攻撃範囲+1マス、攻撃力<@ba.vup>+{atk:0%}</>、攻撃時<@ba.vup>{attack@buff_prob:0%}</>の確率で敵を<@ba.vup>{attack@stun}</>秒間<$ba.stun>スタン</>させる",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 25,
            "initSp": 10,
            "increment": 1
          },
          "prefabId": "skchr_pallas_2",
          "duration": 25,
          "blackboard": [
            {
              "key": "atk",
              "value": 0.8,
              "valueStr": null
            },
            {
              "key": "ability_range_forward_extend",
              "value": 1,
              "valueStr": null
            },
            {
              "key": "attack@buff_prob",
              "value": 0.85,
              "valueStr": null
            },
            {
              "key": "attack@stun",
              "value": 0.2,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 3,
        "skillId": "skchr_pallas_3",
        "supported": false,
        "raw": {
          "name": "勇士に捧ぐ祝福",
          "rangeId": null,
          "description": "攻撃力<@ba.vup>+{atk:0%}</>、攻撃対象数+2。自身の前方マスが近距離マスかつ味方オペレーター配置中であれば、その味方に以下の効果を付与する：HPが最大値の<@ba.vup>{attack@peak_performance.hp_ratio:0%}</>以上で攻撃力<@ba.vup>+{attack@peak_performance.atk:0%}</>の<$ba.strong>勇猛</>状態、防御力<@ba.vup>+{attack@def:0%}</>、ブロック数<@ba.vup>+{attack@block_cnt}</>。（前方マスが条件を満たしていなければ、効果の付与対象が自身になる）",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 50,
            "initSp": 35,
            "increment": 1
          },
          "prefabId": "skchr_pallas_3",
          "duration": 30,
          "blackboard": [
            {
              "key": "atk",
              "value": 1,
              "valueStr": null
            },
            {
              "key": "attack@max_target",
              "value": 3,
              "valueStr": null
            },
            {
              "key": "attack@peak_performance.atk",
              "value": 0.5,
              "valueStr": null
            },
            {
              "key": "attack@def",
              "value": 0.35,
              "valueStr": null
            },
            {
              "key": "attack@peak_performance.hp_ratio",
              "value": 0.8,
              "valueStr": null
            },
            {
              "key": "attack@block_cnt",
              "value": 1,
              "valueStr": null
            }
          ]
        }
      }
    ]
  },
  {
    "id": "char_1014_nearl2",
    "name": "耀騎士ニアール",
    "subProfessionId": "fearless",
    "trait": "敵を1体までブロック",
    "talents": [],
    "skills": [
      {
        "skillIndex": 1,
        "skillId": "skchr_nearl2_1",
        "supported": false,
        "raw": {
          "name": "夜に灯る白焔",
          "rangeId": "2-2",
          "description": "攻撃範囲<@ba.vup>拡大</>、攻撃力<@ba.vup>+{atk:0%}</>、攻撃速度<@ba.vup>+{attack_speed}</>\n<@ba.rem>退場まで効果継続</>",
          "skillType": "AUTO",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 60,
            "initSp": 0,
            "increment": 1
          },
          "prefabId": "skchr_nearl2_1",
          "duration": -1,
          "blackboard": [
            {
              "key": "atk",
              "value": 0.7,
              "valueStr": null
            },
            {
              "key": "attack_speed",
              "value": 50,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 2,
        "skillId": "skchr_nearl2_2",
        "supported": false,
        "raw": {
          "name": "闇を払う暁光",
          "rangeId": null,
          "description": "パッシブ：配置可能数に<@ba.vup>カウントされない</>\n配置後、攻撃力<@ba.vup>+{atk:0%}</>、<$ba.shield>シールド</><@ba.vup>{times}</>枚獲得\n効果時間終了後、自動的に撤退する。撤退後、次回までの再配置時間が<@ba.vup>+{value:0%}</>されるが、直前に配置したオペレーターが【カジミエーシュ】に属する場合、再配置時間延長効果を<@ba.vup>無効化</>する",
          "skillType": "PASSIVE",
          "durationType": "NONE",
          "spData": {
            "spType": 8,
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 0,
            "initSp": 0,
            "increment": 0
          },
          "prefabId": "skchr_nearl2_2",
          "duration": 27,
          "blackboard": [
            {
              "key": "atk",
              "value": 1.6,
              "valueStr": null
            },
            {
              "key": "times",
              "value": 4,
              "valueStr": null
            },
            {
              "key": "respawn_time",
              "value": 1.25,
              "valueStr": null
            },
            {
              "key": "nearl2_s_2[withdraw][combo].respawn_time",
              "value": 1,
              "valueStr": null
            },
            {
              "key": "value",
              "value": 0.25,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 3,
        "skillId": "skchr_nearl2_3",
        "supported": false,
        "raw": {
          "name": "大地を照らす烈陽",
          "rangeId": "2-1",
          "description": "隣接4マス範囲内の地上配置可能マスに「ブレイジング・サン」を1本召喚し、その隣接4マス以内の敵全員に耀騎士ニアールの攻撃力の<@ba.vup>{value:0%}</>の確定ダメージを与え、<@ba.vup>{value2}</>秒間<$ba.stun>スタン</>させる\n自身の攻撃範囲<@ba.vup>拡大</>、攻撃力<@ba.vup>+{atk:0%}</>、防御力<@ba.vup>+{def:0%}</>、自身もしくは「ブレイジング・サン」にブロックされている敵への通常攻撃が<@ba.vup>確定</>ダメージを与えるようになる",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 40,
            "initSp": 25,
            "increment": 1
          },
          "prefabId": "skchr_nearl2_3",
          "duration": 25,
          "blackboard": [
            {
              "key": "atk",
              "value": 1.4,
              "valueStr": null
            },
            {
              "key": "def",
              "value": 1,
              "valueStr": null
            },
            {
              "key": "value",
              "value": 1.1,
              "valueStr": null
            },
            {
              "key": "value2",
              "value": 3,
              "valueStr": null
            }
          ]
        }
      }
    ]
  },
  {
    "id": "char_4011_lessng",
    "name": "レッシング",
    "subProfessionId": "fearless",
    "trait": "敵を1体までブロック",
    "talents": [],
    "skills": [
      {
        "skillIndex": 1,
        "skillId": "skchr_lessng_1",
        "supported": false,
        "raw": {
          "name": "強撃γ",
          "rangeId": null,
          "description": "次の通常攻撃時、攻撃力が<@ba.vup>{atk_scale:0%}</>まで上昇",
          "skillType": "AUTO",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WHEN_ATTACK",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 2,
            "initSp": 0,
            "increment": 1
          },
          "prefabId": "skchr_lessng_1",
          "duration": 0,
          "blackboard": [
            {
              "key": "atk_scale",
              "value": 2.9,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 2,
        "skillId": "skchr_lessng_2",
        "supported": false,
        "raw": {
          "name": "苦行の縛り",
          "rangeId": null,
          "description": "配置後、第一素質の効果が<@ba.vup>{talent_scale}</>倍まで上昇、攻撃力<@ba.vup>+{atk:0%}</>、通常攻撃が<@ba.vup>2</>連撃になる",
          "skillType": "PASSIVE",
          "durationType": "NONE",
          "spData": {
            "spType": 8,
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 0,
            "initSp": 0,
            "increment": 0
          },
          "prefabId": "skchr_lessng_2",
          "duration": 24,
          "blackboard": [
            {
              "key": "atk",
              "value": 0.6,
              "valueStr": null
            },
            {
              "key": "talent_scale",
              "value": 2.2,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 3,
        "skillId": "skchr_lessng_3",
        "supported": false,
        "raw": {
          "name": "誓いの破棄",
          "rangeId": null,
          "description": "スキル発動中<$ba.debuff>状態異常</>を無効化し、最大HP<@ba.vup>+{max_hp:0%}</>、ブロックされている敵を攻撃時、対象に攻撃力の<@ba.vup>{lessng_s3[atk_scale].atk_scale:0%}</>の物理ダメージを与える\n<@ba.rem>状態異常中でもスキルを発動でき、その際状態異常を解除することができるが、600の術ダメージを受ける</>",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 40,
            "initSp": 30,
            "increment": 1
          },
          "prefabId": "skchr_lessng_3",
          "duration": 20,
          "blackboard": [
            {
              "key": "max_hp",
              "value": 1.1,
              "valueStr": null
            },
            {
              "key": "lessng_s3[atk_scale].atk_scale",
              "value": 2.2,
              "valueStr": null
            },
            {
              "key": "magical_value",
              "value": 600,
              "valueStr": null
            }
          ]
        }
      }
    ]
  },
  {
    "id": "char_1032_excu2",
    "name": "聖約イグゼキュター",
    "subProfessionId": "reaper",
    "trait": "味方の治療対象にならない\n攻撃は<@ba.kw>範囲物理ダメージ</>を与え、敵を1体攻撃するたび自身のHPを<@ba.kw>50</>回復（攻撃毎の最大回復回数はブロック数と同じ）",
    "talents": [],
    "skills": [
      {
        "skillIndex": 1,
        "skillId": "skchr_excu2_1",
        "supported": false,
        "raw": {
          "name": "遺言の執行",
          "rangeId": "2-5",
          "description": "攻撃範囲<@ba.vup>拡大</>、攻撃力<@ba.vup>+{atk:0%}</>、攻撃時に対象の防御力を<@ba.vup>{def_penetrate_fixed}</>無視\n<@ba.rem>合計{attack@trigger_time}発の弾薬を撃ち切るとスキルが終了（手動でスキルを停止可能）</>",
          "skillType": "AUTO",
          "durationType": "AMMO",
          "spData": {
            "spType": "INCREASE_WHEN_ATTACK",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 8,
            "initSp": 0,
            "increment": 1
          },
          "prefabId": "skchr_excu2_1",
          "duration": 0,
          "blackboard": [
            {
              "key": "atk",
              "value": 0.5,
              "valueStr": null
            },
            {
              "key": "def_penetrate_fixed",
              "value": 400,
              "valueStr": null
            },
            {
              "key": "attack@trigger_time",
              "value": 8,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 2,
        "skillId": "skchr_excu2_2",
        "supported": false,
        "raw": {
          "name": "近接銃術",
          "rangeId": null,
          "description": "攻撃力<@ba.vup>+{atk:0%}</>、防御力<@ba.vup>+{def:0%}</>、ブロック数<@ba.vup>+{block_cnt}</>、近接攻撃を受けると<@ba.vup>{prob:0%}</>の確率で回避し、さらに弾薬を<@ba.vup>{recover_cnt}</>発補充\n<@ba.rem>合計{attack@trigger_time}発の弾薬を撃ち切るとスキルが終了（手動でスキルを停止可能）</>",
          "skillType": "MANUAL",
          "durationType": "AMMO",
          "spData": {
            "spType": "INCREASE_WHEN_ATTACK",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 12,
            "initSp": 6,
            "increment": 1
          },
          "prefabId": "skchr_excu2_2",
          "duration": 0,
          "blackboard": [
            {
              "key": "atk",
              "value": 0.8,
              "valueStr": null
            },
            {
              "key": "def",
              "value": 0.8,
              "valueStr": null
            },
            {
              "key": "block_cnt",
              "value": 1,
              "valueStr": null
            },
            {
              "key": "prob",
              "value": 0.4,
              "valueStr": null
            },
            {
              "key": "recover_cnt",
              "value": 1,
              "valueStr": null
            },
            {
              "key": "attack@trigger_time",
              "value": 12,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 3,
        "skillId": "skchr_excu2_3",
        "supported": false,
        "raw": {
          "name": "聖約の裁き",
          "rangeId": "2-5",
          "description": "攻撃間隔を<@ba.vdown>わずかに延長</>し、攻撃範囲<@ba.vup>拡大</>、攻撃力<@ba.vup>+{atk:0%}</>、弾薬を1発消費するたびに攻撃力がさらに<@ba.vup>+{attack@atk:0%}</>（最大{attack@max_stack_cnt}回）、特性のHP回復効果が<@ba.vup>{trait_ratio}</>倍まで上昇。スキル終了時、発動期間中に攻撃した対象に攻撃力の<@ba.vup>{attack@final_atk_scale:0%}</>の物理ダメージを与える\n<@ba.rem>合計{attack@trigger_time}発の弾薬を撃ち切るとスキルが終了（手動でスキルを停止可能）</>",
          "skillType": "MANUAL",
          "durationType": "AMMO",
          "spData": {
            "spType": "INCREASE_WHEN_ATTACK",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 24,
            "initSp": 12,
            "increment": 1
          },
          "prefabId": "skchr_excu2_3",
          "duration": 0,
          "blackboard": [
            {
              "key": "atk",
              "value": 1.8,
              "valueStr": null
            },
            {
              "key": "attack@atk",
              "value": 0.06,
              "valueStr": null
            },
            {
              "key": "trait_ratio",
              "value": 3,
              "valueStr": null
            },
            {
              "key": "attack@final_atk_scale",
              "value": 2.5,
              "valueStr": null
            },
            {
              "key": "base_attack_time",
              "value": 0.5,
              "valueStr": null
            },
            {
              "key": "attack@trigger_time",
              "value": 16,
              "valueStr": null
            },
            {
              "key": "attack@max_stack_cnt",
              "value": 30,
              "valueStr": null
            }
          ]
        }
      }
    ]
  },
  {
    "id": "char_4010_etlchi",
    "name": "エンテレケイア",
    "subProfessionId": "reaper",
    "trait": "味方の治療対象にならない\n攻撃は<@ba.kw>範囲物理ダメージ</>を与え、敵を1体攻撃するたび自身のHPを<@ba.kw>50</>回復（攻撃毎の最大回復回数はブロック数と同じ）",
    "talents": [],
    "skills": [
      {
        "skillIndex": 1,
        "skillId": "skchr_etlchi_1",
        "supported": false,
        "raw": {
          "name": "薔薇の残影",
          "rangeId": null,
          "description": "次の通常攻撃時、攻撃力が<@ba.vup>{atk_scale:0%}</>まで上昇し、攻撃対象に2回攻撃",
          "skillType": "AUTO",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WHEN_ATTACK",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 2,
            "initSp": 0,
            "increment": 1
          },
          "prefabId": "skchr_etlchi_1",
          "duration": 0,
          "blackboard": [
            {
              "key": "atk_scale",
              "value": 1.75,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 2,
        "skillId": "skchr_etlchi_2",
        "supported": false,
        "raw": {
          "name": "深紅の抱擁",
          "rangeId": null,
          "description": "攻撃しなくなり、自身と地面マスにいる他の味方ユニット<@ba.vup>1</>名を中心に回転する血の鎌を召喚し、鎌と接触している敵に<@ba.vup>0.5</>秒ごとに自身の攻撃力の<@ba.vup>{atk_scale:0%}</>の物理ダメージを与える",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 20,
            "initSp": 15,
            "increment": 1
          },
          "prefabId": "skchr_etlchi_2",
          "duration": 12,
          "blackboard": [
            {
              "key": "atk_scale",
              "value": 1.95,
              "valueStr": null
            },
            {
              "key": "interval",
              "value": 0.5,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 3,
        "skillId": "skchr_etlchi_3",
        "supported": false,
        "raw": {
          "name": "霊魂と欲望の惜別",
          "rangeId": "2-5",
          "description": "攻撃範囲<@ba.vup>拡大</>、攻撃力<@ba.vup>+{atk:0%}</>、攻撃速度<@ba.vup>+{attack_speed}</>、攻撃範囲内の地面マスにいるHPが最も高い敵を最大<@ba.vup>3</>体選択し、対象のステータスと残りHPの<@ba.vdown>{attack@max_hp_scale:0%}</>のHPを有する「心燭」を召喚する。「心燭」への攻撃時は、必ず攻撃力の<@ba.vup>35%</>以上のダメージを与え、対象の敵も与えたダメージと同量のHPを失う\n<@ba.rem>「心燭」はエンテレケイアの攻撃しか受けない</>",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 30,
            "initSp": 22,
            "increment": 1
          },
          "prefabId": "skchr_etlchi_3",
          "duration": 20,
          "blackboard": [
            {
              "key": "atk",
              "value": 1.35,
              "valueStr": null
            },
            {
              "key": "attack_speed",
              "value": 100,
              "valueStr": null
            },
            {
              "key": "attack@max_target",
              "value": 3,
              "valueStr": null
            },
            {
              "key": "attack@max_hp_scale",
              "value": 0.6,
              "valueStr": null
            },
            {
              "key": "attack@def_scale",
              "value": 1,
              "valueStr": null
            },
            {
              "key": "attack@magic_resistance_scale",
              "value": 1,
              "valueStr": null
            }
          ]
        }
      }
    ]
  },
  {
    "id": "char_4064_mlynar",
    "name": "ムリナール",
    "subProfessionId": "librator",
    "trait": "通常時は攻撃せずブロック数が0となり、攻撃力が<@ba.kw>+{atk:0%}</>まで徐々に上昇していく（最大値になるまでの時間は<@ba.kw>{max_stack_cnt}</>秒）\nスキル終了時、特性による攻撃力上昇効果をリセット",
    "talents": [],
    "skills": [
      {
        "skillIndex": 1,
        "skillId": "skchr_mlynar_1",
        "supported": false,
        "raw": {
          "name": "秘めたる怒り",
          "rangeId": null,
          "description": "通常攻撃が攻撃対象に攻撃力の<@ba.vup>{attack@atk_scale:0%}</>の物理ダメージを与える。防御力<@ba.vup>+{def:0%}</>",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 30,
            "initSp": 15,
            "increment": 1
          },
          "prefabId": "skchr_mlynar_1",
          "duration": 30,
          "blackboard": [
            {
              "key": "attack@atk_scale",
              "value": 2,
              "valueStr": null
            },
            {
              "key": "def",
              "value": 0.6,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 2,
        "skillId": "skchr_mlynar_2",
        "supported": false,
        "raw": {
          "name": "癒えぬ悲しみ",
          "rangeId": "2-3",
          "description": "通常攻撃の間隔を<@ba.vdown>延長</>し、攻撃範囲<@ba.vup>拡大</>、通常攻撃が攻撃力の<@ba.vup>{attack@atk_scale:0%}</>の<@ba.vup>2</>回連続攻撃になる\n<@ba.rem>手動でスキルを停止可能。スキル発動中に敵を倒すと、スキル終了時の特性による攻撃力リセットが無効化される</>",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 25,
            "initSp": 10,
            "increment": 1
          },
          "prefabId": "skchr_mlynar_2",
          "duration": 20,
          "blackboard": [
            {
              "key": "attack@atk_scale",
              "value": 1.9,
              "valueStr": null
            },
            {
              "key": "base_attack_time",
              "value": 0.3,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 3,
        "skillId": "skchr_mlynar_3",
        "supported": false,
        "raw": {
          "name": "輝かざる栄光",
          "rangeId": "3-18",
          "description": "攻撃範囲<@ba.vup>拡大</>、特性の効果が<@ba.vup>{trait_up}</>倍となり（ただし、スキル発動中に敵を1体倒すごとに倍率<@ba.vup>{per_kill_reduce:0%}</>）、攻撃時、攻撃範囲内の敵最大<@ba.vup>{attack@max_target}</>体に攻撃力の<@ba.vup>{attack@atk_scale:0%}</>の物理ダメージを与える。さらに味方【カジミエーシュ】が効果範囲内の敵を攻撃時、追加でムリナールの攻撃力の<@ba.vup>{atk_scale:0%}</>の<@ba.vup>確定</>ダメージを与える",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 42,
            "initSp": 20,
            "increment": 1
          },
          "prefabId": "skchr_mlynar_3",
          "duration": 28,
          "blackboard": [
            {
              "key": "attack@atk_scale",
              "value": 1.8,
              "valueStr": null
            },
            {
              "key": "atk_scale",
              "value": 0.12,
              "valueStr": null
            },
            {
              "key": "attack@max_target",
              "value": 5,
              "valueStr": null
            },
            {
              "key": "trait_up",
              "value": 2,
              "valueStr": null
            },
            {
              "key": "per_kill_reduce",
              "value": -0.1,
              "valueStr": null
            }
          ]
        }
      }
    ]
  },
  {
    "id": "char_1043_leizi2",
    "name": "司霆レイズ",
    "subProfessionId": "librator",
    "trait": "通常時は攻撃せずブロック数が0となり、攻撃力が<@ba.kw>+{atk:0%}</>まで徐々に上昇していく（最大値になるまでの時間は<@ba.kw>{max_stack_cnt}</>秒）\nスキル終了時、特性による攻撃力上昇効果をリセット",
    "talents": [],
    "skills": [
      {
        "skillIndex": 1,
        "skillId": "skchr_leizi2_1",
        "supported": false,
        "raw": {
          "name": "浩気不滅",
          "rangeId": "3-19",
          "description": "攻撃範囲が<@ba.vup>前方と両側に拡大</>する。攻撃範囲内の地上にいる敵全員に司霆レイズの攻撃力の<@ba.vup>{attack@atk_scale_s1:0%}</>の物理ダメージを与える\n<@ba.rem>3回チャージ可能。特性による攻撃力上昇効果は、チャージ数が0になるまでリセットされない</>",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 3,
            "spCost": 11,
            "initSp": 17,
            "increment": 1
          },
          "prefabId": "skchr_leizi2_1",
          "duration": -1,
          "blackboard": [
            {
              "key": "attack@atk_scale_s1",
              "value": 3.55,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 2,
        "skillId": "skchr_leizi2_2",
        "supported": false,
        "raw": {
          "name": "雷霆摂威",
          "rangeId": null,
          "description": "攻撃範囲が<@ba.vup>地面マスに沿って最大3マス先まで拡大</>し、攻撃時、敵最大<@ba.vup>{attack@max_target_s2}</>体に攻撃力の<@ba.vup>{attack@atk_scale_s2:0%}</>の物理ダメージを与える。スキル発動中に落雷が発生するたびに攻撃力<@ba.vup>+{thunder_atk:0%}</>（最大25回まで）",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 43,
            "initSp": 22,
            "increment": 1
          },
          "prefabId": "skchr_leizi2_2",
          "duration": 36,
          "blackboard": [
            {
              "key": "attack@atk_scale_s2",
              "value": 1.5,
              "valueStr": null
            },
            {
              "key": "attack@max_target_s2",
              "value": 4,
              "valueStr": null
            },
            {
              "key": "thunder_atk",
              "value": 0.1,
              "valueStr": null
            },
            {
              "key": "thunder_max_stack_cnt",
              "value": 25,
              "valueStr": null
            }
          ]
        }
      },
      {
        "skillIndex": 3,
        "skillId": "skchr_leizi2_3",
        "supported": false,
        "raw": {
          "name": "天地通明",
          "rangeId": "2-1",
          "description": "攻撃範囲<@ba.vup>拡大</>、攻撃間隔が<@ba.vdown>大幅に延長</>し、通常攻撃が敵に攻撃力の<@ba.vup>{attack@atk_scale_s3:0%}</>の範囲物理ダメージを与え、攻撃対象のいるマスから十字方向に<@ba.vup>3マス先まで流れる</>電流を生成する。電流は司霆レイズか高台に触れると<@ba.vup>反射</>し、電流の流れるマスにいるすべての敵に0.6秒ごとにレイズの攻撃力の<@ba.vup>{attack@atk_scale_current:0%}</>の術ダメージを与え、<@ba.vup>{prob:0%}</>の確率で<@ba.vup>3秒間</><$ba.tremble>戦慄</>状態にする",
          "skillType": "MANUAL",
          "durationType": "NONE",
          "spData": {
            "spType": "INCREASE_WITH_TIME",
            "levelUpCost": null,
            "maxChargeTime": 1,
            "spCost": 36,
            "initSp": 21,
            "increment": 1
          },
          "prefabId": "skchr_leizi2_3",
          "duration": 24,
          "blackboard": [
            {
              "key": "attack@atk_scale_s3",
              "value": 3,
              "valueStr": null
            },
            {
              "key": "base_attack_time",
              "value": 1.7,
              "valueStr": null
            },
            {
              "key": "attack@range_radius",
              "value": 1.65,
              "valueStr": null
            },
            {
              "key": "attack@atk_scale_current",
              "value": 0.7,
              "valueStr": null
            },
            {
              "key": "prob",
              "value": 0.15,
              "valueStr": null
            },
            {
              "key": "not_combat",
              "value": 3,
              "valueStr": null
            }
          ]
        }
      }
    ]
  }
] as unknown as readonly GuardSource[]
