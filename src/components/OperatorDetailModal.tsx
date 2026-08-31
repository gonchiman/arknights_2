import { useEffect, useId, useRef, type MouseEvent as ReactMouseEvent } from 'react'
import type { OperatorDatabaseRecord } from '../lib/operatorDatabase'

interface Props {
  operator: OperatorDatabaseRecord
  onClose: () => void
}

const INTEGER_FORMATTER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 })
const DECIMAL_FORMATTER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 })

export function OperatorDetailModal({ operator, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const titleId = useId()

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
  }, [operator.operatorId])

  const handleBackdropClick = (event: ReactMouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      className="operator-detail-dialog"
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
      <article className="operator-detail-modal">
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
            <h3 id={`${titleId}-skills`}>スキル</h3>
            {operator.skills.length > 0 ? (
              <ul className="operator-detail-list">
                {operator.skills.map((skill) => (
                  <li key={`${skill.id}:${skill.index}`}>
                    <div className="operator-detail-item-heading">
                      <strong>S{skill.index} {skill.name}</strong>
                      <span>初期SP {skill.initSp ?? '—'} / 必要SP {skill.spCost ?? '—'}</span>
                    </div>
                    <p>{skill.description}</p>
                  </li>
                ))}
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
                    <p>{module.description}</p>
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
    </dialog>
  )
}

function DetailValue({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>
}

function EmptyDetail({ children }: { children: string }) {
  return <p className="operator-detail-empty">{children}</p>
}

function formatInteger(value: number | null): string {
  return value === null ? '—' : INTEGER_FORMATTER.format(value)
}

function formatDecimal(value: number | null, suffix = ''): string {
  return value === null ? '—' : `${DECIMAL_FORMATTER.format(value)}${suffix}`
}
