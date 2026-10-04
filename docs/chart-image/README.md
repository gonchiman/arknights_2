# グラフ画像出力のテンプレート

このプロジェクトでグラフの画像出力を作成・変更するときに適用する。共通の枠組みには `ChartImageFrame` を使い、以下の配置とサイズの決め方を維持する。画面上のグラフ、表だけの画像、スライド画像は対象外とする。

標準の見た目は、[ターゲット切替２の出力](examples/goldenglow-target-switch-2.png)を基準にする。小さな凡例、中央のタイトル、短い右上の条件を同じ行にまとめる。見本の系列名・数値・条件・配色は固定せず、出力するグラフの内容に合わせる。

## 保存場所と役割

| ファイル | 役割 |
| --- | --- |
| [ChartImageFrame.tsx](../../src/components/ChartImageFrame.tsx) / [CSS](../../src/components/ChartImageFrame.css) | タイトル・凡例・条件・横軸名の配置と、折り返し後の高さ計測 |
| [chartImageLayout.ts](../../src/lib/chartImageLayout.ts) | 自然なグラフの高さを保った画像サイズの計算 |
| [ChartImageStackFrame.tsx](../../src/components/ChartImageStackFrame.tsx) / [chartImageStackLayout.ts](../../src/lib/chartImageStackLayout.ts) | 複数グラフを同じ幅で上下に並べ、画像全体の比率を計算 |
| [saveComparisonChartImage.tsx](../../src/components/saveComparisonChartImage.tsx) | 描画完了の待機、PNG生成、保存処理 |
| [ChartImageSaveDialog.tsx](../../src/components/ChartImageSaveDialog.tsx) | ファイル名、画像全体の縦横比、保存先の操作 |
| [chartImageFilename.ts](../../src/lib/chartImageFilename.ts) | 設定を識別する既定ファイル名と縦横比の付与 |
| [examples/](examples/) | 承認済みデザインの見本画像 |

配置を変更するときは共通部品とこの仕様を一緒に更新する。各ページに同じ枠組みを複製しない。グラフの計算、線種、ラベルの内容は利用側で決める。MODを比較する色は [moduleColors.ts](../../src/lib/moduleColors.ts) の `getModuleComparisonColors` に系列全体を渡して決め、独自のパレットを作らない。PNG生成処理は表の画像保存でも使われるため、共通の保存処理にグラフ専用の配置を持ち込まない。

## 配置

```text
┌──────────────────────────────────────────────────────┐
│ 凡例                  タイトル                   条件 │
│                                                      │
│                      グラフ                          │
│                                                      │
│                       横軸名                         │
└──────────────────────────────────────────────────────┘
```

- 凡例は左、タイトルは中央、条件は右に置き、同じヘッダー行にまとめる。
- 凡例は下記の小さな文字と間隔を標準とする。凡例を収めるためだけに画像幅を広げたり、タイトルの下に専用の行を追加したりしない。
- タイトルは画像全体の中央に置く。左右の領域は同じ幅にし、凡例や条件の文字量でタイトルをずらさない。タイトル領域の上限は内幅の44%とする。
- 凡例や条件が長い場合は、それぞれの領域内で折り返す。グラフに重ねず、必要なヘッダーの高さを確保する。
- 凡例がない場合も左側の領域を保ち、タイトルを中央に置く。
- 右上の条件は、図を理解するための主要条件に絞る。詳細を別で説明する前提で、設定をすべて列挙しない。GGのターゲット切替２では「S3 特化3・術耐性 0」の形式とし、実際に計算したスキル・スキルレベル・術耐性を使う。HP範囲、試行回数、シード、レベル・信頼度・潜在、切替時間はこの条件欄に追加しない。他のグラフでも、その図に必要な短い情報を選ぶ。
- 横軸名はグラフの下に中央配置する。縦軸名と目盛りは各グラフ内で描画する。
- 平均・中央値など、特定の線を示す名称と値は線の近くに直接表示する。直接ラベルだけで識別できるヒストグラムと累積分布では、同じ説明の凡例を重ねて設けない。
- 色、線種、計算結果は既存のグラフの意味を引き継ぐ。枠組みの共通化を理由に変更しない。
- MOD比較では、計算結果に対応する全系列の種類と比較属性を共通配色関数に渡し、画面・凡例・保存プレビュー・PNGで統一する。潜在の比較とMOD段階の比較は、[MOD共通配色の仕様](../module-colors/README.md)の各モードに従う。表示名や系列順から色を推測しない。計算途中で点がまだない系列も判定に含める。ターゲット切替２は全系列が潜在1のため、標準見本では基準色を使う。

## サイズと文字

単位はPNG化する前のCSSピクセル。PNGの倍率は保存処理が決める。

| 項目 | 標準値 |
| --- | --- |
| 基準の画像幅 | 960px |
| 外側の余白 | 上下12px、左右16px |
| ヘッダー・フッター・外側余白を合わせた最小予約高 | 76px。実際の高さに応じて拡張 |
| ヘッダーの列間隔 | 18px |
| タイトル | 17px、行高22px、太字 |
| 凡例 | 10px、行高18px |
| 凡例の項目間隔 | 横10px、折り返し時の縦6px |
| 凡例の線見本 | 幅18px、SVG高12px、線幅2px。色と線種は系列と一致させる |
| 凡例の記号と文字の間隔 | 5px |
| 条件 | 11px、行高18px、文字色 `#666` |
| 目盛り | 11px、文字色 `#555`、等幅数字 |
| 縦軸名 | 12px、太字、文字色 `#444` |
| 横軸名 | 12px、行高18px、太字、上余白12px |
| 背景 | 白 |
| フォント | Yu Gothic、YuGothic、Hiragino Kaku Gothic ProN、system-ui、sans-serif |

`naturalChartHeight` はヘッダー・横軸名・外側余白を除いたグラフ領域の自然な高さとする。各グラフの必要な高さを利用側で指定する。GGのターゲット切替２と、敵のヒストグラム・累積分布・散布図では334px、箱ひげ図・個別プロットでは `24 + max(1, グループ数) × 70` pxを使用する。

基準の見本は960×410pxで組み立て、2倍で保存した1920×820pxのPNG。見本に合わせるためにグラフの高さを変えない。長いタイトルや多い系列などで折り返す場合は、以下の計測ルールに従って必要な高さを追加する。

- 比率の指定なしでは、幅960pxと自然な高さを基準に画像を作る。
- 比率を指定した場合は、タイトルなどを含む画像全体に適用する。グラフを縦につぶして比率を合わせず、必要なら画像の幅を広げる。
- タイトル、凡例、条件、横軸名の実際の高さを計測する。折り返しで周辺の高さが増えても、自然なグラフ領域を確保する。
- プレビューの縮小倍率と出力用のサイズは分ける。画面に収めるための縮小を、保存画像のサイズ計算に使わない。
- プレビューでは、保存対象のスナップショット・グラフ種類・比率を `key` に含め、変更時にフレームを再マウントする。長い文字列から短い文字列へ変わった場合も、前の画像の折り返し計測状態を引き継がない。

最小予約高76pxは横軸名を省略した場合も共通とする。初期サイズの計算と実際のフレームで同じ値を使う。

条件の右寄せには `justify-self: end` と `margin: 0` を使う。`margin-left: auto` への置き換えは、PNG化時の複製で配置が変わることがあるため避ける。

## 共通部品の使い方

`ChartImageFrame` は内容の意味に依存しない枠組みを担当し、実際のSVGなどを描画する関数を `children` に渡す。

| プロパティ | 内容 |
| --- | --- |
| `title: string` | 中央のタイトル |
| `legend?: ReactNode` | 左側の凡例。不要な場合は省略 |
| `conditions?: string` | 右側の条件。対象・件数・設定など必要な短い情報 |
| `axisTitle?: string` | 下部の横軸名 |
| `naturalChartHeight: number` | グラフ領域に必要な自然な高さ |
| `informationPlacement?: 'header' \| 'top-right-box'` | 既定は上記の標準ヘッダー。明示した出力だけ右上枠内へタイトル・凡例・条件を縦に配置 |
| `aspectRatio?: number` | 画像全体の幅÷高さ。省略時は自動 |
| `className?: string` | グラフ固有の見た目を指定するクラス |
| `onLayout?: ({ width, height }) => void` | 計測後の画像全体のサイズ。プレビューなどに利用 |
| `children: ({ width, height }) => ReactNode` | 内側のグラフを描画する関数。`width` は左右余白を除いた幅、`height` はグラフ領域の高さ |

凡例には共通CSSの `chart-image-frame-legend-list`、`chart-image-frame-legend-item`、`chart-image-frame-legend-swatch` を使う。各ページで文字サイズ・間隔を重複定義しない。線以外の記号が必要な図では、記号の意味と形を維持する。

```tsx
const legend = (
  <ul className="chart-image-frame-legend-list" aria-label="比較する系列">
    {series.map((item) => (
      <li key={item.id} className="chart-image-frame-legend-item">
        <svg className="chart-image-frame-legend-swatch" width="18" height="12" aria-hidden="true">
          <line x1="0" x2="18" y1="6" y2="6" stroke={item.color}
            strokeWidth="2" strokeDasharray={item.dashArray} />
        </svg>
        <span>{item.label}</span>
      </li>
    ))}
  </ul>
)
```

この `legend` を `ChartImageFrame` の `legend` に渡す。凡例が不要なグラフでは省略する。共通部品はSVG内部を生成しないため、目盛り・縦軸名の文字サイズと色は利用側の描画にも上記の値を設定する。

```tsx
import { ChartImageFrame } from './ChartImageFrame'
import { saveComparisonChartImage } from './saveComparisonChartImage'
import { getChartImageLayout } from '../lib/chartImageLayout'

const naturalChartHeight = 334
const layout = getChartImageLayout({ naturalChartHeight, aspectRatio })

const chart = (
  <ChartImageFrame
    key={`${snapshotId}:${chartKind}:${aspectRatio ?? 'auto'}`}
    title="HPのヒストグラム"
    conditions="全敵"
    axisTitle="HP（対数目盛）"
    naturalChartHeight={naturalChartHeight}
    aspectRatio={aspectRatio}
  >
    {({ width, height }) => (
      <HistogramSvg width={width} height={height} data={snapshot} />
    )}
  </ChartImageFrame>
)

await saveComparisonChartImage({
  chart,
  filename,
  width: layout.width,
  writeBlob,
})
```

この例の `HistogramSvg`、`snapshot`、`snapshotId`、`chartKind` は利用側で用意する。初期幅には `getChartImageLayout` の `width` を渡す。描画後の折り返しによるサイズの変化は、フレームの計測と保存処理で反映される。

利用側のグラフは、受け取った幅と高さで描画する。横軸名をフレームに渡す場合、グラフ内の同じ軸名とそのための余白は外して二重表示を避ける。ヘッダーや横軸名を利用側で追加しない。SVG内の文字が境界からはみ出さないよう、目盛り・縦軸名・直接ラベルに必要な余白はグラフ内で確保する。

保存時は画面の設定とデータをひとまとまりで保持し、プレビューと実際のPNGに同じ内容を渡す。ファイル名と縦横比は `ChartImageSaveDialog` を使い、既存の保存先選択とダウンロードの処理を再利用する。

### 複数グラフの上下出力と右上の情報枠

スルトS3のDPSと敵の術耐性ヒストグラムを一緒に出力する場合は、[承認済みの配置見本](examples/surtr-dps-histogram-top-right-frame.png)に合わせて `ChartImageStackFrame` を使う。見本の数値・色・条件は入力例であり、データへ固定しない。標準の単独出力の配置は変更しない。

未ブロック／自身でブロックを上下に比較する出力は、[共通ヘッダーの出力見本](examples/surtr-block-comparison-shared-header.png)を参照する。タイトル・凡例・詳細は画像上部の同じ行に1回だけ置き、各グラフにはブロック状態名を表示する。共通の詳細は「特化3・ブロック状態比較」の形式とし、実際のスキルレベルを使う。これは実装から生成した確認用PNGであり、数値の一致は要求しない。更新時はスルトS3の初期比較条件で棒グラフ・術耐性2刻み・範囲0〜20・数値あり・ランク表示を選び、保存画面で「ブロック状態を上下に比較」と16:9を指定して再生成する。

- 各パネルは同じ幅を使い、上から入力順に並べる。既定の幅は960px、パネル間は12px。各パネルの `naturalChartHeight` を保持し、縦横比を全体へ一度だけ適用する。横長の場合は必要な幅を増やす。
- `informationPlacement: 'top-right-box'` を指定したパネルでは、グラフ内右上の白背景・薄灰枠にタイトル、凡例、条件の順にまとめる。描画側はデータ領域の範囲を表すSVG要素（軸のパスや枠の矩形）へ `data-chart-image-plot-area` を付け、情報枠をその右上から内側8pxに置く。ランク帯や軸名より下のデータ領域を基準にし、上部へ情報用の余白を常時確保しない。文字や凡例の大きさは標準と同じ。内容と計算結果を隠さない位置・範囲であることを実PNGで確認する。
- 右上枠とデータ・数値・平均／中央値の表示が重なる場合だけ、枠の高さをグラフ上部に確保して描画を下げる。自然なグラフ高は維持し、同じ保存対象の間は予約高を減らさない。描画側はデータの棒・線・直接ラベルへ `data-chart-image-ink` を付ける。枠線や補助目盛りは判定対象にせず、折れ線は外接矩形だけでなく実際の経路との交差を判定する。
- タイトル・条件の折り返しと軸名の高さを計測する。右上枠が自然なグラフ領域に収まらない場合も必要な高さを追加する。文字量とデータを変更したときは、スナップショットと比率を含む `key` でフレームを再マウントする。
- `render` は `{ width, height, reservedOverflow, onOverflow }` を受け取る。`height` は追加確保分を含む。数値ラベルなどが自然高を超える場合は、描画側で `height - reservedOverflow` を基準に必要な追加高を算出し、`onOverflow(追加高)` で報告する。フレームは各パネルの追加高を個別に確保する。
- スルトには [SurtrDpsSnapshotPlot / SurtrDpsImageLegend](../../src/components/SurtrDpsChart.tsx) を使い、既存の間引き・数値ラベル配置・配色・線種を再利用する。各パネルへ別々に縦横比を渡したり、スクリーンショットを引き伸ばして結合したりしない。

```tsx
// snapshot と histogramPlot は利用側の保存対象データ・描画関数。
<ChartImageStackFrame key={`${snapshot.id}:${aspectRatio ?? 'auto'}`} aspectRatio={aspectRatio}
  panels={[
    { id: 'dps', title: 'スルト S3 DPS', conditions: snapshot.conditions,
      legend: <SurtrDpsImageLegend series={snapshot.series} kind={snapshot.kind} />,
      axisTitle: '敵の術耐性', naturalChartHeight: 334, informationPlacement: 'top-right-box',
      render: (size) => <SurtrDpsSnapshotPlot {...snapshot.chartProps} {...size} /> },
    { id: 'histogram', title: '術耐性のヒストグラム', axisTitle: '術耐性（階級）',
      naturalChartHeight: 334, informationPlacement: 'top-right-box', render: histogramPlot },
  ]} />
```

初期の保存幅・プレビューサイズは `getChartImageStackLayout({ panels: [{ naturalChartHeight: 334 }, { naturalChartHeight: 334 }], aspectRatio })` から取得し、実測後は `onLayout` の幅・高さを使う。確認時は指定なし・16:9、長い凡例・条件、棒の数値あり、ヒストグラムの階級範囲表示を含め、各グラフの軸名やラベルの欠け、情報枠との重なりを確認する。共通枠・サイズの変更では既存の単独出力も確認する。

### 上下比較で共通情報を1回だけ表示する

- `ChartImageStackFrame` の `sharedHeader` に `{ title, legend, conditions }` を渡す。既存の `ChartImageHeading` と標準ヘッダーのCSSを使い、凡例左・タイトル中央・詳細右の配置を維持する。左右の文字量でタイトル位置をずらさない。
- 各パネルには状態名だけを `title` に渡し、共通のタイトル・凡例・詳細を繰り返さない。ブロック比較のDPSパネルには右上情報枠を使わない。
- 共通ヘッダーの高さは画像全体へ1回だけ加える。初期サイズにも `headerHeight: CHART_IMAGE_STACK_HEADER_HEIGHT` を渡し、折り返し後は実測値を使う。各パネルの自然なグラフ高と追加ラベル領域は維持する。
- 併記する術耐性ヒストグラムは、独自のタイトル・条件を既存の情報枠に表示する。`sharedHeader` を指定しない合成出力や単独出力は従来の配置を使う。

```tsx
// comparisonPanels は利用側で用意する状態名と描画関数を含むパネル配列。
<ChartImageStackFrame
  sharedHeader={{ title: 'スルト S3 DPS', legend: <SurtrDpsImageLegend series={series} kind={kind} />,
    conditions: '特化3・ブロック状態比較' }}
  panels={comparisonPanels}
  aspectRatio={aspectRatio}
/>
```

## 画像名

グラフPNGの既定名は「対象・指標＋主要な計算条件＋有効な表示設定＋縦横比＋`.png`」とし、人が読んで内容を判断できる名前にする。設定ハッシュ、保存日時、乱数で作った識別子は付けない。

- `createChartImageFilename(prefix, parts)` に、読める接頭辞と優先順の文字列配列を渡す。同期処理で、空項目を省略し、`_` で連結する。禁止文字・予約名・Unicode・長さの処理は共通関数に任せる。数値一覧には `formatChartFilenameValues(values)` を使い、全体が等差数列なら `0-50刻み10`、不規則なら `500-2000-4000` と表す。比較順序を維持する。
- 対象・スキル・練度・指標・比較MODと潜在・HP・術耐性など、図を見分ける主要条件を先に置く。形式・差分の基準・小数桁・線種・軸設定・割合表示・補助線など、そのグラフで有効な設定を続ける。未装備のLvや無効な表示設定は入れない。
- フィルター・比較系列・階級設定も人が理解できる名称を使う。計算結果の点配列・件数・平均値など、結果データ自体は名前に入れない。データの更新だけでは名前を変えず、計算結果の完全な同一性をファイル名で保証しない。
- 非表示形式に残っている設定、プリセット名、内部ID、表だけの設定、入力途中の未確定値、画面の開閉状態は入れない。同じ有効条件なら同名とし、通常の長さの範囲では条件・比較順序・表示設定の違いを読める名前に反映する。
- 長い名前は共通関数の長さ上限内に収め、主要条件を優先する。省略する場合は末尾に `ほかN項目` と明記し、隠れたハッシュを追加しない。省略された条件だけが異なる画像は同名になり得るため、保存画面の手入力名を尊重する。文字の途中でUnicodeを壊さない。
- `withChartImageAspect(filename, aspectRatio)` で、指定なしは `_比率自動`、指定ありは `_比率16x9` などの整数比を付ける。同じ比率は既約比で統一し、16:9と32:18は同名にする。整数比で表せない値は数値をそのまま残す。比率を追加しても全体の長さ上限を守る。
- 比率を選べる保存画面では `getDefaultFilename` を渡し、変更時に自動名も更新する。手入力後は自動で上書きしない。名前と画像は同じ時点のスナップショットから作る。保存先選択は保存ボタンを押した直後に呼び出し、描画処理の待機でブラウザーの操作権限を失わないようにする。

命名処理の適用済み範囲は次のとおり。配置テンプレートの適用状況とは別に管理する。

| ページ・グラフ | 名前用の条件を組み立てる処理 |
| --- | --- |
| GGスキルダメージ比較：折れ線・単一棒・集合棒 | [goldenglowPerformanceImageFilename.ts](../../src/lib/goldenglowPerformanceImageFilename.ts) |
| GGターゲット切替１：集合棒・折れ線 | [goldenglowTargetSwitchImageFilename.ts](../../src/lib/goldenglowTargetSwitchImageFilename.ts) |
| GGターゲット切替２：通常HP比較 | [goldenglowChartImageFilename.ts](../../src/lib/goldenglowChartImageFilename.ts) |
| GGターゲット切替２：複数術耐性比較 | [goldenglowResistanceComparisonSettings.ts](../../src/lib/goldenglowResistanceComparisonSettings.ts) |
| 敵統計：ヒストグラム | [enemyHistogramCounts.ts](../../src/lib/enemyHistogramCounts.ts) |
| 敵統計：累積分布 | [enemyWeightedEcdf.ts](../../src/lib/enemyWeightedEcdf.ts) |
| 敵統計：分布比較 | [enemyDistributionComparison.ts](../../src/lib/enemyDistributionComparison.ts) |
| 敵統計：ヒートマップ | [enemyJointImage.ts](../../src/lib/enemyJointImage.ts) |

表画像・スライドは対象外とし、既存の読める命名を維持する。旧 `enemyChartImage.ts` の予備経路や、現在選択できないグラフの命名はこの適用済み範囲に含めない。

実装で生成する名前の例（設定は見本用であり、今後の出力に固定しない）：

```text
GG_S3特化3_総ダメージ_MODなし-X3-Y3_30秒_術耐性0-100刻み10_集合棒_数値あり_比率自動.png
敵_HP_ヒストグラム_種類数_全敵_線形_幅10000_上限100000_割合表示_階級範囲表示_平均-中央値_比率自動.png
```

```tsx
// prefix と parts は利用側で用意する、読める名前と有効条件の文字列配列。
const baseFilename = createChartImageFilename(prefix, parts)
<ChartImageSaveDialog
  {...saveDialogProps}
  initialFilename={baseFilename}
  getDefaultFilename={(aspectRatio) => withChartImageAspect(baseFilename, aspectRatio)}
/>
```

設定追加時は各ページの命名関数とテストを更新する。同じ条件・非有効な設定・結果データだけの変更では名前が変わらず、有効設定・比較順序・比率を変えると名前が変わること、手入力名が維持されることを確認する。長い条件の省略、禁止文字、日本語の保存名も検証する。共通の確認例は [chartImageFilename.test.ts](../../tests/chartImageFilename.test.ts)、GG固有の例は [goldenglowPerformanceImageFilename.test.ts](../../tests/goldenglowPerformanceImageFilename.test.ts) に置く。上の命名見本は対応テストの入力を命名関数へ渡して再生成し、仕様変更時に更新する。

## 見本画像と適用状況

以下は**配置を承認したデザインの見本**。現在の実装から生成したPNGとピクセル単位の一致を判定するための画像ではない。文字や数値は見本作成時のデータであり、今後の出力に固定しない。

文字サイズ・凡例の間隔・条件の情報量は「ターゲット切替２」を基準とする。ほかの見本はグラフ固有の配置を確認するために残し、古い凡例サイズや条件の多さを標準として引き継がない。

| グラフ | 見本 | 読み取る配置 |
| --- | --- | --- |
| ターゲット切替２（標準） | [goldenglow-target-switch-2.png](examples/goldenglow-target-switch-2.png) | 10pxの凡例、タイトルと同じ行の配置、短い右上条件、固定の基準幅 |
| ヒストグラム | [histogram.png](examples/histogram.png) | 中央タイトル、右上の条件、平均・中央値の直接ラベル |
| 累積分布 | [ecdf.png](examples/ecdf.png) | 直接ラベルと十分な縦の描画領域 |
| 散布図 | [scatter.png](examples/scatter.png) | 左上の系列凡例と右上の条件 |
| 箱ひげ図 | [boxplot.png](examples/boxplot.png) | 左上の記号凡例とグループに応じた高さ |
| 個別プロット | [individual.png](examples/individual.png) | 左上の凡例とグループごとの描画領域 |

共通部品を使用しているのは、敵ページの上記5種類とGGのターゲット切替２の画像出力。GGの性能分析・ターゲット切替１などの既存出力は未移行であり、この仕様を保存しただけでは自動的に見た目は変わらない。共通フレームを使う出力でも、独自の凡例やSVG内部の書式は個別に移行が必要。既存出力を移行するときは、その作業の対象範囲として扱う。

## 変更時の確認

- 保存ダイアログのプレビューに加えて、実際に生成したPNGを確認する。プレビューだけで配置が保たれると判断しない。
- タイトルが画像中央にあり、凡例と条件が重ならず、長い文字列が領域内で折り返されることを確認する。
- 凡例が10px、項目間隔が10px、記号と文字の間隔が5pxになっていることを確認する。右上は主要条件だけに絞り、計算済みの結果と一致させる。
- 比率の指定なし、横長のプリセット、グループ数の少ない・多いグラフを確認し、グラフ領域が縦につぶれないことを確認する。
- 軸名・目盛り・線の直接ラベルが欠けず、余分な重複凡例がないことを確認する。
- 出力の変更が画面上のグラフ、計算結果、色・線種、表やスライドの保存処理に影響していないことを確認する。
- 共通の配置やサイズ計算を変えた場合は、この仕様と必要な見本画像も合わせて見直す。
