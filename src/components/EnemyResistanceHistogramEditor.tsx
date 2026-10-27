import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { matchesEnemyFilters } from '../lib/enemyData'
import { copyEnemyLevelSelection, formatEnemyLevelSelection, type EnemyAnalysisFiltersState } from '../lib/enemyLevelSelection'
import { formatEnemyNumericCondition, matchesEnemyNumericConditions, parseEnemyNumericFilterValue, type EnemyNumericCondition } from '../lib/enemyNumericFilters'
import type { EnemyHistogramAggregationVersion, EnemyHistogramSnapshot } from '../lib/enemyHistogramSnapshot'
import type { EnemyHistogramCounts } from '../lib/enemyHistogramCounts'
import type { EnemyRecord } from '../types/enemy'
import { useEnemyRecords } from '../lib/useEnemyRecords'
import { useEnemyAggregation } from '../lib/useEnemyAggregation'
import { EnemyAnalysisFilters } from './EnemyAnalysisFilters'
import { EnemyDataContent } from './EnemyPageShared'
import { EnemyStatisticsPanel, useEnemyStatisticsControls } from './EnemyStatisticsPanel'
import './EnemyAnalysis.css'

interface EnemyResistanceHistogramEditorProps {
  initialSnapshot: EnemyHistogramSnapshot | null
  onChange: (snapshot: EnemyHistogramSnapshot | null) => void
}

const EMPTY_ROWS: EnemyRecord[] = []

/** Edits the existing histogram inside the image dialog, without changing routes. */
export function EnemyResistanceHistogramEditor(props: EnemyResistanceHistogramEditorProps) {
  const version = props.initialSnapshot?.source.aggregationVersion
  return props.initialSnapshot && !version
    ? <LiveHistogramEditor {...props} />
    : <VersionedHistogramEditor key={version?.id ?? 'selected-version'} {...props} aggregationVersion={version} />
}

function LiveHistogramEditor(props: EnemyResistanceHistogramEditorProps) {
  const records = useEnemyRecords()
  return <HistogramEditorContent {...props} {...records} />
}

function VersionedHistogramEditor({ aggregationVersion, ...props }: EnemyResistanceHistogramEditorProps & {
  aggregationVersion?: EnemyHistogramAggregationVersion
}) {
  const { data, version, loading, error, retry } = useEnemyAggregation({ versionId: aggregationVersion?.id })
  const mismatch = version && aggregationVersion && (version.sourceRevision !== aggregationVersion.sourceRevision
    || version.ruleVersion !== aggregationVersion.ruleVersion)
  return <HistogramEditorContent {...props} rows={data?.rows ?? EMPTY_ROWS}
    loading={loading} error={mismatch ? '保存済み分布の集計データと版情報が一致しません。' : error}
    retry={retry} aggregationCounts={data?.counts} aggregationVersion={aggregationVersion ?? version ?? undefined} />
}

function HistogramEditorContent({ initialSnapshot, onChange, rows, loading, error, retry, aggregationCounts, aggregationVersion }: EnemyResistanceHistogramEditorProps & {
  rows: EnemyRecord[]
  loading: boolean
  error: string | null
  retry: () => void
  aggregationCounts?: EnemyHistogramCounts
  aggregationVersion?: EnemyHistogramAggregationVersion
}) {
  const controls = useEnemyStatisticsControls(initialSnapshot)
  const [filters, setFilters] = useState<EnemyAnalysisFiltersState>(() => ({
    levelType: copyEnemyLevelSelection(initialSnapshot?.editorSettings?.levelType ?? 'ALL'),
  }))
  const [numericConditions, setNumericConditions] = useState<readonly EnemyNumericCondition[]>(
    initialSnapshot?.editorSettings?.numericConditions ?? [],
  )
  // Older snapshots have exact enemy IDs but no editable filter expression.
  const [sourceEnemyIds, setSourceEnemyIds] = useState<readonly string[] | undefined>(
    initialSnapshot?.editorSettings ? initialSnapshot.editorSettings.sourceEnemyIds : initialSnapshot?.source.enemyIds,
  )
  const [badInput, setBadInput] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)
  const [, revalidate] = useState(0)
  useLayoutEffect(() => {
    setBadInput(Array.from(editorRef.current?.querySelectorAll<HTMLInputElement>('input[type="number"]') ?? [])
      .some(input => input.validity.badInput))
  })
  const sourceIds = useMemo(() => sourceEnemyIds ? new Set(sourceEnemyIds) : null, [sourceEnemyIds])
  const scopedRows = useMemo(() => rows.filter(enemy => (!sourceIds || sourceIds.has(enemy.id))
    && matchesEnemyFilters(enemy, { query: '', levelType: filters.levelType })
    && matchesEnemyNumericConditions(enemy, numericConditions)), [rows, sourceIds, filters, numericConditions])
  const scopeLabel = sourceIds ? initialSnapshot!.source.scopeLabel : [
    formatEnemyLevelSelection(filters.levelType),
    ...numericConditions.map(formatEnemyNumericCondition),
  ].filter(Boolean).join(' · ')
  const filterSettings = useMemo(() => ({ ...filters, numericConditions,
    ...(sourceEnemyIds ? { sourceEnemyIds } : {}),
  }), [filters, numericConditions, sourceEnemyIds])
  const invalid = badInput || numericConditions.some(condition => condition.value.trim() !== ''
    && parseEnemyNumericFilterValue(condition.value) === null)
  const receiveSnapshot = useCallback((snapshot: EnemyHistogramSnapshot | null) => {
    onChange(invalid ? null : snapshot)
  }, [invalid, onChange])
  useEffect(() => { if (loading || error) onChange(null) }, [loading, error, onChange])
  const resetFilters = () => {
    setSourceEnemyIds(undefined)
    setFilters({ levelType: 'ALL' })
    setNumericConditions([])
    setBadInput(false)
  }

  return <div className="surtr-histogram-editor-content" ref={editorRef} onClick={event => {
    if (event.target instanceof Element && event.target.closest('button')) {
      queueMicrotask(() => revalidate(value => value + 1))
    }
  }} onKeyDown={event => {
    // Enter in a numeric field must not submit the surrounding image-save form.
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement) event.preventDefault()
  }} onInputCapture={event => {
    setBadInput(Array.from(event.currentTarget.querySelectorAll<HTMLInputElement>('input[type="number"]'))
      .some(input => input.validity.badInput))
  }}>
    <EnemyDataContent loading={loading} error={error} onRetry={retry}>
      <EnemyStatisticsPanel rows={scopedRows} allRows={rows} scopeLabel={scopeLabel} controls={controls}
        aggregationCounts={aggregationCounts} aggregationVersion={aggregationVersion}
        filterSettings={filterSettings}
        histogramEditor={{ initialSnapshot, onChange: receiveSnapshot }}
        filterControls={sourceIds ? <div className="surtr-histogram-source">
          <span>対象：{scopeLabel}</span>
          <button type="button" className="button secondary" onClick={resetFilters}>対象を選び直す</button>
        </div> : <EnemyAnalysisFilters filters={filters} onFiltersChange={setFilters}
          numericConditions={numericConditions} onNumericConditionsChange={setNumericConditions}
          matchedCount={scopedRows.length} totalCount={rows.length} onReset={resetFilters} />}
      />
    </EnemyDataContent>
  </div>
}
