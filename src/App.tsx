import { useEffect, useMemo, useRef, useState } from 'react'
import { AppSidebar } from './components/AppSidebar'
import { DamageCalculator } from './components/DamageCalculator'
import { DataSourcesPage } from './components/DataSourcesPage'
import { EnemyAnalysis } from './components/EnemyAnalysis'
import { OperatorComparison } from './components/OperatorComparison'
import { OperatorDatabase } from './components/OperatorDatabase'
import { OperatorDetailModal } from './components/OperatorDetailModal'
import { OperatorDetailPage } from './components/OperatorDetailPage'
import type { OpenOperatorDetail } from './components/OperatorDetailLink'
import { SkillDirectory } from './components/SkillDirectory'
import { SkillEffectsPage } from './components/SkillEffectsPage'
import { SkillJsonPage } from './components/SkillJsonPage'
import { SkillJsonOverviewPage } from './components/SkillJsonOverviewPage'
import { loadSkillRecords } from './lib/arknightsData'
import { applyManualClassification } from './lib/classifier'
import { ARKNIGHTS_GAMEDATA_REPOSITORY } from './lib/dataSources'
import { buildOperatorDatabaseRecords } from './lib/operatorDatabase'
import { createOperatorDetailHash, parseHashRoute, type AppRoute } from './lib/routes'
import { APP_NAV_ITEMS, type NavigationPage } from './lib/navigation'
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
const SIDEBAR_DRAWER_QUERY = '(max-width: 1140px)'
const SIDEBAR_DESKTOP_QUERY = '(min-width: 1141px)'
type BaseAppRoute = Exclude<AppRoute, { view: 'operator-detail' }>

export default function App() {
  const [rows, setRows] = useState<SkillRecord[]>([])
  const [route, setRoute] = useState<AppRoute>(() => parseHashRoute(window.location.hash))
  const [detailBackgroundRoute, setDetailBackgroundRoute] = useState<BaseAppRoute | null>(null)
  const [overrides, setOverrides] = useState<Record<string, SkillClassificationOverride>>(loadOverrides)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const sidebarToggleRef = useRef<HTMLButtonElement>(null)
  const detailBackgroundRouteRef = useRef<BaseAppRoute | null>(null)
  const detailTriggerRef = useRef<HTMLAnchorElement | null>(null)
  const skillDataRequestStarted = useRef(false)

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

  useEffect(() => {
    if (route.view === 'enemies' || route.view === 'sources' || skillDataRequestStarted.current) return
    skillDataRequestStarted.current = true
    void load()
  }, [route.view])
  useEffect(() => {
    const handleHashChange = () => {
      const nextRoute = parseHashRoute(window.location.hash)
      const closingOverlay = detailBackgroundRouteRef.current !== null

      detailBackgroundRouteRef.current = null
      setDetailBackgroundRoute(null)
      setRoute(nextRoute)
      setSidebarOpen(false)

      if (closingOverlay) {
        const trigger = detailTriggerRef.current
        detailTriggerRef.current = null
        window.requestAnimationFrame(() => {
          if (trigger?.isConnected) trigger.focus()
        })
        return
      }

      window.scrollTo({ top: 0, behavior: 'instant' })
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  useEffect(() => {
    if (!sidebarOpen) return

    const desktopMedia = window.matchMedia(SIDEBAR_DESKTOP_QUERY)
    if (desktopMedia.matches) {
      setSidebarOpen(false)
      return
    }

    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      setSidebarOpen(false)
      window.requestAnimationFrame(() => sidebarToggleRef.current?.focus())
    }
    const handleDesktopChange = (event: MediaQueryListEvent) => {
      if (!event.matches) return
      setSidebarOpen(false)
      window.requestAnimationFrame(() => {
        document.querySelector<HTMLAnchorElement>('.sidebar-nav-link.active')?.focus()
      })
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown, { capture: true })
    desktopMedia.addEventListener('change', handleDesktopChange)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown, { capture: true })
      desktopMedia.removeEventListener('change', handleDesktopChange)
    }
  }, [sidebarOpen])

  const classifiedRows = useMemo(() => rows.map((row) => ({
    ...row,
    classification: applyManualClassification(row.classification, overrides[row.id]),
  })), [rows, overrides])
  const operatorRecords = useMemo(
    () => buildOperatorDatabaseRecords(classifiedRows),
    [classifiedRows],
  )
  const detailOperator = route.view === 'operator-detail'
    ? operatorRecords.find((operator) => operator.operatorId === route.operatorId) ?? null
    : null
  const detailOperatorSkills = route.view === 'operator-detail'
    ? classifiedRows
      .filter((skill) => skill.operatorId === route.operatorId)
      .sort((a, b) => a.skillIndex - b.skillIndex || a.skillName.localeCompare(b.skillName, 'ja'))
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

  const openOperatorDetail: OpenOperatorDetail = (operatorId, trigger) => {
    if (route.view === 'operator-detail') {
      window.location.hash = createOperatorDetailHash(operatorId)
      return
    }

    detailTriggerRef.current = trigger
    detailBackgroundRouteRef.current = route
    setDetailBackgroundRoute(route)
    window.history.pushState(null, '', createOperatorDetailHash(operatorId))
    setRoute({ view: 'operator-detail', operatorId })
    setSidebarOpen(false)
  }

  const closeOperatorDetail = () => {
    if (detailBackgroundRouteRef.current) window.history.back()
  }

  const displayedRoute = detailBackgroundRoute ?? route
  const activeNavigationPage: NavigationPage = displayedRoute.view === 'operator-detail'
    ? 'operators'
    : displayedRoute.view === 'skill-json-overview'
      ? 'skill-json'
      : displayedRoute.view
  const activeNavigationItem = APP_NAV_ITEMS.find((item) => item.id === activeNavigationPage)
  const closeSidebar = () => {
    if (!sidebarOpen) return
    setSidebarOpen(false)
    if (window.matchMedia(SIDEBAR_DRAWER_QUERY).matches) {
      window.requestAnimationFrame(() => sidebarToggleRef.current?.focus())
    }
  }

  return (
    <div className="app-shell">
      <AppSidebar activePage={activeNavigationPage} open={sidebarOpen} onClose={closeSidebar} />

      <div className="app-main" inert={sidebarOpen ? true : undefined}>
        <header className="mobile-topbar">
          <button
            ref={sidebarToggleRef}
            className="sidebar-toggle"
            type="button"
            aria-controls="app-sidebar"
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen(true)}
          >
            <span className="sidebar-toggle-icon" aria-hidden="true"><i /><i /><i /></span>
            <span>Menu</span>
          </button>
          <span className="mobile-page-title">{activeNavigationItem?.label}</span>
          <a className="mobile-brand-mark" href="#/operators" aria-label="Arknights Analyze Tool ホーム">A</a>
        </header>

        <main className="app-content">
        {error && displayedRoute.view !== 'enemies' && displayedRoute.view !== 'sources' && <section className="error-box" role="alert">{error}</section>}

        {displayedRoute.view === 'sources' ? (
          <DataSourcesPage />
        ) : displayedRoute.view === 'damage' ? (
          <DamageCalculator
            rows={classifiedRows}
            loading={loading}
            onOpenOperatorDetail={openOperatorDetail}
          />
        ) : displayedRoute.view === 'comparison' ? (
          <OperatorComparison
            rows={classifiedRows}
            loading={loading}
            onOpenOperatorDetail={openOperatorDetail}
          />
        ) : displayedRoute.view === 'enemies' ? (
          <EnemyAnalysis />
        ) : displayedRoute.view === 'skills' ? (
          <SkillDirectory
            rows={classifiedRows}
            loading={loading}
            onOpenOperatorDetail={openOperatorDetail}
          />
        ) : displayedRoute.view === 'skill-effects' ? (
          <SkillEffectsPage
            rows={classifiedRows}
            loading={loading}
            initialSelection={displayedRoute.selection}
          />
        ) : displayedRoute.view === 'skill-json' ? (
          <SkillJsonPage
            key={displayedRoute.selection
              ? JSON.stringify(displayedRoute.selection)
              : 'skill-json-default'}
            rows={classifiedRows}
            loading={loading}
            initialSelection={displayedRoute.selection}
          />
        ) : displayedRoute.view === 'skill-json-overview' ? (
          <SkillJsonOverviewPage rows={classifiedRows} loading={loading} />
        ) : displayedRoute.view === 'operator-detail' ? (
          loading ? (
            <OperatorDetailRouteState title="オペレーター詳細を読み込んでいます" />
          ) : detailOperator ? (
            <OperatorDetailPage
              operator={detailOperator}
              comparisonOperators={operatorRecords}
              skills={detailOperatorSkills}
              overrides={overrides}
              onOverride={updateOverride}
            />
          ) : (
            <OperatorDetailRouteState
              title="オペレーターが見つかりません"
              description="URLに対応するオペレーターを確認できませんでした。"
            />
          )
        ) : (
          <OperatorDatabase
            rows={classifiedRows}
            loading={loading}
            onOpenOperatorDetail={openOperatorDetail}
          />
        )}
        </main>
        <footer className="site-footer">
          <a
            href={ARKNIGHTS_GAMEDATA_REPOSITORY.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="ArknightsAssets/ArknightsGamedata を開く（新しいタブ）"
          >
            Data: {ARKNIGHTS_GAMEDATA_REPOSITORY.name} (JP)
          </a>
          <a href="#/sources">参照元とデータ利用について</a>
        </footer>
      </div>

      {route.view === 'operator-detail' && detailBackgroundRoute && detailOperator && (
        <OperatorDetailModal
          operator={detailOperator}
          comparisonOperators={operatorRecords}
          skills={detailOperatorSkills}
          overrides={overrides}
          onOverride={updateOverride}
          onClose={closeOperatorDetail}
        />
      )}
    </div>
  )
}

function OperatorDetailRouteState({
  title,
  description,
}: {
  title: string
  description?: string
}) {
  return (
    <section className="operator-detail-route-state" role="status">
      <span className="page-kicker">OPERATOR DETAIL</span>
      <h1>{title}</h1>
      {description && <p>{description}</p>}
      <a className="button secondary" href="#/operators">オペレーターデータベースへ戻る</a>
    </section>
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
