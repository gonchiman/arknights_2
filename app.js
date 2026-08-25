const CHARACTER_URL = 'https://raw.githubusercontent.com/ArknightsAssets/ArknightsGamedata/master/jp/gamedata/excel/character_table.json'
const SKILL_URL = 'https://raw.githubusercontent.com/ArknightsAssets/ArknightsGamedata/master/jp/gamedata/excel/skill_table.json'
const STORAGE_KEY = 'arknights-skill-analyzer-overrides-v1'

const CLASS_OPTIONS = ['持続', '弾薬', '永続', '通常攻撃強化', '一撃必殺', '持続＋一撃必殺', '条件分岐', 'その他', '要確認']
const SUMMARY_CLASSES = ['持続', '弾薬', '通常攻撃強化', '永続', '一撃必殺', '要確認']

const NEXT_ATTACK_PATTERNS = [/次の通常攻撃/, /次回の通常攻撃/, /次の攻撃/, /次回の攻撃/, /次の一撃/, /next attack/i]
const INFINITE_PATTERNS = [/効果時間無限/, /退場まで効果継続/, /永続/, /unlimited duration/i, /infinite duration/i]
const CONDITIONAL_PATTERNS = [/2回目以降/, /二回目以降/, /発動する度/, /発動するたび/, /前回/, /再発動/, /second activation/i, /subsequent activation/i]
const INSTANT_PATTERNS = [/即座に/, /直ちに/, /投げつけ/, /砲撃/, /斬撃/, /周囲.*ダメージ/, /前方.*ダメージ/, /範囲.*ダメージ/, /immediately/i, /instantly/i]

const state = {
  rows: [],
  filtered: [],
  selectedId: null,
  loading: true,
  overrides: readOverrides(),
}

const el = {
  reloadButton: document.querySelector('#reloadButton'),
  exportButton: document.querySelector('#exportButton'),
  errorBox: document.querySelector('#errorBox'),
  summaryGrid: document.querySelector('#summaryGrid'),
  searchInput: document.querySelector('#searchInput'),
  classFilter: document.querySelector('#classFilter'),
  rarityFilter: document.querySelector('#rarityFilter'),
  confidenceFilter: document.querySelector('#confidenceFilter'),
  resultCount: document.querySelector('#resultCount'),
  overrideCount: document.querySelector('#overrideCount'),
  skillTableBody: document.querySelector('#skillTableBody'),
  detailPane: document.querySelector('#detailPane'),
  skillSourceLink: document.querySelector('#skillSourceLink'),
  characterSourceLink: document.querySelector('#characterSourceLink'),
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function readOverrides() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveOverrides() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.overrides))
}

function cleanDescription(value = '') {
  return value
    .replace(/<\$ba\.[^>]+>/g, '')
    .replace(/<@[^>]+>/g, '')
    .replace(/<\/?>/g, '')
    .replace(/\\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function matchesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text))
}

function classifySkill(level) {
  const description = cleanDescription(level?.description || '')
  const duration = typeof level?.duration === 'number' ? level.duration : 0
  const durationType = String(level?.durationType || '')
  const hits = []

  const hasAmmo = durationType.toUpperCase() === 'AMMO'
  const hasDuration = duration > 0
  const isInfinite = matchesAny(description, INFINITE_PATTERNS)
  const isNextAttack = matchesAny(description, NEXT_ATTACK_PATTERNS)
  const isConditional = matchesAny(description, CONDITIONAL_PATTERNS)
  const isInstant = matchesAny(description, INSTANT_PATTERNS)

  if (hasAmmo) hits.push({ label: 'durationType', detail: 'AMMO → 弾薬式スキル' })
  if (hasDuration) hits.push({ label: 'duration', detail: `${duration}秒 → 時間的な持続量あり` })
  if (isInfinite) hits.push({ label: 'description', detail: '永続・効果時間無限を示す文言を検出' })
  if (isNextAttack) hits.push({ label: 'description', detail: '「次の攻撃」系の文言を検出' })
  if (isConditional) hits.push({ label: 'description', detail: '再発動・複数回発動による変化を示す文言を検出' })
  if (isInstant) hits.push({ label: 'description', detail: '瞬間的な攻撃を示す文言を検出' })

  let classification = '要確認'
  let confidence = 'low'

  if (hasAmmo) {
    classification = '弾薬'
    confidence = 'high'
  } else if (isInfinite) {
    classification = '永続'
    confidence = 'high'
  } else if (isNextAttack && !hasDuration) {
    classification = '通常攻撃強化'
    confidence = 'high'
  } else if (hasDuration && isInstant) {
    classification = '持続＋一撃必殺'
    confidence = 'medium'
  } else if (hasDuration) {
    classification = '持続'
    confidence = 'high'
  } else if (isConditional) {
    classification = '条件分岐'
    confidence = 'medium'
  } else if (isInstant && duration <= 0) {
    classification = '一撃必殺'
    confidence = 'medium'
  } else if (description) {
    classification = 'その他'
    confidence = 'low'
    hits.push({ label: 'fallback', detail: '既知ルールに一致しないため「その他」' })
  }

  return {
    classification,
    confidence,
    hits,
    flags: { hasDuration, hasAmmo, isInfinite, isNextAttack, isInstant, isConditional },
  }
}

function rarityToNumber(value) {
  if (typeof value === 'number') return value + 1
  const match = String(value ?? '').match(/(\d+)/)
  if (!match) return null
  const parsed = Number(match[1])
  return parsed >= 0 && parsed <= 5 ? parsed + 1 : parsed
}

async function fetchJson(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  return response.json()
}

async function loadData() {
  setLoading(true)
  showError('')

  try {
    const [characters, skills] = await Promise.all([
      fetchJson(CHARACTER_URL),
      fetchJson(SKILL_URL),
    ])

    const rows = []
    for (const [characterId, character] of Object.entries(characters)) {
      if (!characterId.startsWith('char_')) continue
      if (character?.isNotObtainable) continue
      if (!character?.name || !Array.isArray(character.skills) || character.skills.length === 0) continue

      character.skills.forEach((skillRef, index) => {
        const skillId = skillRef?.skillId
        if (!skillId) return
        const skill = skills[skillId]
        const levels = skill?.levels
        const level = Array.isArray(levels) ? levels.at(-1) : null
        if (!level) return

        rows.push({
          id: `${characterId}:${skillId}`,
          characterId,
          operatorName: character.name,
          rarity: rarityToNumber(character.rarity),
          profession: String(character.profession || ''),
          skillNumber: index + 1,
          skillId,
          skillName: String(level.name || skillId),
          description: cleanDescription(level.description || ''),
          duration: typeof level.duration === 'number' ? level.duration : null,
          durationType: String(level.durationType || ''),
          spType: String(level.spData?.spType || ''),
          spCost: typeof level.spData?.spCost === 'number' ? level.spData.spCost : null,
          initSp: typeof level.spData?.initSp === 'number' ? level.spData.initSp : null,
          auto: classifySkill(level),
          raw: level,
        })
      })
    }

    rows.sort((a, b) => {
      const rarityDiff = (b.rarity || 0) - (a.rarity || 0)
      if (rarityDiff !== 0) return rarityDiff
      const nameDiff = a.operatorName.localeCompare(b.operatorName, 'ja')
      if (nameDiff !== 0) return nameDiff
      return a.skillNumber - b.skillNumber
    })

    state.rows = rows
    if (!state.selectedId && rows.length) state.selectedId = rows[0].id
    applyFilters()
  } catch (error) {
    showError(`データの読み込みに失敗しました: ${error instanceof Error ? error.message : String(error)}`)
    state.rows = []
    applyFilters()
  } finally {
    setLoading(false)
  }
}

function effectiveClass(row) {
  return state.overrides[row.id] || row.auto.classification
}

function setLoading(value) {
  state.loading = value
  el.reloadButton.disabled = value
  el.reloadButton.textContent = value ? '読込中…' : 'データ再読込'
  el.exportButton.disabled = value || state.filtered.length === 0
  renderSummary()
}

function showError(message) {
  el.errorBox.textContent = message
  el.errorBox.classList.toggle('hidden', !message)
}

function applyFilters() {
  const query = el.searchInput.value.trim().toLocaleLowerCase('ja')
  const classFilter = el.classFilter.value
  const rarityFilter = el.rarityFilter.value
  const confidenceFilter = el.confidenceFilter.value

  state.filtered = state.rows.filter((row) => {
    if (classFilter !== 'ALL' && effectiveClass(row) !== classFilter) return false
    if (rarityFilter !== 'ALL' && row.rarity !== Number(rarityFilter)) return false
    if (confidenceFilter !== 'ALL' && row.auto.confidence !== confidenceFilter) return false
    if (!query) return true
    return [row.operatorName, row.skillName, row.skillId, row.description, row.profession]
      .join(' ')
      .toLocaleLowerCase('ja')
      .includes(query)
  })

  renderAll()
}

function renderAll() {
  renderSummary()
  renderTable()
  renderDetail()
  el.resultCount.textContent = `${state.filtered.length.toLocaleString()} 件表示`
  el.overrideCount.textContent = `手動修正 ${Object.keys(state.overrides).length.toLocaleString()} 件`
  el.exportButton.disabled = state.loading || state.filtered.length === 0
}

function renderSummary() {
  const counts = new Map()
  state.rows.forEach((row) => {
    const label = effectiveClass(row)
    counts.set(label, (counts.get(label) || 0) + 1)
  })

  const cards = [
    `<article class="summary-card primary-card"><span>解析対象</span><strong>${state.loading ? '—' : state.rows.length.toLocaleString()}</strong><small>スキル</small></article>`,
    ...SUMMARY_CLASSES.map((label) => `<article class="summary-card"><span>${label}</span><strong>${state.loading ? '—' : (counts.get(label) || 0).toLocaleString()}</strong><small>${label === '要確認' ? '優先して人手確認' : '自動・手動分類後'}</small></article>`),
  ]
  el.summaryGrid.innerHTML = cards.join('')
}

function confidenceLabel(value) {
  return value === 'high' ? '高' : value === 'medium' ? '中' : '低'
}

function renderTable() {
  if (!state.filtered.length) {
    el.skillTableBody.innerHTML = '<tr><td colspan="6" class="table-empty">該当するスキルがありません。</td></tr>'
    return
  }

  el.skillTableBody.innerHTML = state.filtered.map((row) => {
    const manual = Boolean(state.overrides[row.id])
    const duration = row.duration > 0 ? `${row.duration}s` : row.duration === -1 ? '-1' : '—'
    return `
      <tr data-id="${escapeHtml(row.id)}" class="${row.id === state.selectedId ? 'selected-row' : ''}">
        <td><div class="operator-cell"><strong>${escapeHtml(row.operatorName)}</strong><small>${row.rarity ? `★${row.rarity}` : '—'} · ${escapeHtml(row.profession || '—')}</small></div></td>
        <td><div class="skill-cell"><span>S${row.skillNumber}</span><strong>${escapeHtml(row.skillName)}</strong></div></td>
        <td><span class="class-badge ${manual ? 'manual' : ''}">${escapeHtml(effectiveClass(row))}</span></td>
        <td><span class="confidence ${row.auto.confidence}">${confidenceLabel(row.auto.confidence)}</span></td>
        <td>${duration}</td>
        <td>${row.spCost ?? '—'}</td>
      </tr>`
  }).join('')

  el.skillTableBody.querySelectorAll('tr[data-id]').forEach((rowElement) => {
    rowElement.addEventListener('click', () => {
      state.selectedId = rowElement.dataset.id
      renderTable()
      renderDetail()
    })
  })
}

function renderDetail() {
  const row = state.rows.find((item) => item.id === state.selectedId)
  if (!row) {
    el.detailPane.innerHTML = '<p class="empty-state">左の一覧からスキルを選択してください。</p>'
    return
  }

  const manualValue = state.overrides[row.id] || 'AUTO'
  const options = [
    `<option value="AUTO">自動判定を使用（${escapeHtml(row.auto.classification)}）</option>`,
    ...CLASS_OPTIONS.map((option) => `<option value="${option}" ${manualValue === option ? 'selected' : ''}>${option}</option>`),
  ].join('')

  const hits = row.auto.hits.length
    ? row.auto.hits.map((hit) => `<div class="rule-hit"><code>${escapeHtml(hit.label)}</code><span>${escapeHtml(hit.detail)}</span></div>`).join('')
    : '<p class="muted">一致したルールはありません。</p>'

  el.detailPane.innerHTML = `
    <div class="detail-heading">
      <div><p class="eyebrow">SELECTED SKILL</p><h2>${escapeHtml(row.operatorName)} S${row.skillNumber}</h2><p>${escapeHtml(row.skillName)}</p></div>
      <span class="confidence ${row.auto.confidence}">信頼度 ${confidenceLabel(row.auto.confidence)}</span>
    </div>

    <div class="detail-section">
      <label>最終分類</label>
      <select id="manualClassSelect" class="manual-select">${options}</select>
      <small class="muted">手動変更はこのブラウザの localStorage に保存されます。</small>
    </div>

    <div class="detail-section">
      <label>スキル説明</label>
      <p class="description">${escapeHtml(row.description || '説明文なし')}</p>
    </div>

    <div class="detail-section">
      <label>判定根拠</label>
      <div class="rule-list">${hits}</div>
    </div>

    <div class="detail-section">
      <label>検出フラグ</label>
      <div class="flag-list">
        ${Object.entries(row.auto.flags).map(([key, value]) => `<span class="flag ${value ? 'on' : ''}">${escapeHtml(key)}</span>`).join('')}
      </div>
    </div>

    <div class="detail-section">
      <label>主要フィールド</label>
      <dl class="field-grid">
        <div><dt>skillId</dt><dd>${escapeHtml(row.skillId)}</dd></div>
        <div><dt>duration</dt><dd>${row.duration ?? 'null'}</dd></div>
        <div><dt>durationType</dt><dd>${escapeHtml(row.durationType || '—')}</dd></div>
        <div><dt>spType</dt><dd>${escapeHtml(row.spType || '—')}</dd></div>
        <div><dt>spCost</dt><dd>${row.spCost ?? '—'}</dd></div>
        <div><dt>initSp</dt><dd>${row.initSp ?? '—'}</dd></div>
      </dl>
    </div>

    <details class="raw-details"><summary>最終レベルのRaw JSON</summary><pre>${escapeHtml(JSON.stringify(row.raw, null, 2))}</pre></details>`

  const manualSelect = document.querySelector('#manualClassSelect')
  manualSelect.value = manualValue
  manualSelect.addEventListener('change', (event) => {
    const value = event.target.value
    if (value === 'AUTO') delete state.overrides[row.id]
    else state.overrides[row.id] = value
    saveOverrides()
    applyFilters()
  })
}

function csvEscape(value) {
  const text = String(value ?? '')
  return `"${text.replaceAll('"', '""')}"`
}

function exportCsv() {
  const header = ['オペレーター名', 'レアリティ', '職業', 'スキル番号', 'スキル名', 'skillId', '分類', '自動分類', '信頼度', 'duration', 'durationType', 'spType', 'spCost', 'initSp', '説明文']
  const body = state.filtered.map((row) => [
    row.operatorName, row.rarity, row.profession, row.skillNumber, row.skillName, row.skillId,
    effectiveClass(row), row.auto.classification, row.auto.confidence, row.duration, row.durationType,
    row.spType, row.spCost, row.initSp, row.description,
  ])
  const csv = [header, ...body].map((line) => line.map(csvEscape).join(',')).join('\r\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'arknights_skill_classification.csv'
  link.click()
  URL.revokeObjectURL(url)
}

function initializeFilters() {
  el.classFilter.innerHTML = '<option value="ALL">分類: すべて</option>' + CLASS_OPTIONS.map((option) => `<option value="${option}">${option}</option>`).join('')
}

initializeFilters()
el.skillSourceLink.href = SKILL_URL
el.characterSourceLink.href = CHARACTER_URL
el.reloadButton.addEventListener('click', loadData)
el.exportButton.addEventListener('click', exportCsv)
el.searchInput.addEventListener('input', applyFilters)
el.classFilter.addEventListener('change', applyFilters)
el.rarityFilter.addEventListener('change', applyFilters)
el.confidenceFilter.addEventListener('change', applyFilters)

loadData()
