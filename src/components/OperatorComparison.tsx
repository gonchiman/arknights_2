import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { DAMAGE_TYPE_LABELS } from '../lib/damageCalculator'
import {
  COMPARISON_AXES,
  COMPARISON_AXIS_LABELS,
  COMPARISON_BUILD_METRICS,
  COMPARISON_BUILD_METRIC_LABELS,
  buildComparisonAxisSeries,
  buildOperatorBuildComparisonCsv,
  buildOperatorBuildComparisonSeriesCsv,
  evaluateComparisonBuild,
  getComparisonInitialAxis,
  getComparisonMetricValue,
  type ComparisonAxis,
  type ComparisonAxisSeries,
  type ComparisonBuildConfig,
  type ComparisonBuildEvaluation,
  type ComparisonBuildMetric,
  type ComparisonEnemyCondition,
} from '../lib/operatorBuildComparison'
import {
  getOperatorModuleId,
  getOperatorModuleLevels,
  getOperatorModules,
  getOperatorModuleUnlockLabel,
  isOperatorModuleUnlocked,
} from '../lib/operatorModules'
import type { RawOperatorModule, SkillRecord } from '../types/skill'
import { ComparisonChart, type ComparisonChartSeries } from './ComparisonChart'
import { type FilterState } from './Filters'
import { EMPTY_OPERATOR_FILTERS, OperatorSearch } from './OperatorSearch'
import { OperatorDetailLink, type OpenOperatorDetail } from './OperatorDetailLink'
import { SkillEffectModal } from './SkillEffectModal'
import './OperatorComparison.css'

interface Props {
  rows: SkillRecord[]
  loading: boolean
  onOpenOperatorDetail: OpenOperatorDetail
}

interface PickerState {
  mode: 'ADD' | 'REPLACE'
  slotId: string | null
}

interface SkillEffectState {
  skill: SkillRecord
  skillLevelIndex: number
}

const MAX_BUILDS = 6
const BUILD_COLORS = ['#607f99', '#a84b4b', '#5a8b67', '#7b6d86', '#80704b', '#527d7a']
const DEFAULT_COMPARISON_METRIC: ComparisonBuildMetric = 'SKILL_PER_ATTACK'
const NUMBER_FORMATTER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 1 })

export function OperatorComparison({ rows, loading, onOpenOperatorDetail }: Props) {
  const [builds, setBuilds] = useState<ComparisonBuildConfig[]>([])
  const [enemy, setEnemy] = useState<ComparisonEnemyCondition>({ defense: 0, resistance: 0 })
  const [axis, setAxis] = useState<ComparisonAxis>('DEFENSE')
  const [metric, setMetric] = useState<ComparisonBuildMetric>(DEFAULT_COMPARISON_METRIC)
  const [picker, setPicker] = useState<PickerState | null>(null)
  const [operatorFilters, setOperatorFilters] = useState<FilterState>({ ...EMPTY_OPERATOR_FILTERS })
  const [detailSkill, setDetailSkill] = useState<SkillEffectState | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const initializedRef = useRef(false)
  const nextSlotIdRef = useRef(1)
  const pickerReturnFocusRef = useRef<HTMLElement | null>(null)
  const buildPickerButtonRefs = useRef(new Map<string, HTMLButtonElement>())
  const addButtonRef = useRef<HTMLButtonElement | null>(null)
  const skillDetailTriggerRef = useRef<HTMLButtonElement | null>(null)

  const allocateSlotId = () => 'comparison-build-' + nextSlotIdRef.current++

  useEffect(() => {
    if (initializedRef.current || loading || rows.length === 0) return
    initializedRef.current = true
    const initialBuilds = createInitialBuilds(rows, allocateSlotId)
    setBuilds(initialBuilds)
    if (initialBuilds[0]) {
      setAxis(getComparisonInitialAxis(rows, initialBuilds[0], DEFAULT_COMPARISON_METRIC))
    }
  }, [loading, rows])

  const evaluations = useMemo(
    () => builds.map((build) => evaluateComparisonBuild(rows, build, enemy)),
    [rows, builds, enemy],
  )
  const evaluationBySlot = useMemo(
    () => new Map(evaluations.map((evaluation) => [evaluation.config.slotId, evaluation])),
    [evaluations],
  )
  const rawSeries = useMemo(() => {
    if (builds.length === 0) return []
    return buildComparisonAxisSeries(rows, builds, enemy, axis, metric)
  }, [rows, builds, enemy, axis, metric])
  const chartSeries = useMemo<ComparisonChartSeries[]>(() => rawSeries.map((series, index) => ({
    id: series.slotId,
    label: getSeriesLabel(evaluationBySlot.get(series.slotId), index),
    color: getBuildColor(series.colorIndex),
    points: series.points.map((point) => ({ x: point.x, value: point.value })),
  })), [rawSeries, evaluationBySlot])
  const currentAxisValue = axis === 'DEFENSE' ? enemy.defense : enemy.resistance
  const axisPoints = rawSeries[0]?.points.map((point) => point.x) ?? []
  const calculableCount = rawSeries.filter((series) => series.points.some((point) => point.value !== null)).length

  const updateBuild = (slotId: string, patch: Partial<ComparisonBuildConfig>) => {
    const current = builds.find((build) => build.slotId === slotId)
    if (!current) return
    const next = normalizeBuildConfig(rows, { ...current, ...patch })
    setBuilds(builds.map((build) => build.slotId === slotId ? next : build))
    if (current.moduleId && !next.moduleId) {
      setAnnouncement('育成条件では装備できないため、モジュールを「なし」に変更しました。')
    }
  }

  const changeSkill = (slotId: string, skillRecordId: string) => {
    const skill = rows.find((row) => row.id === skillRecordId)
    if (!skill) return
    updateBuild(slotId, {
      skillRecordId,
      skillLevelIndex: Math.max(0, skill.skillLevels.length - 1),
    })
  }

  const openPicker = (
    nextPicker: PickerState,
    trigger: HTMLElement,
  ) => {
    pickerReturnFocusRef.current = trigger
    setOperatorFilters({ ...EMPTY_OPERATOR_FILTERS })
    setPicker(nextPicker)
  }

  const closePicker = () => {
    setPicker(null)
    window.requestAnimationFrame(() => pickerReturnFocusRef.current?.focus())
  }

  const selectOperator = (row: SkillRecord) => {
    if (!picker) return
    if (picker.mode === 'ADD') {
      if (builds.length >= MAX_BUILDS) return
      const slotId = allocateSlotId()
      const nextBuild = createBuildFromSkill(row, slotId, nextAvailableColorIndex(builds))
      setBuilds([...builds, nextBuild])
      setPicker(null)
      setAnnouncement(row.operatorName + 'を比較対象に追加しました。')
      window.requestAnimationFrame(() => buildPickerButtonRefs.current.get(slotId)?.focus())
      return
    }

    const current = builds.find((build) => build.slotId === picker.slotId)
    if (!current) return
    const nextBuild = createBuildFromSkill(
      row,
      current.slotId,
      current.colorIndex ?? nextAvailableColorIndex(builds),
    )
    const isPrimaryBuild = builds[0]?.slotId === current.slotId
    setBuilds(builds.map((build) => build.slotId === current.slotId ? nextBuild : build))
    if (isPrimaryBuild) {
      setAxis(getComparisonInitialAxis(rows, nextBuild, metric))
    }
    setPicker(null)
    setAnnouncement(row.operatorName + 'へ変更しました。')
    window.requestAnimationFrame(() => buildPickerButtonRefs.current.get(current.slotId)?.focus())
  }

  const duplicateBuild = (slotId: string) => {
    if (builds.length >= MAX_BUILDS) return
    const index = builds.findIndex((build) => build.slotId === slotId)
    if (index < 0) return
    const duplicated: ComparisonBuildConfig = {
      ...builds[index],
      slotId: allocateSlotId(),
      label: null,
      colorIndex: nextAvailableColorIndex(builds),
    }
    const next = [...builds]
    next.splice(index + 1, 0, duplicated)
    setBuilds(next)
    setAnnouncement('ビルドを複製しました。スキルやモジュールだけを変更して比較できます。')
    window.requestAnimationFrame(() => buildPickerButtonRefs.current.get(duplicated.slotId)?.focus())
  }

  const removeBuild = (slotId: string) => {
    if (builds.length <= 1) return
    const index = builds.findIndex((build) => build.slotId === slotId)
    if (index < 0) return
    const next = builds.filter((build) => build.slotId !== slotId)
    const focusSlotId = next[Math.min(index, next.length - 1)]?.slotId
    setBuilds(next)
    setAnnouncement('比較対象を削除しました。残り' + next.length + '件です。')
    window.requestAnimationFrame(() => {
      if (focusSlotId) buildPickerButtonRefs.current.get(focusSlotId)?.focus()
      else addButtonRef.current?.focus()
    })
  }

  const resetBuilds = () => {
    nextSlotIdRef.current = 1
    const initialBuilds = createInitialBuilds(rows, allocateSlotId)
    setBuilds(initialBuilds)
    setEnemy({ defense: 0, resistance: 0 })
    setAxis(initialBuilds[0]
      ? getComparisonInitialAxis(rows, initialBuilds[0], DEFAULT_COMPARISON_METRIC)
      : 'DEFENSE')
    setMetric(DEFAULT_COMPARISON_METRIC)
    setAnnouncement('比較内容を初期状態に戻しました。')
  }

  const openSkillEffect = (
    skill: SkillRecord,
    skillLevelIndex: number,
    trigger: HTMLButtonElement,
  ) => {
    skillDetailTriggerRef.current = trigger
    setDetailSkill({ skill, skillLevelIndex })
  }

  const closeSkillEffect = () => {
    setDetailSkill(null)
    window.requestAnimationFrame(() => skillDetailTriggerRef.current?.focus())
  }

  if (loading && rows.length === 0) {
    return (
      <section className="comparison-page">
        <h1 className="visually-hidden">Operator Build Comparison</h1>
        <p className="comparison-loading" role="status">ゲームデータを読み込んでいます…</p>
      </section>
    )
  }

  return (
    <section className="comparison-page">
      <h1 className="visually-hidden">Operator Build Comparison</h1>

      <section className="comparison-panel comparison-build-panel" aria-labelledby="comparison-builds-heading">
        <PanelHeading
          number="01"
          title="比較するビルド"
          id="comparison-builds-heading"
          note={builds.length + ' / ' + MAX_BUILDS + '件'}
          action={<button type="button" className="comparison-text-button" onClick={resetBuilds}>初期状態に戻す</button>}
        />
        <p className="comparison-section-lead">
          1件ずつ独立した育成状態を持ちます。「複製」すると同じオペレーターの差分をすぐ作れます。
        </p>
        <div className="comparison-build-grid">
          {builds.map((build, index) => {
            const skill = rows.find((row) => row.id === build.skillRecordId)
            if (!skill) return null
            return (
              <BuildCard
                build={build}
                index={index}
                key={build.slotId}
                skill={skill}
                rows={rows}
                canRemove={builds.length > 1}
                canDuplicate={builds.length < MAX_BUILDS}
                pickerButtonRef={(button) => {
                  if (button) buildPickerButtonRefs.current.set(build.slotId, button)
                  else buildPickerButtonRefs.current.delete(build.slotId)
                }}
                onOpenPicker={(trigger) => openPicker({ mode: 'REPLACE', slotId: build.slotId }, trigger)}
                onDuplicate={() => duplicateBuild(build.slotId)}
                onRemove={() => removeBuild(build.slotId)}
                onSkillChange={(skillRecordId) => changeSkill(build.slotId, skillRecordId)}
                onChange={(patch) => updateBuild(build.slotId, patch)}
                onOpenSkillEffect={openSkillEffect}
              />
            )
          })}
          <button
            ref={addButtonRef}
            type="button"
            className="comparison-add-build"
            disabled={builds.length >= MAX_BUILDS}
            onClick={(event) => openPicker({ mode: 'ADD', slotId: null }, event.currentTarget)}
          >
            <span aria-hidden="true">＋</span>
            <strong>比較対象を追加</strong>
            <small>{builds.length >= MAX_BUILDS ? '最大6件です' : '同じオペレーターも追加できます'}</small>
          </button>
        </div>
        <p className="comparison-fixed-note">潜在能力は1で固定しています。モジュールの能力値・特性・素質変更は対応範囲を計算へ反映します。</p>
      </section>

      <section className="comparison-panel" aria-labelledby="comparison-conditions-heading">
        <PanelHeading
          number="02"
          title="共通の敵条件"
          id="comparison-conditions-heading"
          note="すべてのビルドへ同時に適用"
        />
        <div className="comparison-condition-layout">
          <div className="comparison-enemy-fields">
            <NumberField
              label="敵の防御力"
              value={enemy.defense}
              min={0}
              max={10000}
              step={50}
              onChange={(defense) => setEnemy({ ...enemy, defense })}
            />
            <NumberField
              label="敵の術耐性"
              value={enemy.resistance}
              min={0}
              max={100}
              step={5}
              suffix="%"
              onChange={(resistance) => setEnemy({ ...enemy, resistance })}
            />
          </div>
          <div className="comparison-condition-copy">
            <strong>現在値でまず比較し、片方の敵能力を横軸にして推移を重ねます。</strong>
            <span>防御力の推移では術耐性を固定し、術耐性の推移では防御力を固定します。</span>
          </div>
        </div>
      </section>

      <section className="comparison-panel comparison-results-panel" aria-labelledby="comparison-results-heading">
        <PanelHeading
          number="03"
          title="比較結果"
          id="comparison-results-heading"
          note={evaluations.length + '件を計算'}
          action={(
            <div className="comparison-export-actions">
              <button
                type="button"
                className="button secondary"
                disabled={evaluations.length === 0}
                onClick={() => downloadCsv(buildOperatorBuildComparisonCsv(evaluations), 'arknights-build-comparison-current.csv')}
              >
                現在値CSV
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={rawSeries.length === 0}
                onClick={() => downloadCsv(buildOperatorBuildComparisonSeriesCsv(rawSeries, axis), 'arknights-build-comparison-series.csv')}
              >
                推移CSV
              </button>
            </div>
          )}
        />

        <div className="comparison-current-summary">
          <div className="comparison-subheading">
            <div>
              <span>CURRENT CONDITION</span>
              <h3>現在の敵条件での出力</h3>
            </div>
            <p>防御 {formatNumber(enemy.defense)} / 術耐性 {formatNumber(enemy.resistance)}%</p>
          </div>
          <CurrentOutputTable
            evaluations={evaluations}
            onOpenOperatorDetail={onOpenOperatorDetail}
          />
        </div>

        <div className="comparison-series-section">
          <div className="comparison-subheading">
            <div>
              <span>OVERLAY</span>
              <h3>敵能力に対する推移</h3>
            </div>
            <p>{calculableCount} / {rawSeries.length}系列を表示できます</p>
          </div>

          <div className="comparison-series-controls">
            <fieldset>
              <legend>横軸</legend>
              <div className="comparison-segmented-control">
                {COMPARISON_AXES.map((candidate) => (
                  <button
                    type="button"
                    className={axis === candidate ? 'active' : ''}
                    aria-pressed={axis === candidate}
                    onClick={() => setAxis(candidate)}
                    key={candidate}
                  >
                    {COMPARISON_AXIS_LABELS[candidate]}の推移
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="comparison-metric-fieldset">
              <legend>重ねる出力</legend>
              <div className="comparison-segmented-control comparison-metric-control">
                {COMPARISON_BUILD_METRICS.map((candidate) => (
                  <button
                    type="button"
                    className={metric === candidate ? 'active' : ''}
                    aria-pressed={metric === candidate}
                    onClick={() => setMetric(candidate)}
                    key={candidate}
                  >
                    {COMPARISON_BUILD_METRIC_LABELS[candidate]}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>

          <p className="comparison-axis-note">
            {axis === 'DEFENSE'
              ? '術ダメージ・確定ダメージの系列は、防御力を変えても水平になります。術耐性は現在値で固定します。'
              : '物理ダメージ・確定ダメージの系列は、術耐性を変えても水平になります。防御力は現在値で固定します。'}
          </p>

          <ComparisonChart
            axisLabel={COMPARISON_AXIS_LABELS[axis]}
            metricLabel={COMPARISON_BUILD_METRIC_LABELS[metric]}
            currentX={currentAxisValue}
            series={chartSeries}
          />
          <SeriesAvailability
            series={rawSeries}
            evaluations={evaluations}
          />
          <SeriesValueTable
            series={rawSeries}
            evaluations={evaluations}
            axis={axis}
            metric={metric}
            points={axisPoints}
            current={currentAxisValue}
          />
        </div>

        <div className="comparison-detail-section">
          <div className="comparison-subheading">
            <div>
              <span>BUILD DETAILS</span>
              <h3>ビルドごとの計算状態</h3>
            </div>
            <p>反映範囲と未対応項目を確認できます</p>
          </div>
          <div className="comparison-detail-list">
            {evaluations.map((evaluation, index) => (
              <BuildEvaluationDetails
                evaluation={evaluation}
                index={index}
                key={evaluation.config.slotId}
              />
            ))}
          </div>
        </div>
      </section>

      <span className="comparison-visually-hidden" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>

      {picker && (
        <OperatorPickerDialog
          rows={rows}
          filters={operatorFilters}
          loading={loading}
          selectedOperatorId={picker.slotId
            ? builds.find((build) => build.slotId === picker.slotId)?.operatorId
            : undefined}
          mode={picker.mode}
          onFiltersChange={setOperatorFilters}
          onSelect={selectOperator}
          onClose={closePicker}
        />
      )}
      {detailSkill && (
        <SkillEffectModal
          skill={detailSkill.skill}
          skillLevelIndex={detailSkill.skillLevelIndex}
          onClose={closeSkillEffect}
        />
      )}
    </section>
  )
}

function BuildCard({
  build,
  index,
  skill,
  rows,
  canRemove,
  canDuplicate,
  pickerButtonRef,
  onOpenPicker,
  onDuplicate,
  onRemove,
  onSkillChange,
  onChange,
  onOpenSkillEffect,
}: {
  build: ComparisonBuildConfig
  index: number
  skill: SkillRecord
  rows: SkillRecord[]
  canRemove: boolean
  canDuplicate: boolean
  pickerButtonRef: (button: HTMLButtonElement | null) => void
  onOpenPicker: (trigger: HTMLButtonElement) => void
  onDuplicate: () => void
  onRemove: () => void
  onSkillChange: (skillRecordId: string) => void
  onChange: (patch: Partial<ComparisonBuildConfig>) => void
  onOpenSkillEffect: (skill: SkillRecord, skillLevelIndex: number, trigger: HTMLButtonElement) => void
}) {
  const operatorSkills = rows
    .filter((row) => row.operatorId === skill.operatorId)
    .sort((a, b) => a.skillIndex - b.skillIndex)
  const phases = skill.operatorProfile.phases
  const phase = phases[build.phaseIndex]
  const maxOperatorLevel = Math.max(1, phase?.maxLevel ?? 1)
  const modules = getOperatorModules(skill.operatorProfile)
  const moduleEntries = modules.map((module, moduleIndex) => ({
    module,
    id: getOperatorModuleId(module, moduleIndex),
    unlocked: isOperatorModuleUnlocked(module, build.phaseIndex, build.operatorLevel),
  }))
  const selectedModule = moduleEntries.find((entry) => entry.id === build.moduleId)?.module ?? null
  const moduleLevels = getOperatorModuleLevels(selectedModule)
  const color = getBuildColor(build.colorIndex ?? index)
  const style = { '--build-color': color } as CSSProperties
  const buildName = 'BUILD ' + String.fromCharCode(65 + index)
  const buildTokenId = build.slotId + '-token'
  const operatorNameId = build.slotId + '-operator'

  return (
    <article
      className="comparison-build-card"
      style={style}
      aria-labelledby={buildTokenId + ' ' + operatorNameId}
    >
      <header className="comparison-build-card-header">
        <span id={buildTokenId} className="comparison-build-token"><i aria-hidden="true" />{buildName}</span>
        <div className="comparison-build-actions">
          <button type="button" aria-label={buildName + 'を複製'} disabled={!canDuplicate} onClick={onDuplicate}>複製</button>
          <button type="button" aria-label={buildName + 'を削除'} disabled={!canRemove} onClick={onRemove}>削除</button>
        </div>
      </header>

      <button
        ref={pickerButtonRef}
        type="button"
        className="comparison-operator-picker-button"
        aria-label={buildName + 'のオペレーターを変更'}
        onClick={(event) => onOpenPicker(event.currentTarget)}
      >
        <span>
          <strong id={operatorNameId}>{skill.operatorName}</strong>
          <small>★{skill.rarity} · {skill.professionLabel} / {skill.subProfessionName}</small>
        </span>
        <em>変更</em>
      </button>

      <div className="comparison-build-fields">
        <label>
          <span>スキル</span>
          <select
            aria-label={buildName + 'のスキル'}
            value={build.skillRecordId}
            onChange={(event) => onSkillChange(event.currentTarget.value)}
          >
            {operatorSkills.map((candidate) => (
              <option value={candidate.id} key={candidate.id}>S{candidate.skillIndex} {candidate.skillName}</option>
            ))}
          </select>
        </label>
        <label>
          <span>モジュール</span>
          <select
            aria-label={buildName + 'のモジュール'}
            value={build.moduleId ?? ''}
            onChange={(event) => {
              const moduleId = event.currentTarget.value || null
              const nextModule = moduleEntries.find((entry) => entry.id === moduleId)?.module
              const levels = getOperatorModuleLevels(nextModule)
              onChange({
                moduleId,
                moduleLevel: moduleId ? levels.at(-1) ?? 1 : null,
              })
            }}
          >
            <option value="">なし</option>
            {moduleEntries.map((entry) => (
              <option value={entry.id} disabled={!entry.unlocked} key={entry.id}>
                {entry.module.uniEquipName || '名称なし'}
                {entry.unlocked ? '' : '（' + getOperatorModuleUnlockLabel(entry.module) + '）'}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>モジュール段階</span>
          <select
            aria-label={buildName + 'のモジュール段階'}
            value={build.moduleLevel ?? ''}
            disabled={!selectedModule}
            onChange={(event) => onChange({ moduleLevel: Number(event.currentTarget.value) })}
          >
            {!selectedModule && <option value="">—</option>}
            {moduleLevels.map((level) => <option value={level} key={level}>Lv.{level}</option>)}
          </select>
        </label>
        <button
          type="button"
          className="comparison-skill-effect-button"
          aria-label={buildName + 'のスキル効果の詳細'}
          onClick={(event) => onOpenSkillEffect(skill, build.skillLevelIndex, event.currentTarget)}
        >
          スキル効果の詳細
        </button>
      </div>

      <details className="comparison-growth-details">
        <summary>
          <span>育成状態</span>
          <strong>昇進{build.phaseIndex} Lv.{build.operatorLevel} · 信頼{formatNumber(build.trustPercent)}% · {getSkillLevelLabel(build.skillLevelIndex, skill.skillLevels.length)}</strong>
        </summary>
        <div className="comparison-growth-grid">
          <label>
            <span>昇進</span>
            <select
              aria-label={buildName + 'の昇進段階'}
              value={build.phaseIndex}
              onChange={(event) => onChange({ phaseIndex: Number(event.currentTarget.value) })}
            >
              {phases.map((_, phaseIndex) => (
                <option value={phaseIndex} key={phaseIndex}>{phaseIndex === 0 ? '未昇進' : '昇進' + phaseIndex}</option>
              ))}
            </select>
          </label>
          <label>
            <span>レベル</span>
            <input
              aria-label={buildName + 'のオペレーターレベル'}
              type="number"
              min={1}
              max={maxOperatorLevel}
              value={build.operatorLevel}
              onChange={(event) => onChange({ operatorLevel: Number(event.currentTarget.value) })}
            />
          </label>
          <label>
            <span>信頼度</span>
            <input
              aria-label={buildName + 'の信頼度'}
              type="number"
              min={0}
              max={100}
              value={build.trustPercent}
              onChange={(event) => onChange({ trustPercent: Number(event.currentTarget.value) })}
            />
          </label>
          <label>
            <span>スキルレベル</span>
            <select
              aria-label={buildName + 'のスキルレベル'}
              value={build.skillLevelIndex}
              onChange={(event) => onChange({ skillLevelIndex: Number(event.currentTarget.value) })}
            >
              {(skill.skillLevels.length > 0 ? skill.skillLevels : [skill.raw]).map((_, skillLevelIndex, levels) => (
                <option value={skillLevelIndex} key={skillLevelIndex}>
                  {getSkillLevelLabel(skillLevelIndex, levels.length)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </details>
    </article>
  )
}

function CurrentOutputTable({
  evaluations,
  onOpenOperatorDetail,
}: {
  evaluations: ComparisonBuildEvaluation[]
  onOpenOperatorDetail: OpenOperatorDetail
}) {
  return (
    <div className="comparison-output-table-wrap" role="region" tabIndex={0} aria-label="現在の敵条件での比較表">
      <table className="comparison-output-table">
        <thead>
          <tr>
            <th>ビルド</th>
            <th>通常種別</th>
            <th>通常 1ヒット</th>
            <th>通常 DPS</th>
            <th>スキル種別</th>
            <th>スキル 1ヒット</th>
            <th>スキル 1攻撃</th>
            <th>スキル DPS</th>
            <th>スキル総量</th>
            <th>計算状態</th>
          </tr>
        </thead>
        <tbody>
          {evaluations.map((evaluation, index) => (
            <tr key={evaluation.config.slotId}>
              <th scope="row">
                <span className="comparison-table-build-label">
                  <i style={{ background: getBuildColor(evaluation.config.colorIndex ?? index) }} aria-hidden="true" />
                  <span>
                    <strong>
                      <OperatorDetailLink
                        operatorId={evaluation.skill.operatorId}
                        onOpenOperatorDetail={onOpenOperatorDetail}
                        className="comparison-operator-detail-link"
                        aria-label={`${evaluation.skill.operatorName}の詳細を開く`}
                      >
                        {evaluation.skill.operatorName}
                      </OperatorDetailLink>
                    </strong>
                    <small>S{evaluation.skill.skillIndex} {evaluation.skill.skillName} · {formatModuleLabel(evaluation)}</small>
                  </span>
                </span>
              </th>
              <td>{formatDamageType(evaluation.normalOutput.damageTypeDetection.damageType)}</td>
              <MetricCell evaluation={evaluation} metric="NORMAL_PER_HIT" />
              <MetricCell evaluation={evaluation} metric="NORMAL_DPS" />
              <td>{formatDamageType(evaluation.skillOutput.damageTypeDetection.damageType)}</td>
              <MetricCell evaluation={evaluation} metric="SKILL_PER_HIT" />
              <MetricCell evaluation={evaluation} metric="SKILL_PER_ATTACK" />
              <MetricCell evaluation={evaluation} metric="SKILL_DPS" />
              <MetricCell evaluation={evaluation} metric="SKILL_TOTAL" />
              <td><OutputStatus evaluation={evaluation} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SeriesValueTable({
  series,
  evaluations,
  axis,
  metric,
  points,
  current,
}: {
  series: ComparisonAxisSeries[]
  evaluations: ComparisonBuildEvaluation[]
  axis: ComparisonAxis
  metric: ComparisonBuildMetric
  points: number[]
  current: number
}) {
  const evaluationBySlot = new Map(evaluations.map((evaluation) => [evaluation.config.slotId, evaluation]))
  return (
    <div className="comparison-series-table-section">
      <div className="comparison-table-title-row">
        <h4>正確な数値</h4>
        <span>{COMPARISON_BUILD_METRIC_LABELS[metric]}</span>
      </div>
      <div className="comparison-series-table-wrap" role="region" tabIndex={0} aria-label="グラフと同じ比較数値の表">
        <table className="comparison-series-table">
          <thead>
            <tr>
              <th>{COMPARISON_AXIS_LABELS[axis]}</th>
              {series.map((item, index) => (
                <th key={item.slotId}>
                  <span className="comparison-series-column-heading">
                    <i style={{ background: getBuildColor(item.colorIndex) }} aria-hidden="true" />
                    {getSeriesLabel(evaluationBySlot.get(item.slotId), index)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr className={point === current ? 'current' : undefined} key={point}>
                <th scope="row">{formatNumber(point)}{point === current ? '（現在）' : ''}</th>
                {series.map((item) => {
                  const value = item.points.find((candidate) => candidate.x === point)
                  return (
                    <td title={value?.unavailableReasons.join(' ') || undefined} key={item.slotId}>
                      {formatOptionalNumber(value?.value ?? null)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SeriesAvailability({
  series,
  evaluations,
}: {
  series: ComparisonAxisSeries[]
  evaluations: ComparisonBuildEvaluation[]
}) {
  const evaluationBySlot = new Map(evaluations.map((evaluation) => [evaluation.config.slotId, evaluation]))
  const unavailable = series
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.points.every((point) => point.value === null))
  if (unavailable.length === 0) return null

  return (
    <section className="comparison-series-unavailable" aria-labelledby="comparison-series-unavailable-heading">
      <h4 id="comparison-series-unavailable-heading">この出力を表示できないビルド</h4>
      <ul>
        {unavailable.map(({ item, index }) => (
          <li key={item.slotId}>
            <strong>{getSeriesLabel(evaluationBySlot.get(item.slotId), index)}</strong>
            <span>{item.unavailableReasons.join(' ') || 'この出力は現在の計算モデルでは算出できません。'}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function BuildEvaluationDetails({ evaluation, index }: { evaluation: ComparisonBuildEvaluation; index: number }) {
  const normalType = formatDamageType(evaluation.normalOutput.damageTypeDetection.damageType)
  const skillType = formatDamageType(evaluation.skillOutput.damageTypeDetection.damageType)
  const moduleEffects = evaluation.module.application.attributeEffects
  const moduleChanges = evaluation.module.application.changes
  const missingMetrics = getMissingMetrics(evaluation)

  return (
    <details
      className="comparison-evaluation-details"
      style={{ '--build-color': getBuildColor(evaluation.config.colorIndex ?? index) } as CSSProperties}
    >
      <summary>
        <span className="comparison-detail-summary-name">
          <i aria-hidden="true" />
          <span>
            <strong>{evaluation.skill.operatorName} · S{evaluation.skill.skillIndex} {evaluation.skill.skillName}</strong>
            <small>{formatModuleLabel(evaluation)}</small>
          </span>
        </span>
        <OutputStatus evaluation={evaluation} />
      </summary>
      <div className="comparison-evaluation-body">
        <dl className="comparison-evaluation-stats">
          <div><dt>基礎攻撃力</dt><dd>{formatNumber(evaluation.operatorStats.attack)}</dd></div>
          <div><dt>攻撃間隔</dt><dd>{formatNumber(evaluation.operatorStats.attackInterval)}秒</dd></div>
          <div><dt>通常 / スキル</dt><dd>{normalType} / {skillType}</dd></div>
          <div><dt>攻撃回数</dt><dd>{formatNumber(evaluation.skillModel.hitCount)}ヒット</dd></div>
          <div><dt>効果時間</dt><dd>{evaluation.skillModel.duration > 0 ? formatNumber(evaluation.skillModel.duration) + '秒' : '—'}</dd></div>
          <div><dt>モジュール攻撃力</dt><dd>{formatSignedNumber(evaluation.module.application.moduleAttack)}</dd></div>
        </dl>

        {moduleEffects.length > 0 && (
          <section className="comparison-reflection-list">
            <h4>モジュール能力値</h4>
            <ul>
              {moduleEffects.map((effect) => (
                <li key={effect.key}>
                  <strong>{effect.label} {effect.valueLabel}</strong>
                  <span>{effect.reason}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {moduleChanges.length > 0 && (
          <section className="comparison-reflection-list">
            <h4>モジュールによる特性・素質変更</h4>
            <ul>
              {moduleChanges.map((change) => (
                <li key={change.kind + ':' + change.label + ':' + change.description}>
                  <strong>{change.label}</strong>
                  <span>{change.description}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {(evaluation.unavailableReasons.length > 0 || evaluation.warnings.length > 0 || missingMetrics.length > 0) ? (
          <div className="comparison-message-grid">
            {evaluation.unavailableReasons.length > 0 && (
              <section className="comparison-message comparison-message-error">
                <h4>計算できない出力</h4>
                <ul>{evaluation.unavailableReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
              </section>
            )}
            {missingMetrics.length > 0 && (
              <section className="comparison-message comparison-message-error">
                <h4>表示できない出力</h4>
                <ul>
                  {missingMetrics.map(({ metric, reasons }) => (
                    <li key={metric}>
                      <strong>{COMPARISON_BUILD_METRIC_LABELS[metric]}:</strong>{' '}
                      {reasons.join(' ') || 'この出力は算出対象外です。'}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {evaluation.warnings.length > 0 && (
              <section className="comparison-message comparison-message-warning">
                <h4>概算・未反映の条件</h4>
                <ul>{evaluation.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
              </section>
            )}
          </div>
        ) : (
          <p className="comparison-all-applied">現在の単体ダメージ比較に必要な登録済み効果を反映しています。</p>
        )}
      </div>
    </details>
  )
}

function OperatorPickerDialog({
  rows,
  filters,
  loading,
  selectedOperatorId,
  mode,
  onFiltersChange,
  onSelect,
  onClose,
}: {
  rows: SkillRecord[]
  filters: FilterState
  loading: boolean
  selectedOperatorId?: string
  mode: 'ADD' | 'REPLACE'
  onFiltersChange: (filters: FilterState) => void
  onSelect: (row: SkillRecord) => void
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
    window.requestAnimationFrame(() => titleRef.current?.focus())
    const previousOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.documentElement.style.overflow = previousOverflow
      if (dialog.open) dialog.close()
    }
  }, [])

  const handleBackdropClick = (event: ReactMouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      className="comparison-picker-dialog"
      aria-labelledby="comparison-picker-title"
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={handleBackdropClick}
    >
      <article className="comparison-picker-modal">
        <header>
          <div>
            <span>OPERATOR SELECT</span>
            <h2 ref={titleRef} id="comparison-picker-title" tabIndex={-1}>
              {mode === 'ADD' ? '比較するオペレーターを追加' : 'オペレーターを変更'}
            </h2>
          </div>
          <button type="button" aria-label="オペレーター選択を閉じる" onClick={onClose}>×</button>
        </header>
        <div className="comparison-picker-body">
          <OperatorSearch
            rows={rows}
            filters={filters}
            loading={loading}
            onFiltersChange={onFiltersChange}
            onSelect={onSelect}
            instruction="同じオペレーターを複数回選ぶこともできます"
            actionLabel="選択する →"
            selectedOperatorId={selectedOperatorId}
          />
        </div>
      </article>
    </dialog>
  )
}

function PanelHeading({
  number,
  title,
  id,
  note,
  action,
}: {
  number: string
  title: string
  id: string
  note: string
  action?: React.ReactNode
}) {
  return (
    <div className="comparison-panel-heading">
      <div className="comparison-panel-title">
        <span>{number}</span>
        <h2 id={id}>{title}</h2>
      </div>
      <div className="comparison-panel-heading-actions">
        <p>{note}</p>
        {action}
      </div>
    </div>
  )
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  suffix?: string
  onChange: (value: number) => void
}) {
  return (
    <label className="comparison-number-field">
      <span>{label}</span>
      <span className="comparison-number-input">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(clamp(Number(event.currentTarget.value), min, max))}
        />
        {suffix && <em>{suffix}</em>}
      </span>
    </label>
  )
}

function MetricCell({
  evaluation,
  metric,
}: {
  evaluation: ComparisonBuildEvaluation
  metric: ComparisonBuildMetric
}) {
  const result = getComparisonMetricValue(evaluation, metric)
  const unavailableLabel = result.value === null
    ? COMPARISON_BUILD_METRIC_LABELS[metric] + 'は表示できません。'
      + (result.unavailableReasons.join(' ') || 'この出力は算出対象外です。')
    : undefined
  return (
    <td
      className={result.value === null ? 'comparison-numeric-cell unavailable' : 'comparison-numeric-cell'}
      title={result.unavailableReasons.join(' ') || undefined}
      aria-label={unavailableLabel}
    >
      {formatOptionalNumber(result.value)}
    </td>
  )
}

function OutputStatus({ evaluation }: { evaluation: ComparisonBuildEvaluation }) {
  if (evaluation.unavailableReasons.length > 0) {
    return <span className="comparison-status comparison-status-partial">一部計算不可</span>
  }
  if (getMissingMetrics(evaluation).length > 0) {
    return <span className="comparison-status comparison-status-partial">一部出力なし</span>
  }
  if (evaluation.warnings.length > 0) {
    return <span className="comparison-status comparison-status-warning">概算あり</span>
  }
  return <span className="comparison-status comparison-status-ready">計算可能</span>
}

function getMissingMetrics(evaluation: ComparisonBuildEvaluation): Array<{
  metric: ComparisonBuildMetric
  reasons: string[]
}> {
  return COMPARISON_BUILD_METRICS.flatMap((metric) => {
    const result = getComparisonMetricValue(evaluation, metric)
    return result.value === null
      ? [{ metric, reasons: result.unavailableReasons }]
      : []
  })
}

function createInitialBuilds(
  rows: SkillRecord[],
  allocateSlotId: () => string,
): ComparisonBuildConfig[] {
  if (rows.length === 0) return []
  const groupedByOperator = new Map<string, SkillRecord[]>()
  for (const row of rows) {
    const skills = groupedByOperator.get(row.operatorId) ?? []
    skills.push(row)
    groupedByOperator.set(row.operatorId, skills)
  }
  const grouped = [...groupedByOperator.values()]
    .map((skills) => skills.sort((a, b) => a.skillIndex - b.skillIndex))
  const preferred = grouped.find((skills) => skills[0]?.operatorName === 'スルト' && skills.length >= 2)
    ?? grouped.find((skills) => skills.length >= 2)
  const initialSkills = preferred
    ? [preferred[0], preferred.at(-1) as SkillRecord]
    : [rows[0], rows[1] ?? rows[0]]
  return initialSkills.map((skill, index) => (
    createBuildFromSkill(skill, allocateSlotId(), index)
  ))
}

function createBuildFromSkill(
  skill: SkillRecord,
  slotId: string,
  colorIndex: number,
): ComparisonBuildConfig {
  const phaseIndex = Math.max(0, skill.operatorProfile.phases.length - 1)
  const operatorLevel = Math.max(1, skill.operatorProfile.phases[phaseIndex]?.maxLevel ?? 1)
  return {
    slotId,
    label: null,
    colorIndex,
    operatorId: skill.operatorId,
    skillRecordId: skill.id,
    phaseIndex,
    operatorLevel,
    trustPercent: 100,
    skillLevelIndex: Math.max(0, skill.skillLevels.length - 1),
    moduleId: null,
    moduleLevel: null,
  }
}

function normalizeBuildConfig(
  rows: SkillRecord[],
  requested: ComparisonBuildConfig,
): ComparisonBuildConfig {
  const skill = rows.find((row) => row.id === requested.skillRecordId && row.operatorId === requested.operatorId)
  if (!skill) return requested
  const phaseIndex = clamp(Math.round(requested.phaseIndex), 0, Math.max(0, skill.operatorProfile.phases.length - 1))
  const phase = skill.operatorProfile.phases[phaseIndex]
  const operatorLevel = clamp(Math.round(requested.operatorLevel), 1, Math.max(1, phase?.maxLevel ?? 1))
  const trustPercent = clamp(requested.trustPercent, 0, 100)
  const skillLevelIndex = clamp(
    Math.round(requested.skillLevelIndex),
    0,
    Math.max(0, (skill.skillLevels.length || 1) - 1),
  )
  const moduleEntries = getOperatorModules(skill.operatorProfile).map((module, index) => ({
    module,
    id: getOperatorModuleId(module, index),
  }))
  const selectedModule = moduleEntries.find((entry) => entry.id === requested.moduleId)?.module
  const moduleUnlocked = selectedModule
    ? isOperatorModuleUnlocked(selectedModule, phaseIndex, operatorLevel)
    : false
  const moduleId = selectedModule && moduleUnlocked ? requested.moduleId : null
  const levels = getOperatorModuleLevels(selectedModule)
  const moduleLevel = moduleId
    ? levels.includes(requested.moduleLevel ?? -1)
      ? requested.moduleLevel
      : levels.at(-1) ?? 1
    : null

  return {
    ...requested,
    phaseIndex,
    operatorLevel,
    trustPercent,
    skillLevelIndex,
    moduleId,
    moduleLevel,
  }
}

function getSeriesLabel(evaluation: ComparisonBuildEvaluation | undefined, index: number): string {
  if (!evaluation) return 'Build ' + String.fromCharCode(65 + index)
  return [
    'Build ' + String.fromCharCode(65 + index),
    evaluation.skill.operatorName,
    'S' + evaluation.skill.skillIndex + ' ' + evaluation.skill.skillName,
    formatModuleLabel(evaluation),
  ].join(' · ')
}

function formatModuleLabel(evaluation: ComparisonBuildEvaluation): string {
  return evaluation.module.module
    ? (evaluation.module.application.moduleName || evaluation.module.module.uniEquipName || '名称なし')
      + ' Lv.' + evaluation.module.level
    : 'モジュールなし'
}

function getBuildColor(colorIndex: number): string {
  return BUILD_COLORS[Math.abs(colorIndex) % BUILD_COLORS.length]
}

function nextAvailableColorIndex(builds: ComparisonBuildConfig[]): number {
  const used = new Set(builds.map((build) => (build.colorIndex ?? 0) % BUILD_COLORS.length))
  return BUILD_COLORS.findIndex((_, index) => !used.has(index)) >= 0
    ? BUILD_COLORS.findIndex((_, index) => !used.has(index))
    : builds.length % BUILD_COLORS.length
}

function formatDamageType(type: keyof typeof DAMAGE_TYPE_LABELS | null): string {
  return type === null ? '判定不可' : DAMAGE_TYPE_LABELS[type]
}

function getSkillLevelLabel(index: number, total: number): string {
  if (total >= 10 && index >= 7) return '特化' + (index - 6)
  return 'Lv.' + (index + 1)
}

function formatOptionalNumber(value: number | null): string {
  return value === null ? '—' : formatNumber(value)
}

function formatNumber(value: number): string {
  return NUMBER_FORMATTER.format(value)
}

function formatSignedNumber(value: number): string {
  return (value > 0 ? '+' : '') + formatNumber(value)
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum
  return Math.min(maximum, Math.max(minimum, value))
}
