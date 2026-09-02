export const DEFAULT_DAMAGE_CALCULATOR_OPERATOR_NAME = 'ゴールデングロー'

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
