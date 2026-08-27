import type {
  ActivationTriggerType,
  ClassifiedField,
  ClassificationConfidence,
  DamageComponentType,
  EffectWindowType,
  OutputCapabilities,
  RawSkillLevel,
  SkillClassification,
  SkillClassificationOverride,
  SkillConditionType,
} from '../types/skill'

export const EFFECT_WINDOW_LABELS: Record<EffectWindowType, string> = {
  FIXED_DURATION: '固定時間',
  AMMO: '弾薬制',
  PERMANENT: '永続',
  TOGGLE_OR_MODE: '切替・モード制',
  NONE: '継続枠なし',
  UNKNOWN: '要確認',
}

export const ACTIVATION_TRIGGER_LABELS: Record<ActivationTriggerType, string> = {
  MANUAL: '手動発動',
  AUTO_SP: '自動発動',
  NEXT_ATTACK: '次回攻撃時',
  ON_DEPLOY: '配置時',
  PASSIVE: 'パッシブ',
  CONDITIONAL: '条件成立時',
  UNKNOWN: '要確認',
}

export const DAMAGE_COMPONENT_LABELS: Record<DamageComponentType, string> = {
  BASIC_ATTACK_MODIFIER: '通常攻撃変化',
  BURST: '瞬間・連続攻撃',
  PERIODIC: '周期ダメージ',
  DEPLOYED_OBJECT: '設置物',
  SUMMON: '召喚物',
  DAMAGE_OVER_TIME: '継続ダメージ',
  NO_DIRECT_DAMAGE: '直接ダメージなし',
  UNKNOWN: '要確認',
}

export const SKILL_CONDITION_LABELS: Record<SkillConditionType, string> = {
  CHARGE: 'チャージ数',
  OVERCHARGE: 'オーバーチャージ',
  PHASE: '段階・フェーズ',
  MODE: 'モード選択',
  TARGET_STATE: '対象の状態',
  DEPLOY_TIME: '配置後の経過時間',
  ACTIVATION_COUNT: '発動回数',
  OTHER: 'その他の条件',
}

// 「スキル分類の4項目について」で定義された表示色。
export const EFFECT_WINDOW_COLORS: Record<EffectWindowType, string> = {
  FIXED_DURATION: '#DBEAFE',
  AMMO: '#FEF3C7',
  PERMANENT: '#DCFCE7',
  TOGGLE_OR_MODE: '#EDE9FE',
  NONE: '#CFFAFE',
  UNKNOWN: '#E5E7EB',
}

export const ACTIVATION_TRIGGER_COLORS: Record<ActivationTriggerType, string> = {
  MANUAL: '#E0E7FF',
  AUTO_SP: '#DCFCE7',
  NEXT_ATTACK: '#FEF3C7',
  ON_DEPLOY: '#FFEDD5',
  PASSIVE: '#CFFAFE',
  CONDITIONAL: '#FCE7F3',
  UNKNOWN: '#E5E7EB',
}

export const DAMAGE_COMPONENT_COLORS: Record<DamageComponentType, string> = {
  BASIC_ATTACK_MODIFIER: '#DBEAFE',
  BURST: '#FEE2E2',
  PERIODIC: '#FFEDD5',
  DEPLOYED_OBJECT: '#FEF3C7',
  SUMMON: '#DCFCE7',
  DAMAGE_OVER_TIME: '#FCE7F3',
  NO_DIRECT_DAMAGE: '#CCFBF1',
  UNKNOWN: '#E5E7EB',
}

export const SKILL_CONDITION_COLORS: Record<SkillConditionType, string> = {
  CHARGE: '#FEF3C7',
  OVERCHARGE: '#FFEDD5',
  PHASE: '#EDE9FE',
  MODE: '#DBEAFE',
  TARGET_STATE: '#FCE7F3',
  DEPLOY_TIME: '#CFFAFE',
  ACTIVATION_COUNT: '#DCFCE7',
  OTHER: '#E2E8F0',
}

export const NO_SKILL_CONDITION_COLOR = '#F3F4F6'

export const EFFECT_WINDOW_OPTIONS = Object.entries(EFFECT_WINDOW_LABELS) as Array<[EffectWindowType, string]>
export const ACTIVATION_TRIGGER_OPTIONS = Object.entries(ACTIVATION_TRIGGER_LABELS) as Array<[ActivationTriggerType, string]>
export const DAMAGE_COMPONENT_OPTIONS = Object.entries(DAMAGE_COMPONENT_LABELS) as Array<[DamageComponentType, string]>
export const SKILL_CONDITION_OPTIONS = Object.entries(SKILL_CONDITION_LABELS) as Array<[SkillConditionType, string]>

const AMMO_PATTERN = /(?:弾薬|銃弾|矢).{0,40}(?:撃ち切|使い切)|撃ち切るとスキルが終了/s
const NEXT_ATTACK_PATTERN = /(?:次の通常攻撃時|次回の?通常攻撃時|次の攻撃時|次回攻撃時)/
const DEPLOYED_OBJECT_PATTERN = /(?:地雷|爆弾|罠|装置|ビーコン|トークン).{0,32}(?:設置|配置)|(?:設置|配置).{0,32}(?:地雷|爆弾|罠|装置|ビーコン|トークン)/s
const SUMMON_PATTERN = /召喚(?:物|ユニット)?|召喚する/
const PERMANENT_PATTERN = /(?:退場まで効果継続|効果は退場まで継続|永続的?に効果継続)/
const TOGGLE_PATTERN = /(?:モードを?切り替|切替可能|切り替え可能|手動でスキルを停止可能|解除するまで)/
const DEPLOYMENT_DURATION_PATTERN = /配置後.{0,100}(?:\{[^}]+\}|\d+(?:\.\d+)?)秒(?:間|持続)/s
const CONDITIONAL_TRIGGER_PATTERN = /(?:HPが.{0,20}(?:以下|未満)|条件を満たした時|敵を倒した時|ブロック中のみ)/s
const BASIC_ATTACK_PATTERN = /(?:通常攻撃|攻撃力(?:が|\+|を)|攻撃速度|攻撃間隔|連撃|攻撃が.{0,20}回攻撃)/
const DIRECT_DAMAGE_PATTERN = /(?:物理|術|確定)?ダメージを与|攻撃力の.{0,30}ダメージ|ダメージ量/
const BURST_PATTERN = /(?:砲撃|斬撃|一斉射撃|連続で攻撃|即座に攻撃|発射|周囲.{0,30}ダメージ|範囲内.{0,30}ダメージ)/s
const PERIODIC_PATTERN = /(?:一定時間ごと|\d+(?:\.\d+)?秒ごと|毎秒).{0,50}(?:ダメージ|攻撃)/s
const DAMAGE_OVER_TIME_PATTERN = /(?:継続ダメージ|一定時間.{0,40}毎秒.{0,40}ダメージ|毎秒.{0,40}ダメージ)/s

export function classifySkill(level: RawSkillLevel): SkillClassification {
  const description = normalizeDescription(level.description ?? '')
  const effectWindow = classifyEffectWindow(level, description)
  const activationTrigger = classifyActivationTrigger(level, description)
  const damageComponents = classifyDamageComponents(description, effectWindow.value, activationTrigger.value)
  const conditions = classifyConditions(description)
  const output = deriveOutputCapabilities(
    effectWindow.value,
    activationTrigger.value,
    damageComponents.value,
    conditions.value,
  )

  return {
    effectWindow,
    activationTrigger,
    damageComponents,
    conditions,
    outputCapabilities: output.capabilities,
    requiresManualModelReasons: output.reasons,
  }
}

export function applyManualClassification(
  automatic: SkillClassification,
  override: SkillClassificationOverride | undefined,
): SkillClassification {
  if (!override || Object.keys(override).length === 0) return automatic

  const effectWindow = override.effectWindow === undefined
    ? automatic.effectWindow
    : manualField(override.effectWindow, automatic.effectWindow.value, EFFECT_WINDOW_LABELS)
  const activationTrigger = override.activationTrigger === undefined
    ? automatic.activationTrigger
    : manualField(override.activationTrigger, automatic.activationTrigger.value, ACTIVATION_TRIGGER_LABELS)
  const damageComponents = override.damageComponents === undefined
    ? automatic.damageComponents
    : manualArrayField(override.damageComponents, automatic.damageComponents.value, DAMAGE_COMPONENT_LABELS)
  const conditions = override.conditions === undefined
    ? automatic.conditions
    : manualArrayField(override.conditions, automatic.conditions.value, SKILL_CONDITION_LABELS)
  const output = deriveOutputCapabilities(
    effectWindow.value,
    activationTrigger.value,
    damageComponents.value,
    conditions.value,
  )

  return {
    effectWindow,
    activationTrigger,
    damageComponents,
    conditions,
    outputCapabilities: output.capabilities,
    requiresManualModelReasons: output.reasons,
  }
}

export function getOutputCapabilityLabels(capabilities: OutputCapabilities): string[] {
  const labels: string[] = []
  if (capabilities.canShowPerHit) labels.push('1ヒット')
  if (capabilities.canShowPerActivationTotal) labels.push('発動総量')
  if (capabilities.canShowDps) labels.push('DPS')
  if (capabilities.canShowWindowTotal) labels.push('効果時間総量')
  if (capabilities.canShowSteadyStateDps) labels.push('定常DPS')
  if (capabilities.requiresModeSelection) labels.push('モード選択')
  if (capabilities.requiresManualModel) labels.push('要モデル化')
  return labels
}

function classifyEffectWindow(level: RawSkillLevel, description: string): ClassifiedField<EffectWindowType> {
  const duration = typeof level.duration === 'number' ? level.duration : null

  if (level.durationType === 'AMMO') return autoField('AMMO', 'HIGH', ['durationType が AMMO'])
  if (duration !== null && duration > 0) return autoField('FIXED_DURATION', 'HIGH', [`duration が ${duration} 秒`])
  if (AMMO_PATTERN.test(description)) return autoField('AMMO', 'MEDIUM', ['説明文に弾薬を使い切る終了条件がある'])
  if (TOGGLE_PATTERN.test(description)) return autoField('TOGGLE_OR_MODE', 'MEDIUM', ['説明文に切替・手動停止・解除条件がある'])
  if (PERMANENT_PATTERN.test(description)) return autoField('PERMANENT', 'HIGH', ['説明文に退場まで続く効果がある'])
  if (level.skillType === 'PASSIVE' && DEPLOYMENT_DURATION_PATTERN.test(description)) {
    return autoField('FIXED_DURATION', 'MEDIUM', ['配置後に一定秒数だけ続くパッシブ効果'])
  }
  if (level.skillType === 'PASSIVE') return autoField('PERMANENT', 'MEDIUM', ['skillType が PASSIVE で明示的な終了条件がない'])
  if (description) return autoField('NONE', 'MEDIUM', ['スキル本体の継続時間・弾薬・永続・切替条件に該当しない'])
  return autoField('UNKNOWN', 'LOW', ['説明文がなく終了条件を判定できない'])
}

function classifyActivationTrigger(level: RawSkillLevel, description: string): ClassifiedField<ActivationTriggerType> {
  if (NEXT_ATTACK_PATTERN.test(description)) return autoField('NEXT_ATTACK', 'HIGH', ['説明文に次回攻撃時の発動がある'])
  if (level.skillType === 'PASSIVE' && /配置(?:後|時)/.test(description)) {
    return autoField('ON_DEPLOY', 'HIGH', ['PASSIVE かつ配置時・配置後に発動する'])
  }
  if (level.skillType === 'PASSIVE') return autoField('PASSIVE', 'HIGH', ['skillType が PASSIVE'])
  if (level.skillType === 'MANUAL') return autoField('MANUAL', 'HIGH', ['skillType が MANUAL'])
  if (level.skillType === 'AUTO') return autoField('AUTO_SP', 'HIGH', ['skillType が AUTO'])
  if (/配置(?:後|時)/.test(description)) return autoField('ON_DEPLOY', 'MEDIUM', ['説明文に配置時・配置後の発動がある'])
  if (CONDITIONAL_TRIGGER_PATTERN.test(description)) return autoField('CONDITIONAL', 'MEDIUM', ['説明文に条件成立時の発動がある'])
  if (description) return autoField('UNKNOWN', 'LOW', ['skillType と説明文から発動契機を特定できない'])
  return autoField('UNKNOWN', 'LOW', ['説明文がなく発動契機を判定できない'])
}

function classifyDamageComponents(
  description: string,
  effectWindow: EffectWindowType,
  activationTrigger: ActivationTriggerType,
): ClassifiedField<DamageComponentType[]> {
  if (!description) return autoField(['UNKNOWN'], 'LOW', ['説明文がなくダメージ構成を判定できない'])

  const values: DamageComponentType[] = []
  const reasons: string[] = []
  const hasDeployedObject = DEPLOYED_OBJECT_PATTERN.test(description)
  const hasSummon = SUMMON_PATTERN.test(description)
  const hasDamageOverTime = DAMAGE_OVER_TIME_PATTERN.test(description)
  const hasPeriodic = PERIODIC_PATTERN.test(description)
  const hasDirectDamage = DIRECT_DAMAGE_PATTERN.test(description)

  if (hasDeployedObject) {
    values.push('DEPLOYED_OBJECT')
    reasons.push('説明文に地雷・装置などの設置がある')
  }
  if (hasSummon) {
    values.push('SUMMON')
    reasons.push('説明文に召喚物がある')
  }
  if (hasDamageOverTime) {
    values.push('DAMAGE_OVER_TIME')
    reasons.push('説明文に継続ダメージがある')
  } else if (hasPeriodic) {
    values.push('PERIODIC')
    reasons.push('説明文に一定間隔のダメージ・攻撃がある')
  }

  const modifiesBasicAttack = !hasDeployedObject && (
    BASIC_ATTACK_PATTERN.test(description) || activationTrigger === 'NEXT_ATTACK'
  )
  if (modifiesBasicAttack && !hasSummon) {
    values.push('BASIC_ATTACK_MODIFIER')
    reasons.push('通常攻撃・攻撃力・攻撃間隔の変化がある')
  }

  const hasExplicitImmediateBurst = /(?:スキル発動時|発動後すぐ|即座に|その後).{0,50}(?:ダメージ|攻撃|砲撃)/s.test(description)
  const isStandaloneBurst = hasDirectDamage
    && !hasDeployedObject
    && !hasDamageOverTime
    && (!hasPeriodic || /即座|同時に/.test(description))
    && (effectWindow === 'NONE' || (BURST_PATTERN.test(description) && hasExplicitImmediateBurst))
  if (isStandaloneBurst) {
    values.push('BURST')
    reasons.push('説明文に独立した瞬間・連続ダメージがある')
  }

  if (values.length === 0) {
    return autoField(['NO_DIRECT_DAMAGE'], 'MEDIUM', ['直接ダメージを示す表現を検出しなかった'])
  }

  return autoField(unique(values), hasDirectDamage || modifiesBasicAttack ? 'HIGH' : 'MEDIUM', reasons)
}

function classifyConditions(description: string): ClassifiedField<SkillConditionType[]> {
  if (!description) return autoField([], 'LOW', ['説明文がなく条件・段階を判定できない'])

  const values: SkillConditionType[] = []
  const reasons: string[] = []
  addCondition(description, values, reasons, 'OVERCHARGE', /オーバーチャージ/, 'オーバーチャージ条件がある')
  addCondition(description, values, reasons, 'CHARGE', /(?:\d+|\{[^}]+\})回チャージ可能|チャージ数/, 'チャージ数の条件がある')
  addCondition(description, values, reasons, 'PHASE', /オーバードライブ|前半|後半|第\d段階/, '複数の段階・フェーズがある')
  addCondition(description, values, reasons, 'MODE', /モード|切り替|切替/, 'モード選択・切替がある')
  addCondition(description, values, reasons, 'TARGET_STATE', /状態の敵|敵が.{0,24}状態|対象が.{0,24}(?:時|場合)/s, '対象の状態による分岐がある')
  addCondition(description, values, reasons, 'DEPLOY_TIME', /配置後.{0,60}(?:秒|時間)/s, '配置後の経過時間による条件がある')
  addCondition(description, values, reasons, 'ACTIVATION_COUNT', /2回目以降|発動回数|次回発動時/, '発動回数による変化がある')

  return values.length
    ? autoField(unique(values), 'HIGH', reasons)
    : autoField([], 'MEDIUM', ['段階・条件を示す明示的な文言はない'])
}

function deriveOutputCapabilities(
  effectWindow: EffectWindowType,
  activationTrigger: ActivationTriggerType,
  damageComponents: DamageComponentType[],
  conditions: SkillConditionType[],
): { capabilities: OutputCapabilities; reasons: string[] } {
  const damage = new Set(damageComponents)
  const directComponents: DamageComponentType[] = [
    'BASIC_ATTACK_MODIFIER',
    'BURST',
    'PERIODIC',
    'DEPLOYED_OBJECT',
    'DAMAGE_OVER_TIME',
  ]
  const hasDirectDamage = directComponents.some((component) => damage.has(component))
  const hasRateBasedDamage = damage.has('BASIC_ATTACK_MODIFIER') || damage.has('PERIODIC') || damage.has('DAMAGE_OVER_TIME')
  const timedWindow = effectWindow === 'FIXED_DURATION' || effectWindow === 'AMMO'
  const steadyWindow = effectWindow === 'PERMANENT' || effectWindow === 'TOGGLE_OR_MODE'
  const requiresModeSelection = conditions.some((condition) => ['OVERCHARGE', 'PHASE', 'MODE'].includes(condition))
  const reasons: string[] = []

  if (effectWindow === 'UNKNOWN') reasons.push('効果の終了条件が未確定')
  if (activationTrigger === 'UNKNOWN') reasons.push('発動契機が未確定')
  if (damage.has('UNKNOWN')) reasons.push('ダメージ構成が未確定')
  if (damage.has('SUMMON')) reasons.push('召喚物の独立ステータス・攻撃周期が必要')
  if (requiresModeSelection) reasons.push('条件・段階ごとの計算モード選択が必要')

  return {
    capabilities: {
      canShowPerHit: hasDirectDamage,
      canShowPerActivationTotal: hasDirectDamage && effectWindow === 'NONE',
      canShowDps: hasRateBasedDamage && (timedWindow || steadyWindow),
      canShowWindowTotal: hasRateBasedDamage && timedWindow,
      canShowSteadyStateDps: hasRateBasedDamage && steadyWindow,
      requiresModeSelection,
      requiresManualModel: reasons.length > 0,
    },
    reasons,
  }
}

function autoField<T>(value: T, confidence: ClassificationConfidence, reasons: string[]): ClassifiedField<T> {
  return { value, confidence, reasons, source: 'AUTO' }
}

function manualField<T extends string>(
  value: T,
  automaticValue: T,
  labels: Record<T, string>,
): ClassifiedField<T> {
  return {
    value,
    confidence: 'HIGH',
    reasons: [`手動指定（自動判定: ${labels[automaticValue]}）`],
    source: 'MANUAL',
    automaticValue,
  }
}

function manualArrayField<T extends string>(
  value: T[],
  automaticValue: T[],
  labels: Record<T, string>,
): ClassifiedField<T[]> {
  const automaticLabel = automaticValue.length ? automaticValue.map((item) => labels[item]).join('・') : 'なし'
  return {
    value,
    confidence: 'HIGH',
    reasons: [`手動指定（自動判定: ${automaticLabel}）`],
    source: 'MANUAL',
    automaticValue,
  }
}

function addCondition(
  description: string,
  values: SkillConditionType[],
  reasons: string[],
  type: SkillConditionType,
  pattern: RegExp,
  reason: string,
) {
  if (!pattern.test(description)) return
  values.push(type)
  reasons.push(reason)
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

function normalizeDescription(value: string): string {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/\\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
