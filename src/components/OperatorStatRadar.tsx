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

export function OperatorStatRadar({ operator, operators }: Props) {
  const [scope, setScope] = useState<OperatorRadarScope>('ALL')
  const titleId = useId()
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
    <div className="operator-stat-radar">
      <div className="operator-stat-radar-header">
        <div>
          <h4>ステータス傾向</h4>
          <p>比較対象内での順位を0〜100の相対スコアに変換しています。</p>
        </div>
        <div className="operator-stat-radar-scope" role="group" aria-label="レーダーの比較範囲">
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
      </div>

      <p className="operator-stat-radar-summary" aria-live="polite">
        {scopeLabel}の{profile.populationCount}名を基準に表示
      </p>

      <div className="operator-stat-radar-layout">
        <div className="operator-stat-radar-chart-wrap">
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
        </div>

        <dl className="operator-stat-radar-values" aria-label="実数値と相対スコア">
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
        </dl>
      </div>

      {hasSingleObservation && (
        <p className="operator-stat-radar-caution">
          有効データが1名だけの軸は、相対差を算定できないため50で表示します。
        </p>
      )}
      {!completeProfile && (
        <p className="operator-stat-radar-caution">
          データがない軸は図形を結ばず、一覧に「データなし」と表示します。
        </p>
      )}
      <p className="operator-stat-radar-note">
        外側ほど比較対象内で相対的に高い位置です。これはステータス傾向であり、総合的な強さを示すものではありません。
      </p>
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
