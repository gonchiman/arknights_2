import { useId, useMemo, type ReactNode } from 'react'
import { buildSkillEffectFlow } from '../lib/skillEffectFlow'
import type { SkillStructure } from '../lib/skillStructure'
import './SkillEffectFlow.css'

type FlowModel = ReturnType<typeof buildSkillEffectFlow>
type FlowField = FlowModel['activation'][number]
type FlowStage = FlowModel['stages'][number]
type FlowGroup = FlowStage['groups'][number]
type FlowStep = FlowGroup['layers'][number][number]

/** A view of the same structured effects used by the structure tables. */
export function SkillEffectFlow({ structure }: { structure: SkillStructure }) {
  const model = useMemo(() => buildSkillEffectFlow(structure), [structure])
  const id = useId()
  const { operatorName, skillIndex, skillLevel } = structure.basicInfo
  return <div className="skill-effect-flow" aria-label={`${operatorName} S${skillIndex} ${skillLevel}の効果フロー`}>
    <FlowFields fields={model.activation} className="skill-effect-flow-activation" />
    <div className="skill-effect-flow-trigger"><span>発動契機</span><strong>{model.trigger}</strong></div>
    <div className="skill-effect-flow-stages">
      {model.stages.map((stage, index) => <section key={stage.id}
        className="skill-effect-flow-stage" aria-labelledby={`${id}-stage-${index}`}>
        <h3 id={`${id}-stage-${index}`} className="skill-effect-flow-stage-title">{stage.label}</h3>
        <FlowFields fields={[
          ...(stage.condition ? [{ label: '適用条件', value: stage.condition.label }] : []),
          ...stage.fields,
        ]} className="skill-effect-flow-stage-fields" />
        <div className="skill-effect-flow-groups">
          {stage.groups.map(group => <EffectGroup key={group.id} group={group} />)}
        </div>
        {!!stage.warnings?.length && <div className="skill-effect-flow-pending">
          <h4>保留事項</h4>
          <ul>{stage.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
        </div>}
      </section>)}
    </div>
  </div>
}

function EffectGroup({ group }: { group: FlowGroup }) {
  const id = useId()
  return <section className="skill-effect-flow-group" aria-labelledby={`${id}-title`}>
    <h4 id={`${id}-title`} className="skill-effect-flow-group-title">{group.label}</h4>
    <div className="skill-effect-flow-sequence">
      {group.layers.map((layer, index) => <div className="skill-effect-flow-layer-wrap" key={index}>
        {index > 0 && <FlowArrow />}
        <div className={`skill-effect-flow-layer${layer.length === 1 ? ' is-single' : ''}`}>
          {layer.map(step => <div key={step.id} className="skill-effect-flow-step" data-effect-id={step.id}>
            {step.condition ? <EffectBranch condition={step.condition} skipLabel={step.skipLabel ?? '適用なし'}>
              <EffectCard step={step} />
            </EffectBranch> : <EffectCard step={step} />}
          </div>)}
        </div>
      </div>)}
    </div>
  </section>
}

function EffectBranch({ condition, skipLabel, children }: {
  condition: NonNullable<FlowStep['condition']>
  skipLabel: string
  children: ReactNode
}) {
  const id = useId()
  return <div className="skill-effect-flow-branch" role="group" aria-labelledby={`${id}-decision`}>
    <div id={`${id}-decision`} className="skill-effect-flow-decision">{condition.label}</div>
    <div className="skill-effect-flow-fork" aria-hidden="true"><span /><span /></div>
    <div className="skill-effect-flow-paths">
      <section className="skill-effect-flow-path" aria-labelledby={`${id}-yes`}>
        <h5 id={`${id}-yes`}>{condition.yesLabel}</h5>
        {children}
      </section>
      <section className="skill-effect-flow-path" aria-labelledby={`${id}-no`}>
        <h5 id={`${id}-no`}>{condition.noLabel}</h5>
        <div className="skill-effect-flow-skip">{skipLabel}</div>
      </section>
    </div>
    <div className="skill-effect-flow-join" aria-hidden="true"><span /><span /></div>
  </div>
}

function EffectCard({ step }: { step: FlowStep }) {
  return <div className="skill-effect-flow-card">
    <h5>{step.title}</h5>
    <FlowFields fields={step.fields} />
  </div>
}

function FlowFields({ fields, className = '' }: { fields: readonly FlowField[]; className?: string }) {
  if (!fields.length) return null
  return <dl className={`skill-effect-flow-fields ${className}`.trim()}>
    {fields.map((field, index) => <div key={`${field.label}-${index}`}>
      <dt>{field.label}</dt><dd>{field.value}</dd>
    </div>)}
  </dl>
}

function FlowArrow() {
  return <div className="skill-effect-flow-arrow" aria-hidden="true" />
}
