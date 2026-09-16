// 実音の調と楽器の移調から、記譜上の理論音列を MIDI 番号で導く。
// データ検証（SPEC 10.2）専用で、表示には使わない（楽譜データは PDF から転記する）。
import type { Instrument } from '../data/instruments.ts';
import type { Mode, ScaleKey } from '../data/keys.ts';

export interface ScaleMidi {
  /** 主音〜オクターブ上の主音（8音） */
  ascending: number[];
  /** オクターブ上の主音〜主音（8音）。最高音は上行の最後と同じ音（PDF と同じく2回鳴らす） */
  descending: number[];
}

// 主音からの半音数。短調は上行＝旋律的短音階、下行＝自然短音階
const ASCENDING: Record<Mode, readonly number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11, 12],
  minor: [0, 2, 3, 5, 7, 9, 11, 12],
};
const DESCENDING: Record<Mode, readonly number[]> = {
  major: [12, 11, 9, 7, 5, 4, 2, 0],
  minor: [12, 10, 8, 7, 5, 3, 2, 0],
};

const mod12 = (n: number) => ((n % 12) + 12) % 12;

/** 記譜上の主音のピッチクラス（0〜11）。実音 = 記譜 + transposition */
export function writtenTonicPitchClass(key: ScaleKey, instrument: Instrument): number {
  return mod12(key.tonicMidiClass - instrument.transposition);
}

/**
 * 記譜上の理論音列。出発オクターブは楽器ごとに PDF で決まっていて理論からは導けないため、
 * nearMidi（転記データの1音目など）に最も近い主音から始める（上下に等距離なら低い方）。
 */
export function theoreticalWrittenScale(key: ScaleKey, instrument: Instrument, nearMidi: number): ScaleMidi {
  const below = nearMidi - mod12(nearMidi - writtenTonicPitchClass(key, instrument));
  const tonic = nearMidi - below > 6 ? below + 12 : below;
  return {
    ascending: ASCENDING[key.mode].map((s) => tonic + s),
    descending: DESCENDING[key.mode].map((s) => tonic + s),
  };
}
