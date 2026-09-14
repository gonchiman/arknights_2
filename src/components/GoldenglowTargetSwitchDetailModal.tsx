import type { ReactNode } from 'react'
import { DATA_SOURCE_URLS } from '../lib/dataSources'
import { getGoldenglowDroneAttackScalePercent } from '../lib/goldenglowExplosion'
import type {
  GoldenglowTargetSwitchInput,
  GoldenglowTargetSwitchResult,
  GoldenglowTargetSwitchTrial,
} from '../lib/goldenglowTargetSwitch'
import { GoldenglowDetailModal } from './GoldenglowDetailModal'
import './GoldenglowGuidePage.css'

export type GoldenglowTargetSwitchDetail =
  | { kind: 'metric'; metric: 'effectiveDamage' | 'effectiveDps' | 'rawDamage' | 'rawDps' | 'overkillDamage' | 'kills' | 'explosions' | 'confidence' | 'percentiles' }
  | { kind: 'condition'; condition: 'enemyHp' | 'enemyResistance' | 'attackInterval' | 'duration' | 'drones' | 'switchDelay' | 'retargetRemainingDrones' | 'sampling' }
  | { kind: 'comparison'; mode: 'baseline' | 'raw' | 'effective' }
  | { kind: 'timeline'; index: number }
  | { kind: 'trace'; index: number; seed: number; trial: GoldenglowTargetSwitchTrial }
  | { kind: 'model' }

type Props = {
  detail: GoldenglowTargetSwitchDetail
  input: GoldenglowTargetSwitchInput
  result: GoldenglowTargetSwitchResult | null
  showDecimals: boolean
  onClose: () => void
}

type DetailContent = { title: string; body: ReactNode }
type TableRow = readonly [label: string, value: ReactNode]
const formatters = [0, 1, 2, 3].map((maximumFractionDigits) => new Intl.NumberFormat('ja-JP', { maximumFractionDigits }))
const format = (value: number, digits = 3) => formatters[digits].format(value)
const outputFormatter = (showDecimals: boolean) => (value: number) => format(value, showDecimals ? 3 : 0)
const metricTitles = {
  effectiveDamage: '総ダメージ（有効）',
  effectiveDps: '有効DPS',
  rawDamage: '攻撃ダメージ',
  rawDps: '攻撃DPS',
  overkillDamage: '余剰ダメージ',
  kills: '平均撃破数',
  explosions: '平均爆発回数',
  confidence: '平均有効DPSの95%信頼区間',
  percentiles: '1戦ごとの有効DPSのばらつき',
} as const

export function GoldenglowTargetSwitchDetailModal({ detail, input, result, showDecimals, onClose }: Props) {
  const content = getDetailContent(detail, input, result, showDecimals)
  if (!content) return null
  return <GoldenglowDetailModal title={content.title} closeLabel={`${content.title}を閉じる`} onClose={onClose}>
    <div className="ggs-detail-content">{content.body}</div>
  </GoldenglowDetailModal>
}

function getDetailContent(detail: GoldenglowTargetSwitchDetail, input: GoldenglowTargetSwitchInput, result: GoldenglowTargetSwitchResult | null, showDecimals: boolean): DetailContent | null {
  if (detail.kind === 'condition') return conditionDetail(detail.condition, input)
  if (detail.kind === 'model') return modelDetail(input)
  if (detail.kind === 'trace') return traceDetail(detail.index, input, detail.trial, detail.seed, showDecimals)
  if (!result) return null
  switch (detail.kind) {
    case 'metric': return metricDetail(detail.metric, input, result, showDecimals)
    case 'comparison': return comparisonDetail(detail.mode, input, result, showDecimals)
    case 'timeline': return timelineDetail(detail.index, result, showDecimals)
  }
}

function ValueTable({ title, rows, text = false }: { title: string; rows: readonly TableRow[]; text?: boolean }) {
  return <section>
    <h3 className="gg-table-title">{title}</h3>
    <div className="gg-probability-table-wrap gg-value-table-wrap">
      <table className={`gg-probability-table gg-value-table${text ? ' ggs-detail-text-table' : ''}`}>
        <caption className="visually-hidden">{title}</caption>
        <tbody>{rows.map(([label, value]) => <tr key={label}><th scope="row">{label}</th><td>{value}</td></tr>)}</tbody>
      </table>
    </div>
  </section>
}

function Equation({ children }: { children: ReactNode }) {
  return <p className="ggs-detail-equation">{children}</p>
}

function AverageNote({ result, showDecimals }: { result: GoldenglowTargetSwitchResult; showDecimals: boolean }) {
  return <p>{format(result.trials, 0)}回の独立した試行を、各試行で撃破と切り替えを判定してから平均しています。結果は{showDecimals ? '小数第3位まで' : '整数'}に丸めて表示し、計算には丸め前の値を使います。表示した内訳の和と合計が一致しない場合があります。</p>
}

function metricDetail(metric: Extract<GoldenglowTargetSwitchDetail, { kind: 'metric' }>['metric'], input: GoldenglowTargetSwitchInput, result: GoldenglowTargetSwitchResult, showDecimals: boolean): DetailContent {
  const formatOutput = outputFormatter(showDecimals)
  const { mean } = result
  const title = metricTitles[metric]
  const damageRows: TableRow[] = [
    ['本体の攻撃ダメージ', formatOutput(mean.bodyDamage)],
    ['浮遊の通常攻撃ダメージ', formatOutput(mean.normalDamage)],
    ['浮遊の爆発ダメージ', formatOutput(mean.explosionDamage)],
    ['攻撃ダメージの合計', formatOutput(mean.rawDamage)],
    ['余剰ダメージ', formatOutput(mean.overkillDamage)],
    ['総ダメージ（有効）', formatOutput(mean.effectiveDamage)],
  ]
  let body: ReactNode
  if (metric === 'effectiveDamage' || metric === 'rawDamage' || metric === 'overkillDamage') {
    body = <>
      <ValueTable title={`${format(result.duration)}秒間の平均ダメージ`} rows={damageRows} />
      {metric === 'rawDamage'
        ? <Equation>攻撃ダメージ = 本体 + 浮遊通常 + 爆発<br />{formatOutput(mean.bodyDamage)} + {formatOutput(mean.normalDamage)} + {formatOutput(mean.explosionDamage)} ≈ {formatOutput(mean.rawDamage)}</Equation>
        : metric === 'effectiveDamage'
          ? <Equation>総ダメージ（有効） = 攻撃ダメージ − 余剰ダメージ<br />{formatOutput(mean.rawDamage)} − {formatOutput(mean.overkillDamage)} ≈ {formatOutput(mean.effectiveDamage)}</Equation>
          : <Equation>余剰ダメージ = 攻撃ダメージ − 総ダメージ（有効）<br />{formatOutput(mean.rawDamage)} − {formatOutput(mean.effectiveDamage)} ≈ {formatOutput(mean.overkillDamage)}</Equation>}
      <p>{input.retargetRemainingDrones ? '各攻撃者の個別攻撃' : '各攻撃回'}の有効ダメージは min（攻撃前の対象の残HP, 攻撃ダメージ）、余剰ダメージは max（0, 攻撃ダメージ − 攻撃前の対象の残HP）です。その合計を試行ごとに求めます。</p>
      <p>全て術耐性適用後の値です。撃破時の余剰は次の敵に与えません。最後の敵を倒しきれなくても、削ったHPは有効ダメージに含みます。</p>
    </>
  } else if (metric === 'effectiveDps' || metric === 'rawDps') {
    const isEffective = metric === 'effectiveDps'
    const damage = isEffective ? mean.effectiveDamage : mean.rawDamage
    const dps = isEffective ? mean.effectiveDps : mean.rawDps
    body = <>
      <ValueTable title="DPSの計算に使う値" rows={[
        [isEffective ? '総ダメージ（有効）' : '攻撃ダメージ', formatOutput(damage)],
        ['計測時間', `${format(result.duration)}秒`],
        [title, formatOutput(dps)],
      ]} />
      <Equation>{title} = {isEffective ? '総ダメージ（有効）' : '攻撃ダメージ'} ÷ 計測時間<br />{formatOutput(damage)} ÷ {format(result.duration)} ≈ {formatOutput(dps)}</Equation>
      <p>最初の攻撃までの待機、撃破後の切り替え時間、最後の攻撃後の端数時間も分母に含みます。全試行の計測時間が同じなので、試行ごとのDPSの平均と、平均ダメージを時間で割った値は一致します。</p>
    </>
  } else if (metric === 'kills') {
    const lastRow = result.sample.trace.at(-1)
    const sampleRemainder = lastRow ? Math.max(0, input.enemyHp - lastRow.nextTargetHp) : 0
    body = <>
      <ValueTable title="撃破数の集計" rows={[
        ['敵1体の最大HP', format(input.enemyHp)],
        ['試行回数', `${format(result.trials, 0)}回`],
        ['平均撃破数', `${formatOutput(mean.kills)}体`],
      ]} />
      <Equation>平均撃破数 = 全試行の撃破数の合計 ÷ 試行回数<br />{format(Math.round(mean.kills * result.trials), 0)} ÷ {format(result.trials, 0)} ≈ {formatOutput(mean.kills)}体</Equation>
      <p>1回の試行の撃破数は整数ですが、平均は小数になります。撃破できなかった最後の敵は数えません。</p>
      <ValueTable title="最初の1試行の例（平均値ではありません）" rows={[
        ['撃破数', `${format(result.sample.totals.kills, 0)}体`],
        ['最後の未撃破の敵に与えた有効ダメージ', formatOutput(sampleRemainder)],
        ['総ダメージ（有効）', formatOutput(result.sample.totals.effectiveDamage)],
      ]} />
      <Equation>この試行の有効ダメージ = 撃破数 × 最大HP + 最後の敵に与えた有効ダメージ<br />{format(result.sample.totals.kills, 0)} × {format(input.enemyHp)} + {formatOutput(sampleRemainder)} ≈ {formatOutput(result.sample.totals.effectiveDamage)}</Equation>
    </>
  } else if (metric === 'explosions') {
    body = <>
      <ValueTable title="爆発回数の集計" rows={[
        ['攻撃する浮遊', `${format(input.model.activeDroneCount, 0)}体`],
        ['平均攻撃回数（一斉攻撃）', `${formatOutput(mean.volleys)}回`],
        ['平均爆発回数（全浮遊の合計）', `${formatOutput(mean.explosions)}回`],
        ['平均爆発ダメージ（術耐性適用後）', formatOutput(mean.explosionDamage)],
      ]} />
      <Equation>平均爆発回数 = 全試行・全浮遊の爆発回数の合計 ÷ 試行回数<br />{format(Math.round(mean.explosions * result.trials), 0)} ÷ {format(result.trials, 0)} ≈ {formatOutput(mean.explosions)}回</Equation>
      <p>各浮遊は攻撃機会ごとに独立して爆発を抽選し、爆発した回の通常攻撃は発生しません。同じ一斉攻撃で浮遊2体が爆発すれば2回と数えます。</p>
    </>
  } else if (metric === 'confidence') {
    const interval = result.dpsConfidence95
    body = <>
      <ValueTable title="平均有効DPSの推定誤差" rows={[
        ['平均有効DPS', formatOutput(mean.effectiveDps)],
        ['試行回数', `${format(result.trials, 0)}回`],
        ['平均の標準誤差', result.dpsStandardError === null ? '算出不可（1試行）' : formatOutput(result.dpsStandardError)],
        ['95%信頼区間', interval ? `${formatOutput(interval.lower)} ～ ${formatOutput(interval.upper)}` : '算出不可（1試行）'],
      ]} />
      <Equation>標準誤差 = 試行ごとの有効DPSの標本標準偏差 ÷ √試行回数</Equation>
      {interval && result.dpsStandardError !== null && <Equation>95%信頼区間 = 平均有効DPS ± 1.96 × 標準誤差（下限は0）<br />{formatOutput(mean.effectiveDps)} ± 1.96 × {formatOutput(result.dpsStandardError)} → {formatOutput(interval.lower)} ～ {formatOutput(interval.upper)}</Equation>}
      <p>正規近似による、平均DPSの推定精度を示す区間です。同じ条件で繰り返し標本を取って区間を作ると、その約95%が真の平均を含むという意味です。</p>
      <p>1戦のDPSが95%の確率でこの範囲に入る、という意味ではありません。1戦ごとのばらつきはP10・P50・P90で確認できます。この区間はゲーム仕様や簡略モデルの誤差を表しません。</p>
    </>
  } else {
    body = <>
      <ValueTable title="試行ごとの有効DPSを小さい順に並べた境界" rows={[
        ['P10（約10%がこの値以下）', formatOutput(result.dpsPercentiles.p10)],
        ['P50・中央値（約50%がこの値以下）', formatOutput(result.dpsPercentiles.p50)],
        ['P90（約90%がこの値以下）', formatOutput(result.dpsPercentiles.p90)],
      ]} />
      <Equation>0始まりの順位 =（試行回数 − 1）× 割合<br />P10：（{format(result.trials, 0)} − 1）× 0.1 = {format((result.trials - 1) * 0.1)}<br />P50：（{format(result.trials, 0)} − 1）× 0.5 = {format((result.trials - 1) * 0.5)}<br />P90：（{format(result.trials, 0)} − 1）× 0.9 = {format((result.trials - 1) * 0.9)}</Equation>
      <p>順位が整数でない場合は、前後の試行のDPSを直線補間しています。P10～P90は今回の試行の中央約80%の幅を示し、平均値の信頼区間とは異なります。</p>
    </>
  }
  return { title: `${title}の詳細`, body: <>{body}<AverageNote result={result} showDecimals={showDecimals} /></> }
}

function conditionDetail(condition: Extract<GoldenglowTargetSwitchDetail, { kind: 'condition' }>['condition'], input: GoldenglowTargetSwitchInput): DetailContent {
  const { model } = input
  const appliedResistance = Math.max(0, input.enemyResistance - model.resistanceIgnoreFixed)
  switch (condition) {
    case 'enemyHp': return { title: '敵HPと次の攻撃対象', body: <>
      <ValueTable title="敵の条件" rows={[['最大HP', format(input.enemyHp)], ['各攻撃の対象', '1体']]} />
      <p>同じステータスの敵が制限なく続く条件です。最初の敵も、撃破後の次の敵も満HPから始めます。{input.retargetRemainingDrones ? '本体・浮遊#1・#2…の順に個別攻撃し、撃破した時点で残りの浮遊が次の敵へ切り替えます。同じ攻撃回で複数の敵を攻撃・撃破する場合があります。' : '本体と全浮遊が同じ敵に一斉攻撃し、その後に撃破を判定します。'}</p>
      <Equation>{input.retargetRemainingDrones ? '個別攻撃' : 'その回'}の有効ダメージ = min（攻撃前の対象の残HP, {input.retargetRemainingDrones ? '個別' : 'その回の'}攻撃ダメージ）</Equation>
      <p>残HPを超えた余剰ダメージは次の敵に引き継ぎません。次の敵へ切り替わると全浮遊の通常攻撃倍率が初期値に戻ります。</p>
    </> }
    case 'enemyResistance': return { title: '術耐性適用後のダメージ', body: <>
      <ValueTable title="術耐性の条件" rows={[
        ['敵術耐性', format(input.enemyResistance)],
        ['固定術耐性無視', format(model.resistanceIgnoreFixed)],
        ['適用する術耐性', format(appliedResistance)],
        ['軽減後の倍率（最低保証を含む）', `${format(Math.max(0.05, 1 - appliedResistance / 100) * 100)}%`],
      ]} />
      <Equation>適用術耐性 = max（0, {format(input.enemyResistance)} − {format(model.resistanceIgnoreFixed)}）= {format(appliedResistance)}<br />軽減後ダメージ = 軽減前ダメージ × max（5%, 1 − {format(appliedResistance)} ÷ 100）</Equation>
      <p>本体、浮遊の通常攻撃、爆発それぞれに適用します。「攻撃ダメージ」も、この術耐性を適用した後の値です。その後、敵の残HPで有効ダメージを制限します。</p>
    </> }
    case 'attackInterval': return { title: '攻撃間隔と攻撃時刻', body: <>
      <ValueTable title="時間の条件" rows={[
        ['攻撃間隔', `${format(input.attackInterval)}秒`],
        ['初回の着弾時刻', `${format(input.attackInterval)}秒`],
        ['撃破した攻撃回から次回まで', `${format(input.attackInterval + input.switchDelay)}秒`],
      ]} />
      <Equation>n回目の着弾時刻 = n × {format(input.attackInterval)}秒 + それまでに撃破が起きた攻撃回数 × {format(input.switchDelay)}秒</Equation>
      <p>本体と全浮遊に共通の間隔です。計測開始から1間隔後に初回が着弾します。終了時刻ちょうどの着弾は含め、終了時刻を超える攻撃や端数回の攻撃は含めません。</p>
      {input.retargetRemainingDrones && <p>同じ攻撃回内の個別攻撃・対象切り替えには時間を加えません。その回で何体倒しても、次回までに加える切り替えの追加時間は1回分です。</p>}
    </> }
    case 'duration': return { title: input.skillIndex === 2 ? 'S2発動後の計測時間' : `S${input.skillIndex}の計測時間`, body: <>
      <ValueTable title="集計する時間" rows={[
        ['計測時間', `${format(input.duration)}秒`],
        ['攻撃間隔', `${format(input.attackInterval)}秒`],
        ['切り替え遅延がない場合の攻撃回数', `${format(Math.floor(input.duration / input.attackInterval + 1e-9), 0)}回`],
      ]} />
      <p>{input.skillIndex === 2 ? 'S2は永続スキルのため、発動後の指定時間だけを集計します。' : 'スキル持続時間を集計します。'}発動前の攻撃、SPを貯める時間、スキルの再発動は含めません。</p>
      <p>計測の初期状態は全浮遊の通常倍率{format(model.droneInitialAttackScale * 100)}%・連続不発0回です。スキル発動が実際に倍率や不発回数を初期化する、という意味ではありません。</p>
    </> }
    case 'drones': return { title: '浮遊の攻撃と倍率', body: <>
      <ValueTable title="浮遊の条件" rows={[
        ['攻撃する浮遊', `${format(model.activeDroneCount, 0)}体`],
        ['通常攻撃の初期倍率', `${format(model.droneInitialAttackScale * 100)}%`],
        ['通常攻撃ごとの増加', `${format(model.droneAttackScaleStep * 100)}ポイント`],
        ['通常攻撃の最大倍率', `${format(model.droneMaxAttackScale * 100)}%`],
        ['爆発の攻撃倍率', `${format(model.attackScale * 100)}%`],
        ['本体の攻撃', input.skillIndex === 3 ? 'なし（S3）' : 'あり'],
      ]} />
      <p>通常攻撃倍率と爆発の連続不発回数は浮遊ごとに管理します。自爆はその浮遊の通常攻撃を置き換え、不発回数だけを0に戻します。同じ敵なら通常倍率を維持し、撃破で敵が変わると全浮遊の通常倍率が初期値へ戻ります。</p>
      <p>敵が変わっても連続不発回数を維持する扱いは、参照資料の初期化条件から採用した仮定です。パネル5の攻撃履歴から、浮遊ごとの抽選結果や倍率の変化を確認できます。</p>
    </> }
    case 'switchDelay': return { title: '撃破後の切り替え時間', body: <>
      <ValueTable title="次の敵を攻撃するまでの時間" rows={[
        ['通常の攻撃間隔', `${format(input.attackInterval)}秒`],
        ['切り替えの追加時間', `${format(input.switchDelay)}秒`],
        ['撃破した攻撃回から次回まで', `${format(input.attackInterval + input.switchDelay)}秒`],
      ]} />
      <Equation>次の攻撃回の着弾時刻 = 撃破した攻撃回の時刻 + {format(input.attackInterval)} + {format(input.switchDelay)}秒</Equation>
      <p>追加時間は、撃破が起きた攻撃回の次回に1回分だけ加算します。実測済みの仕様値ではなく、切り替えの遅れが出力に与える影響を調べるための仮定です。</p>
      <p>浮遊の帰還、移動、自爆演出は0秒としています。追加時間が0秒でも、次の攻撃回は攻撃間隔1回分の後です。{input.retargetRemainingDrones && '同じ攻撃回内では、残りの浮遊は時間を加えず次の敵に攻撃します。'}</p>
    </> }
    case 'retargetRemainingDrones': return { title: '撃破後の残り浮遊の切り替え（仮定）', body: <>
      <ValueTable title="現在の設定" rows={[['残りの浮遊の切り替え', input.retargetRemainingDrones ? 'あり' : 'なし']]} />
      <p>実際にこの仕様があるかは未確認です。敵HPを先読みして攻撃数を割り当てる処理ではなく、撃破後に、まだ攻撃していない浮遊を次の敵へ切り替えられるという仮定を比較します。</p>
      <ValueTable title="2つの計算方法" text rows={[
        ['なし', '本体と全浮遊が同じ敵へ攻撃し、合計ダメージを与えた後に撃破を判定します。'],
        ['あり', '本体（S1・S2）→浮遊#1→#2…の順に攻撃し、1回ごとに撃破を判定します。撃破後の残りの浮遊は次の敵を攻撃します。S3では本体は攻撃しません。'],
      ]} />
      <p>攻撃順も比較用の仮定です。「あり」では、撃破のたびに全浮遊の通常倍率を初期化し、残りの浮遊は切り替え後の倍率で攻撃します。連続不発回数は対象変更ではリセットせず、自爆した浮遊だけ0に戻します。</p>
      <p>どちらも余剰ダメージは次の敵に引き継ぎません。同じ攻撃回内の処理は同じ時刻とし、切り替えの追加時間は撃破があった回の次回に1回分だけ加えます。</p>
    </> }
    case 'sampling': return { title: '試行回数と抽選番号', body: <>
      <ValueTable title="反復計算の条件" rows={[
        ['試行回数', `${format(input.trials, 0)}回`],
        ['抽選番号', format(input.seed, 0)],
      ]} />
      <p>爆発を抽選しながら1戦ずつ撃破と切り替えを計算し、その結果を平均します。平均ダメージを敵HPで割って撃破数を求める方式ではありません。</p>
      <p>同じ条件と抽選番号なら結果を再現できます。試行回数を増やしても最初の1試行の履歴は変わりません。同一目標との比較では、対応する試行を同じ抽選番号から開始します。</p>
      <p>試行回数を増やすと平均の推定誤差はおおむね小さくなりますが、1戦の結果のばらつきやモデルの仮定そのものは変わりません。</p>
    </> }
  }
}

function comparisonDetail(mode: Extract<GoldenglowTargetSwitchDetail, { kind: 'comparison' }>['mode'], input: GoldenglowTargetSwitchInput, result: GoldenglowTargetSwitchResult, showDecimals: boolean): DetailContent {
  const formatOutput = outputFormatter(showDecimals)
  const titles = { baseline: '同一目標・HP無限', raw: '撃破で切り替え・攻撃ダメージ', effective: '撃破で切り替え・有効ダメージ' }
  const damage = mode === 'baseline' ? result.baseline.rawDamage : mode === 'raw' ? result.mean.rawDamage : result.mean.effectiveDamage
  const dps = mode === 'baseline' ? result.baseline.rawDps : mode === 'raw' ? result.mean.rawDps : result.mean.effectiveDps
  return { title: `${titles[mode]}の比較条件`, body: <>
    <ValueTable title={`${format(result.duration)}秒間・${format(result.trials, 0)}回の平均`} rows={[
      ['同一目標・HP無限の攻撃ダメージ', formatOutput(result.baseline.rawDamage)],
      ['撃破で切り替えた攻撃ダメージ', formatOutput(result.mean.rawDamage)],
      ['撃破で切り替えた有効ダメージ', formatOutput(result.mean.effectiveDamage)],
      [`選択条件のDPS`, formatOutput(dps)],
    ]} />
    <Equation>選択条件のDPS = {formatOutput(damage)} ÷ {format(result.duration)} ≈ {formatOutput(dps)}</Equation>
    {mode === 'baseline' ? <p>HP無限の敵を同じ時間攻撃します。撃破・切り替え・余剰ダメージはなく、通常倍率は自爆後も維持します。全ダメージが有効なため、攻撃ダメージと有効ダメージは一致します。</p>
      : <>
        <Equation>攻撃ダメージの差 = 同一目標 − 切り替え後の攻撃ダメージ<br />{formatOutput(result.baseline.rawDamage)} − {formatOutput(result.mean.rawDamage)} ≈ {formatOutput(result.baseline.rawDamage - result.mean.rawDamage)}</Equation>
        <p>この差には撃破で通常倍率が初期値に戻る影響と、切り替えの追加時間（{format(input.switchDelay)}秒）で攻撃回数が減る影響を含みます。影響ごとの内訳は分離していません。</p>
        {mode === 'effective' && <Equation>切り替え後の有効ダメージ = 攻撃ダメージ − 余剰ダメージ<br />{formatOutput(result.mean.rawDamage)} − {formatOutput(result.mean.overkillDamage)} ≈ {formatOutput(result.mean.effectiveDamage)}</Equation>}
      </>}
    <p>比較する各試行は同じ抽選番号から始め、同じ攻撃力・術耐性・浮遊数・初期状態・着弾時刻のルールを使います。切り替え時間によって攻撃機会が減ると、抽選回数も変わります。</p>
    <p>比較値はこのページ内で計算したものです。既存の素質分析ページとは開始条件や端数回の扱いが異なる場合があります。</p>
    <AverageNote result={result} showDecimals={showDecimals} />
  </> }
}

function timelineDetail(index: number, result: GoldenglowTargetSwitchResult, showDecimals: boolean): DetailContent | null {
  const formatOutput = outputFormatter(showDecimals)
  if (!Number.isInteger(index) || index < 0 || index >= result.timeline.length) return null
  const point = result.timeline[index]
  return { title: `${format(point.time)}秒時点の累積結果`, body: <>
    <ValueTable title={`開始から${format(point.time)}秒までの全試行平均`} rows={[
      ['総ダメージ（有効）', formatOutput(point.effectiveDamage)],
      ['攻撃ダメージ', formatOutput(point.rawDamage)],
      ['余剰ダメージ', formatOutput(point.rawDamage - point.effectiveDamage)],
      ['同一目標・HP無限の攻撃ダメージ', formatOutput(point.baselineRawDamage)],
      ['撃破数', `${formatOutput(point.kills)}体`],
    ]} />
    <Equation>平均累積ダメージ = 各試行で{format(point.time)}秒までに着弾したダメージの合計 ÷ {format(result.trials, 0)}<br />累積余剰ダメージ = {formatOutput(point.rawDamage)} − {formatOutput(point.effectiveDamage)} ≈ {formatOutput(point.rawDamage - point.effectiveDamage)}</Equation>
    <p>選んだ時刻ちょうどの攻撃も含みます。各試行の撃破タイミングと着弾時刻は異なるため、その時刻までの値を各試行で集計してから平均しています。平均的な1戦の履歴を示しているわけではありません。</p>
    <p>開始時刻の累積値は0です。終了時刻の累積値は「ダメージ結果」の総ダメージに一致します。</p>
    <AverageNote result={result} showDecimals={showDecimals} />
  </> }
}

function traceDetail(index: number, input: GoldenglowTargetSwitchInput, trial: GoldenglowTargetSwitchTrial, seed: number, showDecimals: boolean): DetailContent | null {
  const formatOutput = outputFormatter(showDecimals)
  if (!Number.isInteger(index) || index < 0 || index >= trial.trace.length) return null
  const row = trial.trace[index]
  const nextRow = trial.trace[index + 1]
  const sequential = Boolean(row.attacks)
  const nextTime = row.time + input.attackInterval + (row.killed ? input.switchDelay : 0)
  return { title: `${index + 1}回目の攻撃・${format(row.time)}秒`, body: <>
    <p>抽選番号{format(seed, 0)}で計算した1回分の攻撃履歴です。</p>
    <ValueTable title={sequential ? `敵#${row.targetNumber}から開始した攻撃回` : `敵#${row.targetNumber}への一斉攻撃`} rows={[
      ['着弾時刻', `${format(row.time)}秒`],
      [sequential ? '開始時の敵の残HP' : '攻撃前の残HP', formatOutput(row.hpBefore)],
      ['本体ダメージ', formatOutput(row.bodyDamage)],
      ['浮遊の通常攻撃ダメージ（合計）', formatOutput(row.normalDamage)],
      ['爆発ダメージ（合計）', formatOutput(row.explosionDamage)],
      ['爆発した浮遊', `${format(row.explosions, 0)}体`],
      ['攻撃ダメージ', formatOutput(row.rawDamage)],
      ['有効ダメージ', formatOutput(row.effectiveDamage)],
      ['余剰ダメージ', formatOutput(row.overkillDamage)],
      ...(!sequential ? [['攻撃後の残HP', formatOutput(row.hpAfter)] as TableRow] : []),
      ['結果', row.killed ? `${format(row.kills, 0)}体撃破 → 敵#${row.nextTargetNumber}` : `敵#${row.targetNumber}を継続`],
    ]} />
    {row.attacks && <>
      <h3 className="gg-table-title" id="ggs-individual-attacks-title">個別攻撃と対象の切り替え</h3>
      <div className="gg-probability-table-wrap" tabIndex={0} role="region" aria-labelledby="ggs-individual-attacks-title">
        <table className="ggs-drone-trace-table" aria-labelledby="ggs-individual-attacks-title">
          <thead><tr><th scope="col">攻撃者</th><th scope="col">対象</th><th scope="col">攻撃前HP</th><th scope="col">ダメージ</th><th scope="col">有効ダメージ</th><th scope="col">余剰ダメージ</th><th scope="col">攻撃後HP</th><th scope="col">結果</th></tr></thead>
          <tbody>{row.attacks.map((attack, attackIndex) => <tr key={attackIndex}>
            <th scope="row">{attack.actor === 'body' ? '本体' : `浮遊#${attack.droneNumber}`}</th>
            <td>敵#{attack.targetNumber}</td><td>{formatOutput(attack.hpBefore)}</td><td>{formatOutput(attack.damage)}</td>
            <td>{formatOutput(attack.effectiveDamage)}</td><td>{formatOutput(attack.overkillDamage)}</td><td>{formatOutput(attack.hpAfter)}</td>
            <td>{attack.killed ? '撃破' : '生存'}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <p>上から順に判定した記録です。撃破後の残りの浮遊が次の敵へ切り替える仮定を使い、個別攻撃ごとに残HPと余剰ダメージを求めています。同じ攻撃回内では時間を進めません。</p>
    </>}
    <h3 className="gg-table-title" id="ggs-drone-rolls-title">浮遊ユニットごとの抽選</h3>
    <div className="gg-probability-table-wrap" tabIndex={0} role="region" aria-labelledby="ggs-drone-rolls-title">
      <table className="ggs-drone-trace-table" aria-labelledby="ggs-drone-rolls-title">
        <thead><tr><th scope="col">浮遊ユニット</th><th scope="col">爆発確率</th><th scope="col">抽選値</th><th scope="col">結果</th><th scope="col">適用倍率</th><th scope="col">ダメージ</th></tr></thead>
        <tbody>{row.drones.map((drone) => <tr key={drone.droneNumber}>
          <th scope="row">#{drone.droneNumber}</th><td>{drone.explosionChancePercent.toLocaleString('ja-JP', { maximumFractionDigits: 6 })}%</td>
          <td>{drone.rollPercent.toLocaleString('ja-JP', { maximumFractionDigits: 6 })}%</td><td>{drone.exploded ? '爆発' : '通常攻撃'}</td>
          <td>{format(drone.exploded ? input.model.attackScale * 100 : drone.normalScalePercent)}%</td><td>{formatOutput(drone.damage)}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <p>抽選値（0以上100未満）が爆発確率を下回ると爆発します。判定には丸め前の値を使います。爆発した浮遊は、その回の通常攻撃を行いません。</p>
    <h3 className="gg-table-title" id="ggs-drone-state-title">次回へ引き継ぐ状態</h3>
    <div className="gg-probability-table-wrap" tabIndex={0} role="region" aria-labelledby="ggs-drone-state-title">
      <table className="ggs-drone-trace-table" aria-labelledby="ggs-drone-state-title">
        <thead><tr><th scope="col">浮遊ユニット</th><th scope="col">通常倍率（今回 → 次回）</th><th scope="col">連続不発回数（攻撃前 → 後）</th></tr></thead>
        <tbody>{row.drones.map((drone) => <tr key={drone.droneNumber}>
          <th scope="row">#{drone.droneNumber}</th>
          <td>{format(drone.normalScalePercent)}% → {format(getGoldenglowDroneAttackScalePercent(drone.normalStackAfter + 1, input.model))}%</td>
          <td>{drone.missesBefore}回 → {drone.missesAfter}回</td>
        </tr>)}</tbody>
      </table>
    </div>
    <Equation>攻撃ダメージ = 本体 + 浮遊通常 + 爆発<br />{formatOutput(row.bodyDamage)} + {formatOutput(row.normalDamage)} + {formatOutput(row.explosionDamage)} ≈ {formatOutput(row.rawDamage)}</Equation>
    {sequential ? <>
      <Equation>有効ダメージ = 各個別攻撃の min（対象の攻撃前HP, 個別ダメージ）の合計 ≈ {formatOutput(row.effectiveDamage)}</Equation>
      <Equation>余剰ダメージ = 各個別攻撃の max（0, 個別ダメージ − 対象の攻撃前HP）の合計 ≈ {formatOutput(row.overkillDamage)}</Equation>
    </> : <>
      <Equation>有効ダメージ = min（残HP, 攻撃ダメージ）<br />min（{formatOutput(row.hpBefore)}, {formatOutput(row.rawDamage)}）≈ {formatOutput(row.effectiveDamage)}</Equation>
      <Equation>余剰ダメージ = max（0, 攻撃ダメージ − 残HP）<br />max（0, {formatOutput(row.rawDamage)} − {formatOutput(row.hpBefore)}）≈ {formatOutput(row.overkillDamage)}<br />攻撃後の残HP = max（0, {formatOutput(row.hpBefore)} − {formatOutput(row.effectiveDamage)}）≈ {formatOutput(row.hpAfter)}</Equation>
    </>}
    <ValueTable title="次の攻撃" rows={[
      ['追加の切り替え時間', `${format(row.killed ? input.switchDelay : 0)}秒`],
      ['次回の着弾時刻', nextRow ? `${format(nextRow.time)}秒` : `${format(nextTime)}秒（計測時間外）`],
      ['次の攻撃対象', `敵#${row.nextTargetNumber}`],
      ['次の攻撃前の敵HP', formatOutput(row.nextTargetHp)],
    ]} />
    <Equation>次の着弾時刻 = {format(row.time)} + {format(input.attackInterval)} + {format(row.killed ? input.switchDelay : 0)} = {format(nextTime)}秒</Equation>
    <p>{row.killed
      ? sequential
        ? `撃破のたびに全浮遊の通常攻撃倍率を${format(input.model.droneInitialAttackScale * 100)}%へ戻します。その後に攻撃する浮遊は新しい対象への通常攻撃で倍率が増える場合があり、上の表は全個別攻撃の処理後の状態を示します。次回は敵#${row.nextTargetNumber}の残HP${formatOutput(row.nextTargetHp)}から再開します。`
        : `撃破したので全浮遊の通常攻撃倍率を${format(input.model.droneInitialAttackScale * 100)}%へ戻し、次の満HPの敵を攻撃します。`
      : '同じ敵を攻撃し続けます。通常攻撃した浮遊の倍率は上限まで増え、自爆した浮遊は同じ敵への通常倍率を維持します。'}爆発の不発回数は自爆した浮遊だけ0になり、それ以外の浮遊は引き継ぎます。</p>
    <p>{sequential ? '本体（S1・S2）・浮遊#1・#2…の順に攻撃と撃破を判定する比較用の仮定です。実際の仕様や攻撃順が確認できたことを意味しません。同じ攻撃回で何体倒しても、次回までの切り替えの追加時間は1回分です。' : '本体と全浮遊のダメージを同じ敵へ同時に適用した後、撃破を判定します。'}全ダメージは術耐性適用後です。ダメージと残HPは{showDecimals ? '小数第3位まで' : '整数'}に丸めて表示します。時刻と倍率は小数第3位、抽選値と爆発確率は小数第6位まで表示し、計算と撃破判定には丸め前の値を使います。表示した内訳の和と合計が一致しない場合があります。</p>
  </> }
}

function modelDetail(input: GoldenglowTargetSwitchInput): DetailContent {
  return { title: '計算モデルと参照元', body: <>
    <ValueTable title="このページの計算条件" text rows={[
      ['敵と攻撃対象', `同じHP・術耐性の敵が1体ずつ無制限に続きます。撃破後に次の満HPの敵へ切り替えます。${input.retargetRemainingDrones ? '同じ攻撃回内でも、残りの浮遊が次の敵を攻撃する仮定です。' : '各攻撃回の本体と全浮遊は同じ敵を攻撃します。'}爆発の周囲巻き込みは含めません。`],
      ['開始時点', `全浮遊の通常倍率${format(input.model.droneInitialAttackScale * 100)}%・連続不発0回から計測します。スキル発動そのものがゲーム内でこれらを初期化する、という意味ではありません。発動前の攻撃は含めません。`],
      ['通常倍率', `浮遊ごとに、通常攻撃のたびに${format(input.model.droneAttackScaleStep * 100)}ポイント増え、最大${format(input.model.droneMaxAttackScale * 100)}%。自爆は通常攻撃を置き換え、同じ敵なら倍率を維持します。撃破で全浮遊の通常倍率を初期値へ戻します。`],
      ['爆発確率', '浮遊ごとに連続不発回数を管理し、爆発した浮遊だけ0に戻します。対象変更でも不発回数を維持するのは、参照資料の初期化条件から採用した扱いです。'],
      ['攻撃時刻', '初回は攻撃間隔1回分の後に着弾します。終了時刻ちょうどまでを含み、端数回は加えません。S2は永続のため、発動後の指定時間を計測します。'],
      ['残りの浮遊の切り替え', input.retargetRemainingDrones
        ? 'あり：本体→浮遊#1→#2…の順に個別攻撃し、撃破後の残りの浮遊は次の敵を攻撃します。個別攻撃の余剰ダメージは次の敵へ与えません。S3では本体は攻撃しません。'
        : 'なし：各回の本体・全浮遊の着弾をまとめて同じ敵に適用し、その後に撃破判定します。同じ回の余剰ダメージを次の敵に流しません。S3では本体は攻撃しません。'],
      ['移動・再索敵', `帰還・移動・自爆演出は0秒とする簡略モデルです。撃破が起きた攻撃回から次回まで「攻撃間隔＋切り替えの追加時間」を空けます。${input.retargetRemainingDrones ? '同じ攻撃回内の切り替えは0秒とし、何体倒しても追加時間は次回までに1回分だけ加えます。' : ''}追加時間は実測値ではなく影響を調べるための仮定です。射程、敵の移動、飛翔中の攻撃は再現しません。`],
      ['ダメージの定義', '総ダメージは術耐性適用後・残HPで制限する前の攻撃ダメージの合計です。有効ダメージは実際に敵HPを削った分で、最後の未撃破の敵へのダメージも含みます。その差が余剰ダメージです。DPSは総ダメージを計測時間全体で割ります。'],
      ['推定とばらつき', '結果は爆発を抽選する反復計算の平均です。95%信頼区間は平均DPSの推定誤差、P10・P50・P90は1戦ごとのばらつきを示します。履歴は最初の1試行で、平均ではありません。'],
      ['同一目標との比較', 'HP無限・切り替えなしで、同じモデルと対応する抽選番号を使って再計算します。通常倍率の維持、初撃、終了時刻のルールも共通です。既存の分析ページとは開始条件や端数回の扱いが異なる場合があります。'],
    ]} />
    <p>撃破後に残りの浮遊が次の敵へ切り替える仕様の有無は未確認です。「あり」「なし」を切り替えて結果を比較するためのモデルで、攻撃順も仮定です。敵HPを先読みして攻撃数を割り当てる処理は行いません。</p>
    <h3 className="gg-table-title">参照元</h3>
    <div className="ggs-detail-sources">
      <a href={DATA_SOURCE_URLS.character} target="_blank" rel="noopener noreferrer">日本版ゲームデータ：ステータス・素質 ↗</a>
      <a href={DATA_SOURCE_URLS.skill} target="_blank" rel="noopener noreferrer">日本版ゲームデータ：スキル ↗</a>
      <a href="https://www.taptap.cn/moment/244077134497186876" target="_blank" rel="noopener noreferrer">実測を含む素質の検証記事（中国語） ↗</a>
      <a href="https://prts.wiki/w/%E6%BE%84%E9%97%AA" target="_blank" rel="noopener noreferrer">PRTS：浮遊と自爆の仕様注記 ↗</a>
      <a href="https://docs.google.com/document/d/1fTSdhm880QdwoVgQZgdatqainIV_eamv/edit" target="_blank" rel="noopener noreferrer">撃破前後の浮遊の観察記録（切り替え仕様は未確認） ↗</a>
    </div>
  </> }
}
