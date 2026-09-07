import { useEffect, useMemo, useState } from 'react'
import { calculateDamageBreakdown } from '../lib/damageCalculator'
import { buildGoldenglowFirstExplosionDistribution } from '../lib/goldenglowExplosion'
import { deriveGoldenglowGuideSkills, type GoldenglowGuideSkill } from '../lib/goldenglowGuideSkill'
import { buildGoldenglowSkillAttackTable } from '../lib/goldenglowSkillAttackTable'
import { buildGoldenglowAttackProbabilityDetail } from '../lib/goldenglowAttackProbability'
import type { SkillRecord } from '../types/skill'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { GoldenglowAttackProbabilityModal } from './GoldenglowAttackProbabilityModal'
import { GoldenglowExplosionDamageModal } from './GoldenglowExplosionDamageModal'
import { GoldenglowAttackDetailModal } from './GoldenglowAttackDetailModal'
import { GoldenglowFirstExplosionModal } from './GoldenglowFirstExplosionModal'
import { GoldenglowExpectationDetailModal } from './GoldenglowExpectationDetailModal'
import { GoldenglowExpectationMeaningModal } from './GoldenglowExpectationMeaningModal'
import { GoldenglowNormalAttackPanel } from './GoldenglowNormalAttackPanel'
import { GoldenglowCombinedAttackPanel } from './GoldenglowCombinedAttackPanel'
import './DamageCalculator.css'
import './GoldenglowGuidePage.css'

const format = (value: number) => new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 }).format(value)
const probabilityFormat = new Intl.NumberFormat('ja-JP', { maximumSignificantDigits: 4 })
const formatProbability = (probability: number) => `${probabilityFormat.format(probability * 100)}%`
const explosionDistribution = buildGoldenglowFirstExplosionDistribution({ prdStep: 0.015, prdMaxStack: 40 })
const expectationRows = explosionDistribution.map((row) => ({
  ...row,
  contribution: row.attackNumber * row.firstExplosionProbability,
}))
const meanAttacksPerExplosion = expectationRows.reduce((sum, row) => sum + row.contribution, 0)

export function GoldenglowGuidePage({ rows, loading, error, onRetry }: {
  rows: readonly SkillRecord[]
  loading: boolean
  error: string | null
  onRetry: () => void
}) {
  const skills = useMemo(() => deriveGoldenglowGuideSkills(rows), [rows])
  const [skillIndex, setSkillIndex] = useState(3)
  const skill = skills.find((item) => item.skillIndex === skillIndex) ?? skills[0] ?? null
  const [attackOverride, setAttackOverride] = useState<number | null>(null)
  const attack = attackOverride ?? skill?.effectiveAttack ?? 391
  const [explosionScale, setExplosionScale] = useState(300)
  const [resistance, setResistance] = useState(0)
  const [resistanceIgnore, setResistanceIgnore] = useState(15)
  const [viewingDuration, setViewingDuration] = useState(30)
  const [open, setOpen] = useState(true)
  const [singleDetail, setSingleDetail] = useState<'attack' | 'damage' | null>(null)
  const rawDamage = attack * explosionScale / 100
  const damage = calculateDamageBreakdown(rawDamage, 'ARTS', 0, resistance, {
    resistanceIgnoreFixed: resistanceIgnore,
  })

  return (
    <section className="calculator-page gg-reference-page" aria-labelledby="gg-reference-title">
      <header className="page-intro">
        <div>
          <span className="page-kicker">CALCULATION REFERENCE</span>
          <h1 id="gg-reference-title">Goldenglow Talent Analysis</h1>
        </div>
        <a className="gg-reference-link" href="#/damage">ダメージ計算へ →</a>
      </header>
      <div className="gg-skill-selection">
        {loading ? <p role="status">スキル情報を読み込み中…</p> : skill ? (
          <>
            <div className="skill-choice-group" role="group" aria-label="スキル">
              {skills.map((item) => (
                <button
                  key={item.skillIndex}
                  type="button"
                  className={item.skillIndex === skill.skillIndex ? 'active' : ''}
                  aria-pressed={item.skillIndex === skill.skillIndex}
                  aria-label={`S${item.skillIndex} ${item.skillName}`}
                  onClick={() => {
                    setSkillIndex(item.skillIndex)
                    setAttackOverride(null)
                  }}
                >
                  <span>S{item.skillIndex}</span><strong>{item.skillName}</strong>
                </button>
              ))}
            </div>
            <p>{skill.skillLevelLabel}・昇進2最大レベル・信頼100・潜在1・モジュールなし</p>
          </>
        ) : (
          <div className="gg-skill-load-error" role="alert">
            <p>{error ?? 'ゴールデングローのスキル情報を取得できませんでした。'}</p>
            <button type="button" className="button secondary" onClick={onRetry}>再読み込み</button>
          </div>
        )}
      </div>
      <CollapsibleCalculatorPanel
        id="gg-single-explosion"
        number="01"
        title="単発の爆発ダメージ"
        summary="術ダメージ・敵1体・爆発1回"
        open={open}
        onToggle={() => setOpen((value) => !value)}
        collapsedLabel="テーブルを表示"
      >
        <h3 className="gg-table-title" id="gg-explosion-conditions-title">数値条件</h3>
        <div className="gg-probability-table-wrap gg-value-table-wrap">
          <table className="gg-probability-table gg-value-table" aria-labelledby="gg-explosion-conditions-title">
            <tbody>
              <tr
                className={skill ? 'gg-detail-row' : undefined}
                onClick={(event) => {
                  if (!skill || (event.target instanceof Element && event.target.closest('input, label'))) return
                  event.currentTarget.querySelector('button')?.focus({ preventScroll: true })
                  setSingleDetail('attack')
                }}
              >
                <th scope="row">
                  <button type="button" className="gg-detail-trigger" aria-label="攻撃力の計算詳細" aria-haspopup="dialog" disabled={!skill}>
                    攻撃力{skill && <span aria-hidden="true">›</span>}
                  </button>
                </th>
                <td><ExplosionInput label="攻撃力" value={attack} max={1_000_000} onChange={setAttackOverride} /></td>
              </tr>
              <tr>
                <th scope="row">爆発倍率</th>
                <td><ExplosionInput label="爆発倍率" value={explosionScale} max={10_000} suffix="%" onChange={setExplosionScale} /></td>
              </tr>
              <tr>
                <th scope="row">敵の術耐性</th>
                <td><ExplosionInput label="敵の術耐性" value={resistance} max={100} onChange={setResistance} /></td>
              </tr>
              <tr>
                <th scope="row">術耐性無視</th>
                <td><ExplosionInput label="術耐性無視" value={resistanceIgnore} max={100} onChange={setResistanceIgnore} /></td>
              </tr>
            </tbody>
          </table>
        </div>
        <h3 className="gg-table-title" id="gg-explosion-result-title">ダメージ結果</h3>
        <div className="gg-probability-table-wrap gg-value-table-wrap gg-explosion-result-table-wrap">
          <table className="gg-probability-table gg-value-table" aria-labelledby="gg-explosion-result-title">
            <tbody>
              <tr
                className="gg-detail-row"
                onClick={(event) => {
                  event.currentTarget.querySelector('button')?.focus({ preventScroll: true })
                  setSingleDetail('damage')
                }}
              >
                <th scope="row">
                  <button
                    type="button"
                    className="gg-detail-trigger"
                    aria-label="単発爆発ダメージの詳細"
                    aria-haspopup="dialog"
                  >
                    単発爆発ダメージ<span aria-hidden="true">›</span>
                  </button>
                </th>
                <td><span role="status" aria-live="polite" aria-atomic="true">{format(damage.result)}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </CollapsibleCalculatorPanel>
      {singleDetail === 'attack' && skill && (
        <GoldenglowAttackDetailModal skill={skill} attackOverride={attackOverride} onClose={() => setSingleDetail(null)} />
      )}
      {singleDetail === 'damage' && (
        <GoldenglowExplosionDamageModal
          attack={attack}
          explosionScale={explosionScale}
          resistance={resistance}
          resistanceIgnore={resistanceIgnore}
          damage={damage}
          onClose={() => setSingleDetail(null)}
        />
      )}
      <FirstExplosionPanel />
      <ExplosionExpectationPanel />
      <SkillAttackPanel
        skill={skill}
        explosionDamage={damage.result}
        viewingDuration={viewingDuration}
        onViewingDurationChange={setViewingDuration}
        loading={loading}
      />
      <GoldenglowNormalAttackPanel
        skill={skill}
        attack={attack}
        resistance={resistance}
        resistanceIgnore={resistanceIgnore}
        viewingDuration={viewingDuration}
        onViewingDurationChange={setViewingDuration}
        loading={loading}
      />
      <GoldenglowCombinedAttackPanel
        skill={skill}
        attack={attack}
        explosionDamage={damage.result}
        resistance={resistance}
        resistanceIgnore={resistanceIgnore}
        viewingDuration={viewingDuration}
        onViewingDurationChange={setViewingDuration}
        loading={loading}
      />
    </section>
  )
}

function FirstExplosionPanel() {
  const [open, setOpen] = useState(true)
  const [attackNumber, setAttackNumber] = useState(2)
  const [detailOpen, setDetailOpen] = useState(false)
  const row = explosionDistribution[attackNumber - 1]
  const lastAttack = explosionDistribution.length
  const probabilityRows = [
    { label: '不発が続いた場合の爆発確率', value: row.explosionChancePercent / 100 },
    { label: 'それまで爆発しない確率', value: row.reachProbability },
    { label: 'その回で初めて爆発する確率', value: row.firstExplosionProbability },
  ]

  return (
    <CollapsibleCalculatorPanel
      id="gg-first-explosion"
      number="02"
      title="何回目の攻撃で爆発するか"
      summary="浮遊ユニット1体・初回爆発まで"
      open={open}
      onToggle={() => setOpen((value) => !value)}
      collapsedLabel="テーブルを表示"
    >
      <label className="gg-first-explosion-slider">
        <span className="gg-first-explosion-slider-heading">攻撃回数<strong>{attackNumber}回目</strong></span>
        <input
          type="range"
          min={1}
          max={lastAttack}
          step={1}
          value={attackNumber}
          aria-label="初回爆発までの攻撃回数"
          aria-valuetext={`${attackNumber}回目${attackNumber === lastAttack ? '（それまで不発なら確定爆発）' : ''}`}
          onChange={(event) => setAttackNumber(event.target.valueAsNumber)}
        />
        <span className="gg-first-explosion-slider-ends" aria-hidden="true"><span>1回目</span><span>{lastAttack}回目</span></span>
      </label>
      <h3 className="gg-table-title" id="gg-first-explosion-results-title">確率結果</h3>
      <div className="gg-probability-table-wrap gg-value-table-wrap gg-first-explosion-results">
        <table className="gg-probability-table gg-value-table" aria-labelledby="gg-first-explosion-results-title">
          <tbody>
            {probabilityRows.map((item) => (
              <tr
                key={item.label}
                className="gg-detail-row"
                onClick={(event) => {
                  event.currentTarget.querySelector('button')?.focus({ preventScroll: true })
                  setDetailOpen(true)
                }}
              >
                <th scope="row">
                  <button type="button" className="gg-detail-trigger" aria-label={`${item.label}の詳細`} aria-haspopup="dialog">
                    {item.label}<span aria-hidden="true">›</span>
                  </button>
                </th>
                <td><span aria-live="polite" aria-atomic="true">{formatProbability(item.value)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {detailOpen && <GoldenglowFirstExplosionModal rows={explosionDistribution} attackNumber={attackNumber} onClose={() => setDetailOpen(false)} />}
    </CollapsibleCalculatorPanel>
  )
}

function ExplosionExpectationPanel() {
  const [open, setOpen] = useState(true)
  const [selectedDetail, setSelectedDetail] = useState<number | 'mean' | 'meaning' | null>(null)

  return (
    <CollapsibleCalculatorPanel
      id="gg-explosion-expectation"
      number="03"
      title="期待値計算"
      summary="浮遊ユニット1体・次の爆発まで"
      open={open}
      onToggle={() => setOpen((value) => !value)}
      collapsedLabel="テーブルを表示"
    >
      <h3 className="gg-table-title" id="gg-expectation-breakdown-title">攻撃回数ごとの計算</h3>
      <div className="gg-probability-table-wrap gg-expectation-table-wrap" tabIndex={0} role="region" aria-label="平均攻撃回数の計算内訳">
        <table className="gg-probability-table gg-expectation-table" aria-labelledby="gg-expectation-breakdown-title">
          <thead>
            <tr>
              <th scope="col">攻撃回数</th>
              <th scope="col">その回で初めて<br />爆発する確率</th>
              <th scope="col">
                <button
                  type="button"
                  className="gg-detail-trigger"
                  aria-label="攻撃回数 × 確率の意味"
                  aria-haspopup="dialog"
                  onClick={() => setSelectedDetail('meaning')}
                >
                  攻撃回数 × 確率<span aria-hidden="true">›</span>
                </button>
                <br />（概数）
              </th>
            </tr>
          </thead>
          <tbody>
            {expectationRows.map((row) => (
              <tr
                key={row.attackNumber}
                className="gg-detail-row"
                onClick={(event) => {
                  event.currentTarget.querySelector('button')?.focus({ preventScroll: true })
                  setSelectedDetail(row.attackNumber)
                }}
              >
                <th scope="row">
                  <button type="button" className="gg-detail-trigger" aria-label={`${row.attackNumber}回目の期待値への寄与`} aria-haspopup="dialog">
                    {row.attackNumber}回目<span aria-hidden="true">›</span>
                  </button>
                </th>
                <td>{formatProbability(row.firstExplosionProbability)}</td>
                <td>{probabilityFormat.format(row.contribution)}回</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 className="gg-table-title" id="gg-expectation-result-title">計算結果</h3>
      <div className="gg-probability-table-wrap gg-value-table-wrap gg-expectation-result-table-wrap">
        <table className="gg-probability-table gg-value-table" aria-labelledby="gg-expectation-result-title">
          <tbody>
            <tr
              className="gg-detail-row"
              onClick={(event) => {
                event.currentTarget.querySelector('button')?.focus({ preventScroll: true })
                setSelectedDetail('mean')
              }}
            >
              <th scope="row">
                <button type="button" className="gg-detail-trigger" aria-label="平均攻撃回数の計算詳細" aria-haspopup="dialog">
                  爆発までの平均攻撃回数<span aria-hidden="true">›</span>
                </button>
              </th>
              <td>約{format(meanAttacksPerExplosion)}回</td>
            </tr>
          </tbody>
        </table>
      </div>
      {selectedDetail === 'meaning' && <GoldenglowExpectationMeaningModal
        example={expectationRows[2]}
        meanAttacks={meanAttacksPerExplosion}
        onClose={() => setSelectedDetail(null)}
      />}
      {selectedDetail !== null && selectedDetail !== 'meaning' && <GoldenglowExpectationDetailModal
        rows={expectationRows}
        meanAttacks={meanAttacksPerExplosion}
        attackNumber={selectedDetail === 'mean' ? null : selectedDetail}
        onClose={() => setSelectedDetail(null)}
      />}
    </CollapsibleCalculatorPanel>
  )
}

function SkillAttackPanel({ skill, explosionDamage, viewingDuration, onViewingDurationChange, loading }: {
  skill: GoldenglowGuideSkill | null
  explosionDamage: number
  viewingDuration: number
  onViewingDurationChange: (duration: number) => void
  loading: boolean
}) {
  const [open, setOpen] = useState(true)
  const [selectedAttackNumber, setSelectedAttackNumber] = useState<number | null>(null)
  const duration = skill?.duration ?? viewingDuration
  const attackRows = useMemo(() => skill ? buildGoldenglowSkillAttackTable({
    model: skill.explosionModel,
    attackInterval: skill.attackInterval,
    duration,
    explosionDamage,
  }) : [], [skill, duration, explosionDamage])
  const lastRow = attackRows.at(-1)
  const selectedDetail = useMemo(() => skill && selectedAttackNumber !== null
    ? buildGoldenglowAttackProbabilityDetail(skill.explosionModel, selectedAttackNumber)
    : null, [skill, selectedAttackNumber])

  useEffect(() => setSelectedAttackNumber(null), [skill?.skillIndex, duration])

  return (
    <CollapsibleCalculatorPanel
      id="gg-skill-attacks"
      number="04"
      title="スキル中の攻撃"
      summary={skill ? `S${skill.skillIndex}・浮遊ユニット1体` : '浮遊ユニット1体'}
      open={open}
      onToggle={() => setOpen((value) => !value)}
      collapsedLabel="テーブルを表示"
    >
      {skill ? (
        <>
          <h3 className="gg-table-title" id="gg-skill-timing-title">攻撃条件</h3>
          <div className="gg-probability-table-wrap gg-value-table-wrap">
            <table className="gg-probability-table gg-value-table" aria-labelledby="gg-skill-timing-title">
              <tbody>
                <tr>
                  <th scope="row">攻撃間隔</th>
                  <td>{format(skill.attackInterval)}秒</td>
                </tr>
                <tr>
                  <th scope="row">{skill.duration === null ? '表示時間' : 'スキル時間'}</th>
                  <td>{skill.duration === null
                    ? <ExplosionInput label="表示時間" value={viewingDuration} max={600} suffix="秒" onChange={onViewingDurationChange} />
                    : `${format(duration)}秒`}</td>
                </tr>
                <tr>
                  <th scope="row">攻撃回数</th>
                  <td>{attackRows.length}回</td>
                </tr>
              </tbody>
            </table>
          </div>
          {skill.duration === null && <p className="gg-probability-intro">S2は永続のため、表示時間を指定します。</p>}
          {lastRow ? (
            <>
              <h3 className="gg-table-title" id="gg-skill-attack-table-title">攻撃ごとの爆発期待値</h3>
              <div className="gg-probability-table-wrap gg-skill-attack-table-wrap" tabIndex={0} role="region" aria-label="スキル中の攻撃テーブル">
                <table className="gg-probability-table gg-skill-attack-table" aria-labelledby="gg-skill-attack-table-title">
                  <thead>
                    <tr>
                      <th scope="col">攻撃回数</th>
                      <th scope="col">経過時間</th>
                      <th scope="col">今回の<br />爆発確率</th>
                      <th scope="col">今回の爆発ダメージ<br />の期待値</th>
                      <th scope="col">累計爆発回数<br />の期待値</th>
                      <th scope="col">累計爆発ダメージ<br />の期待値</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attackRows.map((row) => (
                      <tr
                        key={row.attackNumber}
                        className="gg-skill-attack-row"
                        onClick={(event) => {
                          event.currentTarget.querySelector('button')?.focus({ preventScroll: true })
                          setSelectedAttackNumber(row.attackNumber)
                        }}
                      >
                        <th scope="row">
                          <button
                            type="button"
                            className="gg-attack-detail-trigger"
                            aria-label={`${row.attackNumber}回目の爆発確率の詳細`}
                            aria-haspopup="dialog"
                          >
                            {row.attackNumber}回目<span aria-hidden="true">›</span>
                          </button>
                        </th>
                        <td>{format(row.elapsedSeconds)}秒</td>
                        <td>{formatProbability(row.explosionChancePercent / 100)}</td>
                        <td>{format(row.explosionChancePercent / 100 * explosionDamage)}</td>
                        <td>{format(row.expectedExplosionCount)}回</td>
                        <td>{format(row.expectedExplosionDamage)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="gg-probability-equation gg-expectation-sum" aria-live="polite" aria-atomic="true">
                <span>累計爆発回数の期待値 × 単発爆発ダメージ</span>
                <code>{format(lastRow.expectedExplosionCount)}回 × {format(explosionDamage)} ≈ {format(lastRow.expectedExplosionDamage)}</code>
              </div>
            </>
          ) : <p className="gg-probability-intro" role="status">この時間内には攻撃がありません。</p>}
          {selectedDetail && (
            <GoldenglowAttackProbabilityModal detail={selectedDetail} onClose={() => setSelectedAttackNumber(null)} />
          )}
        </>
      ) : <p className="gg-probability-intro" role="status">{loading ? 'スキル情報を読み込み中…' : 'スキル情報の読み込み後に表示します。'}</p>}
    </CollapsibleCalculatorPanel>
  )
}

function ExplosionInput({ label, value, max, suffix, onChange }: {
  label: string
  value: number
  max: number
  suffix?: string
  onChange: (value: number) => void
}) {
  return (
    <label className="calculator-field">
      <span>{label}</span>
      <div className="number-input-wrap">
        <input
          type="number"
          aria-label={label}
          min={0}
          max={max}
          step="any"
          value={value}
          onChange={(event) => {
            const next = event.target.valueAsNumber
            onChange(Number.isFinite(next) ? Math.min(max, Math.max(0, next)) : 0)
          }}
        />
        {suffix && <em>{suffix}</em>}
      </div>
    </label>
  )
}
