import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { saveOperatorWikiViewHistory } from '../scripts/archiveOperatorWikiViews.mjs'

function snapshot({ todayDate, yesterdayDate, observedAt, counts }) {
  return {
    todayDate,
    yesterdayDate,
    observedAt,
    entries: Object.entries(counts).map(([operatorId, yesterday]) => ({
      operatorId,
      wikiUrl: `https://arknights.wikiru.jp/?${operatorId}`,
      yesterday,
      today: 100,
      total: 200,
    })),
  }
}

test('Wiki の前日分を日付別に保存し、取得順が前後しても既知の値と実測の 0 を保持する', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'operator-wiki-views-history-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  const options = { directory: join(root, 'history'), stagingDirectory: join(root, 'staging') }
  const firstDate = { todayDate: '2026-11-12', yesterdayDate: '2026-11-11' }
  await saveOperatorWikiViewHistory(snapshot({
    ...firstDate,
    observedAt: '2026-11-12T00:17:00Z',
    counts: { char_amiya: 10, char_dobermann: 6, char_lava: null, char_nearl: null },
  }), options)
  const latest = snapshot({
    ...firstDate,
    observedAt: '2026-11-12T01:17:00Z',
    counts: { char_amiya: 0, char_lava: null, char_nearl: null },
  })
  await saveOperatorWikiViewHistory(latest, options)
  await saveOperatorWikiViewHistory(snapshot({
    ...firstDate,
    observedAt: '2026-11-12T00:37:00Z',
    counts: { char_amiya: 11, char_dobermann: null, char_lava: 5 },
  }), options)
  await saveOperatorWikiViewHistory(latest, options)

  await saveOperatorWikiViewHistory(snapshot({
    todayDate: '2026-11-13',
    yesterdayDate: '2026-11-12',
    observedAt: '2026-11-13T00:17:00Z',
    counts: { char_amiya: 50 },
  }), options)

  assert.deepEqual((await readdir(options.directory)).sort(), ['2026-11-11.json', '2026-11-12.json'])
  const readDate = async date => JSON.parse(await readFile(join(options.directory, `${date}.json`), 'utf8'))
  assert.deepEqual(await readDate('2026-11-11'), {
    date: '2026-11-11',
    observedAt: latest.observedAt,
    counts: { char_amiya: 0, char_dobermann: 6, char_lava: 5, char_nearl: null },
  })
  assert.deepEqual(await readDate('2026-11-12'), {
    date: '2026-11-12',
    observedAt: '2026-11-13T00:17:00Z',
    counts: { char_amiya: 50 },
  })
  assert.deepEqual(await readdir(options.stagingDirectory), [])
})
