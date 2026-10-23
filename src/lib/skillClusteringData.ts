// Compatibility entry point; all clustering methods share the canonical preprocessing.
export {
  buildSkillClusteringCorpus,
  createSkillClusteringFeatures,
} from './skillClusteringFeatures.ts'
export type {
  SkillClusteringDocument,
  SkillClusteringFeatures,
  SkillClusteringSparseVector,
} from './skillClusteringFeatures.ts'
