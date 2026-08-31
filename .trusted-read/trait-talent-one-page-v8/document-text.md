# 特性・素質の実装方針

- Document ID: 1hPXvB7uTPKk0vcxfRXppHNtVmya1eGOQ1tjPcS9IRUQ
- Revision ID: ANLCKQm4NHsYKYip0KEr7VW_EloNyTQ7Bgcj5r0yTDck_PlZSF1S3xHr2Eac7C1WWAHpkdgo9UU75aySYWo6-6jF5RqXAyQCjORDmkpoRdY
- Selected tab: t.0
- Protected controls: 0
- Opaque controls: 0
- Authoritative dropdowns: 0

Protected-control annotations are preservation instructions. Do not insert their displayed placeholder text to recreate a native control.

## Tab 1 (t.0)

[P00001 | 1:12 | TITLE]
特性・素質の実装方針

[P00002 | 12:39 | NORMAL_TEXT]
ダメージ計算機に特性・素質を安全に反映するための設計

[P00003 | 39:40 | NORMAL_TEXT]
⟦EMPTY PARAGRAPH⟧

[P00004 | 40:46 | HEADING_1]
1. 目的

[P00005 | 46:162 | NORMAL_TEXT]
特性・素質のうち、ダメージ計算へ影響する効果を段階的に反映する。値や発動条件を一意に確定できない効果は推測で計算せず、未反映の理由を表示する。計算結果だけでなく、どの効果をどこへ適用したかを計算過程から追跡できる状態を目標とする。

[P00006 | 162:163 | NORMAL_TEXT]
⟦EMPTY PARAGRAPH⟧

[P00007 | 163:169 | HEADING_1]
2. 現状

[P00008 | 169:170 | NORMAL_TEXT]
⟦EMPTY PARAGRAPH⟧

[P00009 | 173:176 | NORMAL_TEXT | TABLE row=0 col=0]
項目

[P00010 | 177:181 | NORMAL_TEXT | TABLE row=0 col=1]
現行版

[P00011 | 182:189 | NORMAL_TEXT | TABLE row=0 col=2]
実装後の目標

[P00012 | 191:196 | NORMAL_TEXT | TABLE row=1 col=0]
候補選択

[P00013 | 197:218 | NORMAL_TEXT | TABLE row=1 col=1]
昇進・レベルは反映。潜在強化候補は除外。

[P00014 | 219:248 | NORMAL_TEXT | TABLE row=1 col=2]
育成入力に対応する候補を一意に選び、選択根拠を保持する。

[P00015 | 250:253 | NORMAL_TEXT | TABLE row=2 col=0]
表示

[P00016 | 254:264 | NORMAL_TEXT | TABLE row=2 col=1]
名称と説明を表示。

[P00017 | 265:287 | NORMAL_TEXT | TABLE row=2 col=2]
値、発動条件、適用先、対応状態も表示する。

[P00018 | 289:296 | NORMAL_TEXT | TABLE row=3 col=0]
ダメージ種別

[P00019 | 297:312 | NORMAL_TEXT | TABLE row=3 col=1]
特性説明から一部を初期推定。

[P00020 | 313:333 | NORMAL_TEXT | TABLE row=3 col=2]
確認済み定義で攻撃成分ごとに決定する。

[P00021 | 335:340 | NORMAL_TEXT | TABLE row=4 col=0]
数値補正

[P00022 | 341:368 | NORMAL_TEXT | TABLE row=4 col=1]
特性・素質由来の攻撃力、攻撃速度、無視効果は未反映。

[P00023 | 369:389 | NORMAL_TEXT | TABLE row=4 col=2]
既存の計算順へ効果種別ごとに組み込む。

[P00024 | 391:403 | NORMAL_TEXT | TABLE row=5 col=0]
条件付き・追加ダメージ

[P00025 | 404:409 | NORMAL_TEXT | TABLE row=5 col=1]
未対応。

[P00026 | 410:444 | NORMAL_TEXT | TABLE row=5 col=2]
入力で決まるものから段階対応し、複雑なものは専用モデルへ分離する。

[P00027 | 446:455 | NORMAL_TEXT | TABLE row=6 col=0]
潜在・モジュール

[P00028 | 456:469 | NORMAL_TEXT | TABLE row=6 col=1]
攻撃力加算を含め未対応。

[P00029 | 470:496 | NORMAL_TEXT | TABLE row=6 col=2]
入力機能と重複規則を実装した後に別段階で対応する。

[P00030 | 497:498 | NORMAL_TEXT]
⟦EMPTY PARAGRAPH⟧

[P00031 | 498:579 | NORMAL_TEXT]
現行版で計算に使う特性は、主にダメージ種別の初期推定と「攻撃しない」オペレーターの判定に限られる。素質は名称と説明を表示するが、数値効果は計算へ反映していない。

[P00032 | 579:580 | NORMAL_TEXT]
⟦EMPTY PARAGRAPH⟧

[P00033 | 580:588 | HEADING_1]
3. 基本方針

[P00034 | 588:646 | NORMAL_TEXT]
① 説明文の解析結果を、そのまま数値計算へ入れない。説明文は候補の分類に使い、確認済みの効果定義を通して反映する。

[P00035 | 646:716 | NORMAL_TEXT]
② ゲームデータのキーだけで効果を決めない。同じキーでも固定値・割合、自己・味方、常時・条件付きが異なるため、対象と条件を併せて確認する。

[P00036 | 716:759 | NORMAL_TEXT]
③ 各効果に出典、値、単位、適用対象、発動条件、計算へ入る位置、対応状態を持たせる。

[P00037 | 759:811 | NORMAL_TEXT]
④ 条件を画面入力から決められない場合は、必要な入力を追加するか「条件入力が必要」として計算を止める。

[P00038 | 811:856 | NORMAL_TEXT]
⑤ 追加攻撃や継続ダメージは既存の1本の攻撃倍率へ混ぜず、ダメージ成分を分けて計算する。

[P00039 | 856:857 | NORMAL_TEXT]
⟦EMPTY PARAGRAPH⟧

[P00040 | 857:866 | HEADING_1]
4. データ設計

[P00041 | 866:963 | NORMAL_TEXT]
ゲームデータには、昇進・レベル・潜在ごとの候補と補正値を示すblackboardが含まれる。現行コードでは表示文へ縮約する途中でblackboardを捨てているため、次の4層に分けて保持する。

[P00042 | 963:964 | NORMAL_TEXT]
⟦EMPTY PARAGRAPH⟧

[P00043 | 967:969 | NORMAL_TEXT | TABLE row=0 col=0]
層

[P00044 | 970:973 | NORMAL_TEXT | TABLE row=0 col=1]
役割

[P00045 | 974:983 | NORMAL_TEXT | TABLE row=0 col=2]
保持する主な項目

[P00046 | 985:990 | NORMAL_TEXT | TABLE row=1 col=0]
元データ

[P00047 | 991:1011 | NORMAL_TEXT | TABLE row=1 col=1]
候補を選ぶための情報を失わず読み込む。

[P00048 | 1012:1040 | NORMAL_TEXT | TABLE row=1 col=2]
解放昇進・レベル、必要潜在、説明、blackboard

[P00049 | 1042:1052 | NORMAL_TEXT | TABLE row=2 col=0]
選択済み特性・素質

[P00050 | 1053:1073 | NORMAL_TEXT | TABLE row=2 col=1]
現在の育成状態で有効な候補を確定する。

[P00051 | 1074:1094 | NORMAL_TEXT | TABLE row=2 col=2]
出典種別、名称、説明、値の組、候補ID

[P00052 | 1096:1104 | NORMAL_TEXT | TABLE row=3 col=0]
正規化した効果

[P00053 | 1105:1129 | NORMAL_TEXT | TABLE row=3 col=1]
ゲーム固有のキーを計算機の共通効果へ変換する。

[P00054 | 1130:1156 | NORMAL_TEXT | TABLE row=3 col=2]
効果種別、値、単位、対象、条件、通常／スキル、出典

[P00055 | 1158:1163 | NORMAL_TEXT | TABLE row=4 col=0]
評価結果

[P00056 | 1164:1179 | NORMAL_TEXT | TABLE row=4 col=1]
計算と画面へ同じ結果を渡す。

[P00057 | 1180:1198 | NORMAL_TEXT | TABLE row=4 col=2]
反映値、状態、未反映理由、式、警告

[P00058 | 1199:1200 | NORMAL_TEXT]
⟦EMPTY PARAGRAPH⟧

[P00059 | 1200:1201 | NORMAL_TEXT]
⟦EMPTY PARAGRAPH⟧

[P00060 | 1201:1212 | HEADING_1]
5. 効果の対応範囲

[P00061 | 1212:1276 | NORMAL_TEXT]
初期実装は、条件がなく対象が本人であることを確認できる効果を優先する。条件や対象が不明な効果を、もっともらしい値で代用しない。

[P00062 | 1276:1277 | NORMAL_TEXT]
⟦EMPTY PARAGRAPH⟧

[P00063 | 1280:1283 | NORMAL_TEXT | TABLE row=0 col=0]
効果

[P00064 | 1284:1289 | NORMAL_TEXT | TABLE row=0 col=1]
対応方針

[P00065 | 1290:1292 | NORMAL_TEXT | TABLE row=0 col=2]
例

[P00066 | 1294:1301 | NORMAL_TEXT | TABLE row=1 col=0]
ダメージ種別

[P00067 | 1302:1328 | NORMAL_TEXT | TABLE row=1 col=1]
優先対応。攻撃成分ごとに物理・術・確定を保持する。

[P00068 | 1329:1336 | NORMAL_TEXT | TABLE row=1 col=2]
スルトの特性

[P00069 | 1338:1347 | NORMAL_TEXT | TABLE row=2 col=0]
攻撃力補正A・B

[P00070 | 1348:1376 | NORMAL_TEXT | TABLE row=2 col=1]
本人への無条件効果から対応し、既存のA・Bへ合流する。

[P00071 | 1377:1394 | NORMAL_TEXT | TABLE row=2 col=2]
シルバーアッシュ、エクシアの素質

[P00072 | 1396:1403 | NORMAL_TEXT | TABLE row=3 col=0]
攻撃力補正E

[P00073 | 1404:1429 | NORMAL_TEXT | TABLE row=3 col=1]
発動条件を決められる場合だけ既存のEへ乗算する。

[P00074 | 1430:1443 | NORMAL_TEXT | TABLE row=3 col=2]
領主の遠距離攻撃時80%

[P00075 | 1445:1455 | NORMAL_TEXT | TABLE row=4 col=0]
攻撃速度・攻撃間隔

[P00076 | 1456:1482 | NORMAL_TEXT | TABLE row=4 col=1]
無条件効果を実効攻撃間隔へ反映。状態依存は後段階。

[P00077 | 1483:1496 | NORMAL_TEXT | TABLE row=4 col=2]
エクシア、復活後のホルン

[P00078 | 1498:1507 | NORMAL_TEXT | TABLE row=5 col=0]
防御・術耐性無視

[P00079 | 1508:1527 | NORMAL_TEXT | TABLE row=5 col=1]
軽減計算の直前に専用段階を追加する。

[P00080 | 1528:1540 | NORMAL_TEXT | TABLE row=5 col=2]
スルトの固定術耐性無視

[P00081 | 1542:1552 | NORMAL_TEXT | TABLE row=6 col=0]
単純な条件付き効果

[P00082 | 1553:1571 | NORMAL_TEXT | TABLE row=6 col=1]
必要な入力がある場合だけ反映する。

[P00083 | 1572:1589 | NORMAL_TEXT | TABLE row=6 col=2]
飛行敵、HP割合、遠距離、復活後

[P00084 | 1591:1596 | NORMAL_TEXT | TABLE row=7 col=0]
確率効果

[P00085 | 1597:1622 | NORMAL_TEXT | TABLE row=7 col=1]
発動時・非発動時・期待値を選ぶ計算モードが必要。

[P00086 | 1623:1631 | NORMAL_TEXT | TABLE row=7 col=2]
ヴィグナの素質

[P00087 | 1633:1645 | NORMAL_TEXT | TABLE row=8 col=0]
追加攻撃・継続ダメージ

[P00088 | 1646:1663 | NORMAL_TEXT | TABLE row=8 col=1]
別のダメージ成分として計算する。

[P00089 | 1664:1671 | NORMAL_TEXT | TABLE row=8 col=2]
ソーンズの毒

[P00090 | 1673:1684 | NORMAL_TEXT | TABLE row=9 col=0]
スタック・時間・撃破

[P00091 | 1685:1709 | NORMAL_TEXT | TABLE row=9 col=1]
攻撃回数や経過状態を持つモデルの後に対応する。

[P00092 | 1710:1719 | NORMAL_TEXT | TABLE row=9 col=2]
カシャの累積倍率

[P00093 | 1721:1729 | NORMAL_TEXT | TABLE row=10 col=0]
召喚物・設置物

[P00094 | 1730:1755 | NORMAL_TEXT | TABLE row=10 col=1]
本体と分離したステータスと攻撃モデルを用意する。

[P00095 | 1756:1768 | NORMAL_TEXT | TABLE row=10 col=2]
ケルシー／Mon3tr

[P00096 | 1769:1770 | NORMAL_TEXT]
⟦EMPTY PARAGRAPH⟧

[P00097 | 1770:1771 | NORMAL_TEXT]
⟦EMPTY PARAGRAPH⟧

[P00098 | 1771:1784 | HEADING_1]
6. 計算への組み込み順

[P00099 | 1784:1844 | NORMAL_TEXT]
特性・素質由来の攻撃力補正は新しい最終倍率として後付けせず、既存の攻撃力補正A～Eの該当位置へスキル補正と合流させる。

[P00100 | 1844:1845 | NORMAL_TEXT]
⟦EMPTY PARAGRAPH⟧

[P00101 | 1848:1851 | NORMAL_TEXT | TABLE row=0 col=0]
順序

[P00102 | 1852:1855 | NORMAL_TEXT | TABLE row=0 col=1]
処理

[P00103 | 1857:1859 | NORMAL_TEXT | TABLE row=1 col=0]
1

[P00104 | 1860:1889 | NORMAL_TEXT | TABLE row=1 col=1]
昇進・レベル・潜在から、現在有効な特性・素質候補を選ぶ。

[P00105 | 1891:1893 | NORMAL_TEXT | TABLE row=2 col=0]
2

[P00106 | 1894:1935 | NORMAL_TEXT | TABLE row=2 col=1]
確認済みの効果定義へ変換し、対象・条件・通常攻撃／スキルへの適用範囲を確定する。

[P00107 | 1937:1939 | NORMAL_TEXT | TABLE row=3 col=0]
3

[P00108 | 1940:1984 | NORMAL_TEXT | TABLE row=3 col=1]
基礎攻撃力を求め、特性・素質とスキルの補正を合流してA→B→C→D→Eの順に適用する。

[P00109 | 1986:1988 | NORMAL_TEXT | TABLE row=4 col=0]
4

[P00110 | 1989:2024 | NORMAL_TEXT | TABLE row=4 col=1]
基礎攻撃時間、攻撃速度、間隔補正から実効攻撃間隔を一か所で計算する。

[P00111 | 2026:2028 | NORMAL_TEXT | TABLE row=5 col=0]
5

[P00112 | 2029:2064 | NORMAL_TEXT | TABLE row=5 col=1]
攻撃をダメージ種別、倍率、ヒット数、追加ダメージごとの成分に分ける。

[P00113 | 2066:2068 | NORMAL_TEXT | TABLE row=6 col=0]
6

[P00114 | 2069:2111 | NORMAL_TEXT | TABLE row=6 col=1]
各成分へ防御力・術耐性の無視または減少を適用し、その後に軽減と最低保証を計算する。

[P00115 | 2113:2115 | NORMAL_TEXT | TABLE row=7 col=0]
7

[P00116 | 2116:2158 | NORMAL_TEXT | TABLE row=7 col=1]
成分を合計し、1ヒット、1攻撃、DPS、効果時間または全弾の総ダメージを算出する。

[P00117 | 2159:2160 | NORMAL_TEXT]
⟦EMPTY PARAGRAPH⟧

[P00118 | 2160:2161 | NORMAL_TEXT]
⟦EMPTY PARAGRAPH⟧

[P00119 | 2161:2172 | HEADING_1]
7. 条件と表示状態

[P00120 | 2172:2173 | NORMAL_TEXT]
⟦EMPTY PARAGRAPH⟧

[P00121 | 2176:2179 | NORMAL_TEXT | TABLE row=0 col=0]
状態

[P00122 | 2180:2183 | NORMAL_TEXT | TABLE row=0 col=1]
意味

[P00123 | 2184:2191 | NORMAL_TEXT | TABLE row=0 col=2]
画面での扱い

[P00124 | 2193:2198 | NORMAL_TEXT | TABLE row=1 col=0]
反映済み

[P00125 | 2199:2228 | NORMAL_TEXT | TABLE row=1 col=1]
値・対象・条件・式を確定でき、現在のモデルで計算できる。

[P00126 | 2229:2250 | NORMAL_TEXT | TABLE row=1 col=2]
効果名、値、適用先を計算過程に表示する。

[P00127 | 2252:2260 | NORMAL_TEXT | TABLE row=2 col=0]
条件入力が必要

[P00128 | 2261:2290 | NORMAL_TEXT | TABLE row=2 col=1]
式は対応済みだが、現在の入力だけでは発動を判定できない。

[P00129 | 2291:2313 | NORMAL_TEXT | TABLE row=2 col=2]
必要な入力を示し、未確定の数値は出さない。

[P00130 | 2315:2319 | NORMAL_TEXT | TABLE row=3 col=0]
未対応

[P00131 | 2320:2346 | NORMAL_TEXT | TABLE row=3 col=1]
別のダメージ成分、状態モデル、対象判定などが必要。

[P00132 | 2347:2371 | NORMAL_TEXT | TABLE row=3 col=2]
計算不能または一部未反映として理由を表示する。

[P00133 | 2373:2380 | NORMAL_TEXT | TABLE row=4 col=0]
直接影響なし

[P00134 | 2381:2401 | NORMAL_TEXT | TABLE row=4 col=1]
選択中の単体ダメージ出力へ影響しない。

[P00135 | 2402:2420 | NORMAL_TEXT | TABLE row=4 col=2]
効果は表示するが、計算を止めない。

[P00136 | 2421:2422 | NORMAL_TEXT]
⟦EMPTY PARAGRAPH⟧

[P00137 | 2422:2515 | NORMAL_TEXT]
条件入力は、選択中のオペレーターに必要な項目だけを表示する。例として、遠距離攻撃か、敵が飛行しているか、現在HP割合、復活後か、確率効果を発動時・非発動時・期待値のどれで見るかがある。

[P00138 | 2515:2516 | NORMAL_TEXT]
⟦EMPTY PARAGRAPH⟧

[P00139 | 2516:2526 | HEADING_1]
8. 段階的な実装

[P00140 | 2526:2527 | NORMAL_TEXT]
⟦EMPTY PARAGRAPH⟧

[P00141 | 2530:2533 | NORMAL_TEXT | TABLE row=0 col=0]
段階

[P00142 | 2534:2537 | NORMAL_TEXT | TABLE row=0 col=1]
対象

[P00143 | 2538:2543 | NORMAL_TEXT | TABLE row=0 col=2]
完了条件

[P00144 | 2545:2550 | NORMAL_TEXT | TABLE row=1 col=0]
0：基盤

[P00145 | 2551:2577 | NORMAL_TEXT | TABLE row=1 col=1]
blackboard保持、候補選択、効果レジストリ

[P00146 | 2578:2610 | NORMAL_TEXT | TABLE row=1 col=2]
効果の出典・値・条件を失わず取得でき、未知キーは未反映になる。

[P00147 | 2612:2620 | NORMAL_TEXT | TABLE row=2 col=0]
1：無条件効果

[P00148 | 2621:2652 | NORMAL_TEXT | TABLE row=2 col=1]
ダメージ種別、攻撃力A・B、攻撃速度、固定の防御・術耐性無視

[P00149 | 2653:2690 | NORMAL_TEXT | TABLE row=2 col=2]
通常攻撃とスキルの計算過程に効果名と値が表示され、代表例のテストが通る。

[P00150 | 2692:2700 | NORMAL_TEXT | TABLE row=3 col=0]
2：単純な条件

[P00151 | 2701:2720 | NORMAL_TEXT | TABLE row=3 col=1]
遠距離、飛行敵、HP割合、復活後など

[P00152 | 2721:2754 | NORMAL_TEXT | TABLE row=3 col=2]
必要な入力だけを表示し、条件ON・OFFと境界値のテストが通る。

[P00153 | 2756:2766 | NORMAL_TEXT | TABLE row=4 col=0]
3：複数成分・確率

[P00154 | 2767:2792 | NORMAL_TEXT | TABLE row=4 col=1]
追加攻撃、継続ダメージ、発動時・非発動時・期待値

[P00155 | 2793:2823 | NORMAL_TEXT | TABLE row=4 col=2]
成分別の軽減と最低保証を確認でき、計算モードが明示される。

[P00156 | 2825:2836 | NORMAL_TEXT | TABLE row=5 col=0]
4：状態・別ユニット

[P00157 | 2837:2858 | NORMAL_TEXT | TABLE row=5 col=1]
スタック、経過時間、撃破、召喚物・設置物

[P00158 | 2859:2884 | NORMAL_TEXT | TABLE row=5 col=2]
専用の状態モデルまたは別ユニットモデルを備える。

[P00159 | 2885:2886 | NORMAL_TEXT]
⟦EMPTY PARAGRAPH⟧

[P00160 | 2886:2887 | NORMAL_TEXT]
⟦EMPTY PARAGRAPH⟧

[P00161 | 2887:2894 | HEADING_1]
9. 検証例

[P00162 | 2894:2895 | NORMAL_TEXT]
⟦EMPTY PARAGRAPH⟧

[P00163 | 2898:2905 | NORMAL_TEXT | TABLE row=0 col=0]
オペレーター

[P00164 | 2906:2909 | NORMAL_TEXT | TABLE row=0 col=1]
効果

[P00165 | 2910:2917 | NORMAL_TEXT | TABLE row=0 col=2]
期待する扱い

[P00166 | 2919:2923 | NORMAL_TEXT | TABLE row=1 col=0]
スルト

[P00167 | 2924:2945 | NORMAL_TEXT | TABLE row=1 col=1]
特性：通常攻撃が術／素質：術耐性20無視

[P00168 | 2946:2987 | NORMAL_TEXT | TABLE row=1 col=2]
術種別を構造化し、軽減前に固定術耐性無視を適用。潜在候補22は潜在入力まで除外。

[P00169 | 2989:2994 | NORMAL_TEXT | TABLE row=2 col=0]
エクシア

[P00170 | 2995:3013 | NORMAL_TEXT | TABLE row=2 col=1]
素質：攻撃速度+12、攻撃力+6%

[P00171 | 3014:3037 | NORMAL_TEXT | TABLE row=2 col=2]
攻撃速度は攻撃間隔へ、攻撃力は補正Bへ反映。

[P00172 | 3039:3048 | NORMAL_TEXT | TABLE row=3 col=0]
シルバーアッシュ

[P00173 | 3049:3071 | NORMAL_TEXT | TABLE row=3 col=1]
素質：攻撃力+10%／特性：遠距離時80%

[P00174 | 3072:3108 | NORMAL_TEXT | TABLE row=3 col=2]
素質は補正B。特性は近距離・遠距離の入力がない間は「条件入力が必要」。

[P00175 | 3110:3115 | NORMAL_TEXT | TABLE row=4 col=0]
ヴィグナ

[P00176 | 3116:3128 | NORMAL_TEXT | TABLE row=4 col=1]
素質：確率で攻撃力上昇

[P00177 | 3129:3159 | NORMAL_TEXT | TABLE row=4 col=2]
発動時・非発動時・期待値の計算モードを追加するまで未対応。

[P00178 | 3161:3165 | NORMAL_TEXT | TABLE row=5 col=0]
ホルン

[P00179 | 3166:3181 | NORMAL_TEXT | TABLE row=5 col=1]
素質：復活後に攻撃速度+18

[P00180 | 3182:3205 | NORMAL_TEXT | TABLE row=5 col=2]
復活後かどうかの状態入力がある場合だけ反映。

[P00181 | 3207:3216 | NORMAL_TEXT | TABLE row=6 col=0]
カシャ／ケルシー

[P00182 | 3217:3229 | NORMAL_TEXT | TABLE row=6 col=1]
累積倍率／Mon3tr

[P00183 | 3230:3265 | NORMAL_TEXT | TABLE row=6 col=2]
攻撃回数を持つ状態モデル、または別ユニットモデルを実装してから対応。

[P00184 | 3266:3267 | NORMAL_TEXT]
⟦EMPTY PARAGRAPH⟧

[P00185 | 3267:3268 | NORMAL_TEXT]
⟦EMPTY PARAGRAPH⟧

[P00186 | 3268:3277 | HEADING_1]
10. 完了条件

[P00187 | 3277:3326 | NORMAL_TEXT]
① 通常攻撃、スキル、比較テーブル、グラフ、オペレーター比較が同じ特性・素質評価結果を使用する。

[P00188 | 3326:3361 | NORMAL_TEXT]
② 計算過程に、反映した効果名、値、適用先、式と段階結果を表示する。

[P00189 | 3361:3404 | NORMAL_TEXT]
③ 未知のblackboardキーや条件不明の効果は数値へ影響せず、理由を表示する。

[P00190 | 3404:3448 | NORMAL_TEXT]
④ 昇進・レベルによる候補切替を再現し、潜在を選択できない間は潜在強化候補を使わない。

[P00191 | 3448:3492 | NORMAL_TEXT]
⑤ 既存の通常攻撃・スキル計算テストを維持し、代表例と条件境界の自動テストを追加する。

[P00192 | 3492:3493 | NORMAL_TEXT]
⟦EMPTY PARAGRAPH⟧

[P00193 | 3493:3504 | HEADING_1]
11. 当面の対象外

[P00194 | 3504:3617 | NORMAL_TEXT]
潜在・モジュール・味方バフ・敵デバフは、それぞれの入力機能と重複規則を実装するまで含めない。複数対象、配置位置、撃破イベント、召喚物、元素損傷、フレーム単位の挙動、複雑なスタックや時間変化は専用モデルを用意してから対応する。

[P00195 | 3617:3618 | NORMAL_TEXT]
⟦EMPTY PARAGRAPH⟧

