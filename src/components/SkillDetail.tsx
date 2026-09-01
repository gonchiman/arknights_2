import { useEffect, useRef } from 'react'
import type { SkillClassificationOverride, SkillRecord } from '../types/skill'
import { SkillClassificationContent } from './SkillClassificationContent'

interface Props {
  skill: SkillRecord
  operatorSkills: SkillRecord[]
  override?: SkillClassificationOverride
  onBack: () => void
  backLabel?: string
  onSelectSkill: (skill: SkillRecord) => void
  onOverride: (override: SkillClassificationOverride | null) => void
}

export function SkillDetail({
  skill,
  operatorSkills,
  override,
  onBack,
  backLabel = 'オペレーター一覧に戻る',
  onSelectSkill,
  onOverride,
}: Props) {
  const titleRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    window.requestAnimationFrame(() => titleRef.current?.focus())
  }, [skill.operatorId])

  useEffect(() => {
    if (!window.matchMedia('(max-width: 760px)').matches) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onBack()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onBack])

  return (
    <section className="detail-page">
      <button className="back-button" onClick={onBack}>← {backLabel}</button>

      <header className="detail-header">
        <div>
          <h1 ref={titleRef} tabIndex={-1}>{skill.operatorName}</h1>
          <p className="operator-class">★{skill.rarity} · {skill.professionLabel} / {skill.subProfessionName}</p>
        </div>
      </header>

      <nav className="skill-switcher" aria-label={`${skill.operatorName}のスキル`}>
        {operatorSkills.map((candidate) => (
          <button
            className={`skill-switch-button ${candidate.id === skill.id ? 'active' : ''}`}
            aria-current={candidate.id === skill.id ? 'page' : undefined}
            aria-pressed={candidate.id === skill.id}
            onClick={() => onSelectSkill(candidate)}
            key={candidate.id}
          >
            <strong>S{candidate.skillIndex}</strong>
            <span>{candidate.skillName}</span>
          </button>
        ))}
      </nav>

      <SkillClassificationContent
        skill={skill}
        override={override}
        onOverride={onOverride}
      />
    </section>
  )
}
