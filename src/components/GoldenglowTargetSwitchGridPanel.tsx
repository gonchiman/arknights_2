import { useEffect, useMemo, useState } from 'react'
import type { GoldenglowTargetSwitchGridInput, GoldenglowTargetSwitchGridMessage, GoldenglowTargetSwitchGridRow, GoldenglowTargetSwitchGridSetup } from '../lib/goldenglowTargetSwitchGrid'
import { useGoldenglowTargetSwitchPanelOpen } from '../lib/useGoldenglowTargetSwitchPanelOpen'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { GoldenglowTargetSwitchChartPanel } from './GoldenglowTargetSwitchChartPanel'
import './GoldenglowTargetSwitchGridPanel.css'

const format = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 })
const integerFormat = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 })
export const GOLDENGLOW_TARGET_SWITCH_HP_PRESETS = {
  normal: { label: '通常敵向け', hps: Array.from({ length: 20 }, (_, index) => (index + 1) * 500), description: 'HP 500〜10,000・500刻み' },
  elite: { label: 'エリート敵向け', hps: Array.from({ length: 7 }, (_, index) => 5000 + index * 2500), description: 'HP 5,000〜20,000・2,500刻み' },
}
const RESISTANCE_STEPS = [5, 10, 20, 25, 50, 100] as const

export function GoldenglowTargetSwitchGridPanels({ input: setup, error, showDecimals }: {
  input: GoldenglowTargetSwitchGridSetup | null
  error: string | null
  showDecimals: boolean
}) {
  const [open, setOpen] = useGoldenglowTargetSwitchPanelOpen('grid')
  const [resistanceStep, setResistanceStep] = useState(20)
  const [presetKey, setPresetKey] = useState<keyof typeof GOLDENGLOW_TARGET_SWITCH_HP_PRESETS>('normal')
  const preset = GOLDENGLOW_TARGET_SWITCH_HP_PRESETS[presetKey]
  const resistances = useMemo(() => Array.from({ length: 100 / resistanceStep + 1 }, (_, index) => index * resistanceStep), [resistanceStep])
  const input = useMemo<GoldenglowTargetSwitchGridInput | null>(() => setup ? {
    ...setup, enemyHps: preset.hps, enemyResistances: resistances,
  } : null, [setup, preset, resistances])
  const calculation = useGridSimulation(input)
  const running = calculation.status === 'running'
  const damageFormat = showDecimals ? format : integerFormat
  const rows = new Map(calculation.rows.map((row) => [row.enemyResistance, row.expectedDamages]))
  const status = running ? `計算中… ${calculation.rows.length} / ${resistances.length}行`
    : calculation.status === 'cancelled' ? '計算を中止しました。' : null

  const renderControls = (label: string) => <div className="ggs-grid-toolbar">
      <div className="ggs-grid-presets" role="group" aria-label={`${label}のHP表示範囲`}>
        {Object.entries(GOLDENGLOW_TARGET_SWITCH_HP_PRESETS).map(([key, item]) => <button key={key} type="button"
          aria-pressed={key === presetKey} onClick={() => setPresetKey(key as keyof typeof GOLDENGLOW_TARGET_SWITCH_HP_PRESETS)}>{item.label}</button>)}
      </div>
      <div className="ggs-grid-actions">
        <label className="ggs-grid-step">
          術耐性の刻み
          <select value={resistanceStep} onChange={(event) => setResistanceStep(Number(event.target.value))}>
            {RESISTANCE_STEPS.map((step) => <option key={step} value={step}>{step}</option>)}
          </select>
        </label>
        <button className="button" type="button" disabled={!input || running} onClick={calculation.start}>
          {calculation.status === 'complete' ? '再計算する' : '計算する'}
        </button>
        {running && <button className="button secondary" type="button" onClick={calculation.cancel}>中止</button>}
      </div>
    </div>

  return <>
    <CollapsibleCalculatorPanel id="ggs-grid-panel" number="03" title="HP・術耐性別の期待ダメージ"
      summary={`横軸：HP・縦軸：術耐性・${preset.label}`}
      open={open} onToggle={() => setOpen((value) => !value)} collapsedLabel="表を表示">
    {renderControls('表')}
    {status && <p className="ggs-status" role="status" aria-live="polite">{status}</p>}
    {(error || calculation.error) && <p className="ggs-error" role="alert">{error || calculation.error}</p>}
    <h3 id="ggs-grid-title" className="gg-table-title">スキル総ダメージ期待値</h3>
    <div className="ggs-grid-scroll" tabIndex={0} role="region" aria-labelledby="ggs-grid-title">
      <table className="ggs-grid-table" aria-labelledby="ggs-grid-title" style={{ minWidth: (preset.hps.length + 1) * 104 }}>
        <thead><tr><th scope="col">術耐性 / HP</th>{preset.hps.map((hp) => <th scope="col" key={hp}>{format.format(hp)}</th>)}</tr></thead>
        <tbody>{resistances.map((resistance) => {
          const damages = rows.get(resistance)
          return <tr key={resistance}>
          <th scope="row">{resistance}</th>
          {preset.hps.map((hp, index) => <td key={hp}>{damages?.[index] === undefined ? '—' : damageFormat.format(damages[index])}</td>)}
        </tr>})}</tbody>
      </table>
    </div>
    </CollapsibleCalculatorPanel>
    <GoldenglowTargetSwitchChartPanel
      enemyHps={preset.hps} enemyResistances={resistances}
      rows={calculation.rows} status={calculation.status} error={error || calculation.error}
      showDecimals={showDecimals} rangeLabel={preset.label} controls={renderControls('グラフ')}
    />
  </>
}

type GridRequest = { input: GoldenglowTargetSwitchGridInput }
type GridStatus = 'idle' | 'running' | 'complete' | 'cancelled' | 'error'
type GridState = { request: GridRequest | null; rows: GoldenglowTargetSwitchGridRow[]; status: GridStatus; error: string | null }

function useGridSimulation(input: GoldenglowTargetSwitchGridInput | null) {
  const [request, setRequest] = useState<GridRequest | null>(null)
  const [cancelledRequest, setCancelledRequest] = useState<GridRequest | null>(null)
  const [state, setState] = useState<GridState>({ request: null, rows: [], status: 'idle', error: null })
  useEffect(() => {
    if (!request || request.input !== input || request === cancelledRequest) return
    let active = true
    let worker: Worker | undefined
    setState({ request, rows: [], status: 'running', error: null })
    const fail = (message: string) => {
      if (active) setState({ request, rows: [], status: 'error', error: message })
      worker?.terminate()
    }
    try {
      worker = new Worker(new URL('../lib/goldenglowTargetSwitchGrid.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (event: MessageEvent<GoldenglowTargetSwitchGridMessage>) => {
        if (!active) return
        const message = event.data
        if (message.type === 'row') {
          setState((previous) => ({ request, rows: [...(previous.request === request ? previous.rows : []), message.row], status: 'running', error: null }))
        } else if (message.type === 'complete') {
          setState({ request, rows: message.result.rows, status: 'complete', error: null })
          worker?.terminate()
        } else fail(message.error)
      }
      worker.onerror = () => fail('表とグラフの計算を完了できませんでした。条件を変更するか、ページを再読み込みしてください。')
      worker.postMessage(request.input)
    } catch {
      fail('表とグラフの計算を開始できませんでした。ページを再読み込みしてください。')
    }
    return () => { active = false; worker?.terminate() }
  }, [input, request, cancelledRequest])

  // 条件変更直後の描画でも、以前の条件の値を新しい見出しの下に表示しない。
  const visible: GridState = request && request.input === input
    ? request === cancelledRequest ? { request, rows: [], status: 'cancelled', error: null }
      : state.request === request ? state : { request, rows: [], status: 'running', error: null }
    : { request: null, rows: [], status: 'idle', error: null }
  return { ...visible, start: () => { if (input) setRequest({ input }) }, cancel: () => setCancelledRequest(request) }
}
