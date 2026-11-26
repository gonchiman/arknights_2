import { useState, type ReactElement } from 'react'
import { STANDARD_PAGE_TITLES } from '../lib/navigation'
import { ComparisonTableImageDialog, type ComparisonTableImageSnapshot } from './ComparisonTableImageDialog'
import { getDamageThreeStatisticsImageConditions, type StatisticsImageConditions } from './createDamageThreeStatisticsChartImage'
import { OutputImageSaveButton } from './OutputImageSaveButton'

export function getOperatorVotesSegments(detail = false) {
  return ['出現敵での優勢率', 'オペレーター別の票', detail ? '段階ごとの判定' : 'スキル別の得票']
}

interface OperatorVotesImageProps {
  conditions: StatisticsImageConditions
  operatorName: string
  spawnCount: number
  detail?: { skillIndex: number; skillName: string; defense: number; resistance: number }
  table: ReactElement
}

export function OperatorVotesImageButton({ conditions, operatorName, spawnCount, detail, table }: OperatorVotesImageProps) {
  const [snapshot, setSnapshot] = useState<ComparisonTableImageSnapshot | null>(null)
  const segments = getOperatorVotesSegments(Boolean(detail))
  function open() {
    const { source, settings } = getDamageThreeStatisticsImageConditions(conditions)
    const selection = detail
      ? [operatorName, `S${detail.skillIndex} ${detail.skillName}`, `防御力 ${detail.defense.toLocaleString('ja-JP')}`, `術耐性 ${detail.resistance.toLocaleString('ja-JP')}`]
      : [operatorName]
    const filenameConditions = [...selection, ...source, 'スキル単位', ...settings]
    setSnapshot({
      title: segments[2], filenameConditions,
      conditions: [...filenameConditions, `出現回数 ${spawnCount.toLocaleString('ja-JP')}`],
      table,
    })
  }
  return <>
    <OutputImageSaveButton onClick={open} />
    {snapshot && <ComparisonTableImageDialog snapshot={snapshot}
      parentLocation={[STANDARD_PAGE_TITLES['damage-three-skill-attribute-matrix'], ...segments]}
      onClose={() => setSnapshot(null)} />}
  </>
}
