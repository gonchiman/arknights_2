import {
  evaluateSkillDpsCrossValidation,
  type SkillDpsCrossValidationInput, type SkillDpsCrossValidationProgress, type SkillDpsCrossValidationResult,
} from './skillDpsCrossValidation.ts'

export type SkillDpsCrossValidationWorkerResponse =
  | { type: 'progress'; progress: SkillDpsCrossValidationProgress }
  | { type: 'complete'; result: SkillDpsCrossValidationResult }
  | { type: 'error'; error: string }

function send(message: SkillDpsCrossValidationWorkerResponse) {
  self.postMessage(message)
}

self.onmessage = ({ data }: MessageEvent<SkillDpsCrossValidationInput>) => {
  try {
    const result = evaluateSkillDpsCrossValidation(data, progress => send({ type: 'progress', progress }))
    send({ type: 'complete', result })
  } catch {
    send({ type: 'error', error: '交差検証を実行できませんでした。' })
  }
}
