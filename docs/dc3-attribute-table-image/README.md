# 計算機3 属性比較表の画像出力

対象は `#/damage-3/attribute-comparison` の属性比較表と、`#/damage-3/physical-arts-comparison` の物理・術ダメージ比較表。保存画面を開いた時点の指標、計算条件、画面に表示された行と物理・術の全列を保持する。列見出しと最小・最大が等しいセルの結合は画面と共通にし、画像にタイトルと計算条件を載せる。

[計算機3の属性比較](../../src/components/DamageCalculatorThreeAttributePage.tsx)は、1体あたりの1回の主攻撃ダメージを「ゲーム内評価」または「出現順位」で表示する。「出現順位」では[術耐性10刻みの対応表](../../src/lib/enemyDefenseResistance.ts)から取得した防御力・術耐性の組を、物理と術の両方の計算に使う。対応する防御力がない行は防御力と両方のダメージを「—」で表示する。PNGには選択した集計版と比較基準を記載し、既定のファイル名にも含める。

「攻撃力を固定」の表は「ゲーム内評価」と「防御力・術耐性別」から選べる。「ゲーム内評価」では、評価ごとの物理・術ダメージの最小と最大を1つの表に保存する。「防御力・術耐性別」では、画面で表示中の表を保存する。「出力」で確定した攻撃力と、保存対象の範囲・刻み・指標を共通の表画像ダイアログに渡す。「防御力・術耐性を固定」では、攻撃力ごとの行を、固定値と攻撃力の範囲・刻みとともに保存する。[物理・術ダメージ比較ページ](../../src/components/PhysicalArtsComparisonPage.tsx)・[共通の表画像ダイアログ](../../src/components/ComparisonTableImageDialog.tsx)

[テーブル画像出力の共通仕様](../../instructions/shared/table-image.md)に従い、[ChartImageSaveDialog](../../src/components/ChartImageSaveDialog.tsx)で名前と縦横比を指定する。[ComparisonTableImageFrameとPreview](../../src/components/ComparisonTableImageFrame.tsx)が同じ内容を測定し、[saveComparisonChartImage](../../src/components/saveComparisonChartImage.tsx)で幅・高さを2倍にしたPNGを生成する。文字サイズと寸法上限は[共通の文字サイズ定義](../../src/lib/tableImageTypography.ts)と[画像寸法の検証](../../src/lib/tableImageAspect.ts)に従う。既定の名前は[共通の命名処理](../../src/lib/chartImageFilename.ts)で作る。

## 見本の再生成

スルトS2・特化3、昇進2 Lv.90、信頼100、潜在1、未装備、敵1体で「防御力・術耐性無視を適用」をオンにする。「ゲーム内評価」で「画像を保存」から、縦横比を「指定なし」、文字サイズを既定の設定で保存する。[見本PNG](examples/surtr-s2-per-attack-rating-auto.png)と照合し、全10評価、物理と術の見出し、同値セル、タイトル、計算条件を確認する。

同じ条件で「出現順位」に切り替え、集計版v11で縦横比「16:9」、文字サイズを既定の設定で保存する。[見本PNG](examples/surtr-s2-per-attack-rank-v11-16x9.png)と照合し、術耐性0〜100の全11行、術耐性50の防御力350・物理2,366.8・術1,901.8、術耐性100の「—」、フッターとファイル名の比較基準・集計版を確認する。

「攻撃力を固定」の「表」で「ゲーム内評価」を選ぶ。攻撃力 `1600`、防御力 `0〜上限なし`、術耐性 `0〜100` で「出力」を押し、「16:9」で保存する。評価E〜SSの全10行とフッターの攻撃力を確認する。[全評価の見本PNG](examples/physical-arts-attack-1600-16x9.png)

同じ攻撃力で防御力を `80〜120`、術耐性を `10〜20` に設定し、同じ比率で保存する。評価E〜Bの4行、片側だけが範囲に入る場合の「—」、術耐性20の同値セルの結合、フッターの両範囲を確認する。[範囲指定の見本PNG](examples/physical-arts-attack-1600-ranges-16x9.png)

「防御力・術耐性別」に切り替え、攻撃力 `4000`、防御力 `0〜1250`・刻み `200`、術耐性 `0〜100`・刻み `20` にして「出力」を押す。「軽減率」を選び、「防御力」または「術耐性」の表を表示してから「画像を保存」を押す。縦横比を「指定なし」で保存する。防御力の表は8行で最終行が1,250・31.25%、術耐性の表は6行で最終行が100・95%となる。タイトル・ファイル名・範囲が表示した表に揃うことを確認する。[防御力の見本PNG](examples/physical-defense-reduction-4000-auto.png)・[術耐性の見本PNG](examples/arts-resistance-reduction-4000-auto.png)

「防御力・術耐性を固定」で防御力 `1200`、術耐性 `60`、攻撃力 `500〜4000`、表の刻み `500` にして出力する。縦横比を「指定なし」、文字サイズを既定の設定で保存し、[攻撃力別の見本PNG](examples/physical-arts-attack-sweep-auto.png)と照合する。全8行、攻撃力2,000で物理・術ともに800、フッターの固定値と攻撃力の範囲・刻みを確認する。
