import { Fragment, useId, useState, type ReactNode } from 'react'
import type { OperatorDetailCommonProps } from './OperatorDetailContent'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { PersistentDetails } from './PersistentDetails'
import { OperatorStatRadar } from './OperatorStatRadar'
import { buildSkillEffectDetails } from '../lib/skillEffectDetails'
import { createSkillEffectsHash } from '../lib/routes'
import './DamageCalculator.css'
import './OperatorDatabase.css'
import './OperatorDetailPage.css'

export interface OperatorDetailPageProps extends OperatorDetailCommonProps {
  backHref?: string
  backLabel?: string
}

const INTEGER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 })
const DECIMAL = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 })
const formatStat = (value: number | null, suffix = '') => value === null
  ? '—'
  : `${(suffix ? DECIMAL : INTEGER).format(value)}${suffix}`

export function OperatorDetailPage({
  operator, comparisonOperators, skills,
  backHref = '#/operators', backLabel = 'オペレーター一覧へ戻る',
}: OperatorDetailPageProps) {
  const titleId = useId()
  const [skillSelection, setSkillSelection] = useState<{ operatorId: string; skillId: string } | null>(null)
  const activeSkill = (skillSelection?.operatorId === operator.operatorId
    ? operator.skills.find((skill) => skill.id === skillSelection.skillId)
    : null) ?? operator.skills[0]
  const activeSkillRecord = activeSkill ? skills.find((skill) => skill.skillId === activeSkill.id) : undefined
  const activeSkillDetails = activeSkillRecord ? buildSkillEffectDetails(activeSkillRecord) : null
  const skillEffectsHref = activeSkill && activeSkillRecord ? createSkillEffectsHash({
    operatorId: operator.operatorId,
    skillIndex: activeSkill.index,
    skillId: activeSkill.id,
    levelIndex: Math.max(0, activeSkillRecord.skillLevels.length - 1),
  }) : '#/skill-effects'
  const skillInformation = [
    ['SP回復方法', activeSkillDetails?.spRecovery ?? '—'],
    ['発動方法', activeSkillDetails?.activation ?? '—'],
    ['初期SP', activeSkill?.initSp ?? '—'],
    ['必要SP', activeSkill?.spCost ?? '—'],
    ['持続', activeSkillDetails?.effectWindow ?? '—'],
  ] as const
  const skillContentId = `${titleId}-skill-content`
  const skillEffectTitleId = `${titleId}-skill-effect-title`
  const stats = operator.stats
  const statRows = [
    ['HP', formatStat(stats.maxHp)],
    ['攻撃力', formatStat(stats.attack)],
    ['防御力', formatStat(stats.defense)],
    ['術耐性', formatStat(stats.magicResistance)],
    ['配置コスト', formatStat(stats.deploymentCost)],
    ['ブロック数', formatStat(stats.blockCount)],
    ['再配置時間', formatStat(stats.redeployTime, '秒')],
    ['攻撃速度', formatStat(stats.attackSpeed)],
    ['攻撃間隔', formatStat(stats.attackInterval, '秒')],
    ['所属陣営', operator.affiliation ?? '—'],
  ] as const

  return (
    <section className="operator-detail-page" aria-labelledby={titleId}>
      <div className="calculator-page operator-profile-layout">
        <header className="page-intro operator-profile-intro">
          <div>
            <span className="page-kicker">OPERATOR DETAIL</span>
            <h1 id={titleId}>{operator.name}</h1>
            <p className="operator-profile-subtitle">★{operator.rarity} · {operator.professionLabel} / {operator.subProfessionName}</p>
          </div>
          <a className="operator-detail-page-back" href={backHref}>{backLabel}</a>
        </header>

        <CollapsibleCalculatorPanel
          id="operator-profile-basics" number="01" title="基本情報"
          summary={operator.statsCondition} collapsedLabel="情報を表示"
        >
          <p className="operator-profile-condition">{operator.statsCondition}</p>
          <ProfileTable title="基本ステータス" rows={statRows} numeric paired />
          <ProfileTable title="特性・素質" rows={[
            ...(operator.traitDescription ? [['特性', operator.traitDescription] as const] : []),
            ...operator.talents.map((talent) => [talent.name, talent.description] as const),
          ]} empty="表示できる特性・素質はありません。" />
        </CollapsibleCalculatorPanel>

        <CollapsibleCalculatorPanel
          id="operator-profile-skills" number="02" title="スキル"
          summary={`${operator.skills.length}スキル`} collapsedLabel="スキルを表示"
        >
          {activeSkill ? <div className="operator-profile-skills">
            <div className="skill-choice-group operator-profile-skill-navigation" role="group" aria-label="スキル選択">
              {operator.skills.map((skill) => (
                <button
                  type="button" key={`${skill.id}:${skill.index}`}
                  className={skill.id === activeSkill.id ? 'active' : ''}
                  aria-pressed={skill.id === activeSkill.id}
                  aria-controls={skillContentId}
                  aria-label={`S${skill.index} ${skill.name}`}
                  onClick={() => setSkillSelection({ operatorId: operator.operatorId, skillId: skill.id })}
                ><span>S{skill.index}</span><strong>{skill.name}</strong></button>
              ))}
            </div>
            <div id={skillContentId} className="operator-profile-skill-content" role="region" aria-label={`S${activeSkill.index} ${activeSkill.name}の詳細`} aria-live="polite">
              <table className="operator-profile-skill-information" aria-label="スキル情報">
                <thead><tr>{skillInformation.map(([label]) => (
                  <th scope="col" key={label}>{label}</th>
                ))}</tr></thead>
                <tbody><tr>{skillInformation.map(([label, value]) => (
                  <td key={label}>{value}</td>
                ))}</tr></tbody>
              </table>
              <a className="operator-profile-skill-effect" href={skillEffectsHref} aria-labelledby={skillEffectTitleId}>
                <h3 id={skillEffectTitleId}>スキル効果<span aria-hidden="true">→</span></h3>
                <p className="operator-profile-description">{activeSkill.description || '効果説明はありません。'}</p>
              </a>
            </div>
          </div> : <Empty>スキルデータはありません。</Empty>}
        </CollapsibleCalculatorPanel>

        <CollapsibleCalculatorPanel
          id="operator-profile-modules" number="03" title="モジュール"
          summary={`${operator.modules.length}種類`} collapsedLabel="モジュールを表示" defaultOpen={false}
        >
          <div className="operator-profile-effects">
            {operator.modules.map((module) => (
              <PersistentDetails
                className="operator-profile-effect"
                persistenceId={`operator-profile-module:${operator.operatorId}:${module.id}`}
                key={module.id}
              >
                <summary><strong>{module.typeLabel} · {module.name}</strong><span className="operator-profile-disclosure" aria-hidden="true" /></summary>
                <div className="operator-profile-effect-body">
                  <p className="operator-profile-condition">解放条件：{module.unlockLabel}</p>
                  {module.effects.map((effect) => (
                    <ProfileTable key={effect.level} title={`Lv.${effect.level}の効果`} rows={[
                      ...(effect.attributeBonuses.length ? [['能力値補正', effect.attributeBonuses.join(' / ')] as const] : []),
                      ...(effect.traitChanges.length ? [['特性変更', effect.traitChanges.join(' / ')] as const] : []),
                      ...(effect.talentChanges.length ? [['素質変更', effect.talentChanges.join(' / ')] as const] : []),
                    ]} empty="表示できる効果データはありません。" />
                  ))}
                  {module.effects.length === 0 && <Empty>表示できる効果データはありません。</Empty>}
                </div>
              </PersistentDetails>
            ))}
            {operator.modules.length === 0 && <Empty>実装済みモジュールはありません。</Empty>}
          </div>
        </CollapsibleCalculatorPanel>

        <CollapsibleCalculatorPanel
          id="operator-profile-potentials" number="04" title="潜在能力"
          summary={`${operator.potentials.length}段階`} collapsedLabel="潜在能力を表示" defaultOpen={false}
        >
          <ProfileTable title="潜在能力による変化" rows={operator.potentials.map((potential) => [
            `潜在${potential.rank}`, potential.description,
          ])} empty="潜在能力データはありません。" />
        </CollapsibleCalculatorPanel>

        <CollapsibleCalculatorPanel
          id="operator-profile-radar" number="05" title="ステータス傾向"
          summary={`${operator.professionLabel} / ${operator.subProfessionName}`} collapsedLabel="グラフを表示" defaultOpen={false}
        >
          <OperatorStatRadar key={operator.operatorId} operator={operator} operators={comparisonOperators} />
        </CollapsibleCalculatorPanel>
        <p className="operator-profile-id">内部ID <code>{operator.operatorId}</code></p>
      </div>
    </section>
  )
}

function ProfileTable({ title, rows, numeric = false, paired = false, empty = '表示できるデータはありません。' }: {
  title: string
  rows: ReadonlyArray<readonly [string, ReactNode]>
  numeric?: boolean
  paired?: boolean
  empty?: string
}) {
  const headingId = useId()
  return (
    <div className="operator-profile-table-section">
      <h3 className="operator-profile-table-title" id={headingId}>{title}</h3>
      {rows.length ? (
        <table className={`operator-profile-table${numeric ? ' numeric' : ''}${paired ? ' paired' : ''}`} aria-labelledby={headingId}>
          <tbody>{paired ? Array.from({ length: Math.ceil(rows.length / 2) }, (_, rowIndex) => (
            <tr key={rowIndex}>
              {rows.slice(rowIndex * 2, rowIndex * 2 + 2).map(([label, value], columnIndex) => {
                const labelId = `${headingId}-${rowIndex}-${columnIndex}`
                return <Fragment key={labelId}><th id={labelId}>{label}</th><td headers={labelId}>{value}</td></Fragment>
              })}
              {rowIndex * 2 + 1 === rows.length && <td colSpan={2} aria-hidden="true" />}
            </tr>
          )) : rows.map(([label, value], index) => (
            <tr key={`${label}:${index}`}><th scope="row">{label}</th><td>{value}</td></tr>
          ))}</tbody>
        </table>
      ) : <Empty>{empty}</Empty>}
    </div>
  )
}

function Empty({ children }: { children: string }) {
  return <p className="operator-profile-empty">{children}</p>
}
