import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseOperatorWikiRosterSnapshot } from '../src/lib/operatorWikiRoster.ts'
import { parseOperatorWikiViewSnapshot, WIKI_ROOT, wikiPageTitle } from '../src/lib/operatorWikiViews.ts'
import { createWikiRequester, extractPageBody } from './refreshOperatorWikiComments.mjs'
import { wikiHtmlText } from './refreshOperatorWikiViews.mjs'

const TITLE = 'キャラクター一覧'
const ROSTER_PATH = fileURLToPath(new URL('../public/data/operator-wiki-roster.json', import.meta.url))
const VIEWS_PATH = fileURLToPath(new URL('../public/data/operator-wiki-views.json', import.meta.url))
const STAGING_DIRECTORY = fileURLToPath(new URL('../.cache/operator-wiki-roster/', import.meta.url))
const SOURCE_PATH = fileURLToPath(new URL('../.cache/wiki-roster-source.html', import.meta.url))
const PROFESSIONS = new Map([
  ['先鋒', 'PIONEER'], ['前衛', 'WARRIOR'], ['重装', 'TANK'], ['狙撃', 'SNIPER'],
  ['術師', 'CASTER'], ['医療', 'MEDIC'], ['補助', 'SUPPORT'], ['特殊', 'SPECIAL'],
])
const TABLE_HEADERS = ['名前', '職業', '職分', 'HP', '攻撃力', '防御力', '術耐性', '再配置', 'コスト', 'ブロック数', '攻撃速度', '入手方法', '募集タグ']

// The current operator table explicitly uses the playable page; /?W is the separate story/enemy page.
export const OPERATOR_WIKI_PAGE_ALIASES = new Map([
  [WIKI_ROOT + '?W', WIKI_ROOT + '?' + encodeURIComponent('W(プレイアブル)')],
])

export function resolveOperatorWikiRosterUrl(address) {
  try {
    const url = new URL(address, WIKI_ROOT)
    if (url.origin + url.pathname !== WIKI_ROOT || url.username || url.password || url.hash || !url.search) return null
    const title = decodeURIComponent(url.search.slice(1).replaceAll('+', ' ')).normalize('NFC')
    if (!title.trim() || /[\u0000-\u001f\u007f=]/u.test(title) || title.startsWith('コメント/')) return null
    return WIKI_ROOT + '?' + encodeURIComponent(title)
  } catch {
    return null
  }
}

function readTitle(address) {
  return wikiPageTitle(resolveOperatorWikiRosterUrl(address))
}

function readNameCell(cell) {
  const link = /^\s*<a\b[^>]*\bhref="([^"]+)"[^>]*>([^]*?)<\/a>\s*$/i.exec(cell)
  if (!link) throw new Error('Wiki のオペレーター名リンクを確認できません。')
  const wikiUrl = resolveOperatorWikiRosterUrl(wikiHtmlText(link[1]))
  const name = wikiHtmlText(link[2])
  if (!wikiUrl || !name) throw new Error('Wiki のオペレーター名が不正です。')
  return { name, wikiUrl }
}

function readTable(table, rarity) {
  const rows = [...table.matchAll(/<tr\b[^>]*>([^]*?)<\/tr>/gi)]
  const header = rows.shift()?.[1]
  const headings = [...(header?.matchAll(/<t[dh]\b[^>]*>([^]*?)<\/t[dh]>/gi) ?? [])].map(match => wikiHtmlText(match[1]))
  if (headings.length !== 14 || headings.slice(1).join('|') !== TABLE_HEADERS.join('|')) {
    throw new Error('Wiki のオペレーター表の列構成を確認できません。')
  }
  return rows.map(([, row]) => {
    const cells = [...row.matchAll(/<td\b[^>]*>([^]*?)<\/td>/gi)].map(match => match[1])
    if (cells.length !== 14) throw new Error('Wiki のオペレーター行の列数が不正です。')
    const { name, wikiUrl } = readNameCell(cells[1])
    const profession = PROFESSIONS.get(wikiHtmlText(cells[2]))
    if (!profession) throw new Error('Wiki のオペレーターの職業を確認できません。 ' + name)
    return { name, wikiUrl, profession, rarity }
  })
}

export function parseOperatorWikiRosterHtml(html) {
  const body = extractPageBody(html, TITLE, false, readTitle)
  const rarities = new Set()
  const entries = new Map()
  let rarity = null
  for (const [markup] of body.matchAll(/<h[23]\b[^>]*>[^]*?<\/h[23]>|<table\b[^>]*>[^]*?<\/table>/gi)) {
    if (/^<h/i.test(markup)) {
      rarity = Number(/^★([1-6])キャラ(?:\s|$)/u.exec(wikiHtmlText(markup))?.[1]) || null
      continue
    }
    if (rarity === null) continue
    if (rarities.has(rarity)) throw new Error('Wiki のオペレーター表が重複しています。')
    const rows = readTable(markup, rarity)
    if (!rows.length) throw new Error('Wiki のオペレーター表に行がありません。')
    for (const row of rows) {
      if (entries.has(row.wikiUrl)) throw new Error('Wiki のオペレーターページが重複しています。 ' + row.name)
      entries.set(row.wikiUrl, row)
    }
    rarities.add(rarity)
    rarity = null
  }
  if (rarities.size !== 6) throw new Error('Wiki の各レアリティのオペレーター表を確認できません。')
  return [...entries.values()]
}

export function mergeOperatorWikiRoster(discovered, { viewsSnapshot, previousRoster } = {}) {
  const identities = new Map()
  for (const entry of viewsSnapshot?.entries ?? []) {
    identities.set(OPERATOR_WIKI_PAGE_ALIASES.get(entry.wikiUrl) ?? entry.wikiUrl, entry.operatorId)
  }
  for (const entry of previousRoster?.entries ?? []) {
    const canonical = OPERATOR_WIKI_PAGE_ALIASES.get(entry.wikiUrl) ?? entry.wikiUrl
    if (!identities.has(canonical)) identities.set(canonical, entry.operatorId)
  }
  const entries = new Map()
  for (const row of discovered) {
    const operatorId = identities.get(row.wikiUrl) ?? 'wiki:' + encodeURIComponent(wikiPageTitle(row.wikiUrl))
    entries.set(row.wikiUrl, { operatorId, ...row })
  }
  for (const row of previousRoster?.entries ?? []) {
    const canonical = OPERATOR_WIKI_PAGE_ALIASES.get(row.wikiUrl) ?? row.wikiUrl
    if (!entries.has(canonical)) entries.set(canonical, row)
  }
  return [...entries.values()]
}

export async function collectOperatorWikiRoster({
  viewsSnapshot,
  previousRoster,
  sourcePath = SOURCE_PATH,
  request = createWikiRequester({ userAgent: 'Arknights Analyze Tool (Wiki operator roster)' }),
  now = () => new Date(),
} = {}) {
  const html = await request(WIKI_ROOT + '?' + encodeURIComponent(TITLE))
  await mkdir(dirname(sourcePath), { recursive: true })
  await writeFile(sourcePath, html)
  const entries = mergeOperatorWikiRoster(parseOperatorWikiRosterHtml(html), { viewsSnapshot, previousRoster })
  return parseOperatorWikiRosterSnapshot({ observedAt: now().toISOString(), entries })
}

async function readJson(path) {
  try {
    return JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/u, ''))
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

export async function refreshOperatorWikiRoster({
  rosterPath = ROSTER_PATH,
  viewsPath = VIEWS_PATH,
  stagingDirectory = STAGING_DIRECTORY,
  ...options
} = {}) {
  await mkdir(stagingDirectory, { recursive: true })
  const lockPath = join(stagingDirectory, 'collection.lock')
  const lock = await open(lockPath, 'wx')
  try {
    const saved = await readJson(rosterPath)
    const previousRoster = saved && parseOperatorWikiRosterSnapshot(saved)
    const savedViews = await readJson(viewsPath)
    const viewsSnapshot = savedViews && parseOperatorWikiViewSnapshot(savedViews)
    const snapshot = await collectOperatorWikiRoster({ ...options, previousRoster, viewsSnapshot })
    const temporary = join(stagingDirectory, randomUUID() + '.json')
    await mkdir(dirname(rosterPath), { recursive: true })
    await writeFile(temporary, JSON.stringify(snapshot, null, 2) + '\n', { flag: 'wx' })
    for (let attempt = 0; ; attempt += 1) {
      try {
        await rename(temporary, rosterPath)
        break
      } catch (error) {
        const locked = process.platform === 'win32' && ['EPERM', 'EACCES', 'EBUSY'].includes(error.code)
        if (!locked || attempt === 4) throw new Error('Wiki オペレーター一覧を保存できません。取得済みデータ ' + temporary, { cause: error })
        await delay(250 * (attempt + 1))
      }
    }
    console.log('Wiki オペレーター一覧を更新しました。' + snapshot.entries.length + '件。')
    return snapshot
  } finally {
    await lock.close()
    await unlink(lockPath)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length > 2) throw new Error('npm run refresh:operator-wiki-roster')
  await refreshOperatorWikiRoster()
}
