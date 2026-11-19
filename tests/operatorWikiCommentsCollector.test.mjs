import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  collectOperatorCommentEntry,
  commentWindow,
  parseCommentCatalog,
  parseCommentLog,
  refreshOperatorWikiComments,
} from '../scripts/refreshOperatorWikiComments.mjs'

const root = 'https://arknights.wikiru.jp'
const title = 'アーミヤ(前衛)'
const log = 'コメント/' + title
const url = page => root + '/?' + encodeURIComponent(page)
const marker = date => '<span class="__plugin_new" data-mtime="' + date + '"></span>'
const page = (pageTitle, body) => '<head><link rel="canonical" href="' + root + '?'
  + encodeURIComponent(pageTitle) + '"></head><h1>' + pageTitle + '</h1><div id="body">' + body + '</div>'
const post = date => '<li>投稿 <span class="comment_date">' + marker(date) + '</span></li>'
const list = posts => '<ul class="list1 list-indent1">' + posts + '</ul>'
const link = pageTitle => '<a href="./?' + pageTitle.split('/').map(encodeURIComponent).join('/') + '">リンク</a>'

test('Wikiの正規URLは括弧のパーセント表記でも同じページとして検証する', () => {
  for (const title of ['コメント/W(プレイアブル)', 'コメント/アーミヤ(前衛)', 'コメント/アーミヤ(医療)/1']) {
    const source = page(title, list(post('2026-11-18T11:02:00+09:00')))
    const html = source.replace(/href="[^"]*"/u, address => address.replaceAll('(', '%28').replaceAll(')', '%29'))
    assert.deepEqual(parseCommentLog(html, title), ['2026-11-18'])
  }
})

test('Wikiの正規URLは異なるホスト・パス・クエリや制御文字を受け付けない', () => {
  const source = page(log, list(post('2026-11-18T11:02:00+09:00')))
  const canonical = url(log)
  for (const address of [
    canonical.replace('arknights.wikiru.jp', 'example.com'),
    canonical.replace('https://', 'https://name@'),
    canonical.replace('/?', '/index.php?'),
    canonical + '#section',
    root + '/?page=' + encodeURIComponent(log),
    canonical + '&other',
    canonical + '%GG',
  ]) {
    const html = source.replace(/href="[^"]*"/u, 'href="' + address + '"')
    assert.throws(() => parseCommentLog(html, log), /正規 URL/)
  }
  for (const title of ['コメント/a=b', 'コメント/a\u0000b', 'コメント/a\nb']) {
    const html = page(title, list(post('2026-11-18T11:02:00+09:00')))
    assert.throws(() => parseCommentLog(html, title), /正規 URL/)
  }
})

function commentSnapshot(observedAt) {
  return {
    observedAt: observedAt.toISOString(),
    throughDate: commentWindow(observedAt).throughDate,
    entries: [{ operatorId: 'amiya', wikiUrl: url(log), coveredFrom: null, counts: {}, total: null }],
  }
}

test('再取得は日本時間の前日まで保存済みなら、未取得の行があっても収集しない', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wiki-comments-'))
  try {
    const snapshotPath = join(directory, 'comments.json')
    const saved = JSON.stringify(commentSnapshot(new Date('2026-11-13T00:17:00Z')))
    await writeFile(snapshotPath, saved)
    await refreshOperatorWikiComments({
      ifStale: true, snapshotPath, viewsPath: join(directory, 'missing-views.json'),
      now: () => new Date('2026-11-13T14:59:59Z'),
      collect: () => assert.fail('更新済みのため収集しない'),
    })
    assert.equal(await readFile(snapshotPath, 'utf8'), saved)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('日付が変わると再取得し、失敗時は前回データを保持して次回に再試行できる', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wiki-comments-'))
  try {
    const snapshotPath = join(directory, 'comments.json')
    const viewsPath = join(directory, 'views.json')
    const stagingDirectory = join(directory, 'staging')
    const saved = JSON.stringify(commentSnapshot(new Date('2026-11-13T00:17:00Z')))
    await writeFile(snapshotPath, saved)
    await writeFile(viewsPath, '{}')
    const observedAt = new Date('2026-11-13T15:00:00Z')
    const options = { ifStale: true, snapshotPath, viewsPath, stagingDirectory, now: () => observedAt }
    await assert.rejects(refreshOperatorWikiComments({
      ...options, collect: async () => { throw new Error('取得失敗') },
    }), /取得失敗/)
    assert.equal(await readFile(snapshotPath, 'utf8'), saved)

    const refreshed = commentSnapshot(observedAt)
    const collect = async (_views, { now }) => {
      assert.equal(now().toISOString(), observedAt.toISOString())
      return refreshed
    }
    for (const path of [snapshotPath, join(directory, 'missing-comments.json')]) {
      await refreshOperatorWikiComments({ ...options, snapshotPath: path, collect })
      assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), refreshed)
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('本文のコメントと返信だけを日本時間で数える', () => {
  const first = marker('2026-11-01T23:59:00+09:00')
  const reply = post('2026-11-01T15:00:00Z')
  const unrelated = marker('2026-11-01T05:00:00+09:00')
  const html = page(log, unrelated + '<!--' + list(post('2026-10-30T10:00:00+09:00')) + '-->'
    + '<ul><li>' + unrelated + '</li></ul>'
    + list('<li>' + first + '<ul class="list2">' + reply + reply + '</ul></li>'))
  assert.deepEqual(parseCommentLog(html, log), ['2026-11-01', '2026-11-02', '2026-11-02'])
})

test('空のページや投稿日時が欠けたログを0件とみなさない', () => {
  assert.throws(() => parseCommentLog(page(log, ''), log), /ログを確認できません/)
  assert.throws(() => parseCommentLog(page(log, list('<li>投稿日時なし</li>')), log), /投稿日時のない/)
  assert.throws(() => parseCommentLog(page('FrontPage', ''), log), /ページの見出し/)
  const wrongCanonical = page(log, '').replace(encodeURIComponent(log), 'FrontPage')
  assert.throws(() => parseCommentLog(wrongCanonical, log), /正規 URL/)
})

test('削除済みの表示と親投稿内の署名のない箇条書きを除き、時刻付きの返信を数える', () => {
  const reply = post('2020-03-11T23:43:12+09:00')
  const deleted = '<li><span class="size3"><span style="color:#ff0000"><strong>投稿者本人が削除しました</strong>'
    + '</span></span><ul class="list2">' + reply + '</ul></li>'
  const bullet = '<li>' + marker('2020-04-11T16:00:00+09:00')
    + '<ul class="list2"><li>コメント本文内の箇条書き</li></ul></li>'
  assert.deepEqual(parseCommentLog(page(log, list(deleted + bullet)), log), ['2020-03-11', '2020-04-11'])
})

test('同じリスト項目に改行で分かれた投稿日時が2件ある場合は両方を数える', () => {
  const first = marker('2020-04-08T14:27:56+09:00')
  const second = marker('2020-04-08T16:21:04+09:00')
  assert.deepEqual(parseCommentLog(page(log, list('<li>' + first + '<br />' + second + '</li>')), log),
    ['2020-04-08', '2020-04-08'])
  assert.throws(() => parseCommentLog(page(log, list('<li>' + first + second + '</li>')), log), /判別できません/)
})

test('旧ログの投稿署名は秒が欠けていても日付が判別できる場合に集計する', () => {
  const legacy = '<li>投稿 -- [example] &amp;new{2020-04-08 (水) 18:58:</li>'
  assert.deepEqual(parseCommentLog(page(log, list(legacy)), log), ['2020-04-08'])
  assert.throws(() => parseCommentLog(page(log, list(legacy.replace('04-08', '02-31'))), log), /投稿日時のない/)
})

test('期間の初日に現行ログと過去ログの投稿がある場合に両方を数える', async () => {
  const range = commentWindow(new Date('2026-11-12T15:00:00Z'))
  assert.deepEqual(range, { start: '2026-10-14', throughDate: '2026-11-12' })
  const archive = log + '/1'
  const oldArchive = log + '/2'
  const requests = []
  const pages = new Map([
    [url(log), page(log, list(post('2026-10-14T12:00:00+09:00') + post('2026-11-13T00:00:00+09:00')))],
    [url(title), page(title, link(archive) + link(oldArchive))],
    [url(archive), page(archive, list(post('2025-04-03T12:00:00+09:00')))],
    [url(oldArchive), page(oldArchive, list(post('2026-10-13T12:00:00+09:00') + post('2026-10-14T12:00:00+09:00')))],
  ])
  const entry = { operatorId: 'amiya', wikiUrl: url(title) }
  const request = async (address) => {
    requests.push(address)
    if (!pages.has(address)) throw new Error('取得失敗')
    return pages.get(address)
  }
  assert.deepEqual(await collectOperatorCommentEntry(entry, range, request), {
    operatorId: 'amiya', wikiUrl: url(log), coveredFrom: '2026-10-14', counts: { '2026-10-14': 2 }, total: 5,
  })
  assert.deepEqual(requests, [url(log), url(title), url(oldArchive), url(archive)])

  pages.delete(url(archive))
  assert.deepEqual(await collectOperatorCommentEntry(entry, range, request), {
    operatorId: 'amiya', wikiUrl: url(log), coveredFrom: '2026-10-14', counts: { '2026-10-14': 2 }, total: null,
  })

  pages.delete(url(oldArchive))
  assert.deepEqual(await collectOperatorCommentEntry(entry, range, request), {
    operatorId: 'amiya', wikiUrl: url(log), coveredFrom: null, counts: {}, total: null,
  })
})

test('公開ページ一覧からキャラクターごとの番号付き過去ログを重複なしで確認する', () => {
  const catalog = body => '<head><link rel="canonical" href="' + root
    + '/"></head><h1>ページの一覧</h1><div id="body">' + body + '</div>'
  const mapping = [{ operatorId: 'amiya', wikiUrl: url(title) }]
  const unrelated = 'コメント/別のキャラクター/1'
  const html = catalog(link(log) + link(log + '/1') + link(log + '/2') + link(log + '/2') + link(unrelated))
  assert.deepEqual(parseCommentCatalog(html, mapping), new Map([[log, [log + '/2', log + '/1']]]))
  assert.throws(() => parseCommentCatalog(catalog(link(unrelated)), mapping), /十分に確認できません/)
})

test('公開ページ一覧に現行ログが載っていなくても掲載済みの過去ログを使う', () => {
  const operators = Array.from({ length: 9 }, (_, index) => 'オペレーター' + index)
  const mapping = [...operators, title].map(name => ({ operatorId: name, wikiUrl: url(name) }))
  const body = operators.map(name => link('コメント/' + name)).join('') + link(log + '/1')
  const html = '<head><link rel="canonical" href="' + root
    + '/"></head><h1>ページの一覧</h1><div id="body">' + body + '</div>'
  assert.deepEqual(parseCommentCatalog(html, mapping).get(log), [log + '/1'])
})

test('敵ログだけで削除マーカーの誤字と壊れた署名を除く', () => {
  const dated = post('2026-11-16T12:00:00+09:00')
  const typo = '<li><span style="color:#ff0000"><strong>投降者本人が削除しました</strong></span></li>'
  const missingBracket = ' -- [example] 2024-03-19 (火) 21:48:46};'
  const signedDeletion = '<li><span style="color:#ff0000"><strong>投稿者本人が削除しました</strong></span>'
    + missingBracket + '</li>'
  const source = page(log, list(dated + typo + signedDeletion))
  const options = { enemyLogOwner: title }
  assert.deepEqual(parseCommentLog(source, log, undefined, options), ['2026-11-16'])
  assert.throws(() => parseCommentLog(source, log), /投稿日時のない/)
  assert.throws(() => parseCommentLog(page(log, list(dated + '<li>投稿日時なし</li>')), log, undefined, options),
    /投稿日時のない/)
  const unverifiedTail = signedDeletion.replace(missingBracket, ' 投稿本文')
  assert.throws(() => parseCommentLog(page(log, list(dated + unverifiedTail)), log, undefined, options),
    /投稿日時のない/)
})

test('敵ログだけで正しい個別ページへの戻りリンクだけを0件として扱う', () => {
  const backLink = link(title).replace('>リンク<', '>' + title + '<')
  const empty = '<p>' + backLink + '</p>'
  const options = { enemyLogOwner: title }
  assert.deepEqual(parseCommentLog(page(log, empty), log, undefined, options), [])
  assert.deepEqual(parseCommentLog(page(log + '/1', empty), log + '/1', undefined, options), [])
  assert.throws(() => parseCommentLog(page(log, empty), log), /ログを確認できません/)
  assert.throws(() => parseCommentLog(page(log, ''), log, undefined, options), /ログを確認できません/)
  assert.throws(() => parseCommentLog(page(log, '<p>' + link('他の敵') + '</p>'), log, undefined, options),
    /ログを確認できません/)
  assert.throws(() => parseCommentLog(page(log, empty + '<p>投稿に見える記述</p>'), log, undefined, options),
    /ログを確認できません/)
})


function viewsForComments(entries, observedAt) {
  const throughDate = commentWindow(observedAt).throughDate
  return {
    observedAt: observedAt.toISOString(),
    todayDate: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', dateStyle: 'short' }).format(observedAt),
    yesterdayDate: throughDate,
    entries: entries.map(([operatorId, title]) => ({ operatorId, wikiUrl: url(title), yesterday: null, today: null, total: null })),
  }
}

test('同日の新規オペレーターだけをコメント取得し、既存の0件と未取得を保持する', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'wiki-comments-roster-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const observedAt = new Date('2026-11-13T06:37:00Z')
  const snapshotPath = join(directory, 'comments.json')
  const viewsPath = join(directory, 'views.json')
  const current = commentSnapshot(new Date('2026-11-13T00:17:00Z'))
  current.entries[0].coveredFrom = '2026-10-14'
  const zero = { operatorId: 'zero', wikiUrl: url('コメント/ゼロ'), coveredFrom: '2026-10-14', counts: {}, total: 0 }
  current.entries.push(zero)
  await writeFile(snapshotPath, JSON.stringify(current))
  const mapping = viewsForComments([['amiya', title], ['zero', 'ゼロ'], ['new', '新オペレーター']], observedAt)
  await writeFile(viewsPath, JSON.stringify(mapping))
  const added = { operatorId: 'new', wikiUrl: url('コメント/新オペレーター'), coveredFrom: '2026-10-14', counts: {}, total: 0 }
  await refreshOperatorWikiComments({
    ifStale: true, snapshotPath, viewsPath, stagingDirectory: join(directory, 'staging'), now: () => observedAt,
    collect: async (actualMapping, { operatorIds, now }) => {
      assert.deepEqual(actualMapping, mapping)
      assert.deepEqual([...operatorIds], ['new'])
      assert.equal(now().toISOString(), observedAt.toISOString())
      return { observedAt: observedAt.toISOString(), throughDate: current.throughDate, entries: [added] }
    },
  })
  const saved = JSON.parse(await readFile(snapshotPath, 'utf8'))
  assert.deepEqual(saved.entries, [...current.entries, added])
  const bytes = await readFile(snapshotPath, 'utf8')
  await refreshOperatorWikiComments({
    ifStale: true, snapshotPath, viewsPath, now: () => observedAt,
    collect: () => assert.fail('新規オペレーターを保存済みのため再取得しない'),
  })
  assert.equal(await readFile(snapshotPath, 'utf8'), bytes)
})

test('同日の新規コメント取得に失敗した場合は保存済みデータを維持し、次回に再試行する', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'wiki-comments-roster-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const observedAt = new Date('2026-11-13T06:37:00Z')
  const snapshotPath = join(directory, 'comments.json')
  const viewsPath = join(directory, 'views.json')
  const current = commentSnapshot(new Date('2026-11-13T00:17:00Z'))
  current.entries[0].coveredFrom = '2026-10-14'
  const original = JSON.stringify(current)
  await writeFile(snapshotPath, original)
  await writeFile(viewsPath, JSON.stringify(viewsForComments([['amiya', title], ['new', '新オペレーター']], observedAt)))
  const options = {
    ifStale: true, snapshotPath, viewsPath, stagingDirectory: join(directory, 'staging'), now: () => observedAt,
  }
  await assert.rejects(refreshOperatorWikiComments({
    ...options, collect: async () => { throw new Error('Wiki に接続できません') },
  }), /接続できません/)
  assert.equal(await readFile(snapshotPath, 'utf8'), original)

  let attempts = 0
  const failed = { operatorId: 'new', wikiUrl: url('コメント/新オペレーター'), coveredFrom: null, counts: {}, total: null }
  for (let run = 0; run < 2; run += 1) {
    await refreshOperatorWikiComments({
      ...options, collect: async (_mapping, { operatorIds }) => {
        attempts += 1
        assert.deepEqual([...operatorIds], ['new'])
        return { observedAt: observedAt.toISOString(), throughDate: current.throughDate, entries: [failed] }
      },
    })
    assert.equal(await readFile(snapshotPath, 'utf8'), original)
  }
  assert.equal(attempts, 2)
})

test('同じIDのコメントページが変わった場合は新しいページを取得し、別日付を混ぜない', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'wiki-comments-roster-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const observedAt = new Date('2026-11-13T06:37:00Z')
  const snapshotPath = join(directory, 'comments.json')
  const viewsPath = join(directory, 'views.json')
  const current = commentSnapshot(new Date('2026-11-13T00:17:00Z'))
  const original = JSON.stringify(current)
  await writeFile(snapshotPath, original)
  await writeFile(viewsPath, JSON.stringify(viewsForComments([['amiya', '新しいページ名']], observedAt)))
  const options = { ifStale: true, snapshotPath, viewsPath, stagingDirectory: join(directory, 'staging'), now: () => observedAt }
  const nextDay = new Date('2026-11-13T15:01:00Z')
  await assert.rejects(refreshOperatorWikiComments({
    ...options, collect: async () => ({ ...current, observedAt: nextDay.toISOString(), throughDate: '2026-11-13' }),
  }), /日付が変わった/)
  assert.equal(await readFile(snapshotPath, 'utf8'), original)

  const replacement = { ...current.entries[0], wikiUrl: url('コメント/新しいページ名'), coveredFrom: '2026-10-14', total: 0 }
  await refreshOperatorWikiComments({
    ...options, collect: async (_mapping, { operatorIds }) => {
      assert.deepEqual([...operatorIds], ['amiya'])
      return { ...current, observedAt: observedAt.toISOString(), entries: [replacement] }
    },
  })
  assert.deepEqual(JSON.parse(await readFile(snapshotPath, 'utf8')).entries, [replacement])
})

test('一覧にはあるが期間別と累計を両方取得できなかったOPを補完する', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'wiki-comments-missing-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const observedAt = new Date('2026-11-13T06:37:00Z')
  const snapshotPath = join(directory, 'comments.json')
  const viewsPath = join(directory, 'views.json')
  const current = commentSnapshot(observedAt)
  await writeFile(snapshotPath, JSON.stringify(current))
  await writeFile(viewsPath, JSON.stringify(viewsForComments([['amiya', title]], observedAt)))
  const restored = { ...current.entries[0], coveredFrom: '2026-10-14', total: 0 }
  await refreshOperatorWikiComments({
    ifStale: true, snapshotPath, viewsPath, stagingDirectory: join(directory, 'staging'), now: () => observedAt,
    collect: async (_mapping, { operatorIds }) => {
      assert.deepEqual([...operatorIds], ['amiya'])
      return { ...current, entries: [restored] }
    },
  })
  assert.deepEqual(JSON.parse(await readFile(snapshotPath, 'utf8')).entries, [restored])
})
