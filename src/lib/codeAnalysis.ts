export type AnalysisCategory = 'names' | 'classes' | 'methods' | 'fields'
export const ANALYSIS_CATEGORY_LABELS: Record<AnalysisCategory, string> = { names: '名前', classes: 'クラス・型', methods: '処理', fields: 'データ項目' }
export type AnalysisSummary = { fileName: string; kind: 'metadata'; count: number; version: number; skippedNames: number; counts: Record<AnalysisCategory, number> }
export type AnalysisOwner = { id: number; name: string }
export type AnalysisMatch = {
  id: number; category: AnalysisCategory; name: string; location: string; context: string; nameLocation?: string
  owner?: AnalysisOwner; namespace?: string; typeKind?: string
  methodCount?: number; fieldCount?: number; parameterCount?: number; parameters?: string[]
}
export type AnalysisResults = {
  summary: AnalysisSummary; matches: AnalysisMatch[]; total: number; query: string
  category: AnalysisCategory; page: number; pageCount: number; owner: AnalysisOwner | null
}
type NamedRecord = { name: string; offset: number; nameOffset?: number }
type MetadataClass = NamedRecord & { namespace: string; fullName: string; typeKind: string; methodStart: number; methodCount: number; fieldStart: number; fieldCount: number }
type MetadataMethod = NamedRecord & { ownerId: number; parameterStart: number; parameterCount: number }
type MetadataField = NamedRecord & { ownerId: number }
export type AnalysisDocument = {
  summary: AnalysisSummary; entries: NamedRecord[]; classes: MetadataClass[]
  methods: MetadataMethod[]; fields: MetadataField[]; parameters: string[]
}

export const MAX_ANALYSIS_FILE_BYTES = 128 * 1024 * 1024
export const ANALYSIS_RESULT_LIMIT = 200
const HEADER_SIZE = 256
function hex(value: number): string { return `0x${value.toString(16).toUpperCase()}` }

// v29 layouts: Il2CppDumper/Il2Cpp/MetadataClass.cs. All offsets are DAT byte offsets.
// Native Il2CppType indices are deliberately not interpreted as metadata type indices.
export function readAnalysisFile(fileName: string, buffer: ArrayBuffer): AnalysisDocument {
  if (buffer.byteLength > MAX_ANALYSIS_FILE_BYTES) throw new Error('読み込めるファイルは128 MBまでです。')
  if (!buffer.byteLength) throw new Error('ファイルが空です。別のファイルを選んでください。')
  if (!/\.dat$/i.test(fileName)) throw new Error('global-metadata.datを選んでください。このページはDATファイル専用です。')
  if (buffer.byteLength < HEADER_SIZE) throw new Error('メタデータのヘッダーが途中で切れています。')
  const data = new DataView(buffer)
  if (data.getUint32(0, true) !== 0xFAB11BAF) throw new Error('対応するDATの形式ではありません。global-metadata.datを選んでください。')
  const version = data.getInt32(4, true)
  if (version !== 29) throw new Error(`メタデータ版${version}は未対応です。このページは版29に対応しています。`)
  function region(at: number, stride: number, label: string) {
    const start = data.getUint32(at, true), size = data.getInt32(at + 4, true)
    if (size < 0 || size % stride !== 0 || (size > 0 && start < HEADER_SIZE) || start + size > buffer.byteLength) {
      throw new Error(`${label}の格納範囲が正しくありません。ファイルが完全か確認してください。`)
    }
    return { start, size, count: size / stride }
  }
  const strings = region(24, 1, '名前'), classTable = region(160, 88, 'クラス'), methodTable = region(48, 32, '処理')
  const fieldTable = region(96, 12, 'データ項目'), parameterTable = region(88, 12, '引数')
  const regions = [strings, classTable, methodTable, fieldTable, parameterTable].filter(r => r.size).sort((a, b) => a.start - b.start)
  for (let i = 1; i < regions.length; i++) {
    if (regions[i].start < regions[i - 1].start + regions[i - 1].size) throw new Error('情報の格納範囲が重複しています。ファイルの形式を確認してください。')
  }
  const bytes = new Uint8Array(buffer, strings.start, strings.size)
  const decoder = new TextDecoder('utf-8', { fatal: true })
  const cache = new Map<number, string | null>()
  const entries: NamedRecord[] = []
  let skippedNames = 0, from = 0
  for (let to = 0; to < bytes.length; to++) {
    if (bytes[to] !== 0) continue
    let name: string | null
    try { name = decoder.decode(bytes.subarray(from, to)) }
    catch { name = null; skippedNames++ }
    cache.set(from, name)
    if (name) entries.push({ name, offset: strings.start + from })
    from = to + 1
  }
  if (from !== bytes.length) throw new Error('名前の領域が途中で切れています。')
  function readName(index: number): string {
    if (index < 0 || index >= bytes.length) throw new Error('名前への参照が範囲外です。ファイルが完全か確認してください。')
    // References may share a suffix of an existing string.
    if (!cache.has(index)) {
      const end = bytes.indexOf(0, index)
      if (end < 0) throw new Error('参照先の名前が途中で切れています。')
      try { cache.set(index, decoder.decode(bytes.subarray(index, end))) }
      catch { cache.set(index, null) }
    }
    return cache.get(index) ?? `（読めない名前 ${hex(strings.start + index)}）`
  }
  function checkRange(start: number, count: number, max: number, label: string) {
    if (count === 0 && start === -1) return
    if (start < 0 || start + count > max) throw new Error(`${label}の参照範囲が正しくありません。`)
  }
  const classes: MetadataClass[] = []
  for (let i = 0; i < classTable.count; i++) {
    const p = classTable.start + i * 88
    const name = readName(data.getUint32(p, true)), namespace = readName(data.getUint32(p + 4, true))
    const fieldStart = data.getInt32(p + 32, true), methodStart = data.getInt32(p + 36, true)
    const methodCount = data.getUint16(p + 64, true), fieldCount = data.getUint16(p + 68, true)
    checkRange(methodStart, methodCount, methodTable.count, 'クラスの処理')
    checkRange(fieldStart, fieldCount, fieldTable.count, 'クラスのデータ項目')
    const flags = data.getUint32(p + 28, true), bits = data.getUint32(p + 80, true)
    const typeKind = flags & 0x20 ? 'インターフェース' : bits & 2 ? '列挙型' : bits & 1 ? '構造体' : 'クラス'
    classes.push({ name, namespace, fullName: namespace ? `${namespace}.${name}` : name, offset: p, nameOffset: strings.start + data.getUint32(p, true), typeKind, methodStart, methodCount, fieldStart, fieldCount })
  }
  const fieldOwners = new Int32Array(fieldTable.count).fill(-1)
  const methodOwners = new Int32Array(methodTable.count).fill(-1)
  classes.forEach((type, id) => {
    for (const [owners, start, count] of [[fieldOwners, type.fieldStart, type.fieldCount], [methodOwners, type.methodStart, type.methodCount]] as const) {
      for (let i = start; i < start + count; i++) {
        if (owners[i] !== -1) throw new Error('複数のクラスが同じ項目を参照しています。')
        owners[i] = id
      }
    }
  })
  const parameters: string[] = []
  for (let i = 0; i < parameterTable.count; i++) parameters.push(readName(data.getUint32(parameterTable.start + i * 12, true)))
  const methods: MetadataMethod[] = []
  for (let i = 0; i < methodTable.count; i++) {
    const p = methodTable.start + i * 32, ownerId = data.getInt32(p + 4, true)
    if (ownerId < 0 || ownerId >= classes.length || methodOwners[i] !== ownerId) throw new Error('処理と所属クラスの対応が正しくありません。')
    const parameterStart = data.getInt32(p + 12, true), parameterCount = data.getUint16(p + 30, true)
    checkRange(parameterStart, parameterCount, parameters.length, '引数')
    methods.push({ name: readName(data.getUint32(p, true)), offset: p, nameOffset: strings.start + data.getUint32(p, true), ownerId, parameterStart, parameterCount })
  }
  const fields: MetadataField[] = []
  for (let i = 0; i < fieldTable.count; i++) {
    const p = fieldTable.start + i * 12, ownerId = fieldOwners[i]
    if (ownerId < 0) throw new Error('データ項目の所属クラスが見つかりません。')
    fields.push({ name: readName(data.getUint32(p, true)), offset: p, nameOffset: strings.start + data.getUint32(p, true), ownerId })
  }
  return { summary: { fileName, kind: 'metadata', count: entries.length, version, skippedNames, counts: { names: entries.length, classes: classes.length, methods: methods.length, fields: fields.length } }, entries, classes, methods, fields, parameters }
}

export function searchAnalysis(document: AnalysisDocument, query: string, category: AnalysisCategory = 'names', page = 0, ownerId?: number): AnalysisResults {
  if (!Object.hasOwn(ANALYSIS_CATEGORY_LABELS, category)) throw new Error('一覧の種類が正しくありません。')
  if (!Number.isSafeInteger(page) || page < 0) throw new Error('ページ番号が正しくありません。')
  if (ownerId !== undefined && (category === 'names' || !Number.isSafeInteger(ownerId) || ownerId < 0 || ownerId >= document.classes.length)) throw new Error('所属クラスの指定が正しくありません。')
  const needle = query.trim().toLowerCase()
  if (needle.length > 200) throw new Error('検索語は200文字以内で入力してください。')
  const records = category === 'names' ? document.entries : document[category]
  const ids: number[] = []
  records.forEach((record, id) => {
    const owningId = category === 'classes' ? id : category === 'methods' || category === 'fields' ? document[category][id].ownerId : undefined
    if (ownerId !== undefined && owningId !== ownerId) return
    const ownerName = owningId === undefined ? '' : document.classes[owningId].fullName
    if (!needle || `${record.name}\n${ownerName}`.toLowerCase().includes(needle)) ids.push(id)
  })
  const total = ids.length, pageCount = Math.ceil(total / ANALYSIS_RESULT_LIMIT)
  const currentPage = Math.min(page, Math.max(0, pageCount - 1))
  const matches = ids.slice(currentPage * ANALYSIS_RESULT_LIMIT, (currentPage + 1) * ANALYSIS_RESULT_LIMIT).map(id => analysisMatch(document, category, id))
  return { summary: document.summary, matches, total, query: query.trim(), category, page: currentPage, pageCount, owner: ownerId === undefined ? null : { id: ownerId, name: document.classes[ownerId].fullName } }
}

function analysisMatch(document: AnalysisDocument, category: AnalysisCategory, id: number): AnalysisMatch {
    const record = (category === 'names' ? document.entries : document[category])[id]
    const location = `ファイル位置 ${hex(record.offset)}`
    const match: AnalysisMatch = { id, category, name: record.name, location, context: '', nameLocation: record.nameOffset === undefined ? undefined : hex(record.nameOffset) }
    const lines = [`種類: ${ANALYSIS_CATEGORY_LABELS[category]}`, `名前: ${record.name}`, `${category === 'names' ? '名前の保存位置' : '定義レコードの保存位置'}: ${hex(record.offset)}`]
    if (category === 'classes') {
      const type = document.classes[id]
      Object.assign(match, { namespace: type.namespace, typeKind: type.typeKind, methodCount: type.methodCount, fieldCount: type.fieldCount })
      lines.push(`分類: ${type.typeKind}`, `所属: ${type.namespace || 'なし'}`, `処理: ${type.methodCount}件`, `データ項目: ${type.fieldCount}件`)
    } else if (category === 'methods' || category === 'fields') {
      const member = document[category][id]
      match.owner = { id: member.ownerId, name: document.classes[member.ownerId].fullName }
      lines.push(`所属クラス: ${match.owner.name}`)
      if (category === 'methods') {
        const method = document.methods[id]
        match.parameterCount = method.parameterCount
        match.parameters = method.parameterCount ? document.parameters.slice(method.parameterStart, method.parameterStart + method.parameterCount) : []
        lines.push(`引数: ${method.parameterCount}個`, ...match.parameters.map((name, i) => `  ${i + 1}. ${name || '（名前なし）'}`))
      }
    }
    lines.push('', '位置はDAT内のバイト位置です。関数の実行アドレスではありません。')
    match.context = lines.join('\n')
    return match
}

const GOLDENGLOW_NAME = /gdglow|golden[ _-]?glow|ゴールデングロー|澄[闪閃]/i
export const GOLDENGLOW_EXTRACTION_SCOPE = 'gdglow・goldenglow・ゴールデングロー・澄闪・澄閃を含む名前と、該当クラスに直接属する処理・データ項目。golden glow / golden_glow / golden-glowも対象。大文字・小文字は区別しません。'
export const GOLDENGLOW_EXTRACTION_LIMIT = '共通処理・継承元・呼び出し先は未追跡です。GGの全処理を網羅した一覧ではなく、ゲーム内の挙動は名前だけでは確定できません。保存位置はDAT内のバイト位置で、DLLの実行アドレスではありません。'
export const GOLDENGLOW_AUTOCHESS_NOTE = 'AutoChessを含む所属先の項目です。通常戦闘での使用は未確認です。'
export type GoldenglowExtractionMatch = AnalysisMatch & { reason: 'name' | 'class-member' | 'owner'; autoChess: boolean }
export type GoldenglowExtraction = {
  summary: AnalysisSummary; extractedAt: string
  names: GoldenglowExtractionMatch[]; classes: GoldenglowExtractionMatch[]; referenceClasses: GoldenglowExtractionMatch[]
  methods: GoldenglowExtractionMatch[]; fields: GoldenglowExtractionMatch[]
}

// Only directly named classes expand to all of their members. Reference owners do not expand.
export function extractGoldenglow(document: AnalysisDocument): GoldenglowExtraction {
  const selectedClasses = new Set(document.classes.flatMap((record, id) => GOLDENGLOW_NAME.test(record.name) ? [id] : []))
  const owners = new Set<number>()
  function match(category: AnalysisCategory, id: number, reason: GoldenglowExtractionMatch['reason']): GoldenglowExtractionMatch {
    const item = analysisMatch(document, category, id)
    const ownerName = category === 'classes' ? document.classes[id].fullName : item.owner?.name || ''
    return { ...item, reason, autoChess: /autochess/i.test(ownerName) }
  }
  function members(category: 'methods' | 'fields') {
    return document[category].flatMap((record, id) => {
      const direct = GOLDENGLOW_NAME.test(record.name)
      if (!direct && !selectedClasses.has(record.ownerId)) return []
      owners.add(record.ownerId)
      return [match(category, id, direct ? 'name' : 'class-member')]
    })
  }
  const methods = members('methods'), fields = members('fields')
  return {
    summary: document.summary, extractedAt: new Date().toISOString(),
    names: document.entries.flatMap((record, id) => GOLDENGLOW_NAME.test(record.name) ? [match('names', id, 'name')] : []),
    classes: [...selectedClasses].map(id => match('classes', id, 'name')),
    referenceClasses: [...owners].filter(id => !selectedClasses.has(id)).map(id => match('classes', id, 'owner')),
    methods, fields,
  }
}

export type GoldenglowAnalysisCategory = AnalysisCategory | 'all'
export type GoldenglowAnalysisResults = Omit<AnalysisResults, 'matches' | 'category'> & { matches: GoldenglowExtractionMatch[]; category: GoldenglowAnalysisCategory }

// Browsing and owner navigation stay inside the extraction, including reference owners.
export function searchGoldenglowAnalysis(extraction: GoldenglowExtraction, query: string, category: GoldenglowAnalysisCategory = 'classes', page = 0, ownerId?: number): GoldenglowAnalysisResults {
  if (category !== 'all' && !Object.hasOwn(ANALYSIS_CATEGORY_LABELS, category)) throw new Error('一覧の種類が正しくありません。')
  if (!Number.isSafeInteger(page) || page < 0) throw new Error('ページ番号が正しくありません。')
  const needle = query.trim().toLowerCase()
  if (needle.length > 200) throw new Error('検索語は200文字以内で入力してください。')
  const classes = [...extraction.classes, ...extraction.referenceClasses]
  const ownerClass = ownerId === undefined ? undefined : classes.find(item => item.id === ownerId)
  if (ownerId !== undefined && (category === 'names' || !ownerClass)) throw new Error('GG関連に含まれない所属クラスです。')
  const directOwners = new Set(extraction.classes.map(item => item.id))
  const sortedMembers = (kind: 'methods' | 'fields') => [...extraction[kind]].sort((a, b) => Number(directOwners.has(b.owner!.id)) - Number(directOwners.has(a.owner!.id)))
  const records = category === 'all' ? [...classes, ...sortedMembers('methods'), ...sortedMembers('fields'), ...extraction.names]
    : category === 'classes' ? classes : category === 'names' ? extraction.names : sortedMembers(category)
  const filtered = records.filter(item => {
    if (ownerId !== undefined && (item.category === 'classes' ? item.id : item.owner?.id) !== ownerId) return false
    const ownerName = item.owner?.name || [item.namespace, item.name].filter(Boolean).join('.')
    return !needle || `${item.name}\n${ownerName}`.toLowerCase().includes(needle)
  })
  const total = filtered.length, pageCount = Math.ceil(total / ANALYSIS_RESULT_LIMIT)
  const currentPage = Math.min(page, Math.max(0, pageCount - 1))
  const matches = filtered.slice(currentPage * ANALYSIS_RESULT_LIMIT, (currentPage + 1) * ANALYSIS_RESULT_LIMIT).map(item => {
    let scoped = item
    if (item.category === 'classes') {
      const methodCount = extraction.methods.filter(m => m.owner?.id === item.id).length
      const fieldCount = extraction.fields.filter(m => m.owner?.id === item.id).length
      scoped = { ...item, methodCount, fieldCount, context: item.context
        .replace(/^処理:.*$/m, `GG関連として抽出した処理: ${methodCount}件`)
        .replace(/^データ項目:.*$/m, `GG関連として抽出したデータ項目: ${fieldCount}件`) }
    }
    const reason = item.reason === 'owner' ? '一致項目の所属先（参考情報）' : item.reason === 'name' ? '名前に一致' : 'GG関連のクラスに所属'
    return { ...scoped, context: `${scoped.context}\n\n抽出理由: ${reason}${item.autoChess ? `\n${GOLDENGLOW_AUTOCHESS_NOTE}` : ''}` }
  })
  return { summary: extraction.summary, matches, total, query: query.trim(), category, page: currentPage, pageCount,
    owner: ownerClass ? { id: ownerClass.id, name: [ownerClass.namespace, ownerClass.name].filter(Boolean).join('.') } : null }
}

export function formatGoldenglowTable(extraction: GoldenglowExtraction, query = '', category: GoldenglowAnalysisCategory = 'all', ownerId?: number): string {
  const first = searchGoldenglowAnalysis(extraction, query, category, 0, ownerId)
  const matches = [...first.matches]
  for (let page = 1; page < first.pageCount; page++) matches.push(...searchGoldenglowAnalysis(extraction, query, category, page, ownerId).matches)
  const cell = (value: string) => {
    const text = value.replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\r/g, '\\r').replace(/\n/g, '\\n')
    return /^[=+@-]/.test(text) ? `'${text}` : text
  }
  const rows = [['名前', '種類', '所属', '定義の保存位置', '名前の保存位置', '区分', '出典']]
  for (const item of matches) rows.push([
    item.name,
    item.category === 'classes' ? item.typeKind || 'クラス・型' : ANALYSIS_CATEGORY_LABELS[item.category],
    item.owner?.name || item.namespace || '',
    item.category === 'names' ? '' : item.location.replace('ファイル位置 ', ''),
    item.category === 'names' ? item.location.replace('ファイル位置 ', '') : item.nameLocation || '',
    [item.reason === 'owner' ? '所属先の参考情報' : '', item.autoChess ? GOLDENGLOW_AUTOCHESS_NOTE : ''].filter(Boolean).join(' / '),
    extraction.summary.fileName,
  ])
  return rows.map(row => row.map(cell).join('\t')).join('\r\n')
}

export function formatGoldenglowExtraction(extraction: GoldenglowExtraction): string {
  const { summary } = extraction
  const reasons = { name: '名前に直接一致', 'class-member': '該当クラスに所属', owner: '一致項目の所属先（参照用）' }
  // Keep untrusted metadata names on one line without losing literal control characters.
  const cell = (value: string) => value.replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\r/g, '\\r').replace(/\n/g, '\\n')
  const lines = ['ゴールデングロー関連メタデータ 抽出一覧', '',
    `対象ファイル: ${cell(summary.fileName)}`, `メタデータ版: ${summary.version}`, `抽出日時: ${extraction.extractedAt}`, '',
    `抽出範囲: ${GOLDENGLOW_EXTRACTION_SCOPE}`, GOLDENGLOW_EXTRACTION_LIMIT, '',
    `集計: 名前 ${extraction.names.length}件 / クラス・型 ${extraction.classes.length}件 / 参照用の所属先 ${extraction.referenceClasses.length}件 / 処理 ${extraction.methods.length}件 / データ項目 ${extraction.fields.length}件`,
  ]
  const sections: [string, GoldenglowExtractionMatch[]][] = [
    ['1. 名前', extraction.names], ['2. クラス・型（名前が一致）', extraction.classes],
    ['2-参考. 所属先のクラス・型', extraction.referenceClasses], ['3. 処理', extraction.methods], ['4. データ項目', extraction.fields],
  ]
  for (const [title, matches] of sections) {
    lines.push('', `${title}（${matches.length}件）`)
    if (!matches.length) lines.push('該当なし')
    for (const item of matches) {
      lines.push(`名前: ${cell(item.name)}`, `選定理由: ${reasons[item.reason]}`)
      if (item.category === 'classes') {
        lines.push(`所属: ${cell(item.namespace || 'なし')}`, `種類: ${item.typeKind}`)
        lines.push(`今回抽出した処理: ${extraction.methods.filter(m => m.owner?.id === item.id).length}件`, `今回抽出したデータ項目: ${extraction.fields.filter(m => m.owner?.id === item.id).length}件`)
      }
      if (item.owner) lines.push(`所属クラス: ${cell(item.owner.name)}`)
      if (item.autoChess) lines.push(`区分: ${GOLDENGLOW_AUTOCHESS_NOTE}`)
      lines.push(`${item.category === 'names' ? '名前' : '定義'}の保存位置: ${item.location}`)
      if (item.nameLocation) lines.push(`名前の保存位置: ${item.nameLocation}`)
      if (item.parameters) lines.push(`引数名: ${item.parameters.length ? item.parameters.map(n => cell(n || '（名前なし）')).join(', ') : 'なし'}`)
      lines.push('')
    }
  }
  return lines.join('\r\n')
}
