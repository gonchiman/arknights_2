import type { SkillRecord } from '../types/skill.ts'
import { buildGoldenglowCombinedAttackTable, summarizeGoldenglowCombinedAttackTable } from './goldenglowCombinedAttackTable.ts'
import {
  buildGoldenglowFirstExplosionDistribution,
  calculateGoldenglowExplosionDamage,
  GOLDENGLOW_OPERATOR_ID,
} from './goldenglowExplosion.ts'
import { deriveGoldenglowGuideSkills, type GoldenglowGuideSkill } from './goldenglowGuideSkill.ts'
import { getOperatorModuleId, getOperatorModuleLevels, getOperatorModules, isOperatorModuleUnlocked } from './operatorModules.ts'

export interface GoldenglowComparisonBuild {
  id: string
  moduleId: string
  moduleLevel: number
  potential: number
}

export interface GoldenglowPerformanceComparisonValue {
  resistance: number
  expectedTotalDamage: number | null
  expectedBodyDamage: number | null
  expectedDroneNormalDamage: number | null
  expectedExplosionDamage: number | null
}

export interface GoldenglowPerformanceComparisonColumn {
  build: GoldenglowComparisonBuild
  skill: GoldenglowGuideSkill | null
  values: GoldenglowPerformanceComparisonValue[]
}

export const DEFAULT_GOLDENGLOW_RESISTANCE_STEP = 20

/** Always includes both endpoints, even when the step does not divide 100. */
export function buildGoldenglowResistanceValues(step = DEFAULT_GOLDENGLOW_RESISTANCE_STEP): number[] {
  const increment = Number.isInteger(step) && step >= 1 && step <= 100
    ? step : DEFAULT_GOLDENGLOW_RESISTANCE_STEP
  const values = Array.from({ length: Math.ceil(100 / increment) }, (_, index) => index * increment)
  return [...values, 100]
}

/**
 * Compares the explosion analysis page's full-attack totals on one continuous
 * target. S2 uses a finite viewing window; S1 and S3 use their skill duration.
 * Unavailable builds remain visible as null columns rather than falling back
 * to an unequipped module or a different potential rank.
 */
export function buildGoldenglowPerformanceComparison(
  records: readonly SkillRecord[],
  builds: readonly GoldenglowComparisonBuild[],
  skillIndex: number,
  skillLevelIndex?: number,
  viewingDuration = 30,
  resistanceStep = DEFAULT_GOLDENGLOW_RESISTANCE_STEP,
): GoldenglowPerformanceComparisonColumn[] {
  const resistances = buildGoldenglowResistanceValues(resistanceStep)
  return buildGoldenglowPerformanceColumns(
    records, builds, skillIndex, skillLevelIndex, viewingDuration, () => resistances,
  )
}

/** Calculates one exact resistance without snapping to the table or heatmap intervals. */
export function buildGoldenglowPerformanceAtResistance(
  records: readonly SkillRecord[],
  builds: readonly GoldenglowComparisonBuild[],
  skillIndex: number,
  skillLevelIndex?: number,
  viewingDuration = 30,
  resistance = 0,
): GoldenglowPerformanceComparisonColumn[] {
  if (!Number.isFinite(resistance) || resistance < 0 || resistance > 100) return []
  return buildGoldenglowPerformanceColumns(
    records, builds, skillIndex, skillLevelIndex, viewingDuration, () => [resistance],
  )
}

/**
 * Every damage component shares arts mitigation, with no resistance-dependent
 * attack probabilities. Its exact curve changes slope only when resistance
 * starts to exceed the fixed ignore or reaches the 5% damage floor.
 */
export function buildGoldenglowPerformanceCurve(
  records: readonly SkillRecord[],
  builds: readonly GoldenglowComparisonBuild[],
  skillIndex: number,
  skillLevelIndex?: number,
  viewingDuration = 30,
): GoldenglowPerformanceComparisonColumn[] {
  return buildGoldenglowPerformanceColumns(
    records, builds, skillIndex, skillLevelIndex, viewingDuration, (skill) => {
      if (!skill) return [0, 100]
      const ignore = skill.explosionModel.resistanceIgnoreFixed
      return [...new Set([0, 100, ignore, ignore + 95]
        .filter(Number.isFinite)
        .map((resistance) => Math.max(0, Math.min(100, resistance))))]
        .sort((a, b) => a - b)
    },
  )
}

function buildGoldenglowPerformanceColumns(
  records: readonly SkillRecord[],
  builds: readonly GoldenglowComparisonBuild[],
  skillIndex: number,
  skillLevelIndex: number | undefined,
  viewingDuration: number,
  selectResistances: (skill: GoldenglowGuideSkill | null) => readonly number[],
): GoldenglowPerformanceComparisonColumn[] {
  const record = records.find((candidate) => candidate.operatorId === GOLDENGLOW_OPERATOR_ID
    && candidate.skillIndex === skillIndex)
  return builds.map((build) => {
    const skill = record && [1, 2, 3].includes(skillIndex)
      && hasAvailableModule(record, build)
      ? deriveGoldenglowGuideSkills([record], build.moduleId, build.moduleLevel, skillLevelIndex, build.potential)[0] ?? null
      : null
    const duration = skill?.duration ?? viewingDuration
    const canCalculate = skill !== null && Number.isFinite(duration) && duration >= 0
      && (skill.skillIndex !== 2 || duration <= 600)
      && buildGoldenglowFirstExplosionDistribution(skill.explosionModel).length > 0

    return {
      build,
      skill,
      values: selectResistances(canCalculate ? skill : null).map((resistance) => {
        if (!canCalculate || !skill) return {
          resistance,
          expectedTotalDamage: null,
          expectedBodyDamage: null,
          expectedDroneNormalDamage: null,
          expectedExplosionDamage: null,
        }
        const explosionDamage = calculateGoldenglowExplosionDamage(
          skill.effectiveAttack, 0, resistance, skill.explosionModel,
        ).damageAfterMitigation
        const attacks = buildGoldenglowCombinedAttackTable({
          model: skill.explosionModel,
          skillIndex: skill.skillIndex,
          attack: skill.effectiveAttack,
          attackInterval: skill.attackInterval,
          duration,
          resistance,
          resistanceIgnore: skill.explosionModel.resistanceIgnoreFixed,
          explosionDamage,
        })
        const summary = summarizeGoldenglowCombinedAttackTable(attacks, duration)
        return {
          resistance,
          expectedTotalDamage: summary.expectedTotalDamage,
          expectedBodyDamage: summary.expectedBodyDamage,
          expectedDroneNormalDamage: summary.expectedDroneNormalDamage,
          expectedExplosionDamage: summary.expectedExplosionDamage,
        }
      }),
    }
  })
}

/** Exports spreadsheet values without locale-dependent decimal separators. */
export function buildGoldenglowPerformanceComparisonTsv(columns: readonly {
  label: string
  values: readonly { resistance: number; expectedTotalDamage: number | null }[]
}[], showDecimals = true): string {
  if (columns.length === 0) return ''
  const valuesByResistance = columns.map((column) => new Map(
    column.values.map((row) => [row.resistance, row.expectedTotalDamage]),
  ))
  const rows = [
    ['敵の術耐性', ...columns.map((column) => sanitizeComparisonTsvLabel(column.label))],
    ...columns[0].values.map(({ resistance }) => [
      formatComparisonTsvNumber(resistance),
      ...valuesByResistance.map((values) => formatComparisonTsvNumber(values.get(resistance), showDecimals)),
    ]),
  ]
  return rows.map((row) => row.join('\t')).join('\r\n')
}

const comparisonTsvNumberFormat = new Intl.NumberFormat('en-US', {
  useGrouping: false,
  maximumFractionDigits: 3,
})
const comparisonTsvIntegerFormat = new Intl.NumberFormat('en-US', {
  useGrouping: false,
  maximumFractionDigits: 0,
})

function formatComparisonTsvNumber(value: number | null | undefined, showDecimals = true): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return ''
  const formatted = (showDecimals ? comparisonTsvNumberFormat : comparisonTsvIntegerFormat).format(value)
  if (formatted === '-0') return '0'
  const [integer, fraction] = formatted.split('.')
  if (!fraction) return integer
  // Only generated integers and division enter the formula; labels stay text.
  const numerator = `${integer}${fraction}`.replace(/^(-?)0+(?=\d)/, '$1')
  return `=${numerator}/${10 ** fraction.length}`
}

function sanitizeComparisonTsvLabel(label: string): string {
  const sanitized = label.replace(/[\t\r\n]+/g, ' ')
  return /^\s*[=+\-@]/.test(sanitized) ? `'${sanitized}` : sanitized
}

function hasAvailableModule(record: SkillRecord, build: GoldenglowComparisonBuild): boolean {
  if (!Number.isInteger(build.moduleLevel) || build.moduleLevel < 1 || build.moduleLevel > 3) return false
  if (!build.moduleId) return true
  const module = getOperatorModules(record.operatorProfile).find((candidate, index) => (
    getOperatorModuleId(candidate, index) === build.moduleId
  ))
  return Boolean(module && getOperatorModuleLevels(module).includes(build.moduleLevel)
    && isOperatorModuleUnlocked(module, 2, record.operatorProfile.phases[2]?.maxLevel ?? 0))
}
