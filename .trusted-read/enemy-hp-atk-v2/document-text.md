# 敵の防御力・術耐性 表記ガイド

- Document ID: 1hME5Y6VRY1BD7FWHE89QcSJAjPv_uZWv2oByARawkKk
- Revision ID: ANLCKQn6S7UiSdrmgWNgBguB8XYg77cVoYqtpi9bNg6r2UfpWg-VA5tVEHcjx12oEmO7MQFZpSS7L_D6pxsPpDQ3WQVFYjxGNH2OoNdrNHk
- Selected tab: t.0
- Protected controls: 0
- Opaque controls: 0
- Authoritative dropdowns: 0

Protected-control annotations are preservation instructions. Do not insert their displayed placeholder text to recreate a native control.

## Tab 1 (t.0)

[P00001 | 1:36 | NORMAL_TEXT]
ENEMY ANALYSIS / DISPLAY REFERENCE

[P00002 | 36:52 | NORMAL_TEXT]
敵の防御力・術耐性 表記ガイド

[P00003 | 52:76 | NORMAL_TEXT]
段階評価と実数値の対応・ダメージ計算での読み方

[P00004 | 76:123 | NORMAL_TEXT]
対象画面: Enemy Analysis   |   Version 1.0   |   2026-08-31

[P00005 | 126:130 | NORMAL_TEXT | TABLE row=0 col=0]
最重要

[P00006 | 130:201 | NORMAL_TEXT | TABLE row=0 col=0]
ゲーム内の文字ランクは、敵の強さをおおまかに示す範囲表記です。正確なダメージ比較には実数値を使い、防御力と術耐性は別の仕組みとして読みます。

[P00007 | 202:203 | NORMAL_TEXT]
⟦EMPTY PARAGRAPH⟧

[P00008 | 203:215 | HEADING_1]
1. 表示ランクの意味

[P00009 | 215:313 | NORMAL_TEXT]
改修後の敵図鑑では、防御力・術耐性を E、D、C、B、B+、A、A+、S、S+、SS の10段階で表示します。文字が上がるほど数値も高くなりますが、画面上のランクだけでは厳密な値は分かりません。

[P00010 | 313:376 | NORMAL_TEXT | LIST id=kix.list.10 level=0]
Enemy Analysis の初期表示は「ゲーム内評価」です。「実数値」へ切り替えると、比較に用いる基礎値を確認できます。

[P00011 | 376:429 | NORMAL_TEXT | LIST id=kix.list.10 level=0]
本アプリは図鑑の評価文字列を直接読むのではなく、取得した実数値をゲーム内と同じ段階基準として換算します。

[P00012 | 429:464 | NORMAL_TEXT | LIST id=kix.list.10 level=0]
値が欠損・未定義・非数値の場合は評価できないため「—」と表示します。

[P00013 | 467:475 | NORMAL_TEXT | TABLE row=0 col=0]
10段階の順序

[P00014 | 475:515 | NORMAL_TEXT | TABLE row=0 col=0]
左ほど低く、右ほど高い評価です。「+」を含む文字は独立した段階として扱います。

[P00015 | 515:557 | NORMAL_TEXT | TABLE row=0 col=0]
E < D < C < B < B+ < A < A+ < S < S+ < SS

[P00016 | 558:559 | NORMAL_TEXT]
⟦EMPTY PARAGRAPH⟧

[P00017 | 559:561 | NORMAL_TEXT]
⟦EMPTY PARAGRAPH⟧

[P00018 | 561:574 | HEADING_1]
2. 本アプリの換算条件

[P00019 | 577:580 | NORMAL_TEXT | TABLE row=0 col=0]
評価

[P00020 | 581:590 | NORMAL_TEXT | TABLE row=0 col=1]
防御力（DEF）

[P00021 | 591:600 | NORMAL_TEXT | TABLE row=0 col=2]
術耐性（RES）

[P00022 | 602:605 | NORMAL_TEXT | TABLE row=1 col=0]
SS

[P00023 | 606:626 | NORMAL_TEXT | TABLE row=1 col=1]
5000 < x整数: 5001以上

[P00024 | 627:643 | NORMAL_TEXT | TABLE row=1 col=2]
90 < x整数: 91以上

[P00025 | 645:648 | NORMAL_TEXT | TABLE row=2 col=0]
S+

[P00026 | 649:679 | NORMAL_TEXT | TABLE row=2 col=1]
3000 ≤ x ≤ 5000整数: 3000～5000

[P00027 | 680:702 | NORMAL_TEXT | TABLE row=2 col=2]
80 ≤ x ≤ 90整数: 80～90

[P00028 | 704:706 | NORMAL_TEXT | TABLE row=3 col=0]
S

[P00029 | 707:737 | NORMAL_TEXT | TABLE row=3 col=1]
2000 ≤ x < 3000整数: 2000～2999

[P00030 | 738:760 | NORMAL_TEXT | TABLE row=3 col=2]
70 ≤ x < 80整数: 70～79

[P00031 | 762:765 | NORMAL_TEXT | TABLE row=4 col=0]
A+

[P00032 | 766:796 | NORMAL_TEXT | TABLE row=4 col=1]
1200 ≤ x < 2000整数: 1200～1999

[P00033 | 797:819 | NORMAL_TEXT | TABLE row=4 col=2]
60 ≤ x < 70整数: 60～69

[P00034 | 821:823 | NORMAL_TEXT | TABLE row=5 col=0]
A

[P00035 | 824:854 | NORMAL_TEXT | TABLE row=5 col=1]
1000 ≤ x < 1200整数: 1000～1199

[P00036 | 855:877 | NORMAL_TEXT | TABLE row=5 col=2]
50 ≤ x < 60整数: 50～59

[P00037 | 879:882 | NORMAL_TEXT | TABLE row=6 col=0]
B+

[P00038 | 883:910 | NORMAL_TEXT | TABLE row=6 col=1]
800 ≤ x < 1000整数: 800～999

[P00039 | 911:933 | NORMAL_TEXT | TABLE row=6 col=2]
30 ≤ x < 50整数: 30～49

[P00040 | 935:937 | NORMAL_TEXT | TABLE row=7 col=0]
B

[P00041 | 938:964 | NORMAL_TEXT | TABLE row=7 col=1]
500 ≤ x < 800整数: 500～799

[P00042 | 965:987 | NORMAL_TEXT | TABLE row=7 col=2]
20 ≤ x < 30整数: 20～29

[P00043 | 989:991 | NORMAL_TEXT | TABLE row=8 col=0]
C

[P00044 | 992:1018 | NORMAL_TEXT | TABLE row=8 col=1]
200 ≤ x < 500整数: 200～499

[P00045 | 1019:1041 | NORMAL_TEXT | TABLE row=8 col=2]
10 ≤ x < 20整数: 10～19

[P00046 | 1043:1045 | NORMAL_TEXT | TABLE row=9 col=0]
D

[P00047 | 1046:1072 | NORMAL_TEXT | TABLE row=9 col=1]
100 ≤ x < 200整数: 100～199

[P00048 | 1073:1092 | NORMAL_TEXT | TABLE row=9 col=2]
0 < x < 10整数: 1～9

[P00049 | 1094:1096 | NORMAL_TEXT | TABLE row=10 col=0]
E

[P00050 | 1097:1118 | NORMAL_TEXT | TABLE row=10 col=1]
x < 100通常の整数値: 0～99

[P00051 | 1119:1133 | NORMAL_TEXT | TABLE row=10 col=2]
x ≤ 0通常の値: 0

[P00052 | 1134:1251 | NORMAL_TEXT]
注: 公式にランク境界の数値表はないため、本表は2026-08-31時点の本アプリ実装値です。判定は丸め前の値に対して行い、整数の目安は読みやすさのために併記しています。境界上では、防御力5000・術耐性90はいずれもS+で、それを超えるとSSです。

[P00053 | 1251:1253 | NORMAL_TEXT]
⟦EMPTY PARAGRAPH⟧

[P00054 | 1253:1277 | HEADING_1]
3. 防御力と術耐性は、同じ文字でも働きが違う

[P00055 | 1277:1346 | NORMAL_TEXT]
防御力は物理ダメージから固定値を差し引き、術耐性は術ダメージを割合で減らします。そのため、同じB+やAでも軽減量が等しいとは限りません。

[P00056 | 1349:1362 | NORMAL_TEXT | TABLE row=0 col=0]
物理ダメージ / 防御力

[P00057 | 1363:1375 | NORMAL_TEXT | TABLE row=0 col=1]
術ダメージ / 術耐性

[P00058 | 1377:1390 | NORMAL_TEXT | TABLE row=1 col=0]
1ヒットごとの固定値減算

[P00059 | 1391:1399 | NORMAL_TEXT | TABLE row=1 col=1]
割合による軽減

[P00060 | 1401:1426 | NORMAL_TEXT | TABLE row=2 col=0]
max(ATK − DEF, ATK × 5%)

[P00061 | 1427:1462 | NORMAL_TEXT | TABLE row=2 col=1]
max(ATK × (1 − RES/100), ATK × 5%)

[P00062 | 1464:1477 | NORMAL_TEXT | TABLE row=3 col=0]
攻撃力と防御力の差が重要

[P00063 | 1478:1500 | NORMAL_TEXT | TABLE row=3 col=1]
RES 1につき約1ポイント軽減率が上がる

[P00064 | 1501:1508 | HEADING_2]
同じB+の例

[P00065 | 1511:1525 | NORMAL_TEXT | TABLE row=0 col=0]
例: 攻撃力1000で攻撃

[P00066 | 1525:1551 | NORMAL_TEXT | TABLE row=0 col=0]
敵の防御力800、術耐性30は、どちらもB+です。

[P00067 | 1551:1581 | NORMAL_TEXT | TABLE row=0 col=0]
物理: max(1000 − 800, 50) = 200

[P00068 | 1581:1618 | NORMAL_TEXT | TABLE row=0 col=0]
術　: max(1000 × (1 − 0.30), 50) = 700

[P00069 | 1618:1644 | NORMAL_TEXT | TABLE row=0 col=0]
結論: 同じランクでも、受けるダメージは一致しない

[P00070 | 1645:1646 | NORMAL_TEXT]
⟦EMPTY PARAGRAPH⟧

[P00071 | 1646:1700 | NORMAL_TEXT | LIST id=kix.list.10 level=0]
物理攻撃は1ヒット攻撃力が低いほど防御力に止められやすく、高いほど防御力を上回った分を通しやすくなります。

[P00072 | 1700:1740 | NORMAL_TEXT | LIST id=kix.list.10 level=0]
術耐性は割合軽減なので、同じRESなら攻撃力が変わっても軽減率は原則同じです。

[P00073 | 1740:1766 | NORMAL_TEXT | LIST id=kix.list.10 level=0]
確定ダメージは、防御力・術耐性の影響を受けません。

[P00074 | 1766:1791 | HEADING_1]
4. Enemy Analysis での使い分け

[P00075 | 1791:1822 | NORMAL_TEXT | LIST id=kix.list.11 level=0]
「ゲーム内評価」で、物理と術の通りやすさを大まかに判断する。

[P00076 | 1822:1852 | NORMAL_TEXT | LIST id=kix.list.11 level=0]
「実数値」または敵詳細で、境界内のどこにいるかを確認する。

[P00077 | 1852:1888 | NORMAL_TEXT | LIST id=kix.list.11 level=0]
ダメージ計算機へ実数値を入力し、1ヒット・DPS・総ダメージを比べる。

[P00078 | 1888:1932 | NORMAL_TEXT | LIST id=kix.list.11 level=0]
ステージ補正、形態、自己強化、デバフや無視効果がある場合は基礎値だけで結論を出さない。

[P00079 | 1932:1934 | NORMAL_TEXT]
⟦EMPTY PARAGRAPH⟧

[P00080 | 1934:1947 | HEADING_1]
5. 表示値の前提と例外

[P00081 | 1947:2038 | NORMAL_TEXT]
基礎値: JP版ゲームデータの敵図鑑と戦闘データを敵IDで結合し、防御力 def と術耐性 magicResistance を読み取ります。複数レベルでは原則レベル0を採用します。

[P00082 | 2038:2112 | NORMAL_TEXT]
ステージ差: ゲーム内のSp.は、そのステージの敵が図鑑の標準情報と異なることを示します。本アプリはステージ固有条件やイベント補正を反映しません。

[P00083 | 2112:2168 | NORMAL_TEXT]
形態・能力: 形態変化、自己強化、強襲条件、契約、デバフや防御・術耐性無視により、戦闘中の実効値は変わります。

[P00084 | 2168:2229 | NORMAL_TEXT]
境界と丸め: 評価は丸め前の値で判定します。境界付近に小数値があると、整数表示との見た目が直感に合わない場合があります。

[P00085 | 2232:2241 | NORMAL_TEXT | TABLE row=0 col=0]
用語の混同に注意

[P00086 | 2241:2300 | NORMAL_TEXT | TABLE row=0 col=0]
術耐性（RES）は術ダメージを軽減する値です。スタン・睡眠などへの状態異常耐性、元素耐性、損傷耐性とは別の項目です。

[P00087 | 2301:2302 | NORMAL_TEXT]
⟦EMPTY PARAGRAPH⟧

[P00088 | 2302:2317 | HEADING_1]
6. 読み取りチェックリスト

[P00089 | 2317:2345 | NORMAL_TEXT | LIST id=kix.list.10 level=0]
文字ランクは正確な数値ではなく、範囲だと理解している。

[P00090 | 2345:2376 | NORMAL_TEXT | LIST id=kix.list.10 level=0]
防御力は固定値減算、術耐性は割合軽減として別々に読んでいる。

[P00091 | 2376:2409 | NORMAL_TEXT | LIST id=kix.list.10 level=0]
実数値、Sp.、形態・能力説明、ステージ固有補正を確認している。

[P00092 | 2409:2433 | NORMAL_TEXT | LIST id=kix.list.10 level=0]
最終判断はダメージ計算機で実数値を使っている。

[P00093 | 2433:2441 | HEADING_1]
7. 参照情報

[P00094 | 2441:2557 | NORMAL_TEXT]
実装根拠: src/lib/enemyData.ts（換算・データ取得）、src/lib/damageCalculator.ts（基本式）、src/components/EnemyAnalysis.tsx（表示切替・基礎値注記）。

[P00095 | 2557:2592 | NORMAL_TEXT | LIST id=kix.list.10 level=0]
公式: [アークナイツ公式 アプリ更新のお知らせ](https://www.arknights.jp/news/377)（2023-12-21の敵図鑑仕様変更）

[P00096 | 2592:2629 | NORMAL_TEXT | LIST id=kix.list.10 level=0]
開発側告知: [敵方档案库优化内容前瞻](https://www.taptap.cn/moment/415548477913697519)（表示項目、Sp.、形態・耐性説明）

[P00097 | 2629:2700 | NORMAL_TEXT | LIST id=kix.list.10 level=0]
補助資料: [Arknights Terra Wiki - DEF / RES / UI UX Changes](https://arknights.wiki.gg/wiki/UI_UX_Changes)（10段階表示と改修内容の整理）

[P00098 | 2700:2772 | NORMAL_TEXT | LIST id=kix.list.10 level=0]
計算式: [Arknights Terra Wiki - Physical damage / Arts damage](https://arknights.wiki.gg/wiki/Damage)（減算・割合軽減・最低保証）

