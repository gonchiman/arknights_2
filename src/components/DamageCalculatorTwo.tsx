import { useMemo, useState } from 'react'
import type { SkillRecord } from '../types/skill'
import { DAMAGE_TYPE_LABELS } from '../lib/damageCalculator'
import { buildDamageCalculatorTwoOutput } from '../lib/damageCalculatorTwo'
import {
  getComparisonMaximumSkillLevelIndex,
  getComparisonMinimumPhaseIndex,
} from '../lib/operatorBuildComparison'
import { getSkillLevelLabel, inspectSkillLevel } from '../lib/skillJsonAnalysis'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { EMPTY_OPERATOR_FILTERS, OperatorSearch } from './OperatorSearch'
import { PersistentDetails } from './PersistentDetails'
import './DamageCalculator.css'
import './DamageCalculatorTwo.css'

interface Props {
  rows: SkillRecord[]
  loading: boolean
}

export function DamageCalculatorTwo({ rows, loading }: Props) {
  const [operatorId, setOperatorId] = useState('char_350_surtr')
  // Undefined selects the operator's last unlocked skill; null selects normal attacks.
  const [skillId, setSkillId] = useState<string | null>()
  const [phaseIndex, setPhaseIndex] = useState(2)
  const [operatorLevel, setOperatorLevel] = useState(90)
  const [trust, setTrust] = useState(100)
  const [skillLevelIndex, setSkillLevelIndex] = useState(9)
  const [precision, setPrecision] = useState(1)
  const [searchOpen, setSearchOpen] = useState(false)
  const [filters, setFilters] = useState(EMPTY_OPERATOR_FILTERS)

  const operatorSkills = useMemo(() => {
    const effectiveId = rows.some((row) => row.operatorId === operatorId)
      ? operatorId : rows[0]?.operatorId
    return rows.filter((row) => row.operatorId === effectiveId)
      .sort((a, b) => a.skillIndex - b.skillIndex)
  }, [rows, operatorId])
  const operator = operatorSkills[0]
  const phases = operator?.operatorProfile.phases ?? []
  const safePhase = clampInteger(phaseIndex, 0, Math.max(0, phases.length - 1))
  const maxLevel = Math.max(1, phases[safePhase]?.maxLevel ?? 1)
  const safeLevel = clampInteger(operatorLevel, 1, maxLevel)
  const unlockedSkills = operatorSkills.filter((skill) => getComparisonMinimumPhaseIndex(skill) <= safePhase)
  const selectedSkill = skillId === null ? null
    : unlockedSkills.find((skill) => skill.id === skillId) ?? unlockedSkills.at(-1) ?? null
  const skillLevels = selectedSkill
    ? selectedSkill.skillLevels.length ? selectedSkill.skillLevels : [selectedSkill.raw]
    : []
  const maxSkillLevel = selectedSkill ? getComparisonMaximumSkillLevelIndex(selectedSkill, safePhase) : 0
  const safeSkillLevel = clampInteger(skillLevelIndex, 0, maxSkillLevel)
  const inspection = selectedSkill ? inspectSkillLevel(selectedSkill, safeSkillLevel) : null
  const output = useMemo(() => operator ? buildDamageCalculatorTwoOutput({
    operator,
    skill: selectedSkill,
    phaseIndex: safePhase,
    operatorLevel: safeLevel,
    trust,
    skillLevelIndex: safeSkillLevel,
  }) : null, [operator, selectedSkill, safePhase, safeLevel, trust, safeSkillLevel])
  const number = useMemo(() => new Intl.NumberFormat('ja-JP', {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  }), [precision])
  const format = (value: number | null) => value === null ? '—' : number.format(value)

  if (!operator || !output) {
    return <p className="calculator-loading" role="status">{loading ? 'オペレーターデータを読み込み中…' : '計算対象のオペレーターがありません。'}</p>
  }

  const attackLabel = selectedSkill ? `S${selectedSkill.skillIndex} ${inspection?.level.name ?? selectedSkill.skillName}` : '通常攻撃'
  const skillLevelLabel = selectedSkill ? getSkillLevelLabel(safeSkillLevel, skillLevels.length) : ''
  const axisLabel = output.damageType === 'TRUE' ? '軽減' : output.axisLabel
  const resultContext = `${operator.operatorName} · ${selectedSkill ? `S${selectedSkill.skillIndex} ${skillLevelLabel}` : attackLabel} · ${output.damageType ? `${DAMAGE_TYPE_LABELS[output.damageType]}ダメージ` : '種別未判定'}`
  const model = output.model
  const hasMinimumDamage = output.rows.some((row) => row.breakdown.mitigation.minimumApplied)

  function selectOperator(row: SkillRecord) {
    const nextSkills = rows.filter((candidate) => candidate.operatorId === row.operatorId)
      .sort((a, b) => a.skillIndex - b.skillIndex)
    const nextPhase = Math.max(0, row.operatorProfile.phases.length - 1)
    const nextSkill = nextSkills.filter((candidate) => getComparisonMinimumPhaseIndex(candidate) <= nextPhase).at(-1)
    setOperatorId(row.operatorId)
    setPhaseIndex(nextPhase)
    setOperatorLevel(row.operatorProfile.phases[nextPhase]?.maxLevel ?? 1)
    setSkillId(nextSkill?.id ?? null)
    setSkillLevelIndex(nextSkill ? getComparisonMaximumSkillLevelIndex(nextSkill, nextPhase) : 0)
    setSearchOpen(false)
  }

  return <section className="calculator-page damage-two-page">
    <h1 className="visually-hidden">Damage Calculator 2</h1>

    <CollapsibleCalculatorPanel id="damage-two-operator" number="01" title="オペレーター選択"
      summary={operator.operatorName} collapsedLabel="選択を表示">
      <div className="operator-search-summary">
        <div className="calculator-field operator-picker-field">
          <span>選択中のオペレーター</span>
          <button type="button" className="operator-search-trigger" aria-expanded={searchOpen}
            aria-controls="damage-two-search" onClick={() => setSearchOpen((open) => !open)}>
            <strong>{operator.operatorName}</strong>
            <small>★{operator.rarity} · {operator.professionLabel} / {operator.subProfessionName}</small>
            <em>{searchOpen ? '検索を閉じる' : '検索して変更'} ↗</em>
          </button>
        </div>
      </div>
      {searchOpen && <div id="damage-two-search" className="calculator-operator-search">
        <div className="operator-search-heading">
          <strong>オペレーターを検索</strong>
          <button type="button" onClick={() => setSearchOpen(false)}>閉じる</button>
        </div>
        <OperatorSearch rows={rows} filters={filters} loading={loading} onFiltersChange={setFilters}
          onSelect={selectOperator} instruction="行を選択すると計算対象へ反映します" actionLabel="選択する →" className="damage-operator-search-results"
          selectedOperatorId={operator.operatorId} />
      </div>}
    </CollapsibleCalculatorPanel>

    <CollapsibleCalculatorPanel id="damage-two-conditions" number="02" title="計算条件"
      summary={`昇進${safePhase} Lv.${safeLevel} · ${selectedSkill ? `S${selectedSkill.skillIndex} ${skillLevelLabel}` : attackLabel}`}
      collapsedLabel="条件を表示">
      <div className="condition-subheading">育成状態</div>
      <div className="calculator-form-grid growth-form-grid">
        <label className="calculator-field"><span>昇進段階</span>
          <select aria-label="昇進段階" value={safePhase} onChange={(event) => {
            const nextPhase = Number(event.target.value)
            setPhaseIndex(nextPhase)
            setOperatorLevel(phases[nextPhase]?.maxLevel ?? 1)
            if (selectedSkill && getComparisonMinimumPhaseIndex(selectedSkill) > nextPhase) {
              setSkillId(operatorSkills.filter((skill) => getComparisonMinimumPhaseIndex(skill) <= nextPhase).at(-1)?.id ?? null)
            }
          }}>
            {phases.map((phase, index) => <option value={index} key={index}>昇進{index}（最大Lv.{phase.maxLevel ?? 1}）</option>)}
          </select>
        </label>
        <label className="calculator-field"><span>オペレーターレベル</span>
          <input aria-label="オペレーターレベル" type="number" min={1} max={maxLevel} step={1}
            value={safeLevel} onChange={(event) => setOperatorLevel(clampInteger(Number(event.target.value), 1, maxLevel))} />
        </label>
        <label className="calculator-field"><span>信頼度（%）</span>
          <input aria-label="信頼度（%）" type="number" min={0} max={100} step={1}
            value={trust} onChange={(event) => setTrust(clampInteger(Number(event.target.value), 0, 100))} />
        </label>
        <label className="calculator-field"><span>スキルレベル</span>
          <select aria-label="スキルレベル" value={safeSkillLevel} disabled={!selectedSkill}
            onChange={(event) => setSkillLevelIndex(Number(event.target.value))}>
            {selectedSkill ? skillLevels.slice(0, maxSkillLevel + 1).map((_, index) =>
              <option value={index} key={index}>{getSkillLevelLabel(index, skillLevels.length)}</option>)
              : <option value={0}>通常攻撃</option>}
          </select>
        </label>
      </div>
      <dl className="damage-two-stats" aria-live="polite">
        <div><dt>基礎攻撃力</dt><dd>{formatCompact(output.stats.attack)}</dd></div>
        <div><dt>攻撃間隔</dt><dd>{formatCompact(output.stats.attackInterval)}秒</dd></div>
        <div><dt>攻撃速度</dt><dd>{formatCompact(output.stats.attackSpeed)}</dd></div>
        <div><dt>ダメージ種別</dt><dd>{output.damageType ? DAMAGE_TYPE_LABELS[output.damageType] : '判定不可'}</dd></div>
      </dl>
      <div className="condition-subheading damage-two-skill-heading">攻撃 / スキル</div>
      <div className="skill-choice-group damage-two-skills" role="group" aria-label="計算する攻撃">
        <button type="button" className={!selectedSkill ? 'active' : ''} aria-pressed={!selectedSkill}
          onClick={() => setSkillId(null)}><strong>通常攻撃</strong></button>
        {operatorSkills.map((skill) => {
          const unlocked = getComparisonMinimumPhaseIndex(skill) <= safePhase
          return <button type="button" key={skill.id} className={selectedSkill?.id === skill.id ? 'active' : ''}
            aria-pressed={selectedSkill?.id === skill.id} disabled={!unlocked}
            title={unlocked ? undefined : `昇進${getComparisonMinimumPhaseIndex(skill)}で解放`}
            onClick={() => setSkillId(skill.id)}><span>S{skill.skillIndex}</span><strong>{skill.skillName}</strong></button>
        })}
      </div>
      <div className="selected-skill-summary damage-two-skill-summary">
        <strong>{attackLabel}</strong>
        <p>{output.unsupportedReasons.length > 0 ? '基本モデルでは算出できない効果を含みます。'
          : model ? `攻撃力${signedPercent(model.directMultiplierPercent)} · 攻撃倍率${formatCompact(model.attackScalePercent)}% · ${formatCompact(model.hitCount)}ヒット`
          : '攻撃力補正なし'}</p>
      </div>
      <PersistentDetails className="damage-two-help" persistenceId="damage-two-help">
        <summary>計算に使う数値・対象範囲</summary>
        {output.unsupportedReasons.length === 0 && <dl className="damage-two-loaded">
          <div><dt>攻撃力増加</dt><dd>{signedPercent(model?.directMultiplierPercent ?? 0)}</dd></div>
          <div><dt>攻撃倍率</dt><dd>{formatCompact(model?.attackScalePercent ?? 100)}%</dd></div>
          <div><dt>1攻撃のヒット数</dt><dd>{formatCompact(model?.hitCount ?? 1)}</dd></div>
          <div><dt>計算上の攻撃間隔</dt><dd>{formatCompact(model?.attackInterval ?? output.stats.attackInterval)}秒</dd></div>
        </dl>}
        <p>育成状態とスキルの基本補正を使います。素質・特性の追加補正、モジュール、潜在、外部バフは含めません。</p>
        <p>1攻撃ダメージは1ヒットダメージ×ヒット数。DPSは1攻撃ダメージ÷攻撃間隔で、単体を攻撃し続けた場合の値です。スキルの再使用までの時間は含めません。</p>
        <p>術耐性は0・20・40・60・80・95・100、防御力は0・500・1,000・1,500・2,000と最低保証に到達する最大値を表示します。</p>
        {inspection && <p><strong>スキル説明：</strong>{stripMarkup(inspection.expandedDescription)}</p>}
      </PersistentDetails>
    </CollapsibleCalculatorPanel>

    <CollapsibleCalculatorPanel id="damage-two-results" number="03" title="計算結果"
      summary={output.damageType === 'ARTS' ? '術耐性別' : output.damageType === 'PHYSICAL' ? '防御力別' : 'ダメージ'}
      collapsedLabel="結果を表示" headerActions={<label className="damage-two-precision">小数点以下
        <select aria-label="結果の小数点以下" value={precision} onChange={(event) => setPrecision(Number(event.target.value))}>
          {[0, 1, 2, 3].map((digits) => <option value={digits} key={digits}>{digits}桁</option>)}
        </select>
      </label>}>
      <p className="damage-two-context" id="damage-two-context" role="status" aria-live="polite">{resultContext}</p>
      {output.unsupportedReasons.length > 0 ? <div className="damage-two-unavailable" role="status">
        <strong>この攻撃は基本計算の対象外です。</strong>
        <ul>{output.unsupportedReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
      </div> : <>
        <div className="damage-two-table-wrap" tabIndex={0} role="region" aria-label="ダメージ計算結果">
          <table className="damage-two-table" aria-describedby="damage-two-context">
            <thead><tr><th scope="col">{axisLabel}</th><th scope="col">1ヒットダメージ</th><th scope="col">1攻撃ダメージ</th><th scope="col">DPS</th></tr></thead>
            <tbody>{output.rows.map((row) => <tr key={row.axisValue}>
              <th scope="row">{output.damageType === 'TRUE' ? '軽減なし' : formatCompact(row.axisValue)}</th>
              <td>{format(row.perHit)}{row.breakdown.mitigation.minimumApplied && <sup aria-label="最低保証ダメージ">＊</sup>}</td>
              <td>{format(row.perAttack)}</td><td>{format(row.dps)}</td>
            </tr>)}</tbody>
          </table>
        </div>
        {hasMinimumDamage && <p className="damage-two-note">＊ 最低保証ダメージ</p>}
        {output.dpsReason && <p className="damage-two-note">DPS：{output.dpsReason}</p>}
      </>}
    </CollapsibleCalculatorPanel>
  </section>
}

function clampInteger(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? Math.round(value) : min))
}

function formatCompact(value: number) {
  return new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 }).format(value)
}

function signedPercent(value: number) {
  return `${value >= 0 ? '+' : ''}${formatCompact(value)}%`
}

function stripMarkup(value: string) {
  return value.replace(/<[^>]+>/g, '').replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim()
}
