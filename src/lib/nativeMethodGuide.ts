import type { NativeSummary } from './nativeAnalysis.ts'

// Manually reviewed against this exact DAT/DLL pair. Never apply RVA annotations
// to a different build or infer game behavior from a matching method name alone.
const DAT_HASH = 'ed15e36e1d19d942aa0a2d51d57fbe8cb4fcbb6c21110d1d374a4116f480e846'
const DLL_HASH = 'e74963e39d7cc85b48a02ad1fdcc57dee796489991ad5c3cb867123c9c5214a6'
const OWNER = 'Torappu.Battle.Projectiles.GdglowHitBehaviour'

export type NativeGuideBlock = {
  title: string
  action: string
  interpretation: string
  evidence: { rva: number; label: string }[]
  ranges: [number, number][]
}

const blocks: NativeGuideBlock[] = [
  {
    title: '作業の準備',
    action: '元の作業データを一時的に退避し、この処理で使う情報を用意する。',
    interpretation: '処理を始めるための準備。攻撃対象や自爆を決める部分ではない。',
    evidence: [{ rva: 0x972640, label: '準備の命令' }], ranges: [[0x972640, 0x9726A1]],
  },
  {
    title: '別の処理に差し替わるか確認',
    action: '差し替え先があれば、そちらへ処理を渡す。なければ下の確率判定側へ進む。',
    interpretation: '実行時に差し替えが有効なら、下の説明どおりに進むとは限らない。',
    evidence: [{ rva: 0x9726B3, label: '差し替えの確認' }, { rva: 0x97294F, label: '差し替え先への移動' }], ranges: [[0x9726A1, 0x9726BC], [0x97294F, 0x97295F]],
  },
  {
    title: '抽選するか確かめ、確率判定を呼ぶ',
    action: '確率の設定値を調べる。判定を行う条件なら、設定値などを渡して抽選処理（DicePRD）を呼び出す。条件外なら通常側へ進む。',
    interpretation: '何％で抽選するかは、この命令だけでは確定しない。',
    evidence: [{ rva: 0x9726F1, label: '抽選前の確認' }, { rva: 0x972781, label: '確率判定の呼び出し' }], ranges: [[0x9726BC, 0x97278B]],
  },
  {
    title: '抽選結果で進む先を分ける',
    action: '抽選が成功なら「成功した側」へ、失敗なら「通常側」へ進む。両方を順番に行うわけではない。',
    interpretation: '敵を倒せるかの判定ではなく、抽選の結果を見ている。',
    evidence: [{ rva: 0x97278B, label: '結果による分岐' }], ranges: [[0x97278B, 0x97278F]],
  },
  {
    title: '成功した側：別の飛翔物を生成して停止',
    action: '現在の標的を渡して飛翔物の生成処理（EmitProjectile）を呼び、元の飛翔物の停止処理（StopProjectile）を呼ぶ。その後、この処理を終える。',
    interpretation: '推測：自爆に対応する可能性がある。生成する飛翔物の設定と、途中の間接呼び出しの役割は未確認。',
    evidence: [{ rva: 0x9727B5, label: '飛翔物の生成' }, { rva: 0x9727D9, label: '元の飛翔物の停止' }], ranges: [[0x97278F, 0x9727F5]],
  },
  {
    title: '通常側：必要に応じて攻撃倍率を反映',
    action: '特性が有効かを確認し、条件を満たす場合は攻撃倍率を求めてダメージ処理へ反映する。',
    interpretation: '倍率がどう増えるかは、呼び出し先と設定をさらに調べる必要がある。',
    evidence: [{ rva: 0x9728B4, label: '攻撃倍率の取得' }, { rva: 0x972907, label: '倍率の反映' }], ranges: [[0x9727F5, 0x97290C]],
  },
  {
    title: '通常側：現在の標的への命中処理',
    action: '現在の標的を取り出し、その標的への命中処理を呼び出す。その後、この処理を終える。',
    interpretation: 'この呼び出しでは新しい敵を選んでいない。撃破予測や残りの浮遊ユニットの切り替えは、ここからは確定できない。',
    evidence: [{ rva: 0x97292D, label: '現在の標的の取得' }, { rva: 0x972943, label: '命中処理の呼び出し' }], ranges: [[0x97290C, 0x97294F]],
  },
]

export function getNativeMethodGuide(summary: NativeSummary, rva: number) {
  if (summary.datHash !== DAT_HASH || summary.dllHash !== DLL_HASH) return null
  if (!summary.methods.some(m => m.owner === OWNER && m.name === 'DealHitTarget' && m.rva === 0x972640 && !m.autoChess)) return null
  if (rva < 0x972640 || rva >= 0x972965) return null
  return { title: 'DealHitTargetの主な流れ', blocks }
}

export function isGuideBlockVisible(block: NativeGuideBlock, rvas: number[]) {
  return rvas.some(rva => block.ranges.some(([start, end]) => rva >= start && rva < end))
}
