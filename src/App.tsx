import { useEffect, useMemo, useState } from 'react'
import { Filters, type FilterOption, type FilterState } from './components/Filters'
import { OperatorTable } from './components/OperatorTable'
import { SkillDetail } from './components/SkillDetail'
import { DATA_URLS, loadSkillRecords } from './lib/arknightsData'
import { applyManualClassification } from './lib/classifier'
import { getSkillRouteHash, parseHashRoute, type AppRoute } from './lib/routes'
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
import './navigation.css'

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
  const [route, setRoute] = useState<AppRoute>(() => parseHashRoute(window.location.hash))
  const [filters, setFilters] = useState<FilterState>(initialFilters)
  const [overrides, setOverrides] = useState<Record<string, SkillClassificationOverride>>(loadOverrides)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      setRows(await loadSkillRecords())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '不明なエラーが発生しました。')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])
  useEffect(() => {
    const handleHashChange = () => {
      setRoute(parseHashRoute(window.location.hash))
      window.scrollTo({ top: 0, behavior: 'instant' })
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

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

  const filteredSkills = useMemo(() => classifiedRows.filter((row) => {
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

  // 一覧はオペレーターを1人1行だけ表示する。
  // スキル条件で絞り込んだ場合は、最初に一致したスキルを詳細画面で開く。
  const filteredOperators = useMemo(() => {
    const seen = new Set<string>()
    return filteredSkills.filter((row) => {
      if (seen.has(row.operatorId)) return false
      seen.add(row.operatorId)
      return true
    })
  }, [filteredSkills])

  const selected = route.view === 'skill'
    ? classifiedRows.find((row) => row.id === route.skillId) ?? null
    : null
  const operatorSkills = selected
    ? classifiedRows.filter((row) => row.operatorId === selected.operatorId)
    : []

  const updateOverride = (skillId: string, override: SkillClassificationOverride | null) => {
    setOverrides((current) => {
      const next = { ...current }
      if (override && Object.keys(override).length > 0) next[skillId] = override
      else delete next[skillId]
      localStorage.setItem(OVERRIDE_STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }

  const openSkill = (skillId: string) => {
    window.location.hash = getSkillRouteHash(skillId)
  }

  const openList = () => {
    window.location.hash = '#/'
  }

  const classifierActive = route.view !== 'damage'

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">ARKNIGHTS</p>
          <h1>Arknights Analyze Tool</h1>
        </div>
        <nav className="site-nav" aria-label="ツール切り替え">
          <a className={`site-nav-link ${classifierActive ? 'active' : ''}`} aria-current={classifierActive ? 'page' : undefined} href="#/">
            Skill Model Classifier
          </a>
          <a className={`site-nav-link ${route.view === 'damage' ? 'active' : ''}`} aria-current={route.view === 'damage' ? 'page' : undefined} href="#/damage">
            Damage Calculator
          </a>
        </nav>
      </header>

      {error && route.view !== 'damage' && <section className="error-box">{error}</section>}

      {route.view === 'list' ? (
        <>
          <section className="page-intro">
            <h2>Skill Model Classifier</h2>
            <p>スキルの終了条件・発動契機・ダメージ構成を確認する。</p>
          </section>
          <section className="list-pane list-view">
            <Filters
              value={filters}
              professionOptions={professionOptions}
              subProfessionOptions={subProfessionOptions}
              onChange={setFilters}
            />
            <div className="result-meta">
              <span>{loading ? '読み込み中...' : `${filteredOperators.length} 名表示`}</span>
              <span>オペレーターを選択すると詳細画面へ移動します</span>
            </div>
            <OperatorTable rows={filteredOperators} onSelect={(row) => openSkill(row.id)} />
          </section>
        </>
      ) : route.view === 'damage' ? (
        <section className="damage-page">
          <h2>Damage Calculator</h2>
        </section>
      ) : selected ? (
        <SkillDetail
          key={selected.id}
          skill={selected}
          operatorSkills={operatorSkills}
          override={overrides[selected.id]}
          onBack={openList}
          onSelectSkill={(skill) => openSkill(skill.id)}
          onOverride={(override) => updateOverride(selected.id, override)}
        />
      ) : (
        <section className="route-state">
          <h2>{loading ? 'スキルを読み込んでいます…' : 'スキルが見つかりません'}</h2>
          {!loading && <button className="button secondary" onClick={openList}>一覧に戻る</button>}
        </section>
      )}

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
