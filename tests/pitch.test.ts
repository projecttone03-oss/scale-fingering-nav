import { describe, expect, it } from 'vitest';
import { midiToFreq, parsePitch } from '../src/music/pitch.ts';

describe('parsePitch', () => {
  it.each([
    ['C4', 60],
    ['Bb3', 58],
    ['Fx5', 79],
    ['Cb5', 71],
    ['F#5', 78],
    ['B#4', 72],
    ['Bbb3', 57],
    ['A4', 69],
    ['C0', 12],
  ])('%s → MIDI %i', (str, midi) => {
    expect(parsePitch(str).midi).toBe(midi);
  });

  it('文字・変化記号・オクターブを綴りどおりに返す', () => {
    expect(parsePitch('Fx5')).toEqual({ letter: 'F', accidental: 'x', octave: 5, midi: 79 });
    expect(parsePitch('Cb5')).toEqual({ letter: 'C', accidental: 'b', octave: 5, midi: 71 });
    expect(parsePitch('E4')).toEqual({ letter: 'E', accidental: '', octave: 4, midi: 64 });
  });

  it.each(['', 'C', 'H4', 'c4', 'C#', 'C##4', 'C♯4', 'Cx#4', 'C10', ' C4'])('不正な表記 "%s" は例外', (str) => {
    expect(() => parsePitch(str)).toThrow();
  });
});

describe('midiToFreq', () => {
  it('A4 = 440 Hz を基準にした平均律', () => {
    expect(midiToFreq(69)).toBe(440);
    expect(midiToFreq(81)).toBe(880);
    expect(midiToFreq(57)).toBe(220);
    expect(midiToFreq(60)).toBeCloseTo(261.6256, 3);
  });
});
