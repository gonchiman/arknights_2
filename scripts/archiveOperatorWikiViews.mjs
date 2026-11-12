import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseOperatorWikiViewSnapshot } from '../src/lib/operatorWikiViews.ts'

const HISTORY_DIRECTORY = fileURLToPath(new URL('../public/data/operator-wiki-views-history/', import.meta.url))
const STAGING_DIRECTORY = fileURLToPath(new URL('../.cache/', import.meta.url))

async function readHistory(path, date) {
  let source
  try {
    source = await readFile(path, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }

  const history = JSON.parse(source)
  if (history?.date !== date || typeof history.observedAt !== 'string'
    || !Number.isFinite(Date.parse(history.observedAt))
    || !history.counts || typeof history.counts !== 'object' || Array.isArray(history.counts)
    || Object.entries(history.counts).some(([id, value]) =>
      !id.trim() || (value !== null && (!Number.isSafeInteger(value) || value < 0)))) {
    throw new Error(`Wiki 閲覧数の履歴が不正です。 ${path}`)
  }
  return { history, source }
}

export async function saveOperatorWikiViewHistory(snapshot, {
  directory = HISTORY_DIRECTORY,
  stagingDirectory = STAGING_DIRECTORY,
} = {}) {
  const { observedAt, yesterdayDate: date, entries } = parseOperatorWikiViewSnapshot(snapshot)
  await mkdir(stagingDirectory, { recursive: true })
  const lockPath = join(stagingDirectory, `operator-wiki-views-history.${date}.lock`)
  let lock
  try {
    lock = await open(lockPath, 'wx')
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new Error(`Wiki 閲覧数の履歴は別の処理が使用中です。 ${lockPath}`, { cause: error })
    }
    throw error
  }

  try {
    const destination = join(directory, `${date}.json`)
    const existing = await readHistory(destination, date)
    const previous = existing?.history
    const isNewer = !previous || Date.parse(observedAt) > Date.parse(previous.observedAt)
    const counts = new Map(Object.entries(previous?.counts ?? {}))
    for (const { operatorId, yesterday } of entries) {
      if (!counts.has(operatorId) || (yesterday !== null && (isNewer || counts.get(operatorId) === null))) {
        counts.set(operatorId, yesterday)
      }
    }
    const history = {
      date,
      observedAt: isNewer ? observedAt : previous.observedAt,
      counts: Object.fromEntries([...counts.keys()].sort().map(id => [id, counts.get(id)])),
    }
    const source = `${JSON.stringify(history)}\n`
    if (source === existing?.source) return

    await mkdir(directory, { recursive: true })
    const temporary = join(stagingDirectory, `operator-wiki-views-history.${date}.${randomUUID()}.json`)
    await writeFile(temporary, source, { flag: 'wx' })
    try {
      await rename(temporary, destination)
    } catch (error) {
      throw new Error(`Wiki 閲覧数の履歴を保存できませんでした。取得済みデータ ${temporary}`, { cause: error })
    }
  } finally {
    await lock.close()
    await unlink(lockPath)
  }
}
