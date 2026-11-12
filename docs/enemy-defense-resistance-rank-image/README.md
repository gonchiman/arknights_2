# 防御力と術耐性の順位表の画像出力

`#/analysis/enemies/defense-resistance` の「順位表」にある「画像を保存」から、全行をPNGに保存できる。保存画面を開いた時点の集計版、出現回数、刻み、指定順位を保持し、画面と同じ行、数値、強調をプレビューとPNGに使う。

[順位表](../../src/components/EnemyDefenseResistancePage.tsx)は[共通の表画像ダイアログ](../../src/components/ComparisonTableImageDialog.tsx)へ表と条件を渡す。ファイル名、縦横比、保存先を指定できる。プレビューと2倍のPNGは[テーブル画像出力の共通仕様](../../instructions/shared/table-image.md)に従う。

## 見本の再生成

集計版を `v11` にして「順位表」を開き、刻みを `30`、指定順位を `12.5` にする。「画像を保存」で縦横比を「16:9」にして保存する。[見本PNG](examples/v11-step-30-rank-12-5-16x9.png)と照合し、上位12.5%、30%、60%、90%、100%の5行と指定順位の強調を確認する。
