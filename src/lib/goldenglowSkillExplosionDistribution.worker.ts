import { simulateGoldenglowSkillExplosions, type GoldenglowSkillExplosionInput } from './goldenglowSkillExplosionDistribution'
import { createGoldenglowTargetSwitchRandom } from './goldenglowTargetSwitch'

self.onmessage = (event: MessageEvent<GoldenglowSkillExplosionInput & { trialCount: number; seed: number }>) => {
  try {
    const rows = simulateGoldenglowSkillExplosions(event.data, event.data.trialCount,
      createGoldenglowTargetSwitchRandom(event.data.seed))
    self.postMessage(rows.length ? { rows } : { error: '計算条件を確認してください。' })
  } catch {
    self.postMessage({ error: 'シミュレーションに失敗しました。再シミュレーションしてください。' })
  }
}
