import { useMemo, useState } from 'react'
import type { GoldenglowExplosionModel } from '../lib/goldenglowExplosion'
import { simulateGoldenglowFirstExplosion } from '../lib/goldenglowExplosionSimulation'
import { createGoldenglowTargetSwitchRandom } from '../lib/goldenglowTargetSwitch'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { GoldenglowDistributionView } from './GoldenglowDistributionView'

type Model = Pick<GoldenglowExplosionModel, 'prdStep' | 'prdMaxStack'>

export function GoldenglowExplosionDistributionPanel({ model, loading }: { model: Model | null; loading: boolean }) {
  return <CollapsibleCalculatorPanel id="gg-explosion-distribution" number="10"
    title="自爆までの攻撃回数" summary="浮遊ユニット1体・初回自爆まで" collapsedLabel="グラフを表示">
    {model ? <Distribution key={`${model.prdStep}/${model.prdMaxStack}`} model={model} />
      : <p className="gg-probability-intro" role="status">{loading ? 'スキル情報を読み込み中…' : '爆発確率を取得できませんでした。'}</p>}
  </CollapsibleCalculatorPanel>
}

function Distribution({ model }: { model: Model }) {
  const [request, setRequest] = useState(() => ({ trialCount: 10_000, seed: Math.floor(Math.random() * 0x100000000) }))
  const rows = useMemo(() => simulateGoldenglowFirstExplosion(model, request.trialCount,
    createGoldenglowTargetSwitchRandom(request.seed)).map(row => ({
      value: row.attackNumber, theoreticalProbability: row.firstExplosionProbability,
      observedCount: row.observedCount, observedProbability: row.observedProbability,
    })), [model.prdStep, model.prdMaxStack, request])
  return <GoldenglowDistributionView rows={rows} trialCount={request.trialCount}
    onRun={trialCount => setRequest(value => ({ trialCount, seed: (value.seed + 1) >>> 0 }))}
    title="初めて自爆する攻撃回数の分布" xLabel="自爆までの攻撃回数" context="浮遊ユニット1体"
    describeValue={value => `${value}回目で初めて自爆`}
    conditions="浮遊ユニット1体が確率の初期状態から攻撃し、最初に自爆するまでを1試行とします。スキル時間では打ち切りません。攻撃力・敵の術耐性・ユニット数はこの分布に影響しません。" />
}
