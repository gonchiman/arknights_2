import { getSelectedSurtrModuleStages, type SurtrModuleChoice } from '../lib/surtrModuleComparison'

/** Shared controls for the same per-module stage selection on Surtr analysis pages. */
export function SurtrModuleStageSelection({ choices, excluded, moduleLevels, onToggleLevel, onToggleNone }: {
  choices: readonly SurtrModuleChoice[]
  excluded: readonly string[]
  moduleLevels: Readonly<Record<string, readonly number[]>>
  onToggleLevel: (choice: SurtrModuleChoice, level: number, checked: boolean) => void
  onToggleNone: (checked: boolean) => void
}) {
  const selected = getSelectedSurtrModuleStages(choices, excluded, moduleLevels)
  return <fieldset className="surtr-s3-mods surtr-s3-stage-selection"><legend>比較するMOD・段階</legend>
    {choices.map(choice => <div key={choice.id} className="surtr-s3-mod" role="group" aria-label={`${choice.label}の比較段階`}>
      <span className="surtr-s3-mod-name">{choice.label}</span>
      {choice.id ? <div className="surtr-s3-module-levels">
        {choice.levels.map(level => <label key={level}><input type="checkbox" aria-label={`${choice.label} Lv.${level}を比較`}
          disabled={!choice.unlocked} checked={selected.some(stage => stage.moduleId === choice.id && stage.level === level)}
          onChange={event => onToggleLevel(choice, level, event.target.checked)} />Lv.{level}</label>)}
        {!choice.unlocked && <span className="surtr-s3-locked">Lv.60で解放</span>}
      </div> : <label><input type="checkbox" aria-label="未装備を比較に含める" checked={!excluded.includes('')}
        onChange={event => onToggleNone(event.target.checked)} />比較に含める</label>}
    </div>)}
  </fieldset>
}
