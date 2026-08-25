import { useEffect, useMemo, useState } from 'react'
import { Filters, type FilterState } from './components/Filters'
import { SkillDetail } from './components/SkillDetail'
import { SkillTable } from './components/SkillTable'
import { SummaryCards } from './components/SummaryCards'
import { DATA_URLS, loadSkillRecords } from './lib/arknightsData'
import { exportSkillsCsv } from './lib/exportCsv'
import { loadOverrides, saveOverrides, type SkillOverrides } from './lib/storage'
import type { SkillCategory, SkillRecord } from './types/skill'
import './index.css'

const initialFilters: FilterState = { query: '', category: 'ALL', rarity: 'ALL', confidence: 'ALL' }

export default function App() {
  const [rows, setRows] = useState<SkillRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filters, setFilters] = useState<FilterState>(initialFilters)
  const [overrides, setOverrides] = useState<SkillOverrides>(() => loadOverrides())
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
  useEffect(() => { saveOverrides(overrides) }, [overrides])

  const categories = useMemo(() => [...new Set(rows.map((row) => row.category))] as SkillCategory[], [rows])
  const filtered = useMemo(() => rows.filter((row) => {
    const query = filters.query.trim().toLowerCase()
    const category = overrides[row.id] ?? row.category
    if (query && !`${row.operatorName} ${row.skillName} ${row.description}`.toLowerCase().includes(query)) return false
    if (filters.category !== 'ALL' && category !== filters.category) return false
    if (filters.rarity !== 'ALL' && row.rarity !== filters.rarity) return false
    if (filters.confidence !== 'ALL' && row.confidence !== filters.confidence) return false
    return true
  }), [rows, filters, overrides])

  const selected = rows.find((row) => row.id === selectedId) ?? null

  const handleOverride = (id: string, category: SkillCategory | null) => {
    setOverrides((current) => {
      const next = { ...current }
      if (category === null) delete next[id]
      else next[id] = category
      return next
    })
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">ARKNIGHTS DATA TOOL</p>
          <h1>Skill Analyzer</h1>
          <p className="subtitle">ゲームデータからスキルの効果タイプを自動分類し、判定根拠と例外を確認する。</p>
        </div>
        <div className="top-actions">
          <button className="button secondary" onClick={() => void load()} disabled={loading}>データ再読込</button>
          <button className="button" onClick={() => exportSkillsCsv(rows, overrides)} disabled={!rows.length}>CSV出力</button>
        </div>
      </header>

      {error && <section className="error-box">{error}</section>}
      <SummaryCards rows={rows} />

      <section className="workspace">
        <div className="list-pane">
          <Filters value={filters} categories={categories} onChange={setFilters} />
          <div className="result-meta">
            <span>{loading ? '読み込み中...' : `${filtered.length} 件表示`}</span>
            <span>手動修正 {Object.keys(overrides).length} 件</span>
          </div>
          <SkillTable rows={filtered} selectedId={selectedId} overrides={overrides} onSelect={(row) => setSelectedId(row.id)} />
        </div>
        <SkillDetail skill={selected} overrides={overrides} onOverride={handleOverride} />
      </section>

      <footer>
        <span>Data: ArknightsAssets/ArknightsGamedata (JP)</span>
        <a href={DATA_URLS.skill} target="_blank" rel="noreferrer">skill_table.json</a>
        <a href={DATA_URLS.character} target="_blank" rel="noreferrer">character_table.json</a>
      </footer>
    </main>
  )
}
