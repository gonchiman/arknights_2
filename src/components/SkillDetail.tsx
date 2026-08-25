import {
  ACTIVATION_TRIGGER_LABELS,
  ACTIVATION_TRIGGER_OPTIONS,
  DAMAGE_COMPONENT_LABELS,
  DAMAGE_COMPONENT_OPTIONS,
  EFFECT_WINDOW_LABELS,
  EFFECT_WINDOW_OPTIONS,
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

interface Props {
  skill: SkillRecord | null
  override?: SkillClassificationOverride
  onOverride: (override: SkillClassificationOverride | null) => void
}

type OverrideField = keyof SkillClassificationOverride

export function SkillDetail({ skill, override, onOverride }: Props) {
  if (!skill) return <aside className="detail-pane"><p className="empty-state">スキルを選択してください。</p></aside>

  const classification = skill.classification
  const outputLabels = getOutputCapabilityLabels(classification.outputCapabilities)

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

  return (
    <aside className="detail-pane">
      <p className="eyebrow">{skill.operatorName} · S{skill.skillIndex} · ★{skill.rarity}</p>
      <h2>{skill.skillName}</h2>
      <p className="description">{skill.description || '説明文なし'}</p>

      <section className="classification-card">
        <ClassificationField
          title="効果の終了条件"
          field={classification.effectWindow}
          valueLabel={EFFECT_WINDOW_LABELS[classification.effectWindow.value]}
          isOverridden={override?.effectWindow !== undefined}
          onReset={() => resetField('effectWindow')}
        >
          <select
            aria-label="効果の終了条件を手動修正"
            value={classification.effectWindow.value}
            onChange={(event) => setField('effectWindow', event.target.value as EffectWindowType)}
          >
            {EFFECT_WINDOW_OPTIONS.map(([type, label]) => <option key={type} value={type}>{label}</option>)}
          </select>
        </ClassificationField>

        <ClassificationField
          title="発動契機"
          field={classification.activationTrigger}
          valueLabel={ACTIVATION_TRIGGER_LABELS[classification.activationTrigger.value]}
          isOverridden={override?.activationTrigger !== undefined}
          onReset={() => resetField('activationTrigger')}
        >
          <select
            aria-label="発動契機を手動修正"
            value={classification.activationTrigger.value}
            onChange={(event) => setField('activationTrigger', event.target.value as ActivationTriggerType)}
          >
            {ACTIVATION_TRIGGER_OPTIONS.map(([type, label]) => <option key={type} value={type}>{label}</option>)}
          </select>
        </ClassificationField>

        <ClassificationField
          title="ダメージ構成（複数可）"
          field={classification.damageComponents}
          valueLabel={classification.damageComponents.value.map((value) => DAMAGE_COMPONENT_LABELS[value]).join('・')}
          isOverridden={override?.damageComponents !== undefined}
          onReset={() => resetField('damageComponents')}
        >
          <div className="choice-grid">
            {DAMAGE_COMPONENT_OPTIONS.map(([type, label]) => (
              <label className="check-option" key={type}>
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
          valueLabel={classification.conditions.value.length
            ? classification.conditions.value.map((value) => SKILL_CONDITION_LABELS[value]).join('・')
            : 'なし'}
          isOverridden={override?.conditions !== undefined}
          onReset={() => resetField('conditions')}
        >
          <div className="choice-grid">
            {SKILL_CONDITION_OPTIONS.map(([type, label]) => (
              <label className="check-option" key={type}>
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

        <div className="output-block">
          <strong>計算機で表示できる出力</strong>
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
        </div>

        {override && Object.keys(override).length > 0 && (
          <button className="text-button" onClick={() => onOverride(null)}>すべて自動判定に戻す</button>
        )}
      </section>

      <section className="detail-section">
        <h3>スキル情報</h3>
        <dl>
          <div><dt>skillId</dt><dd>{skill.skillId}</dd></div>
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
    </aside>
  )
}

interface ClassificationFieldProps<T> {
  title: string
  field: ClassifiedField<T>
  valueLabel: string
  isOverridden: boolean
  onReset: () => void
  children: React.ReactNode
}

function ClassificationField<T>({
  title,
  field,
  valueLabel,
  isOverridden,
  onReset,
  children,
}: ClassificationFieldProps<T>) {
  return (
    <div className="classification-dimension">
      <div className="dimension-heading">
        <strong>{title}</strong>
        <span className={`confidence ${field.confidence.toLowerCase()}`}>
          {field.source === 'MANUAL' ? 'manual' : field.confidence.toLowerCase()}
        </span>
      </div>
      <div className="tag-list"><span className="tag">{valueLabel}</span></div>
      <ul>{field.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
      <div className="manual-editor">{children}</div>
      {isOverridden && <button className="text-button small" onClick={onReset}>この項目を自動判定に戻す</button>}
    </div>
  )
}
