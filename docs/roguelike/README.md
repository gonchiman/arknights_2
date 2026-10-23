# 統合戦略のステージデータ

`public/data/roguelike/` は統合戦略ページで使う配信用データ。通常のマップ・敵統計とは分離し、実行時に外部のゲームデータを取得しない。

## 生成

Node.js 24 以降で、プロジェクトルートから実行する。

```sh
npm run generate:roguelike
```

既定の取得元は ArknightsAssets/ArknightsGamedata の JP データ、コミット `60e3aaf434919fbca931024a59d51088e810a9d3`。`excel/roguelike_topic_table.json`、敵図鑑・敵能力値、各ステージのレベルファイルを同じコミットから取得する。取得内容は `.cache/roguelike/<commit>/` に保存する。

取得済みの版を通信せず再生成する場合：

```sh
npm run generate:roguelike -- --offline
```

別の版へ更新する場合は `--revision <40桁のコミットID>` を指定する。`--source-root <jp/gamedataのパス>` でローカルの取得元を使うこともできる。その場合は指定するコミットの内容と一致するチェックアウトを使う。

## 構造

- `index.json` は通常マップと同じ `MapIndex` に `themes`、`stages`、`source` を追加する。
- `stages` は元のステージ ID を保持する。通常・緊急の関係は `linkedStageId` で表し、`levelId` が同じでも別のレコードとして残す。
- `maps` と `details-0.json` ～ `details-f.json` は実際のレベル ID ごとに一度だけ保存する。共通の地形、敵一覧、ウェーブ表示を利用できる。
- `replacementLevelIds` は元データの `levelReplaceIds` を順序を保って正規化したもの。「標準／変化 1／変化 2」の選択肢であり、難易度や解放順を意味しない。代替地形も同じマップ形式で取得する。
- `source` にリポジトリ、完全なコミット ID、地域、ステージ表のパスを保存する。

初回生成は 5 テーマ、591 ステージレコード、代替地形を含む 525 マップ、897 種類の登録敵。レベルファイルの欠落は 0 件。名称が空白の元レコードはステージ ID で表示する。

## 能力値と出現条件

敵の HP・攻撃力などは共通の敵データベースから得た基礎値。探索難易度、秘宝、テーマ固有の効果、マップ内の能力値上書きを反映した戦闘中の能力値ではない。

登録敵には抽選候補や条件付きの敵も含まれる。ウェーブの順序、出現指定、相対待機時間、抽選グループは元データを保持するが、通常／緊急・秘宝等を含む探索条件は解決しない。したがって、マップ全体の出現数と敵ごとの確定体数は `null` とし、正の `SPAWN` の `resolution` は `unknown`、理由は `roguelike-context-unspecified` にする。設定体数 0 だけは `excluded` として扱う。

`enemySpawnCounts` や各アクションの `count` は元の**設定数**であり、実際の出現数には使わない。別分岐・召喚を含む戦闘シミュレーションや階層分類はこのページの対象外。

生成は `generateMapDatabase.mjs` のマップ生成処理を再利用する。統合戦略特有の処理は、テーマ・ステージの選択、代替地形の参照、確定できない条件の明示に限定する。

## 検証

```sh
node --test tests/roguelikeDatabaseGenerator.test.mjs
node --experimental-strip-types --test tests/roguelikeDatabase.test.ts
```

通常・緊急の共有マップ、代替地形、欠落データ、抽選候補、条件未適用の体数、参照パス・リンクの整合性を検証する。
