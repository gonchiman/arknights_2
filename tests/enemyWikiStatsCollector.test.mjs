import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  collectEnemyComment, parseEnemyWikiCommentCatalog, parseEnemyWikiRoster, refreshEnemyWikiStats,
} from '../scripts/refreshEnemyWikiStats.mjs'

const root = 'https://arknights.wikiru.jp/'
const url = title => root + '?' + encodeURIComponent(title)
const relative = title => './?' + encodeURIComponent(title)
const page = (title, body, canonical = url(title)) =>
  '<html><head><link rel="canonical" href="' + canonical + '"></head><h1>' + title
  + '</h1><div id="body">' + body + '</div></html>'
const link = (title, text = title) => '<a href="' + relative(title) + '">' + text + '</a>'
const row = (code, index, name, grade, title = name) =>
  '<tr>' + [code, index, '', link(title, name), ...Array(14).fill(''), grade, '編集']
    .map(value => '<td>' + value + '</td>').join('') + '</tr>'
const rosterPage = rows => page('敵一覧', '<table>' + rows.join('') + '</table>')
const catalogPage = titles => page('ページの一覧', '<ul>' + titles.map(title => '<li>' + link(title) + '</li>').join('') + '</ul>', root)
const logPage = (title, dates) => page(title,
  '<ul class="list1">' + dates.map(date =>
    '<li>投稿 <span class="__plugin_new" data-mtime="' + date + 'T02:00:00+09:00"></span></li>').join('') + '</ul>')
const counter = title => page(title, '<h3>カウンター</h3><ul><li>合計: 100</li><li>今日: 1</li><li>昨日: 0</li></ul>')

test('Wiki enemy roster uses linked pages, classification and URL identity', () => {
  const result = parseEnemyWikiRoster(rosterPage([
    row('A001', 'B1', 'オリジムシ', ''),
    row('K011', 'PT', 'Patriot', 'ボス'),
    row('B059', 'TL1', 'サルカズ傭兵', 'エリート'),
    row('A002', 'B1', '同じページ', '', 'オリジムシ'),
    row('A003', 'B1', '異なるページ', ''),
  ]))
  assert.deepEqual(result, [
    { index: 'B1', name: 'オリジムシ', grade: 'NORMAL', wikiUrl: url('オリジムシ') },
    { index: 'PT', name: 'Patriot', grade: 'BOSS', wikiUrl: url('Patriot') },
    { index: 'TL1', name: 'サルカズ傭兵', grade: 'ELITE', wikiUrl: url('サルカズ傭兵') },
    { index: 'B1', name: '異なるページ', grade: 'NORMAL', wikiUrl: url('異なるページ') },
  ])
  assert.throws(() => parseEnemyWikiRoster(page('FrontPage', '')), /見出し/)
})

test('a valid Wiki catalog can report no log for most enemies', async () => {
  const names = ['ア', 'イ', 'ウ', 'エ']
  const roster = names.map(name => ({ name, wikiUrl: url(name) }))
  const catalog = parseEnemyWikiCommentCatalog(catalogPage([...names, 'コメント/ア', 'コメント/イ/1']), roster)
  assert.deepEqual(catalog[url('ア')], { page: true, current: true, archives: [] })
  assert.deepEqual(catalog[url('イ')], { page: true, current: false, archives: ['コメント/イ/1'] })
  assert.deepEqual(catalog[url('ウ')], { page: true, current: false, archives: [] })
  const noFetch = () => assert.fail('No current public log should be requested.')
  assert.equal((await collectEnemyComment(roster[1], catalog[url('イ')], {}, noFetch)).status, 'unavailable')
  assert.equal((await collectEnemyComment(roster[2], catalog[url('ウ')], {}, noFetch)).status, 'no-log')
  assert.throws(() => parseEnemyWikiCommentCatalog(catalogPage(['ア']), roster), /十分/)
})

test('the 30-day count stays available when only an older archive fails', async () => {
  const row = { wikiUrl: url('Patriot'), name: 'Patriot' }
  const range = { start: '2026-11-01', throughDate: '2026-11-30' }
  const catalog = { page: true, current: true, archives: ['コメント/Patriot/1'] }
  const request = async address => {
    if (address === url('コメント/Patriot')) return logPage('コメント/Patriot', ['2026-09-21', '2026-11-16'])
    throw new Error('archive inaccessible')
  }
  assert.deepEqual(await collectEnemyComment(row, catalog, range, request), {
    status: 'available', wikiUrl: url('コメント/Patriot'), coveredFrom: range.start,
    counts: { '2026-11-16': 1 }, total: null,
  })
})

async function collectionFixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'enemy-wiki-stats-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const names = Array.from({ length: 100 }, (_, i) => 'Enemy ' + (i + 1))
  const pages = new Map(names.map(name => [url(name), counter(name)]))
  pages.set(url('敵一覧'), rosterPage(names.map((name, i) => row('A' + String(i).padStart(3, '0'), String(i), name, ''))))
  pages.set(root + '?cmd=list', catalogPage([...names, 'コメント/Enemy 1']))
  pages.set(url('コメント/Enemy 1'), logPage('コメント/Enemy 1', ['2026-10-16']))
  const settings = {
    snapshotPath: join(directory, 'snapshot.json'),
    historyDirectory: join(directory, 'history'),
    stagingDirectory: join(directory, 'staging'),
    now: () => new Date('2026-11-16T12:00:00Z'),
  }
  return { pages, settings, names }
}

test('same-day batches resume, retries advance and retain confirmed zeroes', async t => {
  const { pages, settings } = await collectionFixture(t)
  const calls = []
  const failing = new Set([url('Enemy 1'), url('Enemy 2')])
  const request = async address => {
    calls.push(address)
    if (failing.has(address)) throw new Error('counter unavailable')
    assert.ok(pages.has(address))
    return pages.get(address)
  }
  const first = await refreshEnemyWikiStats({ ...settings, limit: 3, batchSize: 1, request })
  assert.equal(first.entries[0].view, null)
  assert.deepEqual(first.entries[0].comment.counts, {})
  assert.equal(first.entries[0].comment.total, 1)
  assert.equal(first.entries[1].comment.status, 'no-log')
  assert.equal(first.entries[2].view, null)
  const next = await refreshEnemyWikiStats({ ...settings, limit: 3, batchSize: 2, request })
  assert.deepEqual(next.entries[2].view, { today: 1, yesterday: 0, total: 100 })
  const retryOptions = { ...settings, limit: 3, batchSize: 1, retry: true, request }
  assert.equal((await refreshEnemyWikiStats(retryOptions)).entries[0].view, null)
  failing.delete(url('Enemy 2'))
  const recovered = await refreshEnemyWikiStats(retryOptions)
  assert.equal(recovered.entries[1].view.yesterday, 0)
  assert.equal(recovered.entries[0].comment.total, 1)
  assert.equal(calls.filter(address => address === url('コメント/Enemy 1')).length, 1)
  const saved = JSON.parse(await readFile(join(settings.historyDirectory, '2026-11-15.json'), 'utf8'))
  assert.deepEqual(saved.counts, { [url('Enemy 3')]: 0, [url('Enemy 2')]: 0 })
})

test('a request crossing JST midnight cannot publish a mixed-day row', async t => {
  const { pages, settings } = await collectionFixture(t)
  let timestamp = '2026-11-16T14:59:59Z'
  const now = () => new Date(timestamp)
  const request = async address => {
    assert.ok(pages.has(address))
    if (address === url('コメント/Enemy 1')) timestamp = '2026-11-16T15:00:00Z'
    return pages.get(address)
  }
  await assert.rejects(refreshEnemyWikiStats({ ...settings, now, batchSize: 1, request }), /日付が変わった/)
  const saved = JSON.parse(await readFile(settings.snapshotPath, 'utf8'))
  assert.equal(saved.todayDate, '2026-11-16')
  assert.equal(saved.viewsObservedAt, null)
  assert.equal(saved.commentsObservedAt, null)
  assert.equal(saved.entries[0].view, null)
  assert.equal(saved.entries[0].comment, null)
})

test('an interrupted batch saves its last complete row and resumes with the next one', async t => {
  const { pages, settings } = await collectionFixture(t)
  const controller = new AbortController()
  const request = async address => {
    assert.ok(pages.has(address))
    if (address === url('コメント/Enemy 1')) controller.abort()
    return pages.get(address)
  }
  const first = await refreshEnemyWikiStats({ ...settings, limit: 2, request, signal: controller.signal })
  assert.equal(first.entries[0].view.yesterday, 0)
  assert.equal(first.entries[1].view, null)
  const resumed = await refreshEnemyWikiStats({
    ...settings, limit: 2, request: async address => {
      assert.equal(address, url('Enemy 2'))
      return pages.get(address)
    },
  })
  assert.equal(resumed.entries[0].comment.total, 1)
  assert.equal(resumed.entries[1].view.yesterday, 0)
})



test('Wiki bare query + means space while encoded %2B means a literal plus', async () => {
  const bob = row('A001', 'BB', 'Big Bob', '').replace('Big%20Bob', 'Big+Bob')
  const plus = row('A002', 'BP', 'Big+Bob', '')
  const roster = parseEnemyWikiRoster(rosterPage([bob, plus]))
  assert.equal(roster[0].wikiUrl, url('Big Bob'))
  assert.equal(roster[1].wikiUrl, url('Big+Bob'))
  const catalog = parseEnemyWikiCommentCatalog(
    catalogPage(['Big Bob', 'Big+Bob', 'コメント/Big Bob', 'コメント/Big Bob/1']).replaceAll('Big%20Bob', 'Big+Bob'),
    roster,
  )
  assert.deepEqual(catalog[roster[0].wikiUrl], { page: true, current: true, archives: ['コメント/Big Bob/1'] })
  assert.deepEqual(catalog[roster[1].wikiUrl], { page: true, current: false, archives: [] })
  const range = { start: '2026-11-01', throughDate: '2026-11-30' }
  const request = async address => {
    const title = decodeURIComponent(new URL(address).search.slice(1))
    return logPage(title, ['2026-11-03']).replace('Big%20Bob', 'Big+Bob')
  }
  const comments = await collectEnemyComment(roster[0], catalog[roster[0].wikiUrl], range, request)
  assert.equal(comments.total, 2)
  assert.deepEqual(comments.counts, { '2026-11-03': 2 })
})

test('daily mode publishes each batch, retries missing data, and skips a complete day without contacting Wiki', async t => {
  const { pages, settings, names } = await collectionFixture(t)
  const calls = []
  const missing = url('Enemy 2')
  const path = join(settings.historyDirectory, '2026-11-15.json')
  const request = async address => {
    if (address === missing && !calls.includes(missing)) {
      calls.push(address)
      throw new Error('counter temporarily unavailable')
    }
    calls.push(address)
    if (address === url('Enemy 51')) {
      const partial = JSON.parse(await readFile(settings.snapshotPath, 'utf8'))
      assert.equal(partial.entries.filter(entry => entry.view).length, 49)
      assert.equal(partial.entries[0].view.yesterday, 0)
      assert.equal(JSON.parse(await readFile(path, 'utf8')).counts[url('Enemy 1')], 0)
    }
    assert.ok(pages.has(address))
    return pages.get(address)
  }
  const complete = await refreshEnemyWikiStats({ ...settings, daily: true, batchSize: 50, request })
  assert.equal(complete.entries.filter(entry => entry.view).length, names.length)
  assert.equal(calls.filter(address => address === missing).length, 2)
  assert.equal(calls.filter(address => address === url('Enemy 1')).length, 1)
  assert.equal(calls.filter(address => address === url('コメント/Enemy 1')).length, 1)

  const saved = await readFile(settings.snapshotPath, 'utf8')
  const history = await readFile(path, 'utf8')
  await rm(path)
  const skip = {
    ...settings, daily: true, now: () => new Date('2026-11-16T14:59:59Z'),
    request: async () => assert.fail('Completed same-day coverage needs no Wiki request.'),
  }
  await refreshEnemyWikiStats(skip)
  assert.equal(await readFile(settings.snapshotPath, 'utf8'), saved)
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), JSON.parse(history))
  await refreshEnemyWikiStats(skip)
  assert.equal(await readFile(settings.snapshotPath, 'utf8'), saved)
})

test('another daily runner fills missing rows from the public same-day snapshot', async t => {
  const { pages, settings } = await collectionFixture(t)
  const savedAt = settings.now().toISOString()
  const controller = new AbortController()
  const lookup = address => {
    assert.ok(pages.has(address))
    return pages.get(address)
  }
  await refreshEnemyWikiStats({
    ...settings, daily: true, signal: controller.signal, request: async address => {
      if (address === url('コメント/Enemy 1')) controller.abort()
      return lookup(address)
    },
  })
  const resumedAt = '2026-11-16T14:00:00.000Z'
  const calls = []
  const recovered = await refreshEnemyWikiStats({
    ...settings, daily: true, now: () => new Date(resumedAt), stagingDirectory: settings.stagingDirectory + '-next',
    request: async address => {
      calls.push(address)
      return lookup(address)
    },
  })
  assert.ok(calls.includes(url('敵一覧')))
  assert.ok(calls.includes(url('Enemy 2')))
  assert.ok(!calls.includes(url('Enemy 1')))
  assert.ok(!calls.includes(url('コメント/Enemy 1')))
  assert.equal(recovered.entries[0].view.yesterday, 0)
  assert.equal(recovered.entries[0].comment.total, 1)
  assert.equal(recovered.commentsObservedAt, savedAt)
  assert.equal(recovered.viewsObservedAt, resumedAt)
})

test('a daily transport failure never replaces the preceding day with catalog-only data', async t => {
  const { pages, settings } = await collectionFixture(t)
  await refreshEnemyWikiStats({ ...settings, batchSize: 1, request: async address => pages.get(address) })
  const saved = await readFile(settings.snapshotPath, 'utf8')
  const priorHistory = join(settings.historyDirectory, '2026-11-15.json')
  const prior = await readFile(priorHistory, 'utf8')
  await assert.rejects(refreshEnemyWikiStats({
    ...settings, daily: true, now: () => new Date('2026-11-17T12:00:00Z'),
    request: async address => {
      if (address === url('敵一覧') || address === root + '?cmd=list') return pages.get(address)
      throw new TypeError('connection failed')
    },
  }), /取得失敗が連続/)
  assert.equal(await readFile(settings.snapshotPath, 'utf8'), saved)
  assert.equal(await readFile(priorHistory, 'utf8'), prior)
  await assert.rejects(readFile(join(settings.historyDirectory, '2026-11-16.json')), { code: 'ENOENT' })
})

test('an empty current enemy log contributes zero but cannot hide an unavailable archive', async () => {
  const name = 'Patriot'
  const row = { wikiUrl: url(name), name }
  const comment = 'コメント/' + name
  const range = { start: '2026-11-01', throughDate: '2026-11-30' }
  const catalog = { page: true, current: true, archives: [comment + '/1'] }
  const empty = page(comment, '<p>' + link(name) + '</p>')
  const failed = await collectEnemyComment(row, catalog, range, async address => {
    if (address === url(comment)) return empty
    throw new Error('archive inaccessible')
  })
  assert.equal(failed.coveredFrom, null)
  assert.equal(failed.total, null)

  const complete = await collectEnemyComment(row, catalog, range, async address => address === url(comment)
    ? empty : logPage(comment + '/1', ['2026-11-03']))
  assert.equal(complete.total, 1)
  assert.deepEqual(complete.counts, { '2026-11-03': 1 })
})

test('enemy comments count an undated old parent without blocking the recent period', async () => {
  const name = 'Patriot'
  const title = 'コメント/' + name
  const html = page(title, '<ul class="list1"><li>日時のない投稿<ul class="list2"><li>返信'
    + '<span class="__plugin_new" data-mtime="2021-01-02T12:00:00+09:00"></span></li></ul></li>'
    + '<li>最近の投稿<span class="__plugin_new" data-mtime="2026-11-19T12:00:00+09:00"></span></li></ul>')
  const result = await collectEnemyComment({ name, wikiUrl: url(name) },
    { page: true, current: true, archives: [] }, { start: '2026-11-01', throughDate: '2026-11-30' }, async () => html)
  assert.deepEqual(result, {
    status: 'available', wikiUrl: url(title), coveredFrom: '2026-11-01', counts: { '2026-11-19': 1 }, total: 3,
  })
})

test('enemy comments retain a known cumulative total when an undated post affects recent periods', async () => {
  const name = 'Patriot'
  const title = 'コメント/' + name
  const range = { start: '2026-11-01', throughDate: '2026-11-30' }
  const catalog = { page: true, current: true, archives: [] }
  const dated = '<li>最近の投稿<span class="__plugin_new" data-mtime="2026-11-28T12:00:00+09:00"></span></li>'
  const uncertain = await collectEnemyComment({ name, wikiUrl: url(name) }, catalog, range,
    async () => page(title, '<ul class="list1"><li>日時のない投稿</li>' + dated + '</ul>'))
  assert.deepEqual(uncertain, { status: 'available', wikiUrl: url(title), coveredFrom: null, counts: {}, total: 2 })

  const bounded = await collectEnemyComment({ name, wikiUrl: url(name) }, catalog, range, async () => page(title,
    '<ul class="list1"><li>日時のない投稿<ul class="list2"><li>返信'
    + '<span class="__plugin_new" data-mtime="2026-11-10T12:00:00+09:00"></span></li></ul></li>' + dated + '</ul>'))
  assert.deepEqual(bounded, {
    status: 'available', wikiUrl: url(title), coveredFrom: '2026-11-11', counts: { '2026-11-28': 1 }, total: 3,
  })
})
