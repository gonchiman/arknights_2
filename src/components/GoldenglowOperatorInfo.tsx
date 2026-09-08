import { useMemo, useState } from 'react'
import type { GoldenglowGuideSkill } from '../lib/goldenglowGuideSkill'
import type { PassiveSource } from '../lib/operatorProfile'
import { splitPassiveDescriptionChanges } from '../lib/passiveDescriptionChanges'
import { expandSkillDescription } from '../lib/skillJsonAnalysis'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import './GoldenglowOperatorInfo.css'

const numberFormat = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 })
const formatStat = (value: number | null, suffix = '') => value === null ? '—' : `${numberFormat.format(value)}${suffix}`
const describeSource = (source: PassiveSource | undefined) => source
  ? expandSkillDescription(source.description, source.blackboard)
    .replace(/<[^>]+>/g, '')
    .replace(/\\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  : ''

export function GoldenglowOperatorInfo({ skill, loading }: {
  skill: GoldenglowGuideSkill | null
  loading: boolean
}) {
  const [open, setOpen] = useState(true)
  const info = useMemo(() => {
    if (!skill) return null
    const module = skill.moduleApplication
    const moduleLabel = module.moduleName ? `${module.moduleName} Lv.${module.moduleLevel}` : 'モジュールなし'
    return {
      stats: skill.operatorStats,
      condition: `昇進2 Lv.${skill.attackCalculation.level}・信頼100・潜在1・${moduleLabel}`,
      sources: skill.passives.sources.map((source) => {
        const description = describeSource(source)
        const baseSource = skill.basePassives.sources.find((base) => (
          base.sourceKind === source.sourceKind && base.talentIndex === source.talentIndex
        ))
        return {
          ...source,
          description,
          parts: splitPassiveDescriptionChanges(module.moduleName ? describeSource(baseSource) : description, description),
        }
      }),
    }
  }, [skill])

  const statRows = info ? [
    { label: '攻撃力', value: formatStat(info.stats.attack) },
    { label: '攻撃速度', value: formatStat(info.stats.attackSpeed) },
  ] : []

  return (
    <CollapsibleCalculatorPanel
      id="gg-operator-info"
      number="01"
      title="ゴールデングロー情報"
      summary={info?.condition ?? '基本ステータス・特性・素質'}
      open={open}
      onToggle={() => setOpen((value) => !value)}
      collapsedLabel="情報を表示"
      className="gg-operator-info"
    >
      {info ? <>
        <h3 className="gg-table-title" id="gg-operator-stats-title">基本ステータス<span className="gg-operator-stats-condition">スキル未使用</span></h3>
        <div className="gg-probability-table-wrap gg-value-table-wrap">
          <table className="gg-probability-table gg-operator-info-table" aria-labelledby="gg-operator-stats-title">
            <tbody>
              {statRows.map((row) => <tr key={row.label}><th scope="row">{row.label}</th><td>{row.value}</td></tr>)}
            </tbody>
          </table>
        </div>
        {(['TRAIT', 'TALENT'] as const).map((kind) => {
          const title = kind === 'TRAIT' ? '特性' : '素質'
          const titleId = kind === 'TRAIT' ? 'gg-operator-trait-title' : 'gg-operator-talents-title'
          const sources = info.sources.filter((source) => source.sourceKind === kind)
          return <div className="gg-operator-passive-section" key={kind}>
            <h3 className="gg-table-title" id={titleId}>{title}</h3>
            <div className="gg-probability-table-wrap gg-value-table-wrap">
              <table className="gg-probability-table gg-operator-info-table gg-operator-info-effects" aria-labelledby={titleId}>
                <tbody>
                  {sources.length > 0 ? sources.map((source, index) => <tr key={`${source.sourceName}:${index}`}>
                    <th scope="row">{source.sourceName}</th>
                    <td>{source.description ? source.parts.map((part, partIndex) => part.changed
                      ? <mark className="gg-module-change-highlight" title="モジュールによる変更" key={partIndex}>{part.text}</mark>
                      : part.text) : '説明を取得できませんでした。'}</td>
                  </tr>) : <tr><td colSpan={2}>{title}情報を取得できませんでした。</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        })}
      </> : <p className="gg-operator-info-status" role="status">{loading ? 'オペレーター情報を読み込み中…' : 'オペレーター情報を取得できませんでした。'}</p>}
    </CollapsibleCalculatorPanel>
  )
}
