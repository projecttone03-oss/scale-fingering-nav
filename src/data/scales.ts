// 楽譜データ（src/data/scales/<instrumentId>.json）の型（SPEC 4.5）。
import type { Clef, InstrumentId } from './instruments.ts';

export interface ScaleEntry {
  /** 正＝♯の個数、負＝♭の個数（0〜±7） */
  keySignature: number;
  /** 主音〜オクターブ上の主音（8音） */
  ascending: string[];
  /** オクターブ上の主音〜主音（8音。最高音は上行の最後と2回）。短調は上行の逆順ではない */
  descending: string[];
}

export interface InstrumentScales {
  instrument: InstrumentId;
  clef: Clef;
  /** キーは実音の調の id（'C_major' など） */
  scales: Record<string, ScaleEntry>;
}
