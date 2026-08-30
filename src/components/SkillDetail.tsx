import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import {
  ACTIVATION_TRIGGER_COLORS,
  ACTIVATION_TRIGGER_LABELS,
  ACTIVATION_TRIGGER_OPTIONS,
  DAMAGE_COMPONENT_COLORS,
  DAMAGE_COMPONENT_LABELS,
  DAMAGE_COMPONENT_OPTIONS,
  EFFECT_WINDOW_COLORS,
  EFFECT_WINDOW_LABELS,
  EFFECT_WINDOW_OPTIONS,
  NO_SKILL_CONDITION_COLOR,
  SKILL_CONDITION_COLORS,
  SKILL_CONDITION_LABELS,
  SKILL_CONDITION_OPTIONS,
  getOutputCapabilityLabels,
} from '../lib/classifier'
import type {
  ActivationTriggerType,
  ClassifiedField,
  DamageComponentType,
  EffectWindowType,
  SkillClassificationOverride,
  SkillConditionType,
  SkillRecord,
} from '../types/skill'

type DetailTab = 'summary' | 'classification' | 'data'
type OverrideField = keyof SkillClassificationOverride

interface Props {
  skill: SkillRecord
  operatorSkills: SkillRecord[]
  override?: SkillClassificationOverride
  onBack: () => void
  onSelectSkill: (skill: SkillRecord) => void
  onOverride: (override: SkillClassificationOverride | null) => void
}

const DETAIL_TABS: Array<[DetailTab, string]> = [
  ['summary', '概要'],
  ['classification', '分類・修正'],
  ['data', 'ゲームデータ'],
]

export function SkillDetail({ skill, operatorSkills, override, onBack, onSelectSkill, onOverride }: Props) {
  const [activeTab, setActiveTab] = useState<DetailTab>('summary')
  const titleRef = useRef<HTMLHeadingElement>(null)
  const classification = skill.classification
  const outputLabels = getOutputCapabilityLabels(classification.outputCapabilities)

  useEffect(() => {
    window.requestAnimationFrame(() => titleRef.current?.focus())
  }, [skill.id])

  useEffect(() => {
    if (!window.matchMedia('(max-width: 760px)').matches) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onBack()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onBack])

  const setField = <K extends OverrideField>(field: K, value: SkillClassificationOverride[K]) => {
    onOverride({ ...override, [field]: value })
  }

  const resetField = (field: OverrideField) => {
    const next = { ...override }
    delete next[field]
    onOverride(Object.keys(next).length ? next : null)
  }

  const toggleDamageComponent = (component: DamageComponentType) => {
    const current = classification.damageComponents.value
    let next: DamageComponentType[]
    if (current.includes(component)) {
      next = current.filter((value) => value !== component)
      if (next.length === 0) next = ['NO_DIRECT_DAMAGE']
    } else if (component === 'NO_DIRECT_DAMAGE' || component === 'UNKNOWN') {
      next = [component]
    } else {
      next = [...current.filter((value) => value !== 'NO_DIRECT_DAMAGE' && value !== 'UNKNOWN'), component]
    }
    setField('damageComponents', next)
  }

  const toggleCondition = (condition: SkillConditionType) => {
    const current = classification.conditions.value
    const next = current.includes(condition)
      ? current.filter((value) => value !== condition)
      : [...current, condition]
    setField('conditions', next)
  }

  const handleTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % DETAIL_TABS.length
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + DETAIL_TABS.length) % DETAIL_TABS.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = DETAIL_TABS.length - 1
    if (nextIndex === null) return

    event.preventDefault()
    const [nextTab] = DETAIL_TABS[nextIndex]
    setActiveTab(nextTab)
    window.requestAnimationFrame(() => document.getElementById(`detail-tab-${nextTab}`)?.focus())
  }

  return (
    <section className="detail-page">
      <button className="back-button" onClick={onBack}>← オペレーター一覧に戻る</button>

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

      <div className="detail-tabs" role="tablist" aria-label="スキル詳細">
        {DETAIL_TABS.map(([tab, label], index) => (
          <button
            id={`detail-tab-${tab}`}
            className={`detail-tab ${activeTab === tab ? 'active' : ''}`}
            role="tab"
            aria-selected={activeTab === tab}
            aria-controls={`detail-panel-${tab}`}
            tabIndex={activeTab === tab ? 0 : -1}
            onClick={() => setActiveTab(tab)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
            key={tab}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        id="detail-panel-summary"
        className="detail-tab-panel"
        role="tabpanel"
        aria-labelledby="detail-tab-summary"
        hidden={activeTab !== 'summary'}
      >
          <section className="overview-section">
            <h2>スキル説明</h2>
            <p className="description">{skill.description || '説明文なし'}</p>
          </section>

          <section className="classification-summary-grid">
            <SummaryDimension
              title="効果の終了条件"
              labels={[EFFECT_WINDOW_LABELS[classification.effectWindow.value]]}
              colors={[EFFECT_WINDOW_COLORS[classification.effectWindow.value]]}
              field={classification.effectWindow}
            />
            <SummaryDimension
              title="発動契機"
              labels={[ACTIVATION_TRIGGER_LABELS[classification.activationTrigger.value]]}
              colors={[ACTIVATION_TRIGGER_COLORS[classification.activationTrigger.value]]}
              field={classification.activationTrigger}
            />
            <SummaryDimension
              title="ダメージ構成"
              labels={classification.damageComponents.value.map((value) => DAMAGE_COMPONENT_LABELS[value])}
              colors={classification.damageComponents.value.map((value) => DAMAGE_COMPONENT_COLORS[value])}
              field={classification.damageComponents}
            />
            <SummaryDimension
              title="条件・段階"
              labels={classification.conditions.value.length
                ? classification.conditions.value.map((value) => SKILL_CONDITION_LABELS[value])
                : ['なし']}
              colors={classification.conditions.value.length
                ? classification.conditions.value.map((value) => SKILL_CONDITION_COLORS[value])
                : [NO_SKILL_CONDITION_COLOR]}
              field={classification.conditions}
            />
          </section>

          <section className="overview-section output-overview">
            <h2>計算機で表示できる出力</h2>
            <div className="tag-list">
              {outputLabels.length
                ? outputLabels.map((label) => <span className="tag output-tag" key={label}>{label}</span>)
                : <span className="muted">直接出力なし</span>}
            </div>
            {classification.requiresManualModelReasons.length > 0 && (
              <ul>
                {classification.requiresManualModelReasons.map((reason) => <li key={reason}>{reason}</li>)}
              </ul>
            )}
          </section>
      </div>

      <div
        id="detail-panel-classification"
        className="detail-tab-panel"
        role="tabpanel"
        aria-labelledby="detail-tab-classification"
        hidden={activeTab !== 'classification'}
      >
          <section className="classification-card editor-card">
            <ClassificationField
              title="効果の終了条件"
              field={classification.effectWindow}
              valueTags={[{
                label: EFFECT_WINDOW_LABELS[classification.effectWindow.value],
                color: EFFECT_WINDOW_COLORS[classification.effectWindow.value],
              }]}
              isOverridden={override?.effectWindow !== undefined}
              onReset={() => resetField('effectWindow')}
            >
              <select
                aria-label="効果の終了条件を手動修正"
                value={classification.effectWindow.value}
                style={getClassificationStyle(EFFECT_WINDOW_COLORS[classification.effectWindow.value])}
                onChange={(event) => setField('effectWindow', event.target.value as EffectWindowType)}
              >
                {EFFECT_WINDOW_OPTIONS.map(([type, label]) => (
                  <option key={type} value={type}>{label}</option>
                ))}
              </select>
            </ClassificationField>

            <ClassificationField
              title="発動契機"
              field={classification.activationTrigger}
              valueTags={[{
                label: ACTIVATION_TRIGGER_LABELS[classification.activationTrigger.value],
                color: ACTIVATION_TRIGGER_COLORS[classification.activationTrigger.value],
              }]}
              isOverridden={override?.activationTrigger !== undefined}
              onReset={() => resetField('activationTrigger')}
            >
              <select
                aria-label="発動契機を手動修正"
                value={classification.activationTrigger.value}
                style={getClassificationStyle(ACTIVATION_TRIGGER_COLORS[classification.activationTrigger.value])}
                onChange={(event) => setField('activationTrigger', event.target.value as ActivationTriggerType)}
              >
                {ACTIVATION_TRIGGER_OPTIONS.map(([type, label]) => (
                  <option key={type} value={type}>{label}</option>
                ))}
              </select>
            </ClassificationField>

            <ClassificationField
              title="ダメージ構成（複数可）"
              field={classification.damageComponents}
              valueTags={classification.damageComponents.value.map((value) => ({
                label: DAMAGE_COMPONENT_LABELS[value],
                color: DAMAGE_COMPONENT_COLORS[value],
              }))}
              isOverridden={override?.damageComponents !== undefined}
              onReset={() => resetField('damageComponents')}
            >
              <div className="choice-grid">
                {DAMAGE_COMPONENT_OPTIONS.map(([type, label]) => (
                  <label className="check-option classification-choice" style={getClassificationStyle(DAMAGE_COMPONENT_COLORS[type])} key={type}>
                    <input
                      type="checkbox"
                      checked={classification.damageComponents.value.includes(type)}
                      onChange={() => toggleDamageComponent(type)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </ClassificationField>

            <ClassificationField
              title="条件・段階（複数可）"
              field={classification.conditions}
              valueTags={classification.conditions.value.length
                ? classification.conditions.value.map((value) => ({
                  label: SKILL_CONDITION_LABELS[value],
                  color: SKILL_CONDITION_COLORS[value],
                }))
                : [{ label: 'なし', color: NO_SKILL_CONDITION_COLOR }]}
              isOverridden={override?.conditions !== undefined}
              onReset={() => resetField('conditions')}
            >
              <div className="choice-grid">
                {SKILL_CONDITION_OPTIONS.map(([type, label]) => (
                  <label className="check-option classification-choice" style={getClassificationStyle(SKILL_CONDITION_COLORS[type])} key={type}>
                    <input
                      type="checkbox"
                      checked={classification.conditions.value.includes(type)}
                      onChange={() => toggleCondition(type)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </ClassificationField>

            {override && Object.keys(override).length > 0 && (
              <button className="text-button" onClick={() => onOverride(null)}>すべて自動判定に戻す</button>
            )}
          </section>
      </div>

      <div
        id="detail-panel-data"
        className="detail-tab-panel"
        role="tabpanel"
        aria-labelledby="detail-tab-data"
        hidden={activeTab !== 'data'}
      >
          <section className="detail-section skill-data-section">
            <h2>スキル情報</h2>
            <dl>
              <div><dt>skillId</dt><dd>{skill.skillId}</dd></div>
              <div><dt>職業</dt><dd>{skill.professionLabel}</dd></div>
              <div><dt>職分</dt><dd>{skill.subProfessionName}</dd></div>
              <div><dt>duration</dt><dd>{skill.duration ?? 'null'}</dd></div>
              <div><dt>durationType</dt><dd>{skill.durationType}</dd></div>
              <div><dt>skillType</dt><dd>{skill.skillType}</dd></div>
              <div><dt>spType</dt><dd>{skill.spType}</dd></div>
              <div><dt>initSp</dt><dd>{skill.initSp ?? 'null'}</dd></div>
              <div><dt>spCost</dt><dd>{skill.spCost ?? 'null'}</dd></div>
            </dl>
          </section>

          <details className="raw-json">
            <summary>Raw JSON</summary>
            <pre>{JSON.stringify(skill.raw, null, 2)}</pre>
          </details>
      </div>
    </section>
  )
}

interface SummaryDimensionProps<T> {
  title: string
  labels: string[]
  colors: string[]
  field: ClassifiedField<T>
}

function SummaryDimension<T>({ title, labels, colors, field }: SummaryDimensionProps<T>) {
  return (
    <article className="summary-dimension">
      <div className="dimension-heading">
        <h2>{title}</h2>
        <span className={`confidence ${field.source === 'MANUAL' ? 'manual' : field.confidence.toLowerCase()}`}>
          {getConfidenceLabel(field)}
        </span>
      </div>
      <div className="tag-list">
        {labels.map((label, index) => (
          <span className="tag classification-tag" style={getClassificationStyle(colors[index])} key={label}>{label}</span>
        ))}
      </div>
    </article>
  )
}

interface ClassificationFieldProps<T> {
  title: string
  field: ClassifiedField<T>
  valueTags: Array<{ label: string, color: string }>
  isOverridden: boolean
  onReset: () => void
  children: ReactNode
}

function ClassificationField<T>({
  title,
  field,
  valueTags,
  isOverridden,
  onReset,
  children,
}: ClassificationFieldProps<T>) {
  return (
    <div className="classification-dimension">
      <div className="dimension-heading">
        <strong>{title}</strong>
        <span className={`confidence ${field.source === 'MANUAL' ? 'manual' : field.confidence.toLowerCase()}`}>
          {getConfidenceLabel(field)}
        </span>
      </div>
      <div className="tag-list">
        {valueTags.map(({ label, color }) => (
          <span className="tag classification-tag" style={getClassificationStyle(color)} key={label}>{label}</span>
        ))}
      </div>
      <ul>{field.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
      <div className="manual-editor">{children}</div>
      {isOverridden && <button className="text-button small" onClick={onReset}>この項目を自動判定に戻す</button>}
    </div>
  )
}

function getClassificationStyle(color: string): CSSProperties {
  return { '--classification-color': color } as CSSProperties
}

function getConfidenceLabel<T>(field: ClassifiedField<T>): string {
  if (field.source === 'MANUAL') return '手動'
  if (field.confidence === 'HIGH') return '高信頼'
  if (field.confidence === 'MEDIUM') return '中信頼'
  return '低信頼'
}
