import { useEffect, useMemo, useState } from 'react'
import { Filters, type FilterOption, type FilterState } from './components/Filters'
import { SkillDetail } from './components/SkillDetail'
import { SkillTable } from './components/SkillTable'
import { SummaryCards } from './components/SummaryCards'
import { DATA_URLS, loadSkillRecords } from './lib/arknightsData'
import { applyManualClassification } from './lib/classifier'
import { exportSkillsCsv } from './lib/exportCsv'
import {
  ACTIVATION_TRIGGERS,
  DAMAGE_COMPONENT_TYPES,
  EFFECT_WINDOWS,
  SKILL_CONDITION_TYPES,
  type ActivationTriggerType,
  type DamageComponentType,
  type EffectWindowType,
  type SkillClassificationOverride,
  type SkillConditionType,
  type SkillRecord,
} from './types/skill'
import './index.css'

const OVERRIDE_STORAGE_KEY = 'arknights-skill-classification-overrides-v2'
const initialFilters: FilterState = {
  query: '',
  nameInitial: 'ALL',
  profession: 'ALL',
  subProfession: 'ALL',
  rarity: 'ALL',
  effectWindow: 'ALL',
  damageComponent: 'ALL',
}

export default function App() {
  const [rows, setRows] = useState<SkillRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filters, setFilters] = useState<FilterState>(initialFilters)
  const [overrides, setOverrides] = useState<Record<string, SkillClassificationOverride>>(loadOverrides)
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

  const professionOptions = useMemo(() => uniqueOptions(rows.map((row) => ({
    value: row.profession,
    label: row.professionLabel,
  }))), [rows])

  const subProfessionOptions = useMemo(() => uniqueOptions(rows
    .filter((row) => filters.profession === 'ALL' || row.profession === filters.profession)
    .map((row) => ({ value: row.subProfessionId, label: row.subProfessionName }))), [rows, filters.profession])

  const filtered = useMemo(() => classifiedRows.filter((row) => {
    const query = filters.query.trim().toLowerCase()
    if (query && !`${row.operatorName} ${row.skillName} ${row.description} ${row.skillId}`.toLowerCase().includes(query)) return false
    if (filters.nameInitial !== 'ALL' && row.nameInitial !== filters.nameInitial) return false
    if (filters.profession !== 'ALL' && row.profession !== filters.profession) return false
    if (filters.subProfession !== 'ALL' && row.subProfessionId !== filters.subProfession) return false
    if (filters.rarity !== 'ALL' && row.rarity !== filters.rarity) return false
    if (filters.effectWindow !== 'ALL' && row.classification.effectWindow.value !== filters.effectWindow) return false
    if (filters.damageComponent !== 'ALL' && !row.classification.damageComponents.value.includes(filters.damageComponent)) return false
    return true
  }), [classifiedRows, filters])

  const selected = classifiedRows.find((row) => row.id === selectedId) ?? null

  const updateOverride = (skillId: string, override: SkillClassificationOverride | null) => {
    setOverrides((current) => {
      const next = { ...current }
      if (override && Object.keys(override).length > 0) next[skillId] = override
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
          <h1>Skill Model Classifier</h1>
          <p className="subtitle">説明文と構造データから、終了条件・発動契機・ダメージ構成・出力可否を個別に判定する。</p>
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
          <Filters
            value={filters}
            professionOptions={professionOptions}
            subProfessionOptions={subProfessionOptions}
            onChange={setFilters}
          />
          <div className="result-meta">
            <span>{loading ? '読み込み中...' : `${filtered.length} 件表示`}</span>
          </div>
          <SkillTable rows={filtered} selectedId={selectedId} onSelect={(row) => setSelectedId(row.id)} />
        </div>
        <SkillDetail
          skill={selected}
          override={selected ? overrides[selected.id] : undefined}
          onOverride={(override) => selected && updateOverride(selected.id, override)}
        />
      </section>

      <footer>
        <span>Data: ArknightsAssets/ArknightsGamedata (JP)</span>
        <a href={DATA_URLS.skill} target="_blank" rel="noreferrer">skill_table.json</a>
        <a href={DATA_URLS.character} target="_blank" rel="noreferrer">character_table.json</a>
        <a href={DATA_URLS.uniequip} target="_blank" rel="noreferrer">uniequip_table.json</a>
      </footer>
    </main>
  )
}

function loadOverrides(): Record<string, SkillClassificationOverride> {
  try {
    const value = localStorage.getItem(OVERRIDE_STORAGE_KEY)
    const parsed = value ? JSON.parse(value) as Record<string, unknown> : {}
    const result: Record<string, SkillClassificationOverride> = {}

    for (const [skillId, candidate] of Object.entries(parsed)) {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue
      const raw = candidate as Record<string, unknown>
      const override: SkillClassificationOverride = {}

      if (isMember(raw.effectWindow, EFFECT_WINDOWS)) override.effectWindow = raw.effectWindow as EffectWindowType
      if (isMember(raw.activationTrigger, ACTIVATION_TRIGGERS)) override.activationTrigger = raw.activationTrigger as ActivationTriggerType
      if (isMemberArray(raw.damageComponents, DAMAGE_COMPONENT_TYPES)) override.damageComponents = raw.damageComponents as DamageComponentType[]
      if (isMemberArray(raw.conditions, SKILL_CONDITION_TYPES)) override.conditions = raw.conditions as SkillConditionType[]
      if (Object.keys(override).length > 0) result[skillId] = override
    }

    return result
  } catch {
    return {}
  }
}

function isMember<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === 'string' && options.includes(value as T)
}

function isMemberArray<T extends string>(value: unknown, options: readonly T[]): value is T[] {
  return Array.isArray(value) && value.every((item) => isMember(item, options))
}

function uniqueOptions(options: FilterOption[]): FilterOption[] {
  return [...new Map(options.map((option) => [option.value, option])).values()]
    .sort((a, b) => a.label.localeCompare(b.label, 'ja'))
}
