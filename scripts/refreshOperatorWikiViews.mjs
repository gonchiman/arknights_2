import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseOperatorWikiViewSnapshot } from '../src/lib/operatorWikiViews.ts'
import { saveOperatorWikiViewHistory } from './archiveOperatorWikiViews.mjs'

const SNAPSHOT_PATH = fileURLToPath(new URL('../public/data/operator-wiki-views.json', import.meta.url))
const STAGING_DIRECTORY = fileURLToPath(new URL('../.cache/', import.meta.url))
const REQUEST_INTERVAL_MS = 1000
const REQUEST_TIMEOUT_MS = 15000
const MAX_CONSECUTIVE_FAILURES = 5
const PROGRESS_INTERVAL = 50
const DAY_MS = 86_400_000
const formatDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', dateStyle: 'short' })
const COUNT_LABELS = new Map([['今日', 'today'], ['昨日', 'yesterday'], ['合計', 'total']])
const HTML_ENTITIES = { amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"' }

export function wikiHtmlText(html) {
  return html.replace(/<!--[^]*?-->|<[^>]*>/g, '').replace(/&(#x[\da-f]+|#\d+|amp|apos|gt|lt|nbsp|quot);/gi, (match, entity) => {
    const key = entity.toLowerCase()
    if (key[0] !== '#') return HTML_ENTITIES[key]
    const code = key[1] === 'x' ? Number.parseInt(key.slice(2), 16) : Number(key.slice(1))
    return code <= 0x10ffff ? String.fromCodePoint(code) : match
  }).trim().normalize('NFC')
}

export function assertOperatorWikiPageTitle(html, pageTitle) {
  const pageHeading = /<h1\b[^>]*>([^]*?)<\/h1>/i.exec(html)
  if (!pageHeading || wikiHtmlText(pageHeading[1]) !== pageTitle.normalize('NFC')) {
    throw new Error(`ページの見出しが Wiki ページ名「${pageTitle}」と一致しません。`)
  }

}

export function parseOperatorWikiPage(html, pageTitle) {
  assertOperatorWikiPageTitle(html, pageTitle)

  const counterHeading = [...html.matchAll(/<h([2-6])\b[^>]*>([^]*?)<\/h\1>/gi)]
    .find(match => wikiHtmlText(match[2]) === 'カウンター')
  if (!counterHeading) throw new Error('カウンターが見つかりません。')

  const section = html.slice(counterHeading.index + counterHeading[0].length).split(/<h[1-6]\b/i, 1)[0]
  const list = /<ul\b[^>]*>([^]*?)<\/ul>/i.exec(section)?.[1] ?? ''
  const counts = {}
  for (const [, item] of list.matchAll(/<li\b[^>]*>([^]*?)<\/li>/gi)) {
    const match = /^(合計|今日|昨日)\s*[：:]\s*(\d+|\d{1,3}(?:,\d{3})+)$/.exec(wikiHtmlText(item))
    if (!match) continue
    const key = COUNT_LABELS.get(match[1])
    const count = Number(match[2].replaceAll(',', ''))
    if (Object.hasOwn(counts, key) || !Number.isSafeInteger(count)) throw new Error('カウンターの値が不正です。')
    counts[key] = count
  }
  if (Object.keys(counts).length !== COUNT_LABELS.size) throw new Error('カウンターの値を取得できません。')
  return counts
}

function snapshotTimes(date) {
  const todayDate = formatDate.format(date)
  const yesterdayDate = new Date(Date.parse(todayDate) - DAY_MS).toISOString().slice(0, 10)
  return { observedAt: date.toISOString(), todayDate, yesterdayDate }
}

export async function collectOperatorWikiViewSnapshot(mapping) {
  if (!Array.isArray(mapping) || mapping.length === 0) throw new Error('取得する Wiki ページを指定してください。')
  const times = snapshotTimes(new Date())
  const { entries } = parseOperatorWikiViewSnapshot({
    ...times,
    entries: mapping.map(entry => ({
      operatorId: entry?.operatorId,
      wikiUrl: entry?.wikiUrl,
      yesterday: null,
      today: null,
      total: null,
    })),
  })
  const sameDay = (date) => {
    if (formatDate.format(date) !== times.todayDate) {
      throw new Error('取得中に日付が変わりました。日付を揃えるため、再実行してください。')
    }
  }

  const collected = []
  let succeeded = 0
  let consecutiveFailures = 0
  let nextRequestAt = 0
  for (const [index, entry] of entries.entries()) {
    const { operatorId, wikiUrl } = entry
    const remaining = nextRequestAt - performance.now()
    if (remaining > 0) await delay(Math.ceil(remaining))
    sameDay(new Date())
    nextRequestAt = performance.now() + REQUEST_INTERVAL_MS
    let status
    try {
      const response = await fetch(wikiUrl, {
        headers: { Accept: 'text/html', 'User-Agent': 'Arknights Analyze Tool (Wiki view snapshot)' },
        redirect: 'error',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      status = response.status
      if (!response.ok) throw new Error(`HTTP ${status}`)
      const title = decodeURIComponent(wikiUrl.slice(wikiUrl.indexOf('?') + 1))
      collected.push({ operatorId, wikiUrl, ...parseOperatorWikiPage(await response.text(), title) })
      succeeded += 1
      consecutiveFailures = 0
    } catch (error) {
      const message = `${operatorId} の取得に失敗しました。${error.message}`
      if (status === 403 || status === 429) throw new Error(message, { cause: error })
      console.warn(message)
      collected.push(entry)
      consecutiveFailures += 1
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        throw new Error('取得失敗が連続したため、更新を中断しました。')
      }
    }
    if ((index + 1) % PROGRESS_INTERVAL === 0) {
      console.log(`${index + 1}/${entries.length}件処理済み（取得成功 ${succeeded}件）`)
    }
  }

  const finished = new Date()
  sameDay(finished)
  if (succeeded === 0) throw new Error('閲覧数を取得できたページがないため、更新を中断しました。')
  return parseOperatorWikiViewSnapshot({ ...snapshotTimes(finished), entries: collected })
}

async function readJson(path) {
  return JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''))
}

async function refreshOperatorWikiViews(mappingPath) {
  const previous = await readJson(SNAPSHOT_PATH).then(parseOperatorWikiViewSnapshot).catch(error => {
    if (mappingPath && error.code === 'ENOENT') return null
    throw error
  })
  const mapping = mappingPath
    ? await readJson(mappingPath)
    : previous.entries
  const snapshot = await collectOperatorWikiViewSnapshot(mapping)
  // Keep completed acquisitions outside Vite's public directory until publication.
  await mkdir(STAGING_DIRECTORY, { recursive: true })
  const temporary = join(STAGING_DIRECTORY, `operator-wiki-views.${randomUUID()}.json`)
  await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, { flag: 'wx' })
  try {
    if (previous) await saveOperatorWikiViewHistory(previous)
    await saveOperatorWikiViewHistory(snapshot)
    await rename(temporary, SNAPSHOT_PATH)
  } catch (error) {
    throw new Error(`Wiki 閲覧数を保存できませんでした。取得済みデータ: ${temporary}`, { cause: error })
  }
  console.log(`Wiki 閲覧数を更新しました。${snapshot.entries.length}件、${snapshot.todayDate}取得分。`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [mappingPath, ...remaining] = process.argv.slice(2)
  if (mappingPath === '--help') {
    console.log('node --use-system-ca --experimental-strip-types scripts/refreshOperatorWikiViews.mjs [mapping.json]')
  } else if (remaining.length || mappingPath?.startsWith('-')) {
    throw new Error('引数には Wiki ページの対応表 JSON を1つ指定できます。')
  } else {
    await refreshOperatorWikiViews(mappingPath)
  }
}
