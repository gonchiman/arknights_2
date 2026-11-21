# 共通の棒グラフ作成ページ

## 用途と適用範囲

`#/charts/bar` で、データの提供元を選び、共通描画から単系列の縦棒、左右2系列の横棒とPNGを作る。タイトル、軸名、単位、条件は提供元の計算結果に含め、利用者にX・Yの列を組み立てさせない。

接続するデータは、敵のステータス分布、出現順位による術耐性の下限に対応する防御力、敵ステータスの評価別比較。ステータス分布ではHP、攻撃力、防御力、術耐性、移動速度、攻撃間隔、重量を選ぶ。7種すべてに数値階級を提供し、HP・攻撃力・防御力・術耐性ではゲーム内評価を階級にする方式も選べる。評価別比較は同じ4種から左右を個別に選ぶ。既存ページの置換、登場ステージ数の分布、DC3の接続、3系列以上、動画、任意の式の入力は対象外。

## 保存場所と役割

| ファイル | 役割 |
| --- | --- |
| [barChartDocument.ts](../../src/lib/barChartDocument.ts) | 描画へ渡すデータ契約、表示設定、ラベルと保存名の生成 |
| [barChartPresentation.ts](../../src/lib/barChartPresentation.ts) | データ型ごとの描画方式・棒幅・上限と、画面の自動設定表示の共通定義 |
| [barChartLayout.ts](../../src/lib/barChartLayout.ts) | 有効な情報帯に応じた自然なグラフ高を、画面と画像保存で共有する計算 |
| [barChartProviders.ts](../../src/lib/barChartProviders.ts) | 提供元の一覧、既存の計算結果から共通データへの変換 |
| [enemyStatMetrics.ts](../../src/lib/enemyStatMetrics.ts) | 敵統計と共有するステータス名・単位・書式・階級設定の定義 |
| [buildEnemyRatingHistogramBins](../../src/lib/enemyRatingHistogram.ts) / [formatHistogramRatingRangeLines](../../src/lib/histogramRatingRangeStrip.ts) | 元の観測値をゲーム内評価で集計する処理と、評価の範囲を帯へ示す簡略表記 |
| [getHistogramStatRankBands](../../src/lib/histogramStatRankBands.ts) / [StatRankBand](../../src/lib/statRankBands.ts) | 元の数値階級から評価境界を情報帯の位置へ変換する処理と、受け渡す評価帯データ |
| [StatRankStrip](../../src/components/StatRankStrip.tsx) / [ChartStripCell](../../src/components/ChartStripCell.tsx) | 評価帯と、割合・累積割合・階級の情報帯に使う共通描画 |
| [BarChartPlot.tsx](../../src/components/BarChartPlot.tsx) / [CSS](../../src/components/BarChartPlot.css) | データの意味に依存しない棒、目盛り、数値、情報帯の描画と画面用の外枠 |
| [BarChartComparisonPlot.tsx](../../src/components/BarChartComparisonPlot.tsx) | 同じカテゴリに揃った2系列の左右配置、共通軸、外側の帯、強調と選択合計 |
| [useBarChartTextWidths.ts](../../src/components/useBarChartTextWidths.ts) | 縦棒と左右比較で共有する文字幅の計測 |
| [BarChartWorkbenchPage.tsx](../../src/components/BarChartWorkbenchPage.tsx) | 提供元・ステータス・集計版・範囲・表示設定の操作と、自動設定値の表示 |
| [BarChartImageDialog.tsx](../../src/components/BarChartImageDialog.tsx) | 表示時点のデータと設定をPNG用の共通フレームに渡す |
| [ChartImageFrame](../../src/components/ChartImageFrame.tsx) / [ChartImageSaveDialog](../../src/components/ChartImageSaveDialog.tsx) | 画像の配置、縦横比、保存操作 |
| [examples/](examples/) | この実装から生成した確認用PNG |

画像の外枠と保存操作は[グラフ画像出力のテンプレート](../chart-image/README.md)を併用する。ここでは棒グラフのデータ契約と適用範囲を定め、共通の画像配置や寸法計算を複製しない。

## 固定仕様と可変部分

### 提供元と共通描画の境界

提供元は、既存の計算処理を呼び出し、共通データへ変換する。共通描画は提供元の名前やページを判定して計算を切り替えない。タイトルや単位を、表示ラベルの文字列から推測しない。

| 提供元 | 既存の定義元 | 横軸と値の意味 |
| --- | --- | --- |
| 敵のステータス分布（`enemy-stat-histogram`） | [enemyStatMetrics.ts](../../src/lib/enemyStatMetrics.ts) / [buildEnemyHistogramObservations](../../src/lib/enemyHistogramCounts.ts) / [calculateWeightedHistogram](../../src/lib/enemyWeightedHistogram.ts) / [buildEnemyRatingHistogramBins](../../src/lib/enemyRatingHistogram.ts) | 選択ステータスの数値階級またはゲーム内評価の階級と、その階級に属する度数 |
| 防御力・術耐性の対応 | [buildEnemyDefenseResistanceBands](../../src/lib/enemyDefenseResistance.ts) の `resistanceThresholds` | 術耐性の下限を10刻みで取り、同じ出現順位の防御力を返す |
| 敵ステータスの評価別比較（`enemy-stat-rating-comparison`） | 既存の `enemy-stat-histogram` のゲーム内評価方式 | 左右で選んだステータスそれぞれの評価別度数・割合・累積割合 |

ステータス分布は `BarChartProviderContext.statKey` に [EnemyStatKey](../../src/lib/enemyStatMetrics.ts) の7種のキーを受け取る。省略時は `magicResistance`（術耐性）。旧提供元の `enemy-resistance-histogram` は `enemy-stat-histogram` に統合した。

数値階級の区切りは既存の敵統計と同じ線形計算を使う。術耐性は従来の階級幅10と最低上限100を維持し、他のステータスは共有定義の最小階級幅を渡して既存処理に自動計算させる。画面には計算結果の階級幅・通常階級の上限を表示し、幅や上限を手動で入力する設定は設けない。上限を超えた値は既存計算の上限超過階級に保持する。

### 数値階級とゲーム内評価の階級

`BarChartProviderContext.histogramBinning` は任意の `'numeric' | 'rating'` とし、省略時は `'numeric'`。HP、攻撃力、防御力、術耐性の分布だけに「階級：数値／ゲーム内評価」の選択を表示する。他の3種は数値階級だけを扱う。

`'rating'` は、数値階級の度数を足し合わせる方式ではない。[buildEnemyHistogramObservations](../../src/lib/enemyHistogramCounts.ts) が返す元の観測値・重みを [buildEnemyRatingHistogramBins](../../src/lib/enemyRatingHistogram.ts) に渡し、ゲーム内評価の正確な境界で直接集計する。EからSSまでの全評価を定義順に保ち、度数0の評価も省略しない。数値方式と同じ選択ステータス・範囲・重み・欠損除外を使い、割合と累積割合の分母も変えない。

ゲーム内評価の階級も数値区間として `xKind: 'interval'` を渡し、棒幅は区間型の96%を使う。下限なしの区間を表すため `BarChartInterval.start` は `null` も許容し、上限なしの `end: null` と区別する。上下の境界値と包含・除外の情報を保持し、表示された評価名から数値境界を復元しない。

横軸は、主段にE〜SSの評価、従段にその評価の数値範囲を配置する2段構成。提供元は `semantics.xQualifier`・`semantics.xBandTitle` に軸と帯の意味を、任意の `document.secondaryAxisBand` に `title` と主段の各列に対応する `labels` 配列を渡す。描画側はこれらの共通データを使い、敵・ステータス・提供元の名前を判定して帯を作り分けない。

範囲の表示には既存の [formatHistogramRatingRangeLines](../../src/lib/histogramRatingRangeStrip.ts) の簡略表記を使う。正確な境界の包含・除外は `interval` のメタデータと読み上げ用の説明に保持する。`settings.axisBand` がオンのときは評価と範囲の両段を帯で表示し、オフのときは評価名の目盛りだけを残して範囲段を表示しない。

数値階級に添える評価帯と、ゲーム内評価そのものを階級にする方式は別の機能。ゲーム内評価方式では `capabilities.rankBands` を `false` とし、評価帯の設定が残っていても同じ評価を重ねて表示しない。

### 共通データ契約

対応データは[対応表のページ](../../src/components/EnemyDefenseResistancePage.tsx)の計算結果を使う。[対応式のページ](../../src/components/EnemyDefenseResistanceFormulaPage.tsx)の回帰・近似式とは別の入力である。防御力と術耐性の両方が有効な敵を、出現回数で重み付けする。

データ契約では、数値の点、端点を持つ区間、順序を持つカテゴリを区別する。区間は上下の端点・端点を含むか・上限超過を保持し、表示済みの「0〜10」から復元しない。区間端点の `null` は境界なしを表し、棒の値の `null` は欠損を表す。値は丸める前の数値とし、0は有効な値として扱う。出現回数は期待値の小数を含み得るため、度数を整数に限定しない。

`BarChartDocument` はJSONで受け渡せる、元の入力から切り離した固定スナップショット。`bins` に階級・点・値を、`semantics` にラベルの意味を、`source` に提供元・集計版・範囲・集計方法・母集団・欠損・収録状況を保存する。横軸の単位は任意の `semantics.xUnit` に渡す。攻撃間隔は `xLabel: '攻撃間隔'` と `xUnit: '秒'` から「攻撃間隔（階級・秒）」を生成し、単位を含む表示済みラベルを分解しない。表示ラベルは共通の `getBarChartLabels` と `getBarChartConditions` で作る。描画関数、JSX、DOM参照、ページの状態をデータへ含めない。

左右比較では `layout: 'mirrored'`、`xKind: 'category'`、`semantics.kind: 'comparison'` とする。ルートの `bins` は共通のカテゴリIDとラベルを保持し、値は `null`。棒を並べる項目の意味は `semantics.itemKind: 'interval'` で別に宣言する。`series` は左・右の順の2要素で、固定ID `left`／`right`、ラベル、選択キー、カテゴリ順に揃った `bins`、個別の `population` を持つ。各系列には元の度数・正の割合・累積割合・正確な数値境界を保持する。ルートの `source.population` は `null` とし、共通の分母を示さない。左へ伸ばすために入力値を負数へ変換しない。

### 左右2系列の評価別比較

「敵ステータスの評価別比較」では、HP・攻撃力・防御力・術耐性から左右を個別に選ぶ。APIの `leftStatKey`・`rightStatKey` を省略した初期値は防御力／術耐性。同じステータスを左右に指定しても2系列を保持し、入れ替えた場合は比較順序をタイトル・条件・保存名へ反映する。

提供元は、既存のゲーム内評価ヒストグラムを各ステータスへ独立に適用する。E〜SSの全10評価と度数0を残し、それぞれの有効度数を割合・累積割合の分母にする。両方が有効な敵だけへ絞らず、2系列の母数も合算しない。条件には左右ごとの有効数と値なしを表示する。

`getBarChartComparisonAxis` が両系列の階級割合からゼロ始まりの共通軸を作り、同じ割合は左右で同じ長さになる。青は左、橙は右の役割に対応し、選ぶステータスを変えても位置の色を維持する。棒の太さは [barChartPresentation.ts](../../src/lib/barChartPresentation.ts) の区間型の共通定義を使い、1評価の高さの96%とする。横棒であることを理由とする別の棒幅は設けない。画面の自動設定も同じ定義から「左右の横棒・区間型」、棒幅、系列数、共通目盛りを表示する。隙間の使い分けは、下記の[棒間の隙間を決める基準](#棒間の隙間を決める基準)で定める。

外側の帯は任意設定 `comparisonBand: 'cumulative' | 'rank' | 'none'` で切り替え、省略時は累積割合。中央の評価と外側の数値は `ChartStripCell` を再利用し、共通の11px書式、背景不透明度6%、行の間隔3pxで揃える。`0`、極小の正値 `<0.1`、母数なし `—` を区別する。

`selectedRanks` は表示名ではなくカテゴリIDの配列。グラフ外のチェックで複数選択し、空なら強調と合計欄を描かない。`getBarChartSelectionSummary` が元の度数を合算して各系列の有効度数で割る。丸めた割合は足し合わせず、有効度数0は合計割合も `null` とする。連続する選択は「E〜C」のようにまとめて表示する。

画面・保存プレビュー・PNGは同じ `BarChartPlot` から左右配置の描画へ渡す。自然な高さは [barChartLayout.ts](../../src/lib/barChartLayout.ts) の見出し・行・選択合計の共通定義から求め、合計欄の追加で棒を縮めない。保存開始時に系列データと選択配列も固定する。PNGの幅と比率、保存操作は既存の共通出力を使う。保存名は左右の順序、集計条件、帯の種類、強調する評価、比率を識別し、単系列用の持ち越し設定を含めない。

### 割合と累積割合

割合・累積割合は度数データだけに提供する。分母は欠損を除いた有効な重みの合計。元の度数と同じ階級順で[buildHistogramCumulativeRows](../../src/lib/histogramCumulative.ts)を利用し、各階級の割合と、その階級全体までの累積割合を保持する。棒の中央の数値で読み取ったECDFに置き換えない。

有効な分母がない場合、割合は`null`にする。防御力の対応値は度数ではないため、値を足し合わせて割合や累積割合を作らない。表示設定に値が残っていても、対応していない情報帯は描画しない。

累積割合は、既存の線と、新たな帯を独立して表示できる。線の設定キーは従来どおり `cumulative`、画面の表示名は「累積割合線」とする。帯は任意の `cumulativeBand` で指定し、省略時・初期値は `false`。線をオフにして帯だけを表示する場合も、同じ `bins[].cumulativeShare` を使う。

### 評価帯

評価帯はHP、攻撃力、防御力、術耐性の4種の数値階級の分布に提供する。ゲーム内評価方式では主段と重複するため提供しない。移動速度、攻撃間隔、重量、および防御力と術耐性の対応グラフにも提供しない。

提供元で、表示ラベルへ変換する前の `HistogramBin[]` から [getHistogramStatRankBands](../../src/lib/histogramStatRankBands.ts) を呼び出し、結果を任意の `BarChartDocument.rankBands?: StatRankBand[]` に保存する。提供できるかどうかは任意の `capabilities.rankBands?: boolean` で表す。描画側はステータス名や表示済みの階級文字列から評価を推定せず、スナップショットに含まれる帯データだけを使う。

表示設定は任意の `rankBand`、省略時・初期値は `false`。評価定義のある数値階級の分布だけに「評価帯」の選択肢を表示し、ゲーム内評価方式や別の提供元、未対応ステータスへ設定を持ち越しても帯を描画しない。数値階級を分割・変更せず、その階級に対する既存の評価境界と上限超過の扱いを引き継ぐ。

### 棒間の隙間を決める基準

隙間を小さくするかどうかは、棒を並べる軸が「連続する数値範囲を区切った階級」か「個別の比較項目」かで決める。縦棒では横軸、横棒では縦軸に同じ基準を適用する。度数・割合・DPSなど、棒の長さを表す数値軸では判定しない。

| 棒を並べる軸の意味 | 例 | 棒間の隙間 |
| --- | --- | --- |
| 連続する数値範囲を区切った階級 | 術耐性0〜10、10〜20、20〜30 | 小さくする |
| 個別に指定した数値の点 | 術耐性0・20・50でのDPS、術耐性の下限に対応する防御力 | 通常の隙間を空ける |
| 独立したカテゴリ | OP名、職業、MOD | 通常の隙間を空ける |

数値ラベルか文字ラベルか、あるいは表示名の並び順だけでは判断しない。敵ステータスのゲーム内評価E〜SSは元の数値範囲を区切った階級なので、数値階級と同じく隙間を小さくする対象とする。単体の分布と左右比較でこの判断を変えず、系列数や情報帯の有無も分類の根拠にしない。

左右比較の `xKind: 'category'` は、2系列の共通カテゴリを整列させるデータ構造を表す。元の評価を独立したカテゴリへ変更する指定ではない。提供元は、各系列の評価が数値範囲の階級であることを `semantics.itemKind: 'interval'` で宣言する。描画側はラベルや系列名、境界の見た目から意味を推測しない。

`semantics.itemKind` は任意の `'interval' | 'point' | 'category'`。共通の `getBarChartItemKind(document)` がこの宣言を優先し、省略時は従来の `xKind` を使う。数値階級とゲーム内評価は `interval`、個別に指定した点は `point`、独立した比較項目は `category` とする。描画方向の `layout` は配置を決め、項目の意味や棒幅の規則を上書きしない。

この基準は隙間の使い分けを定める。具体的な比率・上限は [barChartPresentation.ts](../../src/lib/barChartPresentation.ts) の共通定義で管理し、提供元やページごとに独自の寸法を追加しない。

### 共通表示

数値書式、情報帯、見出しと条件の配置は共通にする。単系列では縦棒とゼロを含む縦軸を使い、左右比較では上記の配置を使う。グラフ内のクリック、ホバー、ドラッグ、ズームは設けない。操作はグラフの外に置き、狭い画面ではラベルを読める横幅を保って横スクロールする。

情報帯は、表示を有効にしたものだけを上から「累積割合帯 → 割合帯 → グラフ → 階級帯 → 評価帯」の順に置く。累積割合線はグラフ内に重ね、帯の表示とは連動させない。評価帯は [StatRankStrip](../../src/components/StatRankStrip.tsx)、各セルは [ChartStripCell](../../src/components/ChartStripCell.tsx) を再利用する。文字は回転させず、帯にもツールチップやホバー操作を追加しない。

ゲーム内評価方式の横軸は「評価の主段 → 範囲の従段」とし、数値方式で使う注釈の評価帯をさらに追加しない。

自然なグラフ高は [getBarChartNaturalHeight](../../src/lib/barChartLayout.ts) で求め、画面とPNGで同じ値を使う。単系列の縦棒は従来の334pxに、有効な累積割合帯・評価帯それぞれの28pxを加える。横軸の範囲段が有効な場合は基準高38pxと段間4pxの計42pxも加える。範囲は狭い幅で実際の文字幅に合わせて横書きで折り返し、必要な高さを確保する。追加した帯がオフ、または提供元が未対応の場合はその帯の高さを増やさず、数値階級の既存表示の高さを維持する。

描画方式と棒幅は `getBarChartItemKind(document)` が返す項目の意味と [barChartPresentation.ts](../../src/lib/barChartPresentation.ts) の共通定義で決める。画面の「自動設定」も同じ定義から描画方式・棒幅・上限を表示し、提供元名や値の大小、0や欠損から型を推定しない。区間型は1項目の区画の96%、点型とカテゴリ型は60%で上限48px。区画は縦棒では描画領域の幅を、横棒では高さを**すべてのbins**で割った大きさであり、0や欠損の項目も含む。48pxは**PNG拡大前のCSS/SVG座標**で、保存画像の1,920pxへの拡大率を掛ける前の値。画面とPNGで別の棒幅を定義しない。

利用ごとに変更するのは提供元、ステータス、階級方式、集計版、集計範囲、表示設定。「敵のステータス分布」では単体のステータス選択、「敵ステータスの評価別比較」では左右の選択を表示する。単系列の表示設定は `values`（棒の値）、`axisBand`（横軸の帯。ゲーム内評価方式では評価・範囲の2段）、`percent`（割合帯）、`cumulative`（累積割合線）、任意の `cumulativeBand`（累積割合帯）・`rankBand`（評価帯）。追加した2項目は初期値 `false` とし、従来の4項目だけを持つ設定も表示を変えずに扱う。提供元の能力に合わない設定は無効化する。コード上の既定値と各寸法は共通部品・定義を正とし、別のページへコピーしない。画面の初期集計は数値階級・術耐性・最新版・メインストーリー・出現回数。対応値の提供元は出現回数だけを使う。

画面・保存プレビュー・PNGには同じデータと設定を渡す。評価帯・従段の範囲・階級方式のデータも固定スナップショットへ含め、保存ダイアログを開いた後の編集で、既に開いているプレビューの計算結果や帯を差し替えない。PNGの幅は1,920px、保存ダイアログの初期比率は16:9とし、自動比率とカスタム比率も共通の保存UIから選べる。設定を識別する保存名は `getBarChartFilename` で生成し、ゲーム内評価の階級方式や、有効にした累積割合帯・評価帯も識別する。未対応の提供元やゲーム内評価方式で残った設定など、実際に表示しない割合・評価帯を名前に含めない。

## 使い方

提供元の登録と変換処理には `BAR_CHART_PROVIDERS` と `createBarChartFromProvider` を使う。以下の `data` と `version` は、既存の敵集計クライアントで読み込んだ同じ版のデータと版情報。

```tsx
const document = createBarChartFromProvider('enemy-stat-histogram', {
  data,
  version,
  scope: 'main',
  countMode: 'SPAWNS',
  statKey: 'defense',
  histogramBinning: 'numeric',
})

<BarChartFigure document={document} settings={{
  values: true,
  axisBand: true,
  percent: true,
  cumulative: true,
  cumulativeBand: true,
  rankBand: true,
}} />
```

ゲーム内評価の階級を作る場合は、同じ呼び出しで `histogramBinning: 'rating'` を指定する。`statKey` はHP・攻撃力・防御力・術耐性のいずれかとし、表示には通常の `BarChartFigure` と同じ設定を渡す。この方式では `rankBand: true` が残っていても評価帯は表示しない。

左右比較も同じ描画の入口へ渡す。

```tsx
const comparison = createBarChartFromProvider('enemy-stat-rating-comparison', {
  data, version, scope: 'main', countMode: 'SPAWNS',
  leftStatKey: 'maxHp', rightStatKey: 'attack',
})

<BarChartFigure document={comparison} settings={{
  ...DEFAULT_BAR_CHART_DISPLAY_SETTINGS,
  comparisonBand: 'cumulative',
  selectedRanks: ['rating-E', 'rating-D'],
}} />
```

`DEFAULT_BAR_CHART_DISPLAY_SETTINGS` は [barChartDocument.ts](../../src/lib/barChartDocument.ts) から読み込む。集計版・集計範囲・出現回数は既存の共通設定を使い、ステータスの選択によって母数を共通化しない。

提供元を追加するときは、提供元一覧へ変換処理を登録し、タイトル・軸・単位・集計条件・対応可能な表示をデータに含める。提供元別・ステータス別の描画分岐を `BarChartPlot` へ追加しない。現在の契約が表現しない3系列以上や範囲値が必要な場合は、既存の意味を保てる契約と描画を先に検討する。

## 見本と更新方法

`examples/` のPNGは実装から生成した確認用出力であり、見本の版・件数・値を今後の出力へ固定しない。以下はいずれも集計版v12・メインストーリー・出現回数、1,920×1,080pxの実際のPNG出力。

| 見本 | 表示設定 |
| --- | --- |
| [術耐性ヒストグラム](examples/resistance-histogram-v12-main.png) | 棒の値、横軸の帯、割合帯、累積割合線 |
| [術耐性ヒストグラム・情報帯](examples/resistance-histogram-bands-v12-main.png) | 棒の値、横軸の帯、割合帯、累積割合線、累積割合帯、評価帯の6項目すべて |
| [術耐性・ゲーム内評価のヒストグラム](examples/resistance-rating-histogram-v12-main.png) | ゲーム内評価方式。棒の値、評価・範囲の2段の横軸帯、割合帯、累積割合線、累積割合帯。評価帯は対象外 |
| [防御力ヒストグラム](examples/defense-histogram-v12-main.png) | 棒の値、横軸の帯 |
| [攻撃間隔ヒストグラム](examples/attack-interval-histogram-v12-main.png) | 棒の値、横軸の帯。横軸の単位は秒 |
| [術耐性の下限に対応する防御力](examples/defense-correspondence-v12-main.png) | 棒の値、横軸の帯。割合・累積割合は対象外 |
| [敵ステータスの評価別比較](examples/stat-rating-comparison-v12-main.png) | 左が防御力、右が術耐性。累積割合の帯、強調なし |

`resistance-histogram-v12-main.png` は、7種への拡張前の `enemy-resistance-histogram` から生成したもの。旧提供元IDの入力例として再利用せず、継続している階級境界・度数・割合・配置を照合する基準として保持する。現在の入力は `enemy-stat-histogram` と `statKey: 'magicResistance'` を使う。

更新時は機能確認用サーバーで `#/charts/bar` を開く。集計版v12、メインストーリー、出現回数を指定し、「敵のステータス分布」から対象ステータスを選ぶ。術耐性の従来見本は棒の値・横軸の帯・割合帯・累積割合線を表示し、追加した2つの帯はオフにする。「術耐性ヒストグラム・情報帯」は6項目すべてを表示し、`resistance-histogram-bands-v12-main.png` として保存する。累積割合の線と帯が同じ階級の値を示すこと、上部2帯と下部2帯の順序・位置が棒の列に揃うことを確認する。

防御力・攻撃間隔の見本は棒の値・横軸の帯だけを表示する。各画像保存で幅1,920px・比率16:9のPNGを生成し、上表のファイル名で `examples/` に保存する。防御力は自動階級と上限超過階級、攻撃間隔は小数の階級境界と秒の単位も確認する。

ゲーム内評価の見本は、同じ集計条件で術耐性を選び、「階級」を「ゲーム内評価」にする。棒の値・横軸の帯・割合帯・累積割合線・累積割合帯をオンにし、評価帯が表示されないことを確認する。幅1,920px・比率16:9で生成し、`resistance-rating-histogram-v12-main.png` として保存する。E〜SSの全評価、度数0、評価と範囲の2段、割合・累積割合の一致を確認する。横軸の帯をオフにした場合は評価の目盛りだけが残り、範囲段が消えることも画面と保存プレビューで確認する。

対応する防御力の見本は「防御力と術耐性の対応」を選び、棒の値・横軸の帯だけを表示して同じ保存設定で生成する。いずれも画像全体のタイトル、条件、軸名、0と欠損、帯と棒の位置を確認する。

左右比較の見本は「敵ステータスの評価別比較」を選び、集計版v12・メインストーリー・出現回数、左を防御力、右を術耐性、外側の帯を累積割合、強調なしにする。「画像を保存」で幅1,920px・16:9のPNGを生成し、`stat-rating-comparison-v12-main.png` として保存する。E〜SSの全評価、区間型の共通定義による棒幅、左右共通の目盛り、中央と外側の帯の行位置、各母数を確認する。HP／防御力のように母数が異なる組合せ、同一ステータス、左右の入替、帯なし、複数評価の強調と選択合計も画面・プレビュー・実PNGで確認する。

新しい提供元や配置変更の見本は、画面のスクリーンショットや手描きの図に置き換えず、実際のPNG保存から作る。画面・プレビュー・保存画像が同じデータを示していることを併せて確認する。

## 適用状況

共通ページ `#/charts/bar` の7ステータスの数値階級の分布、4ステータスのゲーム内評価の分布、防御力と術耐性の対応、4ステータスの左右評価別比較と、そのページのPNG出力へ適用する。数値階級に添える4種の評価帯も引き続き利用できる。既存の敵分布はステータス定義を共有するが、グラフ自体は共通描画へ未移行。既存の敵分布、対応表・対応式、DC3、GG、スルトの表示・初期値・出力は変更しない。

棒間の隙間を軸の意味で判断する基準は、本仕様の「棒間の隙間を決める基準」で定める。単系列の数値階級・ゲーム内評価と、左右評価別比較のE〜SSに同じ区間型の棒幅を適用する。左右比較の確認用PNGも、この共通定義による見本とする。適用範囲は共通の棒グラフ作成ページであり、既存の敵統計ページにある評価別分布など、別の描画部品は移行しない。

## 変更時の確認

- 棒を並べる軸の意味で隙間を判定し、数値階級・ゲーム内評価の階級、個別に指定した点、独立したカテゴリを区別する。縦棒・横棒、数値・文字ラベルの違いで判定を変えない。
- 左右比較の `xKind: 'category'` と `semantics.itemKind: 'interval'` を区別し、全16通りで区間型の棒幅を使う。項目の意味を固定スナップショットへ保持し、画面・保存プレビュー・PNGの棒幅と自動設定を一致させる。
- 同じ版・範囲・提供元・ステータス・階級方式は同じタイトル、軸名、値、並び順を返す。
- 7ステータスについて、v12メインストーリーの出現回数で既存計算の度数・欠損・階級幅・上限と一致する。術耐性の既存幅10と、防御力の対応値も維持する。
- ゲーム内評価方式は元の観測値から集計し、数値階級を合算しない。4種のE〜SS全評価・境界の包含と除外・下限なしと上限なし・度数0を保持する。
- ゲーム内評価方式の主段は評価、従段は範囲とし、横軸の帯をオフにした場合は評価の目盛りだけを表示する。狭い幅でも範囲は回転させず、横書きで折り返す。
- 自動設定に計算済みの階級幅・上限が表示され、対応値の提供元ではステータス選択と階級設定が表示されない。
- 攻撃間隔の横軸は秒を含み、単位や括弧を重複させない。
- 0と欠損、空データ、有効な分母0、全値0、端点と上限超過を区別する。
- 度数以外の値には、割合・累積割合の設定を持ち越しても表示しない。
- 累積割合線と累積割合帯を個別に切り替え、同時表示した場合も同じ累積値を示す。
- 評価帯はHP・攻撃力・防御力・術耐性の数値階級だけに表示し、元の階級・端点・上限超過の意味を保つ。ゲーム内評価方式、未対応ステータス、対応値グラフへ切り替えたときは表示・保存名へ含めない。
- 追加した帯データ・設定を固定スナップショットへ保持し、後の選択変更が開いている保存プレビューへ影響しない。
- 追加帯の数に応じた自然な高さを画面・プレビュー・PNGで共有し、帯がオフのときは従来の高さを維持する。
- 画面・プレビュー・PNGは同じ値、ラベル、設定を保ち、計算結果を変更しない。
- 左右比較の全16通りで既存の単体評価ヒストグラムと度数・個別母数・境界が一致する。同一ステータスでも2系列を残す。
- 左右比較は同じ割合を同じ棒の長さにし、外側の帯3形式、複数評価の強調、元の度数からの選択合計、母数0の欠損表示を保つ。
- 左右の順序・有効な帯・強調が保存名に反映され、単系列用の持ち越し設定は含まれない。選択配列も保存スナップショットから切り離される。
- 狭い画面、長い名称、画像の自動比率と16:9で、ラベルと帯が欠けたり重なったりしない。
- 関連テスト、ビルド、`npm run rules:check`を確認する。実際に生成したPNGも開いて確認する。

```sh
node --experimental-strip-types --test tests/barChartProviders.test.mjs tests/barChartPresentation.test.mjs tests/barChartWorkbench.test.mjs tests/barChartComparison.test.mjs tests/routes.test.ts
npm run build
npm run rules:check
```
