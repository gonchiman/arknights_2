import { useEffect, useMemo, useState } from 'react'
import { convertSkillDescription, type SkillDescriptionEffect } from '../lib/skillDescriptionEffects'
import type { SkillRecord } from '../types/skill'
import './SkillDescriptionConverter.css'

interface Props {
  skill: SkillRecord
  levelIndex: number
  levelLabel: string
}

const UNIT_SUFFIXES: Record<string, string> = {
  multiplier: '倍',
  points: '',
  seconds: '秒',
  count: '',
  cost: 'コスト',
}

const DAMAGE_TYPE_LABELS: Record<string, string> = {
  physical: '物理',
  arts: '術',
  true: '確定',
}

function formatEffectValue(effect: SkillDescriptionEffect): string {
  if (typeof effect.value !== 'number') {
    return effect.key === 'damageType'
      ? DAMAGE_TYPE_LABELS[String(effect.value)] ?? String(effect.value)
      : String(effect.value)
  }

  const isChange = effect.unit === 'ratio' || effect.unit === 'points'
    || effect.key === 'attackIntervalDeltaSeconds' || effect.key === 'targetCountBonus'
  const value = effect.value.toLocaleString('ja-JP', {
    style: effect.unit === 'ratio' ? 'percent' : 'decimal',
    maximumFractionDigits: 10,
    signDisplay: isChange ? 'exceptZero' : 'auto',
  })
  if (effect.unit === 'ratio') return value
  if (effect.key === 'hitsPerAttack') return `${value}回`
  if (effect.key === 'targetCount' || effect.key === 'targetCountBonus') return `${value}体`
  return `${value}${UNIT_SUFFIXES[effect.unit] ?? effect.unit}`
}

export function SkillDescriptionConverter({ skill, levelIndex, levelLabel }: Props) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const sourceDescription = skill.raw.description ?? skill.description
  const result = useMemo(
    () => convertSkillDescription(sourceDescription, skill.raw.blackboard ?? []),
    [sourceDescription, skill.raw.blackboard],
  )
  const json = useMemo(() => JSON.stringify({
    schemaVersion: 1,
    operatorId: skill.operatorId,
    skillId: skill.skillId,
    skillLevel: levelIndex + 1,
    skillLevelLabel: levelLabel,
    sourceDescription,
    ...result,
  }, null, 2), [result, skill.operatorId, skill.skillId, levelIndex, levelLabel, sourceDescription])

  useEffect(() => setCopyState('idle'), [json])

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(json)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  return (
    <section className="skill-description-converter" aria-label={`${levelLabel}のスキル効果の解析結果`}>
      <div
        className="skill-description-effect-table-wrap"
        role="region"
        aria-label={`${levelLabel}のスキル効果一覧`}
        tabIndex={0}
      >
        <table className="skill-description-effect-table">
          <caption className="visually-hidden">{levelLabel}のスキル効果の解析結果</caption>
          <thead>
            <tr><th scope="col">効果</th><th scope="col">内容</th><th scope="col">説明文の該当箇所</th></tr>
          </thead>
          <tbody>
            {result.effects.length === 0 && (
              <tr><td colSpan={3} className="skill-description-no-effects">解析できる効果がありません。</td></tr>
            )}
            {result.effects.map((effect, index) => (
              <tr key={`${effect.key}:${index}`}>
                <th scope="row">{effect.sourceKey ?? '—'}</th>
                <td className="skill-description-effect-value">{formatEffectValue(effect)}</td>
                <td>{effect.sourceText}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(result.unconvertedText.length > 0 || result.unresolvedPlaceholders.length > 0) && (
        <div className="skill-description-unconverted">
          <h3>解析できなかった記述</h3>
          {result.unconvertedText.length > 0 && (
            <ul>{result.unconvertedText.map((text, index) => <li key={index}>{text}</li>)}</ul>
          )}
          {result.unresolvedPlaceholders.length > 0 && (
            <p>値を取得できなかった変数：{result.unresolvedPlaceholders.join('、')}</p>
          )}
        </div>
      )}

      <details className="skill-description-json">
        <summary>解析結果のJSON</summary>
        <div className="skill-description-json-actions">
          <button type="button" onClick={() => void copyJson()}>JSONをコピー</button>
          <span role="status">
            {copyState === 'copied' && 'コピーしました'}
            {copyState === 'failed' && 'コピーできませんでした。下のJSONを選択してコピーしてください。'}
          </span>
        </div>
        <textarea aria-label="解析結果のJSON" readOnly value={json} spellCheck={false} />
      </details>
    </section>
  )
}
