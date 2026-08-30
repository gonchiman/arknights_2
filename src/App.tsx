import { useEffect, useMemo, useRef, useState } from 'react'
import { DamageCalculator } from './components/DamageCalculator'
import { EnemyAnalysis } from './components/EnemyAnalysis'
import { EMPTY_OPERATOR_FILTERS, matchesOperatorFilters, OperatorSearch } from './components/OperatorSearch'
import { OperatorComparison } from './components/OperatorComparison'
import { SkillDetail } from './components/SkillDetail'
import { SkillDirectory } from './components/SkillDirectory'
import { DATA_URLS, loadSkillRecords } from './lib/arknightsData'
import { applyManualClassification } from './lib/classifier'
import { ENEMY_DATA_URLS } from './lib/enemyData'
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
export default function App() {
  const [rows, setRows] = useState<SkillRecord[]>([])
  const [route, setRoute] = useState<AppRoute>(() => parseHashRoute(window.location.hash))
  const [filters, setFilters] = useState(EMPTY_OPERATOR_FILTERS)
  const [overrides, setOverrides] = useState<Record<string, SkillClassificationOverride>>(loadOverrides)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const lastSelectedOperatorId = useRef<string | null>(null)
  const lastSelectedSkillId = useRef<string | null>(null)
  const skillDetailReturnView = useRef<'list' | 'skills'>('list')
  const previousRouteView = useRef(route.view)

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

  const selected = route.view === 'skill'
    ? classifiedRows.find((row) => row.id === route.skillId) ?? null
    : null
  const operatorSkills = selected
    ? classifiedRows.filter((row) => row.operatorId === selected.operatorId)
    : []

  useEffect(() => {
    if (!selected) return
    lastSelectedOperatorId.current = selected.operatorId
    lastSelectedSkillId.current = selected.id
  }, [selected])

  useEffect(() => {
    const previousView = previousRouteView.current
    previousRouteView.current = route.view
    if (previousView !== 'skill') return

    if (route.view === 'list') {
      const operatorId = lastSelectedOperatorId.current
      if (!operatorId) return
      window.requestAnimationFrame(() => {
        const operatorRows = document.querySelectorAll<HTMLElement>('[data-operator-id]')
        Array.from(operatorRows).find((row) => row.dataset.operatorId === operatorId)?.focus()
      })
    }

    if (route.view === 'skills') {
      const skillId = lastSelectedSkillId.current
      if (!skillId) return
      window.requestAnimationFrame(() => {
        const skillRows = document.querySelectorAll<HTMLElement>('[data-skill-id]')
        Array.from(skillRows).find((row) => row.dataset.skillId === skillId)?.focus()
      })
    }
  }, [route.view])

  const updateOverride = (skillId: string, override: SkillClassificationOverride | null) => {
    setOverrides((current) => {
      const next = { ...current }
      if (override && Object.keys(override).length > 0) next[skillId] = override
      else delete next[skillId]
      localStorage.setItem(OVERRIDE_STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }

  const openSkill = (skillId: string, returnView?: 'list' | 'skills') => {
    const target = classifiedRows.find((row) => row.id === skillId)
    if (returnView) skillDetailReturnView.current = returnView
    if (target) {
      lastSelectedOperatorId.current = target.operatorId
      lastSelectedSkillId.current = target.id
    }
    window.location.hash = getSkillRouteHash(skillId)
  }

  const closeSkill = () => {
    window.location.hash = skillDetailReturnView.current === 'skills' ? '#/skills' : '#/'
  }

  const updateClassifierFilters = (nextFilters: typeof filters) => {
    setFilters(nextFilters)
    if (!selected) return
    const selectedStillVisible = classifiedRows.some((row) => (
      row.operatorId === selected.operatorId && matchesOperatorFilters(row, nextFilters)
    ))
    if (!selectedStillVisible) window.location.hash = '#/'
  }

  const skillDirectoryActive = route.view === 'skills'
    || (route.view === 'skill' && skillDetailReturnView.current === 'skills')
  const classifierActive = route.view === 'list'
    || (route.view === 'skill' && !skillDirectoryActive)

  return (
    <div className={`app-shell ${route.view === 'skill' ? 'skill-detail-route' : ''}`}>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="site-brand" href="#/" aria-label="Arknights Analyze Tool ホーム">
            <span className="brand-mark" aria-hidden="true">A</span>
            <span className="brand-copy">
              <span className="eyebrow">ARKNIGHTS</span>
              <span className="brand-title">Arknights Analyze Tool</span>
            </span>
          </a>
          <nav className="site-nav" aria-label="ツール切り替え">
            <a className={`site-nav-link ${classifierActive ? 'active' : ''}`} aria-current={classifierActive ? 'page' : undefined} aria-label="Skill Model Classifier" data-short-label="Skills" href="#/">
              Skill Model Classifier
            </a>
            <a className={`site-nav-link ${skillDirectoryActive ? 'active' : ''}`} aria-current={skillDirectoryActive ? 'page' : undefined} aria-label="All Skills" data-short-label="All Skills" href="#/skills">
              All Skills
            </a>
            <a className={`site-nav-link ${route.view === 'damage' ? 'active' : ''}`} aria-current={route.view === 'damage' ? 'page' : undefined} aria-label="Damage Calculator" data-short-label="Damage" href="#/damage">
              Damage Calculator
            </a>
            <a className={`site-nav-link ${route.view === 'comparison' ? 'active' : ''}`} aria-current={route.view === 'comparison' ? 'page' : undefined} aria-label="Operator Comparison" data-short-label="Compare" href="#/comparison">
              Operator Comparison
            </a>
            <a className={`site-nav-link ${route.view === 'enemies' ? 'active' : ''}`} aria-current={route.view === 'enemies' ? 'page' : undefined} aria-label="Enemy Analysis" data-short-label="Enemies" href="#/enemies">
              Enemy Analysis
            </a>
          </nav>
        </div>
      </header>

      <main className="app-content">
        {error && route.view !== 'enemies' && <section className="error-box" role="alert">{error}</section>}

        {route.view === 'damage' ? (
          <DamageCalculator rows={classifiedRows} loading={loading} />
        ) : route.view === 'comparison' ? (
          <OperatorComparison rows={classifiedRows} loading={loading} />
        ) : route.view === 'enemies' ? (
          <EnemyAnalysis />
        ) : route.view === 'skills' ? (
          <SkillDirectory
            rows={classifiedRows}
            loading={loading}
            onSelect={(row) => openSkill(row.id, 'skills')}
          />
        ) : (
          <section className="classifier-route">
            {route.view === 'list' && (
              <header className="page-intro">
                <div>
                  <span className="page-kicker">SKILL DIRECTORY</span>
                  <h1>Skill Model Classifier</h1>
                </div>
                <p>オペレーターを検索し、スキルの分類結果と判定根拠を確認します。</p>
              </header>
            )}
            <div className="classifier-workspace">
              {route.view === 'list' ? (
                <section className="classifier-master" aria-label="オペレーター検索一覧">
                  <OperatorSearch
                    rows={classifiedRows}
                    filters={filters}
                    loading={loading}
                    onFiltersChange={updateClassifierFilters}
                    onSelect={(row) => openSkill(row.id, 'list')}
                  />
                </section>
              ) : selected ? (
                <div className="classifier-detail">
                  <SkillDetail
                    key={selected.id}
                    skill={selected}
                    operatorSkills={operatorSkills}
                    override={overrides[selected.id]}
                    onBack={closeSkill}
                    backLabel={skillDetailReturnView.current === 'skills' ? 'スキル一覧に戻る' : undefined}
                    onSelectSkill={(skill) => openSkill(skill.id)}
                    onOverride={(override) => updateOverride(selected.id, override)}
                  />
                </div>
              ) : (
                <section className="route-state classifier-detail" role="status">
                  <h1>{loading ? 'スキルを読み込んでいます…' : 'スキルが見つかりません'}</h1>
                  {!loading && <button className="button secondary" onClick={closeSkill}>一覧に戻る</button>}
                </section>
              )}
            </div>
          </section>
        )}
      </main>
      <footer className="site-footer">
          <span>Data: ArknightsAssets/ArknightsGamedata (JP)</span>
          <a href={DATA_URLS.skill} target="_blank" rel="noreferrer">skill_table.json</a>
          <a href={DATA_URLS.character} target="_blank" rel="noreferrer">character_table.json</a>
          <a href={DATA_URLS.uniequip} target="_blank" rel="noreferrer">uniequip_table.json</a>
          <a href={ENEMY_DATA_URLS.handbook} target="_blank" rel="noreferrer">enemy_handbook_table.json</a>
          <a href={ENEMY_DATA_URLS.database} target="_blank" rel="noreferrer">enemy_database.json</a>
      </footer>
    </div>
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
