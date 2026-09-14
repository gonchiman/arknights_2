import test from 'node:test'
import assert from 'node:assert/strict'
import { ANALYSIS_RESULT_LIMIT, extractGoldenglow, formatGoldenglowExtraction, formatGoldenglowTable, readAnalysisFile, searchAnalysis, searchGoldenglowAnalysis } from '../src/lib/codeAnalysis.ts'

type ClassInput = { name: string; namespace?: string; kind?: 'class' | 'struct' | 'enum' | 'interface'; methods?: { name: string; args?: string[] }[]; fields?: string[] }
function metadata(extraNames: string[] = [], types: ClassInput[] = []) {
  const names = new Map<string, number>()
  const chunks: Uint8Array[] = []
  let size = 0
  function add(name: string) {
    if (names.has(name)) return
    names.set(name, size)
    const bytes = new TextEncoder().encode(name + '\0')
    chunks.push(bytes); size += bytes.length
  }
  add('')
  extraNames.forEach(add)
  types.forEach(type => {
    add(type.name); add(type.namespace || '')
    type.methods?.forEach(method => { add(method.name); method.args?.forEach(add) })
    type.fields?.forEach(add)
  })
  const methodCount = types.reduce((n, t) => n + (t.methods?.length || 0), 0)
  const fieldCount = types.reduce((n, t) => n + (t.fields?.length || 0), 0)
  const parameterCount = types.reduce((n, t) => n + (t.methods?.reduce((p, m) => p + (m.args?.length || 0), 0) || 0), 0)
  const classStart = Math.ceil((256 + size) / 4) * 4
  const methodStart = classStart + types.length * 88
  const fieldStart = methodStart + methodCount * 32
  const parameterStart = fieldStart + fieldCount * 12
  const buffer = new ArrayBuffer(parameterStart + parameterCount * 12)
  const v = new DataView(buffer)
  v.setUint32(0, 0xFAB11BAF, true); v.setInt32(4, 29, true)
  for (const [at, start, length] of [[24, 256, size], [160, classStart, types.length * 88], [48, methodStart, methodCount * 32], [96, fieldStart, fieldCount * 12], [88, parameterStart, parameterCount * 12]]) {
    v.setUint32(at, start, true); v.setInt32(at + 4, length, true)
  }
  let at = 256
  chunks.forEach(bytes => { new Uint8Array(buffer, at, bytes.length).set(bytes); at += bytes.length })
  let methodIndex = 0, fieldIndex = 0, parameterIndex = 0
  types.forEach((type, id) => {
    const p = classStart + id * 88, methods = type.methods || [], fields = type.fields || []
    v.setUint32(p, names.get(type.name)!, true); v.setUint32(p + 4, names.get(type.namespace || '')!, true)
    v.setInt32(p + 8, 987654321, true) // Native type reference; not a name or metadata type-definition index.
    v.setInt32(p + 32, fields.length ? fieldIndex : -1, true); v.setInt32(p + 36, methods.length ? methodIndex : -1, true)
    v.setUint16(p + 64, methods.length, true); v.setUint16(p + 68, fields.length, true)
    v.setUint32(p + 28, type.kind === 'interface' ? 0x20 : 0, true)
    v.setUint32(p + 80, type.kind === 'enum' ? 3 : type.kind === 'struct' ? 1 : 0, true)
    methods.forEach(method => {
      const m = methodStart + methodIndex++ * 32, args = method.args || []
      v.setUint32(m, names.get(method.name)!, true); v.setInt32(m + 4, id, true)
      v.setInt32(m + 8, 987654321, true)
      v.setInt32(m + 12, args.length ? parameterIndex : -1, true); v.setUint16(m + 30, args.length, true)
      args.forEach(arg => { const p = parameterStart + parameterIndex++ * 12; v.setUint32(p, names.get(arg)!, true); v.setInt32(p + 8, 987654321, true) })
    })
    fields.forEach(field => { const f = fieldStart + fieldIndex++ * 12; v.setUint32(f, names.get(field)!, true); v.setInt32(f + 4, 987654321, true) })
  })
  return { buffer, v, names, classStart, methodStart, fieldStart, parameterStart }
}
const example = () => metadata(['先頭'], [
  { name: 'GdglowHitBehaviour', namespace: 'Battle.Projectiles', methods: [{ name: 'Hit', args: ['target'] }, { name: 'Hit', args: ['target', 'damage'] }], fields: ['target', 'damage'] },
  { name: 'GdglowHitBehaviour', namespace: 'Other', methods: [{ name: 'Hit' }], fields: ['target'] },
  { name: 'Empty' },
])

test('name list uses UTF-8 byte offsets and remains distinct from definition records', () => {
  const fixture = example(), doc = readAnalysisFile('global-metadata.dat', fixture.buffer)
  const name = searchAnalysis(doc, 'gdglow').matches[0]
  assert.equal(name.location, `ファイル位置 0x${(256 + fixture.names.get('GdglowHitBehaviour')!).toString(16).toUpperCase()}`)
  assert.match(name.context, /名前の保存位置/)
  const type = searchAnalysis(doc, '', 'classes').matches[0]
  assert.notEqual(type.location, name.location)
  assert.match(type.context, /定義レコードの保存位置/)
  assert.match(type.context, /関数の実行アドレスではありません/)
  assert.equal(searchAnalysis(doc, '関数').total, 0)
})

test('lists classes, overloads, fields and parameter names using exact owning-class IDs', () => {
  const doc = readAnalysisFile('copy.DAT', example().buffer)
  assert.deepEqual(doc.summary.counts, { names: doc.entries.length, classes: 3, methods: 3, fields: 3 })
  const classes = searchAnalysis(doc, 'gdglow', 'classes')
  assert.equal(classes.total, 2)
  assert.equal(classes.matches[0].methodCount, 2)
  assert.equal(classes.matches[0].fieldCount, 2)
  const methods = searchAnalysis(doc, '', 'methods', 0, classes.matches[0].id)
  assert.deepEqual(methods.matches.map(m => m.name), ['Hit', 'Hit'])
  assert.deepEqual(methods.matches.map(m => m.parameters), [['target'], ['target', 'damage']])
  assert.notEqual(methods.matches[0].id, methods.matches[1].id)
  assert.equal(methods.owner?.name, 'Battle.Projectiles.GdglowHitBehaviour')
  assert.equal(searchAnalysis(doc, '', 'fields', 0, 1).total, 1)
  assert.equal(searchAnalysis(doc, '', 'classes', 0, 1).matches[0].namespace, 'Other')
  assert.equal(searchAnalysis(doc, '', 'methods', 0, 2).total, 0)
  assert.equal(searchAnalysis(doc, ' BATTLE.PROJECTILES ', 'fields').total, 2)
  assert.equal(searchAnalysis(doc, '987654321', 'methods').total, 0)
})

test('retains class kinds, empty namespaces, empty parameter names and empty member ranges', () => {
  const doc = readAnalysisFile('metadata.dat', metadata([], [
    { name: 'A', kind: 'interface' }, { name: 'B', kind: 'enum' }, { name: 'C', kind: 'struct', methods: [{ name: 'M', args: [''] }] },
  ]).buffer)
  assert.deepEqual(searchAnalysis(doc, '', 'classes').matches.map(m => m.typeKind), ['インターフェース', '列挙型', '構造体'])
  const method = searchAnalysis(doc, '', 'methods').matches[0]
  assert.deepEqual(method.parameters, [''])
  assert.match(method.context, /名前なし/)
})

test('paginates all entries including unfiltered and final pages without duplicates', () => {
  for (const count of [0, 200, 201, 400, 401]) {
    const doc = readAnalysisFile('metadata.dat', metadata(Array.from({ length: count }, (_, i) => `Name_${i}`)).buffer)
    const first = searchAnalysis(doc, '')
    assert.equal(first.total, count)
    assert.equal(first.pageCount, Math.ceil(count / ANALYSIS_RESULT_LIMIT))
    const ids: number[] = []
    for (let p = 0; p < first.pageCount; p++) ids.push(...searchAnalysis(doc, '', 'names', p).matches.map(m => m.id))
    assert.equal(new Set(ids).size, count)
    assert.equal(ids.length, count)
    const last = searchAnalysis(doc, '', 'names', 999)
    assert.equal(last.page, Math.max(0, first.pageCount - 1))
    assert.ok(last.matches.length <= ANALYSIS_RESULT_LIMIT)
    assert.equal(searchAnalysis(doc, 'not-found', 'names', 999).page, 0)
  }
})

test('rejects unsupported files, versions, incomplete headers and invalid queries', () => {
  for (const name of ['dump.cs', 'script.json', 'GameAssembly.dll']) assert.throws(() => readAnalysisFile(name, example().buffer), /DATファイル専用/)
  assert.throws(() => readAnalysisFile('empty.dat', new ArrayBuffer(0)), /空/)
  assert.throws(() => readAnalysisFile('short.dat', new ArrayBuffer(255)), /ヘッダー/)
  for (const [at, value] of [[0, 0], [4, 31]]) { const f = example(); f.v.setInt32(at, value, true); assert.throws(() => readAnalysisFile('bad.dat', f.buffer)) }
  const doc = readAnalysisFile('metadata.dat', example().buffer)
  assert.throws(() => searchAnalysis(doc, 'x'.repeat(201)), /200/)
  assert.throws(() => searchAnalysis(doc, '', 'names', -1), /ページ/)
  assert.throws(() => searchAnalysis(doc, '', 'fields', 0, 999), /所属/)
  assert.throws(() => searchAnalysis(doc, '', 'names', 0, 0), /所属/)
})

test('rejects invalid region sizes, overlaps, references and ownership', () => {
  const changes = [
    (f: ReturnType<typeof example>) => f.v.setInt32(28, -1, true),
    (f: ReturnType<typeof example>) => f.v.setUint32(160, 0xFFFFFFF0, true),
    (f: ReturnType<typeof example>) => f.v.setInt32(52, 31, true),
    (f: ReturnType<typeof example>) => f.v.setUint32(160, 256, true),
    (f: ReturnType<typeof example>) => f.v.setInt32(f.classStart + 32, -2, true),
    (f: ReturnType<typeof example>) => f.v.setUint16(f.classStart + 64, 999, true),
    (f: ReturnType<typeof example>) => f.v.setInt32(f.methodStart + 4, 1, true),
    (f: ReturnType<typeof example>) => f.v.setInt32(f.methodStart + 12, 999, true),
    (f: ReturnType<typeof example>) => f.v.setInt32(f.classStart + 88 + 32, 0, true),
    (f: ReturnType<typeof example>) => f.v.setUint32(f.fieldStart, 0xFFFFFFF0, true),
    (f: ReturnType<typeof example>) => f.v.setUint8(256 + f.v.getInt32(28, true) - 1, 65),
  ]
  for (const change of changes) { const f = example(); change(f); assert.throws(() => readAnalysisFile('bad.dat', f.buffer)) }
})

test('keeps references to unreadable names as placeholders and preserves later valid entries', () => {
  const f = metadata([], [{ name: 'Bad', methods: [{ name: 'Run' }], fields: ['Field'] }, { name: 'Good' }])
  f.v.setUint8(256 + f.names.get('Bad')!, 0xFF)
  const doc = readAnalysisFile('global-metadata.dat', f.buffer)
  assert.equal(doc.summary.skippedNames, 1)
  assert.equal(searchAnalysis(doc, 'Bad').total, 0)
  assert.match(searchAnalysis(doc, '', 'classes').matches[0].name, /読めない名前/)
  assert.match(searchAnalysis(doc, '', 'fields').matches[0].owner!.name, /読めない名前/)
  assert.equal(searchAnalysis(doc, 'Good', 'classes').total, 1)
})

test('GG extraction follows exact class ownership without expanding reference owners or namespaces', () => {
  const fixture = metadata([], [
    { name: 'GdglowHitBehaviour', namespace: 'Torappu.Battle.Projectiles', methods: [{ name: 'Init', args: ['target'] }, { name: 'Init', args: ['target', 'damage'] }], fields: ['m_prob'] },
    { name: 'GdglowHitBehaviour', namespace: 'Other', methods: [{ name: 'Init' }] },
    { name: 'AutoChessBattleTrigger', namespace: 'Torappu.Battle.AutoChess', methods: [{ name: '_GdglowSearchEnemy' }, { name: 'Unrelated' }], fields: ['__Hotfix0__GdglowSearchEnemy', 'Unrelated'] },
    { name: 'AutoChessSkillTriggerType', namespace: 'Torappu', kind: 'enum', fields: ['GDGLOW_SKILL_2', 'OtherSkill'] },
    { name: 'Unrelated', namespace: 'GdglowNamespace', methods: [{ name: 'Init' }], fields: ['m_prob'] },
  ])
  const doc = readAnalysisFile('copy.dat', fixture.buffer), result = extractGoldenglow(doc)
  assert.equal(result.names.length, 5) // Includes the namespace string, but it does not select the unrelated class.
  assert.deepEqual(result.classes.map(m => m.id), [0, 1])
  assert.deepEqual(result.referenceClasses.map(m => m.id), [2, 3])
  assert.deepEqual(result.methods.map(m => m.owner!.id), [0, 0, 1, 2])
  assert.deepEqual(result.fields.map(m => m.owner!.id), [0, 2, 3])
  assert.deepEqual(result.methods.slice(0, 2).map(m => m.parameters), [['target'], ['target', 'damage']])
  assert.equal(new Set(result.methods.map(m => m.id)).size, 4)
  assert.equal(result.methods[0].reason, 'class-member')
  assert.equal(result.methods[3].reason, 'name')
  assert.ok(result.referenceClasses.every(m => m.autoChess && m.reason === 'owner'))
  assert.ok(result.classes.every(m => !m.autoChess))
  const namedClass = result.classes[0]
  assert.equal(namedClass.nameLocation, `0x${(256 + fixture.names.get('GdglowHitBehaviour')!).toString(16).toUpperCase()}`)
  assert.notEqual(namedClass.nameLocation, namedClass.location.replace('ファイル位置 ', ''))
  const text = formatGoldenglowExtraction(result)
  assert.match(text, /対象ファイル: copy.dat/)
  assert.match(text, /メタデータ版: 29/)
  assert.match(text, /引数名: target, damage/)
  assert.match(text, /AutoChessを含む所属先/)
  assert.match(text, /通常戦闘での使用は未確認/)
  assert.match(text, /DLLの実行アドレスではありません/)
  assert.doesNotMatch(text, /Unrelated|OtherSkill/)
})

test('GG extraction includes every member past the display page limit and leaves searches unchanged', () => {
  const methods = Array.from({ length: 205 }, (_, i) => ({ name: `Hit_${i}` }))
  const doc = readAnalysisFile('many.dat', metadata([], [{ name: 'Gdglow', methods, fields: ['_gdglowField'] }]).buffer)
  const before = searchAnalysis(doc, 'absent', 'fields', 0, 0)
  const result = extractGoldenglow(doc)
  assert.equal(result.methods.length, 205)
  assert.equal(result.fields.length, 1)
  assert.equal(result.referenceClasses.length, 0)
  assert.deepEqual(searchAnalysis(doc, 'absent', 'fields', 0, 0), before)
  const text = formatGoldenglowExtraction(result)
  assert.equal((text.match(/^名前: Hit_/gm) || []).length, 205)
  assert.match(text, /Hit_204/)
})

test('GG aliases, no matches and text with control characters are handled without interpreting behavior', () => {
  const empty = extractGoldenglow(readAnalysisFile('empty.dat', metadata(['Glow', 'Golden'], [{ name: 'Normal' }]).buffer))
  for (const category of ['names', 'classes', 'methods', 'fields', 'referenceClasses'] as const) assert.equal(empty[category].length, 0)
  assert.match(formatGoldenglowExtraction(empty), /該当なし/)
  const result = extractGoldenglow(readAnalysisFile('alias.dat', metadata(['Goldenglow', 'GOLDEN_GLOW', 'golden-glow', 'golden glow', 'ゴールデングロー', '澄闪', '澄閃'], [{ name: 'gdglow', methods: [{ name: 'Hit\nFake\tValue', args: ['x\\y'] }] }]).buffer))
  assert.equal(result.names.length, 8)
  assert.equal(result.methods.length, 1)
  const text = formatGoldenglowExtraction(result)
  assert.ok(text.includes('Hit\\nFake\\tValue'))
  assert.ok(text.includes('x\\\\y'))
  assert.ok(!text.includes('Hit\nFake'))
})

test('GG browsing keeps reference-owner navigation and counts inside the extraction', () => {
  const extraction = extractGoldenglow(readAnalysisFile('global-metadata.dat', metadata([], [
    { name: 'AutoChessBattleTrigger', namespace: 'Torappu.Battle.AutoChess', methods: [{ name: '_GdglowSearchEnemy' }, { name: 'Unrelated' }], fields: ['__Hotfix0__GdglowSearchEnemy', 'Unrelated'] },
    { name: 'GdglowHitBehaviour', namespace: 'Torappu.Battle.Projectiles', methods: [{ name: 'Hit' }], fields: ['m_prob'] },
    { name: 'AutoChessSkillTriggerType', namespace: 'Torappu', kind: 'enum', fields: ['GDGLOW_SKILL_2', 'OtherSkill'] },
    { name: 'Unrelated', methods: [{ name: 'Hit' }] },
  ]).buffer))
  const before = formatGoldenglowExtraction(extraction)
  const classes = searchGoldenglowAnalysis(extraction, '')
  assert.deepEqual(classes.matches.map(m => m.id), [1, 0, 2])
  assert.deepEqual(classes.matches.map(m => [m.methodCount, m.fieldCount]), [[1, 1], [1, 1], [0, 1]])
  const owner = searchGoldenglowAnalysis(extraction, '', 'classes', 0, 0)
  assert.equal(owner.matches[0].reason, 'owner')
  assert.match(owner.matches[0].context, /GG関連として抽出した処理: 1件/)
  assert.match(owner.matches[0].context, /通常戦闘での使用は未確認/)
  assert.equal(owner.owner?.name, 'Torappu.Battle.AutoChess.AutoChessBattleTrigger')
  assert.equal(extraction.referenceClasses[0].methodCount, 2)
  assert.deepEqual(searchGoldenglowAnalysis(extraction, '', 'methods', 0, 0).matches.map(m => m.name), ['_GdglowSearchEnemy'])
  assert.deepEqual(searchGoldenglowAnalysis(extraction, '', 'fields', 0, 0).matches.map(m => m.name), ['__Hotfix0__GdglowSearchEnemy'])
  assert.deepEqual(searchGoldenglowAnalysis(extraction, '', 'methods').matches.map(m => m.name), ['Hit', '_GdglowSearchEnemy'])
  assert.equal(searchGoldenglowAnalysis(extraction, 'Unrelated', 'methods').total, 0)
  assert.equal(searchGoldenglowAnalysis(extraction, ' TORAPPU.BATTLE.PROJECTILES.GDGLOWHITBEHAVIOUR ', 'classes').total, 1)
  assert.equal(searchGoldenglowAnalysis(extraction, 'Hit', 'methods', 0, 0).total, 0)
  assert.throws(() => searchGoldenglowAnalysis(extraction, '', 'methods', 0, 3), /所属/)
  assert.throws(() => searchGoldenglowAnalysis(extraction, '', 'names', 0, 0), /所属/)
  assert.equal(formatGoldenglowExtraction(extraction), before)
})

test('GG unified table includes all categories with distinct row identities and scoped class counts', () => {
  const extraction = extractGoldenglow(readAnalysisFile('global-metadata.dat', metadata([], [
    { name: 'Gdglow', methods: [{ name: 'Hit' }], fields: ['m_prob'] },
    { name: 'AutoChessTrigger', methods: [{ name: '_GdglowSearchEnemy' }, { name: 'Other' }] },
  ]).buffer))
  const all = searchGoldenglowAnalysis(extraction, '', 'all')
  assert.equal(all.total, 7)
  assert.deepEqual(all.matches.map(m => m.category), ['classes', 'classes', 'methods', 'methods', 'fields', 'names', 'names'])
  assert.equal(new Set(all.matches.map(m => `${m.category}:${m.id}`)).size, all.total)
  assert.equal(all.matches[1].methodCount, 1)
  assert.equal(searchGoldenglowAnalysis(extraction, 'Other', 'all').total, 0)
  assert.deepEqual(searchGoldenglowAnalysis(extraction, '', 'all', 0, 0).matches.map(m => m.category), ['classes', 'methods', 'fields'])
  const many = extractGoldenglow(readAnalysisFile('many.dat', metadata([], [{ name: 'Gdglow', methods: Array.from({ length: 201 }, (_, i) => ({ name: `Hit_${i}` })) }]).buffer))
  const pages = [0, 1].flatMap(page => searchGoldenglowAnalysis(many, '', 'all', page).matches)
  assert.equal(pages.length, 203)
  assert.equal(new Set(pages.map(m => `${m.category}:${m.id}`)).size, 203)
})

test('GG table copy follows filters across all pages and preserves columns, source and reference notes', () => {
  const extraction = extractGoldenglow(readAnalysisFile('copy.dat', metadata([], [
    { name: 'Gdglow', methods: Array.from({ length: 205 }, (_, i) => ({ name: `Hit_${i}` })), fields: ['=Danger\tName\nNext'] },
    { name: 'AutoChessTrigger', methods: [{ name: '_GdglowSearchEnemy' }, { name: 'Unrelated' }] },
  ]).buffer))
  const lines = formatGoldenglowTable(extraction, '', 'methods', 0).split('\r\n')
  assert.equal(lines.length, 206)
  assert.equal(lines[0], '名前\t種類\t所属\t定義の保存位置\t名前の保存位置\t区分\t出典')
  assert.ok(lines.every(line => line.split('\t').length === 7))
  assert.match(lines.at(-1)!, /^Hit_204\t.*\tcopy.dat$/)
  assert.equal(formatGoldenglowTable(extraction, 'absent').split('\r\n').length, 1)
  const refs = formatGoldenglowTable(extraction, '', 'classes', 1)
  assert.match(refs, /所属先の参考情報/)
  assert.match(refs, /通常戦闘での使用は未確認/)
  const field = formatGoldenglowTable(extraction, '', 'fields').split('\r\n')[1]
  assert.ok(field.startsWith("'=Danger\\tName\\nNext\t"))
  const name = formatGoldenglowTable(extraction, '', 'names').split('\r\n')[1].split('\t')
  assert.equal(name[3], '')
  assert.match(name[4], /^0x/)
})

test('GG browsing paginates and handles valid empty results without widening the scope', () => {
  const methods = Array.from({ length: 205 }, (_, i) => ({ name: `Hit_${i}` }))
  const extraction = extractGoldenglow(readAnalysisFile('many.dat', metadata([], [
    { name: 'Gdglow', methods }, { name: 'Other', methods: [{ name: 'Unrelated' }] },
  ]).buffer))
  const first = searchGoldenglowAnalysis(extraction, '', 'methods')
  const last = searchGoldenglowAnalysis(extraction, '', 'methods', 999)
  assert.equal(first.total, 205)
  assert.equal(first.matches.length, 200)
  assert.equal(last.page, 1)
  assert.equal(last.matches.length, 5)
  assert.equal(new Set([...first.matches, ...last.matches].map(m => m.id)).size, 205)
  assert.equal(searchGoldenglowAnalysis(extraction, 'Unrelated', 'methods', 999).page, 0)
  assert.throws(() => searchGoldenglowAnalysis(extraction, '', 'methods', -1), /ページ/)
  assert.throws(() => searchGoldenglowAnalysis(extraction, 'x'.repeat(201)), /200/)
  const empty = extractGoldenglow(readAnalysisFile('empty.dat', metadata([], [{ name: 'Other' }]).buffer))
  for (const category of ['names', 'classes', 'methods', 'fields'] as const) {
    const result = searchGoldenglowAnalysis(empty, '', category)
    assert.equal(result.total, 0)
    assert.equal(result.pageCount, 0)
    assert.deepEqual(result.matches, [])
  }
})
