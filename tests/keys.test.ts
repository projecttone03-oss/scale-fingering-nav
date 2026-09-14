import { describe, expect, it } from 'vitest';
import { SCALE_KEYS, getScaleKey } from '../src/data/keys.ts';
import { parsePitch } from '../src/music/pitch.ts';

describe('SCALE_KEYS', () => {
  it('PDF 掲載順（長調12 → 短調12）で並ぶ', () => {
    expect(SCALE_KEYS.map((k) => k.id)).toEqual([
      ...['C', 'G', 'F', 'D', 'Bb', 'A', 'Eb', 'E', 'Ab', 'B', 'Db', 'Gb'].map((t) => `${t}_major`),
      ...['C', 'G', 'F', 'D', 'Bb', 'A', 'Eb', 'E', 'Gs', 'B', 'Cs', 'Fs'].map((t) => `${t}_minor`),
    ]);
    expect(SCALE_KEYS.map((k) => k.order)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
  });

  it('mode は id の接尾辞と一致する', () => {
    for (const key of SCALE_KEYS) expect(key.id.endsWith(`_${key.mode}`)).toBe(true);
  });

  it.each(SCALE_KEYS.map((k) => [k.id, k] as const))('%s の主音ピッチクラスが id の綴りと一致する', (_, key) => {
    const tonic = key.id.split('_')[0]!.replace(/s$/, '#');
    expect(parsePitch(`${tonic}4`).midi % 12).toBe(key.tonicMidiClass);
  });

  it('表記（ロは H Major / H Minor）', () => {
    expect(getScaleKey('C_major')).toMatchObject({ nameJa: 'ハ長調', nameEn: 'C Major' });
    expect(getScaleKey('B_major')).toMatchObject({ nameJa: 'ロ長調', nameEn: 'H Major' });
    expect(getScaleKey('B_minor')).toMatchObject({ nameJa: 'ロ短調', nameEn: 'H Minor' });
    expect(getScaleKey('Gs_minor')).toMatchObject({ nameJa: '嬰ト短調', nameEn: 'G♯ Minor' });
    expect(getScaleKey('Gb_major')).toMatchObject({ nameJa: '変ト長調', nameEn: 'G♭ Major' });
  });

  it('未定義の id は例外', () => {
    expect(() => getScaleKey('H_major')).toThrow();
  });
});
