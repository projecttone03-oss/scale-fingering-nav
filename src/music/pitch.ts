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

/** 平均律、A4（MIDI 69）= 440 Hz */
export function midiToFreq(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}
