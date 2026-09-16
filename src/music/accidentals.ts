// 臨時記号の表示ルール（SPEC 5.3）。PDF の記譜（上行の ♮／♯、下行の ♭／♮ の明示）を再現する。
import { parsePitch, type Accidental, type Letter } from './pitch.ts';

export type AccidentalMark = 'natural' | 'sharp' | 'flat' | 'doubleSharp' | 'doubleFlat';

const SHARP_ORDER: readonly Letter[] = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER: readonly Letter[] = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

const MARKS: Record<Accidental, AccidentalMark> = {
  '': 'natural',
  '#': 'sharp',
  b: 'flat',
  x: 'doubleSharp',
  bb: 'doubleFlat',
};

/** 調号（正＝♯の個数、負＝♭の個数）がその文字に指定する変化記号 */
export function keySignatureAccidental(keySignature: number, letter: Letter): Accidental {
  if (!Number.isInteger(keySignature) || Math.abs(keySignature) > 7) {
    throw new RangeError(`調号は -7〜7 の整数です: ${keySignature}`);
  }
  if (keySignature > 0) return SHARP_ORDER.slice(0, keySignature).includes(letter) ? '#' : '';
  return FLAT_ORDER.slice(0, -keySignature).includes(letter) ? 'b' : '';
}

/**
 * 各音の左に描く臨時記号（描かない音は null）。
 * 下行の記号は上行の音を受けて決まるので、pitches は表示順（上行8音 → 下行8音の16音）で1列にして渡す。
 * 描くのは次のどちらかに当たる音：
 *   1. 変化記号が、調号でその文字に指定されている変化記号と異なる
 *   2. 変化記号が、同じ文字に直前に付いた変化記号と異なる
 */
export function accidentalMarks(keySignature: number, pitches: readonly string[]): (AccidentalMark | null)[] {
  const lastByLetter = new Map<Letter, Accidental>();
  return pitches.map((str) => {
    const { letter, accidental } = parsePitch(str);
    const previous = lastByLetter.get(letter);
    lastByLetter.set(letter, accidental);
    const differsFromKey = accidental !== keySignatureAccidental(keySignature, letter);
    const differsFromPrevious = previous !== undefined && accidental !== previous;
    return differsFromKey || differsFromPrevious ? MARKS[accidental] : null;
  });
}
