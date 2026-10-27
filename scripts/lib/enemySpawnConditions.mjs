const ACTION_FIELDS = new Set([
  'actionType', 'key', 'count', 'managedByScheduler', 'preDelay', 'interval', 'routeIndex',
  'blockFragment', 'autoPreviewRoute', 'autoDisplayEnemyInfo', 'isUnharmfulAndAlwaysCountAsKilled',
  'hiddenGroup', 'randomSpawnGroupKey', 'randomSpawnGroupPackKey', 'randomType', 'refreshType',
  'weight', 'dontBlockWave', 'forceBlockWaveInBranch', 'isValid', 'condition', 'conditions',
])
const WAVE_FIELDS = new Set(['fragments', 'preDelay', 'postDelay', 'maxTimeWaitingForNextWave', 'advancedWaveTag'])
const FRAGMENT_FIELDS = new Set(['actions', 'preDelay'])
const RULE_FIELDS = new Set(['difficultyMask', 'key', 'professionMask', 'buildableMask', 'blackboard'])
const RULE_KEYS = new Set(['level_hidden_group_enable', 'level_hidden_group_disable', 'level_enemy_replace'])
const DIFFICULTIES = new Set(['NORMAL', 'FOUR_STAR', 'EASY', 'SIX_STAR'])
const CONDITIONAL_REASONS = new Set(['random-spawn-group', 'weighted-spawn', 'unscheduled-spawn', 'unsupported-wave-tag'])
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null
const text = (value) => typeof value === 'string' && value.trim() ? value.trim() : null
const count = (value) => Number.isSafeInteger(value) && value >= 0 ? value : null
const empty = (value) => value == null || value === false || value === 0 || value === ''
  || (Array.isArray(value) && value.length === 0) || (record(value) !== null && Object.keys(value).length === 0)
const unique = (values) => [...new Set(values)]

/** A stage's display environment and the level's rune mask use different enums. */
export function resolveEnemySpawnDifficulty(context = {}) {
  if (!record(context)) return null
  const difficulty = context.difficulty ?? 'NORMAL'
  const group = context.diffGroup ?? 'NONE'
  if (!['', 'NONE', 'ALL', 'NORMAL', 'TOUGH', 'EASY'].includes(group)) return null
  if (!DIFFICULTIES.has(difficulty)) return null
  if (group === 'TOUGH') return ['NORMAL', 'FOUR_STAR'].includes(difficulty) ? 'FOUR_STAR' : null
  if (group === 'EASY') return ['NORMAL', 'EASY'].includes(difficulty) ? 'EASY' : null
  return difficulty
}

const difficultyLabel = (context, difficulty) => context?.diffGroup === 'TOUGH' ? '厄難'
  : ({ NORMAL: '通常', FOUR_STAR: '強襲', EASY: '物語', SIX_STAR: '高難度' })[difficulty] ?? '難易度未確認'
const maskApplies = (mask, difficulty) => mask === 'ALL' ? true
  : DIFFICULTIES.has(mask) && difficulty !== null ? mask === difficulty : null

function unknownFields(value, allowed, kind) {
  return Object.entries(value).filter(([key, entry]) => !allowed.has(key) && !empty(entry))
    .map(([key]) => `unsupported-${kind}-field:${key}`)
}

function blackboardString(blackboard, key) {
  if (Array.isArray(blackboard)) {
    const entries = blackboard.filter((entry) => record(entry)?.key === key)
    if (!entries.length) return null
    const values = unique(entries.map((entry) => text(entry.valueStr)))
    return values.length === 1 ? values[0] : null
  }
  const value = record(blackboard)?.[key]
  return text(value) ?? text(record(value)?.valueStr)
}

function hasUnknownBlackboardParameters(blackboard, allowed) {
  if (Array.isArray(blackboard)) return blackboard.some((entry) => !record(entry) || !allowed.has(entry.key))
  const parameters = record(blackboard)
  return !parameters || Object.keys(parameters).some((key) => !allowed.has(key))
}

function buildRules(level, context, difficulty) {
  const groups = new Map(), replacements = new Map(), reasons = new Set(), evidence = []
  const label = difficultyLabel(context, difficulty)
  if (difficulty === null) reasons.add('unsupported-difficulty-context')
  const selected = context?.selectedRuneIds
  const selectedValid = selected === undefined || (Array.isArray(selected) && selected.every((id) => text(id) === id))
  if (!selectedValid) reasons.add('invalid-rune-selection')

  const add = (raw, path, selection = true) => {
    const rune = record(raw)
    if (!rune) { reasons.add('invalid-rune'); return }
    if (!RULE_KEYS.has(rune.key)) {
      if (/^level_(hidden_group|enemy_replace)/.test(String(rune.key))) {
        if (selection !== false && maskApplies(rune.difficultyMask, difficulty) !== false) reasons.add('unsupported-spawn-rule')
      }
      return
    }
    const applies = maskApplies(rune.difficultyMask, difficulty)
    // Inactive rules cannot affect the selected stage, even with unrecognised parameters.
    if (applies === false || selection === false) return
    const target = blackboardString(rune.blackboard, 'key')
    const replacement = rune.key === 'level_enemy_replace' ? blackboardString(rune.blackboard, 'value') : null
    const ruleEvidence = `${path}: ${rune.key}, difficultyMask=${JSON.stringify(rune.difficultyMask)}, key=${JSON.stringify(target)}${rune.key === 'level_enemy_replace' ? `, value=${JSON.stringify(replacement)}` : ''}`
    const problems = []
    if (applies === null) problems.push('unsupported-rune-difficulty')
    if (selection === null || !selectedValid) problems.push('optional-spawn-rule')
    // Empty values on an unknown parameter are not evidence that it is inert.
    const knownParameters = new Set(rune.key === 'level_enemy_replace' ? ['key', 'value'] : ['key'])
    if (hasUnknownBlackboardParameters(rune.blackboard, knownParameters)) problems.push('unsupported-spawn-rule')
    if (unknownFields(rune, RULE_FIELDS, 'rune').length
      || (rune.professionMask != null && rune.professionMask !== 1023)
      || (rune.buildableMask != null && rune.buildableMask !== 'ALL')) problems.push('unsupported-spawn-rule')
    if (!target || /[|,;]/.test(target) || (rune.key === 'level_enemy_replace' && (!replacement || /[|,;]/.test(replacement)))) {
      reasons.add(rune.key === 'level_enemy_replace' ? 'enemy-replacement' : 'invalid-hidden-group-rule')
      evidence.push(ruleEvidence)
      return
    }
    const bucket = rune.key === 'level_enemy_replace' ? replacements : groups
    const entry = { key: rune.key, replacement, problems, evidence: ruleEvidence }
    bucket.set(target, [...(bucket.get(target) ?? []), entry])
  }

  if (level.runes != null && !Array.isArray(level.runes)) reasons.add('invalid-runes')
  else for (const [index, rune] of (level.runes ?? []).entries()) add(rune, `runes[${index}]`)
  if (level.optionalRunes != null) {
    if (!record(level.optionalRunes)) reasons.add('invalid-optional-runes')
    else {
      for (const [id, runes] of Object.entries(level.optionalRunes)) {
        const selection = selectedValid && selected !== undefined ? selected.includes(id) : null
        if (selection === false) continue
        if (!Array.isArray(runes)) { reasons.add('invalid-optional-runes'); continue }
        for (const [index, rune] of runes.entries()) add(rune, `optionalRunes[${JSON.stringify(id)}][${index}]`, selection)
      }
      if (Array.isArray(selected) && selected.some((id) => !Object.hasOwn(level.optionalRunes, id))) reasons.add('unknown-selected-rune')
    }
  } else if (Array.isArray(selected) && selected.length) reasons.add('unknown-selected-rune')

  // Applying a replacement twice, or choosing an order for a chain, is not justified.
  const chained = new Set()
  for (const [from, entries] of replacements) for (const entry of entries) {
    if (entry.replacement !== from && replacements.has(entry.replacement)) {
      chained.add(from)
      chained.add(entry.replacement)
    }
  }
  return { groups, replacements, chained, reasons, evidence, label }
}

function resolveAction(raw, inherited, rules, path) {
  const action = record(raw)
  const rawId = text(action?.key)
  const result = { status: 'unknown', resolvedEnemyId: rawId, resolvedCount: null,
    reasons: [], conditions: [], evidence: [] }
  if (!action) return { ...result, reasons: ['invalid-action'], conditions: ['出現指定を確認できない'] }
  if (action.count === 0) return { ...result, status: 'excluded', resolvedCount: 0,
    conditions: ['設定体数が0'], evidence: [`${path}.count=0`] }

  const reasons = [...inherited, ...rules.reasons]
  const conditions = [], evidence = [`${path}.key=${JSON.stringify(action.key)}, count=${JSON.stringify(action.count)}`, ...rules.evidence]
  const group = text(action.hiddenGroup)
  if (action.hiddenGroup != null && action.hiddenGroup !== '') {
    evidence.push(`${path}.hiddenGroup=${JSON.stringify(action.hiddenGroup)}`)
    const matches = group ? rules.groups.get(group) ?? [] : []
    evidence.push(...matches.map((rule) => rule.evidence))
    const problems = matches.flatMap((rule) => rule.problems)
    const enabled = matches.some((rule) => rule.key === 'level_hidden_group_enable')
    const disabled = matches.some((rule) => rule.key === 'level_hidden_group_disable')
    if (problems.length || (enabled && disabled)) {
      reasons.push(...problems, ...(enabled && disabled ? ['conflicting-hidden-group-rules'] : []))
      conditions.push('追加出現の条件を判定できない')
    } else if ((disabled || (group && !enabled)) && rules.reasons.size === 0) {
      // Named groups start disabled. Only a matching, applicable enable can add
      // their SPAWNs; uncertain rules above still prevent assuming them absent.
      return { ...result, status: 'excluded', resolvedCount: 0, reasons: [],
        conditions: [`${rules.label}では出現しない`], evidence: unique(evidence) }
    } else if (enabled) conditions.push(`${rules.label}で出現`)
    else {
      reasons.push('hidden-spawn-group')
      conditions.push('追加出現の条件未確認')
    }
  }
  const amount = count(action.count)
  if (amount === null) reasons.push('invalid-spawn-count')
  if (!rawId) reasons.push('invalid-spawn-enemy')
  for (const key of ['randomSpawnGroupKey', 'randomSpawnGroupPackKey']) {
    if (action[key] != null && action[key] !== '') {
      reasons.push('random-spawn-group')
      evidence.push(`${path}.${key}=${JSON.stringify(action[key])}`)
    }
  }
  if (action.weight != null && action.weight !== '' && action.weight !== 0) {
    reasons.push('weighted-spawn')
    evidence.push(`${path}.weight=${JSON.stringify(action.weight)}`)
  }
  for (const key of ['randomType', 'refreshType']) if (action[key] != null && action[key] !== '' && action[key] !== 'ALWAYS') {
    reasons.push(`conditional-spawn:${key}`)
    evidence.push(`${path}.${key}=${JSON.stringify(action[key])}`)
  }
  for (const key of ['condition', 'conditions']) {
    const value = action[key]
    if (value != null && value !== '' && value !== 'ALWAYS' && value !== true && !(Array.isArray(value) && value.length === 0)) {
      reasons.push(`conditional-spawn:${key}`)
      evidence.push(`${path}.${key}=${JSON.stringify(value)}`)
    }
  }
  if (action.managedByScheduler === false) reasons.push('unscheduled-spawn')
  reasons.push(...unknownFields(action, ACTION_FIELDS, 'spawn'))
  // isValid:false is legacy editor metadata, not a disabled SPAWN.
  let resolvedId = rawId
  const replacements = rules.replacements.get(rawId) ?? []
  if (replacements.length) {
    evidence.push(...replacements.map((rule) => rule.evidence))
    const problems = replacements.flatMap((rule) => rule.problems)
    const targets = unique(replacements.map((rule) => rule.replacement))
    if (problems.length || targets.length !== 1 || rules.chained.has(rawId)) {
      reasons.push(...problems, 'enemy-replacement')
      if (targets.length !== 1) reasons.push('conflicting-enemy-replacement')
      if (rules.chained.has(rawId)) reasons.push('chained-enemy-replacement')
      conditions.push('敵の置き換え未確定')
      resolvedId = null
    } else {
      resolvedId = targets[0]
      conditions.push(`${rules.label}では ${rawId} → ${resolvedId}`)
    }
  }
  const distinctReasons = unique(reasons).sort()
  const conditional = (reason) => CONDITIONAL_REASONS.has(reason) || reason.startsWith('conditional-spawn:')
  const status = distinctReasons.length === 0 ? 'included'
    : distinctReasons.every(conditional) ? 'conditional' : 'unknown'
  if (distinctReasons.some((reason) => ['random-spawn-group', 'weighted-spawn'].includes(reason))) conditions.push('ランダムな出現指定')
  if (distinctReasons.includes('unsupported-wave-tag')) conditions.push('ウェーブ選択条件未対応')
  if (distinctReasons.includes('unscheduled-spawn')) conditions.push('通常スケジュール外の出現')
  if (distinctReasons.some((reason) => reason.startsWith('conditional-spawn:'))) conditions.push('実行時の条件付き')
  if (!conditions.length) conditions.push(status === 'included' ? '固定' : '出現条件を確認できない')
  return { status, resolvedEnemyId: resolvedId, resolvedCount: status === 'included' ? amount : null,
    reasons: distinctReasons, conditions: unique(conditions), evidence: unique(evidence) }
}

/**
 * Resolve conditions from the default-disabled group state and stage/rune evidence. Counts are
 * a partial sum when reasons is nonempty; callers must not publish them as exact.
 * Raw level/action objects are never mutated, and indices refer to their source.
 */
export function analyzeEnemySpawns(value, context = {}) {
  const level = record(value), counts = new Map(), reasons = new Set(), actions = []
  let totalCount = 0
  if (!level) return { counts, reasons: new Set(['invalid-level']), actions }
  const rules = buildRules(level, context, resolveEnemySpawnDifficulty(context))
  for (const reason of rules.reasons) reasons.add(reason)
  if (!Array.isArray(level.enemyDbRefs)) reasons.add('invalid-enemy-refs')
  if (!Array.isArray(level.waves)) reasons.add('invalid-waves')
  else level.waves.forEach((rawWave, waveIndex) => {
    const wave = record(rawWave)
    if (!wave || !Array.isArray(wave.fragments)) { reasons.add('invalid-fragments'); return }
    const waveReasons = unknownFields(wave, WAVE_FIELDS, 'wave')
    if (wave.advancedWaveTag != null && wave.advancedWaveTag !== '') waveReasons.push('unsupported-wave-tag')
    wave.fragments.forEach((rawFragment, fragmentIndex) => {
      const fragment = record(rawFragment)
      if (!fragment || !Array.isArray(fragment.actions)) { reasons.add('invalid-actions'); return }
      const inherited = [...waveReasons, ...unknownFields(fragment, FRAGMENT_FIELDS, 'fragment')]
      fragment.actions.forEach((rawAction, actionIndex) => {
        const action = record(rawAction)
        if (!action || !text(action.actionType)) { reasons.add('invalid-action'); return }
        if (action.actionType !== 'SPAWN') return
        const resolution = resolveAction(action, inherited, rules, `waves[${waveIndex}].fragments[${fragmentIndex}].actions[${actionIndex}]`)
        actions.push({ waveIndex, fragmentIndex, actionIndex, ...resolution })
        for (const reason of resolution.reasons) reasons.add(reason)
        if (resolution.status !== 'included') return
        totalCount += resolution.resolvedCount
        if (!Number.isSafeInteger(totalCount)) reasons.add('spawn-total-overflow')
        const next = (counts.get(resolution.resolvedEnemyId) ?? 0) + resolution.resolvedCount
        if (!Number.isSafeInteger(next)) reasons.add('spawn-total-overflow')
        else counts.set(resolution.resolvedEnemyId, next)
      })
    })
  })
  if (level.branches != null) {
    const branches = record(level.branches)
    if (!branches) reasons.add('invalid-branches')
    else for (const [id, rawBranch] of Object.entries(branches)) {
      const branch = record(rawBranch)
      if (!branch || !Array.isArray(branch.phases)) { reasons.add('invalid-branch-phases'); continue }
      branch.phases.forEach((rawPhase, phaseIndex) => {
        const phase = record(rawPhase)
        if (!phase || !Array.isArray(phase.actions)) { reasons.add('invalid-branch-actions'); return }
        phase.actions.forEach((rawAction, actionIndex) => {
          const action = record(rawAction)
          if (!action || !text(action.actionType)) reasons.add('invalid-branch-action')
          else if (action.actionType === 'SPAWN') {
            const resolved = resolveAction(action, [], rules, `branches[${JSON.stringify(id)}].phases[${phaseIndex}].actions[${actionIndex}]`)
            if (resolved.status !== 'excluded') reasons.add('branch-spawn')
          }
        })
      })
    }
  }
  return { counts, reasons, actions }
}
