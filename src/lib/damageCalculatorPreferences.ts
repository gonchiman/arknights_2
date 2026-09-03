export const DEFAULT_DAMAGE_CALCULATOR_OPERATOR_NAME = 'ゴールデングロー'
const DEFAULT_OPERATOR_STORAGE_KEY = 'arknights-damage-calculator-default-operator-id-v1'

interface DamageCalculatorOperatorOption {
  operatorId: string
  operatorName: string
}

export function resolveDamageCalculatorDefaultOperatorId(
  operators: readonly DamageCalculatorOperatorOption[],
  preferredOperatorId: string,
): string {
  if (operators.some((operator) => operator.operatorId === preferredOperatorId)) {
    return preferredOperatorId
  }

  return operators.find((operator) => (
    operator.operatorName === DEFAULT_DAMAGE_CALCULATOR_OPERATOR_NAME
  ))?.operatorId
    ?? operators[0]?.operatorId
    ?? ''
}

export function loadPreferredDefaultOperatorId(): string {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(DEFAULT_OPERATOR_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

export function persistPreferredDefaultOperatorId(operatorId: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(DEFAULT_OPERATOR_STORAGE_KEY, operatorId)
  } catch {
    // ストレージが利用できない場合も、現在の画面では設定を反映する。
  }
}
