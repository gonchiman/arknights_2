import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const array = value => Array.isArray(value) ? value : []
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0
const sorted = values => [...new Set(values)].sort(compare)
const pointer = parts => `/${parts.map(part => String(part).replaceAll('~', '~0').replaceAll('/', '~1')).join('/')}`
const sha256 = value => createHash('sha256').update(value).digest('hex')
const branchParameter = key => typeof key === 'string' && /branch/i.test(key)

function walk(value, path, visit, context = {}) {
  if (record(value)) {
    // False wrappers contain stale values, not active parameters.
    if (value.m_defined === false) return
    const ownerId = value.inst?.characterKey ?? value.characterKey ?? context.ownerId
    context = { ...context, ...(ownerId ? { ownerId } : {}),
      ...(typeof value.alias === 'string' ? { ownerAlias: value.alias } : {}) }
    visit(value, path, context)
  } else if (Array.isArray(value)) visit(value, path, context)
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      walk(child, [...path, Array.isArray(value) ? Number(key) : key], visit, context)
    }
  }
}

function archiveData(archive, label) {
  const maps = archive?.files?.['maps/index.json']
  const histogram = archive?.files?.['enemy-histogram-counts.json']
  if (!Array.isArray(maps?.maps) || !Array.isArray(histogram?.diagnostics?.excludedLevels)
    || !Array.isArray(histogram?.diagnostics?.excludedLevelIds)) throw new Error(`Invalid ${label} archive`)
  const byId = new Map(maps.maps.map(map => [map.levelId, map]))
  if (byId.size !== maps.maps.length) throw new Error(`Duplicate level ID in ${label} maps index`)
  return { versionId: archive.versionId, maps, byId, histogram,
    excluded: new Map(histogram.diagnostics.excludedLevels.map(entry => [entry.levelId, entry.reasons])),
    scopeExcluded: new Set(histogram.diagnostics.excludedLevelIds) }
}

function enemyDatabase(value) {
  const entries = value?.enemies ?? value
  const path = value?.enemies ? ['database', 'enemies'] : ['database']
  return new Map(Array.isArray(entries) ? entries.map((entry, index) => [entry.Key ?? entry.key,
    { rows: entry.Value ?? entry.value, path: [...path, index, 'Value' in entry ? 'Value' : 'value'] }])
    : Object.entries(record(entries) ? entries : {}).map(([id, rows]) => [id, { rows, path: [...path, id] }]))
}

/** These are literal source references. They are not a claim that the caller runs. */
function collectReferences(value, path, branchIds, context, output) {
  walk(value, path, (object, location, inherited) => {
    const blackboardEntry = typeof object.key === 'string' && typeof object.valueStr === 'string'
    for (const [field, target] of Object.entries(object)) {
      if (typeof target !== 'string') continue
      const key = blackboardEntry && field === 'valueStr' ? object.key : field
      const isParameter = branchParameter(key)
      if (!branchIds.has(target) && !(isParameter && target)) continue
      const classification = isParameter ? context.kind : 'untyped-string-match'
      output.push({ classification, source: context.source, sourcePath: pointer([...location, field]),
        ownerId: inherited.ownerId ?? context.ownerId ?? null,
        ...(inherited.ownerAlias ? { ownerAlias: inherited.ownerAlias } : {}),
        key, target, branchId: branchIds.has(target) ? target : null,
        certainty: isParameter ? 'parameter-reference-only' : 'string-equality-only',
        applicability: context.applicability ?? 'execution-not-evaluated' })
    }
  }, context)
}

function buffCatalog(templates) {
  const result = []
  for (const [id, template] of Object.entries(templates ?? {}).sort(([a], [b]) => compare(a, b))) {
    walk(template, [id], (object, path) => {
      if (typeof object.$type !== 'string' || !/branch/i.test(object.$type)) return
      const eventIndex = path.indexOf('eventToActions')
      // Keep primitive node parameters; nested buffs stay accessible through their source pointer.
      const parameters = Object.fromEntries(Object.entries(object).filter(([key, value]) => key !== '$type'
        && (value === null || ['string', 'number', 'boolean'].includes(typeof value))))
      result.push({ templateId: id, sourcePath: pointer(path), nodeType: object.$type,
        event: eventIndex < 0 ? null : path[eventIndex + 1], parameters,
        certainty: 'node-definition-only' })
    })
  }
  return result
}

function sourceKind(root, path) {
  if (root === 'predefines' || root === 'hardPredefines') return 'predefined-parameter'
  if (root === 'enemyDbRefs') return path.includes('skills') ? 'enemy-skill-override-parameter' : 'enemy-talent-override-parameter'
  if (root === 'runes' || root === 'optionalRunes') return 'rune-parameter'
  if (root === 'mapData') return 'tile-parameter'
  if (root === 'waves' || root === 'branches') return 'wave-or-branch-script-parameter'
  return 'other-level-parameter'
}

function analyzeMap(level, levelIndex, summary, current, baseline, source, database, catalog) {
  const levelId = summary.levelId
  const rawBranches = record(level?.branches) ? level.branches : {}
  const branchIds = new Set(Object.keys(rawBranches))
  const references = []
  const environments = []
  const callerIds = new Set()
  const structuralProblems = []
  const levelPath = ['levels', levelIndex, 1]
  if (!level) structuralProblems.push('source-level-missing')
  if (level && !record(level.branches)) structuralProblems.push('invalid-branches')

  // Scan local data one owner/section at a time so ownership cannot leak to a sibling.
  for (const [root, value] of Object.entries(level ?? {})) {
    if (root === 'enemyDbRefs') {
      for (const [index, ref] of array(value).entries()) {
        if (typeof ref?.id !== 'string') continue
        callerIds.add(ref.id)
        const origin = [...levelPath, root, index]
        for (const [field, override] of Object.entries(ref.overwrittenData ?? {})) {
          collectReferences(override, [...origin, 'overwrittenData', field], branchIds,
            { source: 'source', kind: field === 'skills' ? 'enemy-skill-override-parameter' : 'enemy-talent-override-parameter',
              ownerId: ref.id, applicability: 'override-execution-not-evaluated' }, references)
        }
        // Base and selected rows are candidates only: runtime merge/skill activation is deliberately not guessed.
        const databaseEntry = database.get(ref.id)
        const rows = array(databaseEntry?.rows)
        for (const [rowIndex, row] of rows.entries()) {
          if (row?.level !== 0 && row?.level !== ref.level) continue
          collectReferences(row.enemyData, [...databaseEntry.path, rowIndex, 'enemyData'], branchIds,
            { source: 'source', kind: 'enemy-database-parameter', ownerId: ref.id,
              applicability: 'base-or-selected-row-override-precedence-unverified' }, references)
        }
      }
    } else {
      // Never treat the declaration's branch ID itself as a caller reference.
      const scan = (entry, path) => collectReferences(entry, path, branchIds,
        { source: 'source', kind: sourceKind(root, path) }, references)
      if (root === 'branches') {
        for (const [id, branch] of Object.entries(rawBranches)) scan(branch, [...levelPath, root, id])
      } else scan(value, [...levelPath, root])
      if (root === 'predefines' || root === 'hardPredefines') {
        walk(value, [...levelPath, root], (object, path) => {
          const id = object.inst?.characterKey
          if (typeof id !== 'string') return
          callerIds.add(id)
          const character = source.character?.[id]
          collectReferences(character?.talents, ['character', id, 'talents'], branchIds,
            { source: 'source', kind: 'character-talent-parameter', ownerId: id,
              applicability: 'talent-unlock-and-override-precedence-unverified' }, references)
          const skill = array(character?.skills)[object.skillIndex]
          const skillId = skill?.skillId
          const skillLevel = Number.isSafeInteger(object.mainSkillLvl) ? object.mainSkillLvl - 1 : -1
          if (skillId && skillLevel >= 0) collectReferences(source.skill?.[skillId]?.levels?.[skillLevel],
            ['skill', skillId, 'levels', skillLevel], branchIds,
            { source: 'source', kind: 'character-skill-parameter', ownerId: id,
              applicability: 'selected-skill-activation-and-overrides-unverified' }, references)
        })
      }
      if (root === 'runes' || root === 'optionalRunes') {
        walk(value, [...levelPath, root], (object, path) => {
          if (object.key !== 'env_system_new') return
          for (const [index, parameter] of array(object.blackboard).entries()) {
            if (parameter?.key === 'key' && typeof parameter.valueStr === 'string') environments.push({
              id: parameter.valueStr, sourcePath: pointer([...path, 'blackboard', index, 'valueStr']),
              difficultyMask: object.difficultyMask ?? null, certainty: 'environment-presence-only' })
          }
        })
      }
    }
  }
  // Shared database/skill references may occur in several predefines. Keep local duplicates but deduplicate identical source pointers.
  const uniqueReferences = [...new Map(references.map(ref => [JSON.stringify(ref), ref])).values()]
    .sort((a, b) => compare(a.sourcePath, b.sourcePath) || compare(a.classification, b.classification))
  const policyEntries = [
    ...array(summary.omittedBranchSpawns).map(entry => ({ ...entry, disposition: entry.kind === 'non-enemy' ? 'non-enemy' : 'optional-omitted' })),
    ...array(summary.countedBranchSpawns).map(entry => ({ ...entry, disposition: 'mandatory-counted' })),
  ]
  const branches = Object.entries(rawBranches).sort(([a], [b]) => compare(a, b)).map(([branchId, branch]) => {
    const spawnActions = []
    if (!Array.isArray(branch?.phases)) structuralProblems.push(`invalid-phases:${branchId}`)
    for (const [phaseIndex, phase] of array(branch?.phases).entries()) {
      if (!Array.isArray(phase?.actions)) structuralProblems.push(`invalid-actions:${branchId}:${phaseIndex}`)
      for (const [actionIndex, action] of array(phase?.actions).entries()) {
        if (action?.actionType !== 'SPAWN') continue
        const proof = policyEntries.find(entry => entry.branchId === branchId && entry.phaseIndex === phaseIndex
          && entry.actionIndex === actionIndex && entry.enemyId === action.key)
        spawnActions.push({ phaseIndex, actionIndex, targetId: action.key ?? null,
          targetRegistry: database.has(action.key) ? 'enemy' : source.character?.[action.key] ? 'character' : 'unknown',
          count: action.count ?? null,
          sourcePath: pointer([...levelPath, 'branches', branchId, 'phases', phaseIndex, 'actions', actionIndex]),
          action, disposition: proof?.disposition ?? 'unresolved', ...(proof ? { proof } : {}) })
      }
    }
    const refs = uniqueReferences.flatMap((ref, index) => ref.branchId === branchId ? [index] : [])
    const parameterFound = refs.some(index => uniqueReferences[index].certainty === 'parameter-reference-only')
    return { branchId, spawnActions, referenceIndexes: refs,
      callerStatus: parameterFound ? 'parameter-reference-found' : refs.length ? 'untyped-match-only' : 'no-literal-reference-found',
      holdReasons: spawnActions.some(action => action.disposition === 'unresolved') ? [
        parameterFound ? 'caller-execution-condition-and-multiplicity-unverified' : 'external-caller-or-default-binding-unresolved',
      ] : [] }
  }).filter(branch => branch.spawnActions.length)

  const buffCandidates = []
  for (const id of sorted(callerIds)) {
    const slug = /^(?:enemy|trap|char)_\d+_([^_]+)/.exec(id)?.[1]
    if (!slug) continue
    const matches = catalog.flatMap((node, index) => node.templateId.split(/[_\[\]]/).includes(slug) ? [index] : [])
    if (matches.length) buffCandidates.push({ ownerId: id, catalogIndexes: matches, certainty: 'name-affinity-only' })
  }
  const reasons = array(current.excluded.get(levelId))
  const inScope = !current.scopeExcluded.has(levelId)
  const resolved = inScope && summary.status === 'supported' && !reasons.length
  const spawningIds = new Set(branches.map(branch => branch.branchId))
  const parameterReferences = uniqueReferences.filter(ref => spawningIds.has(ref.branchId) && ref.certainty === 'parameter-reference-only')
  const classification = resolved ? 'resolved-in-archive' : parameterReferences.length ? 'parameter-binding-found'
    : environments.length ? 'environment-controller-candidate' : buffCandidates.length ? 'buff-template-name-candidate' : 'caller-unresolved'
  const signals = []
  for (const branch of branches) for (const action of branch.spawnActions) {
    if (['randomSpawnGroupKey', 'randomSpawnGroupPackKey', 'hiddenGroup'].some(key => action.action[key])
      || (typeof action.action.weight === 'number' && action.action.weight > 0)) {
      signals.push({ reason: 'random-or-selection-dependent-action', certainty: 'action-fields',
        sourcePath: action.sourcePath, branchId: branch.branchId })
    }
  }
  for (const [index, ref] of uniqueReferences.entries()) {
    if (!spawningIds.has(ref.branchId) || ref.certainty !== 'parameter-reference-only') continue
    if (/reborn|revive|mode|phase/i.test(ref.key)) signals.push({
      reason: 'state-transition-or-reappearance-trigger-unverified', certainty: 'parameter-name-only', referenceIndex: index })
  }
  for (const candidate of buffCandidates) {
    const loops = candidate.catalogIndexes.filter(index => catalog[index].parameters._isLoop === true)
    if (loops.length) signals.push({ reason: 'possible-repeating-caller-template-binding-unverified',
      certainty: 'name-affinity-only', ownerId: candidate.ownerId, catalogIndexes: loops })
    const random = candidate.catalogIndexes.filter(index => /Random/.test(catalog[index].nodeType))
    if (random.length) signals.push({ reason: 'possible-random-phase-template-binding-unverified',
      certainty: 'name-affinity-only', ownerId: candidate.ownerId, catalogIndexes: random })
  }
  for (const environment of environments) signals.push({ reason: 'environment-script-control-unverified',
    certainty: environment.certainty, ownerId: environment.id, sourcePath: environment.sourcePath })
  return {
    levelId, code: summary.code ?? null, name: summary.name ?? null, zoneId: summary.zoneId ?? null,
    zoneName: summary.zoneName ?? null, family: levelId.split('/').slice(0, 2).join('/'),
    difficulty: summary.difficulty ?? null, diffGroup: summary.diffGroup ?? null,
    sourcePath: level ? pointer(levelPath) : null, sourceSha256: level ? sha256(JSON.stringify(level)) : null,
    archiveStatus: summary.status, inScope, baselineReasons: array(baseline.excluded.get(levelId)),
    currentReasons: reasons, classification, structuralProblems: sorted(structuralProblems),
    holdReasons: resolved ? [] : sorted([
      ...branches.flatMap(branch => branch.holdReasons),
      ...reasons.filter(reason => reason !== 'branch-spawn').map(reason => `other-exclusion:${reason}`),
      ...signals.map(signal => signal.reason),
      ...(!level ? ['source-level-missing'] : []),
    ]),
    branches, references: uniqueReferences, environments, buffCandidates, signals,
  }
}

function groups(maps, keys) {
  const buckets = new Map()
  for (const map of maps) for (const key of new Set(keys(map))) {
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(map.levelId)
  }
  const byId = new Map(maps.map(map => [map.levelId, map]))
  return [...buckets].map(([id, levelIds]) => {
    const reasons = new Map()
    for (const levelId of levelIds) for (const reason of byId.get(levelId).holdReasons) reasons.set(reason, (reasons.get(reason) ?? 0) + 1)
    return { id, mapCount: levelIds.length, levelIds,
      unresolvedReasons: Object.fromEntries([...reasons].sort(([a], [b]) => compare(a, b))) }
  })
    .sort((a, b) => b.mapCount - a.mapCount || compare(a.id, b.id))
}

/** Audit a fixed baseline cohort, so newly resolved maps never disappear from the report. */
export function auditEnemyBranchMechanisms({ source, archive, baselineArchive, buffTemplates = null }) {
  if (!Array.isArray(source?.levels) || typeof source?.revision !== 'string') throw new Error('Invalid source bundle')
  const current = archiveData(archive, 'current')
  const baseline = archiveData(baselineArchive, 'baseline')
  for (const data of [current, baseline]) {
    if (data.maps.source?.revision !== source.revision) throw new Error('Source/archive revision mismatch')
  }
  const entries = new Map(source.levels.map(([id, level], index) => [id, { level, index }]))
  if (entries.size !== source.levels.length) throw new Error('Duplicate source level ID')
  const cohortIds = sorted([...baseline.excluded].filter(([, reasons]) => reasons.includes('branch-spawn')).map(([id]) => id))
  const database = enemyDatabase(source.database)
  const catalog = buffCatalog(buffTemplates)
  const maps = cohortIds.map(id => {
    const summary = current.byId.get(id)
    if (!summary) throw new Error(`Baseline map absent from current archive: ${id}`)
    return analyzeMap(entries.get(id)?.level, entries.get(id)?.index, summary, current, baseline, source, database, catalog)
  })
  const branchCurrent = sorted([...current.excluded].filter(([, reasons]) => reasons.includes('branch-spawn')).map(([id]) => id))
  const branches = maps.flatMap(map => map.branches)
  const parameterRefs = map => map.references.filter(ref => ref.certainty === 'parameter-reference-only'
    && map.branches.some(branch => branch.branchId === ref.branchId))
  return {
    schemaVersion: 1, sourceRevision: source.revision, baselineVersionId: baseline.versionId, versionId: current.versionId,
    definitions: {
      cohort: 'All baseline histogram excludedLevels whose reasons include branch-spawn; one entry per normalized levelId.',
      references: 'Literal branch parameters locate candidate callers; they do not prove execution, optionality, or call count. Base and selected enemy database rows remain candidates when overrides exist.',
      absence: 'No literal reference does not mean unused. Prefab/default bindings, environment code, and dynamic construction may call the branch.',
      buffCandidates: 'Owner/template name affinity is a research lead only, not a proved runtime binding. Catalog nodes can select routes without executing a SPAWN action.',
      proof: 'Only certificates already present in the current archive mark an action optional-omitted, non-enemy, or mandatory-counted. This audit never changes aggregation.',
      groupCounts: 'Reference, caller, environment, and family groups may overlap. Count maps by levelId, not display code.',
      unresolvedReasons: 'Group unresolvedReasons count maps with each hold reason; another mechanism on the same map may be responsible. Signals retain the source and strength of the inference.',
    },
    summary: {
      cohortMapCount: maps.length, sourceAvailableMapCount: maps.filter(map => map.sourcePath !== null).length,
      resolvedInArchiveMapCount: maps.filter(map => map.classification === 'resolved-in-archive').length,
      remainingBranchExcludedMapCount: maps.filter(map => map.currentReasons.includes('branch-spawn')).length,
      branchOnlyRemainingMapCount: maps.filter(map => map.currentReasons.length === 1 && map.currentReasons[0] === 'branch-spawn').length,
      branchPlusOtherReasonsMapCount: maps.filter(map => map.currentReasons.includes('branch-spawn') && map.currentReasons.length > 1).length,
      otherExcludedMapCount: maps.filter(map => map.archiveStatus !== 'supported' && !map.currentReasons.includes('branch-spawn')).length,
      outsideCohortCurrentBranchIds: branchCurrent.filter(id => !cohortIds.includes(id)),
      spawningBranchCount: branches.length, spawnActionCount: branches.reduce((sum, branch) => sum + branch.spawnActions.length, 0),
      mapsWithParameterReferenceCount: maps.filter(map => parameterRefs(map).length).length,
      branchesWithParameterReferenceCount: branches.filter(branch => branch.callerStatus === 'parameter-reference-found').length,
      branchesWithoutParameterReferenceCount: branches.filter(branch => branch.callerStatus !== 'parameter-reference-found').length,
      buffCatalogNodeCount: catalog.length,
    },
    groups: {
      classification: groups(maps, map => [map.classification]),
      referenceKind: groups(maps, map => parameterRefs(map).map(ref => ref.classification)),
      caller: groups(maps, map => parameterRefs(map).flatMap(ref => ref.ownerId ? [ref.ownerId] : [])),
      buffCandidateOwner: groups(maps, map => map.buffCandidates.map(candidate => candidate.ownerId)),
      spawnTarget: groups(maps, map => map.branches.flatMap(branch => branch.spawnActions.map(action => action.targetId ?? '(unknown)'))),
      environment: groups(maps, map => map.environments.map(environment => environment.id)),
      family: groups(maps, map => [map.family]),
      zone: groups(maps, map => [map.zoneId ?? '(unknown)']),
      exclusionReasons: groups(maps, map => map.currentReasons),
    },
    buffTemplateCatalog: catalog, maps,
  }
}

export async function runAudit(args = process.argv.slice(2)) {
  const flags = { source: '.cache/optional-branches-source.json', archive: 'public/data/enemy-aggregation/v3.json.gz',
    baseline: 'public/data/enemy-aggregation/v2.json.gz', output: 'docs/enemy-branch-audit/v3.json',
    'buff-template': '.cache/buff-template-reviewed.json' }
  if (args.includes('--help')) {
    console.log('node scripts/auditEnemyBranchMechanisms.mjs [--source bundle.json] [--archive v3.json.gz] [--baseline v2.json.gz] [--buff-template templates.json|none] [--output report.json]')
    return
  }
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]?.replace(/^--/, '')
    if (!(key in flags) || !args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`Invalid argument: ${args[index]}`)
    flags[key] = args[index + 1]
  }
  const inputs = await Promise.all(['source', 'archive', 'baseline', 'buff-template'].map(async key => {
    if (key === 'buff-template' && flags[key] === 'none') return [key, null]
    const bytes = await readFile(resolve(ROOT, flags[key]))
    const decoded = flags[key].endsWith('.gz') ? gunzipSync(bytes) : bytes
    return [key, { data: JSON.parse(decoded.toString('utf8')), path: flags[key].replaceAll('\\', '/'), sha256: sha256(bytes) }]
  }))
  const files = Object.fromEntries(inputs)
  const report = auditEnemyBranchMechanisms({ source: files.source.data, archive: files.archive.data,
    baselineArchive: files.baseline.data, buffTemplates: files['buff-template']?.data })
  report.inputs = Object.fromEntries(inputs.filter(([, value]) => value).map(([key, { path, sha256 }]) => [key, { path, sha256 }]))
  const output = resolve(ROOT, flags.output)
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify({ output: flags.output, ...report.summary }, null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runAudit().catch(error => { console.error(error.message); process.exitCode = 1 })
}
