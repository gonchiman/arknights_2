import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { canPlaceTdOperatorAt, placeTdOperator, TD_DIRECTIONS, type TdDirection, type TdPlacedOperator } from '../lib/tdDeployment'
import { loadTdDeploymentRoster, type TdDeployOperator } from '../lib/tdDeploymentRoster'
import type { MapDetail } from '../types/map'
import { PageOutputHeader } from './PageLayout'
import { TdDeploymentContext } from './TdDeploymentContext'
import { TdDeploymentPicker, TD_POSITION_LABEL } from './TdDeploymentPicker'
import { useMapResource } from './useMapResource'
import './TdDeploymentEditor.css'

type Step = { mode: 'view' | 'idle' | 'search' }
  | { mode: 'place' | 'edit' | 'move' | 'facing'; operator: TdDeployOperator }

function panelHeading(step: Step) {
  switch (step.mode) {
    case 'search': return '配置する味方を選択'
    case 'place': return `${step.operator.name}の配置先`
    case 'move': return `${step.operator.name}の移動先`
    case 'facing': return `${step.operator.name}の向き`
    case 'edit': return step.operator.name
    default: return '味方の配置'
  }
}

export function TdDeploymentEditor({ detail, placements, onChange, viewSwitch, children }: {
  detail: MapDetail
  placements: readonly TdPlacedOperator[]
  onChange: (placements: readonly TdPlacedOperator[]) => void
  viewSwitch?: ReactNode
  children: ReactNode
}) {
  const [step, setStep] = useState<Step>({ mode: 'view' })
  const editing = step.mode !== 'view'
  const selectedOperator = 'operator' in step ? step.operator : null
  const targeting = step.mode === 'place' || step.mode === 'move' ? step.mode : null
  const placed = placements.find(p => p.operator.id === selectedOperator?.id)
  const canPlace = targeting && selectedOperator && detail.grid.some((cells, row) =>
    cells.some((_, col) => canPlaceTdOperatorAt(detail, placements, selectedOperator, row, col)))
  const roster = useMapResource(loadTdDeploymentRoster, step.mode === 'search')
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
      case 'place': setStep({ mode: 'search' }); break
      case 'move':
      case 'facing': setStep({ mode: 'edit', operator: step.operator }); break
      case 'edit': setStep({ mode: 'idle' }); break
      case 'search': if (placements.length) setStep({ mode: 'idle' }); else finish(); break
      case 'idle': finish(); break
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (editing && event.key === 'Escape' && !event.defaultPrevented && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) {
      event.preventDefault()
      cancel()
    }
  }

  function selectOperator(operator: TdDeployOperator, mode: 'move' | 'edit' | 'facing') {
    setStep({ mode, operator })
  }

  function selectDestination(row: number, col: number) {
    if (!targeting || !selectedOperator || !canPlaceTdOperatorAt(detail, placements, selectedOperator, row, col)) return
    onChange(placeTdOperator(detail, placements, { operator: selectedOperator, row, col, direction: placed?.direction ?? 'right' }))
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

  const add = <button type="button" className="button" data-add onClick={() => setStep({ mode: 'search' })}>＋ 味方を追加</button>
  const changeFacing = placed && <button type="button" data-face className="button secondary"
    onClick={() => selectOperator(placed.operator, 'facing')}>向きを変更</button>
  return <TdDeploymentContext.Provider value={{ placements, selectedOperator, targeting, editing,
    facing: step.mode === 'facing', actions: { selectOperator, selectDestination, setDirection } }}>
    <div className="td-deploy-editor" onKeyDown={onKeyDown}>
      <div className="td-terrain-tools">
        {!editing && viewSwitch}
        <button type="button" className="button secondary" ref={toggle} aria-controls={editing ? controlsId : undefined}
          aria-expanded={editing} onClick={() => editing ? finish() : setStep({ mode: 'search' })}>
          {editing ? '編集を終了' : '配置を編集'}
        </button>
        {(editing || placements.length > 0) && <div className="td-deploy-count" role="status">
          <span>配置中 {placements.length}人</span>
          {detail.deployLimit !== null && <span>配置枠 {detail.deployLimit}</span>}
        </div>}
      </div>
      <div className={`td-deploy-workspace${editing ? ' is-editing' : ''}`}>
        <div ref={board} className="td-deploy-map">{children}</div>
        {editing && <aside id={controlsId} className="td-deploy-console" ref={panel} aria-label="オペレーター配置">
          <PageOutputHeader segments={['地形', 'オペレーター配置']}>
            <h3 aria-live="polite">{panelHeading(step)}</h3>
          </PageOutputHeader>
          <div className="td-deploy-console-body">
            {step.mode === 'search' && <>
              {roster.error ? <div role="alert">{roster.error} <button type="button" className="button secondary" onClick={roster.retry}>再読み込み</button></div>
                : <TdDeploymentPicker operators={roster.data?.filter(op => !placements.some(p => p.operator.id === op.id)) ?? null}
                    onSelect={operator => setStep({ mode: 'place', operator })} />}
              {placements.length > 0 && <div className="td-deploy-actions"><button type="button" className="button secondary" onClick={cancel}>閉じる</button></div>}
            </>}
            {targeting && selectedOperator && <>
              <p className="td-deploy-position">{canPlace ? `${TD_POSITION_LABEL[selectedOperator.position]}の「＋」を選択` : '配置できる空きマスがありません'}</p>
              <div className="td-deploy-actions">
                {targeting === 'move' && changeFacing}
                <button type="button" data-cancel className="button secondary" onClick={cancel}>
                  {targeting === 'move' ? '移動を取り消す' : '選び直す'}
                </button>
              </div>
            </>}
            {(step.mode === 'edit' || step.mode === 'facing') && placed && <p className="td-deploy-position">
              {placed.row + 1}行 {placed.col + 1}列 · {TD_POSITION_LABEL[placed.operator.position]} · {TD_DIRECTIONS[placed.direction].label}向き
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
            {(step.mode === 'idle' || step.mode === 'edit') && <div className="td-deploy-actions">{add}</div>}
          </div>
        </aside>}
      </div>
    </div>
  </TdDeploymentContext.Provider>
}
