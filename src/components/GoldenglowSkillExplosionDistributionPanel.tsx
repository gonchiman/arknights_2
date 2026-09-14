import { useEffect, useState } from 'react'
import type { GoldenglowGuideSkill } from '../lib/goldenglowGuideSkill'
import type { GoldenglowDistributionRow } from '../lib/goldenglowSkillExplosionDistribution'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import { GoldenglowDistributionView } from './GoldenglowDistributionView'

export function GoldenglowSkillExplosionDistributionPanel({ skill, attackCount, duration, loading }: {
  skill: GoldenglowGuideSkill | null
  attackCount: number
  duration: number
  loading: boolean
}) {
  const [trialCount, setTrialCount] = useState(10_000)
  const title = skill?.skillIndex === 2 ? '表示時間内の爆発回数' : 'スキル中の爆発回数'
  const count = skill?.explosionModel.activeDroneCount ?? 1
  const context = skill ? `S${skill.skillIndex}・${duration}秒・浮遊ユニット${count}体・各${attackCount}攻撃` : ''
  return <CollapsibleCalculatorPanel id="gg-skill-explosion-distribution" number="11"
    title={title} summary={context} collapsedLabel="グラフを表示">
    {skill ? <SkillDistribution key={`${skill.explosionModel.prdStep}/${skill.explosionModel.prdMaxStack}/${attackCount}/${count}`}
      skill={skill} attackCount={attackCount} title={title} context={context} initialTrialCount={trialCount} onTrialCountChange={setTrialCount} />
      : <p className="gg-probability-intro" role="status">{loading ? 'スキル情報を読み込み中…' : '爆発確率を取得できませんでした。'}</p>}
  </CollapsibleCalculatorPanel>
}

function SkillDistribution({ skill, attackCount, title, context, initialTrialCount, onTrialCountChange }: {
  skill: GoldenglowGuideSkill; attackCount: number; title: string; context: string
  initialTrialCount: number; onTrialCountChange: (count: number) => void
}) {
  const [request, setRequest] = useState(() => ({ trialCount: initialTrialCount, seed: Math.floor(Math.random() * 0x100000000) }))
  const [response, setResponse] = useState<{ request: typeof request; rows: GoldenglowDistributionRow[]; error: string | null } | null>(null)
  const { prdStep, prdMaxStack, activeDroneCount } = skill.explosionModel
  useEffect(() => {
    let worker: Worker | undefined
    let active = true
    const fail = (error: string) => { if (active) setResponse({ request, rows: [], error }) }
    try {
      worker = new Worker(new URL('../lib/goldenglowSkillExplosionDistribution.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (event: MessageEvent<{ rows?: GoldenglowDistributionRow[]; error?: string }>) => {
        if (!active) return
        setResponse({ request, rows: event.data.rows ?? [], error: event.data.error ?? null })
        worker?.terminate()
      }
      worker.onerror = () => fail('計算を開始できませんでした。再シミュレーションしてください。')
      worker.postMessage({ model: { prdStep, prdMaxStack }, attackCount, droneCount: activeDroneCount, ...request })
    } catch {
      fail('計算を開始できませんでした。再シミュレーションしてください。')
    }
    return () => { active = false; worker?.terminate() }
  }, [request, prdStep, prdMaxStack, activeDroneCount, attackCount])
  const current = response?.request === request ? response : null
  return <GoldenglowDistributionView rows={current?.rows ?? []} trialCount={request.trialCount}
    busy={!current} error={current?.error ?? null} fitDistribution
    onRun={trialCount => { onTrialCountChange(trialCount); setRequest(value => ({ trialCount, seed: (value.seed + 1) >>> 0 })) }}
    title={`${title}の分布`} xLabel="爆発回数" context={context}
    describeValue={value => `浮遊ユニット${activeDroneCount}体で${value}回爆発`}
    conditions={`各ユニットが確率の初期状態から独立に攻撃し、${activeDroneCount}体の爆発回数を合計します。爆発後は確率をリセットして攻撃を続けます。初回攻撃は攻撃間隔後、帰還・再索敵は0秒とし、ページの攻撃条件と同じ各${attackCount}回の攻撃を行います。`} />
}
