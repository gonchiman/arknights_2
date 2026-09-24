import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createCrossoverAxes, formatCrossoverBoundary, type CrossoverBuild, type CrossoverInput,
  type CrossoverMessage, type CrossoverPoint, type CrossoverSearch,
} from '../lib/goldenglowCrossover'
import { writeClipboardText } from '../lib/clipboard'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { GoldenglowCrossoverChart } from './GoldenglowCrossoverChart'
import './GoldenglowCrossoverPanel.css'

type SearchDraft = Record<keyof CrossoverSearch, string>
const initial: SearchDraft = { startResistance: '0', endResistance: '100', resistanceStep: '10', startHp: '1', endHp: '100000', hpStep: '100', trials: '20000', seed: '20260908' }
const format = (value: number) => value.toLocaleString('ja-JP')
interface Request { input: CrossoverInput; skillLabel: string; key: string }
interface Calculation {
  status: 'idle' | 'running' | 'complete' | 'cancelled' | 'error'
  request: Request | null; points: CrossoverPoint[]; completed: number; total: number; error: string | null
}

export function GoldenglowCrossoverPanel({ x, y, skillLabel, sharedError }: {
  x: CrossoverBuild | null; y: CrossoverBuild | null; skillLabel: string; sharedError: string | null
}) {
  const [draft, setDraft] = useState(initial)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [kind, setKind] = useState<'line' | 'bar' | 'auto'>('line')
  const [selected, setSelected] = useState<number | null>(null)
  const [copyFeedback, setCopyFeedback] = useState<{ text: string; ok: boolean } | null>(null)
  const calculation = useCrossoverCalculation()
  const running = calculation.status === 'running'
  const parsed = useMemo(() => {
    try {
      if (Object.values(draft).some(value => !value.trim())) throw new RangeError('空欄の計算条件を入力してください。')
      const search = Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, Number(value)])) as unknown as CrossoverSearch
      return { search, axes: createCrossoverAxes(search), error: null }
    } catch (cause) {
      return { search: null, axes: null, error: cause instanceof Error ? cause.message : '計算条件を確認してください。' }
    }
  }, [draft])
  const fieldError = sharedError ?? parsed.error ?? (!x || !y ? 'MOD XとMOD Yの情報を取得できませんでした。' : null)
  const input = useMemo<CrossoverInput | null>(() => !fieldError && x && y && parsed.search ? { ...parsed.search, x, y } : null, [fieldError, x, y, parsed.search])
  const key = input ? JSON.stringify({ input, skillLabel }) : null
  const request = calculation.request
  const stale = !!request && request.key !== key
  const shown = request?.input ?? input
  const axes = useMemo(() => shown ? createCrossoverAxes(shown) : parsed.axes, [shown, parsed.axes])
  const resistances = axes?.resistances ?? []
  const active = selected !== null && resistances.includes(selected) ? selected : resistances[0] ?? null
  const chartKind = kind === 'auto' ? (shown?.resistanceStep ?? Number(draft.resistanceStep)) === 1 ? 'line' : 'bar' : kind
  const condition = shown ? `${request?.skillLabel ?? skillLabel}・${shown.x.label} / ${shown.y.label}・${format(shown.x.input.duration)}秒・切り替え ${shown.x.input.switchDelay}秒・術耐性 ${shown.startResistance}〜${shown.endResistance}（${shown.resistanceStep}刻み）・HP ${format(shown.startHp)}〜${format(shown.endHp)}（${format(shown.hpStep)}刻み）・${format(shown.trials)}回/点・抽選番号${shown.seed}` : ''
  const byResistance = useMemo(() => new Map(calculation.points.map(point => [point.resistance, point])), [calculation.points])
  const tableText = request && calculation.points.length ? [
    `MOD逆転HP［${condition}${calculation.status === 'complete' ? '' : '・途中結果'}］`,
    ['術耐性', '最初にY優勢', '以後Y優勢'].join('\t'),
    ...calculation.points.map(point => [point.resistance, formatCrossoverBoundary(point.first), formatCrossoverBoundary(point.sustained)].join('\t')),
  ].join('\n') : ''
  const copyState = copyFeedback?.text === tableText ? copyFeedback.ok : null
  const copy = async () => {
    const text = tableText
    if (!text) return
    try { await writeClipboardText(text); setCopyFeedback({ text, ok: true }) }
    catch { setCopyFeedback({ text, ok: false }) }
  }
  const update = (name: keyof SearchDraft, value: string) => setDraft(previous => ({ ...previous, [name]: value }))
  const field = (name: keyof SearchDraft, label: string, min: number, max: number) => <label className="calculator-field">
    <span>{label}</span><input type="number" inputMode="numeric" step="1" min={min} max={max} value={draft[name]}
      onChange={event => update(name, event.target.value)} />
  </label>
  const totalTrials = parsed.axes && parsed.search ? parsed.axes.resistances.length * parsed.axes.hps.length * 2 * parsed.search.trials : null
  const status = running ? `計算中 ${format(calculation.completed)} / ${format(calculation.total)}点`
    : calculation.status === 'complete' ? `${calculation.points.length}術耐性・${format(request!.input.trials)}回 / 点・装備`
      : calculation.status === 'cancelled' ? `中止・${calculation.points.length}術耐性の結果を保持`
        : calculation.status === 'error' ? '計算未完了' : ''
  return <CollapsibleCalculatorPanel id="gg2-crossover" number="04" title="MOD逆転HP"
    summary={request ? `${request.skillLabel}・術耐性別` : 'MOD X → MOD Y'} collapsedLabel="結果を表示" className="gg2-output-panel gg-crossover-panel"
    headerActions={<>
      <label className="gg2-output-precision"><span>グラフ</span><select aria-label="逆転HPグラフの表示形式" value={kind}
        onChange={event => setKind(event.target.value as typeof kind)}>
        <option value="line">折れ線</option><option value="bar">棒グラフ</option><option value="auto">自動</option>
      </select></label>
      <button className="button secondary gg-crossover-settings-toggle" type="button" aria-expanded={settingsOpen}
        aria-controls="gg-crossover-settings" onClick={() => setSettingsOpen(value => !value)}>条件 {settingsOpen ? '−' : '+'}</button>
      <div className="gg2-run-actions"><button className="button" type="button" disabled={!input || running} onClick={() => {
        if (!input || !key) return
        setSelected(null)
        calculation.start({ input, key, skillLabel })
      }}>{running ? '計算中' : request ? '再計算' : '計算する'}</button>
      {running && <button className="button secondary" type="button" onClick={calculation.cancel}>中止</button>}</div>
    </>}>
    <section className="gg2-output" aria-label="MOD逆転HPの結果">
      <div id="gg-crossover-settings" hidden={!settingsOpen} className="gg-crossover-settings">
        <fieldset disabled={running}>
          <legend className="visually-hidden">逆転HPの計算条件</legend>
          <div className="gg-crossover-common">{skillLabel}・{x?.label ?? 'MOD X'} / {y?.label ?? 'MOD Y'}・切り替え {x?.input.switchDelay ?? '—'}秒</div>
          <div className="gg-crossover-fields">
            {field('startResistance', '開始術耐性', 0, 100)}
            {field('endResistance', '終了術耐性', 0, 100)}
            <label className="calculator-field"><span>術耐性の刻み</span><select value={draft.resistanceStep} onChange={event => update('resistanceStep', event.target.value)}>
              {[1, 10, 20].map(value => <option key={value} value={value}>{value}</option>)}
            </select></label>
          </div>
          <details className="gg2-settings gg-crossover-advanced"><summary>探索設定</summary>
            <div className="gg-crossover-fields">
              {field('startHp', '探索開始HP', 1, 1000000000)}
              {field('endHp', '探索上限HP', 1, 1000000000)}
              {field('hpStep', 'HPの探索刻み', 1, 1000000000)}
              <label className="calculator-field"><span>試行回数 / 点・装備</span><select value={draft.trials} onChange={event => update('trials', event.target.value)}>
                {[1000, 5000, 10000, 20000].map(value => <option key={value} value={value}>{format(value)}回</option>)}
              </select></label>
              {field('seed', '逆転HPの抽選番号', 0, 0xffffffff)}
            </div>
          </details>
          <div className="gg-crossover-workload">総試行 {totalTrials === null ? '—' : `${format(totalTrials)}回`}</div>
        </fieldset>
        {request && <details className="gg2-help"><summary>表示中の結果の条件</summary><p>{condition}</p></details>}
      </div>
      {fieldError && <p className="gg2-error" role="alert">{fieldError}</p>}
      {calculation.error && <p className="gg2-error" role="alert">{calculation.error}</p>}
      <div className="gg2-results-layout">
        <div className="gg2-chart-column" aria-busy={running}>
          <div className="gg2-chart-heading"><h3 id="gg-crossover-chart-title">術耐性別の逆転HP</h3><span className="gg-crossover-comparison">MOD X → MOD Y</span></div>
          <GoldenglowCrossoverChart points={calculation.points} resistances={resistances} kind={chartKind} selected={active} onSelect={setSelected} running={running} />
        </div>
        <section className="gg-performance-numeric-table gg2-table-view" aria-labelledby="gg-crossover-table-title" aria-busy={running}>
          <div className="gg-performance-table-toolbar"><h3 className="gg2-table-title" id="gg-crossover-table-title">数値表</h3>
            <button className="button secondary gg-performance-copy-table" type="button" disabled={!tableText} onClick={() => void copy()}>
              {copyState === true ? 'コピー済み' : copyState === false ? 'コピー失敗' : '表をコピー'}</button>
          </div>
          <div className={stale ? 'gg2-table-stale' : undefined}>
            <table className="gg-probability-table gg-performance-table gg2-results-table gg-crossover-table">
              <caption className="visually-hidden">術耐性ごとのMOD逆転HP・{condition}</caption>
              <thead><tr><th scope="col">術耐性</th><th scope="col">最初にY優勢</th><th scope="col">以後Y優勢</th></tr></thead>
              <tbody>{resistances.map(resistance => {
                const point = byResistance.get(resistance)
                return <tr key={resistance} className={active === resistance ? 'gg-performance-selected-resistance' : undefined}
                  onClick={event => {
                    if (event.target instanceof Element && event.target.closest('button')) return
                    setSelected(resistance); event.currentTarget.querySelector('button')?.focus({ preventScroll: true })
                  }}>
                  <th scope="row"><button className="gg2-table-hp" type="button" aria-label={`術耐性 ${resistance}の逆転HPを選択`}
                    aria-pressed={active === resistance} onClick={() => setSelected(resistance)}>{resistance}</button></th>
                  <td>{formatCrossoverBoundary(point?.first)}</td><td>{formatCrossoverBoundary(point?.sustained)}</td>
                </tr>
              })}</tbody>
            </table>
          </div>
        </section>
      </div>
      <div className="gg2-status" role="status" aria-live="polite">
        {running && <progress aria-label="逆転HPの計算進捗" max={calculation.total || 1} value={calculation.completed} />}
        <span>{status}{stale ? '・条件変更あり：再計算で更新' : ''}</span>
      </div>
      <details className="gg2-help"><summary>逆転HPの見方</summary>
        <p>最初にY優勢：計算したHPの中で、初めてMOD Yのスキル総ダメージの平均がMOD Xを上回るHP。以後Y優勢：そのHPから探索上限まで、計算したすべての点でYが上回るHP。同値はY優勢に含めません。</p>
        <p>開始HPから優勢な場合と、上限内に該当するHPがない場合は表に文字で表示し、グラフ上の0として扱いません。以後Y優勢は探索した点と上限の範囲に限られます。線は点を結んだ表示で、刻みの間の逆転や上限より先の優劣は判定しません。</p>
        <p>共通設定のスキル・特化・MODレベル・切り替え時間・S2の計測時間を使用します。パネル3の装備の選択状態にかかわらずXとYを比較し、固定術耐性・HP範囲・試行回数・抽選番号はこのパネルの条件で計算します。総ダメージには敵の残りHPを超えた分も含みます。</p>
        <p>HPの探索刻み・試行回数・抽選番号により境界が変わる推定値です。僅差の点は試行回数を増やすか、抽選番号を変えて確認してください。自動表示は術耐性1刻みで折れ線、10・20刻みで棒グラフになります。探索範囲全体を調べるため細かい刻みほど時間がかかります。</p>
      </details>
    </section>
  </CollapsibleCalculatorPanel>
}

function useCrossoverCalculation() {
  const [state, setState] = useState<Calculation>({ status: 'idle', request: null, points: [], completed: 0, total: 0, error: null })
  const workerRef = useRef<Worker | null>(null)
  const stop = () => { workerRef.current?.terminate(); workerRef.current = null }
  useEffect(() => stop, [])
  const start = (request: Request) => {
    stop()
    const axes = createCrossoverAxes(request.input)
    setState({ status: 'running', request, points: [], completed: 0, total: axes.hps.length * axes.resistances.length * 2, error: null })
    try {
      const worker = new Worker(new URL('../lib/goldenglowCrossover.worker.ts', import.meta.url), { type: 'module' })
      workerRef.current = worker
      const fail = (error: string) => {
        if (workerRef.current !== worker) return
        stop(); setState(previous => ({ ...previous, status: 'error', error }))
      }
      worker.onmessage = (event: MessageEvent<CrossoverMessage>) => {
        if (workerRef.current !== worker) return
        const message = event.data
        if (message.type === 'progress') setState(previous => ({ ...previous, completed: message.completed, total: message.total }))
        else if (message.type === 'row') setState(previous => ({ ...previous, points: [...previous.points, message.point] }))
        else if (message.type === 'complete') {
          stop(); setState(previous => ({ ...previous, status: 'complete', points: message.points, completed: previous.total }))
        } else fail(message.error)
      }
      worker.onerror = () => fail('計算を完了できませんでした。再計算してください。')
      worker.onmessageerror = () => fail('計算結果を読み取れませんでした。再計算してください。')
      worker.postMessage(request.input)
    } catch {
      stop(); setState(previous => ({ ...previous, status: 'error', error: '計算を開始できませんでした。ページを再読み込みしてください。' }))
    }
  }
  return { ...state, start, cancel: () => {
    stop(); setState(previous => previous.status === 'running' ? { ...previous, status: 'cancelled' } : previous)
  } }
}
