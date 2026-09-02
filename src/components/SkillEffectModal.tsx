import { useEffect, useId, useRef, type MouseEvent as ReactMouseEvent } from 'react'
import { buildSkillEffectDetails, formatSkillEffectDescription } from '../lib/skillEffectDetails'
import type { SkillRecord } from '../types/skill'
import './SkillEffectModal.css'

interface Props {
  skill: SkillRecord
  skillLevelIndex?: number
  onClose: () => void
}

export function SkillEffectModal({ skill, skillLevelIndex, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const titleId = useId()
  const resolvedSkillLevelIndex = typeof skillLevelIndex === 'number'
    ? Math.min(Math.max(0, Math.round(skillLevelIndex)), Math.max(0, skill.skillLevels.length - 1))
    : Math.max(0, skill.skillLevels.length - 1)
  const selectedLevel = skill.skillLevels[resolvedSkillLevelIndex] ?? skill.raw
  const displaySkill: SkillRecord = {
    ...skill,
    description: selectedLevel.description ?? skill.description,
    duration: typeof selectedLevel.duration === 'number' ? selectedLevel.duration : skill.duration,
    durationType: selectedLevel.durationType ?? skill.durationType,
    skillType: selectedLevel.skillType ?? skill.skillType,
    spType: selectedLevel.spData?.spType ?? skill.spType,
    initSp: typeof selectedLevel.spData?.initSp === 'number' ? selectedLevel.spData.initSp : skill.initSp,
    spCost: typeof selectedLevel.spData?.spCost === 'number' ? selectedLevel.spData.spCost : skill.spCost,
    raw: selectedLevel,
  }
  const details = buildSkillEffectDetails(displaySkill)
  const description = formatSkillEffectDescription(displaySkill)
  const skillLevelLabel = getSkillLevelLabel(resolvedSkillLevelIndex, skill.skillLevels.length)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (!dialog.open) dialog.showModal()
    window.requestAnimationFrame(() => titleRef.current?.focus())
    const previousOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'

    return () => {
      document.documentElement.style.overflow = previousOverflow
      if (dialog.open) dialog.close()
    }
  }, [skill.id])

  const handleBackdropClick = (event: ReactMouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      className="skill-effect-dialog"
      aria-labelledby={titleId}
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        onClose()
      }}
      onClick={handleBackdropClick}
    >
      <article className="skill-effect-modal">
        <header className="skill-effect-modal-header">
          <div>
            <span>SKILL EFFECT</span>
            <h2 ref={titleRef} id={titleId} tabIndex={-1}>{skill.operatorName} · S{skill.skillIndex} {skill.skillName}</h2>
            <p>★{skill.rarity} · {skill.professionLabel} / {skill.subProfessionName}</p>
          </div>
          <button type="button" aria-label="スキル効果の詳細を閉じる" onClick={onClose}>×</button>
        </header>

        <div className="skill-effect-modal-body">
          <section className="skill-effect-description" aria-labelledby={`${titleId}-effect`}>
            <div className="skill-effect-section-heading">
              <h3 id={`${titleId}-effect`}>スキル効果</h3>
              <span>{skillLevelLabel}</span>
            </div>
            <p>{description}</p>
          </section>

          <section aria-labelledby={`${titleId}-activation`}>
            <h3 id={`${titleId}-activation`}>発動情報</h3>
            <dl className="skill-effect-stat-grid">
              <div><dt>発動契機</dt><dd>{details.activation}</dd></div>
              <div><dt>終了条件</dt><dd>{details.effectWindow}</dd></div>
              <div><dt>SP回復</dt><dd>{details.spRecovery}</dd></div>
              <div><dt>初期SP</dt><dd>{details.initialSp}</dd></div>
              <div><dt>必要SP</dt><dd>{details.requiredSp}</dd></div>
            </dl>
          </section>

          <section aria-labelledby={`${titleId}-classification`}>
            <h3 id={`${titleId}-classification`}>効果の分類</h3>
            <div className="skill-effect-classification-grid">
              <SkillEffectTags title="ダメージ構成" values={details.damageComponents} />
              <SkillEffectTags title="条件・段階" values={details.conditions} />
              <SkillEffectTags title="比較できる出力" values={details.outputs} />
            </div>
          </section>
        </div>
      </article>
    </dialog>
  )
}

function getSkillLevelLabel(index: number, total: number): string {
  if (total >= 10 && index >= 7) return `特化${index - 6}`
  return `Lv.${index + 1}`
}

function SkillEffectTags({ title, values }: { title: string, values: string[] }) {
  return (
    <div className="skill-effect-tag-group">
      <strong>{title}</strong>
      <div>{values.map((value) => <span key={value}>{value}</span>)}</div>
    </div>
  )
}
