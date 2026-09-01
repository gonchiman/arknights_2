import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  ALL_DATA_SOURCES,
  ARKNIGHTS_GAMEDATA_REPOSITORY,
  DATA_SOURCE_GROUPS,
  readStageSnapshotSummary,
  type DataSourceAccess,
  type StageSnapshotSummary,
} from '../lib/dataSources'
import { ENEMY_DATA_URLS } from '../lib/enemyData'
import './DataSourcesPage.css'

type SnapshotState =
  | { phase: 'loading' }
  | { phase: 'ready'; summary: StageSnapshotSummary }
  | { phase: 'error' }

type InfoTipProps = {
  label: string
  children: ReactNode
}

const ACCESS_LABELS: Record<DataSourceAccess, string> = {
  runtime: '直接',
  generation: '集計',
}

const DERIVED_DATA = [
  {
    id: 'operator-profile',
    label: 'オペレーターステータス',
    description: '最終昇進・最大レベルの値に信頼度100の補正を加えた派生値です。潜在能力とモジュールの補正は基本ステータスへ合算していません。',
  },
  {
    id: 'skill-classification',
    label: 'スキル分類',
    description: 'スキルの構造化データと説明文を、このサイト独自のルールで分類します。手動変更は端末内に保存され、外部データには書き戻しません。',
  },
  {
    id: 'damage-model',
    label: 'ダメージ・DPS',
    description: '取得した基礎ステータスとスキル値に、ゲーム内の防御・術耐性を想定した計算モデルを適用した推定値です。',
  },
  {
    id: 'statistics-rating',
    label: '統計・敵ランク',
    description: '集計値、分布、相関、HP・攻撃力等のランクは、このサイトが数値データから算出します。参照元に同じ集計結果が収録されているわけではありません。',
  },
] as const

export function DataSourcesPage() {
  const [snapshotState, setSnapshotState] = useState<SnapshotState>({ phase: 'loading' })

  useEffect(() => {
    const controller = new AbortController()

    void fetch(ENEMY_DATA_URLS.stageAppearances, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Snapshot request failed')
        const summary = readStageSnapshotSummary(await response.json())
        if (!summary) throw new Error('Invalid snapshot metadata')
        setSnapshotState({ phase: 'ready', summary })
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setSnapshotState({ phase: 'error' })
      })

    return () => controller.abort()
  }, [])

  return (
    <section className="data-sources-page">
      <header className="page-intro source-page-intro">
        <h1>Data Sources</h1>
      </header>

      <section className="source-repository-bar" aria-labelledby="source-repository-heading">
        <div className="source-repository-title">
          <span>参照元</span>
          <h2 id="source-repository-heading">ArknightsGamedata</h2>
        </div>
        <p className="source-repository-meta">JP · master</p>
        <InfoTip label="参照元リポジトリの詳細">
          <p>{ARKNIGHTS_GAMEDATA_REPOSITORY.name} の日本版ゲームデータを参照しています。</p>
          <p>arkprtsで取得されたデータがGitHub Actionsで更新されています。</p>
          <p><strong>ライセンス:</strong> リポジトリ内に明示なし</p>
        </InfoTip>
        <a
          className="source-external-link"
          href={ARKNIGHTS_GAMEDATA_REPOSITORY.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${ARKNIGHTS_GAMEDATA_REPOSITORY.name} をGitHubで開く（新しいタブ）`}
        >
          <span aria-hidden="true">↗</span>
        </a>
      </section>

      <section className="source-section" aria-labelledby="source-files-heading">
        <header className="source-section-heading">
          <h2 id="source-files-heading">参照ファイル</h2>
          <div className="source-heading-tools">
            <span className="source-count">{ALL_DATA_SOURCES.length}</span>
            <InfoTip label="取得方式の説明">
              <p><strong>直接:</strong> ページ表示時にmasterブランチから取得</p>
              <p><strong>集計:</strong> ビルド前に取得し、サイト内JSONへ加工</p>
            </InfoTip>
          </div>
        </header>

        <div className="source-group-grid">
          {DATA_SOURCE_GROUPS.map((group) => (
            <section className="source-group-panel" aria-labelledby={`source-group-${group.id}`} key={group.id}>
              <header className="source-group-header">
                <h3 id={`source-group-${group.id}`}>{group.title}</h3>
                <span>{group.sources.length}</span>
              </header>
              <ul className="source-list">
                {group.sources.map((source) => (
                  <li className="source-row" key={source.id}>
                    <a
                      className="source-row-link"
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${source.linkLabel}（新しいタブ）`}
                    >
                      <code>{source.file}</code>
                      <span aria-hidden="true">↗</span>
                    </a>
                    <span className="source-access-badges" aria-label="取得方式">
                      {source.access.map((access) => (
                        <span className={`source-access-badge ${access}`} key={access}>
                          {ACCESS_LABELS[access]}
                        </span>
                      ))}
                    </span>
                    <InfoTip label={`${source.file} の詳細`}>
                      <p>{source.description}</p>
                      <p><strong>利用:</strong> {source.usage.join(' / ')}</p>
                    </InfoTip>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </section>

      <section className="source-section" aria-labelledby="source-snapshot-heading">
        <header className="source-section-heading">
          <h2 id="source-snapshot-heading">生成データ</h2>
        </header>

        <div className="snapshot-compact">
          <div className="snapshot-row">
            <strong>敵の登場ステージ数</strong>
            <SnapshotOverview state={snapshotState} />
            <a
              className="snapshot-json-link"
              href={ENEMY_DATA_URLS.stageAppearances}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="enemy-stage-appearances.json を開く（新しいタブ）"
            >
              JSON <span aria-hidden="true">↗</span>
            </a>
          </div>
          <SnapshotWarning state={snapshotState} />
          <details className="source-disclosure">
            <summary>集計の詳細</summary>
            <SnapshotDetails state={snapshotState} />
          </details>
        </div>
      </section>

      <section className="source-section" aria-labelledby="source-derived-heading">
        <header className="source-section-heading">
          <h2 id="source-derived-heading">サイト内で算出</h2>
        </header>
        <ul className="derived-list">
          {DERIVED_DATA.map((item) => (
            <li className="derived-item" key={item.id}>
              <span>{item.label}</span>
              <InfoTip label={`${item.label} の詳細`}>
                <p>{item.description}</p>
              </InfoTip>
            </li>
          ))}
        </ul>
      </section>

      <details className="source-notice">
        <summary>権利・更新について</summary>
        <div className="source-notice-body">
          <ul>
            <li>ArknightsAssets/ArknightsGamedataはコミュニティによるデータリポジトリであり、このサイトも非公式の分析ツールです。</li>
            <li>名称、説明文その他のゲーム内容に関する権利は各権利者に帰属します。参照元の明示は、利用許諾を示すものではありません。</li>
            <li>直接取得するデータはmasterブランチの更新に伴って変わるため、同じサイト版でも表示結果が変わる場合があります。</li>
            <li>外部の画像、音声、Webフォントは現在使用していません。将来追加した場合は、このページへ参照元を追記します。</li>
          </ul>
        </div>
      </details>
    </section>
  )
}

function InfoTip({ label, children }: InfoTipProps) {
  const tooltipId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [pinned, setPinned] = useState(false)
  const open = hovered || focused || pinned

  const close = () => {
    setHovered(false)
    setFocused(false)
    setPinned(false)
  }

  return (
    <div
      className="source-tip"
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') setHovered(true)
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse') setHovered(false)
      }}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setFocused(false)
          setPinned(false)
        }
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        close()
        triggerRef.current?.focus({ preventScroll: true })
      }}
    >
      <button
        ref={triggerRef}
        className="source-tip-trigger"
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={tooltipId}
        aria-describedby={tooltipId}
        onClick={() => {
          if (pinned) {
            setPinned(false)
            setFocused(false)
          } else {
            setPinned(true)
          }
        }}
      >
        <span aria-hidden="true">?</span>
      </button>
      <div
        className="source-tip-panel"
        id={tooltipId}
        role="tooltip"
        hidden={!open}
      >
        {children}
      </div>
    </div>
  )
}

function SnapshotOverview({ state }: { state: SnapshotState }) {
  if (state.phase === 'loading') {
    return (
      <span className="snapshot-overview" role="status">
        <span className="snapshot-status loading">確認中</span>
        <span className="snapshot-progress">—</span>
      </span>
    )
  }
  if (state.phase === 'error') {
    return (
      <span className="snapshot-overview" role="status">
        <span className="snapshot-status error">取得不可</span>
        <span className="snapshot-progress">—</span>
      </span>
    )
  }

  const { summary } = state
  return (
    <span className="snapshot-overview" role="status">
      <span className={`snapshot-status ${summary.status}`}>
        {summary.status === 'complete' ? '完了' : '一部取得'}
      </span>
      <span className="snapshot-progress">
        {formatCount(summary.processedLevelCount)} / {formatCount(summary.uniqueLevelCount)} Level
      </span>
    </span>
  )
}

function SnapshotWarning({ state }: { state: SnapshotState }) {
  if (state.phase !== 'ready' || state.summary.status !== 'partial') return null

  return (
    <p className="snapshot-warning">
      未処理 {formatCount(state.summary.failedLevelCount)} Level。敵ごとの表示件数は下限値です。
    </p>
  )
}

function SnapshotDetails({ state }: { state: SnapshotState }) {
  if (state.phase === 'loading') {
    return <div className="source-disclosure-body"><p>生成情報を読み込んでいます。</p></div>
  }
  if (state.phase === 'error') {
    return <div className="source-disclosure-body"><p>生成情報を取得できません。JSONリンクから状態を確認してください。</p></div>
  }

  const { summary } = state
  return (
    <div className="source-disclosure-body">
      <dl className="snapshot-stats">
        <div><dt>生成日時</dt><dd>{formatGeneratedAt(summary.generatedAt)}</dd></div>
        <div><dt>ステージ</dt><dd>{formatCount(summary.stageRecordCount)}</dd></div>
        <div><dt>処理済み</dt><dd>{formatCount(summary.processedLevelCount)} / {formatCount(summary.uniqueLevelCount)}</dd></div>
        <div><dt>取得失敗</dt><dd>{formatCount(summary.failedLevelCount)}</dd></div>
      </dl>
      <p className="snapshot-pipeline">
        <code>stage_table.json</code> + <code>enemy_handbook_table.json</code> + <code>levels/**/*.json</code>
        <span aria-hidden="true"> → </span>
        <code>enemy-stage-appearances.json</code>
      </p>
      <p>
        Level IDを重複除去し、各Levelの敵IDを集計しています。取得に失敗したLevelは推測で補完しません。
      </p>
      {summary.status === 'partial' && (
        <p className="snapshot-detail-warning">
          未処理Levelの登場分は加算されず、0件も未登場を保証しません。
        </p>
      )}
    </div>
  )
}

function formatGeneratedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function formatCount(value: number): string {
  return new Intl.NumberFormat('ja-JP').format(value)
}
