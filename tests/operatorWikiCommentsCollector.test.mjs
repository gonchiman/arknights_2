import assert from 'node:assert/strict'
import test from 'node:test'
import {
  collectOperatorCommentEntry,
  commentWindow,
  parseCommentCatalog,
  parseCommentLog,
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
