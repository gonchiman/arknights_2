import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { WIKI_ROOT, wikiPageTitle } from '../src/lib/operatorWikiViews.ts'
import { parseOperatorWikiPage, wikiHtmlText } from './refreshOperatorWikiViews.mjs'
import {
  commentWindow, createWikiRequester, extractPageBody, findNumberedArchives,
  parseCommentLog, readLinkedWikiTitles,
} from './refreshOperatorWikiComments.mjs'

const ROSTER_TITLE = '敵一覧'
const SNAPSHOT = fileURLToPath(new URL('../public/data/enemy-wiki-stats.json', import.meta.url))
const HISTORY = fileURLToPath(new URL('../public/data/enemy-wiki-stats-history/', import.meta.url))
const STAGING = fileURLToPath(new URL('../.cache/enemy-wiki-stats/', import.meta.url))
const jstDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', dateStyle: 'short' })
const GRADE_LABELS = new Map([
  ['', 'NORMAL'],
  ['エリート', 'ELITE'],
  ['ボス', 'BOSS'],
])
const CHECKPOINT_VERSION = 2
const CHECKPOINT_INTERVAL = 10
const MAX_TRANSPORT_FAILURES = 5

const wikiUrl = title => WIKI_ROOT + '?' + encodeURIComponent(title)
const logTitle = row => 'コメント/' + wikiPageTitle(row.wikiUrl)
const archiveNumber = title => Number(title.split('/').at(-1))

function decodeEnemyWikiTitle(query) {
  return decodeURIComponent(query.replaceAll('+', ' ')).normalize('NFC')
}

function resolveEnemyWikiTitle(value) {
  try {
    const url = new URL(value, WIKI_ROOT)
    if (url.origin + url.pathname !== WIKI_ROOT || url.username || url.password || !url.search) return null
    const title = decodeEnemyWikiTitle(url.search.slice(1))
    if (title && !title.includes('=') && !/[\u0000-\u001f\u007f]/u.test(title)) return title
  } catch {
    return null
  }
  return null
}

function parseRowName(cell) {
  const link = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]+)"|'([^']+)')[^>]*>([^]*?)<\/a>/i.exec(cell)
  if (!link) return null
  const name = wikiHtmlText(link[3])
  const title = resolveEnemyWikiTitle(wikiHtmlText(link[1] ?? link[2]))
  return name && title && !title.startsWith('コメント/') ? { name, title } : null
}

export function parseEnemyWikiRoster(html) {
  const body = extractPageBody(html, ROSTER_TITLE, false, resolveEnemyWikiTitle)
  const entries = new Map()
  for (const [, row] of body.matchAll(/<tr\b[^>]*>([^]*?)<\/tr>/gi)) {
    const cells = [...row.matchAll(/<td\b[^>]*>([^]*?)<\/td>/gi)].map(match => match[1])
    if (cells.length !== 20 || !/^[A-Za-z0-9]{4,}$/.test(wikiHtmlText(cells[0]))) continue
    const index = wikiHtmlText(cells[1])
    const page = parseRowName(cells[3])
    const grade = GRADE_LABELS.get(wikiHtmlText(cells[18]))
    if (!index || !page || !grade) continue
    const url = wikiUrl(page.title)
    const entry = { index, name: page.name, grade, wikiUrl: url }
    if (!entries.has(url)) entries.set(url, entry)
  }
  if (!entries.size) throw new Error('Wiki の敵一覧に敵が見つかりません。')
  return [...entries.values()]
}

export function parseEnemyWikiCommentCatalog(html, roster) {
  const titles = readLinkedWikiTitles(extractPageBody(html, 'ページの一覧', true), decodeEnemyWikiTitle)
  const found = roster.filter(row => titles.has(wikiPageTitle(row.wikiUrl))).length
  if (found < Math.ceil(roster.length * 0.9)) {
    throw new Error('Wiki のページ一覧で敵ページを十分に確認できません。')
  }
  return Object.fromEntries(roster.map(row => {
    const title = logTitle(row)
    return [row.wikiUrl, {
      page: titles.has(wikiPageTitle(row.wikiUrl)), current: titles.has(title), archives: findNumberedArchives(titles, title),
    }]
  }))
}

function missingComment(status, source = null) {
  return { status, wikiUrl: source, coveredFrom: null, counts: {}, total: null }
}

function commentSource(row, catalog) {
  if (catalog.current) return wikiUrl(logTitle(row))
  return catalog.archives.length ? wikiUrl(catalog.archives[0]) : null
}

function stopFor(error) {
  return error.status === 403 || error.status === 429 || error.code === 'JST_DATE_CHANGED'
}

export async function collectEnemyComment(row, catalog, range, request) {
  const source = commentSource(row, catalog)
  if (!catalog.current) {
    return missingComment(catalog.page && !source ? 'no-log' : 'unavailable', source)
  }
  const title = logTitle(row)
  const dates = parseCommentLog(await request(source), title, resolveEnemyWikiTitle)
  let oldest = dates[0]
  let previousNumber = catalog.archives.length > 0 ? archiveNumber(catalog.archives[0]) + 1 : 1
  let complete = true
  let recentComplete = true
  const incompleteArchive = () => {
    complete = false
    if (oldest >= range.start) recentComplete = false
  }
  for (const archive of catalog.archives) {
    const number = archiveNumber(archive)
    if (number !== previousNumber - 1) incompleteArchive()
    previousNumber = number
    try {
      const archiveDates = parseCommentLog(await request(wikiUrl(archive)), archive, resolveEnemyWikiTitle)
      dates.push(...archiveDates)
      if (archiveDates[0] < oldest) oldest = archiveDates[0]
    } catch (error) {
      if (stopFor(error)) throw error
      console.warn(row.name + ' のコメント過去ログを確認できませんでした。' + error.message)
      incompleteArchive()
    }
  }
  if (previousNumber !== 1) incompleteArchive()

  const counts = {}
  if (recentComplete) {
    for (const date of dates.sort()) {
      if (date >= range.start && date <= range.throughDate) counts[date] = (counts[date] ?? 0) + 1
    }
  }
  return {
    status: recentComplete || complete ? 'available' : 'unavailable',
    wikiUrl: source,
    coveredFrom: recentComplete ? range.start : null,
    counts,
    total: complete ? dates.length : null,
  }
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

async function writeAtomic(path, value, stagingDirectory, indent) {
  const temporary = join(stagingDirectory, randomUUID() + '.json')
  await mkdir(dirname(path), { recursive: true })
  await writeFile(temporary, JSON.stringify(value, null, indent) + '\n', { flag: 'wx' })
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(temporary, path)
      return
    } catch (error) {
      const locked = process.platform === 'win32' && ['EPERM', 'EACCES', 'EBUSY'].includes(error.code)
      if (!locked || attempt === 4) {
        throw new Error('敵 Wiki データを保存できませんでした。 ' + path
          + '。保存前のデータは ' + temporary + ' にあります。', { cause: error })
      }
      await delay(250 * (attempt + 1))
    }
  }
}

function assertDate(todayDate, observedAt) {
  if (jstDate.format(observedAt) !== todayDate) {
    const error = new Error('日本時間の日付が変わったため、この回の収集を終了します。')
    error.code = 'JST_DATE_CHANGED'
    throw error
  }
}

async function initializeDay(request, started, previous, now) {
  const todayDate = jstDate.format(started)
  // Closely related rows alone can appear in an incomplete page. Guard against publishing such a result.
  const roster = parseEnemyWikiRoster(await request(wikiUrl(ROSTER_TITLE)))
  const minimum = previous ? Math.floor(previous.entries.length * 0.9) : 100
  if (roster.length < minimum) throw new Error('Wiki の敵一覧を十分に確認できません。')
  const catalog = parseEnemyWikiCommentCatalog(await request(WIKI_ROOT + '?cmd=list'), roster)
  const { throughDate } = commentWindow(started)
  const observedAt = now()
  assertDate(todayDate, observedAt)
  const sameDay = previous?.todayDate === todayDate
  const previousRows = new Map((sameDay ? previous.entries : []).map(row => [row.wikiUrl, row]))
  const entries = roster.map(row => {
    const known = catalog[row.wikiUrl]
    const prior = previousRows.get(row.wikiUrl)
    let comment = prior?.comment?.status === 'available' ? prior.comment : null
    if (!comment && !known.current) {
      comment = missingComment(known.page && !known.archives.length ? 'no-log' : 'unavailable', commentSource(row, known))
    }
    return { ...row, view: prior?.view ?? null, comment }
  })
  return {
    snapshot: {
      rosterObservedAt: observedAt.toISOString(),
      viewsObservedAt: entries.some(row => row.view) ? previous.viewsObservedAt : null,
      todayDate, yesterdayDate: throughDate,
      commentsObservedAt: entries.some(row => row.comment?.status === 'available') ? previous.commentsObservedAt : null,
      throughDate, entries,
    },
    version: CHECKPOINT_VERSION,
    catalog,
    attempted: entries.filter(row => row.view && commentComplete(row.comment)).map(row => row.wikiUrl),
    retried: [],
  }
}

function commentComplete(comment) {
  return comment?.status === 'no-log'
    || (comment?.status === 'available' && comment.coveredFrom !== null && comment.total !== null)
}

function mergeComment(previous, next) {
  if (previous?.status !== 'available') return next
  if (next.status !== 'available') return previous
  const keepPreviousPeriod = previous.coveredFrom
    && (!next.coveredFrom || previous.coveredFrom < next.coveredFrom)
  return {
    ...next,
    coveredFrom: keepPreviousPeriod ? previous.coveredFrom : next.coveredFrom,
    counts: keepPreviousPeriod ? previous.counts : next.counts,
    total: next.total ?? previous.total,
  }
}

async function collectRow(row, catalog, range, request) {
  let transportFailures = 0
  let requestedMetric = false
  const onError = (error, metric) => {
    if (stopFor(error)) throw error
    if (error.status >= 500 || error instanceof TypeError || error.name === 'TimeoutError') transportFailures += 1
    console.warn(row.name + ' の' + metric + 'を確認できませんでした。' + error.message)
  }
  if (!row.view) {
    requestedMetric = true
    try {
      const title = wikiPageTitle(row.wikiUrl)
      const html = await request(row.wikiUrl)
      extractPageBody(html, title, false, resolveEnemyWikiTitle)
      row.view = parseOperatorWikiPage(html, title)
    } catch (error) {
      onError(error, '閲覧数')
    }
  }
  if (!commentComplete(row.comment) && catalog.current) {
    requestedMetric = true
    try {
      row.comment = mergeComment(row.comment, await collectEnemyComment(row, catalog, range, request))
    } catch (error) {
      onError(error, 'コメント件数')
      row.comment ??= missingComment('unavailable', commentSource(row, catalog))
    }
  }
  return requestedMetric && transportFailures > 0
}

export async function refreshEnemyWikiStats({
  batchSize = 150,
  limit,
  indices,
  catalogOnly = false,
  retry = false,
  snapshotPath = SNAPSHOT,
  historyDirectory = HISTORY,
  stagingDirectory = STAGING,
  request = createWikiRequester({ userAgent: 'Arknights Analyze Tool (Enemy Wiki stats snapshot)' }),
  now = () => new Date(),
  signal,
} = {}) {
  const started = now()
  const todayDate = jstDate.format(started)
  const range = commentWindow(started)
  await mkdir(stagingDirectory, { recursive: true })
  const lockPath = join(stagingDirectory, 'collection.lock')
  let lock
  try {
    lock = await open(lockPath, 'wx')
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    throw new Error('敵 Wiki 集計のロックがあります。 ' + lockPath, { cause: error })
  }

  try {
    await lock.writeFile(String(process.pid) + '\n')
    // A request that straddled JST midnight must never populate today's or yesterday's counters.
    const requestThisDay = async (url) => {
      assertDate(todayDate, now())
      const html = await request(url)
      assertDate(todayDate, now())
      return html
    }
    const checkpointPath = join(stagingDirectory, todayDate + '.json')
    const previous = await readJson(snapshotPath)
    const checkpoint = await readJson(checkpointPath)
    const state = checkpoint?.version === CHECKPOINT_VERSION
      ? checkpoint
      : await initializeDay(requestThisDay, started, checkpoint?.snapshot ?? previous, now)
    const { snapshot, catalog } = state
    const activeUrls = new Set(snapshot.entries.map(row => row.wikiUrl))
    const attempted = new Set([...state.attempted, ...(checkpoint?.attempted ?? [])].filter(url => activeUrls.has(url)))
    const retried = new Set(state.retried)
    const selected = indices ? snapshot.entries.filter(row => indices.has(row.index)) : snapshot.entries
    const candidates = selected.slice(0, limit)
    if (indices) {
      const found = new Set(selected.map(row => row.index))
      const missing = [...indices].filter(index => !found.has(index))
      if (missing.length) throw new Error('Wiki の敵一覧にない敵番号です。 ' + missing.join(', '))
    }
    const retryable = row => !row.view || (catalog[row.wikiUrl].current && !commentComplete(row.comment))
    const failures = candidates.filter(row => attempted.has(row.wikiUrl) && retryable(row))
    if (retry && failures.every(row => retried.has(row.wikiUrl))) {
      for (const row of failures) retried.delete(row.wikiUrl)
    }
    const pending = retry
      ? failures.filter(row => !retried.has(row.wikiUrl))
      : candidates.filter(row => !attempted.has(row.wikiUrl))
    const targets = pending.slice(0, batchSize)
    const hasViews = () => snapshot.entries.some(row => row.view !== null)
    const hasComments = () => snapshot.entries.some(row => row.comment?.status === 'available')
    const historyPath = join(historyDirectory, snapshot.yesterdayDate + '.json')
    const flush = async (publish) => {
      state.attempted = [...attempted]
      state.retried = [...retried]
      await writeAtomic(checkpointPath, state, stagingDirectory)
      if (!publish || (!hasViews() && !hasComments() && previous)) return
      if (hasViews()) {
        const counts = Object.fromEntries(snapshot.entries.filter(row => row.view).map(row => [
          row.wikiUrl, row.view.yesterday,
        ]))
        const history = await readJson(historyPath)
        if (history && history.date !== snapshot.yesterdayDate) throw new Error('Wiki 閲覧数の履歴の日付が一致しません。')
        await writeAtomic(historyPath, {
          date: snapshot.yesterdayDate, observedAt: snapshot.viewsObservedAt, counts: { ...history?.counts, ...counts },
        }, stagingDirectory)
      }
      await writeAtomic(snapshotPath, snapshot, stagingDirectory, 2)
    }

    await flush(false)
    let processed = 0
    let consecutiveTransportFailures = 0
    try {
      if (!catalogOnly) {
        for (const row of targets) {
          if (signal?.aborted) break
          const collected = { ...row }
          const failed = await collectRow(collected, catalog[row.wikiUrl], range, requestThisDay)
          const observedAt = now()
          assertDate(todayDate, observedAt)
          const observed = observedAt.toISOString()
          if (!row.view && collected.view) snapshot.viewsObservedAt = observed
          if (row.comment !== collected.comment && collected.comment?.status === 'available') {
            snapshot.commentsObservedAt = observed
          }
          row.view = collected.view
          row.comment = collected.comment
          attempted.add(row.wikiUrl)
          if (retry) retried.add(row.wikiUrl)
          consecutiveTransportFailures = failed ? consecutiveTransportFailures + 1 : 0
          processed += 1
          if (processed % CHECKPOINT_INTERVAL === 0) {
            await flush(false)
            console.log('敵 Wiki 集計 ' + candidates.filter(candidate => attempted.has(candidate.wikiUrl)).length
              + '/' + candidates.length + '件試行済み')
          }
          if (consecutiveTransportFailures >= MAX_TRANSPORT_FAILURES) {
            throw new Error('Wiki への取得失敗が連続したため、この回の収集を終了します。')
          }
        }
      }
    } finally {
      await flush(true)
    }
    const observedViews = candidates.filter(row => row.view).length
    const observedComments = candidates.filter(row => row.comment?.status === 'available').length
    console.log('敵 Wiki 集計 ' + candidates.filter(row => attempted.has(row.wikiUrl)).length + '/' + candidates.length
      + '件試行済み（今回 ' + processed + '件、閲覧数 ' + observedViews + '件、コメント ' + observedComments + '件）')
    return snapshot
  } finally {
    await lock.close()
    await unlink(lockPath)
  }
}

function positiveInteger(value) {
  if (value === undefined) return undefined
  const number = Number(value)
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(number)) throw new Error('正の整数を指定してください。')
  return number
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: {
    'batch-size': { type: 'string' }, limit: { type: 'string' }, retry: { type: 'boolean' },
    index: { type: 'string', multiple: true },
    'catalog-only': { type: 'boolean' }, help: { type: 'boolean' },
  } })
  if (values.help) {
    console.log('npm run refresh:enemy-wiki-stats -- [--batch-size N] [--limit N] [--index CODE] [--retry] [--catalog-only]')
  } else {
    const controller = new AbortController()
    const stop = () => {
      controller.abort()
      console.log('処理中の敵まで保存して収集を終了します。')
    }
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
    try {
      await refreshEnemyWikiStats({
        batchSize: positiveInteger(values['batch-size']), limit: positiveInteger(values.limit),
        indices: values.index ? new Set(values.index) : undefined,
        retry: values.retry, catalogOnly: values['catalog-only'], signal: controller.signal,
      })
    } finally {
      process.off('SIGINT', stop)
      process.off('SIGTERM', stop)
    }
  }
}
