import type { GoldenglowGuideSkill } from '../lib/goldenglowGuideSkill'
import { getSkillLevelLabel } from '../lib/skillJsonAnalysis'
import { PersistentDetails } from './PersistentDetails'

export function GoldenglowSkillControls({
  skill,
  skills,
  compact,
  onShowEffect,
  onSkillChange,
  onSkillLevelChange,
}: {
  skill: GoldenglowGuideSkill
  skills: readonly GoldenglowGuideSkill[]
  compact: boolean
  onShowEffect: () => void
  onSkillChange: (skillIndex: number) => void
  onSkillLevelChange: (index: number) => void
}) {
  return (
    <div className="damage-build-navigation-group gg-skill-controls">
      <span className="damage-build-navigation-label">スキル</span>
      <div className="skill-choice-group" role="group" aria-label="スキル">
        {skills.map((item) => (
          <button
            key={item.skillIndex}
            type="button"
            className={item.skillIndex === skill.skillIndex ? 'active' : ''}
            aria-pressed={item.skillIndex === skill.skillIndex}
            aria-label={`S${item.skillIndex} ${item.skillName}`}
            data-gg-build-control={`skill-${item.skillIndex}`}
            onClick={() => onSkillChange(item.skillIndex)}
          >
            <span>S{item.skillIndex}</span><strong>{item.skillName}</strong>
          </button>
        ))}
      </div>
      {compact && <button type="button" className="gg-compact-effect-trigger" aria-label="スキル効果を表示"
        data-gg-build-control="skill-effect"
        aria-haspopup="dialog" onClick={onShowEffect}>効果</button>}
      <label className="gg-build-level-control">
        <span>レベル</span>
        <select className="gg-build-level-select" aria-label="スキルレベル"
          data-gg-build-control="skill-level"
          value={skill.skillLevelIndex}
          onChange={(event) => onSkillLevelChange(Number(event.target.value))}>
          {Array.from({ length: skill.skillLevelCount }, (_, index) => (
            <option key={index} value={index}>{getSkillLevelLabel(index, skill.skillLevelCount)}</option>
          ))}
        </select>
      </label>
      {!compact && <PersistentDetails persistenceId="gg-skill-effect" className="gg-skill-effect">
        <summary data-gg-build-control="skill-effect">
          <span>スキル効果</span>
          <span className="gg-skill-effect-disclosure" aria-hidden="true" />
        </summary>
        <div className="gg-skill-effect-body" tabIndex={0} role="region" aria-label="スキル効果の説明"
          data-gg-build-control="skill-effect-content">
          <p className="gg-skill-effect-description">{skill.skillDescription || 'スキル効果の説明を取得できませんでした。'}</p>
        </div>
      </PersistentDetails>}
    </div>
  )
}
