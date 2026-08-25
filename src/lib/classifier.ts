import type {
  ClassificationConfidence,
  RawSkillLevel,
  SkillClassification,
  SkillEffectType,
  SkillOutputMode,
} from '../types/skill'

export const SKILL_EFFECT_TYPE_LABELS: Record<SkillEffectType, string> = {
  TIMED: '時間制',
  AMMO: '弾薬制',
  PERMANENT: '永続',
  NEXT_ATTACK: '次回攻撃',
  TRAP: '設置物',
  INSTANT: '即時発動',
  PASSIVE: 'パッシブ',
  UNKNOWN: '要確認',
}

export const SKILL_OUTPUT_MODE_LABELS: Record<SkillOutputMode, string> = {
  SKILL_DPS: 'スキルDPSを表示',
  PER_USE: '1回あたりの結果を表示',
  NORMAL_DPS: '通常攻撃DPSへ反映',
  REVIEW: '出力方法を要確認',
}

export const SKILL_EFFECT_OPTIONS = Object.entries(SKILL_EFFECT_TYPE_LABELS) as Array<[
  SkillEffectType,
  string,
]>

const OUTPUT_MODES: Record<SkillEffectType, SkillOutputMode> = {
  TIMED: 'SKILL_DPS',
  AMMO: 'SKILL_DPS',
  PERMANENT: 'SKILL_DPS',
  NEXT_ATTACK: 'PER_USE',
  TRAP: 'PER_USE',
  INSTANT: 'PER_USE',
  PASSIVE: 'NORMAL_DPS',
  UNKNOWN: 'REVIEW',
}

const AMMO_PATTERN = /(?:弾薬|銃弾|矢).{0,30}(?:撃ち切|使い切)|撃ち切るとスキルが終了/s
const TRAP_PATTERN = /(?:地雷|爆弾|罠|装置).{0,24}(?:設置|配置)|(?:設置|配置).{0,24}(?:地雷|爆弾|罠|装置)/s
const NEXT_ATTACK_PATTERN = /(?:次の通常攻撃時|次回の?通常攻撃時|次の攻撃時|次回攻撃時)/
const PERMANENT_PATTERN = /(?:退場まで効果継続|効果は退場まで継続|永続的?に効果継続)/
const DEPLOYMENT_DURATION_PATTERN = /配置後.{0,100}(?:\{[^}]+\}|\d+(?:\.\d+)?)秒(?:間|持続)/s

export function classifySkill(level: RawSkillLevel): SkillClassification {
  const description = normalizeDescription(level.description ?? '')
  const duration = typeof level.duration === 'number' ? level.duration : null

  if (level.durationType === 'AMMO') {
    return result('AMMO', 'HIGH', ['durationType が AMMO'])
  }

  if (AMMO_PATTERN.test(description)) {
    return result('AMMO', 'MEDIUM', ['説明文に弾薬を撃ち切る終了条件がある'])
  }

  // duration はスキル本体の継続時間なので、副次効果の文言より優先する。
  if (duration !== null && duration > 0) {
    return result('TIMED', 'HIGH', [`duration が ${duration} 秒`])
  }

  // W S2 のように「次の通常攻撃時」でも、実際の出力単位が設置物ならこちらを優先する。
  if (TRAP_PATTERN.test(description)) {
    return result('TRAP', 'HIGH', ['説明文に地雷・爆弾・罠・装置の設置がある'])
  }

  if (NEXT_ATTACK_PATTERN.test(description)) {
    return result('NEXT_ATTACK', 'HIGH', ['説明文に次回攻撃の強化がある'])
  }

  if (PERMANENT_PATTERN.test(description)) {
    return result('PERMANENT', 'HIGH', ['説明文に退場まで継続する効果がある'])
  }

  // 一部の配置時パッシブは duration=-1 で、実時間は blackboard の埋め込み値になっている。
  if (level.skillType === 'PASSIVE' && DEPLOYMENT_DURATION_PATTERN.test(description)) {
    return result('TIMED', 'MEDIUM', ['配置後に一定秒数だけ継続するパッシブ効果'])
  }

  if (level.skillType === 'PASSIVE') {
    return result('PASSIVE', 'HIGH', ['skillType が PASSIVE'])
  }

  if (description) {
    return result('INSTANT', 'MEDIUM', [
      '持続時間・弾薬・永続・次回攻撃・設置物の条件に該当しない',
    ])
  }

  return result('UNKNOWN', 'LOW', ['説明文がないため自動判定できない'])
}

export function applyManualClassification(
  automatic: SkillClassification,
  manualType: SkillEffectType | undefined,
): SkillClassification {
  if (!manualType) return automatic

  return {
    type: manualType,
    label: SKILL_EFFECT_TYPE_LABELS[manualType],
    outputMode: OUTPUT_MODES[manualType],
    confidence: 'HIGH',
    reasons: [`手動指定（自動判定: ${automatic.label}）`],
    source: 'MANUAL',
    automaticType: automatic.type,
  }
}

function result(
  type: SkillEffectType,
  confidence: ClassificationConfidence,
  reasons: string[],
): SkillClassification {
  return {
    type,
    label: SKILL_EFFECT_TYPE_LABELS[type],
    outputMode: OUTPUT_MODES[type],
    confidence,
    reasons,
    source: 'AUTO',
  }
}

function normalizeDescription(value: string): string {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/\\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
