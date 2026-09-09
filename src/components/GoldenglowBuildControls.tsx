import type { GoldenglowGuideSkill } from '../lib/goldenglowGuideSkill'
import type { RawOperatorModule } from '../types/skill'
import { GoldenglowModuleEffect } from './GoldenglowModuleEffect'
import { GoldenglowSkillControls } from './GoldenglowSkillControls'

const format = (value: number) => new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 }).format(value)

export interface GoldenglowGuideModuleChoice {
  module: RawOperatorModule
  id: string
  label: string
  levels: number[]
  unlocked: boolean
}

export function GoldenglowBuildControls({
  skill,
  skills,
  moduleChoices,
  compact,
  onShowEffect,
  resistance,
  onResistanceChange,
  onSkillChange,
  onSkillLevelChange,
  onModuleChange,
}: {
  skill: GoldenglowGuideSkill
  skills: readonly GoldenglowGuideSkill[]
  moduleChoices: readonly GoldenglowGuideModuleChoice[]
  compact: boolean
  onShowEffect: (effect: 'skill' | 'module') => void
  resistance?: number
  onResistanceChange?: (value: number) => void
  onSkillChange: (skillIndex: number) => void
  onSkillLevelChange: (index: number) => void
  onModuleChange: (id: string, level: number) => void
}) {
  const selectedModule = moduleChoices.find((choice) => choice.id === skill.moduleId)

  return (
    <>
      <GoldenglowSkillControls
        skill={skill}
        skills={skills}
        compact={compact}
        onShowEffect={() => onShowEffect('skill')}
        onSkillChange={onSkillChange}
        onSkillLevelChange={onSkillLevelChange}
      />
      <div className="damage-build-navigation-group gg-module-controls">
        <span className="damage-build-navigation-label">モジュール</span>
        <div className="skill-choice-group module-choice-group" role="group" aria-label="モジュール">
          <button type="button" className={!skill.moduleId ? 'active' : ''} aria-pressed={!skill.moduleId}
            data-gg-build-control="module-off"
            aria-label="モジュール未装備" onClick={() => onModuleChange('', 3)}>
            <span>OFF</span><strong>未装備</strong>
          </button>
          {moduleChoices.map((choice) => <button
            type="button" key={choice.id}
            className={skill.moduleId === choice.id ? 'active' : ''}
            aria-pressed={skill.moduleId === choice.id}
            aria-label={`${choice.label} ${choice.module.uniEquipName}`}
            data-gg-build-control={`module-${choice.id}`}
            disabled={!choice.unlocked || choice.levels.length === 0}
            onClick={() => onModuleChange(choice.id, choice.levels.at(-1) ?? 3)}
          >
            <span>{choice.label}</span><strong>{choice.module.uniEquipName}</strong>
          </button>)}
        </div>
        {compact && <button type="button" className="gg-compact-effect-trigger" aria-label="モジュール効果を表示"
          data-gg-build-control="module-effect"
          aria-haspopup="dialog" disabled={!selectedModule}
          onClick={() => onShowEffect('module')}>効果</button>}
        <label className="gg-build-level-control">
          <span>レベル</span>
          <select className="gg-build-level-select" aria-label="モジュールレベル"
            data-gg-build-control="module-level"
            disabled={!selectedModule}
            value={selectedModule ? skill.moduleApplication.moduleLevel : ''}
            onChange={(event) => {
              if (selectedModule) onModuleChange(selectedModule.id, Number(event.target.value))
            }}>
            {selectedModule
              ? selectedModule.levels.map((level) => <option key={level} value={level}>Lv.{level}</option>)
              : <option value="">—</option>}
          </select>
        </label>
        {!compact && <details className="gg-skill-effect gg-module-effect">
          <summary data-gg-build-control="module-effect">
            <span>モジュール効果</span>
            <span className="gg-skill-effect-disclosure" aria-hidden="true" />
          </summary>
          <div className="gg-skill-effect-body" tabIndex={0} role="region" aria-label="モジュール効果の説明"
            data-gg-build-control="module-effect-content">
            <GoldenglowModuleEffect application={skill.moduleApplication} />
          </div>
        </details>}
      </div>
      {resistance !== undefined && onResistanceChange && <label className="gg-resistance-slider">
        <span className="gg-resistance-slider-heading"><span><span className="gg-resistance-label-prefix">敵の</span>術耐性</span><strong>{format(resistance)}</strong></span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={resistance}
          aria-label="敵の術耐性"
          data-gg-build-control="resistance"
          onChange={(event) => onResistanceChange(event.target.valueAsNumber)}
        />
        <span className="gg-resistance-slider-ends" aria-hidden="true"><span>0</span><span>100</span></span>
      </label>}
    </>
  )
}
