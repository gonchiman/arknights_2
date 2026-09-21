import { HelpPopover } from './HelpPopover'
import './EnemyHistogramOverflowHelp.css'

interface Props {
  upperBoundLabel: string | null
  isCustom: boolean
  hasOverflow: boolean
}

export function EnemyHistogramOverflowHelp({ upperBoundLabel, isCustom, hasOverflow }: Props) {
  return <span className="enemy-histogram-overflow-help">
    <HelpPopover label="外れ値階級について" mode="dialog">
      <div className="enemy-histogram-overflow-help-content">
        <p>線形ヒストグラムでは、通常階級の上限を超えた値を、最後の1階級にまとめます。ここでの「外れ値」は、表示上まとめる対象を指します。</p>
        <h4>自動設定の決め方</h4>
        <p>階級幅も自動の場合は、95パーセンタイル（小さい順に約95％の位置の値）を目安に、切りのよい階級幅で通常階級を10個作り、その上限を使います。丸めるため、まとめる対象が必ず上位5％になるわけではありません。</p>
        <p>階級幅だけを指定した場合も、この自動上限を保ちます。ただし、上限を超える値がなければ、最大値を含む階級までを表示します。</p>
        <p>上限を超えた値も、件数・平均・中央値などの集計に含まれます。</p>
        <div className="enemy-histogram-overflow-help-boundary">
          {upperBoundLabel === null ? <p>現在の境界を表示できません。</p> : <>
            <p><strong>現在の上限：{upperBoundLabel}（{isCustom ? '固定' : '自動'}）</strong></p>
            <p>{upperBoundLabel}以下は通常階級、{upperBoundLabel}超は最後の1階級にまとめます。</p>
            {!hasOverflow && <p>上限を超える値はありません。</p>}
          </>}
        </div>
      </div>
    </HelpPopover>
  </span>
}
