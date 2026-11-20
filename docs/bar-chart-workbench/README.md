# 共通の棒グラフ作成ページ

## 用途と適用範囲

`#/charts/bar` で、データの提供元を選び、同じ描画部品から縦棒グラフとPNGを作る。タイトル、横軸名、縦軸名、単位、条件は提供元の計算結果に含め、利用者にX・Yの列を組み立てさせない。

初版は単系列の縦棒を対象とする。接続するデータは、敵の術耐性ヒストグラムと、出現順位による術耐性の下限に対応する防御力の2つ。既存ページの置換、DC3の接続、複数系列、動画、任意の式の入力は対象外。

## 保存場所と役割

| ファイル | 役割 |
| --- | --- |
| [barChartDocument.ts](../../src/lib/barChartDocument.ts) | 描画へ渡すデータ契約、表示設定、ラベルと保存名の生成 |
| [barChartPresentation.ts](../../src/lib/barChartPresentation.ts) | データ型ごとの描画方式・棒幅・上限と、画面の自動設定表示の共通定義 |
| [barChartProviders.ts](../../src/lib/barChartProviders.ts) | 提供元の一覧、既存の計算結果から共通データへの変換 |
| [BarChartPlot.tsx](../../src/components/BarChartPlot.tsx) / [CSS](../../src/components/BarChartPlot.css) | データの意味に依存しない棒、目盛り、数値、情報帯の描画と画面用の外枠 |
| [BarChartWorkbenchPage.tsx](../../src/components/BarChartWorkbenchPage.tsx) | 提供元・集計版・範囲・表示設定の操作 |
| [BarChartImageDialog.tsx](../../src/components/BarChartImageDialog.tsx) | 表示時点のデータと設定をPNG用の共通フレームに渡す |
| [ChartImageFrame](../../src/components/ChartImageFrame.tsx) / [ChartImageSaveDialog](../../src/components/ChartImageSaveDialog.tsx) | 画像の配置、縦横比、保存操作 |
| [examples/](examples/) | この実装から生成した確認用PNG |

画像の外枠と保存操作は[グラフ画像出力のテンプレート](../chart-image/README.md)を併用する。ここでは棒グラフのデータ契約と適用範囲を定め、共通の画像配置や寸法計算を複製しない。

## 固定仕様と可変部分

### 提供元と共通描画の境界

提供元は、既存の計算処理を呼び出し、共通データへ変換する。共通描画は提供元の名前やページを判定して計算を切り替えない。タイトルや単位を、表示ラベルの文字列から推測しない。

| 提供元 | 既存の定義元 | 横軸と値の意味 |
| --- | --- | --- |
| 術耐性ヒストグラム | [buildEnemyHistogramObservations](../../src/lib/enemyHistogramCounts.ts) / [calculateWeightedHistogram](../../src/lib/enemyWeightedHistogram.ts) | 幅10の数値階級と、その階級に属する度数 |
| 防御力・術耐性の対応 | [buildEnemyDefenseResistanceBands](../../src/lib/enemyDefenseResistance.ts) の `resistanceThresholds` | 術耐性の下限を10刻みで取り、同じ出現順位の防御力を返す |

対応データは[対応表のページ](../../src/components/EnemyDefenseResistancePage.tsx)の計算結果を使う。[対応式のページ](../../src/components/EnemyDefenseResistanceFormulaPage.tsx)の回帰・近似式とは別の入力である。防御力と術耐性の両方が有効な敵を、出現回数で重み付けする。

データ契約では、数値の点、端点を持つ区間、順序を持つカテゴリを区別する。区間は上下の端点・端点を含むか・上限超過を保持し、表示済みの「0〜10」から復元しない。値は丸める前の数値とし、0は有効な値、`null`は欠損として扱う。出現回数は期待値の小数を含み得るため、度数を整数に限定しない。

`BarChartDocument` はJSONで受け渡せる、元の入力から切り離した固定スナップショット。`bins` に階級・点・値を、`semantics` にラベルの意味を、`source` に提供元・集計版・範囲・集計方法・母集団・欠損・収録状況を保存する。表示ラベルは共通の `getBarChartLabels` と `getBarChartConditions` で作る。描画関数、JSX、DOM参照、ページの状態をデータへ含めない。

### 割合と累積割合

割合・累積割合は度数データだけに提供する。分母は欠損を除いた有効な重みの合計。元の度数と同じ階級順で[buildHistogramCumulativeRows](../../src/lib/histogramCumulative.ts)を利用し、各階級の割合と、その階級全体までの累積割合を保持する。棒の中央の数値で読み取ったECDFに置き換えない。

有効な分母がない場合、割合は`null`にする。防御力の対応値は度数ではないため、値を足し合わせて割合や累積割合を作らない。表示設定に値が残っていても、対応していない情報帯は描画しない。

### 共通表示

縦棒、ゼロを含む縦軸、数値書式、情報帯、見出しと条件の配置は共通にする。グラフ内のクリック、ホバー、ドラッグ、ズームは設けない。操作はグラフの外に置き、狭い画面ではラベルを読める横幅を保って横スクロールする。

描画方式と棒幅は `BarChartDocument.xKind` から [barChartPresentation.ts](../../src/lib/barChartPresentation.ts) の共通定義で決める。画面の「自動設定」も同じ定義から描画方式・棒幅・上限を表示し、提供元名や値の大小、0や欠損から型を推定しない。現在の区間型は1項目幅の96%、点型とカテゴリ型は60%で上限48px。1項目幅は描画領域の幅を**すべてのbins**で割った幅であり、0や欠損の項目も含む。48pxは**PNG拡大前のCSS/SVG座標**で、保存画像の1,920pxへの拡大率を掛ける前の値。画面とPNGで別の棒幅を定義しない。

利用ごとに変更するのは提供元、集計版、集計範囲、表示設定。表示設定は `values`（棒の値）、`axisBand`（横軸の帯）、`percent`（割合帯）、`cumulative`（累積割合の線）。提供元の能力に合わない設定は無効化する。コード上の既定値と各寸法は共通部品・定義を正とし、別のページへコピーしない。画面の初期集計は最新版・メインストーリー・出現回数。対応値の提供元は出現回数だけを使う。

画面・保存プレビュー・PNGには同じデータと設定を渡す。保存ダイアログを開いた後の編集で、既に開いているプレビューの計算結果を差し替えない。PNGの幅は1,920px、保存ダイアログの初期比率は16:9とし、自動比率とカスタム比率も共通の保存UIから選べる。設定を識別する保存名は `getBarChartFilename` で生成し、無効な割合表示を名前に含めない。

## 使い方

提供元の登録と変換処理には `BAR_CHART_PROVIDERS` と `createBarChartFromProvider` を使う。以下の `data` と `version` は、既存の敵集計クライアントで読み込んだ同じ版のデータと版情報。

```tsx
const document = createBarChartFromProvider('enemy-resistance-histogram', {
  data,
  version,
  scope: 'main',
  countMode: 'SPAWNS',
})

<BarChartFigure document={document} settings={{
  values: true,
  axisBand: true,
  percent: true,
  cumulative: true,
}} />
```

提供元を追加するときは、提供元一覧へ変換処理を登録し、タイトル・軸・単位・集計条件・対応可能な表示をデータに含める。提供元別の描画分岐を `BarChartPlot` へ追加しない。初版が表現しない複数系列や範囲値が必要な場合は、既存の意味を保てる契約と描画を先に検討する。

## 見本と更新方法

`examples/` のPNGは現在の実装から再生成する確認用出力であり、見本の版・件数・値を今後の出力へ固定しない。以下はいずれも集計版v12・メインストーリー・出現回数、1,920×1,080pxの実際のPNG出力。

| 見本 | 表示設定 |
| --- | --- |
| [術耐性ヒストグラム](examples/resistance-histogram-v12-main.png) | 棒の値、横軸の帯、割合帯、累積割合 |
| [術耐性の下限に対応する防御力](examples/defense-correspondence-v12-main.png) | 棒の値、横軸の帯。割合・累積割合は対象外 |

更新時は機能確認用サーバーで `#/charts/bar` を開く。集計版v12、メインストーリー、出現回数を指定し、各提供元の画像保存からPNGを生成する。術耐性ヒストグラムは棒の値・横軸の帯・割合・累積割合を表示し、対応する防御力では割合・累積割合を表示しない。PNGを `examples/` に保存し、画像全体のタイトル、条件、軸名、0と欠損、帯と棒の位置を確認する。

新しい提供元や配置変更の見本は、画面のスクリーンショットや手描きの図に置き換えず、実際のPNG保存から作る。画面・プレビュー・保存画像が同じデータを示していることを併せて確認する。

## 適用状況

共通ページ `#/charts/bar` と、そのページのPNG出力へ適用する。既存の敵分布、対応表・対応式、DC3、GG、スルトのグラフは未移行であり、既存の表示・初期値・出力は変更しない。

## 変更時の確認

- 同じ版・範囲・提供元は同じタイトル、軸名、値、並び順を返す。
- v12メインストーリーの出現回数で、既存計算の度数・欠損・防御力の対応値と一致する。
- 0と欠損、空データ、有効な分母0、全値0、端点と上限超過を区別する。
- 度数以外の値には、割合・累積割合の設定を持ち越しても表示しない。
- 画面・プレビュー・PNGは同じ値、ラベル、設定を保ち、計算結果を変更しない。
- 狭い画面、長い名称、画像の自動比率と16:9で、ラベルと帯が欠けたり重なったりしない。
- 関連テスト、ビルド、`npm run rules:check`を確認する。実際に生成したPNGも開いて確認する。

```sh
node --experimental-strip-types --test tests/barChartProviders.test.mjs tests/barChartPresentation.test.mjs tests/barChartWorkbench.test.mjs tests/routes.test.ts
npm run build
npm run rules:check
```
