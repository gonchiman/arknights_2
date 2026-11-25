import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { formatTdCell } from '../lib/tdCoordinates'
import { canPlaceTdOperatorAt, placeTdOperator, TD_DIRECTIONS, type TdDirection, type TdPlacedOperator } from '../lib/tdDeployment'
import { loadTdDeploymentRoster, type TdDeployOperator } from '../lib/tdDeploymentRoster'
import { loadTdRecentOperatorIds, rememberTdOperator } from '../lib/tdRecentOperators'
import type { MapDetail } from '../types/map'
import { PageOutputHeader } from './PageLayout'
import { TdDeploymentContext } from './TdDeploymentContext'
import { TdDeploymentPicker, TD_POSITION_LABEL } from './TdDeploymentPicker'
import { TdRecentAllies } from './TdRecentAllies'
import { useMapResource } from './useMapResource'
import './TdDeploymentEditor.css'

type Step = { mode: 'view' | 'idle' }
  | { mode: 'place' | 'edit' | 'move' | 'facing'; operator: TdDeployOperator }

function panelHeading(step: Step) {
  switch (step.mode) {
    case 'place': return `${step.operator.name}の配置先`
    case 'move': return `${step.operator.name}の移動先`
    case 'facing': return `${step.operator.name}の向き`
    case 'edit': return step.operator.name
    default: return '味方の配置'
  }
}

export function TdDeploymentEditor({ detail, placements, onChange, switchTarget, viewSwitch, children }: {
  detail: MapDetail
  placements: readonly TdPlacedOperator[]
  onChange: (placements: readonly TdPlacedOperator[]) => void
  switchTarget: HTMLElement | null
  viewSwitch?: ReactNode
  children: ReactNode
}) {
  const [step, setStep] = useState<Step>({ mode: 'view' })
  const [choosing, setChoosing] = useState(false)
  const [recentIds, setRecentIds] = useState(loadTdRecentOperatorIds)
  const editing = step.mode !== 'view'
  const selectedOperator = 'operator' in step ? step.operator : null
  const targeting = step.mode === 'place' || step.mode === 'move' ? step.mode : null
  const placed = placements.find(p => p.operator.id === selectedOperator?.id)
  const canPlace = targeting && selectedOperator && detail.grid.some((cells, row) =>
    cells.some((_, col) => canPlaceTdOperatorAt(detail, placements, selectedOperator, row, col)))
  const roster = useMapResource(loadTdDeploymentRoster, choosing || (editing && recentIds.length > 0))
  const availableOperators = useMemo(() => roster.data?.filter(operator =>
    !placements.some(placed => placed.operator.id === operator.id)) ?? null, [roster.data, placements])
  const recentOperators = recentIds.map(id => availableOperators?.find(operator => operator.id === id))
    .filter(operator => operator !== undefined)
  const controlsId = useId()
  const board = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)

  // The route and timeline boards stay mounted so their selections survive editing.
  useEffect(() => {
    if (step.mode === 'place' || step.mode === 'move' || step.mode === 'facing') {
      const selector = step.mode === 'facing' ? '.td-facing-pad button[aria-pressed="true"]' : '.td-candidate-cell'
      const buttons = board.current?.querySelectorAll<HTMLButtonElement>(selector)
      const activeButton = Array.from(buttons ?? []).find(button => button.getClientRects().length)
      const focusTarget = activeButton ?? panel.current?.querySelector<HTMLButtonElement>('button[data-cancel]')
      focusTarget?.focus()
    } else if (step.mode === 'edit' || step.mode === 'idle') {
      panel.current?.querySelector<HTMLButtonElement>('button[data-face], button[data-add]')?.focus({ preventScroll: true })
    }
  }, [step])

  function finish() {
    setStep({ mode: 'view' })
    toggle.current?.focus({ preventScroll: true })
  }

  function cancel() {
    switch (step.mode) {
      case 'place': setStep({ mode: 'idle' }); break
      case 'move':
      case 'facing': setStep({ mode: 'edit', operator: step.operator }); break
      case 'edit': setStep({ mode: 'idle' }); break
      case 'idle': finish(); break
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (editing && !choosing && event.key === 'Escape' && !event.defaultPrevented && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) {
      event.preventDefault()
      cancel()
    }
  }

  function selectOperator(operator: TdDeployOperator, mode: 'move' | 'edit' | 'facing') {
    setStep({ mode, operator })
  }

  function chooseOperator(operator: TdDeployOperator) {
    setChoosing(false)
    setStep({ mode: 'place', operator })
  }

  function selectDestination(row: number, col: number) {
    if (!targeting || !selectedOperator || !canPlaceTdOperatorAt(detail, placements, selectedOperator, row, col)) return
    onChange(placeTdOperator(detail, placements, { operator: selectedOperator, row, col, direction: placed?.direction ?? 'right' }))
    if (targeting === 'place') setRecentIds(rememberTdOperator(selectedOperator.id, recentIds))
    setStep({ mode: targeting === 'place' ? 'facing' : 'edit', operator: selectedOperator })
  }

  function setDirection(direction: TdDirection) {
    if (step.mode !== 'facing' || !placed) return
    if (placed.direction !== direction) onChange(placeTdOperator(detail, placements, { ...placed, direction }))
    selectOperator(placed.operator, 'edit')
  }

  function remove() {
    if (!placed) return
    onChange(placements.filter(p => p.operator.id !== placed.operator.id))
    setStep({ mode: 'idle' })
  }

  const add = <button type="button" className="button" data-add aria-haspopup="dialog" onClick={() => setChoosing(true)}>味方を選ぶ</button>
  const changeFacing = placed && <button type="button" data-face className="button secondary"
    onClick={() => selectOperator(placed.operator, 'facing')}>向きを変更</button>
  const visibleViewSwitch = !editing && viewSwitch
  const showCount = editing || placements.length > 0
  return <TdDeploymentContext.Provider value={{ placements, selectedOperator, targeting, editing,
    facing: step.mode === 'facing', actions: { selectOperator, selectDestination, setDirection } }}>
    <div className="td-deploy-editor" onKeyDown={onKeyDown}>
      {switchTarget && createPortal(
        <button type="button" className="td-deploy-switch" role="switch" ref={toggle}
          aria-checked={editing} aria-controls={editing ? controlsId : undefined}
          onClick={() => editing ? finish() : setStep({ mode: 'idle' })}>
          配置編集<span className="td-deploy-switch-track" aria-hidden="true" />
        </button>, switchTarget)}
      {(visibleViewSwitch || showCount) && <div className="td-terrain-tools">
        {visibleViewSwitch}
        {showCount && <div className="td-deploy-count" role="status">
          <span>配置中 {placements.length}人</span>
          {detail.deployLimit !== null && <span>配置枠 {detail.deployLimit}</span>}
        </div>}
      </div>}
      <div className={`td-deploy-workspace${editing ? ' is-editing' : ''}`}>
        <div ref={board} className="td-deploy-map">{children}</div>
        {editing && <aside id={controlsId} className="td-deploy-console" ref={panel} aria-label="オペレーター配置">
          <PageOutputHeader segments={['地形', 'オペレーター配置']}>
            <h3 aria-live="polite">{panelHeading(step)}</h3>
          </PageOutputHeader>
          <div className="td-deploy-console-body">
            {targeting && selectedOperator && <>
              <p className="td-deploy-position">{canPlace ? `${TD_POSITION_LABEL[selectedOperator.position]}の「＋」を選択` : '配置できる空きマスがありません'}</p>
              <div className="td-deploy-actions">
                {targeting === 'move' ? changeFacing :
                  <button type="button" className="button secondary" aria-haspopup="dialog" onClick={() => setChoosing(true)}>選び直す</button>}
                <button type="button" data-cancel className="button secondary" onClick={cancel}>
                  {targeting === 'move' ? '移動を取り消す' : '配置を取り消す'}
                </button>
              </div>
            </>}
            {(step.mode === 'edit' || step.mode === 'facing') && placed && <p className="td-deploy-position">
              {formatTdCell(detail.grid[0].length, placed.row, placed.col)} · {TD_POSITION_LABEL[placed.operator.position]} · {TD_DIRECTIONS[placed.direction].label}向き
            </p>}
            {step.mode === 'facing' && <div className="td-deploy-actions">
              <button type="button" data-cancel className="button secondary" onClick={cancel}>この向きで完了</button>
            </div>}
            {step.mode === 'edit' && placed &&
              <div className="td-deploy-actions">
                {changeFacing}
                <button type="button" className="button secondary" onClick={() => selectOperator(placed.operator, 'move')}>移動</button>
                <button type="button" className="button secondary" onClick={remove}>外す</button>
              </div>
            }
            {step.mode === 'idle' && <TdRecentAllies operators={recentOperators.slice(0, 3)} onSelect={chooseOperator} />}
            {(step.mode === 'idle' || step.mode === 'edit') && <div className="td-deploy-actions">{add}</div>}
          </div>
        </aside>}
      </div>
      {(choosing || step.mode === 'place') &&
        <TdDeploymentPicker active={choosing} operators={availableOperators} recentOperators={recentOperators}
          error={roster.error} onRetry={roster.retry} onClose={() => setChoosing(false)} onSelect={chooseOperator} />}
    </div>
  </TdDeploymentContext.Provider>
}
