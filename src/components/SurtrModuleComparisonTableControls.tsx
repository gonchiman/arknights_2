import type { EnemyHeatmapColorScale } from '../lib/enemyHeatmapColor'
import type { SurtrDpsBarStep } from '../lib/surtrDpsResistance'
import { getSurtrComparisonBaseLabel, type SurtrUnequippedComparisonBase, type SurtrUnequippedComparisonQuantity, type SurtrUnequippedColumnOrder,
  type SurtrUnequippedLayout, type SurtrUnequippedMetric, type SurtrUnequippedRankMode } from '../lib/surtrUnequippedComparison'
import { HelpPopover } from './HelpPopover'
import { SurtrResistanceStepControl, getSurtrResistanceStepError } from './SurtrResistanceStepControl'

export interface SurtrModuleComparisonTableOptions {
  comparisonBase: SurtrUnequippedComparisonBase
  layout: SurtrUnequippedLayout
  columnOrder: SurtrUnequippedColumnOrder
  metric: SurtrUnequippedMetric
  step: SurtrDpsBarStep
  customStep: boolean
  stepDraft: string
  rankMode: SurtrUnequippedRankMode
  precision: number
  colorScale: EnemyHeatmapColorScale | 'NONE'
}

export function SurtrModuleComparisonTableControls({ value, onChange, quantity = 'dps', stepErrorId, allowPotentialComparison = false, group = 'all' }: {
  value: SurtrModuleComparisonTableOptions
  onChange: (changes: Partial<SurtrModuleComparisonTableOptions>) => void
  quantity?: SurtrUnequippedComparisonQuantity
  stepErrorId: string
  allowPotentialComparison?: boolean
  /** Split the existing controls across panels without changing other pages. */
  group?: 'all' | 'conditions' | 'display'
}) {
  const baseLabel = getSurtrComparisonBaseLabel(value.comparisonBase)
  const prefix = `${baseLabel}比較の`
  const stepError = getSurtrResistanceStepError(value.customStep, value.stepDraft)
  return <>
    {group !== 'display' && <span className="surtr-s3-color-scale-control">
      <label className="surtr-s3-output-control"><span>比較基準</span><select aria-label="MOD比較の比較基準" value={value.comparisonBase}
        onChange={event => onChange({ comparisonBase: event.target.value as SurtrUnequippedComparisonBase })}>
        <option value="unequipped">未装備</option><option value="previous">1つ前の段階</option>
        {allowPotentialComparison && [1, 2, 3, 4, 5, 6].map(potential => <option key={potential} value={`potential-${potential}`}>同じMOD・段階の潜在{potential}</option>)}
      </select></label>
      <HelpPopover label="MOD比較の比較基準の説明">{allowPotentialComparison && <>「未装備」と「1つ前の段階」は、比較する列と同じ潜在を基準にします。</>}「1つ前の段階」はLv.1を未装備、Lv.2を同じMODのLv.1、Lv.3を同じMODのLv.2と比較します。基準が表に表示されていなくても計算します。{allowPotentialComparison && <>「同じMOD・段階の潜在」は、MODと段階を揃えて潜在による変化を比較します。</>}</HelpPopover>
    </span>}
    {group !== 'conditions' && <>
    <label className="surtr-s3-output-control"><span>表の形式</span><select aria-label={`${prefix}表の形式`} value={value.layout}
      onChange={event => onChange({ layout: event.target.value as SurtrUnequippedLayout })}>
      <option value="combined">{quantity === 'expected-damage' ? '期待値' : 'DPS'}＋比較値</option><option value="comparison">比較値のみ</option>
    </select></label>
    <label className="surtr-s3-output-control"><span>列の並び</span><select aria-label={`${prefix}列の並び`} value={value.columnOrder}
      onChange={event => onChange({ columnOrder: event.target.value as SurtrUnequippedColumnOrder })}>
      <option value="module">MOD別</option><option value="blocking">ブロック条件別</option>
    </select></label>
    <label className="surtr-s3-output-control"><span>比較値</span><select aria-label={`${prefix}指標`} value={value.metric}
      onChange={event => onChange({ metric: event.target.value as SurtrUnequippedMetric })}>
      <option value="difference">{quantity === 'expected-damage' ? 'ダメージ差' : 'DPS差'}</option>
      <option value="ratio">比率（{baseLabel}＝100%）</option><option value="percent">増加率（%）</option>
    </select></label>
    <SurtrResistanceStepControl step={value.step} custom={value.customStep} draft={value.stepDraft}
      onChange={step => onChange({ step })} onCustomChange={customStep => onChange({ customStep })} onDraftChange={stepDraft => onChange({ stepDraft })}
      ariaLabel={`${prefix}術耐性の刻み`} errorId={stepErrorId} defaultStep={10} />
    <label className="surtr-s3-output-control"><span>術耐性ランク</span><select aria-label={`${prefix}術耐性ランク表示`} value={value.rankMode}
      onChange={event => onChange({ rankMode: event.target.value as SurtrUnequippedRankMode })}>
      <option value="none">表示しない</option><option value="inline">数値の横に表示</option><option value="merged">同じランクをまとめる</option>
    </select></label>
    <label className="surtr-s3-output-control"><span>小数点以下</span><select aria-label={`${prefix}小数点以下の桁数`} value={value.precision}
      onChange={event => onChange({ precision: Number(event.target.value) })}>
      {[0, 1, 2, 3].map(digits => <option key={digits} value={digits}>{digits}桁</option>)}
    </select></label>
    <span className="surtr-s3-color-scale-control">
      <label className="surtr-s3-output-control"><span>カラースケール</span><select aria-label={`${prefix}カラースケール`} value={value.colorScale}
        onChange={event => onChange({ colorScale: event.target.value as SurtrModuleComparisonTableOptions['colorScale'] })}>
        <option value="NONE">なし</option><option value="LINEAR">値に比例</option><option value="SQRT">中程度を見やすく</option>
      </select></label>
      <HelpPopover label="カラースケールの説明">比較値のセルを、{baseLabel}より高ければ青、低ければ茶色で表示します。同じ値は無色です。表示中の比較値全体で濃淡を揃え、差が大きいほど濃くします。「中程度を見やすく」は最大差に対する比率の平方根を使い、中程度の差も見やすくします。数値や{quantity === 'expected-damage' ? '総ダメージ期待値' : 'DPS'}列は変わりません。</HelpPopover>
    </span>
    {stepError && <p className="surtr-s3-axis-error" id={stepErrorId} role="alert">{stepError}</p>}
    </>}
  </>
}
