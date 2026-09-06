import { useState, type ReactNode } from 'react'
import { calculateDamageBreakdown } from '../lib/damageCalculator'
import { DATA_SOURCE_URLS } from '../lib/dataSources'
import { buildGoldenglowAttackTrace, buildGoldenglowCycleTrace } from '../lib/goldenglowAttackTrace'
import {
  calculateGoldenglowExpectedDpsFromModel,
  calculateGoldenglowExplosionDamage,
  getGoldenglowDroneAttackScalePercent,
  getGoldenglowNextExplosionChancePercent,
  type GoldenglowExplosionModel,
} from '../lib/goldenglowExplosion'
import { GoldenglowDamageTable } from './GoldenglowDamageTable'
import './DamageCalculator.css'
import './GoldenglowGuidePage.css'

// The walkthrough explains the same standard model used by DamageCalculator.
const referenceModel: GoldenglowExplosionModel = {
  talentName: '電流暴走', talentDescription: '', damageType: 'ARTS',
  attackScale: 3, attackScalePercent: 300, nominalChancePercent: 10,
  prdStep: 0.015, prdMaxStack: 40,
  additionalDroneCount: 1, activeDroneCount: 2, resistanceIgnoreFixed: 15,
  droneInitialAttackScale: 0.2, droneInitialAttackScalePercent: 20,
  droneAttackScaleStep: 0.15, droneAttackScaleStepPercent: 15,
  droneMaxAttackScale: 1.1, droneMaxAttackScalePercent: 110, droneMaxStack: 6,
}
const examples = [
  {
    skill: 1, name: 'スパーキング', attack: 547, multiplier: 1.4, interval: 0.867, duration: 25, drones: 2,
    initialSp: 20, spCost: 35, activation: '手動発動',
    attackBonus: 40, effect: '攻撃速度+50 · 浮遊+1 · 自動索敵',
  },
  {
    skill: 2, name: 'インパルスカレント', attack: 625, multiplier: 1.6, interval: 1.3, duration: 0, drones: 2,
    initialSp: 0, spCost: 70, activation: '自動発動',
    attackBonus: 60, effect: '攻撃範囲拡大 · 浮遊+1 · 自動索敵',
  },
  {
    skill: 3, name: 'ゴールデングロー', attack: 703, multiplier: 1.8, interval: 1.3, duration: 30, drones: 3,
    initialSp: 17, spCost: 35, activation: '手動発動',
    attackBonus: 80, effect: '本体攻撃停止 · 浮遊+2 · 全域索敵 · 浮遊の攻撃で0.5秒足止め',
  },
] as const
const flow = [
  { id: 'conditions', label: '条件', title: '計算する条件を決める' },
  { id: 'branches', label: '攻撃の分岐', title: '次の攻撃を2つに分ける' },
  { id: 'expectation', label: '1回の期待値', title: '確率を掛けて、1回の期待値にする' },
  { id: 'repeat', label: '繰り返し', title: '初回から、各回の期待値を積み上げる' },
  { id: 'total', label: '合計・DPS', title: '本体と浮遊を合算する' },
] as const
const format = (value: number | null, digits = 2) => value === null
  ? '—'
  : new Intl.NumberFormat('ja-JP', { maximumFractionDigits: digits }).format(value)

export function GoldenglowGuidePage() {
  const [exampleIndex, setExampleIndex] = useState(0)
  const [misses, setMisses] = useState(0)
  const [droneCount, setDroneCount] = useState(2)
  const example = examples[exampleIndex]
  const skillLabel = `S${example.skill} ${example.name}`
  const model = { ...referenceModel, activeDroneCount: example.drones, additionalDroneCount: example.drones - 1 }
  const explosion = calculateGoldenglowExplosionDamage(example.attack, 0, 0, model)
  const result = calculateGoldenglowExpectedDpsFromModel({
    model: { ...model, activeDroneCount: droneCount },
    skillIndex: example.skill, effectiveAttack: example.attack,
    attackInterval: example.interval, duration: example.duration, enemyResistance: 0,
  })!
  const readState = (m: number) => {
    const chance = getGoldenglowNextExplosionChancePercent(m, model)
    const scale = getGoldenglowDroneAttackScalePercent(m + 1, model)
    const normalDamage = calculateDamageBreakdown(example.attack * scale / 100, 'ARTS', 0, 0, {
      resistanceIgnoreFixed: model.resistanceIgnoreFixed,
    }).result
    const normalContribution = (1 - chance / 100) * normalDamage
    const explosionContribution = chance / 100 * explosion.damageAfterMitigation
    return { chance, scale, normalDamage, normalContribution, explosionContribution, expected: normalContribution + explosionContribution }
  }
  const state = readState(misses)
  const first = readState(0)
  const afterMiss = readState(1)
  const secondAfterExplosion = first.chance / 100 * first.expected
  const secondAfterMiss = (1 - first.chance / 100) * afterMiss.expected
  const secondExpected = secondAfterExplosion + secondAfterMiss
  const finite = result.mode === 'FINITE_WINDOW'
  const fullAttackCount = result.fullAttackCount ?? 0
  const fraction = result.fractionalAttackWeight ?? 0
  const trace = buildGoldenglowAttackTrace({
    model, effectiveAttack: example.attack, attackCount: finite ? fullAttackCount + 1 : 3,
  })
  const lastFull = trace[fullAttackCount - 1]
  const nextAttack = trace[fullAttackCount]
  const cycleTrace = buildGoldenglowCycleTrace({ model, effectiveAttack: example.attack })
  const cycleLast = cycleTrace[cycleTrace.length - 1]
  const cycleAttacks = cycleLast.cumulativeExpectedAttacks
  const cycleSeconds = cycleAttacks * example.interval
  const cycleDamage = cycleLast.cumulativeExpectedDamage

  return (
    <section className="calculator-page gg-reference-page" aria-labelledby="gg-reference-title">
      <header className="page-intro">
        <div><span className="page-kicker">CALCULATION REFERENCE</span><h1 id="gg-reference-title">GG 爆発期待値の計算</h1></div>
        <a className="gg-reference-link" href="#/damage">ダメージ計算へ →</a>
      </header>
      <nav className="gg-flow-nav" aria-label="期待値計算の流れ">
        <ol>{flow.map((step, index) => <li key={step.id}><a href={`#/guides/goldenglow-explosion`} onClick={(event) => {
          event.preventDefault()
          document.getElementById(`gg-${step.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }}><span>{index + 1}</span>{step.label}</a></li>)}</ol>
      </nav>

      <GuideStep index={0}>
        <div className="skill-choice-group" role="group" aria-label="計算例のスキル">
          {examples.map((item, index) => (
            <button key={item.skill} type="button" className={exampleIndex === index ? 'active' : ''}
              aria-pressed={exampleIndex === index} aria-label={`S${item.skill} ${item.name}`}
              onClick={() => {
                if (index === exampleIndex) return
                setExampleIndex(index)
                setDroneCount(item.drones)
              }}>
              <span>S{item.skill}</span><strong>{item.name}</strong>
            </button>
          ))}
        </div>
        <p className="gg-skill-effect" aria-label="選択したスキルの効果"><strong>{skillLabel}</strong><span>攻撃力+{example.attackBonus}% · {example.effect}</span></p>
        <dl className="model-value-grid gg-input-values">
          <ReferenceValue label="補正後攻撃力 A" value={example.attack} unit={`391 × ${example.multiplier}を切り捨て`} />
          <ReferenceValue label="攻撃間隔" value={example.interval} unit="秒" />
          <ReferenceValue label="持続時間" value={example.duration || '永続'} unit={example.duration ? '秒' : ''} />
          <ReferenceValue label="浮遊ユニット" value={example.drones} unit="体" />
        </dl>
        <p className="calculation-process-note">昇進2 Lv.90・信頼度100・特化3・潜在補正なし・モジュール未装備。まず術耐性0の敵を、浮遊1体が攻撃する例を追います。</p>
      </GuideStep>

      <GuideStep index={1}>
        <p className="gg-step-lead">浮遊の攻撃は「通常攻撃」か「爆発」のどちらかです。直前までの連続不発回数 m から、次の1回の確率を求めます。</p>
        <div className="gg-state-control">
          <div className="gg-reference-slider">
            <label htmlFor="gg-reference-misses">連続不発回数 m <strong>{misses}回</strong></label>
            <input id="gg-reference-misses" type="range" min="0" max="40" step="1" value={misses}
              aria-valuetext={`${misses}回。次の${misses + 1}回目の爆発率${format(state.chance)}%`}
              onChange={(event) => setMisses(Number(event.target.value))} />
            <div className="gg-reference-slider-scale" aria-hidden="true"><span>0</span><span>40</span></div>
          </div>
          <div className="gg-state-chance" aria-live="polite"><span>{misses === 40 ? '41回目は確定爆発' : `次の${misses + 1}回目の爆発率`}</span>
            <strong>{format(state.chance)}%</strong><small>{misses === 40 ? '40回連続で不発 → 100%' : `1.5% × (${misses} + 1)`}</small>
          </div>
        </div>
        <p className="calculation-process-note">電流暴走の表記は10%。実際は初回1.5%、不発ごとに+1.5ポイント。40回目は60%、41回目は100%です。各浮遊が個別に抽選します。</p>
        <div className="gg-branch-grid" aria-label="次の攻撃の分岐">
          <article className={`gg-branch ${state.chance === 100 ? 'gg-branch-inactive' : ''}`}>
            <header><h3>通常攻撃</h3><strong>{format(100 - state.chance)}%</strong></header>
            <div className="gg-branch-value"><span>ダメージ</span><strong>{state.chance === 100 ? '発生しません' : format(state.normalDamage, 4)}</strong></div>
            <code>{example.attack} × {format(state.scale)}%{state.chance === 100 ? '（確率0%）' : ` = ${format(state.normalDamage, 4)}`}</code>
            <p>職分特性の倍率：20%から+15ポイントずつ、上限110%。</p>
          </article>
          <article className="gg-branch">
            <header><h3>爆発</h3><strong>{format(state.chance)}%</strong></header>
            <div className="gg-branch-value"><span>ダメージ</span><strong>{format(explosion.damageAfterMitigation, 4)}</strong></div>
            <code>{example.attack} × {model.attackScalePercent}% = {format(explosion.damageAfterMitigation, 4)}</code>
            <p>電流暴走：範囲術ダメージ。通常攻撃を置き換え、職分特性の倍率は掛かりません。</p>
          </article>
        </div>
        <p className="gg-inline-effect"><strong>精密誘電</strong> 本体・浮遊の通常攻撃・爆発が術耐性を15無視。ここでは術耐性0のため、そのままのダメージを使います。</p>
        <aside className="gg-model-note" aria-label="ゲーム仕様と現在の計算モデルの違い">
          <strong>計算機の前提</strong> このページは自爆後の通常倍率を20%に戻す現行モデルを説明します。実際に同じ敵を再び狙う場合の倍率維持は未反映です。
        </aside>
      </GuideStep>

      <GuideStep index={2}>
        <p className="gg-step-lead">それぞれのダメージに起こる確率を掛け、2つを足します。</p>
        <div className="gg-merge" aria-label="選択した状態の1回の期待値" aria-live="polite">
          <div className="gg-weighted-pair">
            <div><span>通常攻撃の分</span><code>{format(100 - state.chance)}% × {format(state.normalDamage, 4)}</code><strong>{format(state.normalContribution, 4)}</strong></div>
            <span className="gg-math-symbol" aria-hidden="true">＋</span>
            <div><span>爆発の分</span><code>{format(state.chance)}% × {format(explosion.damageAfterMitigation, 4)}</code><strong>{format(state.explosionContribution, 4)}</strong></div>
          </div>
          <div className="gg-merge-result"><span>m = {misses} の次回期待値 E({misses})</span><strong>{format(state.expected, 4)}</strong><small>浮遊1体・1回分</small></div>
        </div>
        <p className="calculation-process-note">mスライダーを動かすと、②の分岐と③の期待値が連動します。④ではスキル開始時の m = 0 に戻り、全ての分岐を含めて計算します。</p>
      </GuideStep>

      <GuideStep index={3}>
        <p className="gg-step-lead">初回は m = 0。次は、前回が爆発だったか不発だったかで、期待値が変わります。</p>
        <div className="gg-transition" aria-label="初回から2回目への分岐と合流">
          <div className="gg-transition-origin"><span>1回目 · m = 0</span><strong>期待値 {format(first.expected, 4)}</strong></div>
          <div className="gg-transition-arms" aria-hidden="true"><span>↓</span><span>↓</span></div>
          <div className="gg-branch-grid gg-transition-branches">
            <article className="gg-branch">
              <header><h3>前回、通常攻撃</h3><strong>{format(100 - first.chance)}%</strong></header>
              <p className="gg-transition-state">m = 1 → 次回爆発率 {format(afterMiss.chance)}%</p>
              <p>2回目の期待値 <b>{format(afterMiss.expected, 4)}</b></p>
              <code>{format(100 - first.chance)}% × {format(afterMiss.expected, 4)}</code>
              <div className="gg-branch-value"><span>重み付けした値</span><strong>{format(secondAfterMiss, 4)}</strong></div>
            </article>
            <article className="gg-branch">
              <header><h3>前回、爆発</h3><strong>{format(first.chance)}%</strong></header>
              <p className="gg-transition-state">m = 0 → 次回爆発率 {format(first.chance)}%</p>
              <p>2回目の期待値 <b>{format(first.expected, 4)}</b></p>
              <code>{format(first.chance)}% × {format(first.expected, 4)}</code>
              <div className="gg-branch-value"><span>重み付けした値</span><strong>{format(secondAfterExplosion, 4)}</strong></div>
            </article>
          </div>
          <div className="gg-transition-join" aria-hidden="true"><span>↘</span><span>↙</span></div>
          <div className="gg-merge-result"><span>全ての分岐を含む、2回目の期待値</span><code>{format(secondAfterMiss, 4)} ＋ {format(secondAfterExplosion, 4)}</code><strong>{format(secondExpected, 4)}</strong></div>
        </div>
        <p className="gg-inline-effect">3回目以降も、<strong>その状態になる確率 × その状態での期待値</strong>を合計。爆発した分岐は m = 0 に合流し、不発の分岐は m + 1 へ進みます。</p>
        <p className="calculation-process-note">上の「爆発 → m = 0」は、通常倍率も20%へ戻す現行モデルの計算です。</p>

        {finite ? (
          <section className="gg-accumulation" aria-labelledby="gg-accumulation-title">
            <h3 id="gg-accumulation-title">{example.duration}秒分を積み上げる</h3>
            <div className="gg-equation"><span>持続時間 ÷ 攻撃間隔</span><code>{example.duration} ÷ {example.interval} = {format(result.theoreticalAttackCount, 6)}回</code></div>
            <div className="goldenglow-table-wrap" role="region" aria-label="各攻撃の期待値の積み上げ" tabIndex={0}>
              <table className="goldenglow-output-table gg-trace-table">
                <caption className="visually-hidden">浮遊1体の期待ダメージの積み上げ</caption>
                <thead><tr><th scope="col">攻撃</th><th scope="col">その回の期待値</th><th scope="col">ここまでの合計</th></tr></thead>
                <tbody>
                  {trace.slice(0, 3).map((row) => <tr key={row.attackNumber}><th scope="row">{row.attackNumber}回目</th><td>{format(row.expectedDamage, 4)}</td><td>{format(row.cumulativeDamage, 4)}</td></tr>)}
                  <tr className="gg-trace-ellipsis"><td colSpan={3}>… 同じ計算を繰り返す …</td></tr>
                  <tr><th scope="row">{fullAttackCount}回目</th><td>{format(lastFull.expectedDamage, 4)}</td><td>{format(lastFull.cumulativeDamage, 4)}</td></tr>
                  {fraction > 0 && <tr><th scope="row">{fullAttackCount + 1}回目の一部</th><td>{format(nextAttack.expectedDamage, 4)} × {format(fraction, 6)}</td><td>{format(result.perDrone.expectedTotalDamage, 4)}</td></tr>}
                </tbody>
              </table>
            </div>
            <p className="calculation-process-note">{fullAttackCount}回分に、次の1回の期待値 × 端数{format(fraction, 6)}を加えます。攻撃タイミングを平均する扱いです。</p>
            <div className="gg-merge-result"><span>浮遊1体 · {example.duration}秒の期待総ダメージ</span><strong>{format(result.perDrone.expectedTotalDamage, 4)}</strong></div>
          </section>
        ) : (
          <section className="gg-accumulation" aria-labelledby="gg-accumulation-title">
            <h3 id="gg-accumulation-title">S2は、爆発までの1周期で長期平均を求める</h3>
            <p className="gg-step-lead">永続なので終了時点を置かず、m = 0から次に爆発する回までを1周期とします。</p>
            <div className="gg-cycle-flow"><span>m = 0</span><span aria-hidden="true">→</span><span>不発なら続行</span><span aria-hidden="true">→</span><strong>爆発で1周期終了</strong></div>
            <p className="gg-step-lead">その回まで爆発せずに到達する確率を、次回期待値 E(m) に掛けて足します。</p>
            <div className="goldenglow-table-wrap" role="region" aria-label="爆発までの1周期の積み上げ" tabIndex={0}>
              <table className="goldenglow-output-table gg-trace-table">
                <caption className="visually-hidden">浮遊1体の周期期待値</caption>
                <thead><tr><th scope="col">攻撃</th><th scope="col">到達確率</th><th scope="col">到達確率 × E(m)</th></tr></thead>
                <tbody>
                  {cycleTrace.slice(0, 3).map((row) => <tr key={row.attackNumber}><th scope="row">{row.attackNumber}回目</th><td>{format(row.reachProbability * 100, 6)}%</td><td>{format(row.expectedDamage, 4)}</td></tr>)}
                  <tr className="gg-trace-ellipsis"><td colSpan={3}>… 不発の分岐だけを次の回へ …</td></tr>
                  <tr><th scope="row">{cycleLast.attackNumber}回目（確定）</th><td>{format(cycleLast.reachProbability * 100, 8)}%</td><td>{format(cycleLast.expectedDamage, 8)}</td></tr>
                  <tr><th scope="row">合計</th><td>{format(cycleAttacks, 6)}回</td><td>{format(cycleDamage, 4)}</td></tr>
                </tbody>
              </table>
            </div>
            <div className="gg-equation"><span>期待攻撃回数 = 到達確率の合計</span><code>1 ＋ {format(cycleTrace[1].reachProbability, 6)} ＋ {format(cycleTrace[2].reachProbability, 6)} ＋ … = {format(cycleAttacks, 6)}回</code></div>
            <div className="gg-equation"><span>1周期の期待時間</span><code>{format(cycleAttacks, 6)} × {example.interval}秒 = {format(cycleSeconds, 6)}秒</code></div>
            <div className="gg-merge-result"><span>浮遊1体の長期平均DPS = 期待ダメージ ÷ 期待時間</span><code>{format(cycleDamage, 4)} ÷ {format(cycleSeconds, 6)}</code><strong>{format(result.perDrone.dps, 4)}</strong></div>
          </section>
        )}
      </GuideStep>

      <GuideStep index={4}>
        <p className="gg-step-lead">④で求めた浮遊1体の値を機数分に増やし、本体の攻撃を足します。</p>
        <div className="sensitivity-control gg-drone-control">
          <span>同じ敵を攻撃する浮遊ユニット</span>
          <div className="sensitivity-metric-switch" role="group" aria-label="合算する浮遊ユニット数" style={{ gridTemplateColumns: `repeat(${example.drones}, minmax(0, 1fr))` }}>
            {Array.from({ length: example.drones }, (_, index) => index + 1).map((count) => <button key={count} type="button" className={count === droneCount ? 'active' : ''} aria-pressed={count === droneCount} onClick={() => setDroneCount(count)}>{count}体{count === example.drones ? '（全機）' : ''}</button>)}
          </div>
        </div>
        <ol className="gg-total-steps" aria-label="浮遊と本体の合算過程">
          <li><span>浮遊{droneCount}体</span><code>{format(finite ? result.perDrone.expectedTotalDamage : result.perDrone.dps, 4)} × {droneCount}</code><strong>{format(finite ? result.allDrones.expectedTotalDamage : result.allDrones.dps, 4)}{!finite && ' DPS'}</strong></li>
          <li><span>本体を加算</span><code>{format(finite ? result.allDrones.expectedTotalDamage : result.allDrones.dps, 4)} ＋ {format(finite ? result.body.expectedTotalDamage : result.body.dps, 4)}</code><strong>{format(finite ? result.combinedExpectedTotalDamage : result.expectedDps, 4)}{!finite && ' DPS'}</strong></li>
          {finite && <li><span>時間で割る</span><code>{format(result.combinedExpectedTotalDamage, 4)} ÷ {example.duration}秒</code><strong>{format(result.expectedDps, 4)} DPS</strong></li>}
        </ol>
        <p className="calculation-process-note">{example.skill === 3 ? 'S3は本体攻撃停止のため、本体分は0。' : finite
          ? `本体分：攻撃力${example.attack} × ${format(result.theoreticalAttackCount, 6)}回 = ${format(result.body.expectedTotalDamage, 4)}。`
          : `本体分：攻撃力${example.attack} ÷ ${example.interval}秒 = ${format(result.body.dps, 4)} DPS。S2の期待総ダメージは算出しません。`}</p>
        <div className="gg-final-result" aria-label="最終期待DPS"><div><span>{skillLabel} · 本体＋浮遊{droneCount}体 · 術耐性0</span><strong>{format(result.expectedDps)}<small>期待DPS</small></strong></div><p>下の表の「期待DPS」· 術耐性0 · 爆発込み合計に対応します。</p></div>
        <p className="gg-step-lead gg-output-intro">最後に、同じ計算を術耐性別に並べます。精密誘電の固定無視15と、術ダメージの最低保証5%を適用します。</p>
        <GoldenglowDamageTable explosion={explosion} skillIndex={example.skill} attackInterval={example.interval}
          duration={example.duration} skillLabel={skillLabel} initialOutput="EXPECTED_DPS" showGuideLink={false} compactNotes showDroneControl={false}
          droneFocus={{ count: droneCount, onChange: setDroneCount }} />
      </GuideStep>

      <details className="calculator-panel gg-reference-details gg-reference-notes">
        <summary>補足・計算の前提・参照元</summary>
        <dl className="gg-reference-rule-list">
          <div><dt>スキル発動</dt><dd>{skillLabel} · 自動回復 · {example.activation} · 初期SP {example.initialSp} / 必要SP {example.spCost}{example.skill === 2 && ' · 退場まで持続'}</dd></div>
          <div><dt>攻撃対象</dt><dd>単体への理論値です。帰還・再索敵は0秒。半径1.1マスの爆発巻き込みや足止めはダメージに含めません。目標の撃破・自爆・スキル終了で索敵を中断します。</dd></div>
          <div><dt>通常倍率</dt><dd>現行モデルは自爆で通常倍率を20%へ初期化します。ゲームでは同じ敵を再び狙うと倍率を維持し、対象が変わると初期化します。</dd></div>
          <div><dt>術耐性無視</dt><dd>精密誘電は常時有効。本体・浮遊の攻撃だけに適用します。術耐性40なら25として計算し、無視後の下限は0です。</dd></div>
          <div><dt>確率の更新式</dt><dd>状態mの確率をq(m)、次回爆発率をp(m)とすると、q(m) × p(m)は次のm = 0へ、q(m) × (1 − p(m))は次のm + 1へ。各回の期待値は Σ q(m) × E(m) です。</dd></div>
          <div><dt>表示の丸め</dt><dd>表は小数第2位、途中式は第4〜6位まで表示し、計算には丸め前の値を使用します。S1の間隔は1.3 ÷ 1.5を0.867秒に丸めています。</dd></div>
          <div><dt>育成条件</dt><dd>このページは標準条件の参照例です。育成やモジュールを変えた値はダメージ計算画面で確認できます。</dd></div>
        </dl>
        <div className="gg-reference-sources">
          <a href={DATA_SOURCE_URLS.skill} target="_blank" rel="noopener noreferrer">日本版ゲームデータ：スキル効果 ↗</a>
          <a href={DATA_SOURCE_URLS.character} target="_blank" rel="noopener noreferrer">日本版ゲームデータ：素質効果 ↗</a>
          <a href="https://docs.google.com/document/d/1IEDAgB_4hKnLfHRVUCj4_uQ5Xaf_Wmyd/edit" target="_blank" rel="noopener noreferrer">爆発期待値計算の解説資料（2026年9月5日） ↗</a>
          <a href="https://arknights.wiki.gg/wiki/Goldenglow" target="_blank" rel="noopener noreferrer">Arknights Terra Wiki：爆発確率・範囲・職分特性 ↗</a>
          <a href="https://prts.wiki/w/%E6%BE%84%E9%97%AA" target="_blank" rel="noopener noreferrer">PRTS：自爆後の通常倍率と攻撃対象 ↗</a>
        </div>
      </details>
    </section>
  )
}

function GuideStep({ index, children }: { index: number; children: ReactNode }) {
  const step = flow[index]
  return <section id={`gg-${step.id}`} className="calculator-panel gg-walkthrough-step" aria-labelledby={`gg-${step.id}-title`}>
    <header className="panel-heading"><div><span>{String(index + 1).padStart(2, '0')}</span><h2 id={`gg-${step.id}-title`}>{step.title}</h2></div></header>
    {children}
  </section>
}

function ReferenceValue({ label, value, unit }: { label: string; value: ReactNode; unit?: string }) {
  return <div className="model-value"><dt>{label}</dt><dd><strong>{value}</strong>{unit && <span>{unit}</span>}</dd></div>
}
