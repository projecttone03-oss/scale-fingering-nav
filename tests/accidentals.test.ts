import { describe, expect, it } from 'vitest';
import { accidentalMarks, keySignatureAccidental } from '../src/music/accidentals.ts';

const line = (ascending: string, descending: string) => [...ascending.split(' '), ...descending.split(' ')];

describe('accidentalMarks', () => {
  it('ハ長調：臨時記号なし', () => {
    const pitches = line('C5 D5 E5 F5 G5 A5 B5 C6', 'C6 B5 A5 G5 F5 E5 D5 C5');
    expect(accidentalMarks(0, pitches)).toEqual(Array(16).fill(null));
  });

  it('ハ短調：上行 A♮ B♮、下行 B♭ A♭ に記号', () => {
    const pitches = line('C5 D5 Eb5 F5 G5 A5 B5 C6', 'C6 Bb5 Ab5 G5 F5 Eb5 D5 C5');
    expect(accidentalMarks(-3, pitches)).toEqual([
      // 上行 C D E♭ F G A B C
      null, null, null, null, null, 'natural', 'natural', null,
      // 下行 C B♭ A♭ G F E♭ D C（最高音 C は上行と同じ変化記号なので記号なし）
      null, 'flat', 'flat', null, null, null, null, null,
    ]);
  });

  it('嬰ト短調：上行 E♯ Fx、下行 F♯ E♮ に記号', () => {
    const pitches = line('G#4 A#4 B4 C#5 D#5 E#5 Fx5 G#5', 'G#5 F#5 E5 D#5 C#5 B4 A#4 G#4');
    expect(accidentalMarks(5, pitches)).toEqual([
      // 上行 G♯ A♯ B C♯ D♯ E♯ Fx G♯
      null, null, null, null, null, 'sharp', 'doubleSharp', null,
      // 下行 G♯ F♯ E D♯ C♯ B A♯ G♯
      null, 'sharp', 'natural', null, null, null, null, null,
    ]);
  });

  it('ダブルフラットにも対応する', () => {
    expect(accidentalMarks(-6, ['Bbb4'])).toEqual(['doubleFlat']);
  });
});

describe('keySignatureAccidental', () => {
  it('♯系は F C G D A E B の順に付く', () => {
    expect(keySignatureAccidental(3, 'G')).toBe('#');
    expect(keySignatureAccidental(3, 'D')).toBe('');
    expect(keySignatureAccidental(7, 'B')).toBe('#');
  });

  it('♭系は B E A D G C F の順に付く', () => {
    expect(keySignatureAccidental(-2, 'E')).toBe('b');
    expect(keySignatureAccidental(-2, 'A')).toBe('');
    expect(keySignatureAccidental(-7, 'F')).toBe('b');
  });

  it('調号なしはすべてナチュラル', () => {
    for (const letter of ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const) {
      expect(keySignatureAccidental(0, letter)).toBe('');
    }
  });

  it.each([8, -8, 1.5])('範囲外の調号 %d は例外', (sig) => {
    expect(() => keySignatureAccidental(sig, 'C')).toThrow(RangeError);
  });
});
