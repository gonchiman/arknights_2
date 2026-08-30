import { useEffect, useId, useRef, type MouseEvent as ReactMouseEvent } from 'react'
import type { EnemyLevelType, EnemyRecord } from '../types/enemy'
import './EnemyDetailModal.css'

interface Props {
  enemy: EnemyRecord
  onClose: () => void
}

const LEVEL_LABELS: Record<EnemyLevelType, string> = {
  NORMAL: '通常',
  ELITE: 'エリート',
  BOSS: 'ボス',
  UNKNOWN: '未分類',
}

const DAMAGE_TYPE_LABELS: Record<string, string> = {
  PHYSIC: '物理',
  PHYSICAL: '物理',
  MAGIC: '術',
  ARTS: '術',
  PURE: '確定',
  NO_DAMAGE: '非攻撃',
  HEAL: '回復',
}

const ATTACK_WAY_LABELS: Record<string, string> = {
  MELEE: '近距離',
  RANGED: '遠距離',
  ALL: '近・遠距離',
  NONE: '攻撃なし',
}

const INTEGER_FORMATTER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 })
const DECIMAL_FORMATTER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 })

export function EnemyDetailModal({ enemy, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const titleId = useId()
  const damageTypes = enemy.damageTypes.length > 0
    ? enemy.damageTypes.map(getDamageTypeLabel).join('・')
    : '不明'
  const databaseLevel = enemy.databaseLevel === null ? '—' : `Lv.${formatInteger(enemy.databaseLevel)}`
  const databaseInfo = enemy.databaseLevelCount > 1
    ? `${databaseLevel} / ${formatInteger(enemy.databaseLevelCount)}段階`
    : databaseLevel

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
  }, [enemy.id])

  const handleBackdropClick = (event: ReactMouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      className="enemy-detail-dialog"
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
      <article className="enemy-detail-modal">
        <header className="enemy-detail-modal-header">
          <div>
            <span>ENEMY DETAIL</span>
            <h2 ref={titleRef} id={titleId} tabIndex={-1}>{enemy.name}</h2>
            <p>図鑑番号 {enemy.index || '—'} · {LEVEL_LABELS[enemy.levelType]}</p>
          </div>
          <button type="button" aria-label="敵の詳細を閉じる" onClick={onClose}>×</button>
        </header>

        <div className="enemy-detail-modal-body">
          <section className="enemy-detail-description" aria-labelledby={`${titleId}-description`}>
            <h3 id={`${titleId}-description`}>説明</h3>
            <p>{enemy.description || '説明はありません。'}</p>
          </section>

          <section aria-labelledby={`${titleId}-stats`}>
            <h3 id={`${titleId}-stats`}>基礎ステータス</h3>
            <dl className="enemy-detail-stat-grid">
              <EnemyDetailValue label="HP" value={formatInteger(enemy.stats.maxHp)} />
              <EnemyDetailValue label="攻撃力" value={formatInteger(enemy.stats.attack)} />
              <EnemyDetailValue label="防御力" value={formatInteger(enemy.stats.defense)} />
              <EnemyDetailValue label="術耐性" value={formatInteger(enemy.stats.magicResistance)} />
              <EnemyDetailValue label="移動速度" value={formatDecimal(enemy.stats.moveSpeed)} />
              <EnemyDetailValue label="攻撃間隔" value={formatDecimal(enemy.stats.baseAttackTime, '秒')} />
              <EnemyDetailValue label="攻撃速度" value={formatInteger(enemy.stats.attackSpeed)} />
              <EnemyDetailValue label="重量" value={formatInteger(enemy.stats.massLevel)} />
            </dl>
          </section>

          <section aria-labelledby={`${titleId}-combat`}>
            <h3 id={`${titleId}-combat`}>戦闘情報</h3>
            <dl className="enemy-detail-stat-grid enemy-detail-combat-grid">
              <EnemyDetailValue label="区分" value={LEVEL_LABELS[enemy.levelType]} />
              <EnemyDetailValue label="攻撃種別" value={damageTypes} />
              <EnemyDetailValue label="攻撃範囲" value={getAttackWayLabel(enemy.attackWay)} />
              <EnemyDetailValue label="耐久値減少" value={formatInteger(enemy.lifePointReduce)} />
              <EnemyDetailValue label="参照DBレベル" value={databaseInfo} />
            </dl>
          </section>

          <section aria-labelledby={`${titleId}-abilities`}>
            <h3 id={`${titleId}-abilities`}>能力・状態異常耐性</h3>
            <div className="enemy-detail-ability-grid">
              <div>
                <strong>能力</strong>
                {enemy.abilities.length > 0
                  ? <ul>{enemy.abilities.map((ability) => <li key={ability}>{ability}</li>)}</ul>
                  : <p>特記事項なし</p>}
              </div>
              <div>
                <strong>無効化する状態異常</strong>
                {enemy.statusImmunities.length > 0
                  ? <div className="enemy-detail-tags">{enemy.statusImmunities.map((immunity) => <span key={immunity}>{immunity}</span>)}</div>
                  : <p>なし</p>}
              </div>
            </div>
          </section>

          <footer className="enemy-detail-meta">
            <span>内部ID</span>
            <code>{enemy.id}</code>
          </footer>
        </div>
      </article>
    </dialog>
  )
}

function EnemyDetailValue({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>
}

function getDamageTypeLabel(value: string): string {
  return DAMAGE_TYPE_LABELS[value] ?? value
}

function getAttackWayLabel(value: string | null): string {
  if (!value) return '不明'
  return ATTACK_WAY_LABELS[value] ?? value
}

function formatInteger(value: number | null): string {
  return value === null ? '—' : INTEGER_FORMATTER.format(value)
}

function formatDecimal(value: number | null, suffix = ''): string {
  return value === null ? '—' : `${DECIMAL_FORMATTER.format(value)}${suffix}`
}
