import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { writeClipboardText } from '../lib/clipboard'
import { getDamageSensitivityTablePoints } from '../lib/damageSensitivity'
import {
  buildGoldenglowResistanceDamageRows,
  calculateGoldenglowExpectedDpsFromModel,
  type GoldenglowExplosionDamageResult,
} from '../lib/goldenglowExplosion'

type OutputMetric = 'EXPLOSION_DAMAGE' | 'EXPECTED_DPS' | 'EXPECTED_TOTAL_DAMAGE'

const OUTPUT_OPTIONS: Array<{
  value: OutputMetric
  label: string
}> = [
  { value: 'EXPLOSION_DAMAGE', label: '爆発1回' },
  { value: 'EXPECTED_DPS', label: '期待DPS' },
  { value: 'EXPECTED_TOTAL_DAMAGE', label: '期待総ダメージ' },
]

const numberFormatter = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 })
const clipboardNumberFormatter = new Intl.NumberFormat('en-US', {
  useGrouping: false,
  maximumFractionDigits: 2,
})

export interface GoldenglowDamageTableProps {
  explosion: GoldenglowExplosionDamageResult
  skillIndex: number
  attackInterval: number
  duration: number
  skillLabel: string
}

export function GoldenglowDamageTable({
  explosion,
  skillIndex,
  attackInterval,
  duration,
  skillLabel,
}: GoldenglowDamageTableProps) {
  const headingId = useId()
  const unavailableNoteId = useId()
  const { model } = explosion
  const activeDroneCount = Math.max(1, Math.floor(model.activeDroneCount))
  const focusKey = `${skillIndex}:${activeDroneCount}`
  const [focus, setFocus] = useState({ key: focusKey, count: activeDroneCount })
  const focusedDroneCount = focus.key === focusKey
    ? Math.min(activeDroneCount, Math.max(1, focus.count))
    : activeDroneCount
  const [selectedOutput, setSelectedOutput] = useState<OutputMetric>('EXPLOSION_DAMAGE')
  const [copyFeedback, setCopyFeedback] = useState<{
    state: 'COPIED' | 'FAILED'
    tableText: string
  } | null>(null)
  const copyFeedbackTimerRef = useRef<number | null>(null)
  const totalDamageAvailable = skillIndex !== 2
  const effectiveOutput = selectedOutput === 'EXPECTED_TOTAL_DAMAGE' && !totalDamageAvailable
    ? 'EXPLOSION_DAMAGE'
    : selectedOutput
  const isExplosionOnly = effectiveOutput === 'EXPLOSION_DAMAGE'
  const outputLabel = OUTPUT_OPTIONS.find((option) => option.value === effectiveOutput)?.label
    ?? OUTPUT_OPTIONS[0].label
  const focusedModel = useMemo(() => ({
    ...model,
    activeDroneCount: focusedDroneCount,
  }), [model, focusedDroneCount])
  const resistanceRows = useMemo(() => buildGoldenglowResistanceDamageRows({
    model: focusedModel,
    skillIndex,
    effectiveAttack: explosion.effectiveAttack,
    attackInterval,
    duration,
    enemyResistances: getDamageSensitivityTablePoints('ARTS'),
  }).map((row) => ({
    ...row,
    expectation: calculateGoldenglowExpectedDpsFromModel({
      model: focusedModel,
      skillIndex,
      effectiveAttack: explosion.effectiveAttack,
      attackInterval,
      duration,
      enemyResistance: row.enemyResistance,
    }),
  })), [focusedModel, skillIndex, explosion.effectiveAttack, attackInterval, duration])
  const expectation = resistanceRows[0]?.expectation
  const bodyLabel = skillIndex === 3 ? '本体（攻撃停止）' : '本体'
  const tableHeaders = isExplosionOnly
    ? ['術耐性', '爆発1回のダメージ']
    : [
      '術耐性',
      `${bodyLabel} ${outputLabel}`,
      `浮遊通常攻撃 ${outputLabel}`,
      `爆発のみ ${outputLabel}`,
      `爆発込み合計 ${outputLabel}`,
    ]
  const outputRows = resistanceRows.map((row) => ({
    enemyResistance: row.enemyResistance,
    minimumReached: isExplosionOnly && row.minimumReached,
    values: isExplosionOnly
      ? [row.explosionDamage]
      : effectiveOutput === 'EXPECTED_DPS'
        ? [
          row.expectation?.body.dps ?? null,
          row.expectation?.allDrones.normalDps ?? null,
          row.expectation?.allDrones.explosionDps ?? null,
          row.expectedDps,
        ]
        : [
          row.expectation?.body.expectedTotalDamage ?? null,
          row.expectation?.allDrones.expectedNormalDamage ?? null,
          row.expectation?.allDrones.expectedExplosionDamage ?? null,
          row.expectedTotalDamage,
        ],
  }))
  const hasMinimumDamageResults = outputRows.some((row) => row.minimumReached)
  const tableText = [
    tableHeaders,
    ...outputRows.map((row) => [
      clipboardNumberFormatter.format(row.enemyResistance),
      ...row.values.map((value) => value === null ? '' : clipboardNumberFormatter.format(value)),
    ]),
  ].map((row) => row.join('\t')).join('\r\n')
  const copyState = copyFeedback?.tableText === tableText ? copyFeedback.state : 'IDLE'
  const copyLabel = copyState === 'COPIED'
    ? 'コピー済み'
    : copyState === 'FAILED' ? 'コピー失敗' : '表をコピー'
  const copyAnnouncement = copyState === 'COPIED'
    ? `ゴールデングローの${outputLabel}表をコピーしました。`
    : copyState === 'FAILED' ? `ゴールデングローの${outputLabel}表をコピーできませんでした。` : ''

  useEffect(() => {
    setFocus({ key: focusKey, count: activeDroneCount })
  }, [focusKey, activeDroneCount])

  useEffect(() => {
    if (!totalDamageAvailable && selectedOutput === 'EXPECTED_TOTAL_DAMAGE') {
      setSelectedOutput('EXPLOSION_DAMAGE')
    }
  }, [selectedOutput, totalDamageAvailable])

  useEffect(() => {
    setCopyFeedback(null)
    return () => {
      if (copyFeedbackTimerRef.current !== null) {
        window.clearTimeout(copyFeedbackTimerRef.current)
        copyFeedbackTimerRef.current = null
      }
    }
  }, [tableText])

  const copyOutputTable = async () => {
    let nextState: 'COPIED' | 'FAILED' = 'COPIED'
    try {
      await writeClipboardText(tableText)
    } catch {
      nextState = 'FAILED'
    }

    setCopyFeedback({ state: nextState, tableText })
    if (copyFeedbackTimerRef.current !== null) {
      window.clearTimeout(copyFeedbackTimerRef.current)
    }
    copyFeedbackTimerRef.current = window.setTimeout(() => {
      setCopyFeedback(null)
      copyFeedbackTimerRef.current = null
    }, 2500)
  }

  return (
    <section className="goldenglow-output" aria-labelledby={headingId} aria-live="off">
      <div className="goldenglow-output-heading">
        <h3 id={headingId}>爆発ダメージ・術耐性別</h3>
        <p>
          {skillLabel} · 爆発倍率{numberFormatter.format(model.attackScalePercent)}%
          {' '}· 術耐性固定無視{numberFormatter.format(model.resistanceIgnoreFixed)}
        </p>
      </div>
      <div className="sensitivity-control goldenglow-output-control">
        <span>出力を選択</span>
        <div
          className="sensitivity-metric-switch"
          role="group"
          aria-label="爆発ダメージテーブルの出力"
          aria-describedby={!totalDamageAvailable ? unavailableNoteId : undefined}
        >
          {OUTPUT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={effectiveOutput === option.value ? 'active' : ''}
              aria-pressed={effectiveOutput === option.value}
              disabled={option.value === 'EXPECTED_TOTAL_DAMAGE' && !totalDamageAvailable}
              onClick={() => setSelectedOutput(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {!totalDamageAvailable && (
        <p id={unavailableNoteId} className="goldenglow-output-unavailable-note">
          S2は永続スキルのため、期待DPSは長時間の平均値を使い、期待総ダメージは算出しません。
        </p>
      )}
      {!isExplosionOnly && (
        <div className="sensitivity-control goldenglow-output-control">
          <span>同じ敵を攻撃する浮遊ユニット</span>
          <div
            className="sensitivity-metric-switch"
            style={{ gridTemplateColumns: `repeat(${activeDroneCount}, minmax(0, 1fr))` }}
            role="group"
            aria-label="同一対象への浮遊ユニット数"
          >
            {Array.from({ length: activeDroneCount }, (_, index) => index + 1).map((count) => (
              <button
                key={count}
                type="button"
                className={focusedDroneCount === count ? 'active' : ''}
                aria-pressed={focusedDroneCount === count}
                onClick={() => setFocus({ key: focusKey, count })}
              >
                {count}体{count === activeDroneCount ? '（全機）' : ''}
              </button>
            ))}
          </div>
          {expectation && (
            <p className="goldenglow-note">
              浮遊{focusedDroneCount}体の期待爆発
              {expectation.allDrones.expectedExplosionCount === null
                ? ` ${numberFormatter.format(expectation.expectedExplosionsPerSecondPerDrone * focusedDroneCount)}回/秒`
                : ` ${numberFormatter.format(expectation.allDrones.expectedExplosionCount)}回 / ${numberFormatter.format(duration)}秒`}
              {expectation.theoreticalAttackCount !== null
                && ` · 1体あたりの攻撃機会 ${numberFormatter.format(expectation.theoreticalAttackCount)}回`}
            </p>
          )}
        </div>
      )}
      {hasMinimumDamageResults && (
        <div className="sensitivity-table-meta-row goldenglow-table-meta-row">
          <span className="minimum-damage-legend"><span aria-hidden="true">※</span>術ダメージ最低保証</span>
        </div>
      )}
      <div className="goldenglow-copyable-table">
        <div
          className="goldenglow-table-wrap"
          role="region"
          aria-label={`術耐性別の${outputLabel}`}
          tabIndex={0}
        >
          <table
            className={`goldenglow-output-table${isExplosionOnly ? '' : ' goldenglow-s3-table'}`}
            aria-labelledby={headingId}
          >
            <caption className="visually-hidden">
              {skillLabel}の{outputLabel}
              {!isExplosionOnly && `、同一対象への浮遊${focusedDroneCount}体`}
            </caption>
            <thead>
              <tr>{tableHeaders.map((header) => <th key={header} scope="col">{header}</th>)}</tr>
            </thead>
            <tbody>
              {outputRows.map((row) => (
                <tr key={row.enemyResistance}>
                  <th scope="row">{numberFormatter.format(row.enemyResistance)}%</th>
                  {row.values.map((value, index) => (
                    <td
                      key={tableHeaders[index + 1]}
                      className={row.minimumReached ? 'minimum-damage-cell' : undefined}
                      aria-label={row.minimumReached && value !== null
                        ? `${numberFormatter.format(value)}、術ダメージ最低保証`
                        : undefined}
                    >
                      {value === null ? '—' : numberFormatter.format(value)}
                      {row.minimumReached && <span className="minimum-damage-mark" aria-hidden="true">※</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          className={[
            'goldenglow-table-copy-button',
            copyState !== 'IDLE' ? 'is-visible' : '',
            copyState === 'COPIED' ? 'is-copied' : '',
            copyState === 'FAILED' ? 'is-failed' : '',
          ].filter(Boolean).join(' ')}
          aria-label={`ゴールデングローの${outputLabel}表をコピー`}
          title={copyLabel}
          onClick={() => void copyOutputTable()}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
            {copyState === 'COPIED'
              ? <path d="m5 12 4 4L19 6" />
              : copyState === 'FAILED'
                ? <path d="m7 7 10 10M17 7 7 17" />
                : (
                  <>
                    <rect x="8" y="8" width="11" height="11" rx="1.5" />
                    <path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" />
                  </>
                )}
          </svg>
        </button>
        <span className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
          {copyAnnouncement}
        </span>
      </div>
      <p className="goldenglow-note">
        入力術耐性から固定無視を差し引き、術ダメージの5%最低保証を適用します。爆発1回は浮遊ユニット1体分です。
        期待値の合計は本体・選択した浮遊の通常攻撃・爆発を含み、S3の本体攻撃は0です。
      </p>
      {!isExplosionOnly && (
        <p className="goldenglow-note">
          同じ単体を継続して攻撃する理論期待値です。爆発は通常攻撃との置き換えで集計し、浮遊の倍率上昇と爆発後のリセットを反映します。
          攻撃位相を平均し、帰還・再索敵時間は0として計算します。範囲巻き込みと足止めはダメージに含めません。
        </p>
      )}
    </section>
  )
}
