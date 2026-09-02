import { useEffect, useId, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import type { OperatorDatabaseRecord } from '../lib/operatorDatabase'
import type { SkillClassificationOverride, SkillRecord } from '../types/skill'
import { OperatorStatRadar } from './OperatorStatRadar'
import { SkillClassifierPopover } from './SkillClassifierPopover'

interface Props {
  operator: OperatorDatabaseRecord
  comparisonOperators: ReadonlyArray<OperatorDatabaseRecord>
  skills: SkillRecord[]
  overrides: Record<string, SkillClassificationOverride>
  onOverride: (skillId: string, override: SkillClassificationOverride | null) => void
  onClose: () => void
}

const INTEGER_FORMATTER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 })
const DECIMAL_FORMATTER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 })

export function OperatorDetailModal({
  operator,
  comparisonOperators,
  skills,
  overrides,
  onOverride,
  onClose,
}: Props) {
  const [selectedClassifierSkillId, setSelectedClassifierSkillId] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const classifierTriggerRef = useRef<HTMLButtonElement | null>(null)
  const titleId = useId()
  const classifierPopoverId = `${useId()}-classifier-popover`
  const selectedClassifierSkill = selectedClassifierSkillId
    ? skills.find((skill) => skill.id === selectedClassifierSkillId) ?? null
    : null
  const selectedSkillDescription = selectedClassifierSkill
    ? operator.skills.find((skill) => skill.id === selectedClassifierSkill.skillId)?.description
    : undefined

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (!dialog.open) dialog.showModal()
    window.requestAnimationFrame(() => {
      titleRef.current?.focus()
    })
    const previousOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'

    return () => {
      document.documentElement.style.overflow = previousOverflow
      if (dialog.open) dialog.close()
    }
  }, [operator.operatorId])

  const openSkillClassification = (skill: SkillRecord, trigger: HTMLButtonElement) => {
    classifierTriggerRef.current = trigger
    setSelectedClassifierSkillId(skill.id)
  }

  const closeSkillClassification = () => {
    const trigger = classifierTriggerRef.current
    setSelectedClassifierSkillId(null)
    window.requestAnimationFrame(() => {
      if (trigger?.isConnected) trigger.focus()
    })
  }

  const requestClose = () => {
    if (selectedClassifierSkill) {
      closeSkillClassification()
      return
    }
    onClose()
  }

  const handleBackdropClick = (event: ReactMouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) requestClose()
  }

  return (
    <dialog
      ref={dialogRef}
      className="operator-detail-dialog"
      aria-labelledby={titleId}
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault()
        requestClose()
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        requestClose()
      }}
      onClick={handleBackdropClick}
    >
      <article className="operator-detail-modal" inert={selectedClassifierSkill ? true : undefined}>
        <header className="operator-detail-modal-header">
          <div>
            <span>OPERATOR DETAIL</span>
            <h2 ref={titleRef} id={titleId} tabIndex={-1}>{operator.name}</h2>
            <p>★{operator.rarity} · {operator.professionLabel} / {operator.subProfessionName}</p>
          </div>
          <button type="button" aria-label="オペレーター詳細を閉じる" onClick={onClose}>×</button>
        </header>

        <div className="operator-detail-modal-body">
          <section aria-labelledby={`${titleId}-stats`}>
            <div className="operator-detail-section-heading">
              <h3 id={`${titleId}-stats`}>基本ステータス</h3>
              <span>{operator.statsCondition}</span>
            </div>
            <dl className="operator-detail-stat-grid">
              <DetailValue label="HP" value={formatInteger(operator.stats.maxHp)} />
              <DetailValue label="攻撃力" value={formatInteger(operator.stats.attack)} />
              <DetailValue label="防御力" value={formatInteger(operator.stats.defense)} />
              <DetailValue label="術耐性" value={formatInteger(operator.stats.magicResistance)} />
              <DetailValue label="配置コスト" value={formatInteger(operator.stats.deploymentCost)} />
              <DetailValue label="ブロック数" value={formatInteger(operator.stats.blockCount)} />
              <DetailValue label="再配置時間" value={formatDecimal(operator.stats.redeployTime, '秒')} />
              <DetailValue label="攻撃速度" value={formatInteger(operator.stats.attackSpeed)} />
              <DetailValue label="攻撃間隔" value={formatDecimal(operator.stats.attackInterval, '秒')} />
            </dl>
            <OperatorStatRadar operator={operator} operators={comparisonOperators} />
          </section>

          <section aria-labelledby={`${titleId}-potentials`}>
            <h3 id={`${titleId}-potentials`}>潜在能力</h3>
            {operator.potentials.length > 0 ? (
              <ol className="operator-detail-list operator-potential-list" start={2}>
                {operator.potentials.map((potential) => (
                  <li key={potential.rank}>
                    <strong>潜在{potential.rank}</strong>
                    <p>{potential.description}</p>
                  </li>
                ))}
              </ol>
            ) : <EmptyDetail>潜在能力データはありません。</EmptyDetail>}
          </section>

          <section aria-labelledby={`${titleId}-talents`}>
            <h3 id={`${titleId}-talents`}>特性・素質</h3>
            {operator.traitDescription && (
              <div className="operator-trait-card">
                <strong>特性</strong>
                <p>{operator.traitDescription}</p>
              </div>
            )}
            {operator.talents.length > 0 ? (
              <ul className="operator-detail-list">
                {operator.talents.map((talent, index) => (
                  <li key={`${talent.name}:${index}`}>
                    <strong>{talent.name}</strong>
                    <p>{talent.description}</p>
                  </li>
                ))}
              </ul>
            ) : <EmptyDetail>表示できる素質はありません。</EmptyDetail>}
          </section>

          <section aria-labelledby={`${titleId}-skills`}>
            <div className="operator-detail-section-heading">
              <h3 id={`${titleId}-skills`}>スキル</h3>
              <span>スキル名を選ぶと分類情報を表示します</span>
            </div>
            {operator.skills.length > 0 ? (
              <ul className="operator-detail-list">
                {operator.skills.map((skill) => {
                  const classifierSkill = skills.find((candidate) => candidate.skillId === skill.id)
                  return (
                    <li key={`${skill.id}:${skill.index}`}>
                      <div className="operator-detail-item-heading">
                        {classifierSkill ? (
                          <button
                            type="button"
                            className="operator-skill-name-button"
                            data-classifier-skill-id={classifierSkill.id}
                            aria-haspopup="dialog"
                            aria-controls={classifierPopoverId}
                            aria-expanded={selectedClassifierSkill?.id === classifierSkill.id}
                            aria-label={`S${skill.index} ${skill.name}の分類情報を開く`}
                            onClick={(event) => openSkillClassification(classifierSkill, event.currentTarget)}
                          >
                            <strong>S{skill.index} {skill.name}</strong>
                          </button>
                        ) : (
                          <strong>S{skill.index} {skill.name}</strong>
                        )}
                        <span>初期SP {skill.initSp ?? '—'} / 必要SP {skill.spCost ?? '—'}</span>
                      </div>
                      <p>{skill.description}</p>
                    </li>
                  )
                })}
              </ul>
            ) : <EmptyDetail>スキルデータはありません。</EmptyDetail>}
          </section>

          <section aria-labelledby={`${titleId}-modules`}>
            <h3 id={`${titleId}-modules`}>モジュール</h3>
            {operator.modules.length > 0 ? (
              <ul className="operator-detail-list">
                {operator.modules.map((module) => (
                  <li key={module.id}>
                    <div className="operator-detail-item-heading">
                      <strong>{module.name}</strong>
                      <span>{module.typeLabel} · {module.unlockLabel}</span>
                    </div>
                    {module.effects.length > 0 ? (
                      <ol
                        className="operator-module-effect-levels"
                        aria-label={`${module.name}のレベル別効果`}
                      >
                        {module.effects.map((effect) => (
                          <li key={`${module.id}:${effect.level}`}>
                            <strong>Lv.{effect.level}</strong>
                            <ModuleEffectGroup label="能力値補正" values={effect.attributeBonuses} />
                            <ModuleEffectGroup label="特性変更" values={effect.traitChanges} />
                            <ModuleEffectGroup label="素質変更" values={effect.talentChanges} />
                          </li>
                        ))}
                      </ol>
                    ) : <p>表示できる効果データはありません。</p>}
                  </li>
                ))}
              </ul>
            ) : <EmptyDetail>実装済みモジュールはありません。</EmptyDetail>}
          </section>

          <footer className="operator-detail-meta">
            <span>内部ID</span>
            <code>{operator.operatorId}</code>
          </footer>
        </div>
      </article>

      {selectedClassifierSkill && (
        <SkillClassifierPopover
          key={selectedClassifierSkill.id}
          id={classifierPopoverId}
          skill={selectedClassifierSkill}
          description={selectedSkillDescription}
          override={overrides[selectedClassifierSkill.id]}
          onOverride={(override) => onOverride(selectedClassifierSkill.id, override)}
          onClose={closeSkillClassification}
        />
      )}
    </dialog>
  )
}

function DetailValue({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>
}

function EmptyDetail({ children }: { children: string }) {
  return <p className="operator-detail-empty">{children}</p>
}

function ModuleEffectGroup({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) return null

  return (
    <div className="operator-module-effect-group">
      <span>{label}</span>
      <p>{values.join(' / ')}</p>
    </div>
  )
}

function formatInteger(value: number | null): string {
  return value === null ? '—' : INTEGER_FORMATTER.format(value)
}

function formatDecimal(value: number | null, suffix = ''): string {
  return value === null ? '—' : `${DECIMAL_FORMATTER.format(value)}${suffix}`
}
