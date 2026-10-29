import { useState } from 'react'
import type { useEnemyAggregation } from '../lib/useEnemyAggregation'
import { getMapCoverageEnvironmentLabel } from '../lib/enemyMapCoverage'
import { GoldenglowDetailModal } from './GoldenglowDetailModal'
import './EnemyAggregationSelector.css'

type Props = { state: ReturnType<typeof useEnemyAggregation> }

export function EnemyAggregationSelector({ state }: Props) {
  const { catalog, version, selectedId, setSelectedId } = state
  return <label className="enemy-aggregation-selector"><span>集計版</span>
    <select value={selectedId} disabled={!catalog} onChange={event => setSelectedId(event.target.value)}>
      {!version && <option value={selectedId}>{selectedId || '読み込み中'}</option>}
      {catalog?.versions.slice().reverse().map(item => <option key={item.id} value={item.id}>
        {item.id}{item.id === catalog.currentVersionId ? '（最新版）' : ''}
      </option>)}
    </select>
  </label>
}

export function EnemyAggregationStatus({ state }: Props) {
  const { loading, error, retry } = state
  if (error) return <div className="enemy-aggregation-status" role="alert"><span>{error}</span>
    <button className="button secondary" type="button" onClick={retry}>再読み込み</button>
  </div>
  return loading ? <p className="enemy-aggregation-status" role="status">集計データを読み込んでいます…</p> : null
}

export function EnemyAggregationHistoryButton({ state }: Props) {
  const { catalog, version, data, selectedId, setSelectedId } = state
  const [open, setOpen] = useState(false)
  const date = (value: string) => new Date(value).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
  const changes = version?.changes
  const mapLabel = (id: string) => {
    const map = data?.maps.maps.find(item => item.levelId === id)
    return map ? `${map.code} ${getMapCoverageEnvironmentLabel(map)}` : id
  }
  return <>
    <button className="button secondary" type="button" disabled={!catalog}
      aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>版の履歴</button>
    {open && catalog && <GoldenglowDetailModal title="集計版の履歴・変更内容" closeLabel="集計版の履歴を閉じる"
      className="enemy-aggregation-history" onClose={() => setOpen(false)}>
      <div className="enemy-aggregation-history-scroll" role="region" aria-label="集計版の履歴" tabIndex={0}><table>
        <thead><tr><th scope="col">集計版</th><th scope="col">保存日時</th><th scope="col">変更内容</th><th scope="col">出現回数の集計対象</th><th scope="col">元データ</th></tr></thead>
        <tbody>{catalog.versions.slice().reverse().map(item => <tr key={item.id} aria-current={item.id === selectedId ? 'true' : undefined}>
          <th scope="row"><button type="button" onClick={() => setSelectedId(item.id)} aria-pressed={item.id === selectedId}>{item.label}</button></th>
          <td>{date(item.createdAt)}</td><td>{item.description}</td><td>{item.summary.includedMapCount.toLocaleString('ja-JP')} マップ
            {!!item.summary.lowerBoundMapCount && `（下限 ${item.summary.lowerBoundMapCount.toLocaleString('ja-JP')}）`}</td>
          <td><a href={`https://github.com/ArknightsAssets/ArknightsGamedata/tree/${item.sourceRevision}/jp/gamedata`} target="_blank" rel="noreferrer">{item.sourceRevision.slice(0, 7)}</a></td>
        </tr>)}</tbody>
      </table></div>
      {version && <dl className="enemy-aggregation-metadata"><dt>集計ルール</dt><dd>{version.ruleVersion}</dd>
        <dt>比較元</dt><dd>{version.previousVersionId ?? 'なし（初版）'}</dd></dl>}
      {version?.previousVersionId && changes && <div className="enemy-aggregation-changes">
        {([
          ['集計対象に追加', changes.addedMapIds], ['集計対象から除外', changes.removedMapIds], ['出現情報を変更', changes.changedMapIds],
        ] as const).map(([label, ids]) => <details key={label}><summary>{label}：{ids.length} マップ</summary>
          {ids.length > 0 && <ul>{ids.map(id => <li key={id}>{mapLabel(id)}</li>)}</ul>}
        </details>)}
      </div>}
    </GoldenglowDetailModal>}
  </>
}
