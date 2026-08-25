import { useEffect, useMemo, useState } from 'react'
import { Filters, type FilterState } from './components/Filters'
import { SkillDetail } from './components/SkillDetail'
import { SkillTable } from './components/SkillTable'
import { SummaryCards } from './components/SummaryCards'
import { DATA_URLS, loadSkillRecords } from './lib/arknightsData'
import { applyManualClassification } from './lib/classifier'
import { exportSkillsCsv } from './lib/exportCsv'
import { SKILL_EFFECT_TYPES, type SkillEffectType, type SkillRecord } from './types/skill'
import './index.css'

const OVERRIDE_STORAGE_KEY = 'arknights-skill-effect-overrides'
const initialFilters: FilterState = { query: '', rarity: 'ALL', effectType: 'ALL' }

export default function App() {
  const [rows, setRows] = useState<SkillRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filters, setFilters] = useState<FilterState>(initialFilters)
  const [overrides, setOverrides] = useState<Record<string, SkillEffectType>>(loadOverrides)
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

  const classifiedRows = useMemo(() => rows.map((row) => ({
    ...row,
    classification: applyManualClassification(row.classification, overrides[row.id]),
  })), [rows, overrides])

  const filtered = useMemo(() => classifiedRows.filter((row) => {
    const query = filters.query.trim().toLowerCase()
    if (query && !`${row.operatorName} ${row.skillName} ${row.description} ${row.skillId}`.toLowerCase().includes(query)) return false
    if (filters.rarity !== 'ALL' && row.rarity !== filters.rarity) return false
    if (filters.effectType !== 'ALL' && row.classification.type !== filters.effectType) return false
    return true
  }), [classifiedRows, filters])

  const selected = classifiedRows.find((row) => row.id === selectedId) ?? null

  const updateOverride = (skillId: string, type: SkillEffectType | null) => {
    setOverrides((current) => {
      const next = { ...current }
      if (type) next[skillId] = type
      else delete next[skillId]
      localStorage.setItem(OVERRIDE_STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">ARKNIGHTS DATA TOOL</p>
          <h1>Skill Effect Classifier</h1>
          <p className="subtitle">説明文とゲームデータから、計算機の出力単位を自動判定する。</p>
        </div>
        <div className="top-actions">
          <button className="button secondary" onClick={() => void load()} disabled={loading}>データ再読込</button>
          <button className="button" onClick={() => exportSkillsCsv(classifiedRows)} disabled={!classifiedRows.length}>CSV出力</button>
        </div>
      </header>

      {error && <section className="error-box">{error}</section>}
      <SummaryCards rows={classifiedRows} />

      <section className="workspace">
        <div className="list-pane">
          <Filters value={filters} onChange={setFilters} />
          <div className="result-meta">
            <span>{loading ? '読み込み中...' : `${filtered.length} 件表示`}</span>
          </div>
          <SkillTable rows={filtered} selectedId={selectedId} onSelect={(row) => setSelectedId(row.id)} />
        </div>
        <SkillDetail skill={selected} onOverride={(type) => selected && updateOverride(selected.id, type)} />
      </section>

      <footer>
        <span>Data: ArknightsAssets/ArknightsGamedata (JP)</span>
        <a href={DATA_URLS.skill} target="_blank" rel="noreferrer">skill_table.json</a>
        <a href={DATA_URLS.character} target="_blank" rel="noreferrer">character_table.json</a>
      </footer>
    </main>
  )
}

function loadOverrides(): Record<string, SkillEffectType> {
  try {
    const value = localStorage.getItem(OVERRIDE_STORAGE_KEY)
    const parsed = value ? JSON.parse(value) as Record<string, unknown> : {}
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, SkillEffectType] => (
        typeof entry[1] === 'string' && SKILL_EFFECT_TYPES.includes(entry[1] as SkillEffectType)
      )),
    )
  } catch {
    return {}
  }
}
