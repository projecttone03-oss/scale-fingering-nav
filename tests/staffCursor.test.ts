import { describe, expect, it } from 'vitest';
import { noteIndexAt, staveAt, type NoteSpan } from '../src/ui/staffCursor.ts';

// 上段の音符 0〜2 と下段の音符 8〜9（SVG の座標。範囲はハイライトの背景の左右）
const SPANS: NoteSpan[] = [
  { index: 0, stave: 0, left: 150, right: 180 },
  { index: 1, stave: 0, left: 210, right: 240 },
  { index: 2, stave: 0, left: 270, right: 300 },
  { index: 8, stave: 1, left: 120, right: 150 },
  { index: 9, stave: 1, left: 200, right: 230 },
];
const UPPER = 60;
const LOWER = 180;

describe('五線譜のカーソル：バーの位置 → 選ぶ音（SPEC 2.5）', () => {
  it('バーが音符の範囲に重なっていれば、その音', () => {
    expect(noteIndexAt(SPANS, 165, UPPER)).toBe(0);
    expect(noteIndexAt(SPANS, 210, UPPER)).toBe(1);
    expect(noteIndexAt(SPANS, 300, UPPER)).toBe(2);
  });

  it('音符と音符の間では、範囲が近いほうの音（音符を正確に狙わなくてよい）', () => {
    expect(noteIndexAt(SPANS, 190, UPPER)).toBe(0);
    expect(noteIndexAt(SPANS, 201, UPPER)).toBe(1);
  });

  it('音部記号・調号の上（最初の音符より左）は最初の音、最後の音符より右は最後の音', () => {
    expect(noteIndexAt(SPANS, 5, UPPER)).toBe(0);
    expect(noteIndexAt(SPANS, 499, UPPER)).toBe(2);
  });

  it('上段・下段は指の高さで決まる。五線譜の外に出ても近いほうの段', () => {
    expect(noteIndexAt(SPANS, 165, LOWER)).toBe(8);
    expect(noteIndexAt(SPANS, 220, LOWER)).toBe(9);
    expect(staveAt(-30)).toBe(0);
    expect(staveAt(119)).toBe(0);
    expect(staveAt(120)).toBe(1);
    expect(staveAt(400)).toBe(1);
  });

  it('その段に音符がなければ null', () => {
    expect(noteIndexAt(SPANS.filter((s) => s.stave === 0), 100, LOWER)).toBeNull();
  });
});
