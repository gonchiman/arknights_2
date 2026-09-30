import { useEffect, useMemo, useState } from 'react'
import { loadMapDetail } from '../lib/mapDatabase'
import { getMapSpawnFlow, getMapSpecifiedSpawnCount } from '../lib/mapWaves'
import type { MapDetail, MapIndex, MapSummary, MapWaveAction } from '../types/map'

const number = (value: number | null) => value === null ? '—' : value.toLocaleString('ja-JP', { maximumFractionDigits: 6 })
const seconds = (value: number | null) => value === null ? '未確認' : `${number(value)}秒`
const eventLabels: Record<string, string> = {
  STORY: 'ストーリー', PREVIEW_CURSOR: '経路の予告', DISPLAY_ENEMY_INFO: '敵情報の表示',
  TUTORIAL: 'チュートリアル', PLAY_BGM: 'BGMの変更',
}
const kindLabel = (action: MapWaveAction) => action.spawnKind === 'conditional' ? '条件付き' : action.spawnKind === 'unknown' ? '未確認' : '固定'

export function MapWaveInformation({ map, index }: { map: MapSummary; index: MapIndex }) {
  const [detail, setDetail] = useState<MapDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    if (map.status === 'missing') return
    setError(null)
    void loadMapDetail(map).then((result) => { if (active) setDetail(result) }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : 'ウェーブ情報を読み込めませんでした。')
    })
    return () => { active = false }
  }, [map, revision])

  if (map.status === 'missing') return <p className="map-empty" role="status">このマップのウェーブ情報は未取得です。</p>
  if (error) return <div className="map-load-state" role="alert"><span>{error}</span><button className="button secondary" type="button" onClick={() => setRevision((value) => value + 1)}>再読み込み</button></div>
  if (!detail) return <p className="map-empty" role="status">ウェーブ情報を読み込んでいます…</p>
  if (detail.waves == null) return <p className="map-empty" role="status">ウェーブ情報を確認できませんでした。</p>
  if (!detail.waves.length) return <p className="map-empty" role="status">ウェーブの設定はありません。</p>
  return <MapWaveSchedule detail={detail} map={map} index={index} />
}

function MapWaveSchedule({ detail, map, index }: { detail: MapDetail; map: MapSummary; index: MapIndex }) {
  const [waveIndex, setWaveIndex] = useState(0)
  const [fragmentIndex, setFragmentIndex] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const waves = detail.waves ?? []
  const wave = waves[waveIndex] ?? waves[0]
  const fragment = wave.fragments[fragmentIndex]
  const flow = useMemo(() => fragment ? getMapSpawnFlow(detail, fragment) : { rows: [], omittedCount: 0, unknownCount: 0 }, [detail, fragment])
  const rows = flow.rows
  const hasOmitted = typeof flow.omittedCount === 'string' || flow.omittedCount > 0
  const omittedLabel = typeof flow.omittedCount === 'string' ? BigInt(flow.omittedCount).toLocaleString('ja-JP') : number(flow.omittedCount)
  const selected = rows.find((row) => row.id === selectedId) ?? rows[0]
  const events = fragment?.actions.filter((action) => action.actionType !== 'SPAWN') ?? []
  const hasConditions = rows.some((row) => row.actions.some((action) => action.spawnKind !== 'fixed'))
  const count = getMapSpecifiedSpawnCount(wave.fragments.flatMap((item) => item.actions))
  const name = (action: Pick<MapWaveAction, 'key'>) => index.enemies[action.key ?? '']?.name ?? action.key ?? '敵名未確認'
  const changeWave = (next: number) => { setWaveIndex(next); setFragmentIndex(0); setSelectedId(null) }
  const changeFragment = (next: number) => { setFragmentIndex(next); setSelectedId(null) }
  const nextTime = selected?.time == null ? null : rows.find((row) => row.time !== null && row.time > selected.time!)?.time ?? null
  const configured = map.status !== 'supported'

  return <div className="map-wave-schedule">
    <div className="map-wave-overview">
      {waves.length > 1 ? <label className="map-wave-picker"><span>ウェーブ</span><select aria-label="ウェーブ" value={waveIndex} onChange={(event) => changeWave(Number(event.target.value))}>
        {waves.map((_, i) => <option key={i} value={i}>ウェーブ {i + 1}</option>)}
      </select></label> : <h3>ウェーブ 1</h3>}
      <span>{wave.fragments.length}区間 · {configured ? '設定数 ' : ''}{count === null ? '体数未確認' : `${number(count)}体`}</span>
      {map.reasons.includes('branch-spawn') && <span className="map-wave-condition">分岐の出現設定は別</span>}
    </div>
    {wave.fragments.length > 0 ? <>
      <div className="map-wave-fragments" role="group" aria-label="区間選択">
        {wave.fragments.map((item, i) => {
          const itemCount = getMapSpecifiedSpawnCount(item.actions)
          return <button type="button" key={i} aria-pressed={i === fragmentIndex} onClick={() => changeFragment(i)}>
            <span>区間 {i + 1}</span><small>{itemCount === null ? '体数未確認' : `${number(itemCount)}体${configured ? '（設定）' : ''}`}</small>
          </button>
        })}
      </div>
      <div className="map-wave-caption"><span>区間開始からの設定時刻</span><span>開始前の待ち {seconds(fragment.preDelay)}</span></div>
      <div className="map-table-scroll map-wave-table-scroll" key={`${waveIndex}-${fragmentIndex}`}>
        {rows.length ? <table className="map-wave-table" aria-label={`ウェーブ${waveIndex + 1} 区間${fragmentIndex + 1}の登場順`}>
          <colgroup><col className="map-wave-time-column" /><col className="map-wave-entrance-column" /><col /><col className="map-wave-count-column" />{hasConditions && <col className="map-wave-condition-column" />}</colgroup>
          <thead><tr><th scope="col" className="map-numeric">出現時刻（秒）</th><th scope="col" className="map-wave-entrance">出現口</th><th scope="col">敵名</th><th scope="col" className="map-numeric">{hasOmitted ? '体数（表示分）' : configured ? '体数（設定）' : '体数'}</th>{hasConditions && <th scope="col">出現条件</th>}</tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id} className={row.id === selected?.id ? 'is-selected' : ''} onClick={() => setSelectedId(row.id)}>
            <td className="map-numeric">{number(row.time)}</td><td className="map-wave-entrance">{row.entrance?.label ?? '未確認'}</td>
            <td className="map-wave-enemies"><button type="button" aria-pressed={row.id === selected?.id} aria-label={`${seconds(row.time)}、出現口${row.entrance?.label ?? '未確認'}、${row.enemies.map(name).join('、')}の出現情報`} onClick={() => setSelectedId(row.id)}>
              {row.enemies.map((enemy, i) => <span key={`${enemy.key}-${i}`}>{name(enemy)}{row.enemies.length > 1 && <small> ×{number(enemy.count)}</small>}</span>)}
            </button></td>
            <td className="map-numeric">{number(row.count)}</td>
            {hasConditions && <td className="map-wave-condition">{[...new Set(row.actions.map(kindLabel))].join('・')}</td>}
          </tr>)}</tbody>
        </table> : <p className="map-empty" role="status">この区間に敵の出現指定はありません。</p>}
      </div>
      {(hasOmitted || flow.unknownCount > 0) && <p className="map-wave-incomplete" role="status">
        {hasOmitted && <>表示上限のため {omittedLabel}体分を省略しています。</>}
        {flow.unknownCount > 0 && <>情報を確認しきれない出現設定が {number(flow.unknownCount)}件あります。</>}
      </p>}
      <div className="map-wave-selected" aria-live="polite">
        {selected && <><div><strong>{seconds(selected.time)} · 出現口{selected.entrance?.label ?? '未確認'}</strong><span>{selected.count === null ? '体数未確認' : `合計${number(selected.count)}体`}{hasOmitted ? '（表示分）' : configured || selected.actions.some((action) => action.spawnKind !== 'fixed') ? '（設定）' : ''}</span></div>
          <p>{selected.time === null ? '出現時刻を確認できません。' : nextTime !== null ? <>{hasOmitted ? '次の表示時刻' : '次の時刻'} {seconds(nextTime)}（{seconds(Number((nextTime - selected.time).toPrecision(15)))}後）</> : hasOmitted || flow.unknownCount > 0 ? '確認できた時刻の表示はここまでです。' : 'この区間で最後の出現設定です。'}</p></>}
      </div>
      {events.length > 0 && <details className="map-wave-events" key={`events-${waveIndex}-${fragmentIndex}`}>
        <summary>出現以外のイベント {events.length}件</summary>
        <ul>{events.map((action, i) => <li key={i}><span>{seconds(action.preDelay)}</span><span>{eventLabels[action.actionType] ?? action.actionType}{action.actionType === 'DISPLAY_ENEMY_INFO' && action.key ? `（${name(action)}）` : ''}</span></li>)}</ul>
      </details>}
    </> : <p className="map-empty">このウェーブに区間の設定はありません。</p>}
    <details className="map-wave-help"><summary>時刻・体数の読み方</summary>
      <p>時刻は区間内の出現設定です。戦闘開始からの確定時刻ではありません。前の区間の進行や待機条件によって、実際の開始時刻が変わります。</p>
      <p>出現指定の開始時刻と間隔から、1体ずつの出現時刻を展開しています。同じ時刻・同じ出現口の固定出現を1行にまとめ、体数はその合計です。敵が複数種類いる行は、敵名に内訳を添えています。</p>
      <p>出現口のA・B・C…はマップの上から下、同じ高さでは左から右の順です。同じ開始マスを共有する経路には同じ記号を使い、ウェーブや区間を切り替えても変わりません。経路の開始マスを確認できない場合は「未確認」と表示します。</p>
      {hasConditions && <p>条件付き・未確認の出現指定は別々に表示しています。同じ時刻の行でも、同時に出現するとは限りません。</p>}
      {configured && <p>体数は設定値です。条件やランダム選択、敵の置き換えなどを反映した実際の出現数ではありません。分岐側の出現指定はこの表に含みません。</p>}
      <dl><div><dt>ウェーブ開始前の待ち</dt><dd>{seconds(wave.preDelay)}</dd></div><div><dt>ウェーブ終了後の待ち</dt><dd>{seconds(wave.postDelay)}</dd></div></dl>
    </details>
  </div>
}
