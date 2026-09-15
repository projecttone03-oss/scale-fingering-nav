// 綴り付きの科学的ピッチ表記（"C4", "F#5", "Bb3", "Fx5", "Cb5"）の解析と周波数変換（SPEC 4.2）。

export type Letter = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';
/** '' はナチュラル、'x' はダブルシャープ、'bb' はダブルフラット */
export type Accidental = 'bb' | 'b' | '' | '#' | 'x';

export interface Pitch {
  letter: Letter;
  accidental: Accidental;
  octave: number;
  midi: number;
}

const LETTER_SEMITONES: Record<Letter, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const ACCIDENTAL_SEMITONES: Record<Accidental, number> = { bb: -2, b: -1, '': 0, '#': 1, x: 2 };

const PITCH_PATTERN = /^([A-G])(bb|b|#|x|)(\d)$/;

/** C4 = 60。オクターブ番号は綴りの文字に従う（Cb5 = 71、B#4 = 72） */
export function parsePitch(str: string): Pitch {
  const m = PITCH_PATTERN.exec(str);
  if (!m) throw new Error(`音高の表記が不正です: "${str}"`);
  const letter = m[1] as Letter;
  const accidental = m[2] as Accidental;
  const octave = Number(m[3]);
  const midi = (octave + 1) * 12 + LETTER_SEMITONES[letter] + ACCIDENTAL_SEMITONES[accidental];
  return { letter, accidental, octave, midi };
}

/** 基準ピッチ A4（MIDI 69）の周波数。日本の吹奏楽に合わせて 442 Hz（SPEC 4.2） */
export const A4_HZ = 442;

/** 平均律の周波数。a4 は基準ピッチ（将来の F15 で 440〜445 Hz から選べるようにする） */
export function midiToFreq(midi: number, a4: number = A4_HZ): number {
  return a4 * 2 ** ((midi - 69) / 12);
}
