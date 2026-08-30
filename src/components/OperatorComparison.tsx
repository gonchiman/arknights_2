import { useMemo, useRef, useState } from 'react'
import { EFFECT_WINDOW_LABELS } from '../lib/classifier'
import { DAMAGE_TYPE_LABELS } from '../lib/damageCalculator'
import {
  COMPARISON_METRICS,
  COMPARISON_METRIC_LABELS,
  DEFAULT_ENEMY_STAT_PROFILES,
  buildComparisonCsv,
  buildSkillComparisonRow,
  getAvailableComparisonMetrics,
  getEnemyProfileLabel,
  type ComparisonMetric,
  type EnemyStatProfile,
} from '../lib/operatorComparison'
import { PROFESSION_ORDER } from '../lib/operatorFilters'
import { EFFECT_WINDOWS, type EffectWindowType, type SkillRecord } from '../types/skill'
import { Filters, type FilterOption, type FilterState } from './Filters'
import { EMPTY_OPERATOR_FILTERS, matchesOperatorFilters } from './OperatorSearch'
import './OperatorComparison.css'

interface Props {
  rows: SkillRecord[]
  loading: boolean
}

const MAX_ENEMY_COLUMNS = 10
const RESULT_BATCH_SIZE = 100
const COMPARISON_NUMBER_FORMATTER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 1 })

interface ComparisonSort {
  profileId: string
  direction: 'ASC' | 'DESC'
}

export function OperatorComparison({ rows, loading }: Props) {
  const [filters, setFilters] = useState<FilterState>({ ...EMPTY_OPERATOR_FILTERS })
  const [effectWindow, setEffectWindow] = useState<EffectWindowType>('FIXED_DURATION')
  const [metric, setMetric] = useState<ComparisonMetric>('DAMAGE')
  const [enemyProfiles, setEnemyProfiles] = useState<EnemyStatProfile[]>(cloneDefaultEnemyProfiles)
  const [showUnavailable, setShowUnavailable] = useState(true)
  const [resultPage, setResultPage] = useState(0)
  const [sort, setSort] = useState<ComparisonSort | null>(null)
  const [enemyAnnouncement, setEnemyAnnouncement] = useState('')
  const nextEnemyId = useRef(DEFAULT_ENEMY_STAT_PROFILES.length + 1)
  const comparisonTableRef = useRef<HTMLDivElement | null>(null)
  const enemyDefenseInputRefs = useRef(new Map<string, HTMLInputElement>())

  const professionOptions = useMemo(() => buildProfessionOptions(rows), [rows])
  const availableMetrics = getAvailableComparisonMetrics(effectWindow)
  const matchingSkills = useMemo(() => rows.filter((row) => (
    row.classification.effectWindow.value === effectWindow
    && matchesOperatorFilters(row, filters)
  )), [rows, filters, effectWindow])
  const comparisonRowStates = useMemo(() => matchingSkills.map((skill) => (
    buildSkillComparisonRow(skill, [], metric)
  )), [matchingSkills, metric])
  const calculableCount = comparisonRowStates.filter((row) => row.unavailableReasons.length === 0).length
  const approximateCount = comparisonRowStates.filter((row) => (
    row.unavailableReasons.length === 0 && row.warnings.length > 0
  )).length
  const displayedRowStates = useMemo(() => showUnavailable
    ? comparisonRowStates
    : comparisonRowStates.filter((row) => row.unavailableReasons.length === 0), [comparisonRowStates, showUnavailable])
  const sortProfile = sort
    ? enemyProfiles.find((candidate) => candidate.id === sort.profileId)
    : undefined
  const sortedRowStates = useMemo(() => {
    if (!sort || !sortProfile) return displayedRowStates

    return displayedRowStates.map((row, index) => ({
      row,
      index,
      value: buildSkillComparisonRow(row.skill, [sortProfile], metric).values[0],
    })).sort((a, b) => {
      if (a.value === null && b.value === null) return a.index - b.index
      if (a.value === null) return 1
      if (b.value === null) return -1
      const difference = sort.direction === 'DESC' ? b.value - a.value : a.value - b.value
      return difference || a.index - b.index
    }).map(({ row }) => row)
  }, [displayedRowStates, metric, sort, sortProfile])
  const totalPages = Math.max(1, Math.ceil(sortedRowStates.length / RESULT_BATCH_SIZE))
  const safeResultPage = Math.min(resultPage, totalPages - 1)
  const pageStart = safeResultPage * RESULT_BATCH_SIZE
  const pagedRowStates = useMemo(() => sortedRowStates.slice(
    pageStart,
    pageStart + RESULT_BATCH_SIZE,
  ), [sortedRowStates, pageStart])
  const renderedRows = useMemo(() => pagedRowStates.map((row) => (
    buildSkillComparisonRow(row.skill, enemyProfiles, metric)
  )), [pagedRowStates, enemyProfiles, metric])

  const scrollComparisonTableToTop = () => {
    window.requestAnimationFrame(() => {
      const table = comparisonTableRef.current
      if (table) table.scrollTo({ top: 0, left: table.scrollLeft })
    })
  }

  const resetResultPage = () => {
    setResultPage(0)
    scrollComparisonTableToTop()
  }

  const changeResultPage = (nextPage: number) => {
    setResultPage(nextPage)
    scrollComparisonTableToTop()
  }

  const toggleEnemySort = (profileId: string) => {
    setSort((current) => current?.profileId === profileId
      ? current.direction === 'DESC'
        ? { profileId, direction: 'ASC' }
        : null
      : { profileId, direction: 'DESC' })
    resetResultPage()
  }

  const selectEffectWindow = (nextWindow: EffectWindowType) => {
    setEffectWindow(nextWindow)
    resetResultPage()
    const nextMetrics = getAvailableComparisonMetrics(nextWindow)
    setMetric((current) => nextMetrics.includes(current) ? current : nextMetrics[0])
  }

  const resetAll = () => {
    setFilters({ ...EMPTY_OPERATOR_FILTERS })
    setEffectWindow('FIXED_DURATION')
    setMetric('DAMAGE')
    setEnemyProfiles(cloneDefaultEnemyProfiles())
    setShowUnavailable(true)
    setSort(null)
    resetResultPage()
  }

  const updateEnemyProfile = (
    id: string,
    key: 'defense' | 'resistance',
    rawValue: string,
  ) => {
    const value = clamp(Number(rawValue), 0, key === 'defense' ? 10000 : 100)
    setEnemyProfiles((current) => current.map((profile) => (
      profile.id === id ? { ...profile, [key]: value } : profile
    )))
  }

  const addEnemyProfile = () => {
    setEnemyProfiles((current) => {
      if (current.length >= MAX_ENEMY_COLUMNS) return current
      const last = current.at(-1) ?? { defense: 0, resistance: 0 }
      const id = `enemy-${nextEnemyId.current}`
      nextEnemyId.current += 1
      return [
        ...current,
        {
          id,
          defense: clamp(last.defense + 500, 0, 10000),
          resistance: clamp(last.resistance + 20, 0, 100),
        },
      ]
    })
  }

  const removeEnemyProfile = (id: string) => {
    if (enemyProfiles.length <= 1) return
    const removedIndex = enemyProfiles.findIndex((profile) => profile.id === id)
    if (removedIndex < 0) return
    const remainingProfiles = enemyProfiles.filter((profile) => profile.id !== id)
    const focusProfile = remainingProfiles[Math.min(removedIndex, remainingProfiles.length - 1)]
    setEnemyProfiles(remainingProfiles)
    setEnemyAnnouncement(`敵条件${removedIndex + 1}を削除しました。残り${remainingProfiles.length}列です。`)
    if (sort?.profileId === id) setSort(null)
    window.requestAnimationFrame(() => enemyDefenseInputRefs.current.get(focusProfile.id)?.focus())
  }

  const resetEnemyProfiles = () => {
    setEnemyProfiles(cloneDefaultEnemyProfiles())
    setSort(null)
    resetResultPage()
  }

  const downloadCsv = () => {
    if (displayedRowStates.length === 0) return
    const csvRows = sortedRowStates.map((row) => buildSkillComparisonRow(row.skill, enemyProfiles, metric))
    const csv = buildComparisonCsv(csvRows, enemyProfiles, metric)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `arknights-operator-comparison-${getLocalDateStamp(new Date())}.csv`
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  if (loading && rows.length === 0) {
    return <section className="comparison-page"><p className="comparison-loading" role="status">ゲームデータを読み込んでいます…</p></section>
  }

  return (
    <section className="comparison-page">
      <header className="comparison-header">
        <div>
          <span className="comparison-kicker">COMPARISON MATRIX</span>
          <h1>Operator Skill Comparison</h1>
          <p>条件に合うオペレーター＋スキルを、複数の敵ステータスで横断比較します。</p>
        </div>
        <button type="button" className="button secondary" onClick={resetAll}>すべてリセット</button>
      </header>

      <section className="comparison-panel comparison-target-panel">
        <PanelHeading number="01" title="比較対象" note="終了条件とオペレーター条件でスキルを絞り込みます" />
        <Filters
          value={filters}
          professionOptions={professionOptions}
          onChange={(nextFilters) => {
            setFilters(nextFilters)
            resetResultPage()
          }}
          onReset={() => {
            setFilters({ ...EMPTY_OPERATOR_FILTERS })
            resetResultPage()
          }}
        />
        <div className="comparison-control-section">
          <div className="comparison-control-heading">
            <strong>スキルの終了条件</strong>
            <span>出力の選択肢はここで選んだ条件に連動します</span>
          </div>
          <div className="comparison-choice-grid effect-window-choice" role="group" aria-label="スキルの終了条件">
            {EFFECT_WINDOWS.map((window) => (
              <button
                type="button"
                className={effectWindow === window ? 'active' : ''}
                aria-pressed={effectWindow === window}
                onClick={() => selectEffectWindow(window)}
                key={window}
              >
                {EFFECT_WINDOW_LABELS[window]}
              </button>
            ))}
          </div>
        </div>
        <div className="comparison-match-summary">
          <strong>{matchingSkills.length} スキルが条件に一致</strong>
          <span>{calculableCount} スキルで数値を表示できます（概算 {approximateCount}）</span>
        </div>
      </section>

      <section className="comparison-panel comparison-output-panel">
        <PanelHeading number="02" title="出力と敵条件" note="敵条件1つにつき比較表の1列を作ります" />
        <div className="comparison-control-section output-metric-section">
          <div className="comparison-control-heading">
            <strong>表示する数値</strong>
            <span id="comparison-metric-guidance">{getMetricGuidance(effectWindow)}</span>
          </div>
          <div className="comparison-choice-grid metric-choice" role="group" aria-label="表示する数値">
            {COMPARISON_METRICS.map((candidate) => {
              const available = availableMetrics.includes(candidate)
              return (
                <button
                  type="button"
                  className={metric === candidate ? 'active' : ''}
                  aria-pressed={metric === candidate}
                  aria-describedby="comparison-metric-guidance"
                  disabled={!available}
                  title={available ? undefined : getUnavailableMetricReason(effectWindow, candidate)}
                  onClick={() => {
                    setMetric(candidate)
                    resetResultPage()
                  }}
                  key={candidate}
                >
                  {COMPARISON_METRIC_LABELS[candidate]}
                </button>
              )
            })}
          </div>
          {metric === 'TOTAL' && effectWindow === 'FIXED_DURATION' && (
            <p className="comparison-metric-detail-note">
              固定時間の総ダメージは「DPS × 継続秒数」の理論連続値です。攻撃回数は整数に丸めません。
            </p>
          )}
        </div>

        <div className="comparison-control-section enemy-profile-section">
          <div className="comparison-control-heading enemy-profile-heading">
            <div>
              <strong>敵ステータス列</strong>
              <span>防御力と術耐性を1組として左から順に比較します</span>
            </div>
            <button type="button" className="comparison-text-button" onClick={resetEnemyProfiles}>初期値に戻す</button>
          </div>
          <div className="enemy-profile-grid">
            {enemyProfiles.map((profile, index) => (
              <article className="enemy-profile-card" key={profile.id}>
                <header>
                  <strong>敵条件 {index + 1}</strong>
                  <button
                    type="button"
                    aria-label={`敵条件${index + 1}を削除`}
                    disabled={enemyProfiles.length <= 1}
                    onClick={() => removeEnemyProfile(profile.id)}
                  >
                    削除
                  </button>
                </header>
                <label>
                  <span>防御力</span>
                  <input
                    ref={(input) => {
                      if (input) enemyDefenseInputRefs.current.set(profile.id, input)
                      else enemyDefenseInputRefs.current.delete(profile.id)
                    }}
                    type="number"
                    min="0"
                    max="10000"
                    step="50"
                    value={profile.defense}
                    aria-label={`敵条件${index + 1}の防御力`}
                    onChange={(event) => updateEnemyProfile(profile.id, 'defense', event.target.value)}
                  />
                </label>
                <label>
                  <span>術耐性</span>
                  <span className="comparison-number-input">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="5"
                      value={profile.resistance}
                      aria-label={`敵条件${index + 1}の術耐性`}
                      onChange={(event) => updateEnemyProfile(profile.id, 'resistance', event.target.value)}
                    />
                    <em>%</em>
                  </span>
                </label>
              </article>
            ))}
            <button
              type="button"
              className="enemy-profile-add"
              disabled={enemyProfiles.length >= MAX_ENEMY_COLUMNS}
              onClick={addEnemyProfile}
            >
              <strong>＋ 敵条件を追加</strong>
              <span>最大 {MAX_ENEMY_COLUMNS} 列</span>
            </button>
          </div>
        </div>
        <p className="comparison-note">
          育成状態は最大昇進・最大レベル・信頼度100・最大スキルレベルで統一します。潜在、モジュール、味方バフ、対象数、攻撃モーションは含みません。
        </p>
      </section>

      <section className="comparison-panel comparison-results-panel">
        <PanelHeading number="03" title="比較結果" note={`${COMPARISON_METRIC_LABELS[metric]}を表示中`} />
        <div className="comparison-results-toolbar">
          <div className="comparison-result-count" role="status" aria-live="polite" aria-atomic="true">
            <strong>
              {displayedRowStates.length} 行中 {displayedRowStates.length === 0 ? 0 : pageStart + 1}–{pageStart + renderedRows.length} 行表示
            </strong>
            <span>数値あり {calculableCount}（概算 {approximateCount}）/ 条件一致 {matchingSkills.length}</span>
            {enemyAnnouncement && <span className="comparison-visually-hidden">{enemyAnnouncement}</span>}
          </div>
          <div className="comparison-result-actions">
            <label className="comparison-toggle">
              <input
                type="checkbox"
                checked={showUnavailable}
                onChange={(event) => {
                  setShowUnavailable(event.target.checked)
                  resetResultPage()
                }}
              />
              <span>計算できないスキルも表示</span>
            </label>
            <button type="button" className="button" disabled={displayedRowStates.length === 0} onClick={downloadCsv}>
              CSVをダウンロード（全{displayedRowStates.length}行）
            </button>
          </div>
        </div>

        {displayedRowStates.length === 0 ? (
          <div className="comparison-empty-state" role="status">
            <strong>表示できるスキルがありません</strong>
            <span>検索条件・終了条件を変更するか、計算できないスキルの表示を有効にしてください。</span>
            <button type="button" className="button secondary" onClick={resetAll}>条件をリセット</button>
          </div>
        ) : (
          <div ref={comparisonTableRef} className="comparison-table-wrap" role="region" tabIndex={0} aria-label="比較表のスクロール領域">
            <table className="comparison-table" aria-label={`オペレーターとスキルの${COMPARISON_METRIC_LABELS[metric]}比較`}>
              <thead>
                <tr>
                  <th className="comparison-sticky-column operator-column">オペレーター</th>
                  <th className="comparison-sticky-column skill-column">スキル</th>
                  <th className="damage-type-column">種別</th>
                  {enemyProfiles.map((profile, index) => (
                    <th
                      className="enemy-value-column"
                      aria-sort={sort?.profileId === profile.id
                        ? sort.direction === 'ASC' ? 'ascending' : 'descending'
                        : 'none'}
                      key={profile.id}
                    >
                      <button
                        type="button"
                        className="enemy-sort-button"
                        aria-label={`敵条件${index + 1}の${COMPARISON_METRIC_LABELS[metric]}で並べ替え`}
                        onClick={() => toggleEnemySort(profile.id)}
                      >
                        <span>
                          敵条件 {index + 1}
                          {sort?.profileId === profile.id && <em aria-hidden="true">{sort.direction === 'DESC' ? ' ↓' : ' ↑'}</em>}
                        </span>
                        <small>{getEnemyProfileLabel(profile)}</small>
                      </button>
                    </th>
                  ))}
                  <th className="calculation-state-column">計算状態</th>
                </tr>
              </thead>
              <tbody>
                {renderedRows.map((row) => {
                  const unavailable = row.unavailableReasons.length > 0
                  const approximate = !unavailable && row.warnings.length > 0
                  const unavailableText = row.unavailableReasons.join(' ')
                  const warningText = row.warnings.join(' ')
                  return (
                    <tr className={unavailable ? 'unavailable' : approximate ? 'approximate' : undefined} key={row.skill.id}>
                      <th scope="row" className="comparison-sticky-column operator-column">
                        <strong>{row.skill.operatorName}</strong>
                        <small>★{row.skill.rarity} · {row.skill.professionLabel} / {row.skill.subProfessionName}</small>
                      </th>
                      <td className="comparison-sticky-column skill-column">
                        <strong>S{row.skill.skillIndex}</strong>
                        <span>{row.skill.skillName}</span>
                      </td>
                      <td className="damage-type-column">
                        {row.damageType === null ? '複合' : DAMAGE_TYPE_LABELS[row.damageType]}
                      </td>
                      {row.values.map((value, index) => (
                        <td
                          className={`enemy-value-cell ${value === null ? 'unavailable-value' : ''}`}
                          aria-label={value === null ? '計算不可' : undefined}
                          key={enemyProfiles[index]?.id ?? index}
                        >
                          {value === null ? '—' : formatNumber(value)}
                        </td>
                      ))}
                      <td className="calculation-state-column">
                        {unavailable ? (
                          <span className="comparison-unavailable-reason">
                            <strong>計算不可</strong>
                            <small tabIndex={0} title={unavailableText}>{unavailableText}</small>
                          </span>
                        ) : approximate ? (
                          <span className="comparison-approximate-reason">
                            <strong>概算</strong>
                            <small tabIndex={0} title={warningText}>{warningText}</small>
                          </span>
                        ) : (
                          <span className="comparison-ready">計算可能</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 1 && (
          <div className="comparison-table-footer">
            <button
              type="button"
              className="button secondary"
              disabled={safeResultPage === 0}
              onClick={() => changeResultPage(Math.max(0, safeResultPage - 1))}
            >
              前の{RESULT_BATCH_SIZE}行
            </button>
            <span>{safeResultPage + 1} / {totalPages} ページ</span>
            <button
              type="button"
              className="button secondary"
              disabled={safeResultPage >= totalPages - 1}
              onClick={() => changeResultPage(Math.min(totalPages - 1, safeResultPage + 1))}
            >
              次の{RESULT_BATCH_SIZE}行
            </button>
          </div>
        )}
        <p className="comparison-note">
          ダメージ種別はスキル説明を優先し、明示がない場合は特性と職業から推定します。複合ダメージや現行モデル未対応のスキルは「—」、倍率を特定できない単純モデルは「概算」で示します。
        </p>
      </section>
    </section>
  )
}

function PanelHeading({ number, title, note }: { number: string; title: string; note: string }) {
  return (
    <div className="comparison-panel-heading">
      <div><span>{number}</span><h2>{title}</h2></div>
      <p>{note}</p>
    </div>
  )
}

function buildProfessionOptions(rows: SkillRecord[]): FilterOption[] {
  const order = new Map<string, number>(PROFESSION_ORDER.map((profession, index) => [profession, index]))
  return [...new Map(rows.map((row) => [
    row.profession,
    { value: row.profession, label: row.professionLabel },
  ])).values()].sort((a, b) => (
    (order.get(a.value) ?? PROFESSION_ORDER.length) - (order.get(b.value) ?? PROFESSION_ORDER.length)
    || a.label.localeCompare(b.label, 'ja')
  ))
}

function cloneDefaultEnemyProfiles(): EnemyStatProfile[] {
  return DEFAULT_ENEMY_STAT_PROFILES.map((profile) => ({ ...profile }))
}

function getMetricGuidance(effectWindow: EffectWindowType): string {
  if (effectWindow === 'NONE') return '継続枠がないためDPSは選択できません'
  if (effectWindow === 'PERMANENT' || effectWindow === 'TOGGLE_OR_MODE') {
    return '終了時点を確定できないためスキル総ダメージは選択できません'
  }
  if (effectWindow === 'UNKNOWN') return '終了条件が未確定なため1回攻撃のダメージのみ表示できます'
  return '終了条件に応じた3種類の数値を比較できます'
}

function getUnavailableMetricReason(effectWindow: EffectWindowType, metric: ComparisonMetric): string {
  if (metric === 'DPS' && effectWindow === 'NONE') return '継続枠がないスキルではDPSを算出しません'
  if (metric === 'TOTAL') return '終了時点を確定できないためスキル総ダメージを算出できません'
  return 'この終了条件では選択できません'
}

function formatNumber(value: number): string {
  return COMPARISON_NUMBER_FORMATTER.format(value)
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function getLocalDateStamp(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
