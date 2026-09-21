# グラフ画像出力のテンプレート

このプロジェクトでグラフの画像出力を作成・変更するときに適用する。共通の枠組みには `ChartImageFrame` を使い、以下の配置とサイズの決め方を維持する。画面上のグラフ、表だけの画像、スライド画像は対象外とする。

標準の見た目は、[ターゲット切替２の出力](examples/goldenglow-target-switch-2.png)を基準にする。小さな凡例、中央のタイトル、短い右上の条件を同じ行にまとめる。見本の系列名・数値・条件・配色は固定せず、出力するグラフの内容に合わせる。

## 保存場所と役割

| ファイル | 役割 |
| --- | --- |
| [ChartImageFrame.tsx](../../src/components/ChartImageFrame.tsx) / [CSS](../../src/components/ChartImageFrame.css) | タイトル・凡例・条件・横軸名の配置と、折り返し後の高さ計測 |
| [chartImageLayout.ts](../../src/lib/chartImageLayout.ts) | 自然なグラフの高さを保った画像サイズの計算 |
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
- MOD比較では、計算結果に対応する全系列の種類と潜在を共通配色関数に渡し、画面・凡例・保存プレビュー・PNGで統一する。同じ潜在だけを比較する場合は基準色、異なる潜在を比較する場合は潜在ごとの濃淡を使う。表示名や系列順から色を推測しない。計算途中で点がまだない系列も判定に含める。ターゲット切替２は全系列が潜在1のため、標準見本では基準色を使う。

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

## 画像名

既定の画像名は「読める名前＋設定の識別子＋縦横比＋`.png`」とする。同じ有効設定なら同じ名前になり、出力に使う設定が異なれば識別できるようにする。保存日時や乱数は含めない。

- `createChartImageFilename(prefix, options)` で名前を作る。設定をキー順に整えたJSONからSHA-256を計算し、64桁すべてを使用する。配列の順序と数値の精度は維持する。読める部分の長さとファイル名に使えない文字の処理は共通関数に任せる。
- 設定には、スキル・計算時間・順序を含む比較対象・表示値・基準列・小数桁・そのグラフで有効な表示オプションを含める。折れ線の線種と系列名、棒の向き・積み上げ・レイアウト、集合棒の刻み・数値表示なども対象とする。
- 非表示のグラフ形式に残っている設定、プリセット名、内部の連番ID、表だけの設定、入力途中の未確定値、画面の開閉状態は含めない。比較対象はMOD・装備時のレベル・潜在などの実際の条件で表す。
- `withChartImageAspect(filename, aspectRatio)` で、指定なしは `-auto`、指定ありは `-ratio` と実効比率を末尾に加える。16:9と32:18のような同じ比率は同じ名前になる。
- 保存画面には `getDefaultFilename` を渡し、縦横比変更時に自動名を更新する。ユーザーがファイル名を手入力した後は自動で書き換えない。設定による識別は自動名に適用し、ユーザー指定名は優先する。
- 名前と画像は同じ時点の設定から作る。保存先選択は保存ボタンを押した直後に呼び出し、識別子の生成待ちでブラウザーの操作権限を失わないようにする。

GGのスキルダメージ比較では、[goldenglowPerformanceImageFilename.ts](../../src/lib/goldenglowPerformanceImageFilename.ts) が有効設定の選択を担当する。形式例は `goldenglow-S3-特化3-30s-grouped-bar-step20-value-labels-[64桁の識別子]-auto.png`。識別子の表記は説明用で、実際は設定から計算した16進文字列になる。

```tsx
// prefix と options は利用側で用意する、読める名前と有効な出力設定。
// saveDialogProps は aspect や保存操作など、既存の保存画面のプロパティ。
const baseFilename = await createChartImageFilename(prefix, options)
<ChartImageSaveDialog
  {...saveDialogProps}
  initialFilename={baseFilename}
  getDefaultFilename={(aspectRatio) => withChartImageAspect(baseFilename, aspectRatio)}
/>
```

この命名方式の適用済み範囲は、GGのスキルダメージ比較の折れ線・単一棒・集合棒。ほかの画像出力の既定名は未移行。設定項目を追加したときは、命名用の有効設定とテストも更新する。同じ設定・無関係な設定で名前が変わらないこと、有効設定・比較順序・比率の変更で名前が変わること、手入力名を保持することを確認する。共通関数の確認例は [chartImageFilename.test.ts](../../tests/chartImageFilename.test.ts)、GG固有の確認例は [goldenglowPerformanceImageFilename.test.ts](../../tests/goldenglowPerformanceImageFilename.test.ts) に置く。

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
