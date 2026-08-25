# Arknights Skill Analyzer

アークナイツの公開ゲームデータを読み込み、スキルの効果タイプを自動分類・確認するための分析UIです。

## 機能

- JP版 `character_table.json` / `skill_table.json` を直接読み込み
- 「持続」「弾薬」「永続」「通常攻撃強化」「一撃必殺」などへルールベース分類
- 判定信頼度・判定根拠・検出フラグを表示
- オペレーター名、スキル名、説明文の検索
- 分類、レアリティ、信頼度による絞り込み
- 手動分類の上書き（ブラウザの localStorage に保存）
- 現在の分類結果をCSVエクスポート
- 最終スキルレベルのRaw JSON表示

## ローカル実行

依存パッケージはありません。`index.html` をHTTPサーバーで配信してください。

```bash
python -m http.server 8000
```

その後 `http://localhost:8000` を開きます。

## データソース

- `ArknightsAssets/ArknightsGamedata` の `jp/gamedata/excel/character_table.json`
- `ArknightsAssets/ArknightsGamedata` の `jp/gamedata/excel/skill_table.json`

## 分類器

現時点はMVPです。`durationType`, `duration`, スキル説明文を使っています。
「一撃必殺」「持続＋一撃必殺」「条件分岐」「その他」にはヒューリスティックが含まれるため、UIで確認・修正して精度を上げる前提です。
