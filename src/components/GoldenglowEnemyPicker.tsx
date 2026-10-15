import { EnemyPicker, type EnemyPickerProps } from './EnemyPicker'

/** GG retains its original columns, filters and selection behavior. */
export function GoldenglowEnemyPicker(props: Omit<EnemyPickerProps, 'variant' | 'getSelectDisabledReason'>) {
  return <EnemyPicker {...props} />
}
