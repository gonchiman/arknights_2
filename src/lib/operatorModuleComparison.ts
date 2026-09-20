import type { OperatorCombatProfile, RawOperatorModule } from '../types/skill'
import {
  applyOperatorModule,
  getOperatorModuleId,
  getOperatorModuleLevels,
  getOperatorModules,
  getOperatorModuleTypeLabel,
  type OperatorModuleApplication,
} from './operatorModules.ts'
import { getOperatorPassives, type OperatorPassives } from './operatorProfile.ts'
import {
  removePotentialBonusAnnotations,
  splitOperatorEffectChanges,
  type EffectChangeSegment,
} from './operatorEffectHighlights.ts'
import {
  getOperatorPotentialApplication,
  type OperatorPotentialApplication,
} from './operatorPotentials.ts'

export interface OperatorModuleComparisonCell {
  text: string
  baseline: string | null
  highlights?: {
    segments: EffectChangeSegment[]
    base: string
    withoutModule: string
    withoutPotential: string
    current: string
  }
}

export interface OperatorModuleComparisonColumn {
  id: string
  name: string
  typeLabel: string | null
  level: number | null
  available: boolean
}

export interface OperatorModuleComparisonRow {
  id: string
  label: string
  name?: string
  kind: 'attribute' | 'trait' | 'talent' | 'extra'
  cells: OperatorModuleComparisonCell[]
}

export interface OperatorModuleComparison {
  level: number | null
  levels: number[]
  potentialRank: number
  potentialRanks: number[]
  potentialEffects: string[]
  condition: string
  columns: OperatorModuleComparisonColumn[]
  rows: OperatorModuleComparisonRow[]
}

const ATTRIBUTE_ORDER = [
  'max_hp', 'atk', 'def', 'magic_resistance', 'attack_speed', 'cost', 'respawn_time', 'block_cnt',
]
const EMPTY = '—'
const MISSING = 'データなし'

/** Compare modules at the operator's final promotion and a shared potential. */
export function buildOperatorModuleComparison(
  profile: OperatorCombatProfile,
  requestedLevel: number | null,
  requestedPotentialRank = 1,
): OperatorModuleComparison {
  const current = buildRawOperatorModuleComparison(profile, requestedLevel, requestedPotentialRank)
  const minimum = current.potentialRank === 1
    ? current
    : buildRawOperatorModuleComparison(profile, current.level, 1)
  const minimumRows = new Map(minimum.rows.map((row) => [row.id, row]))
  const minimumColumnIndices = new Map(minimum.columns.map((column, index) => [column.id, index]))

  return {
    ...current,
    rows: current.rows.map((row) => ({
      ...row,
      cells: row.cells.map((entry, columnIndex) => {
        const column = current.columns[columnIndex]
        const minimumRow = minimumRows.get(row.id)
        const minimumColumnIndex = minimumColumnIndices.get(column.id)
        const previous = minimumColumnIndex === undefined ? undefined : minimumRow?.cells[minimumColumnIndex]
        const includeTalentName = row.kind === 'talent'
          && Boolean(row.name && entry.baseline?.startsWith(`${row.name}：`))
        const base = comparisonDescription(minimumRow, minimumRow?.cells[0], includeTalentName)
        const rawWithoutModule = comparisonDescription(row, row.cells[0], includeTalentName)
        const withoutPotential = comparisonDescription(minimumRow, previous, includeTalentName)
        const withoutModule = removePotentialBonusAnnotations(rawWithoutModule, base)
        const normalizedCurrent = removePotentialBonusAnnotations(entry.text, withoutPotential)
        const descriptions = { base, withoutModule, withoutPotential, current: normalizedCurrent }
        const unknownBaseline = minimumColumnIndex === undefined
          || !minimum.columns[minimumColumnIndex].available
          || previous?.text === MISSING
        const unavailable = !column.available || isEmptyDescription(entry.text)

        let segments: EffectChangeSegment[]
        if (unavailable || unknownBaseline) {
          segments = [{ text: normalizedCurrent, source: null }]
        } else if (row.kind === 'attribute') {
          // These values are the module's own bonuses, never the operator's potential stats.
          segments = [{ text: normalizedCurrent, source: columnIndex === 0 ? null : 'module' }]
        } else {
          segments = splitOperatorEffectChanges(descriptions)
        }
        return { ...entry, highlights: { ...descriptions, segments } }
      }),
    })),
  }
}

/** Retain source descriptions separately from the normalized display and attribution. */
function buildRawOperatorModuleComparison(
  profile: OperatorCombatProfile,
  requestedLevel: number | null,
  requestedPotentialRank: number,
): OperatorModuleComparison {
  const phaseIndex = Math.max(0, profile.phases.length - 1)
  const operatorLevel = Math.max(1, profile.phases[phaseIndex]?.maxLevel ?? 1)
  const potential = getOperatorPotentialApplication(profile, requestedPotentialRank)
  const { potentialRank } = potential
  const potentialRanks = Array.from({ length: potential.maxPotentialRank }, (_, index) => index + 1)
  const basePassives = getOperatorPassives(profile, phaseIndex, operatorLevel, potentialRank)
  const baseTalents = basePassives.sources.filter((source) => (
    source.sourceKind === 'TALENT' && source.talentIndex !== null
  ))
  const modules = getOperatorModules(profile)
  const moduleLevels = modules.map((module) => getOperatorModuleLevels(module)
    .filter((level) => Number.isInteger(level) && level > 0))
  const levels = [...new Set(moduleLevels.flat())].sort((a, b) => a - b)
  const level = requestedLevel !== null && Number.isFinite(requestedLevel)
    ? nearestLevel(levels, requestedLevel) ?? levels[0] ?? null
    : levels.at(-1) ?? null
  const columns: OperatorModuleComparisonColumn[] = [{
    id: 'none', name: 'モジュールなし', typeLabel: null, level: null, available: true,
  }]
  const applications: Array<OperatorModuleApplication | null> = []

  modules.forEach((module, index) => {
    const actualLevel = level === null ? null : nearestLevel(moduleLevels[index], level)
    const application = actualLevel === null ? null : applyOperatorModule(
      indexBaseTalents(basePassives),
      separateAdditionalTalents(module, basePassives),
      actualLevel,
      potentialRank,
    )
    // A named module without any effect records must not look like a known, unchanged module.
    const available = Boolean(application && (
      application.attributeEffects.length > 0 || application.changes.length > 0
    ))
    columns.push({
      id: getOperatorModuleId(module, index),
      name: cleanText(module.uniEquipName ?? '名称なし'),
      typeLabel: getOperatorModuleTypeLabel(module),
      level: actualLevel,
      available,
    })
    applications.push(available ? application : null)
  })

  const rows: OperatorModuleComparisonRow[] = []
  const attributes = new Map(applications.flatMap((application) => (
    application?.attributeEffects.map((effect) => [effect.key, effect.label] as const) ?? []
  )))
  const attributeKeys = [...attributes.keys()].sort((a, b) => {
    const aIndex = ATTRIBUTE_ORDER.indexOf(a)
    const bIndex = ATTRIBUTE_ORDER.indexOf(b)
    return (aIndex < 0 ? ATTRIBUTE_ORDER.length : aIndex)
      - (bIndex < 0 ? ATTRIBUTE_ORDER.length : bIndex)
  })
  for (const key of attributeKeys) {
    rows.push({
      id: `attribute:${key}`,
      label: attributes.get(key)!,
      kind: 'attribute',
      cells: [cell(EMPTY), ...applications.map((application) => cell(application
        ? application.attributeEffects.find((effect) => effect.key === key)?.valueLabel ?? EMPTY
        : MISSING))],
    })
  }

  if (basePassives.traitDescription || applications.some((application) => application?.passives.traitDescription)) {
    const original = basePassives.traitDescription
    rows.push({
      id: 'trait', label: '特性', kind: 'trait',
      cells: [cell(original || EMPTY), ...applications.map((application) => {
        if (!application) return cell(MISSING)
        const description = application.passives.traitDescription
        return cell(description || EMPTY, description && description !== original ? original : null)
      })],
    })
  }

  for (const talent of baseTalents) {
    const original = talent.description
    rows.push({
      id: `talent:${talent.talentIndex}`,
      label: `素質${talent.talentIndex! + 1}`,
      name: talent.sourceName,
      kind: 'talent',
      cells: [cell(original || EMPTY), ...applications.map((application) => {
        if (!application) return cell(MISSING)
        const source = application.passives.sources.find((candidate) => (
          candidate.sourceKind === 'TALENT' && candidate.talentIndex === talent.talentIndex
        ))
        const description = source?.description ?? original
        const renamed = source && source.sourceName !== talent.sourceName
        const text = renamed ? `${source.sourceName}：${description}` : description
        const baseline = renamed ? `${talent.sourceName}：${original}` : original
        return cell(text || EMPTY, text !== baseline ? baseline : null)
      })],
    })
  }

  // Token and module-only effects are independent of the operator's numbered talents.
  applications.forEach((application, moduleIndex) => {
    const extras = application?.changes.filter((change) => (
      change.kind === 'TOKEN' || (change.kind === 'TALENT' && change.talentIndex === null)
    )) ?? []
    const occurrences = new Map<string, number>()
    extras.forEach((change) => {
      const label = change.kind === 'TOKEN' ? '召喚物' : '追加効果'
      // Inserting a newly unlocked effect must not pair all subsequent rows with the wrong effect.
      const identity = `${change.kind}:${change.label}`
      const occurrence = occurrences.get(identity) ?? 0
      occurrences.set(identity, occurrence + 1)
      rows.push({
        id: `extra:${columns[moduleIndex + 1].id}:${identity}:${occurrence}`,
        label,
        ...(change.label && change.label !== label ? { name: change.label } : {}),
        kind: 'extra',
        cells: columns.map((column, columnIndex) => {
          if (!column.available) return cell(MISSING)
          return columnIndex === moduleIndex + 1
            ? cell(change.description || '追加効果あり', '')
            : cell(EMPTY)
        }),
      })
    })
  })

  if (rows.length === 0 && modules.length > 0) {
    rows.push({
      id: 'effect-data', label: '効果', kind: 'extra',
      cells: columns.map((column) => cell(column.available ? EMPTY : MISSING)),
    })
  }

  return {
    level,
    levels,
    potentialRank,
    potentialRanks,
    potentialEffects: summarizePotentialEffects(profile, potential),
    condition: `昇進${phaseIndex}・潜在${potentialRank}`,
    columns,
    rows,
  }
}

function isEmptyDescription(text: string): boolean {
  return !text || text === EMPTY || text === MISSING
}

function comparisonDescription(
  row: OperatorModuleComparisonRow | undefined,
  entry: OperatorModuleComparisonCell | undefined,
  includeTalentName: boolean,
): string {
  if (!entry || isEmptyDescription(entry.text)) return ''
  if (includeTalentName && row?.kind === 'talent' && row.name
    && !entry.baseline?.startsWith(`${row.name}：`)) {
    return `${row.name}：${entry.text}`
  }
  return entry.text
}

/** Common potential bonuses stay separate from the module-only attribute rows. */
function summarizePotentialEffects(
  profile: OperatorCombatProfile,
  potential: OperatorPotentialApplication,
): string[] {
  const totals = new Map<string, { label: string; value: number }>()
  const descriptions = new Set<string>()
  const ranks = profile.potentialRanks?.slice(0, potential.requiredPotentialRank) ?? []
  ranks.forEach((rank, index) => {
    const modifiers = rank.buff?.attributes?.attributeModifiers ?? []
    const effects = potential.effects.filter((effect) => effect.potentialRank === index + 2)
    const canCombine = modifiers.length > 0 && effects.length === modifiers.length
      && effects.every((effect, effectIndex) => (
        effect.status !== 'UNSUPPORTED'
        && effect.formulaItem === 'ADDITION'
        && effect.value !== null
        && !modifiers[effectIndex].loadFromBlackboard
        && !modifiers[effectIndex].fetchBaseValueFromSourceEntity
      ))
    if (!canCombine) {
      const description = cleanText(rank.description ?? '')
      if (description) descriptions.add(description)
      return
    }
    for (const effect of effects) {
      const previous = totals.get(effect.attributeType)
      totals.set(effect.attributeType, {
        label: effect.label,
        value: (previous?.value ?? 0) + effect.value!,
      })
    }
  })
  return [
    ...[...totals].filter(([, effect]) => effect.value !== 0).map(([type, effect]) => {
      const value = Math.round(effect.value * 10000) / 10000
      const suffix = type === 'RESPAWN_TIME' ? '秒' : ''
      return `${effect.label}${value >= 0 ? '+' : ''}${value}${suffix}`
    }),
    ...descriptions,
  ]
}

function cell(text: string, baseline: string | null = null): OperatorModuleComparisonCell {
  return { text, baseline }
}

function nearestLevel(levels: number[], requested: number): number | null {
  return levels.filter((level) => level <= requested).at(-1) ?? null
}

/** getOperatorPassives omits hidden slots in its display array; source indices remain stable. */
function indexBaseTalents(passives: OperatorPassives): OperatorPassives {
  const indexed: OperatorPassives['talents'] = []
  for (const source of passives.sources) {
    if (source.sourceKind !== 'TALENT' || source.talentIndex === null) continue
    indexed[source.talentIndex] = { name: source.sourceName, description: source.description }
  }
  return { ...passives, talents: indexed }
}

/** A new numbered talent without an original source is an addition, not a base talent override. */
function separateAdditionalTalents(module: RawOperatorModule, passives: OperatorPassives): RawOperatorModule {
  const baseSources = passives.sources.filter((source) => source.sourceKind === 'TALENT')
  return {
    ...module,
    phases: module.phases?.map((phase) => ({
      ...phase,
      parts: phase.parts?.map((part) => {
        if (!part.addOrOverrideTalentDataBundle?.candidates) return part
        return {
          ...part,
          addOrOverrideTalentDataBundle: {
            ...part.addOrOverrideTalentDataBundle,
            candidates: part.addOrOverrideTalentDataBundle.candidates.flatMap((candidate) => {
              const baseSource = typeof candidate.talentIndex === 'number'
                ? baseSources.find((source) => source.talentIndex === candidate.talentIndex)
                : baseSources.find((source) => (
                    (candidate.prefabKey && source.prefabKey === candidate.prefabKey)
                    || (candidate.name && source.sourceName === cleanText(candidate.name))
                  ))
              const additional = !part.isToken && (candidate.isHideTalent || !baseSource)
              const description = candidate.upgradeDescription ?? candidate.description
              // These are calculation records; without prose they would expose internal blackboard keys.
              if ((additional || part.isToken) && !cleanText(description ?? '')) return []
              return [{
                ...candidate,
                ...(additional ? { isHideTalent: true } : {}),
              }]
            }),
          },
        }
      }),
    })),
  }
}

function cleanText(text: string): string {
  return text.replace(/<[^>]+>/g, '').replace(/\\n|\s+/g, ' ').trim()
}
