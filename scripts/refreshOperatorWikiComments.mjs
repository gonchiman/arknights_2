import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseOperatorWikiCommentSnapshot } from '../src/lib/operatorWikiComments.ts'
import { isTimestamp, parseOperatorWikiViewSnapshot, wikiPageTitle, WIKI_ROOT } from '../src/lib/operatorWikiViews.ts'
import { assertOperatorWikiPageTitle, wikiHtmlText } from './refreshOperatorWikiViews.mjs'

const VIEWS_PATH = fileURLToPath(new URL('../public/data/operator-wiki-views.json', import.meta.url))
const SNAPSHOT_PATH = fileURLToPath(new URL('../public/data/operator-wiki-comments.json', import.meta.url))
const STAGING_DIRECTORY = fileURLToPath(new URL('../.cache/', import.meta.url))
const REQUEST_INTERVAL_MS = 1000
const REQUEST_TIMEOUT_MS = 15000
const MAX_CONSECUTIVE_FAILURES = 5
const DAY_MS = 86_400_000
const WINDOW_DAYS = 30
const formatDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', dateStyle: 'short' })
const HTML_TAG = /<(\/?)([\w-]+)\b((?:"[^"]*"|'[^']*'|[^'">])*)>/gi

function attribute(attributes, name) {
  const match = new RegExp('\\s' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i').exec(attributes)
  return match ? wikiHtmlText(match[1] ?? match[2] ?? match[3]) : null
}

function wikiUrl(title) {
  return WIKI_ROOT + '?' + encodeURIComponent(title)
}

function getClasses(attributes) {
  return attribute(attributes, 'class')?.split(/\s+/u) ?? []
}

function canOmitUnsignedItem(html, parent) {
  const text = wikiHtmlText(html)
  if (/^投稿者本人が削除しました[。.]?$/.test(text)) return true
  // Nested Wiki formatting may render an ordinary bullet as a reply list item.
  return parent?.counted === true && text !== '' && !/comment_date| -- |<[^>]+>/.test(html.trim())
}

function readLegacySignatureDate(html) {
  const text = wikiHtmlText(html)
  if ([...text.matchAll(/ -- \[[^\]\s]+\]/g)].length > 1 || [...text.matchAll(/&new\{/g)].length > 1) return null
  // An old log can show the source of a signature with the seconds truncated.
  const match = / -- \[[^\]\s]+\]\s+&new\{(\d{4}-\d{2}-\d{2})\s+\([日月火水木金土]\)\s+([01]\d|2[0-3]):([0-5]\d):(?:([0-5]\d)\};)?$/
    .exec(text)
  if (!match) return null
  const [, date, hour, minute, second = '00'] = match
  return isTimestamp(date + 'T' + hour + ':' + minute + ':' + second + '+09:00') ? date : null
}

function readWikiCanonicalTitle(address) {
  try {
    const url = new URL(address, WIKI_ROOT)
    if (url.origin + url.pathname !== WIKI_ROOT || url.username || url.password || url.hash || !url.search) return null
    const query = url.search.slice(1)
    if (/[=&]/u.test(query)) return null
    const title = decodeURIComponent(query.replaceAll('+', ' ')).normalize('NFC')
    return title.trim() && !/[\u0000-\u001f\u007f=]/u.test(title) ? title : null
  } catch {
    return null
  }
}

export function extractPageBody(html, expectedTitle, isCatalog = false, readTitle = readWikiCanonicalTitle) {
  const clean = html.replace(/<!--[^]*?(?:-->|$)|<(script|style)\b[^>]*>[^]*?<\/\1>/gi, '')
  assertOperatorWikiPageTitle(clean, expectedTitle)
  const head = clean.split(/<\/head>/i, 1)[0]
  const canonicalLink = [...head.matchAll(HTML_TAG)].find(([, closing, tag, attributes]) =>
    !closing && tag.toLowerCase() === 'link' && attribute(attributes, 'rel') === 'canonical')
  const canonicalUrl = new URL(attribute(canonicalLink?.[3] ?? '', 'href') ?? '', WIKI_ROOT)
  const matchesCanonical = isCatalog ? canonicalUrl.href === WIKI_ROOT
    : readTitle(canonicalUrl.href)?.normalize('NFC') === expectedTitle.normalize('NFC')
  if (!matchesCanonical) {
    throw new Error('Wiki ページの正規 URL が一致しません。')
  }
  let start
  let depth = 0
  for (const match of clean.matchAll(HTML_TAG)) {
    const [, closing, tag, attributes] = match
    if (tag.toLowerCase() !== 'div') continue
    if (start === undefined) {
      if (!closing && attribute(attributes, 'id') === 'body') {
        start = match.index + match[0].length
        depth = 1
      }
      continue
    }
    depth += closing ? -1 : 1
    if (depth === 0) return clean.slice(start, match.index)
  }
  throw new Error('Wiki ページの本文が見つかりません。')
}

function dateBefore(date, days) {
  return new Date(Date.parse(date) - days * DAY_MS).toISOString().slice(0, 10)
}

export function commentWindow(date) {
  const today = formatDate.format(date)
  return { throughDate: dateBefore(today, 1), start: dateBefore(today, WINDOW_DAYS) }
}

function isDeletedEnemyLogItem(html) {
  // These log entries carry the Wiki deletion marker, sometimes with a typo or a broken signature tail.
  const marker = /^\s*<span style="color:#ff0000"><strong>投[稿降]者本人が削除しました<\/strong><\/span>([^]*)$/u.exec(html)
  if (!marker) return false
  const tail = wikiHtmlText(marker[1])
  return !tail || /^-- \[[^\]\s]+\]\s+\d{4}-\d{2}-\d{2}\s+\([日月火水木金土]\)\s+\d{2}:\d{2}:\d{2}\};$/u.test(tail)
}

function isEmptyEnemyLog(body, title, owner, readTitle) {
  const prefix = 'コメント/' + owner
  if (title !== prefix && !(title.startsWith(prefix + '/') && /^[1-9]\d*$/.test(title.slice(prefix.length + 1)))) {
    return false
  }
  // An existing, intentionally empty log contains only a backlink to its own enemy page.
  const backLink = /^\s*<p>\s*<a\b([^>]*)>([^<]*)<\/a>\s*<\/p>\s*$/u.exec(body)
  if (!backLink || wikiHtmlText(backLink[2]) !== owner) return false
  const href = attribute(backLink[1], 'href')
  if (!href) return false
  try {
    const address = new URL(href, WIKI_ROOT)
    return !address.hash && (readTitle ?? wikiPageTitle)(address.href) === owner
  } catch {
    return false
  }
}

function readUndatedItem(content, parent, hasDatedReply = false) {
  const text = wikiHtmlText(content)
  const signatures = [...text.matchAll(/ -- \[[^\]\s]+\]/g)]
  const timeMarkers = [...text.matchAll(/&new\{/g)]
  if (signatures.length > 1 || timeMarkers.length > 1) return false
  if (signatures.length === 1) return true
  if (timeMarkers.length || /comment_date|__plugin_new/u.test(content)
    || /\d{4}-\d{2}-\d{2}\s+\([日月火水木金土]\)\s+\d{1,2}:/u.test(text)) return false
  // A dated descendant confirms that its parent exists even when the parent's text is formatted.
  const plainContent = hasDatedReply
    ? content.replace(/<\/?(?:a|span|strong|em|b|i|u|s|del|small|sup|sub|br)\b[^>]*>/giu, '')
    : content
  return (!parent?.inList || hasDatedReply) && text !== '' && !/<[^>]*>/u.test(plainContent)
}

function earlierDate(a, b) {
  if (!a || (b && b < a)) return b
  return a
}

export function parseCommentLogDetails(html, title, readTitle, { enemyLogOwner } = {}) {
  const body = extractPageBody(html, title, false, readTitle)
  if (enemyLogOwner && isEmptyEnemyLog(body, title, enemyLogOwner, readTitle)) {
    return { dates: [], undatedPosts: [], total: 0 }
  }
  const dates = []
  const undatedPosts = []
  const lists = []
  const items = []
  for (const match of body.matchAll(HTML_TAG)) {
    const [markup, closing, rawTag, attributes] = match
    const tag = rawTag.toLowerCase()
    if (tag === 'ul' || tag === 'ol') {
      if (closing) lists.pop()
      else {
        const parent = items.at(-1)
        if (parent && parent.contentEnd === undefined) parent.contentEnd = match.index
        lists.push(tag === 'ul' && getClasses(attributes).some(name => /^list[1-9]\d*$/.test(name)))
      }
      continue
    }
    if (tag === 'li') {
      if (!closing) {
        items.push({
          inList: lists.at(-1) === true, counted: false, contentStart: match.index + markup.length,
          ownDates: [], undatedCount: 0, earliestDescendantDate: null,
        })
      } else {
        const item = items.pop()
        if (!item?.inList) continue
        const parent = items.at(-1)
        if (!item.counted) {
          const content = body.slice(item.contentStart, item.contentEnd ?? match.index)
          const legacyDate = readLegacySignatureDate(content)
          if (legacyDate) {
            dates.push(legacyDate)
            item.ownDates.push(legacyDate)
          } else {
            const deleted = /^投稿者本人が削除しました[。.]?$/u.test(wikiHtmlText(content))
              || (enemyLogOwner && isDeletedEnemyLogItem(content))
            const hasDatedReply = item.earliestDescendantDate !== null
            if (!deleted && (!canOmitUnsignedItem(content, parent) || hasDatedReply)) {
              if (!readUndatedItem(content, parent, hasDatedReply)) throw new Error('投稿日時のないコメントが見つかりました。')
              item.undatedCount = 1
            }
          }
        }
        const onlyUndatedPost = item.undatedCount === 1 && item.ownDates.length === 0
        for (let count = 0; count < item.undatedCount; count += 1) {
          undatedPosts.push({ latestPossibleDate: onlyUndatedPost ? item.earliestDescendantDate : null })
        }
        if (parent?.inList) {
          const earliest = item.ownDates.reduce(earlierDate, item.earliestDescendantDate)
          parent.earliestDescendantDate = earlierDate(parent.earliestDescendantDate, earliest)
        }
      }
      continue
    }
    const item = items.at(-1)
    if (closing || !item?.inList || lists.at(-1) !== true) continue
    if (tag === 'br') item.lineBreakAfterTimestamp = item.counted
    if (tag !== 'span' || !getClasses(attributes).includes('__plugin_new')) continue
    const stamp = attribute(attributes, 'data-mtime')
    if (item.counted && !item.lineBreakAfterTimestamp) throw new Error('コメントの投稿日時を判別できません。')
    item.counted = true
    item.lineBreakAfterTimestamp = false
    if (isTimestamp(stamp)) {
      const date = formatDate.format(new Date(stamp))
      dates.push(date)
      item.ownDates.push(date)
    } else {
      item.undatedCount += 1
    }
  }
  if (dates.length + undatedPosts.length === 0 || items.some(item => item.inList)) {
    throw new Error('コメントログを確認できません。')
  }
  return { dates: dates.sort(), undatedPosts, total: dates.length + undatedPosts.length }
}

export function parseCommentLog(html, title, readTitle, options) {
  const details = parseCommentLogDetails(html, title, readTitle, options)
  if (details.undatedPosts.length > 0) throw new Error('投稿日時のないコメントが見つかりました。')
  return details.dates
}

export function readLinkedWikiTitles(body, decodeTitle = decodeURIComponent) {
  const titles = new Set()
  for (const [, closing, tag, attributes] of body.matchAll(HTML_TAG)) {
    if (closing || tag.toLowerCase() !== 'a') continue
    const href = attribute(attributes, 'href')
    if (!href) continue
    try {
      const url = new URL(href, WIKI_ROOT)
      if (url.origin + url.pathname !== WIKI_ROOT || url.username || url.password || url.hash) continue
      titles.add(decodeTitle(url.search.slice(1)).normalize('NFC'))
    } catch {
      continue
    }
  }
  return titles
}

export function findNumberedArchives(titles, commentTitle) {
  const archives = new Map()
  const prefix = commentTitle.normalize('NFC') + '/'
  for (const title of titles) {
    if (!title.startsWith(prefix)) continue
    const suffix = title.slice(prefix.length)
    if (/^[1-9]\d*$/.test(suffix) && Number.isSafeInteger(Number(suffix))) archives.set(Number(suffix), title)
  }
  return [...archives].sort(([left], [right]) => right - left).map(([, title]) => title)
}

export function parseCommentArchives(html, characterTitle, commentTitle) {
  return findNumberedArchives(readLinkedWikiTitles(extractPageBody(html, characterTitle)), commentTitle)
}

export function parseCommentCatalog(html, mapping) {
  const titles = readLinkedWikiTitles(extractPageBody(html, 'ページの一覧', true))
  const currentLogs = mapping.map(entry => ('コメント/' + wikiPageTitle(entry.wikiUrl)).normalize('NFC'))
  const matched = currentLogs.filter(title => titles.has(title))
  if (matched.length < Math.ceil(currentLogs.length * 0.9)) {
    throw new Error('Wiki のページ一覧でコメントログを十分に確認できません。')
  }
  const catalog = new Map()
  for (const title of currentLogs) {
    const archives = findNumberedArchives(titles, title)
    // The catalog can list the numbered archives while omitting the current log.
    if (titles.has(title) || archives.length > 0) catalog.set(title, archives)
  }
  return catalog
}

function countsWithin(dates, start, end) {
  const counts = {}
  for (const date of dates) {
    if (date >= start && date <= end) counts[date] = (counts[date] ?? 0) + 1
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)))
}

export function summarizeCommentLogs(logs, { start, throughDate }) {
  const total = logs.reduce((count, log) => count + log.total, 0)
  const undatedPosts = logs.flatMap(log => log.undatedPosts)
  let coveredFrom = start
  for (const { latestPossibleDate } of undatedPosts) {
    if (latestPossibleDate === null || latestPossibleDate >= throughDate) {
      return { coveredFrom: null, counts: {}, total }
    }
    const firstCertainDay = dateBefore(latestPossibleDate, -1)
    if (firstCertainDay > coveredFrom) coveredFrom = firstCertainDay
  }
  return {
    coveredFrom,
    counts: countsWithin(logs.flatMap(log => log.dates), coveredFrom, throughDate),
    total,
  }
}

export function createWikiRequester({ userAgent = 'Arknights Analyze Tool (Wiki comment snapshot)' } = {}) {
  let nextRequestAt = 0
  async function request(url) {
    const remaining = nextRequestAt - performance.now()
    if (remaining > 0) await delay(Math.ceil(remaining))
    nextRequestAt = performance.now() + REQUEST_INTERVAL_MS
    const response = await fetch(url, {
      headers: { Accept: 'text/html', 'User-Agent': userAgent },
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!response.ok) {
      const error = new Error('HTTP ' + response.status)
      error.status = response.status
      throw error
    }
    return response.text()
  }
  return async (url) => {
    try {
      return await request(url)
    } catch (error) {
      if (error.status >= 500 || error.name === 'TimeoutError' || error instanceof TypeError) {
        return request(url)
      }
      throw error
    }
  }
}

export async function collectOperatorCommentEntry(entry, { start, throughDate }, request, archivesFromCatalog) {
  const characterTitle = wikiPageTitle(entry.wikiUrl)
  const commentTitle = 'コメント/' + characterTitle
  const source = wikiUrl(commentTitle)
  const logs = [parseCommentLogDetails(await request(source), commentTitle)]
  let oldest = logs[0].dates[0] ?? null
  let complete = true
  let recentComplete = true
  const incompleteArchive = () => {
    complete = false
    if (oldest === null || oldest >= start) recentComplete = false
  }
  try {
    const archives = archivesFromCatalog ?? parseCommentArchives(await request(entry.wikiUrl), characterTitle, commentTitle)
    let previousNumber = archives.length > 0 ? Number(archives[0].split('/').at(-1)) + 1 : 1
    for (const title of archives) {
      const number = Number(title.split('/').at(-1))
      if (number !== previousNumber - 1) incompleteArchive()
      previousNumber = number
      try {
        const log = parseCommentLogDetails(await request(wikiUrl(title)), title)
        logs.push(log)
        if (log.dates[0] && (oldest === null || log.dates[0] < oldest)) oldest = log.dates[0]
      } catch (error) {
        if (error.status === 403 || error.status === 429) throw error
        incompleteArchive()
        console.warn(entry.operatorId + ' の過去ログ /' + number + ' を取得できませんでした。' + error.message)
      }
    }
    if (previousNumber !== 1) incompleteArchive()
  } catch (error) {
    if (error.status === 403 || error.status === 429) throw error
    incompleteArchive()
    console.warn(entry.operatorId + ' の過去ログ一覧を取得できませんでした。' + error.message)
  }
  const summary = summarizeCommentLogs(logs, { start, throughDate })
  return {
    operatorId: entry.operatorId,
    wikiUrl: source,
    coveredFrom: recentComplete ? summary.coveredFrom : null,
    counts: recentComplete ? summary.counts : {},
    total: complete ? summary.total : null,
  }
}

export async function collectOperatorWikiCommentSnapshot(views, {
  operatorIds,
  request = createWikiRequester(),
  now = () => new Date(),
} = {}) {
  const mapping = parseOperatorWikiViewSnapshot(views).entries
  const targets = operatorIds ? mapping.filter(entry => operatorIds.has(entry.operatorId)) : mapping
  if (targets.length === 0) throw new Error('取得する Wiki ページがありません。')
  const observedAt = now()
  const window = commentWindow(observedAt)
  const catalog = parseCommentCatalog(await request(WIKI_ROOT + '?cmd=list'), mapping)
  const entries = []
  let succeeded = 0
  let totals = 0
  let consecutiveFailures = 0
  for (const [index, entry] of targets.entries()) {
    try {
      const commentTitle = ('コメント/' + wikiPageTitle(entry.wikiUrl)).normalize('NFC')
      const collected = await collectOperatorCommentEntry(entry, window, request, catalog.get(commentTitle))
      entries.push(collected)
      if (collected.coveredFrom) succeeded += 1
      if (collected.total !== null) totals += 1
      consecutiveFailures = 0
    } catch (error) {
      const message = entry.operatorId + ' のコメントを取得できませんでした。' + error.message
      if (error.status === 403 || error.status === 429) throw new Error(message, { cause: error })
      console.warn(message)
      const title = wikiPageTitle(entry.wikiUrl)
      entries.push({ operatorId: entry.operatorId, wikiUrl: wikiUrl('コメント/' + title), coveredFrom: null, counts: {}, total: null })
      if (error.status || error instanceof TypeError || error.name === 'TimeoutError') {
        consecutiveFailures += 1
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          throw new Error('Wiki への取得失敗が連続したため、更新を中断しました。')
        }
      } else {
        consecutiveFailures = 0
      }
    }
    if ((index + 1) % 25 === 0) {
      console.log((index + 1) + '/' + targets.length + '人処理済み（期間別 ' + succeeded + '人、累計 ' + totals + '人）')
    }
  }
  if (succeeded === 0 && totals === 0) throw new Error('コメントを集計できたページがないため、更新を中断しました。')
  return { observedAt: observedAt.toISOString(), throughDate: window.throughDate, entries }
}

export async function refreshOperatorWikiComments({
  operatorId,
  ifStale = false,
  viewsPath = VIEWS_PATH,
  snapshotPath = SNAPSHOT_PATH,
  stagingDirectory = STAGING_DIRECTORY,
  collect = collectOperatorWikiCommentSnapshot,
  now = () => new Date(),
} = {}) {
  const observedAt = now()
  let mapping
  let current
  let missingIds
  if (ifStale) {
    const { throughDate } = commentWindow(observedAt)
    const saved = await readFile(snapshotPath, 'utf8').catch(error => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    if (saved !== null) {
      try {
        current = parseOperatorWikiCommentSnapshot(JSON.parse(saved.replace(/^\uFEFF/, '')))
      } catch {
        console.warn('保存済みの Wiki コメントを読み取れなかったため、再取得します。')
      }
    }
    if (current && current.throughDate >= throughDate) {
      if (current.throughDate === throughDate) {
        const source = await readFile(viewsPath, 'utf8').catch(error => {
          if (error.code === 'ENOENT') return null
          throw error
        })
        if (source !== null) {
          mapping = parseOperatorWikiViewSnapshot(JSON.parse(source.replace(/^\uFEFF/, '')))
          const savedEntries = new Map(current.entries.map(entry => [entry.operatorId, entry]))
          missingIds = new Set(mapping.entries.filter(entry => {
            const savedEntry = savedEntries.get(entry.operatorId)
            return savedEntry?.wikiUrl !== wikiUrl('コメント/' + wikiPageTitle(entry.wikiUrl))
              || (savedEntry.coveredFrom === null && savedEntry.total === null)
          }).map(entry => entry.operatorId))
        }
      }
      if (!missingIds?.size) {
        console.log('Wiki コメントは ' + current.throughDate + ' まで更新済みです。')
        return
      }
    }
  }
  mapping ??= JSON.parse((await readFile(viewsPath, 'utf8')).replace(/^\uFEFF/, ''))
  const operatorIds = operatorId ? new Set([operatorId]) : missingIds
  const collected = parseOperatorWikiCommentSnapshot(await collect(mapping, { operatorIds, now: () => observedAt }))
  let snapshot = collected
  if (missingIds) {
    if (collected.throughDate !== current.throughDate) {
      throw new Error('補完対象の日付が変わったため、Wiki コメントを保存しませんでした。')
    }
    const usable = collected.entries.filter(entry =>
      missingIds.has(entry.operatorId) && (entry.coveredFrom !== null || entry.total !== null))
    if (!usable.length) return
    const entries = new Map(current.entries.map(entry => [entry.operatorId, entry]))
    for (const entry of usable) entries.set(entry.operatorId, entry)
    snapshot = parseOperatorWikiCommentSnapshot({ ...collected, entries: [...entries.values()] })
  }
  if (operatorId) {
    console.log(JSON.stringify(snapshot, null, 2))
    return
  }
  // Keep the finished file outside the public directory until it can be moved in one step.
  await mkdir(stagingDirectory, { recursive: true })
  const temporary = join(stagingDirectory, 'operator-wiki-comments.' + randomUUID() + '.json')
  await writeFile(temporary, JSON.stringify(snapshot, null, 2) + '\n', { flag: 'wx' })
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(temporary, snapshotPath)
      break
    } catch (error) {
      const mayBeLocked = process.platform === 'win32' && ['EPERM', 'EACCES', 'EBUSY'].includes(error.code)
      if (!mayBeLocked || attempt === 4) {
        throw new Error('Wiki コメントを保存できませんでした。取得済みデータ: ' + temporary, { cause: error })
      }
      await delay(250 * (attempt + 1))
    }
  }
  console.log('Wiki コメントを更新しました。' + snapshot.entries.length + '件、' + snapshot.throughDate + 'まで。')
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [flag, operatorId, ...rest] = process.argv.slice(2)
  const usage = 'npm run refresh:operator-wiki-comments -- [--if-stale | --operator <operatorId>]'
  if (!flag || (flag === '--if-stale' && operatorId === undefined)) {
    await refreshOperatorWikiComments({ ifStale: flag === '--if-stale' })
  } else if (flag === '--operator' && operatorId && !operatorId.startsWith('--') && rest.length === 0) {
    await refreshOperatorWikiComments({ operatorId })
  } else if (flag === '--help' && operatorId === undefined) {
    console.log(usage)
  } else {
    throw new Error(usage)
  }
}
