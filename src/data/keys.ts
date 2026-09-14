// 24調の定義（SPEC 4.4）。調はすべて実音（コンサートピッチ）で、並びは PDF の掲載順。

export type Mode = 'major' | 'minor';

export interface ScaleKey {
  /** 'C_major', 'Gs_minor' など。♯は s、♭は b、ロ（H）は B と綴る */
  id: string;
  nameJa: string;
  /** PDF 表記に合わせ、ロ長調・ロ短調は H Major / H Minor */
  nameEn: string;
  mode: Mode;
  /** 実音の主音のピッチクラス 0〜11 */
  tonicMidiClass: number;
  /** PDF の掲載順（1〜24） */
  order: number;
}

export const SCALE_KEYS: readonly ScaleKey[] = [
  { id: 'C_major', nameJa: 'ハ長調', nameEn: 'C Major', mode: 'major', tonicMidiClass: 0, order: 1 },
  { id: 'G_major', nameJa: 'ト長調', nameEn: 'G Major', mode: 'major', tonicMidiClass: 7, order: 2 },
  { id: 'F_major', nameJa: 'ヘ長調', nameEn: 'F Major', mode: 'major', tonicMidiClass: 5, order: 3 },
  { id: 'D_major', nameJa: 'ニ長調', nameEn: 'D Major', mode: 'major', tonicMidiClass: 2, order: 4 },
  { id: 'Bb_major', nameJa: '変ロ長調', nameEn: 'B♭ Major', mode: 'major', tonicMidiClass: 10, order: 5 },
  { id: 'A_major', nameJa: 'イ長調', nameEn: 'A Major', mode: 'major', tonicMidiClass: 9, order: 6 },
  { id: 'Eb_major', nameJa: '変ホ長調', nameEn: 'E♭ Major', mode: 'major', tonicMidiClass: 3, order: 7 },
  { id: 'E_major', nameJa: 'ホ長調', nameEn: 'E Major', mode: 'major', tonicMidiClass: 4, order: 8 },
  { id: 'Ab_major', nameJa: '変イ長調', nameEn: 'A♭ Major', mode: 'major', tonicMidiClass: 8, order: 9 },
  { id: 'B_major', nameJa: 'ロ長調', nameEn: 'H Major', mode: 'major', tonicMidiClass: 11, order: 10 },
  { id: 'Db_major', nameJa: '変ニ長調', nameEn: 'D♭ Major', mode: 'major', tonicMidiClass: 1, order: 11 },
  { id: 'Gb_major', nameJa: '変ト長調', nameEn: 'G♭ Major', mode: 'major', tonicMidiClass: 6, order: 12 },

  { id: 'C_minor', nameJa: 'ハ短調', nameEn: 'C Minor', mode: 'minor', tonicMidiClass: 0, order: 13 },
  { id: 'G_minor', nameJa: 'ト短調', nameEn: 'G Minor', mode: 'minor', tonicMidiClass: 7, order: 14 },
  { id: 'F_minor', nameJa: 'ヘ短調', nameEn: 'F Minor', mode: 'minor', tonicMidiClass: 5, order: 15 },
  { id: 'D_minor', nameJa: 'ニ短調', nameEn: 'D Minor', mode: 'minor', tonicMidiClass: 2, order: 16 },
  { id: 'Bb_minor', nameJa: '変ロ短調', nameEn: 'B♭ Minor', mode: 'minor', tonicMidiClass: 10, order: 17 },
  { id: 'A_minor', nameJa: 'イ短調', nameEn: 'A Minor', mode: 'minor', tonicMidiClass: 9, order: 18 },
  { id: 'Eb_minor', nameJa: '変ホ短調', nameEn: 'E♭ Minor', mode: 'minor', tonicMidiClass: 3, order: 19 },
  { id: 'E_minor', nameJa: 'ホ短調', nameEn: 'E Minor', mode: 'minor', tonicMidiClass: 4, order: 20 },
  { id: 'Gs_minor', nameJa: '嬰ト短調', nameEn: 'G♯ Minor', mode: 'minor', tonicMidiClass: 8, order: 21 },
  { id: 'B_minor', nameJa: 'ロ短調', nameEn: 'H Minor', mode: 'minor', tonicMidiClass: 11, order: 22 },
  { id: 'Cs_minor', nameJa: '嬰ハ短調', nameEn: 'C♯ Minor', mode: 'minor', tonicMidiClass: 1, order: 23 },
  { id: 'Fs_minor', nameJa: '嬰ヘ短調', nameEn: 'F♯ Minor', mode: 'minor', tonicMidiClass: 6, order: 24 },
];

export function getScaleKey(id: string): ScaleKey {
  const key = SCALE_KEYS.find((k) => k.id === id);
  if (!key) throw new Error(`未定義の調です: ${id}`);
  return key;
}
