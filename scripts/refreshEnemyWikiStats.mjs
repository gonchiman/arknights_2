import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { parseEnemyWikiStatsSnapshot } from '../src/lib/enemyWikiStats.ts'
import { isRecord, isTimestamp, WIKI_ROOT, wikiPageTitle } from '../src/lib/operatorWikiViews.ts'
import { parseOperatorWikiPage, wikiHtmlText } from './refreshOperatorWikiViews.mjs'
import {
  commentWindow, createWikiRequester, extractPageBody, findNumberedArchives,
  parseCommentLogDetails, readLinkedWikiTitles, summarizeCommentLogs,
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
const DEFAULT_BATCH_SIZE = 150
const MINIMUM_ROSTER_SIZE = 100
const VIEW_METRICS = ['today', 'yesterday', 'total']
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
  const parseLog = (html, pageTitle) => parseCommentLogDetails(html, pageTitle, resolveEnemyWikiTitle,
    { enemyLogOwner: wikiPageTitle(row.wikiUrl) })
  const logs = [parseLog(await request(source), title)]
  let oldest = logs[0].dates[0] ?? null
  let previousNumber = catalog.archives.length > 0 ? archiveNumber(catalog.archives[0]) + 1 : 1
  let complete = true
  let recentComplete = true
  const incompleteArchive = () => {
    complete = false
    if (oldest === null || oldest >= range.start) recentComplete = false
  }
  for (const archive of catalog.archives) {
    const number = archiveNumber(archive)
    if (number !== previousNumber - 1) incompleteArchive()
    previousNumber = number
    try {
      const archived = parseLog(await request(wikiUrl(archive)), archive)
      logs.push(archived)
      const archiveDates = archived.dates
      if (archiveDates[0] && (oldest === null || archiveDates[0] < oldest)) oldest = archiveDates[0]
    } catch (error) {
      if (stopFor(error)) throw error
      console.warn(row.name + ' のコメント過去ログを確認できませんでした。' + error.message)
      incompleteArchive()
    }
  }
  if (previousNumber !== 1) incompleteArchive()

  const summary = summarizeCommentLogs(logs, range)
  const coveredFrom = recentComplete ? summary.coveredFrom : null
  const total = complete ? summary.total : null
  return {
    status: coveredFrom !== null || total !== null ? 'available' : 'unavailable',
    wikiUrl: source,
    coveredFrom,
    counts: coveredFrom ? summary.counts : {},
    total,
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

async function readDailyData(path, parse) {
  try {
    const data = await readJson(path)
    return data === null ? null : parse(data)
  } catch (error) {
    if (error.code) throw error
    console.warn('保存済みの敵 Wiki データを確認できませんでした。再取得します。 ' + error.message)
    return null
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
  const minimum = previous ? Math.max(MINIMUM_ROSTER_SIZE, Math.floor(previous.entries.length * 0.9)) : MINIMUM_ROSTER_SIZE
  if (roster.length < minimum) throw new Error('Wiki の敵一覧を十分に確認できません。')
  const catalog = parseEnemyWikiCommentCatalog(await request(WIKI_ROOT + '?cmd=list'), roster)
  const { start, throughDate } = commentWindow(started)
  const observedAt = now()
  assertDate(todayDate, observedAt)
  const sameDay = isSnapshotForDay(previous, todayDate, throughDate)
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
    attempted: entries.filter(row => viewComplete(row.view) && commentComplete(row.comment, start)).map(row => row.wikiUrl),
    retried: [],
  }
}

function viewComplete(view) {
  return !!view && VIEW_METRICS.every(metric => view[metric] !== null)
}

function mergeView(previous, next) {
  if (!previous || !next) return previous ?? next
  if (viewComplete(previous)) return previous
  return Object.fromEntries(VIEW_METRICS.map(metric => [metric, previous[metric] ?? next[metric]]))
}

function commentComplete(comment, start) {
  return comment?.status === 'no-log'
    || (comment?.status === 'available' && comment.coveredFrom !== null && (!start || comment.coveredFrom <= start) && comment.total !== null)
}

function mergeComment(previous, next) {
  if (previous?.status !== 'available') return next
  if (next.status !== 'available') return previous
  const keepPreviousPeriod = previous.coveredFrom
    && (!next.coveredFrom || previous.coveredFrom <= next.coveredFrom)
  const counts = keepPreviousPeriod ? previous.counts : next.counts
  const total = previous.total ?? next.total
  if (total !== null && Object.values(counts).reduce((sum, count) => sum + count, 0) > total) {
    return next.total !== null && next.coveredFrom ? next : previous
  }
  return {
    ...next,
    coveredFrom: keepPreviousPeriod ? previous.coveredFrom : next.coveredFrom,
    counts,
    total,
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
  if (!viewComplete(row.view)) {
    requestedMetric = true
    try {
      const title = wikiPageTitle(row.wikiUrl)
      const html = await request(row.wikiUrl)
      extractPageBody(html, title, false, resolveEnemyWikiTitle)
      row.view = mergeView(row.view, parseOperatorWikiPage(html, title))
    } catch (error) {
      onError(error, '閲覧数')
    }
  }
  if (!commentComplete(row.comment, range.start) && catalog.current) {
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

function isSnapshotForDay(snapshot, todayDate, throughDate) {
  return snapshot?.todayDate === todayDate && snapshot.yesterdayDate === throughDate
    && snapshot.throughDate === throughDate
}

function dailyCheckpoint(value, todayDate, throughDate) {
  if (value?.version !== CHECKPOINT_VERSION || !isSnapshotForDay(value.snapshot, todayDate, throughDate)) return null
  const snapshot = parseEnemyWikiStatsSnapshot(value.snapshot)
  if (!isRecord(value.catalog) || !Array.isArray(value.attempted) || !Array.isArray(value.retried)
    || snapshot.entries.some(row => {
      const entry = value.catalog[row.wikiUrl]
      return !isRecord(entry) || typeof entry.current !== 'boolean' || typeof entry.page !== 'boolean'
        || !Array.isArray(entry.archives)
    })) {
    throw new Error('敵 Wiki の収集チェックポイントの形式が正しくありません。')
  }
  return { ...value, snapshot }
}

function viewCounts(snapshot) {
  return Object.fromEntries(snapshot.entries.filter(row => row.view?.yesterday != null).map(row => [
    row.wikiUrl, row.view.yesterday,
  ]))
}

function parseDailyHistory(value, todayDate, throughDate) {
  if (value === null) return null
  if (!isRecord(value) || value.date !== throughDate || !isTimestamp(value.observedAt)
    || jstDate.format(new Date(value.observedAt)) !== todayDate || !isRecord(value.counts)
    || Object.entries(value.counts).some(([url, count]) => !wikiPageTitle(url) || !Number.isSafeInteger(count) || count < 0)) {
    throw new Error('Wiki 閲覧数の履歴の形式が正しくありません。')
  }
  return value
}

function completedCoverage(snapshot, start) {
  const views = snapshot.entries.filter(row => viewComplete(row.view)).length
  const comments = snapshot.entries.filter(row => commentComplete(row.comment, start)).length
  return { views, comments, size: snapshot.entries.length }
}

function hasCoverageGain(snapshot, saved) {
  const previous = new Map((saved?.entries ?? []).map(row => [row.wikiUrl, row]))
  return snapshot.entries.some(row => {
    const prior = previous.get(row.wikiUrl)
    if (VIEW_METRICS.some(metric => row.view?.[metric] != null && prior?.view?.[metric] == null)) return true
    const comment = row.comment
    if (comment?.status === 'no-log') return !!row.view && prior?.comment?.status !== 'no-log'
    if (comment?.status !== 'available') return false
    return (comment.total !== null && prior?.comment?.total == null)
      || (!!comment.coveredFrom && (!prior?.comment?.coveredFrom || comment.coveredFrom < prior.comment.coveredFrom))
  })
}

function latestTimestamp(a, b) {
  if (!a || (b && Date.parse(b) > Date.parse(a))) return b
  return a
}

function restoreSavedRows(snapshot, saved) {
  if (!saved) return
  const rows = new Map(saved.entries.map(row => [row.wikiUrl, row]))
  for (const row of snapshot.entries) {
    const prior = rows.get(row.wikiUrl)
    if (!prior) continue
    row.view = mergeView(prior.view, row.view)
    if (prior.comment?.status === 'available') {
      row.comment = row.comment ? mergeComment(prior.comment, row.comment) : prior.comment
    } else if (prior.comment?.status === 'no-log' && row.comment?.status !== 'available') {
      row.comment = prior.comment
    }
  }
  snapshot.viewsObservedAt = latestTimestamp(snapshot.viewsObservedAt, saved.viewsObservedAt)
  snapshot.commentsObservedAt = latestTimestamp(snapshot.commentsObservedAt, saved.commentsObservedAt)
}

export async function refreshEnemyWikiStats({
  batchSize = DEFAULT_BATCH_SIZE,
  daily = false,
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
  if (daily && (retry || catalogOnly || limit !== undefined || indices)) {
    throw new Error('--daily と --retry、--catalog-only、--limit、--index は併用できません。')
  }
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
    const previous = daily
      ? await readDailyData(snapshotPath, parseEnemyWikiStatsSnapshot)
      : await readJson(snapshotPath)
    let savedToday = isSnapshotForDay(previous, todayDate, range.throughDate) ? previous : null
    const historyPath = join(historyDirectory, range.throughDate + '.json')
    let dailyHistory = daily
      ? await readDailyData(historyPath, history => parseDailyHistory(history, todayDate, range.throughDate))
      : null
    const saveDailyHistory = async (data) => {
      const counts = viewCounts(data)
      const entries = Object.entries(counts)
      if (!entries.length || (dailyHistory?.observedAt === data.viewsObservedAt
        && entries.every(([url, count]) => dailyHistory.counts[url] === count))) return
      const history = { date: range.throughDate, observedAt: data.viewsObservedAt, counts: { ...dailyHistory?.counts, ...counts } }
      await writeAtomic(historyPath, history, stagingDirectory)
      dailyHistory = history
    }
    if (daily && savedToday) {
      await saveDailyHistory(savedToday)
      const coverage = completedCoverage(savedToday, range.start)
      if (coverage.size >= MINIMUM_ROSTER_SIZE && coverage.views === coverage.size && coverage.comments === coverage.size
        && jstDate.format(new Date(savedToday.rosterObservedAt)) === todayDate) {
        console.log('敵 Wiki 集計 ' + todayDate + ' は全件取得済みです（' + coverage.size + '件）。')
        return savedToday
      }
    }

    const checkpoint = daily
      ? await readDailyData(checkpointPath, data => dailyCheckpoint(data, todayDate, range.throughDate))
      : await readJson(checkpointPath)
    const state = checkpoint?.version === CHECKPOINT_VERSION
      ? checkpoint
      : await initializeDay(requestThisDay, started, daily ? previous : checkpoint?.snapshot ?? previous, now)
    const { snapshot, catalog } = state
    if (daily) restoreSavedRows(snapshot, savedToday)
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
    const retryable = row => !viewComplete(row.view) || (catalog[row.wikiUrl].current && !commentComplete(row.comment, range.start))
    const failures = candidates.filter(row => attempted.has(row.wikiUrl) && retryable(row))
    if (retry && failures.every(row => retried.has(row.wikiUrl))) {
      for (const row of failures) retried.delete(row.wikiUrl)
    }
    const pending = retry
      ? failures.filter(row => !retried.has(row.wikiUrl))
      : candidates.filter(row => !attempted.has(row.wikiUrl) && (!daily || retryable(row)))
    const flush = async (publish) => {
      state.attempted = [...attempted]
      state.retried = [...retried]
      await writeAtomic(checkpointPath, state, stagingDirectory)
      if (!publish) return
      if (daily) {
        if (!hasCoverageGain(snapshot, savedToday)) return
        const published = parseEnemyWikiStatsSnapshot(snapshot)
        await saveDailyHistory(published)
        await writeAtomic(snapshotPath, published, stagingDirectory, 2)
        savedToday = published
        return
      }
      const hasViews = snapshot.entries.some(row => row.view !== null)
      const hasComments = snapshot.entries.some(row => row.comment?.status === 'available')
      if (!hasViews && !hasComments && previous) return
      if (hasViews) {
        const history = await readJson(historyPath)
        if (history && history.date !== snapshot.yesterdayDate) throw new Error('Wiki 閲覧数の履歴の日付が一致しません。')
        await writeAtomic(historyPath, {
          date: snapshot.yesterdayDate, observedAt: snapshot.viewsObservedAt, counts: { ...history?.counts, ...viewCounts(snapshot) },
        }, stagingDirectory)
      }
      await writeAtomic(snapshotPath, snapshot, stagingDirectory, 2)
    }

    await flush(false)
    let processed = 0
    let consecutiveTransportFailures = 0
    const collectRows = async (targets, isRetry) => {
      for (const row of targets) {
        if (signal?.aborted) break
        const collected = { ...row }
        const failed = await collectRow(collected, catalog[row.wikiUrl], range, requestThisDay)
        const observedAt = now()
        assertDate(todayDate, observedAt)
        const observed = observedAt.toISOString()
        if (row.view !== collected.view && collected.view) snapshot.viewsObservedAt = observed
        if (row.comment !== collected.comment && collected.comment?.status === 'available') {
          snapshot.commentsObservedAt = observed
        }
        row.view = collected.view
        row.comment = collected.comment
        attempted.add(row.wikiUrl)
        if (isRetry) retried.add(row.wikiUrl)
        consecutiveTransportFailures = failed ? consecutiveTransportFailures + 1 : 0
        processed += 1
        const publishBatch = daily && processed % batchSize === 0
        if (publishBatch || processed % CHECKPOINT_INTERVAL === 0) {
          await flush(publishBatch)
          console.log('敵 Wiki 集計 ' + candidates.filter(candidate => attempted.has(candidate.wikiUrl)).length
            + '/' + candidates.length + '件試行済み')
        }
        if (consecutiveTransportFailures >= MAX_TRANSPORT_FAILURES) {
          throw new Error('Wiki への取得失敗が連続したため、この回の収集を終了します。')
        }
      }
    }
    try {
      if (!catalogOnly) {
        await collectRows(daily ? pending : pending.slice(0, batchSize), retry)
        if (daily && !signal?.aborted) {
          await collectRows(candidates.filter(row => attempted.has(row.wikiUrl) && retryable(row)), true)
        }
      }
    } finally {
      await flush(true)
      if (daily) {
        const { views, comments, size } = completedCoverage(snapshot, range.start)
        console.log('敵 Wiki 集計 ' + todayDate + '（今回 ' + processed + '件、閲覧数 ' + views + '/' + size
          + '件、コメント確認済み ' + comments + '/' + size + '件、未取得 閲覧数 ' + (size - views)
          + '件・コメント ' + (size - comments) + '件）')
      }
    }
    if (!daily) {
      const observedViews = candidates.filter(row => row.view).length
      const observedComments = candidates.filter(row => row.comment?.status === 'available').length
      console.log('敵 Wiki 集計 ' + candidates.filter(row => attempted.has(row.wikiUrl)).length + '/' + candidates.length
        + '件試行済み（今回 ' + processed + '件、閲覧数 ' + observedViews + '件、コメント ' + observedComments + '件）')
    }
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
    'batch-size': { type: 'string' }, daily: { type: 'boolean' }, limit: { type: 'string' }, retry: { type: 'boolean' },
    index: { type: 'string', multiple: true },
    'catalog-only': { type: 'boolean' }, help: { type: 'boolean' },
  } })
  if (values.help) {
    console.log('npm run refresh:enemy-wiki-stats -- [--batch-size N] [--daily | [--limit N] [--index CODE] [--retry] [--catalog-only]]')
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
        daily: values.daily, retry: values.retry, catalogOnly: values['catalog-only'], signal: controller.signal,
      })
    } finally {
      process.off('SIGINT', stop)
      process.off('SIGTERM', stop)
    }
  }
}
