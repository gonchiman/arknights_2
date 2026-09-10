import { Fragment } from 'react'
import { GoldenglowDetailModal } from './GoldenglowDetailModal'

export interface GoldenglowTargetSwitchHelpModalProps {
  buildLabel: string
  duration: number
  permanent: boolean
  trials: number
  droneCount: number
  hpRanges: readonly { label: string; description: string }[]
  onClose: () => void
}

const numberFormat = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 })

export function GoldenglowTargetSwitchHelpModal({
  buildLabel,
  duration,
  permanent,
  trials,
  droneCount,
  hpRanges,
  onClose,
}: GoldenglowTargetSwitchHelpModalProps) {
  const durationLabel = Number.isFinite(duration) && duration > 0
    ? `${numberFormat.format(duration)}秒`
    : '未入力'

  return (
    <GoldenglowDetailModal
      title="計算条件と結果の見方"
      closeLabel="計算条件と結果の見方を閉じる"
      onClose={onClose}
    >
      <div className="ggs-help-content">
        <section>
          <h3>現在の計算条件</h3>
          <dl>
            <dt>育成条件</dt>
            <dd>昇進2・最大Lv・信頼100・潜在1</dd>
            <dt>スキル・モジュール</dt>
            <dd>{buildLabel}</dd>
            <dt>{permanent ? '計測時間' : 'スキル時間'}</dt>
            <dd>{durationLabel}</dd>
            <dt>試行回数</dt>
            <dd>{numberFormat.format(trials)}回（表の各セルも同じ回数）</dd>
          </dl>
          {permanent && <p>S2は効果時間が無制限のため、指定した計測時間内のダメージを求めます。</p>}
        </section>

        <section>
          <h3>敵と攻撃回数</h3>
          <p>
            実際の敵を選択すると、敵データの基礎ステータスを入力します。
            ステージ固有の補正や敵の能力は含みません。必要に応じて数値を変更してください。
          </p>
          <p>
            撃破するたびに、同じHP・術耐性を持つ次の敵へ攻撃目標を切り替えます。
            残HPを超えたダメージは次の敵へ持ち越しません。
          </p>
          <p>
            浮遊ユニットの攻撃回数と爆発回数は、全{droneCount}体の合計です。爆発も攻撃1回として数えます。
          </p>
        </section>

        <section>
          <h3>ダメージとDPS</h3>
          <p>
            爆発を抽選するシミュレーションを繰り返し、その平均を期待値として表示します。
            モンテカルロ法による推定のため、抽選による誤差を含みます。
          </p>
          <dl>
            <dt>総ダメージ</dt>
            <dd>術耐性を適用した後のダメージです。敵の残HPを超えた分も含みます。</dd>
            <dt>浮遊ユニットの内訳</dt>
            <dd>通常攻撃分を表示します。爆発分は「爆発」に分けて表示します。</dd>
            <dt>DPS</dt>
            <dd>総ダメージを{permanent ? '計測時間' : 'スキル時間'}で割った値です。</dd>
          </dl>
        </section>

        <section>
          <h3>シミュレーション1回分</h3>
          <p>パネル5には、初期表示ではパネル2の平均を求めた試行のうち最初の1回の攻撃履歴を表示します。「もう一度実行」を押すと、現在の敵HP・術耐性・攻撃条件で抽選をやり直し、パネル5の1回分だけを更新します。パネル2の期待値は変わりません。</p>
          <p>同じ攻撃回の中に、本体と各浮遊ユニットの行を並べています。浮遊ユニットごとの自爆の「不発／発動」と、個別の適用倍率・ダメージ・連続不発回数を確認できます。連続不発回数は攻撃後の値を表示します。S3中は本体の攻撃ダメージが0になります。敵HPは全員の同時着弾後の残HPを共通の欄に表示します。攻撃前のHPや撃破結果は各行の詳細で確認できます。</p>
          <p>攻撃履歴の行を押すと、各浮遊ユニットの抽選値、爆発確率、攻撃倍率、ダメージ、次回へ引き継ぐ状態を確認できます。全浮遊の攻撃を同じ敵に適用してから撃破を判定します。</p>
          <p>合計ダメージは本体と全浮遊ユニットの攻撃ダメージを合わせた値、余剰ダメージは攻撃前の敵の残HPを超えた分です。撃破数は、その攻撃までに倒した敵の累計です。敵HPを実際に減らした分の有効ダメージは、各行の詳細で確認できます。</p>
          <p>同じ条件と抽選番号なら同じ履歴を再現できます。表示中の履歴の抽選番号は各行の詳細で確認できます。条件を変更すると、パネル5は新しい条件で計算した最初の1回の履歴に戻ります。パネル1の「試行回数・抽選設定」にある「別の抽選で再計算」ではパネル2と5が更新され、パネル3・4は新しい抽選番号での再計算が必要になります。</p>
        </section>

        <section>
          <h3>HP・術耐性別の表とグラフ</h3>
          <p>パネル3の表は横軸が敵HP、縦軸が敵術耐性で、セルに総ダメージの期待値を表示します。</p>
          <p>パネル4では集合棒グラフと折れ線グラフを切り替えられます。横軸は敵HP、縦軸は総ダメージの期待値で、術耐性ごとに色を分けています。</p>
          <dl>
            {hpRanges.map(({ label, description }) => (
              <Fragment key={label}>
                <dt>{label}</dt>
                <dd>{description}</dd>
              </Fragment>
            ))}
            <dt>術耐性</dt>
            <dd>0〜100の範囲で、表示する刻みを選べます。</dd>
          </dl>
          <p>
            パネル1のオペレーター・戦闘・試行条件を使い、敵HP・術耐性には選んだ表示範囲の値を使います。
            表とグラフは同じ計算結果を表示します。どちらかの「計算する」で両方を更新します。
            HP範囲・術耐性の刻みは両パネルで連動し、変更すると再計算が必要です。
          </p>
          <p>
            値は四捨五入して整数で表示します。「小数点以下を表示」を選ぶと、小数点以下3桁まで表示します。
            小数点の設定も表とグラフで共通です。表は上下左右にスクロールできます。
          </p>
          <p>
            グラフの凡例を押すと、術耐性ごとに表示を切り替えられます。
            棒や点にカーソルを合わせるかタップすると、HP・術耐性・期待ダメージを確認できます。
            グラフの種類・配色・比較するHP・凡例・小数点の表示を変えても再計算は行いません。
          </p>
          <p>
            集合棒グラフは、計算済みのHPから最大4件を選んで比較できます。
            各HPの棒を術耐性の小さい順に並べ、縦軸は0から表示します。
            HPのグループは等間隔で、HPの数値の差を横の距離では表しません。
            棒が多い場合は、グラフ内を横にスクロールできます。
          </p>
          <p>
            棒グラフの配色は青・緑・紫・オレンジ・ピンクから選べます。
            「カスタム」ではカラーピッカーか6桁の色コードで指定できます。
            指定色の色相・彩度から術耐性ごとの濃淡を作り、術耐性が高いほど濃く表示します。
          </p>
          <p>
            「画像を保存」で、表示中のグラフ・凡例・タイトル・軸タイトルをPNG画像に保存できます。
            選択したHPと術耐性、配色を反映し、横スクロールで隠れている部分も含めます。
            計算中や表示する術耐性がない場合は保存できません。
          </p>
          <p>
            折れ線グラフの線は計算した点を直線で結んだものです。点の間の値は計算していません。
            撃破のタイミングや抽選による誤差の影響があるため、必ず右上がりになるとは限りません。
          </p>
        </section>
      </div>
    </GoldenglowDetailModal>
  )
}
