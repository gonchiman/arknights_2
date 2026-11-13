import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { refreshOperatorWikiViews } from '../scripts/refreshOperatorWikiViews.mjs'

const date = '2026-11-12'
const collectionDate = '2026-11-13'
const firstObservation = '2026-11-13T00:17:00Z'
const retryObservation = '2026-11-13T06:37:00Z'

function entry(operatorId, yesterday, today = 10, total = 100) {
  return { operatorId, wikiUrl: `https://arknights.wikiru.jp/?${operatorId}`, yesterday, today, total }
}

function snapshot(entries, fields = {}) {
  return { observedAt: firstObservation, todayDate: collectionDate, yesterdayDate: date, entries, ...fields }
}

async function setup(context, latest, history) {
  const root = await mkdtemp(join(tmpdir(), 'operator-wiki-views-recovery-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  const historyDirectory = join(root, 'history')
  const snapshotPath = join(root, 'operator-wiki-views.json')
  const historyPath = join(historyDirectory, `${date}.json`)
  const readJson = async path => JSON.parse(await readFile(path, 'utf8'))
  await mkdir(historyDirectory)
  await writeFile(snapshotPath, JSON.stringify(latest))
  if (history) await writeFile(historyPath, JSON.stringify(history))
  return {
    recover: collect => refreshOperatorWikiViews({
      mode: 'recover-yesterday',
      snapshotPath,
      historyDirectory,
      stagingDirectory: join(root, 'staging'),
      collect,
      now: () => new Date(retryObservation),
    }),
    readLatest: () => readJson(snapshotPath),
    readHistory: (day = date) => readJson(join(historyDirectory, `${day}.json`)),
  }
}

test('前日分の履歴がすべて保存済みなら実測 0 を含めて再取得しない', async context => {
  const latest = snapshot([entry('amiya', 0), entry('lava', 2)])
  const history = { date, observedAt: firstObservation, counts: { amiya: 0, lava: 2 } }
  const { recover, readLatest, readHistory } = await setup(context, latest, history)

  await recover(() => assert.fail('保存済みのページを再取得した'))

  assert.deepEqual(await readLatest(), latest)
  assert.deepEqual(await readHistory(), history)
})

test('前日分が一部未保存なら該当するページだけ補完し、当日値と取得時刻を維持する', async context => {
  const latest = snapshot([entry('amiya', 0), entry('lava', null, null, null), entry('nearl', null, 20, 200)])
  const history = { date, observedAt: firstObservation, counts: { amiya: 0, lava: null } }
  const { recover, readLatest, readHistory } = await setup(context, latest, history)

  await recover(async entries => {
    assert.deepEqual(entries.map(({ operatorId }) => operatorId), ['lava', 'nearl'])
    return snapshot([entry('lava', 12, 70, 700), entry('nearl', 0, 80, 800)], { observedAt: retryObservation })
  })

  assert.deepEqual(await readLatest(), snapshot([
    entry('amiya', 0), entry('lava', 12, null, null), entry('nearl', 0, 20, 200),
  ]))
  assert.deepEqual((await readHistory()).counts, { amiya: 0, lava: 12, nearl: 0 })
})

test('前日分の履歴がなければ、最新の一覧が古くても全ページを取得する', async context => {
  const latest = snapshot([entry('amiya', 7), entry('lava', 8)], {
    observedAt: '2026-11-12T00:17:00Z', todayDate: date, yesterdayDate: '2026-11-11',
  })
  const updated = snapshot([entry('amiya', 1), entry('lava', 2)], { observedAt: retryObservation })
  const { recover, readLatest, readHistory } = await setup(context, latest)

  await recover(async entries => {
    assert.deepEqual(entries.map(({ operatorId }) => operatorId), ['amiya', 'lava'])
    return updated
  })

  assert.deepEqual(await readLatest(), updated)
  assert.deepEqual((await readHistory()).counts, { amiya: 1, lava: 2 })
  assert.deepEqual((await readHistory('2026-11-11')).counts, { amiya: 7, lava: 8 })
})

test('再取得の対象日が日本時間で変わった場合は保存しない', async context => {
  const latest = snapshot([entry('amiya', null, null, null)])
  const history = { date, observedAt: firstObservation, counts: { amiya: null } }
  const { recover, readLatest, readHistory } = await setup(context, latest, history)

  await assert.rejects(recover(async () => snapshot([entry('amiya', 999)], {
    observedAt: '2026-11-13T15:01:00Z', todayDate: '2026-11-14', yesterdayDate: collectionDate,
  })))

  assert.deepEqual(await readLatest(), latest)
  assert.deepEqual(await readHistory(), history)
  await assert.rejects(readHistory(collectionDate), { code: 'ENOENT' })
})
