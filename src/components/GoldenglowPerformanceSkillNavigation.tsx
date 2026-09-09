import { useLayoutEffect, useRef, useState } from 'react'
import type { GoldenglowGuideSkill } from '../lib/goldenglowGuideSkill'
import { GoldenglowDetailModal } from './GoldenglowDetailModal'
import { GoldenglowSkillControls } from './GoldenglowSkillControls'

export function GoldenglowPerformanceSkillNavigation({
  skill,
  skills,
  onSkillChange,
  onSkillLevelChange,
}: {
  skill: GoldenglowGuideSkill
  skills: readonly GoldenglowGuideSkill[]
  onSkillChange: (skillIndex: number) => void
  onSkillLevelChange: (index: number) => void
}) {
  const normalNavigationRef = useRef<HTMLDivElement>(null)
  const compactNavigationRef = useRef<HTMLDivElement>(null)
  const pendingNavigationFocus = useRef<string | null>(null)
  const [navigation, setNavigation] = useState({ compact: false, left: 0, width: 0 })
  const [effectOpen, setEffectOpen] = useState(false)

  useLayoutEffect(() => {
    const normal = normalNavigationRef.current
    const compactNavigation = compactNavigationRef.current
    if (!normal || !compactNavigation) return
    let animationFrameId = 0
    const updateStuckState = () => {
      const stickyTop = Number.parseFloat(window.getComputedStyle(compactNavigation).top) || 0
      const bounds = normal.getBoundingClientRect()
      // Keep the normal controls in the page flow so changing modes cannot move the table.
      const compact = bounds.bottom <= stickyTop
      const wasCompact = !compactNavigation.hidden
      if (compact !== wasCompact) {
        const previous = wasCompact ? compactNavigation : normal
        const focused = document.activeElement
        if (focused instanceof HTMLElement && previous.contains(focused)) {
          pendingNavigationFocus.current = focused.getAttribute('data-gg-build-control')
          focused.blur()
        }
      }
      setNavigation((current) => (
        current.compact === compact && current.left === bounds.left && current.width === bounds.width
          ? current : { compact, left: bounds.left, width: bounds.width }
      ))
    }
    const requestUpdate = () => {
      window.cancelAnimationFrame(animationFrameId)
      animationFrameId = window.requestAnimationFrame(updateStuckState)
    }

    updateStuckState()
    window.addEventListener('scroll', requestUpdate, { passive: true })
    window.addEventListener('resize', requestUpdate)
    const resizeObserver = new ResizeObserver(requestUpdate)
    resizeObserver.observe(normal)
    if (normal.parentElement) resizeObserver.observe(normal.parentElement)
    if (normal.previousElementSibling instanceof HTMLElement) resizeObserver.observe(normal.previousElementSibling)
    return () => {
      window.cancelAnimationFrame(animationFrameId)
      window.removeEventListener('scroll', requestUpdate)
      window.removeEventListener('resize', requestUpdate)
      resizeObserver.disconnect()
    }
  }, [])

  useLayoutEffect(() => {
    const key = pendingNavigationFocus.current
    pendingNavigationFocus.current = null
    if (!key) return
    const target = navigation.compact ? compactNavigationRef.current : normalNavigationRef.current
    const controls = Array.from(target?.querySelectorAll<HTMLElement>('[data-gg-build-control]') ?? [])
    const visibleControl = (controlKey: string) => controls.find((control) => (
      control.getAttribute('data-gg-build-control') === controlKey
        && !control.matches(':disabled') && control.getClientRects().length > 0
    ))
    const control = visibleControl(key) ?? visibleControl(key.replace(/-content$/, ''))
    control?.focus({ preventScroll: true })
  }, [navigation.compact])

  const renderControls = (compact: boolean) => <GoldenglowSkillControls
    skill={skill}
    skills={skills}
    compact={compact}
    onShowEffect={() => setEffectOpen(true)}
    onSkillChange={onSkillChange}
    onSkillLevelChange={onSkillLevelChange}
  />

  return (
    <>
      <div className="damage-build-navigation gg-skill-navigation gg-normal-navigation gg-performance-navigation"
        ref={normalNavigationRef} inert={navigation.compact} aria-hidden={navigation.compact}>
        {renderControls(false)}
      </div>
      <div className="damage-build-navigation gg-skill-navigation gg-compact-navigation gg-performance-navigation is-stuck"
        ref={compactNavigationRef}
        hidden={!navigation.compact}
        style={{ left: navigation.left, width: navigation.width }}>
        {renderControls(true)}
      </div>
      {effectOpen && <GoldenglowDetailModal
        title={`S${skill.skillIndex} ${skill.skillName} ${skill.skillLevelLabel}・スキル効果`}
        closeLabel="スキル効果を閉じる"
        onClose={() => setEffectOpen(false)}>
        <p className="gg-skill-effect-description">{skill.skillDescription || 'スキル効果の説明を取得できませんでした。'}</p>
      </GoldenglowDetailModal>}
    </>
  )
}
