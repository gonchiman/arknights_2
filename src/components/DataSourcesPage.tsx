import { useEffect, useState } from 'react'
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

const ACCESS_LABELS: Record<DataSourceAccess, string> = {
  runtime: '表示時に取得',
  generation: '事前集計で使用',
}

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
      <header className="page-intro">
        <div>
          <span className="page-kicker">DATA PROVENANCE</span>
          <h1>Data Sources</h1>
        </div>
        <p>このツールが参照する外部データと、サイト内で加工・算出する値の由来を一覧化しています。</p>
      </header>

      <section className="source-repository" aria-labelledby="source-repository-heading">
        <div className="source-repository-index" aria-hidden="true">01</div>
        <div className="source-repository-body">
          <span className="source-section-kicker">PRIMARY REPOSITORY</span>
          <h2 id="source-repository-heading">{ARKNIGHTS_GAMEDATA_REPOSITORY.name}</h2>
          <p>
            このサイトが直接参照する外部データは、すべて同リポジトリの日本版ゲームデータです。
            リポジトリでは、arkprtsを利用して取得したデータがGitHub Actionsで更新されています。
          </p>
          <dl className="source-repository-meta">
            <div><dt>対象地域</dt><dd>{ARKNIGHTS_GAMEDATA_REPOSITORY.region}</dd></div>
            <div><dt>参照ブランチ</dt><dd>{ARKNIGHTS_GAMEDATA_REPOSITORY.branch}</dd></div>
            <div><dt>登録データ</dt><dd>{ALL_DATA_SOURCES.length} 種類</dd></div>
            <div><dt>データライセンス</dt><dd>リポジトリ内に明示なし</dd></div>
          </dl>
        </div>
        <a
          className="source-primary-link"
          href={ARKNIGHTS_GAMEDATA_REPOSITORY.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${ARKNIGHTS_GAMEDATA_REPOSITORY.name} をGitHubで開く（新しいタブ）`}
        >
          GitHubで開く <span aria-hidden="true">↗</span>
        </a>
      </section>

      <section className="source-access-grid" aria-label="データの更新方法">
        <article>
          <span className="source-access-number">01 / RUNTIME</span>
          <h2>ページ表示時に直接取得</h2>
          <p>オペレーター、スキル、モジュール、敵の各JSONは、参照元のmasterブランチから読み込みます。</p>
        </article>
        <article>
          <span className="source-access-number">02 / GENERATED</span>
          <h2>事前に集計したスナップショット</h2>
          <p>敵の登場ステージ数は多数のLevelファイルを事前集計し、サイト内のJSONとして配信します。</p>
        </article>
      </section>

      {DATA_SOURCE_GROUPS.map((group) => (
        <section className="source-group" aria-labelledby={`source-group-${group.id}`} key={group.id}>
          <header className="source-group-heading">
            <div>
              <span className="source-section-kicker">{group.kicker}</span>
              <h2 id={`source-group-${group.id}`}>{group.title}</h2>
            </div>
            <p>{group.description}</p>
          </header>
          <div className="source-card-grid">
            {group.sources.map((source) => (
              <article className="source-card" key={source.id}>
                <header className="source-card-heading">
                  <h3><code>{source.file}</code></h3>
                  <span className="source-access-badges">
                    {source.access.map((access) => (
                      <span className={`source-access-badge ${access}`} key={access}>{ACCESS_LABELS[access]}</span>
                    ))}
                  </span>
                </header>
                <p>{source.description}</p>
                <dl className="source-card-meta">
                  <div>
                    <dt>利用箇所</dt>
                    <dd>{source.usage.join(' / ')}</dd>
                  </div>
                </dl>
                <a
                  className="source-file-link"
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${source.linkLabel}（新しいタブ）`}
                >
                  {source.linkLabel} <span aria-hidden="true">↗</span>
                </a>
              </article>
            ))}
          </div>
        </section>
      ))}

      <section className="source-derived" aria-labelledby="source-derived-heading">
        <header className="source-group-heading">
          <div>
            <span className="source-section-kicker">DERIVED DATA</span>
            <h2 id="source-derived-heading">加工・算出するデータ</h2>
          </div>
          <p>外部データをそのまま表示せず、このサイトのロジックで加工している項目です。</p>
        </header>

        <div className="source-pipeline" aria-label="敵の登場ステージ数の生成経路">
          <div><span>INPUT 01</span><strong>stage_table.json</strong></div>
          <span className="source-pipeline-arrow" aria-hidden="true">+</span>
          <div><span>INPUT 02</span><strong>enemy_handbook_table.json</strong></div>
          <span className="source-pipeline-arrow" aria-hidden="true">+</span>
          <div><span>INPUT 03</span><strong>levels/**/*.json</strong></div>
          <span className="source-pipeline-arrow" aria-hidden="true">→</span>
          <div className="output"><span>OUTPUT</span><strong>enemy-stage-appearances.json</strong></div>
        </div>

        <div className="snapshot-card">
          <div className="snapshot-heading">
            <div>
              <span className="source-section-kicker">CURRENT SNAPSHOT</span>
              <h3>敵の登場ステージ数</h3>
            </div>
            <SnapshotStatus state={snapshotState} />
          </div>
          <SnapshotDetails state={snapshotState} />
          <p className="snapshot-method">
            戦闘ステージのLevel IDを重複除去し、各Levelの敵IDを数えています。取得に失敗したLevelは推測で補完せず、診断情報として残します。
          </p>
          <a
            className="source-file-link"
            href={ENEMY_DATA_URLS.stageAppearances}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="enemy-stage-appearances.json を開く（新しいタブ）"
          >
            生成済みJSONを開く <span aria-hidden="true">↗</span>
          </a>
        </div>

        <div className="derived-card-grid">
          <article>
            <span>OPERATOR PROFILE</span>
            <h3>オペレーターステータス</h3>
            <p>最終昇進・最大レベルの値に信頼度100の補正を加えた派生値です。潜在能力とモジュールの補正は基本ステータスへ合算していません。</p>
          </article>
          <article>
            <span>SKILL CLASSIFICATION</span>
            <h3>スキル分類</h3>
            <p>スキルの構造化データと説明文を、このサイト独自のルールで分類します。手動変更は端末内に保存され、外部データには書き戻しません。</p>
          </article>
          <article>
            <span>DAMAGE MODEL</span>
            <h3>ダメージ・DPS</h3>
            <p>取得した基礎ステータスとスキル値に、ゲーム内の防御・術耐性を想定した計算モデルを適用した推定値です。</p>
          </article>
          <article>
            <span>STATISTICS & RATING</span>
            <h3>統計・敵ランク表記</h3>
            <p>集計値、分布、相関、HP・攻撃力等のランクは、このサイトが数値データから算出します。参照元に同じ集計結果が収録されているわけではありません。</p>
          </article>
        </div>
      </section>

      <aside className="source-notice" aria-labelledby="source-notice-heading">
        <span className="source-section-kicker">NOTICE</span>
        <h2 id="source-notice-heading">利用上の注意</h2>
        <ul>
          <li>ArknightsAssets/ArknightsGamedataはコミュニティによるデータリポジトリであり、このサイトも非公式の分析ツールです。</li>
          <li>名称、説明文その他のゲーム内容に関する権利は各権利者に帰属します。参照元の明示は、利用許諾を示すものではありません。</li>
          <li>直接取得するデータはmasterブランチの更新に伴って変わるため、同じサイト版でも表示結果が変わる場合があります。</li>
          <li>外部の画像、音声、Webフォントは現在使用していません。将来追加した場合は、このページへ参照元を追記します。</li>
        </ul>
      </aside>
    </section>
  )
}

function SnapshotStatus({ state }: { state: SnapshotState }) {
  if (state.phase === 'loading') {
    return <span className="snapshot-status loading" role="status">状態を確認中</span>
  }
  if (state.phase === 'error') {
    return <span className="snapshot-status error" role="status">状態を取得できません</span>
  }
  return (
    <span className={`snapshot-status ${state.summary.status}`} role="status">
      {state.summary.status === 'complete' ? '集計完了' : '一部取得'}
    </span>
  )
}

function SnapshotDetails({ state }: { state: SnapshotState }) {
  if (state.phase === 'loading') {
    return <p className="snapshot-loading">生成情報を読み込んでいます…</p>
  }
  if (state.phase === 'error') {
    return <p className="snapshot-loading">現在の生成情報を取得できません。リンク先の生成済みJSONを確認してください。</p>
  }

  const { summary } = state
  return (
    <>
      <dl className="snapshot-stats">
        <div><dt>生成日時</dt><dd>{formatGeneratedAt(summary.generatedAt)}</dd></div>
        <div><dt>ステージレコード</dt><dd>{formatCount(summary.stageRecordCount)}</dd></div>
        <div><dt>処理済みLevel</dt><dd>{formatCount(summary.processedLevelCount)} / {formatCount(summary.uniqueLevelCount)}</dd></div>
        <div><dt>取得失敗Level</dt><dd>{formatCount(summary.failedLevelCount)}</dd></div>
      </dl>
      {summary.status === 'partial' && (
        <p className="snapshot-warning">
          <strong>注意:</strong> 未処理のLevelに含まれる登場分は加算されません。表示値は実際より少ない可能性があり、0件も未登場を保証しません。
        </p>
      )}
    </>
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
