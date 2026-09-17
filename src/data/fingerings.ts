// 運指データ（src/data/fingerings/<instrumentId>.json）の型（SPEC 4.6）。
import type { Family, InstrumentId } from './instruments.ts';

interface FingeringBase {
  /** 同じ音の中で一意。主運指は "std" */
  id: string;
  /** 同じ音の中でちょうど1つだけ true */
  isPrimary: boolean;
  confidence: 'verified' | 'conflict';
  sources: string[];
  /**
   * データには残すが、アプリでは表示しない代替運指（SPEC 4.6）。
   * 例：B♭トランペットの第7倍音の運指（音程が低く、生徒が混乱するため）。主運指には付けない
   */
  hidden?: boolean;
}

/** 木管：押さえるキー（テンプレート SVG の id） */
export interface WoodwindFingering extends FingeringBase {
  keys: string[];
}

/** 金管（バルブ）：押すバルブの番号。Fホルンだけ crook を持つ */
export interface ValveFingering extends FingeringBase {
  valves: number[];
  crook?: 'F' | 'Bb';
}

/** トロンボーン：ポジション 1〜7 */
export interface SlideFingering extends FingeringBase {
  position: number;
}

/** ストリングベース：弦・ポジション・指番号 */
export interface StringFingering extends FingeringBase {
  string: 'E' | 'A' | 'D' | 'G';
  position: string;
  finger: number;
}

export type FingeringEntry = WoodwindFingering | ValveFingering | SlideFingering | StringFingering;

export interface InstrumentFingerings {
  instrument: InstrumentId;
  family: Family;
  /** 運指データのある音域（記譜） */
  range: { lowest: string; highest: string };
  /** キーは記譜の MIDI 番号（文字列）。同じ音高なら綴りが違っても運指は同じ */
  entries: Record<string, FingeringEntry[]>;
}

/** その音の運指（主運指を先頭に、あとはデータの順）。hidden のエントリも含むすべて。データがなければ空 */
export function fingeringsFor(data: InstrumentFingerings, writtenMidi: number): FingeringEntry[] {
  const entries = data.entries[String(writtenMidi)] ?? [];
  return [...entries].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
}

/**
 * アプリで表示する運指（SPEC 2.6）。主運指を先頭に、「別の運指を表示」がオンのときだけ代替運指を続ける。
 * hidden の代替運指は、オンでも表示しない
 */
export function displayedFingerings(data: InstrumentFingerings, writtenMidi: number, showAlternates: boolean): FingeringEntry[] {
  return fingeringsFor(data, writtenMidi).filter((entry) => entry.isPrimary || (showAlternates && !entry.hidden));
}
