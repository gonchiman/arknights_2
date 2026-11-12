# 計算機3 属性比較表の画像出力

対象は `#/damage-3/attribute-comparison` の属性比較表と、`#/damage-3/physical-arts-comparison` の物理・術ダメージ比較表。保存画面を開いた時点の指標、計算条件、画面に表示された行と物理・術の全列を保持する。列見出しと最小・最大が等しいセルの結合は画面と共通にし、画像にタイトルと計算条件を載せる。

[物理・術ダメージ比較ページ](../../src/components/PhysicalArtsComparisonPage.tsx)の「攻撃力を固定」では、「出力」で確定した攻撃力、指定した防御力・術耐性の範囲、範囲内のダメージを[共通の表画像ダイアログ](../../src/components/ComparisonTableImageDialog.tsx)に渡す。指定範囲に入る評価だけを保存し、片側だけ該当する評価では範囲外の側を「—」で表示する。「防御力・術耐性を固定」では、表に表示された攻撃力ごとの行を、固定値と攻撃力の範囲・刻みとともに保存する。

[テーブル画像出力の共通仕様](../../instructions/shared/table-image.md)に従い、[ChartImageSaveDialog](../../src/components/ChartImageSaveDialog.tsx)で名前と縦横比を指定する。[ComparisonTableImageFrameとPreview](../../src/components/ComparisonTableImageFrame.tsx)が同じ内容を測定し、[saveComparisonChartImage](../../src/components/saveComparisonChartImage.tsx)で幅・高さを2倍にしたPNGを生成する。文字サイズと寸法上限は[共通の文字サイズ定義](../../src/lib/tableImageTypography.ts)と[画像寸法の検証](../../src/lib/tableImageAspect.ts)に従う。既定の名前は[共通の命名処理](../../src/lib/chartImageFilename.ts)で作る。

## 見本の再生成

スルトS2・特化3、昇進2 Lv.90、信頼100、潜在1、未装備、敵1体で、表示指標をDPSにする。属性比較の「画像を保存」から、縦横比を「指定なし」、文字サイズを既定の設定で保存し、[見本PNG](examples/surtr-s2-dps-auto.png)と照合する。全10評価、物理と術の見出し、同値セル、タイトル、計算条件を確認する。

物理・術ダメージ比較で攻撃力を `1600` にして「出力」を押し、「表」の「画像を保存」から縦横比を「16:9」、文字サイズを既定の設定で保存する。[見本PNG](examples/physical-arts-attack-1600-16x9.png)と照合し、評価E〜SSの全行とフッターの「攻撃力 1,600 · 1体あたり」を確認する。

同じ攻撃力で防御力を `80〜120`、術耐性を `10〜20` にして出力し、同じ保存設定で[範囲指定の見本PNG](examples/physical-arts-attack-1600-ranges-16x9.png)と照合する。評価E〜Bの4行、片側だけが範囲に入るセル、術耐性20の同値セル、フッターの両範囲を確認する。

「防御力・術耐性を固定」で防御力 `1200`、術耐性 `60`、攻撃力 `500〜4000`、表の刻み `500` にして出力する。縦横比を「指定なし」、文字サイズを既定の設定で保存し、[攻撃力別の見本PNG](examples/physical-arts-attack-sweep-auto.png)と照合する。全8行、攻撃力2,000で物理・術ともに800、フッターの固定値と攻撃力の範囲・刻みを確認する。
