import type { MapIndex } from './map.ts'

export interface RoguelikeTheme {
  id: string
  name: string
  sortId: number
}

/** A source stage variant. Normal and emergency variants may share one level. */
export interface RoguelikeStage {
  id: string
  themeId: string
  levelId: string
  replacementLevelIds: string[]
  name: string
  isEmergency: boolean
  isBoss: boolean
  linkedStageId: string | null
  eliteDescription: string | null
  difficulty: string | null
}

export interface RoguelikeSource {
  repository: string
  commit: string
  region: 'jp'
  topicTable: string
}

export interface RoguelikeIndex extends MapIndex {
  themes: RoguelikeTheme[]
  stages: RoguelikeStage[]
  source: RoguelikeSource
}

export interface RoguelikeStageGroup {
  id: string
  name: string
  stages: RoguelikeStage[]
}
