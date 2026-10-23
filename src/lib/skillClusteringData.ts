import type { SkillRecord } from '../types/skill.ts'
import { cleanGameText } from './enemyData.ts'
import { formatSkillEffectDescription } from './skillEffectDetails.ts'

export interface SkillClusteringDocument {
  id: string
  description: string
  recordIds: string[]
  operatorName: string
  skillName: string
  skillIndex: number
}

export interface SkillClusteringSparseVector {
  indices: number[]
  values: number[]
}

export interface SkillClusteringFeatures {
  terms: string[]
  vectors: SkillClusteringSparseVector[]
  documentIndices: number[]
  excludedIndices: number[]
  documentCount: number
}

/** Shared skill IDs and identical displayed descriptions each receive one vote. */
export function buildSkillClusteringCorpus(rows: readonly SkillRecord[]): {
  documents: SkillClusteringDocument[]
  sourceCount: number
  duplicateCount: number
  emptyCount: number
} {
  const candidates = [...rows].sort((left, right) => compareText(left.id, right.id)).flatMap((row) => {
    if (!cleanGameText(row.description)) return []
    const description = cleanGameText(formatSkillEffectDescription(row)).normalize('NFKC')
    return description ? [{ row, description }] : []
  })
  const parents = candidates.map((_, index) => index)
  const find = (start: number): number => {
    let index = start
    while (parents[index] !== index) index = parents[index]
    while (parents[start] !== start) {
      const next = parents[start]
      parents[start] = index
      start = next
    }
    return index
  }
  const merge = (left: number, right: number) => {
    const first = find(left)
    const second = find(right)
    parents[Math.max(first, second)] = Math.min(first, second)
  }
  const skillIds = new Map<string, number>()
  const descriptions = new Map<string, number>()
  candidates.forEach(({ row, description }, index) => {
    const previousSkill = skillIds.get(row.skillId)
    const previousDescription = descriptions.get(description)
    if (row.skillId && previousSkill !== undefined) merge(index, previousSkill)
    if (previousDescription !== undefined) merge(index, previousDescription)
    if (row.skillId) skillIds.set(row.skillId, index)
    descriptions.set(description, index)
  })
  const groups = new Map<number, SkillClusteringDocument>()
  candidates.forEach(({ row, description }, index) => {
    const root = find(index)
    const existing = groups.get(root)
    if (existing) {
      if (!existing.recordIds.includes(row.id)) existing.recordIds.push(row.id)
    } else {
      groups.set(root, {
        id: row.id,
        description,
        recordIds: [row.id],
        operatorName: row.operatorName,
        skillName: row.skillName,
        skillIndex: row.skillIndex,
      })
    }
  })
  const documents = [...groups.values()]
  return {
    documents,
    sourceCount: rows.length,
    duplicateCount: candidates.length - documents.length,
    emptyCount: rows.length - candidates.length,
  }
}

const STOP_WORDS = new Set([
  'の', 'に', 'を', 'は', 'が', 'と', 'で', 'へ', 'も', 'や', 'から', 'まで', 'より', 'など', 'および', '及び',
  'する', 'し', 'した', 'して', 'される', 'させる', 'なる', 'ある', 'いる', 'できる', 'ない', 'れる', 'られる',
  'この', 'その', 'それ', 'ため', 'もの', 'こと', '時', '秒', '間', '回', '人', '体', '自身', '自分', 'スキル',
])

/** Log TF × smoothed IDF, then L2 normalization; no existing categories are input. */
export function createSkillClusteringFeatures(documents: readonly SkillClusteringDocument[]): SkillClusteringFeatures {
  const segmenter = new Intl.Segmenter('ja', { granularity: 'word' })
  const normalize = (value: string) => value.normalize('NFKC').toLowerCase()
    .replace(/\{[^{}]*\}/gu, ' ').replace(/\d+(?:[.,]\d+)*/gu, ' ')
  const names = new Set(documents.flatMap((document) => [...segmenter.segment(normalize(document.operatorName))]
    .filter((part) => part.isWordLike).map((part) => part.segment.trim()).filter(Boolean)))
  const frequencies = documents.map((document) => {
    const text = normalize(document.description)
    const words = new Map<string, number>()
    for (const part of segmenter.segment(text)) {
      const word = part.segment.trim()
      // A short operator name such as ウン must not alter ダウン or カウント.
      if (!part.isWordLike || !/[\p{L}]/u.test(word) || STOP_WORDS.has(word) || names.has(word)) continue
      words.set(word, (words.get(word) ?? 0) + 1)
    }
    return words
  })
  const terms = [...new Set(frequencies.flatMap((words) => [...words.keys()]))].sort(compareText)
  const termIndices = new Map(terms.map((term, index) => [term, index]))
  const documentFrequencies = new Map<string, number>()
  frequencies.forEach((words) => words.forEach((_, term) => {
    documentFrequencies.set(term, (documentFrequencies.get(term) ?? 0) + 1)
  }))
  const documentIndices: number[] = []
  const excludedIndices: number[] = []
  const vectors: SkillClusteringSparseVector[] = []
  const usableCount = frequencies.filter((words) => words.size > 0).length
  frequencies.forEach((words, index) => {
    if (words.size === 0) {
      excludedIndices.push(index)
      return
    }
    const entries = [...words].map(([word, count]) => ({
      index: termIndices.get(word)!,
      value: (1 + Math.log(count)) * (1 + Math.log((1 + usableCount) / (1 + documentFrequencies.get(word)!))),
    })).sort((left, right) => left.index - right.index)
    const norm = Math.sqrt(entries.reduce((sum, entry) => sum + entry.value ** 2, 0))
    vectors.push({ indices: entries.map((entry) => entry.index), values: entries.map((entry) => entry.value / norm) })
    documentIndices.push(index)
  })
  return { terms, vectors, documentIndices, excludedIndices, documentCount: documents.length }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
