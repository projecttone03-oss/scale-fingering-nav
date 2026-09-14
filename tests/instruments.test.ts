import { describe, expect, it } from 'vitest';
import { INSTRUMENTS, getInstrument, type InstrumentId } from '../src/data/instruments.ts';
import { parsePitch } from '../src/music/pitch.ts';

describe('INSTRUMENTS', () => {
  it('15楽器を PDF と同じ順に持つ', () => {
    expect(INSTRUMENTS.map((i) => i.id)).toEqual([
      'piccolo',
      'flute',
      'oboe',
      'bassoon',
      'bb_clarinet',
      'bass_clarinet',
      'alto_sax',
      'tenor_sax',
      'baritone_sax',
      'bb_trumpet',
      'f_horn',
      'trombone',
      'euphonium',
      'tuba',
      'string_bass',
    ]);
  });

  it('getInstrument は id で引ける', () => {
    expect(getInstrument('bb_trumpet').nameJa).toBe('B♭トランペット');
  });
});

describe('移調（実音 = 記譜 + transposition）', () => {
  // 各楽器の記譜 C が実音で何の音になるか（楽器の一般的な移調から独立に書いた期待値）
  const cases: Record<InstrumentId, [written: string, concert: string]> = {
    piccolo: ['C5', 'C6'],
    flute: ['C5', 'C5'],
    oboe: ['C5', 'C5'],
    bassoon: ['C3', 'C3'],
    bb_clarinet: ['C5', 'Bb4'],
    bass_clarinet: ['C5', 'Bb3'],
    alto_sax: ['C5', 'Eb4'],
    tenor_sax: ['C5', 'Bb3'],
    baritone_sax: ['C5', 'Eb3'],
    bb_trumpet: ['C5', 'Bb4'],
    f_horn: ['C5', 'F4'],
    trombone: ['C3', 'C3'],
    euphonium: ['C3', 'C3'],
    tuba: ['C2', 'C2'],
    string_bass: ['C3', 'C2'],
  };

  it('全楽器に期待値がある', () => {
    expect(Object.keys(cases).sort()).toEqual(INSTRUMENTS.map((i) => i.id).sort());
  });

  it.each(INSTRUMENTS.map((i) => [i.nameJa, i] as const))('%s', (_, instrument) => {
    const [written, concert] = cases[instrument.id];
    expect(parsePitch(written).midi + instrument.transposition).toBe(parsePitch(concert).midi);
  });
});
