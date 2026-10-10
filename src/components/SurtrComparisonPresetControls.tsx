import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { SurtrModuleChoice } from '../lib/surtrModuleComparison'
import {
  SURTR_COMPARISON_PRESETS_KEY, buildSurtrComparisonPresets, captureSurtrModulePresetSelection,
  isSurtrComparisonPresetAvailable, isSurtrModulePresetSelectionEqual,
  readSavedSurtrComparisonPresets, writeSavedSurtrComparisonPresets,
  type SurtrComparisonPreset, type SurtrModulePresetSelection,
} from '../lib/surtrComparisonPresets'
import './SurtrComparisonPresetControls.css'

export function SurtrComparisonPresetControls({ choices, excluded, moduleLevels, onApply }: {
  choices: readonly SurtrModuleChoice[]
  excluded: readonly string[]
  moduleLevels: Readonly<Record<string, readonly number[]>>
  onApply: (selection: SurtrModulePresetSelection) => void
}) {
  const builtins = useMemo(() => buildSurtrComparisonPresets(choices), [choices])
  const selection = useMemo(() => captureSurtrModulePresetSelection(choices, excluded, moduleLevels),
    [choices, excluded, moduleLevels])
  const [saved, setSaved] = useState(readSavedSurtrComparisonPresets)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const nameInput = useRef<HTMLInputElement>(null)
  const current = [...builtins, ...saved].find(preset => isSurtrModulePresetSelectionEqual(preset.selection, selection))
  const canSave = selection.includeNone || Object.values(selection.moduleLevels).some(levels => levels.length > 0)

  useEffect(() => {
    if (editing) nameInput.current?.focus()
  }, [editing])
  useEffect(() => {
    const restore = (event: StorageEvent) => {
      if (event.key === SURTR_COMPARISON_PRESETS_KEY || event.key === null) setSaved(readSavedSurtrComparisonPresets())
    }
    window.addEventListener('storage', restore)
    return () => window.removeEventListener('storage', restore)
  }, [])

  const apply = (preset: SurtrComparisonPreset) => {
    if (!isSurtrComparisonPresetAvailable(preset, choices)) return
    onApply(preset.selection)
    setNotice('')
    setError('')
  }
  const startSaving = () => {
    setName('')
    setError('')
    setNotice('')
    setEditing(true)
  }
  const save = (event: FormEvent) => {
    event.preventDefault()
    if (!canSave) return
    const label = name.trim()
    if (!label) { setError('プリセット名を入力してください。'); return }
    if (saved.some(preset => preset.name === label)) { setError('同じ名前のプリセットがあります。別の名前を入力してください。'); return }
    const preset: SurtrComparisonPreset = { id: `saved-${crypto.randomUUID()}`, name: label, selection }
    const next = [...saved, preset]
    const persisted = writeSavedSurtrComparisonPresets(next)
    setSaved(next)
    setEditing(false)
    setNotice(persisted ? `「${label}」を保存しました。` : 'この画面に追加しました。ブラウザーには保存できませんでした。')
  }
  const remove = (preset: SurtrComparisonPreset) => {
    const next = saved.filter(item => item.id !== preset.id)
    const persisted = writeSavedSurtrComparisonPresets(next)
    setSaved(next)
    setNotice(persisted ? `「${preset.name}」を削除しました。` : 'この画面から削除しました。ブラウザーの保存内容は更新できませんでした。')
  }
  const presetButton = (preset: SurtrComparisonPreset) => <button type="button" className="button secondary"
    aria-pressed={isSurtrModulePresetSelectionEqual(preset.selection, selection)}
    disabled={!isSurtrComparisonPresetAvailable(preset, choices)} onClick={() => apply(preset)}>{preset.name}</button>

  return <fieldset className="surtr-comparison-presets">
    <legend>比較プリセット<span className="surtr-comparison-preset-current" aria-live="polite">{current?.name ?? 'カスタム'}</span></legend>
    <div className="surtr-comparison-preset-buttons" role="group" aria-label="基本の比較プリセット">
      {builtins.map(preset => <span key={preset.id}>{presetButton(preset)}</span>)}
    </div>
    {!!saved.length && <div className="surtr-comparison-saved-presets">
      <span className="surtr-comparison-saved-label">保存した比較</span>
      <div className="surtr-comparison-preset-buttons" role="group" aria-label="保存した比較プリセット">
        {saved.map(preset => <span className="surtr-comparison-saved-item" key={preset.id}>
          {presetButton(preset)}<button type="button" className="button secondary surtr-comparison-preset-delete"
            aria-label={`「${preset.name}」を削除`} onClick={() => remove(preset)}>×</button>
        </span>)}
      </div>
    </div>}
    {!editing ? <button type="button" className="button secondary surtr-comparison-preset-save-start"
      disabled={!canSave} onClick={startSaving}>＋ 現在の選択を保存</button>
      : <form className="surtr-comparison-preset-editor" onSubmit={save}>
        <label className="calculator-field"><span>プリセット名</span><input type="text" ref={nameInput} value={name} maxLength={40}
          aria-invalid={!!error} aria-describedby={error ? 'surtr-comparison-preset-error' : undefined}
          onChange={event => { setName(event.target.value); setError('') }} /></label>
        <button type="submit" className="button" disabled={!canSave}>保存</button>
        <button type="button" className="button secondary" onClick={() => { setEditing(false); setError('') }}>キャンセル</button>
      </form>}
    {error && <p className="surtr-s3-axis-error" id="surtr-comparison-preset-error" role="alert">{error}</p>}
    {notice && <p className="surtr-comparison-preset-notice" role="status">{notice}</p>}
  </fieldset>
}
