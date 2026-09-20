# グラフ画像出力のテンプレート

このプロジェクトでグラフの画像出力を作成・変更するときに適用する。共通の枠組みには `ChartImageFrame` を使い、以下の配置とサイズの決め方を維持する。画面上のグラフ、表だけの画像、スライド画像は対象外とする。

## 保存場所と役割

| ファイル | 役割 |
| --- | --- |
| [ChartImageFrame.tsx](../../src/components/ChartImageFrame.tsx) / [CSS](../../src/components/ChartImageFrame.css) | タイトル・凡例・条件・横軸名の配置と、折り返し後の高さ計測 |
| [chartImageLayout.ts](../../src/lib/chartImageLayout.ts) | 自然なグラフの高さを保った画像サイズの計算 |
| [saveComparisonChartImage.tsx](../../src/components/saveComparisonChartImage.tsx) | 描画完了の待機、PNG生成、保存処理 |
| [ChartImageSaveDialog.tsx](../../src/components/ChartImageSaveDialog.tsx) | ファイル名、画像全体の縦横比、保存先の操作 |
| [examples/](examples/) | 承認済みデザインの見本画像 |

配置を変更するときは共通部品とこの仕様を一緒に更新する。各ページに同じ枠組みを複製しない。グラフの計算、系列の色や線種、ラベルの内容は利用側で決める。PNG生成処理は表の画像保存でも使われるため、共通の保存処理にグラフ専用の配置を持ち込まない。

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
- タイトルは画像全体の中央に置く。左右の領域は同じ幅にし、凡例や条件の文字量でタイトルをずらさない。タイトル領域の上限は内幅の44%とする。
- 凡例や条件が長い場合は、それぞれの領域内で折り返す。グラフに重ねず、必要なヘッダーの高さを確保する。
- 凡例がない場合も左側の領域を保ち、タイトルを中央に置く。
- 横軸名はグラフの下に中央配置する。縦軸名と目盛りは各グラフ内で描画する。
- 平均・中央値など、特定の線を示す名称と値は線の近くに直接表示する。直接ラベルだけで識別できるヒストグラムと累積分布では、同じ説明の凡例を重ねて設けない。
- 色、線種、計算結果は既存のグラフの意味を引き継ぐ。枠組みの共通化を理由に変更しない。

## サイズと文字

単位はPNG化する前のCSSピクセル。PNGの倍率は保存処理が決める。

| 項目 | 標準値 |
| --- | --- |
| 基準の画像幅 | 960px |
| 外側の余白 | 上下12px、左右16px |
| ヘッダー・フッター・外側余白を合わせた最小予約高 | 76px。実際の高さに応じて拡張 |
| ヘッダーの列間隔 | 18px |
| タイトル | 17px、行高22px、太字 |
| 凡例・条件 | 11px、行高18px |
| 横軸名 | 12px、行高18px、太字、上余白12px |
| 背景 | 白 |
| フォント | Yu Gothic、YuGothic、Hiragino Kaku Gothic ProN、system-ui、sans-serif |

`naturalChartHeight` はヘッダー・横軸名・外側余白を除いたグラフ領域の自然な高さとする。各グラフの必要な高さを利用側で指定する。敵のヒストグラム・累積分布・散布図では334px、箱ひげ図・個別プロットでは `24 + max(1, グループ数) × 70` pxを使用する。

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
    conditions="全敵 · 有効データ 1517体 · 12階級"
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

## 見本画像と適用状況

以下は**配置を承認したデザインの見本**。現在の実装から生成したPNGとピクセル単位の一致を判定するための画像ではない。文字や数値は見本作成時のデータであり、今後の出力に固定しない。

| グラフ | 見本 | 読み取る配置 |
| --- | --- | --- |
| ヒストグラム | [histogram.png](examples/histogram.png) | 中央タイトル、右上の条件、平均・中央値の直接ラベル |
| 累積分布 | [ecdf.png](examples/ecdf.png) | 直接ラベルと十分な縦の描画領域 |
| 散布図 | [scatter.png](examples/scatter.png) | 左上の系列凡例と右上の条件 |
| 箱ひげ図 | [boxplot.png](examples/boxplot.png) | 左上の記号凡例とグループに応じた高さ |
| 個別プロット | [individual.png](examples/individual.png) | 左上の凡例とグループごとの描画領域 |

共通部品を使用しているのは、敵ページの上記5種類の画像出力。GGの性能分析・ターゲット切り替えなどの既存出力は未移行であり、このテンプレートを保存しただけでは自動的に見た目は変わらない。既存出力を移行するときは、その作業の対象範囲として扱う。

## 変更時の確認

- 保存ダイアログのプレビューに加えて、実際に生成したPNGを確認する。プレビューだけで配置が保たれると判断しない。
- タイトルが画像中央にあり、凡例と条件が重ならず、長い文字列が領域内で折り返されることを確認する。
- 比率の指定なし、横長のプリセット、グループ数の少ない・多いグラフを確認し、グラフ領域が縦につぶれないことを確認する。
- 軸名・目盛り・線の直接ラベルが欠けず、余分な重複凡例がないことを確認する。
- 出力の変更が画面上のグラフ、計算結果、色・線種、表やスライドの保存処理に影響していないことを確認する。
- 共通の配置やサイズ計算を変えた場合は、この仕様と必要な見本画像も合わせて見直す。
