import { describe, expect, it } from 'vitest';
import { INSTRUMENTS, getInstrument } from '../src/data/instruments.ts';
import { SCALE_KEYS, getScaleKey } from '../src/data/keys.ts';
import { parsePitch } from '../src/music/pitch.ts';
import { theoreticalWrittenScale, writtenTonicPitchClass } from '../src/music/theory.ts';

const midis = (pitches: string) => pitches.split(' ').map((p) => parsePitch(p).midi);

describe('theoreticalWrittenScale', () => {
  const flute = getInstrument('flute');

  it('フルート ハ長調', () => {
    expect(theoreticalWrittenScale(getScaleKey('C_major'), flute, 72)).toEqual({
      ascending: midis('C5 D5 E5 F5 G5 A5 B5 C6'),
      descending: midis('B5 A5 G5 F5 E5 D5 C5'),
    });
  });

  it('フルート ハ短調（上行＝旋律的短音階、下行＝自然短音階）', () => {
    expect(theoreticalWrittenScale(getScaleKey('C_minor'), flute, 72)).toEqual({
      ascending: midis('C5 D5 Eb5 F5 G5 A5 B5 C6'),
      descending: midis('Bb5 Ab5 G5 F5 Eb5 D5 C5'),
    });
  });

  it('フルート 嬰ト短調（上行7音目は Fx）', () => {
    expect(theoreticalWrittenScale(getScaleKey('Gs_minor'), flute, 68)).toEqual({
      ascending: midis('G#4 A#4 B4 C#5 D#5 E#5 Fx5 G#5'),
      descending: midis('F#5 E5 D#5 C#5 B4 A#4 G#4'),
    });
  });

  it('B♭トランペット 実音ハ長調 → 記譜ニ長調', () => {
    expect(theoreticalWrittenScale(getScaleKey('C_major'), getInstrument('bb_trumpet'), 62)).toEqual({
      ascending: midis('D4 E4 F#4 G4 A4 B4 C#5 D5'),
      descending: midis('C#5 B4 A4 G4 F#4 E4 D4'),
    });
  });

  it('出発音は nearMidi に最も近い主音（等距離なら低い方）', () => {
    const cMajor = getScaleKey('C_major');
    const start = (near: number) => theoreticalWrittenScale(cMajor, flute, near).ascending[0];
    expect(start(60)).toBe(60);
    expect(start(59)).toBe(60);
    expect(start(65)).toBe(60);
    expect(start(66)).toBe(60);
    expect(start(67)).toBe(72);
    expect(start(54)).toBe(48);
  });

  it.each(SCALE_KEYS.flatMap((k) => INSTRUMENTS.map((i) => [k.id, i.id, k, i] as const)))(
    '%s × %s：15音の形と実音の主音',
    (_, __, key, instrument) => {
      const { ascending, descending } = theoreticalWrittenScale(key, instrument, 60);
      expect(ascending).toHaveLength(8);
      expect(descending).toHaveLength(7);
      const line = [...ascending, ...descending];
      for (let i = 1; i < 8; i++) expect(line[i]!).toBeGreaterThan(line[i - 1]!);
      for (let i = 8; i < 15; i++) expect(line[i]!).toBeLessThan(line[i - 1]!);
      expect(ascending[7]! - ascending[0]!).toBe(12);
      expect(descending[6]).toBe(ascending[0]);
      expect((((ascending[0]! + instrument.transposition) % 12) + 12) % 12).toBe(key.tonicMidiClass);
    },
  );
});

describe('writtenTonicPitchClass', () => {
  it.each([
    ['C_major', 'bb_trumpet', 'D'],
    ['C_major', 'f_horn', 'G'],
    ['F_major', 'f_horn', 'C'],
    ['Gb_major', 'alto_sax', 'Eb'],
    ['Eb_major', 'baritone_sax', 'C'],
    ['Bb_major', 'tenor_sax', 'C'],
    ['Bb_major', 'bass_clarinet', 'C'],
    ['C_minor', 'piccolo', 'C'],
    ['Fs_minor', 'string_bass', 'F#'],
  ] as const)('実音 %s の %s は記譜 %s', (keyId, instrumentId, writtenTonic) => {
    const pc = writtenTonicPitchClass(getScaleKey(keyId), getInstrument(instrumentId));
    expect(pc).toBe(parsePitch(`${writtenTonic}4`).midi % 12);
  });
});
