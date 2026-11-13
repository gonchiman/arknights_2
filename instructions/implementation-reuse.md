# 既存機能・UIの調査と再利用

このサイトの機能・UIの追加や修正について、案を提示するとき、設計するとき、または実装するときに適用する。案の提示だけの場合も、作業を始める前に [調査と再利用の共通ルール](shared/implementation-reuse.md) を読み、従う。

このプロジェクトでは、同じ機能でもページによって表示名が異なる。グラフの「評価表示」を調べるときは、「術耐性ランク表示」「HPランク表示」も手掛かりにする。スルトS3の [術耐性ランク](../src/components/SurtrDpsChart.tsx) とGGターゲット切替2の [HPランク](../src/components/GoldenglowTargetSwitchHpChart.tsx) は、共通の [StatRankStrip](../src/components/StatRankStrip.tsx) を使う。
