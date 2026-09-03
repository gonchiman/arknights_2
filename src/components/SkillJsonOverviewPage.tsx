import { useMemo, useState } from 'react'
import {
  buildSkillJsonOverview,
  type SkillJsonOverviewExample,
} from '../lib/skillJsonOverview'
import { createSkillJsonHash } from '../lib/routes'
import type { SkillRecord } from '../types/skill'
import { SkillJsonViewNav } from './SkillJsonViewNav'
import './SkillJsonOverviewPage.css'

interface Props {
  rows: SkillRecord[]
  loading: boolean
}

const PAGE_SIZE = 50
const COUNT_FORMAT = new Intl.NumberFormat('ja-JP')

export function SkillJsonOverviewPage({ rows, loading }: Props) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const overview = useMemo(() => buildSkillJsonOverview(rows, 'ALL_LEVELS'), [rows])
  const keys = useMemo(
    () => overview.keyInventory.filter((item) => item.keyStatus === 'PRESENT'),
    [overview.keyInventory],
  )
  const filteredKeys = useMemo(() => {
    const needle = normalizeSearch(query)
    if (!needle) return keys
    return keys.filter((item) => normalizeSearch(item.key ?? '').includes(needle))
  }, [keys, query])

  const pageCount = Math.max(1, Math.ceil(filteredKeys.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const visibleKeys = filteredKeys.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  return (
    <section className="skill-json-overview-page">
      <header className="page-intro skill-json-overview-intro">
        <div>
          <span className="page-kicker">SKILL TABLE KEY LIST</span>
          <h1>Skill JSON キー一覧</h1>
        </div>
        <p>プレイアブルなオペレーターの全スキル・全レベルに存在するblackboardキーを、重複なしで確認できます。</p>
      </header>

      <SkillJsonViewNav active="overview" />

      {loading && rows.length === 0 ? (
        <OverviewState title="キー一覧を作成しています" />
      ) : rows.length === 0 ? (
        <OverviewState title="表示できるキーがありません" description="ゲームデータを取得できる状態か確認してください。" />
      ) : (
        <section className="skill-json-overview-section" aria-labelledby="skill-json-key-inventory-heading">
          <header className="skill-json-overview-section-heading">
            <div>
              <span>RAW KEY INVENTORY</span>
              <h2 id="skill-json-key-inventory-heading">blackboard key</h2>
            </div>
            <p>{formatCount(filteredKeys.length)} / {formatCount(keys.length)} keys</p>
          </header>

          <div className="skill-json-overview-toolbar">
            <label>
              <span>キーを検索</span>
              <input
                type="search"
                value={query}
                placeholder="例: atk, duration, times"
                onChange={(event) => {
                  setQuery(event.target.value)
                  setPage(0)
                }}
              />
            </label>
            <small>プレイアブルなオペレーターから参照されるスキルが対象です。</small>
          </div>

          {visibleKeys.length === 0 ? (
            <p className="skill-json-overview-empty">一致するキーがありません。</p>
          ) : (
            <div
              className="table-wrap skill-json-overview-table-wrap"
              role="region"
              aria-label="blackboardキー一覧。横方向にスクロールできます"
              tabIndex={0}
            >
              <table className="skill-json-key-inventory-table">
                <caption className="visually-hidden">全スキルのblackboardキー一覧</caption>
                <thead>
                  <tr>
                    <th>raw key</th>
                    <th>使用状況</th>
                    <th>使用例</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleKeys.map((item) => (
                    <tr key={item.id}>
                      <td><code>{item.key}</code></td>
                      <td>
                        <strong>{formatCount(item.placementCount)} 使用箇所</strong>
                        <small>{formatCount(item.entryCount)} entries</small>
                      </td>
                      <td><ExampleLink example={item.examples[0]} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Pagination
            page={safePage}
            pageCount={pageCount}
            itemCount={filteredKeys.length}
            onChange={setPage}
          />
        </section>
      )}
    </section>
  )
}

function ExampleLink({ example }: { example?: SkillJsonOverviewExample }) {
  if (!example) return <span className="skill-json-overview-muted">—</span>
  return (
    <div className="skill-json-overview-example">
      <a href={createSkillJsonHash(example)}>
        {example.operatorName} · S{example.skillIndex} · {example.levelLabel}
      </a>
      <small>{example.skillName}</small>
    </div>
  )
}

function Pagination({
  page,
  pageCount,
  itemCount,
  onChange,
}: {
  page: number
  pageCount: number
  itemCount: number
  onChange: (page: number) => void
}) {
  if (itemCount <= PAGE_SIZE) return null
  return (
    <nav className="skill-json-overview-pagination" aria-label="キー一覧のページ">
      <button type="button" disabled={page === 0} onClick={() => onChange(page - 1)}>← 前へ</button>
      <span>{page + 1} / {pageCount}</span>
      <button type="button" disabled={page >= pageCount - 1} onClick={() => onChange(page + 1)}>次へ →</button>
    </nav>
  )
}

function OverviewState({ title, description }: { title: string, description?: string }) {
  return (
    <section className="operator-empty-state skill-json-overview-state" role="status">
      <strong>{title}</strong>
      {description && <span>{description}</span>}
    </section>
  )
}

function normalizeSearch(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('ja')
}

function formatCount(value: number): string {
  return COUNT_FORMAT.format(value)
}
