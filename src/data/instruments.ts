// 楽器定義と移調表（SPEC 4.3）。PDF の記譜と食い違う場合は PDF に合わせて修正する。

export type InstrumentId =
  | 'piccolo'
  | 'flute'
  | 'oboe'
  | 'bassoon'
  | 'bb_clarinet'
  | 'bass_clarinet'
  | 'alto_sax'
  | 'tenor_sax'
  | 'baritone_sax'
  | 'bb_trumpet'
  | 'f_horn'
  | 'trombone'
  | 'euphonium'
  | 'tuba'
  | 'string_bass';

export type Family = 'woodwind' | 'brass_valve' | 'brass_slide' | 'string';
export type Clef = 'treble' | 'bass';

export interface Instrument {
  id: InstrumentId;
  nameJa: string;
  family: Family;
  /** PDF の記譜に合わせる */
  clef: Clef;
  /** 記譜音 → 実音 の半音数（実音 = 記譜 + transposition） */
  transposition: number;
  phase: 1 | 2 | 3;
  /** 'flute' → templates/flute.svg */
  fingeringTemplate: string;
  /** ハーフホール等の注記 */
  notes?: string;
}

/** PDF と同じ並び（S1 の表示順） */
export const INSTRUMENTS: readonly Instrument[] = [
  { id: 'piccolo', nameJa: 'ピッコロ', family: 'woodwind', clef: 'treble', transposition: 12, phase: 2, fingeringTemplate: 'piccolo' },
  { id: 'flute', nameJa: 'フルート', family: 'woodwind', clef: 'treble', transposition: 0, phase: 1, fingeringTemplate: 'flute' },
  { id: 'oboe', nameJa: 'オーボエ', family: 'woodwind', clef: 'treble', transposition: 0, phase: 2, fingeringTemplate: 'oboe' },
  { id: 'bassoon', nameJa: 'ファゴット', family: 'woodwind', clef: 'bass', transposition: 0, phase: 2, fingeringTemplate: 'bassoon' },
  { id: 'bb_clarinet', nameJa: 'B♭クラリネット', family: 'woodwind', clef: 'treble', transposition: -2, phase: 1, fingeringTemplate: 'bb_clarinet' },
  { id: 'bass_clarinet', nameJa: 'バスクラリネット', family: 'woodwind', clef: 'treble', transposition: -14, phase: 1, fingeringTemplate: 'bass_clarinet' },
  { id: 'alto_sax', nameJa: 'アルトサックス', family: 'woodwind', clef: 'treble', transposition: -9, phase: 1, fingeringTemplate: 'alto_sax' },
  { id: 'tenor_sax', nameJa: 'テナーサックス', family: 'woodwind', clef: 'treble', transposition: -14, phase: 1, fingeringTemplate: 'tenor_sax' },
  { id: 'baritone_sax', nameJa: 'バリトンサックス', family: 'woodwind', clef: 'treble', transposition: -21, phase: 1, fingeringTemplate: 'baritone_sax' },
  { id: 'bb_trumpet', nameJa: 'B♭トランペット', family: 'brass_valve', clef: 'treble', transposition: -2, phase: 1, fingeringTemplate: 'bb_trumpet' },
  { id: 'f_horn', nameJa: 'Fホルン', family: 'brass_valve', clef: 'treble', transposition: -7, phase: 3, fingeringTemplate: 'f_horn' },
  { id: 'trombone', nameJa: 'トロンボーン', family: 'brass_slide', clef: 'bass', transposition: 0, phase: 1, fingeringTemplate: 'trombone' },
  { id: 'euphonium', nameJa: 'ユーフォニアム', family: 'brass_valve', clef: 'bass', transposition: 0, phase: 1, fingeringTemplate: 'euphonium' },
  { id: 'tuba', nameJa: 'チューバ', family: 'brass_valve', clef: 'bass', transposition: 0, phase: 1, fingeringTemplate: 'tuba' },
  { id: 'string_bass', nameJa: 'ストリングベース', family: 'string', clef: 'bass', transposition: -12, phase: 3, fingeringTemplate: 'string_bass' },
];

export function getInstrument(id: InstrumentId): Instrument {
  const instrument = INSTRUMENTS.find((i) => i.id === id);
  if (!instrument) throw new Error(`未定義の楽器です: ${id}`);
  return instrument;
}
