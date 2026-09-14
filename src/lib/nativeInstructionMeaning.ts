import type * as Iced from 'iced-x86'

// CPU-level summaries, not inferred game behavior. Reference: Intel SDM, Volume 2.
// https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html
export function nativeInstructionMeaning(ins: Iced.Instruction, formatter: Iced.Formatter, iced: typeof Iced): string {
  const m = iced.Mnemonic, a = ins.opCount > 0 ? formatter.formatOperand(ins, 0) : '', b = ins.opCount > 1 ? formatter.formatOperand(ins, 1) : ''
  const conditions: Partial<Record<Iced.Mnemonic, string>> = {
    [m.Je]: 'ゼロフラグが1（ZF=1）', [m.Jne]: 'ゼロフラグが0（ZF=0）',
    [m.Ja]: 'CF=0かつZF=0', [m.Jae]: 'CF=0', [m.Jb]: 'CF=1', [m.Jbe]: 'CF=1またはZF=1',
    [m.Jg]: 'ZF=0かつSF=OF', [m.Jge]: 'SF=OF', [m.Jl]: 'SF≠OF', [m.Jle]: 'ZF=1またはSF≠OF',
    [m.Js]: 'SF=1', [m.Jns]: 'SF=0', [m.Jo]: 'OF=1', [m.Jno]: 'OF=0', [m.Jp]: 'PF=1', [m.Jnp]: 'PF=0',
  }
  const condition = conditions[ins.mnemonic]
  if (condition) return `${condition}なら分岐先へ進む。それ以外は次の命令へ進む。`
  switch (ins.mnemonic) {
    case m.Push: return `${a}の値をスタックに保存する。`
    case m.Pop: return `スタックの先頭の値を${a}に取り出す。`
    case m.Mov: return `${b}の値を${a}へコピーする。`
    case m.Movzx: return `${b}の値を上位ビットを0で埋めて${a}へコピーする。`
    case m.Movsx: case m.Movsxd: return `${b}の符号を保ってビット幅を広げ、${a}へコピーする。`
    case m.Lea: return `${b}のアドレスを計算して${a}に入れる。その場所のデータは読み取らない。`
    case m.Cmp: return `${a}から${b}を引いた結果でフラグを更新する。値自体は書き換えない。`
    case m.Test: return `${a}と${b}のビットごとのANDでフラグを更新する。値自体は書き換えない。`
    case m.Add: return `${a}に${b}を加え、結果を${a}に入れてフラグを更新する。`
    case m.Sub: return `${a}から${b}を引き、結果を${a}に入れてフラグを更新する。`
    case m.And: case m.Or: case m.Xor: {
      const operation = ins.mnemonic === m.And ? 'AND（両方が1のビットを残す）' : ins.mnemonic === m.Or ? 'OR（どちらかが1のビットを残す）' : 'XOR（異なるビットを1にする）'
      return `${a}と${b}の${operation}を計算し、${a}に入れてフラグを更新する。`
    }
    case m.Inc: case m.Dec: return `${a}を1${ins.mnemonic === m.Inc ? '増やす' : '減らす'}。CF以外の演算フラグを更新する。`
    case m.Neg: return `${a}を0から引いた値に置き換え、フラグを更新する。`
    case m.Not: return `${a}の各ビットの0と1を反転する。`
    case m.Call: return `戻り先をスタックに保存し、${a}の処理を呼び出す。`
    case m.Jmp: return `${a}へ無条件に移動する。`
    case m.Ret: return `スタックから戻り先を取り出して呼び出し元へ戻る。${a ? `さらにスタックを${a}バイト分進める。` : ''}`
    case m.Nop: return 'データを変更せず、次の命令へ進む。'
    case m.Int3: return 'デバッグ用の中断を発生させる。'
    case m.Movss: return `${b}の下位32ビット（単精度の値1個分）を${a}へコピーする。上位部分の扱いは命令形式による。`
    case m.Movaps: case m.Movups: case m.Movdqa: case m.Movdqu: return `${b}の128ビット分のデータを${a}へコピーする。`
    case m.Addss: case m.Subss: case m.Mulss: case m.Divss: {
      const operation = ins.mnemonic === m.Addss ? '加算' : ins.mnemonic === m.Subss ? '減算' : ins.mnemonic === m.Mulss ? '乗算' : '除算'
      return `${a}と${b}の下位の単精度値を${operation}し、結果を${a}の下位32ビットに入れる。`
    }
    case m.Comiss: case m.Ucomiss: return `${a}と${b}の下位の単精度値を比較し、大小・等値・比較不能をフラグに記録する。`
    case m.Xorps: case m.Pxor: return `${a}と${b}のビットごとのXOR（異なるビットを1にする）を${a}に入れる。`
    default: return 'この命令の日本語説明は未対応です。'
  }
}
