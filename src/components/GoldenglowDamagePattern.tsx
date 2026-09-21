import { useId } from 'react'
import type { HpDamageBreakdown } from '../lib/goldenglowTargetSwitchHpBreakdown'

type DamageComponentKey = keyof HpDamageBreakdown

interface DamagePatternProps {
  idPrefix: string
  color: string
}

/** Shared SVG texture geometry for chart bars, legends and exported images. */
export function GoldenglowDamagePatternDefs({ idPrefix, color }: DamagePatternProps) {
  return <defs>
    <pattern id={`${idPrefix}-explosionDamage`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="6" height="6" fill={color} />
      <path d="M0 0V6 M6 0V6" stroke="var(--surface)" strokeWidth="2.1" strokeOpacity="0.7" />
    </pattern>
    <pattern id={`${idPrefix}-bodyDamage`} width="6" height="6" patternUnits="userSpaceOnUse">
      <rect width="6" height="6" fill={color} />
      <circle cx="3" cy="3" r="1.3" fill="var(--surface)" fillOpacity="0.7" />
    </pattern>
  </defs>
}

export function getGoldenglowDamagePatternFill(componentKey: DamageComponentKey, idPrefix: string, color: string): string {
  return componentKey === 'normalDamage' ? color : `url(#${idPrefix}-${componentKey})`
}

export function GoldenglowDamagePatternSwatch({
  componentKey, color = 'var(--text-muted)', className, width = 24, height = 12,
}: {
  componentKey: DamageComponentKey
  color?: string
  className?: string
  width?: number
  height?: number
}) {
  const idPrefix = `gg-damage-swatch-${useId()}`
  return <svg className={className} width={width} height={height} aria-hidden="true">
    {componentKey !== 'normalDamage' && <GoldenglowDamagePatternDefs idPrefix={idPrefix} color={color} />}
    <rect x="1" y="1" width={Math.max(0, width - 2)} height={Math.max(0, height - 2)}
      fill={getGoldenglowDamagePatternFill(componentKey, idPrefix, color)} />
  </svg>
}
