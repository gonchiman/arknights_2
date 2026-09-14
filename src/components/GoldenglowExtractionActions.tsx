import { useEffect, useState } from 'react'
import { formatGoldenglowExtraction, type GoldenglowExtraction } from '../lib/codeAnalysis'
import { writeClipboardText } from '../lib/clipboard'

export function GoldenglowExtractionActions({ extraction, tableText, count }: { extraction: GoldenglowExtraction; tableText: string; count: number }) {
  const [error, setError] = useState('')
  const [downloadUrl, setDownloadUrl] = useState('')
  const [copying, setCopying] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    try {
      const url = URL.createObjectURL(new Blob(['\uFEFF', formatGoldenglowExtraction(extraction)], { type: 'text/plain;charset=utf-8' }))
      setDownloadUrl(url)
      return () => URL.revokeObjectURL(url)
    } catch { setError('保存用のファイルを作れませんでした。一覧のコピーをお試しください。') }
  }, [extraction])

  async function copy() {
    if (copying) return
    setCopying(true)
    try { await writeClipboardText(tableText); setNotice(`絞り込み結果の${count}件を表形式でコピーしました。`) }
    catch { setNotice('コピーできませんでした。テキストで保存するか、一覧を選択してコピーしてください。') }
    finally { setCopying(false) }
  }

  return <div className="code-analysis-export">
    <div className="code-analysis-extraction-actions">
      <button type="button" className="button secondary" disabled={copying || count === 0} onClick={() => void copy()}>{copying ? 'コピー中…' : '表をコピー'}</button>
      {downloadUrl && <a className="button secondary" href={downloadUrl} download="ゴールデングロー関連メタデータ一覧.txt">全件の詳細を保存</a>}
    </div>
    {notice && <p className="code-analysis-note" role="status">{notice}</p>}
    {error && <p role="alert" className="code-analysis-error">{error}</p>}
  </div>
}
