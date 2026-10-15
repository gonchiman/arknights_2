import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import type { EnemyRecord } from '../types/enemy'
import type { SkillRecord } from '../types/skill'
import { getComparisonMaximumSkillLevelIndex, getComparisonMinimumPhaseIndex } from '../lib/operatorBuildComparison'
import { getOperatorModuleId, getOperatorModuleLevels, getOperatorModules, isOperatorModuleUnlocked } from '../lib/operatorModules'
import { getSkillLevelLabel } from '../lib/skillJsonAnalysis'
import { getEnemyPickerCombatStats, getEnemyPickerDamageTypeLabel } from '../lib/enemyPicker'
import {
  createSurtrDurationEnemyParticipant,
  createSurtrDurationHealerParticipant,
  deriveSurtrDurationParticipants,
  getSurtrDurationEnemySupportReason,
  getSurtrDurationHealerOptions,
  getSurtrDurationHealerSkillOptions,
  type SurtrDurationCondition,
  type SurtrDurationEnemyParticipant,
  type SurtrDurationHealerParticipant,
} from '../lib/surtrDurationParticipants'
import { GoldenglowDetailModal } from './GoldenglowDetailModal'
import { EnemyPicker } from './EnemyPicker'
import './SurtrDurationConditionEditor.css'

const MAX_PARTICIPANTS = 8
const format = (value: number) => new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 }).format(value)
const time = (value: number) => `${format(value)}秒`
const getEnemyDisabledReason = (enemy: EnemyRecord) => getEnemyPickerCombatStats(enemy).damageType === 'NO_ATTACK'
  ? '通常攻撃を行わない敵です。' : getSurtrDurationEnemySupportReason(enemy)

type Editor =
  | { kind: 'surtr'; value: Pick<SurtrDurationCondition, 'settings' | 'moduleId' | 'moduleLevel'> }
  | { kind: 'enemy'; adding: boolean; value: SurtrDurationEnemyParticipant | null }
  | { kind: 'healer'; adding: boolean; value: SurtrDurationHealerParticipant }

export interface SurtrDurationConditionEditorProps {
  record: SkillRecord
  skillRows: readonly SkillRecord[]
  enemyRows: readonly EnemyRecord[]
  enemyLoading?: boolean
  enemyError?: string | null
  onEnemyRetry?: () => void
  value: SurtrDurationCondition
  onChange: (value: SurtrDurationCondition) => void
  onSubmit: () => void
  submitLabel?: string
  onCancelEdit?: () => void
  disabled?: boolean
  submitDisabled?: boolean
  footerFields?: ReactNode
}

/** The row editor is a draft: cancelling never adds or changes a participant. */
export function SurtrDurationConditionEditor({ record, skillRows, enemyRows, enemyLoading = false, enemyError = null, onEnemyRetry = () => {}, value, onChange, onSubmit,
  submitLabel = '線を追加', onCancelEdit, disabled = false, submitDisabled = false, footerFields }: SurtrDurationConditionEditorProps) {
  const [editor, setEditor] = useState<Editor | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const addEnemyRef = useRef<HTMLButtonElement>(null)
  const addHealerRef = useRef<HTMLButtonElement>(null)
  const healerOptions = useMemo(() => getSurtrDurationHealerOptions(skillRows), [skillRows])
  const modules = useMemo(() => getOperatorModules(record.operatorProfile).map((module, index) => ({
    id: getOperatorModuleId(module, index), module,
  })), [record])
  const currentModule = modules.find(item => item.id === value.moduleId)
  const moduleLabel = currentModule ? `MOD ${currentModule.module.typeName2} Lv.${value.moduleLevel}` : '未装備'
  const skillLabel = getSkillLevelLabel(value.settings.skillLevelIndex, record.skillLevels.length)
  const draftErrors = useMemo(() => deriveSurtrDurationParticipants(record, value, enemyRows, skillRows).unsupportedReasons,
    [record, value, enemyRows, skillRows])

  const remove = (kind: 'enemy' | 'healer', id: string) => {
    const source = kind === 'enemy' ? value.enemies : value.healers
    const index = source.findIndex(item => item.id === id)
    const remaining = source.filter(item => item.id !== id)
    onChange(kind === 'enemy' ? { ...value, enemies: value.enemies.filter(item => item.id !== id) }
      : { ...value, healers: value.healers.filter(item => item.id !== id) })
    const nextId = remaining[Math.min(index, remaining.length - 1)]?.id
    window.requestAnimationFrame(() => {
      const button = nextId ? Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[data-participant-id]') ?? [])
        .find(item => item.dataset.participantId === nextId) : undefined
      const target = button ?? (kind === 'enemy' ? addEnemyRef.current : addHealerRef.current)
      target?.focus({ preventScroll: true })
    })
  }

  const apply = (updated: Editor) => {
    if (updated.kind === 'surtr') onChange({ ...value, ...updated.value })
    else if (updated.kind === 'enemy') {
      const participant = updated.value
      if (!participant) return
      onChange({ ...value, enemies: updated.adding
        ? [...value.enemies, participant] : value.enemies.map(item => item.id === participant.id ? participant : item) })
    }
    else onChange({ ...value, healers: updated.adding
      ? [...value.healers, updated.value] : value.healers.map(item => item.id === updated.value.id ? updated.value : item) })
    setEditor(null)
  }

  return <div className="surtr-duration-condition-editor">
    <div className="surtr-duration-condition-toolbar">
      <button ref={addEnemyRef} type="button" className="button secondary" aria-haspopup="dialog"
        disabled={disabled || value.enemies.length >= MAX_PARTICIPANTS}
        onClick={() => setEditor({ kind: 'enemy', adding: true, value: null })}>敵を追加</button>
      <button ref={addHealerRef} type="button" className="button secondary" aria-haspopup="dialog"
        disabled={disabled || !healerOptions.length || value.healers.length >= MAX_PARTICIPANTS} onClick={() => {
          const participant = createSurtrDurationHealerParticipant(skillRows)
          if (participant) setEditor({ kind: 'healer', adding: true, value: participant })
        }}>回復役を追加</button>
    </div>
    <div className="surtr-duration-condition-scroll" ref={listRef} role="region" aria-label="選択した対象と条件" tabIndex={0}>
      <table className="surtr-duration-condition-table">
        <thead><tr><th scope="col">役割</th><th scope="col">対象</th><th scope="col">条件</th><th scope="col">初回</th><th scope="col">操作</th></tr></thead>
        <tbody>
          <tr><td>分析対象</td><th scope="row">スルト</th><td>昇進2 Lv.{value.settings.level}・信頼{value.settings.trust}・潜在{value.settings.potential}・{skillLabel}・{moduleLabel}</td><td>—</td>
            <td><div className="surtr-duration-condition-actions"><button type="button" aria-haspopup="dialog" aria-label="スルトの条件を編集" disabled={disabled}
              onClick={() => setEditor({ kind: 'surtr', value: structuredClone({ settings: value.settings, moduleId: value.moduleId, moduleLevel: value.moduleLevel }) })}>編集</button></div></td></tr>
          {value.enemies.map((participant, index) => {
            const enemy = enemyRows.find(item => item.id === participant.enemyId)
            return <tr key={participant.id}><td>敵</td><th scope="row">{enemy?.name ?? '未選択'}</th>
              <td>{participant.count}体・通常攻撃{enemy?.databaseLevelCount && enemy.databaseLevelCount > 1 ? `・Lv.${enemy.databaseLevel ?? 0}` : ''}</td><td>{time(participant.firstTime)}</td>
              <td><div className="surtr-duration-condition-actions"><button type="button" data-participant-id={participant.id} aria-haspopup="dialog"
                aria-label={`敵${index + 1} ${enemy?.name ?? ''}の条件を編集`} disabled={disabled}
                onClick={() => setEditor({ kind: 'enemy', adding: false, value: { ...participant } })}>編集</button>
                <button type="button" aria-label={`敵${index + 1} ${enemy?.name ?? ''}を削除`} disabled={disabled} onClick={() => remove('enemy', participant.id)}>削除</button></div></td></tr>
          })}
          {value.healers.map((participant, index) => {
            const option = healerOptions.find(item => item.operatorId === participant.operatorId)
            const skill = option?.records.find(item => item.skillId === participant.skillId)
            return <tr key={participant.id}><td>回復役</td><th scope="row">{option?.name ?? '未選択'}</th>
              <td>昇進{participant.phaseIndex} Lv.{participant.level}・{skill ? `S${skill.skillIndex} ${getSkillLevelLabel(participant.skillLevelIndex, skill.skillLevels.length)}` : '通常回復'}{skill ? `・発動${time(participant.skillStart)}` : ''}</td><td>{time(participant.firstTime)}</td>
              <td><div className="surtr-duration-condition-actions"><button type="button" data-participant-id={participant.id} aria-haspopup="dialog"
                aria-label={`回復役${index + 1} ${option?.name ?? ''}の条件を編集`} disabled={disabled}
                onClick={() => setEditor({ kind: 'healer', adding: false, value: { ...participant } })}>編集</button>
                <button type="button" aria-label={`回復役${index + 1} ${option?.name ?? ''}を削除`} disabled={disabled} onClick={() => remove('healer', participant.id)}>削除</button></div></td></tr>
          })}
        </tbody>
      </table>
    </div>
    <form className="surtr-duration-condition-footer" onSubmit={event => { event.preventDefault(); if (event.currentTarget.reportValidity() && !disabled && !submitDisabled && !draftErrors.length) onSubmit() }}>
      <label className="calculator-field surtr-duration-line-name"><span>線名</span>
        <input type="text" maxLength={80} value={value.name} placeholder="自動" disabled={disabled}
          onChange={event => onChange({ ...value, name: event.target.value })} /></label>
      {footerFields}
      <div className="surtr-duration-condition-submit">
        {onCancelEdit && <button type="button" className="button secondary" disabled={disabled} onClick={onCancelEdit}>キャンセル</button>}
        <button type="submit" className="button" disabled={disabled || submitDisabled || !!draftErrors.length}>{submitLabel}</button>
      </div>
    </form>
    {draftErrors.length > 0 && <ul className="surtr-duration-condition-errors" role="alert">{draftErrors.map((reason, index) => <li key={index}>{reason}</li>)}</ul>}
    {editor && <ParticipantDialog key={`${editor.kind}:${editor.kind === 'surtr' ? 'surtr' : editor.value?.id ?? 'new-enemy'}`}
      initial={editor} condition={value} record={record} enemyRows={enemyRows} skillRows={skillRows}
      enemyLoading={enemyLoading} enemyError={enemyError} onEnemyRetry={onEnemyRetry}
      onClose={() => setEditor(null)} onApply={apply} />}
  </div>
}

function ParticipantDialog({ initial, condition, record, enemyRows, skillRows, enemyLoading, enemyError, onEnemyRetry, onClose, onApply }: {
  initial: Editor; condition: SurtrDurationCondition; record: SkillRecord; enemyRows: readonly EnemyRecord[]; skillRows: readonly SkillRecord[]
  enemyLoading: boolean; enemyError: string | null; onEnemyRetry: () => void
  onClose: () => void; onApply: (editor: Editor) => void
}) {
  const [draft, setDraft] = useState<Editor>(() => structuredClone(initial))
  const [enemyPane, setEnemyPane] = useState<'picker' | 'conditions'>(initial.kind === 'enemy' && initial.adding ? 'picker' : 'conditions')
  const enemyTimeEdited = useRef(initial.kind === 'enemy' && !initial.adding)
  const enemyPickerRef = useRef<HTMLDivElement>(null)
  const firstFieldRef = useRef<HTMLInputElement | HTMLSelectElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const healerOptions = useMemo(() => getSurtrDurationHealerOptions(skillRows), [skillRows])
  const modules = useMemo(() => getOperatorModules(record.operatorProfile).map((module, index) => ({ id: getOperatorModuleId(module, index), module })), [record])
  const draftCondition: SurtrDurationCondition = { ...condition, enemies: [], healers: [],
    ...(draft.kind === 'surtr' ? draft.value : draft.kind === 'enemy' ? { enemies: draft.value ? [draft.value] : [] } : { healers: [draft.value] }) }
  const preview = deriveSurtrDurationParticipants(record, draftCondition, enemyRows, skillRows)
  const choosingEnemy = draft.kind === 'enemy' && enemyPane === 'picker'
  const title = draft.kind === 'surtr' ? 'スルトの条件' : draft.kind === 'enemy' ? choosingEnemy ? '敵を選ぶ' : '敵の条件' : '回復役の条件'
  const apply = () => {
    if (choosingEnemy || draft.kind === 'enemy' && !draft.value) return
    if (formRef.current?.reportValidity() && !preview.unsupportedReasons.length) onApply(structuredClone(draft))
  }
  const setEnemy = (changes: Partial<SurtrDurationEnemyParticipant>) => setDraft(current => current.kind === 'enemy' && current.value ? { ...current, value: { ...current.value, ...changes } } : current)
  const setHealer = (changes: Partial<SurtrDurationHealerParticipant>) => setDraft(current => current.kind === 'healer' ? { ...current, value: { ...current.value, ...changes } } : current)
  const selectEnemy = (enemy: EnemyRecord) => {
    if (getSurtrDurationEnemySupportReason(enemy)) return
    setDraft(current => {
      if (current.kind !== 'enemy') return current
      const participant = current.value ?? createSurtrDurationEnemyParticipant(enemy)
      const firstTime = current.adding && !enemyTimeEdited.current
        ? createSurtrDurationEnemyParticipant(enemy, participant.id).firstTime : participant.firstTime
      return { ...current, value: { ...participant, enemyId: enemy.id, firstTime } }
    })
    setEnemyPane('conditions')
  }
  useEffect(() => {
    if (draft.kind !== 'enemy') return
    const frame = window.requestAnimationFrame(() => {
      const target = enemyPane === 'picker'
        ? enemyPickerRef.current?.querySelector<HTMLButtonElement>('tr[aria-current="true"] button:not(:disabled)')
          ?? enemyPickerRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')
        : firstFieldRef.current
      target?.closest('.gg-detail-body')?.scrollTo({ top: 0 })
      target?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [enemyPane, draft.kind])

  return <GoldenglowDetailModal title={title} closeLabel={`${title}を閉じる`} onClose={onClose}
    initialFocusRef={firstFieldRef} className={`surtr-duration-participant-dialog${draft.kind === 'enemy' ? ' surtr-duration-enemy-dialog' : ''}`}>
    {draft.kind === 'enemy' && <div ref={enemyPickerRef} hidden={!choosingEnemy}>
      <EnemyPicker enemies={enemyRows} loading={enemyLoading} error={enemyError} onRetry={onEnemyRetry}
        selectedEnemyId={draft.value?.enemyId} variant="combat" getSelectDisabledReason={getEnemyDisabledReason}
        onSelect={selectEnemy} />
      <div className="surtr-duration-participant-dialog-actions surtr-duration-enemy-picker-actions">
        <button type="button" className="button secondary" onClick={onClose}>キャンセル</button>
      </div>
    </div>}
    <form ref={formRef} hidden={choosingEnemy} className="surtr-duration-participant-form" onSubmit={event => { event.preventDefault(); apply() }}>
      {draft.kind === 'surtr' && (() => {
        const selectedModule = modules.find(item => item.id === draft.value.moduleId)
        const setSettings = (changes: Partial<SurtrDurationCondition['settings']>) => setDraft(current => current.kind === 'surtr'
          ? { ...current, value: { ...current.value, settings: { ...current.value.settings, ...changes } } } : current)
        return <div className="surtr-duration-participant-fields">
          <NumberField label="オペレーターレベル" value={draft.value.settings.level} min={1} max={record.operatorProfile.phases[2]?.maxLevel ?? 90}
            onChange={level => setSettings({ level })} />
          <NumberField label="信頼度（%）" value={draft.value.settings.trust} min={0} max={100} onChange={trust => setSettings({ trust })} />
          <label className="calculator-field"><span>潜在</span><select ref={firstFieldRef as RefObject<HTMLSelectElement | null>} value={draft.value.settings.potential}
            onChange={event => setSettings({ potential: Number(event.target.value) })}>{[1, 2, 3, 4, 5, 6].map(potential => <option key={potential} value={potential}>潜在{potential}</option>)}</select></label>
          <label className="calculator-field"><span>スキルレベル</span><select value={draft.value.settings.skillLevelIndex}
            onChange={event => setSettings({ skillLevelIndex: Number(event.target.value) })}>{record.skillLevels.map((_, index) => <option key={index} value={index}>{getSkillLevelLabel(index, record.skillLevels.length)}</option>)}</select></label>
          <label className="calculator-field"><span>モジュール</span><select value={draft.value.moduleId} onChange={event => {
            const selected = modules.find(item => item.id === event.target.value)
            setDraft(current => current.kind === 'surtr' ? { ...current, value: { ...current.value, moduleId: event.target.value, moduleLevel: getOperatorModuleLevels(selected?.module).at(-1) ?? 3 } } : current)
          }}><option value="">未装備</option>{modules.map(({ id, module }) => <option key={id} value={id}
            disabled={!isOperatorModuleUnlocked(module, 2, draft.value.settings.level)}>MOD {module.typeName2} · {module.uniEquipName}</option>)}</select></label>
          <label className="calculator-field"><span>モジュールレベル</span><select disabled={!selectedModule} value={selectedModule ? draft.value.moduleLevel : ''}
            onChange={event => setDraft(current => current.kind === 'surtr' ? { ...current, value: { ...current.value, moduleLevel: Number(event.target.value) } } : current)}>
            {selectedModule ? getOperatorModuleLevels(selectedModule.module).map(level => <option key={level} value={level}>Lv.{level}</option>) : <option value="">—</option>}</select></label>
        </div>
      })()}
      {draft.kind === 'enemy' && draft.value && (() => {
        const participant = draft.value!
        const selected = preview.enemies[0]
        const enemy = enemyRows.find(item => item.id === participant.enemyId)
        const stats = enemy ? getEnemyPickerCombatStats(enemy) : null
        return <>
          <div className="surtr-duration-selected-enemy"><strong>{enemy?.name ?? '未選択'}{enemy?.index ? `（${enemy.index}）` : ''}{enemy && enemy.databaseLevelCount > 1 ? ` Lv.${enemy.databaseLevel ?? 0}` : ''}</strong>
            <button type="button" className="button secondary" onClick={() => setEnemyPane('picker')}>敵を変更</button></div>
          {stats && <dl className="surtr-duration-participant-stats surtr-duration-enemy-stats">
            <div><dt>攻撃力</dt><dd>{stats.attack === null ? '—' : format(stats.attack)}</dd></div>
            <div><dt>攻撃種別</dt><dd>{getEnemyPickerDamageTypeLabel(stats.damageType)}</dd></div>
            <div><dt>攻撃間隔</dt><dd>{stats.interval === null ? '—' : time(stats.interval)}</dd></div>
            {selected && <div><dt>1体あたりの被ダメージ</dt><dd>{format(selected.amount)}</dd></div>}
          </dl>}
          <div className="surtr-duration-participant-fields"><NumberField inputRef={firstFieldRef as RefObject<HTMLInputElement | null>}
            label="数（体）" value={participant.count} min={1} max={100} onChange={count => setEnemy({ count })} />
            <NumberField label="最初の命中（秒）" value={participant.firstTime} min={0} step="any"
              onChange={firstTime => { enemyTimeEdited.current = true; setEnemy({ firstTime }) }} /></div>
        </>
      })()}
      {draft.kind === 'healer' && (() => {
        const option = healerOptions.find(item => item.operatorId === draft.value.operatorId)
        const skillOptions = getSurtrDurationHealerSkillOptions(skillRows, draft.value.operatorId)
        const profile = option?.records[0]?.operatorProfile
        const skill = option?.records.find(item => item.skillId === draft.value.skillId)
        const maximumSkillRank = skill ? getComparisonMaximumSkillLevelIndex(skill, draft.value.phaseIndex) : 0
        const selected = preview.healers[0]
        return <>
          <label className="calculator-field"><span>オペレーター</span><select ref={firstFieldRef as RefObject<HTMLSelectElement | null>} value={draft.value.operatorId} onChange={event => {
            const participant = createSurtrDurationHealerParticipant(skillRows, event.target.value, draft.value.id)
            if (participant) setDraft(current => current.kind === 'healer' ? { ...current, value: participant } : current)
          }}>{healerOptions.map(item => <option key={item.operatorId} value={item.operatorId}>{item.name}</option>)}</select></label>
          <div className="surtr-duration-participant-fields">
            <label className="calculator-field"><span>昇進段階</span><select value={draft.value.phaseIndex} onChange={event => {
              const phaseIndex = Number(event.target.value)
              const availableSkill = skill && getComparisonMinimumPhaseIndex(skill) <= phaseIndex ? skill : undefined
              setHealer({ phaseIndex, level: profile?.phases[phaseIndex]?.maxLevel ?? 1, skillId: availableSkill?.skillId ?? '',
                skillLevelIndex: availableSkill ? Math.min(draft.value.skillLevelIndex, getComparisonMaximumSkillLevelIndex(availableSkill, phaseIndex)) : 0 })
            }}>{profile?.phases.map((phase, index) => <option key={index} value={index}>昇進{index}（最大Lv.{phase.maxLevel ?? 1}）</option>)}</select></label>
            <NumberField label="オペレーターレベル" value={draft.value.level} min={1} max={profile?.phases[draft.value.phaseIndex]?.maxLevel ?? 1} onChange={level => setHealer({ level })} />
            <NumberField label="信頼度（%）" value={draft.value.trust} min={0} max={100} onChange={trust => setHealer({ trust })} />
            <label className="calculator-field"><span>潜在</span><select value={draft.value.potential} onChange={event => setHealer({ potential: Number(event.target.value) })}>{[1, 2, 3, 4, 5, 6].map(potential => <option key={potential} value={potential}>潜在{potential}</option>)}</select></label>
            <label className="calculator-field"><span>回復方法</span><select value={draft.value.skillId} onChange={event => {
              const selectedSkill = option?.records.find(item => item.skillId === event.target.value)
              setHealer({ skillId: event.target.value, skillLevelIndex: selectedSkill ? getComparisonMaximumSkillLevelIndex(selectedSkill, draft.value.phaseIndex) : 0, skillFirstTime: undefined })
            }}><option value="">通常回復</option>{skillOptions.map(item => <option key={item.skillId} value={item.skillId}
              disabled={!item.supported || getComparisonMinimumPhaseIndex(item.record) > draft.value.phaseIndex} title={item.reason ?? undefined}>{item.label}{!item.supported ? '（未対応）' : ''}</option>)}</select></label>
            {skill && <label className="calculator-field"><span>スキルレベル</span><select value={draft.value.skillLevelIndex} onChange={event => setHealer({ skillLevelIndex: Number(event.target.value) })}>
              {skill.skillLevels.slice(0, maximumSkillRank + 1).map((_, index) => <option key={index} value={index}>{getSkillLevelLabel(index, skill.skillLevels.length)}</option>)}</select></label>}
            <NumberField label="最初の回復（秒）" value={draft.value.firstTime} min={0} step="any" onChange={firstTime => setHealer({ firstTime })} />
            {skill && <><NumberField label="スキル発動（秒）" value={draft.value.skillStart} min={0} step="any" onChange={skillStart => setHealer({ skillStart })} />
              <label className="calculator-field"><span>スキル中の最初の回復（秒）</span><input type="number" min={Number.isFinite(draft.value.skillStart) ? draft.value.skillStart : 0} step="any"
                value={draft.value.skillFirstTime ?? ''} placeholder={selected?.skillInterval != null ? `自動（${format(draft.value.skillStart + selected.skillInterval)}秒）` : '自動'}
                onChange={event => setHealer({ skillFirstTime: event.target.value === '' ? undefined : event.target.valueAsNumber })} /></label></>}
          </div>
          {selected && <dl className="surtr-duration-participant-stats"><div><dt>通常の回復量</dt><dd>{format(selected.amount)}</dd></div><div><dt>回復間隔</dt><dd>{time(selected.interval)}</dd></div>
            {skill && selected.skillAmount !== null && selected.skillInterval !== null && selected.skillDuration !== null && <><div><dt>スキル中の回復量</dt><dd>{format(selected.skillAmount)}</dd></div><div><dt>スキル中の間隔</dt><dd>{time(selected.skillInterval)}</dd></div><div><dt>スキル持続時間</dt><dd>{time(selected.skillDuration)}</dd></div></>}</dl>}
          <details className="surtr-duration-participant-help"><summary>回復役の対応範囲・タイミング</summary>
            <p>現在はアンセル・ハイビスカス・ススーロを選択できます。通常回復と対応済みのスキル効果を計算し、回復対象はスルト1人とします。回復役のMODは未装備です。</p>
            <p>スキルは指定時刻に1回発動します。回復は一定間隔の近似です。スキル中の最初の回復を省略すると、発動からスキル中の回復間隔1回分の後に回復します。終了後は通常の回復間隔1回分の後から通常回復に戻ります。SPや実機の攻撃CTの引き継ぎは再現していません。</p>
          </details>
        </>
      })()}
      {preview.unsupportedReasons.length > 0 && <ul className="surtr-duration-condition-errors" role="alert">{preview.unsupportedReasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul>}
      <div className="surtr-duration-participant-dialog-actions"><button type="button" className="button secondary" onClick={onClose}>キャンセル</button>
        <button type="submit" className="button" disabled={!!preview.unsupportedReasons.length}>適用</button></div>
    </form>
  </GoldenglowDetailModal>
}

function NumberField({ label, value, min, max, step = 1, inputRef, onChange }: {
  label: string; value: number; min: number; max?: number; step?: number | 'any'; inputRef?: RefObject<HTMLInputElement | null>; onChange: (value: number) => void
}) {
  return <label className="calculator-field"><span>{label}</span><input ref={inputRef} aria-label={label} type="number" min={min} max={max} step={step} required
    value={Number.isFinite(value) ? value : ''} onChange={event => onChange(event.target.valueAsNumber)} /></label>
}
