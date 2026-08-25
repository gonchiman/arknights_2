import { useEffect, useMemo, useState } from 'react'
import { Filters, type FilterState } from './components/Filters'
import { SkillDetail } from './components/SkillDetail'
import { SkillTable } from './components/SkillTable'
import { SummaryCards } from './components/SummaryCards'
import { DATA_URLS, loadSkillRecords } from './lib/arknightsData'
import { exportSkillsCsv } from './lib/exportCsv'
import type { SkillRecord } from './types/skill'
import './index.css'

const initialFilters: FilterState = { query: '', rarity: 'ALL' }

export default function App() {
  const [rows, setRows] = useState<SkillRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filters, setFilters] = useState<FilterState>(initialFilters)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const next = await loadSkillRecords()
      setRows(next)
      setSelectedId((current) => current ?? next[0]?.id ?? null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '不明なエラーが発生しました。')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const filtered = useMemo(() => rows.filter((row) => {
    const query = filters.query.trim().toLowerCase()
    if (query && !`${row.operatorName} ${row.skillName} ${row.description} ${row.skillId}`.toLowerCase().includes(query)) return false
    if (filters.rarity !== 'ALL' && row.rarity !== filters.rarity) return false
    return true
  }), [rows, filters])

  const selected = rows.find((row) => row.id === selectedId) ?? null

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">ARKNIGHTS DATA TOOL</p>
          <h1>Skill Data Viewer</h1>
          <p className="subtitle">ゲームデータに含まれるオペレーターのスキル情報を確認する。</p>
        </div>
        <div className="top-actions">
          <button className="button secondary" onClick={() => void load()} disabled={loading}>データ再読込</button>
          <button className="button" onClick={() => exportSkillsCsv(rows)} disabled={!rows.length}>CSV出力</button>
        </div>
      </header>

      {error && <section className="error-box">{error}</section>}
      <SummaryCards rows={rows} />

      <section className="workspace">
        <div className="list-pane">
          <Filters value={filters} onChange={setFilters} />
          <div className="result-meta">
            <span>{loading ? '読み込み中...' : `${filtered.length} 件表示`}</span>
          </div>
          <SkillTable rows={filtered} selectedId={selectedId} onSelect={(row) => setSelectedId(row.id)} />
        </div>
        <SkillDetail skill={selected} />
      </section>

      <footer>
        <span>Data: ArknightsAssets/ArknightsGamedata (JP)</span>
        <a href={DATA_URLS.skill} target="_blank" rel="noreferrer">skill_table.json</a>
        <a href={DATA_URLS.character} target="_blank" rel="noreferrer">character_table.json</a>
      </footer>
    </main>
  )
}
