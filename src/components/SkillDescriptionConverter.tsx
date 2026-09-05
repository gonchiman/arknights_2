import { useMemo, useState } from 'react'
import { convertSkillDescription } from '../lib/skillDescriptionEffects'
import { formatSkillDescriptionEffectValue } from '../lib/skillDescriptionEffectFormat'
import type { SkillRecord } from '../types/skill'
import { SkillJsonDetailModal } from './SkillJsonDetailModal'
import './SkillDescriptionConverter.css'

interface Props {
  skill: SkillRecord
  levelIndex: number
  levelLabel: string
}

export function SkillDescriptionConverter({ skill, levelIndex, levelLabel }: Props) {
  const [jsonDetail, setJsonDetail] = useState<'analysis' | 'source' | null>(null)
  const sourceDescription = skill.raw.description ?? skill.description
  const result = useMemo(
    () => convertSkillDescription(sourceDescription, skill.raw.blackboard ?? []),
    [sourceDescription, skill.raw.blackboard],
  )
  const hasUnconverted = result.unconvertedText.length > 0 || result.unresolvedPlaceholders.length > 0
  const json = useMemo(() => JSON.stringify({
    schemaVersion: 1,
    operatorId: skill.operatorId,
    skillId: skill.skillId,
    skillLevel: levelIndex + 1,
    skillLevelLabel: levelLabel,
    sourceDescription,
    ...result,
  }, null, 2), [result, skill.operatorId, skill.skillId, levelIndex, levelLabel, sourceDescription])
  const sourceJson = useMemo(() => JSON.stringify(skill.raw, null, 2), [skill.raw])

  return (
    <section className="skill-description-converter" aria-label={`${levelLabel}のスキル効果の解析結果`}>
      <div className={`skill-description-results${hasUnconverted ? ' has-unconverted' : ''}`}>
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
                  <th scope="row">{effect.sourceKey ?? effect.key}</th>
                  <td className="skill-description-effect-value">{formatSkillDescriptionEffectValue(effect)}</td>
                  <td>{effect.sourceText}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {hasUnconverted && (
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
      </div>

      <div className="skill-description-json-buttons">
        <button type="button" aria-haspopup="dialog" onClick={() => setJsonDetail('analysis')}>解析結果のJSON</button>
        <button type="button" aria-haspopup="dialog" onClick={() => setJsonDetail('source')}>元データのJSON</button>
      </div>

      {jsonDetail !== null && (
        <SkillJsonDetailModal
          title={jsonDetail === 'source' ? '元データのJSON' : '解析結果のJSON'}
          subtitle={`${skill.operatorName} · S${skill.skillIndex} ${skill.skillName} · ${levelLabel}`}
          json={jsonDetail === 'source' ? sourceJson : json}
          onClose={() => setJsonDetail(null)}
        />
      )}
    </section>
  )
}
