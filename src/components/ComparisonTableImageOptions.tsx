import {
  COMPARISON_TABLE_DETAIL_SIZES, COMPARISON_TABLE_TITLE_SIZES,
  type ComparisonTableNumberSize,
} from '../lib/tableImageTypography'
import './ComparisonTableImageFrame.css'

export interface ComparisonTableImageOptionsProps {
  layout: string
  onLayoutChange: (value: string) => void
  layouts: readonly { value: string; label: string; disabled?: boolean }[]
  numberSize: ComparisonTableNumberSize
  onNumberSizeChange: (value: ComparisonTableNumberSize) => void
  titleSize: number
  onTitleSizeChange: (value: number) => void
  detailSize: number
  onDetailSizeChange: (value: number) => void
  disabled?: boolean
}

export function ComparisonTableImageOptions(props: ComparisonTableImageOptionsProps) {
  return <div className="comparison-table-image-options">
    <label className="chart-image-save-field"><span>画像の配置</span>
      <select aria-label="画像の配置" value={props.layout} disabled={props.disabled} onChange={event => props.onLayoutChange(event.target.value)}>
        {props.layouts.map(item => <option key={item.value} value={item.value} disabled={item.disabled}>{item.label}</option>)}
      </select>
    </label>
    <label className="chart-image-save-field"><span>数値サイズ</span>
      <select aria-label="数値サイズ" value={props.numberSize} disabled={props.disabled}
        onChange={event => props.onNumberSizeChange(event.target.value as ComparisonTableNumberSize)}>
        <option value="auto">自動</option><option value="100">100%</option><option value="150">150%</option><option value="200">200%</option>
      </select>
    </label>
    <label className="chart-image-save-field"><span>タイトルサイズ</span>
      <select aria-label="タイトルサイズ" value={props.titleSize} disabled={props.disabled} onChange={event => props.onTitleSizeChange(Number(event.target.value))}>
        {COMPARISON_TABLE_TITLE_SIZES.map(size => <option key={size} value={size}>{size}px</option>)}
      </select>
    </label>
    <label className="chart-image-save-field"><span>詳細サイズ</span>
      <select aria-label="詳細サイズ" value={props.detailSize} disabled={props.disabled} onChange={event => props.onDetailSizeChange(Number(event.target.value))}>
        {COMPARISON_TABLE_DETAIL_SIZES.map(size => <option key={size} value={size}>{size}px</option>)}
      </select>
    </label>
  </div>
}
