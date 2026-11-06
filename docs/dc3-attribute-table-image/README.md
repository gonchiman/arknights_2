# 計算機3 属性比較表の画像出力

対象は `#/damage-3/attribute-comparison` の属性比較表。保存画面を開いた時点の指標（DPSまたは1回の攻撃ダメージ）、計算条件、評価E〜SSの全行と物理・術の全列を保持する。列見出しと最小・最大が等しいセルの結合は画面と共通にし、画像にタイトルと計算条件を載せる。

[テーブル画像出力の共通仕様](../../instructions/shared/table-image.md)に従い、[ChartImageSaveDialog](../../src/components/ChartImageSaveDialog.tsx)で名前と縦横比を指定する。[ComparisonTableImageFrameとPreview](../../src/components/ComparisonTableImageFrame.tsx)が同じ内容を測定し、[saveComparisonChartImage](../../src/components/saveComparisonChartImage.tsx)で幅・高さを2倍にしたPNGを生成する。文字サイズと寸法上限は[共通の文字サイズ定義](../../src/lib/tableImageTypography.ts)と[画像寸法の検証](../../src/lib/tableImageAspect.ts)に従う。既定の名前は[共通の命名処理](../../src/lib/chartImageFilename.ts)で作る。

## 見本の再生成

スルトS2・特化3、昇進2 Lv.90、信頼100、潜在1、未装備、敵1体で、表示指標をDPSにする。属性比較の「画像を保存」から、縦横比を「指定なし」、文字サイズを既定の設定で保存し、[見本PNG](examples/surtr-s2-dps-auto.png)と照合する。全10評価、物理と術の見出し、同値セル、タイトル、計算条件を確認する。
