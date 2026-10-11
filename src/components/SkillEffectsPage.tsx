import { createSkillEffectsHash, type SkillEffectsRouteSelection } from '../lib/routes'
import { createSkillJsonSelectionKey } from '../lib/skillJsonAnalysis'
import type { SkillRecord } from '../types/skill'
import { SkillDescriptionConverter } from './SkillDescriptionConverter'
import { SkillDescriptionSelectionPage } from './SkillDescriptionSelectionPage'

interface Props {
  rows: SkillRecord[]
  loading: boolean
  initialSelection?: SkillEffectsRouteSelection
}

export function SkillEffectsPage({ rows, loading, initialSelection }: Props) {
  return (
    <SkillDescriptionSelectionPage
      rows={rows}
      loading={loading}
      initialSelection={initialSelection}
      createHash={createSkillEffectsHash}
      title="スキル効果の解析"
      kicker="SKILL EFFECTS"
      intro="スキルとレベルを選ぶと、説明文から読み取った効果と内容を表示します。"
      renderSelection={({ skill, levelIndex, levelLabel, description }) => (
        <section className="skill-effects-content" aria-label="選択したスキルの解析">
          <header className="skill-effects-selection-summary">
            <h2>{skill.operatorName} · S{skill.skillIndex} {skill.skillName}</h2>
            <span>{levelLabel}</span>
          </header>
          <section className="skill-effects-description" aria-labelledby="skill-effects-description-heading">
            <h3 id="skill-effects-description-heading">スキル説明文</h3>
            <p>{description || '説明文がありません。'}</p>
          </section>
          <SkillDescriptionConverter
            key={`${createSkillJsonSelectionKey(skill)}:${levelIndex}`}
            skill={skill}
            levelIndex={levelIndex}
            levelLabel={levelLabel}
          />
        </section>
      )}
    />
  )
}
