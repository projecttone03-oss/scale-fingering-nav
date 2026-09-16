// 音価と拍（4/4 拍子）。再生（scheduler.ts）と五線譜の小節線（staff.ts）で共通に使う（SPEC 5.6, 6.4）。

export type NoteValue = 'whole' | 'half' | 'quarter';

/** 1小節の拍数（4/4 拍子。1拍＝四分音符） */
export const BEATS_PER_BAR = 4;

/** 音価の拍数 */
export const BEATS_PER_NOTE: Record<NoteValue, number> = { whole: 4, half: 2, quarter: 1 };

/** 1小節に入る音符の数（全音符 1、二分音符 2、四分音符 4） */
export function notesPerBar(value: NoteValue): number {
  return BEATS_PER_BAR / BEATS_PER_NOTE[value];
}
