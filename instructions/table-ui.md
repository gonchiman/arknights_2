# テーブルの表示方針

このアークナイツサイト内のテーブルを新規作成・修正するときに適用する。作業を始める前に [テーブル表示の共通ルール](shared/table-ui.md) を読み、従う。

## このプロジェクトの基準

- 基準となる表示は「単発シミュレーション」ページの履歴テーブル。実装は [GoldenglowSingleTrialPage.css](../src/components/GoldenglowSingleTrialPage.css) を参照する。
- 共通ルールで定める罫線の色は、既存ページと同じ `var(--border)` を使う。
- 最大値・同率の強調、共通部分の結合、転置や分割を作成・変更するときは [比較表の共通ルール](shared/comparison-table.md) も読み、従う。MOD比較に固有の候補・計算式・配置・実装は [MOD比較テーブルの共通出力](../docs/comparison-table-output/README.md) が扱う。
