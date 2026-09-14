import { useId, useMemo, useState } from 'react'
import {
  buildOperatorRadarProfile,
  type OperatorRadarPoint,
  type OperatorRadarProfile,
  type OperatorRadarScope,
} from '../lib/operatorStatistics'
import type { OperatorDatabaseRecord } from '../lib/operatorDatabase'

interface Props {
  operator: OperatorDatabaseRecord
  operators: ReadonlyArray<OperatorDatabaseRecord>
  compact?: boolean
}

interface RadarCoordinate {
  x: number
  y: number
}

const SCOPE_OPTIONS: ReadonlyArray<{ value: OperatorRadarScope; label: string }> = [
  { value: 'ALL', label: '全体' },
  { value: 'PROFESSION', label: '同職業' },
  { value: 'SUB_PROFESSION', label: '同職分' },
]

const VIEWBOX_WIDTH = 480
const VIEWBOX_HEIGHT = 430
const CENTER_X = 240
const CENTER_Y = 210
const CHART_RADIUS = 132
const LABEL_RADIUS = 174
const GRID_LEVELS = [25, 50, 75, 100] as const
const SCORE_FORMATTER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 })

export function OperatorStatRadar({ operator, operators, compact = false }: Props) {
  const [scope, setScope] = useState<OperatorRadarScope>('ALL')
  const [chartType, setChartType] = useState<'radar' | 'bars'>('radar')
  const showBars = compact && chartType === 'bars'
  const titleId = useId()
  const chartId = `${titleId}-chart`
  const descriptionId = useId()
  const profiles = useMemo<Record<OperatorRadarScope, OperatorRadarProfile>>(() => ({
    ALL: buildOperatorRadarProfile(operators, operator, 'ALL'),
    PROFESSION: buildOperatorRadarProfile(operators, operator, 'PROFESSION'),
    SUB_PROFESSION: buildOperatorRadarProfile(operators, operator, 'SUB_PROFESSION'),
  }), [operator, operators])
  const profile = profiles[scope]
  const scopeLabel = getScopeLabel(scope, operator)
  const coordinates = profile.points.map((point, index) => (
    point.score === null ? null : getRadarCoordinate(index, profile.points.length, point.score)
  ))
  const completeProfile = coordinates.every((coordinate): coordinate is RadarCoordinate => coordinate !== null)
  const hasSingleObservation = profile.points.some(({ score, validCount }) => (
    score !== null && validCount === 1
  ))

  return (
    <div className={`operator-stat-radar${compact ? ' operator-stat-radar-compact' : ''}`}>
      <div className="operator-stat-radar-header">
        {!compact && <div>
          <h4>ステータス傾向</h4>
          <p>比較対象内での順位を0〜100の相対スコアに変換しています。</p>
        </div>}
        <div className="operator-stat-radar-scope" role="group" aria-label="ステータスの比較範囲">
          {SCOPE_OPTIONS.map((option) => {
            const count = profiles[option.value].populationCount
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={scope === option.value}
                aria-label={`${option.label}、${count}名と比較`}
                onClick={() => setScope(option.value)}
              >
                <strong>{option.label}</strong>
                <span>{count}名</span>
              </button>
            )
          })}
        </div>
        {compact && <div className="operator-profile-chart-types" role="group" aria-label="グラフの表示方法">
          {([['radar', 'レーダー'], ['bars', '横棒']] as const).map(([value, label]) => (
            <button type="button" key={value} aria-pressed={chartType === value}
              aria-controls={chartId} onClick={() => setChartType(value)}>{label}</button>
          ))}
        </div>}
      </div>

      <p className="operator-stat-radar-summary" aria-live="polite">
        {scopeLabel}の{profile.populationCount}名を基準に表示
      </p>

      <div className={`operator-stat-radar-layout${showBars ? ' is-bars' : ''}`}>
        <div className="operator-stat-radar-chart-wrap" id={chartId}>
          {showBars ? <div className="operator-profile-stat-bars" role="group" aria-label={`${operator.name}の相対スコア横棒グラフ`}>
            <div className="operator-profile-stat-bar-axis" aria-hidden="true">
              <span /><span><span>0</span><span>50</span><span>100</span></span><span />
            </div>
            {profile.points.map((point) => (
              <div className="operator-profile-stat-bar" key={point.key} role="group" aria-label={formatPointDescription(point)}>
                <span>{point.label}</span>
                <span className="operator-profile-stat-bar-track" aria-hidden="true">
                  {point.score !== null && <span style={{ width: `${point.score}%` }} />}
                </span>
                <span>{point.score === null ? '—' : SCORE_FORMATTER.format(point.score)}</span>
              </div>
            ))}
          </div> : <>
          <svg
            className="operator-stat-radar-svg"
            viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
            role="img"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
          >
            <title id={titleId}>{operator.name}のステータスレーダー</title>
            <desc id={descriptionId}>
              {scopeLabel}を比較対象として順位を0から100に正規化した相対ステータスです。
              配置コスト、再配置時間、攻撃間隔は低いほど外側です。総合的な強さを示すものではありません。
            </desc>

            <g className="operator-stat-radar-grid" aria-hidden="true">
              {GRID_LEVELS.map((level) => (
                <polygon
                  key={level}
                  points={buildPolygonPoints(profile.points.length, level)}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {profile.points.map((point, index) => {
                const edge = getRadarCoordinate(index, profile.points.length, 100)
                return (
                  <line
                    key={point.key}
                    x1={CENTER_X}
                    y1={CENTER_Y}
                    x2={edge.x}
                    y2={edge.y}
                    vectorEffect="non-scaling-stroke"
                  />
                )
              })}
              {GRID_LEVELS.map((level) => {
                const y = CENTER_Y - CHART_RADIUS * (level / 100)
                return <text key={level} x={CENTER_X + 5} y={y + 10}>{level}</text>
              })}
            </g>

            {completeProfile ? (
              <polygon
                className="operator-stat-radar-shape"
                points={coordinates.map(({ x, y }) => `${x},${y}`).join(' ')}
                vectorEffect="non-scaling-stroke"
              />
            ) : (
              <g className="operator-stat-radar-partial-shape">
                {coordinates.map((coordinate, index) => {
                  const next = coordinates[(index + 1) % coordinates.length]
                  if (!coordinate || !next) return null
                  return (
                    <line
                      key={profile.points[index].key}
                      x1={coordinate.x}
                      y1={coordinate.y}
                      x2={next.x}
                      y2={next.y}
                      vectorEffect="non-scaling-stroke"
                    />
                  )
                })}
              </g>
            )}

            <g className="operator-stat-radar-points">
              {coordinates.map((coordinate, index) => {
                if (!coordinate) return null
                const point = profile.points[index]
                return (
                  <circle key={point.key} cx={coordinate.x} cy={coordinate.y} r="4">
                    <title>{formatPointDescription(point)}</title>
                  </circle>
                )
              })}
            </g>

            <g className="operator-stat-radar-labels" aria-hidden="true">
              {profile.points.map((point, index) => {
                const position = getRadarCoordinate(index, profile.points.length, LABEL_RADIUS / CHART_RADIUS * 100)
                return (
                  <text
                    key={point.key}
                    x={position.x}
                    y={position.y}
                    textAnchor={getTextAnchor(position.x)}
                    dominantBaseline="middle"
                  >
                    {getShortLabel(point)}
                  </text>
                )
              })}
            </g>
          </svg>
          <div className="operator-stat-radar-legend" aria-hidden="true">
            <span />
            <strong>相対スコア</strong>
          </div>
          </>}
        </div>

        {compact ? <div className="operator-profile-radar-breakdown">
          <table className="operator-profile-table" aria-label="実数値と相対スコア">
            <thead><tr><th scope="col">項目</th><th scope="col">実数値</th><th scope="col">相対 / 100</th></tr></thead>
            <tbody>{profile.points.map((point) => (
              <tr key={point.key}>
                <th scope="row">{point.label}</th>
                <td>{formatRadarValue(point)}</td>
                <td>{point.score === null ? 'データなし' : SCORE_FORMATTER.format(point.score)}</td>
              </tr>
            ))}</tbody>
          </table>
          <p className="operator-profile-radar-valid-counts">有効データ：{profile.points.every((point) => point.validCount === profile.points[0]?.validCount)
            ? `各項目${profile.points[0]?.validCount ?? 0}名`
            : profile.points.map((point) => `${point.label} ${point.validCount}名`).join(' / ')}</p>
        </div> : <dl className="operator-stat-radar-values" aria-label="実数値と相対スコア">
          {profile.points.map((point) => (
            <div key={point.key}>
              <dt>
                <span>{point.label}</span>
                {point.direction === 'LOWER_OUTWARD' && <small>低いほど外側</small>}
              </dt>
              <dd>
                <strong>{formatRadarValue(point)}</strong>
                <span>{point.score === null ? 'データなし' : `相対 ${SCORE_FORMATTER.format(point.score)} / 100`}</span>
                <small>有効データ {point.validCount}名</small>
              </dd>
            </div>
          ))}
        </dl>}
      </div>

      {hasSingleObservation && (
        <p className="operator-stat-radar-caution">
          有効データが1名だけの軸は、相対差を算定できないため50で表示します。
        </p>
      )}
      {!completeProfile && (
        <p className="operator-stat-radar-caution">
          {showBars ? 'データがない項目は棒を描かず、数値表に「データなし」と表示します。' : 'データがない軸は図形を結ばず、一覧に「データなし」と表示します。'}
        </p>
      )}
      {!compact && <p className="operator-stat-radar-note">
        外側ほど比較対象内で相対的に高い位置です。これはステータス傾向であり、総合的な強さを示すものではありません。
      </p>}
    </div>
  )
}

function getRadarCoordinate(index: number, pointCount: number, score: number): RadarCoordinate {
  const angle = -Math.PI / 2 + index * Math.PI * 2 / pointCount
  const radius = CHART_RADIUS * score / 100
  return {
    x: CENTER_X + Math.cos(angle) * radius,
    y: CENTER_Y + Math.sin(angle) * radius,
  }
}

function buildPolygonPoints(pointCount: number, level: number): string {
  return Array.from({ length: pointCount }, (_, index) => {
    const { x, y } = getRadarCoordinate(index, pointCount, level)
    return `${x},${y}`
  }).join(' ')
}

function getScopeLabel(scope: OperatorRadarScope, operator: OperatorDatabaseRecord): string {
  if (scope === 'ALL') return '全オペレーター'
  if (scope === 'PROFESSION') return `同職業「${operator.professionLabel}」`
  return `同職分「${operator.professionLabel} / ${operator.subProfessionName}」`
}

function getTextAnchor(x: number): 'start' | 'middle' | 'end' {
  if (Math.abs(x - CENTER_X) < 8) return 'middle'
  return x > CENTER_X ? 'start' : 'end'
}

function getShortLabel(point: OperatorRadarPoint): string {
  if (point.key === 'redeployTime') return '再配置'
  return point.label
}

function formatRadarValue(point: OperatorRadarPoint): string {
  if (point.value === null || !Number.isFinite(point.value)) return '—'
  const formatter = new Intl.NumberFormat('ja-JP', {
    maximumFractionDigits: point.valueDigits,
  })
  return `${formatter.format(point.value)}${point.suffix}`
}

function formatPointDescription(point: OperatorRadarPoint): string {
  if (point.score === null) return `${point.label}：データなし`
  return `${point.label}：${formatRadarValue(point)}、相対スコア${SCORE_FORMATTER.format(point.score)}、有効データ${point.validCount}名`
}
