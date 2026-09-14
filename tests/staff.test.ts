import { describe, expect, it } from 'vitest';
import trumpet from '../src/data/scales/bb_trumpet.json';
import type { InstrumentScales } from '../src/data/scales.ts';
import { applyStaffHighlight, renderScaleStaves, renderStave, staffStep, type NoteValue } from '../src/render/staff.ts';

const scales = (trumpet as InstrumentScales).scales;

/** 音符ごとの属性と中身（次の音符の手前まで） */
function notesOf(svg: string) {
  return svg
    .split('<g class="note" ')
    .slice(1)
    .map((segment) => {
      const attrs = /^data-index="(\d+)" data-pitch="([^"]+)"(?: data-accidental="([^"]+)")?>/.exec(segment)!;
      const stem = /class="stem" d="M[\d.]+ ([\d.]+)V([\d.]+)"/.exec(segment);
      const ledgers = /<g class="ledgers"><path d="([^"]+)"/.exec(segment);
      const head = /class="head" d="([^"]+)"/.exec(segment)!;
      return {
        index: Number(attrs[1]),
        pitch: attrs[2],
        accidental: attrs[3] ?? null,
        stemDirection: stem ? (Number(stem[2]) > Number(stem[1]) ? 'down' : 'up') : null,
        ledgerCount: ledgers ? ledgers[1]!.split('H').length - 1 : 0,
        headSubpaths: head[1]!.split('M').length - 1,
      };
    });
}

const count = (s: string, sub: string) => s.split(sub).length - 1;

describe('staffStep（第1線 = 0）', () => {
  it.each([
    ['E4', 'treble', 0],
    ['F5', 'treble', 8],
    ['B4', 'treble', 4],
    ['D4', 'treble', -1],
    ['C4', 'treble', -2],
    ['Cb5', 'treble', 5],
    ['G2', 'bass', 0],
    ['A3', 'bass', 8],
  ] as const)('%s（%s）→ %i', (pitch, clef, step) => {
    expect(staffStep(pitch, clef)).toBe(step);
  });
});

describe('renderScaleStaves：B♭トランペット', () => {
  it('2段に8音ずつ。最高音は両段に描き、どちらも data-index 7', () => {
    const notes = notesOf(renderScaleStaves(scales.C_major!, 'treble', 'half'));
    expect(notes.map((n) => n.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 7, 8, 9, 10, 11, 12, 13, 14]);
    expect(notes.map((n) => n.pitch)).toEqual([
      ...['D4', 'E4', 'F#4', 'G4', 'A4', 'B4', 'C#5', 'D5'],
      ...['D5', 'C#5', 'B4', 'A4', 'G4', 'F#4', 'E4', 'D4'],
    ]);
  });

  it('ハ長調（記譜ニ長調）：調号 ♯2つ、臨時記号なし', () => {
    const svg = renderScaleStaves(scales.C_major!, 'treble', 'half');
    expect(count(svg, 'class="glyph sharp"')).toBe(2 * 2);
    expect(notesOf(svg).filter((n) => n.accidental)).toEqual([]);
  });

  it('ハ短調（記譜ニ短調）：上行 B♮ C♯、下行 C♮ B♭ に記号（SPEC 5.3）', () => {
    const svg = renderScaleStaves(scales.C_minor!, 'treble', 'half');
    const marked = notesOf(svg)
      .filter((n) => n.accidental)
      .map((n) => [n.index, n.pitch, n.accidental]);
    expect(marked).toEqual([
      [5, 'B4', 'natural'],
      [6, 'C#5', 'sharp'],
      [8, 'C5', 'natural'],
      [9, 'Bb4', 'flat'],
    ]);
    // 調号の ♭1つ×2段 ＋ 下行 B♭ の記号
    expect(count(svg, 'class="glyph flat"')).toBe(3);
  });

  it.each([
    ['whole', 0, 2],
    ['half', 16, 2],
    ['quarter', 16, 1],
  ] as [NoteValue, number, number][])('%s：符幹 %i 本、符頭のパス %i 個（白抜きは2個）', (value, stems, subpaths) => {
    const svg = renderScaleStaves(scales.C_major!, 'treble', value);
    expect(count(svg, 'class="stem"')).toBe(stems);
    expect(new Set(notesOf(svg).map((n) => n.headSubpaths))).toEqual(new Set([subpaths]));
  });

  it('符幹は中央線より上の音だけ下向き', () => {
    const upper = notesOf(renderScaleStaves(scales.C_major!, 'treble', 'quarter')).slice(0, 8);
    expect(upper.map((n) => [n.pitch, n.stemDirection])).toEqual([
      ['D4', 'up'],
      ['E4', 'up'],
      ['F#4', 'up'],
      ['G4', 'up'],
      ['A4', 'up'],
      ['B4', 'up'],
      ['C#5', 'down'],
      ['D5', 'down'],
    ]);
  });
});

describe('renderStave', () => {
  it('五線の外の音に加線を引く（2段ごと）', () => {
    const pitches = ['D4', 'C4', 'A3', 'G5', 'A5', 'C6'];
    const svg = renderStave(
      pitches.map((pitch, index) => ({ pitch, index, accidental: null })),
      { clef: 'treble', keySignature: 0, noteValue: 'whole' },
    );
    expect(notesOf(svg).map((n) => n.ledgerCount)).toEqual([0, 1, 2, 0, 1, 2]);
  });

  it('調号の数だけ記号を描く（ヘ音記号でも同じ）', () => {
    const svg = renderStave([], { clef: 'bass', keySignature: -5, noteValue: 'half' });
    expect(count(svg, 'class="glyph flat"')).toBe(5);
  });
});

describe('applyStaffHighlight', () => {
  // DOM を使わずに、querySelectorAll と classList だけを持つ偽の要素で確かめる
  const fakeNote = (index: number) => {
    const classes = new Set(['note']);
    return {
      dataset: { index: String(index) },
      classList: { toggle: (name: string, force: boolean) => (force ? classes.add(name) : classes.delete(name)) },
      classes,
    };
  };

  it('current / next の data-index だけにクラスを付ける（最高音は両段とも）', () => {
    const notes = [0, 1, 2, 3, 4, 5, 6, 7, 7, 8].map(fakeNote);
    const root = { querySelectorAll: () => notes } as unknown as ParentNode;

    applyStaffHighlight(root, 7, 8);
    expect(notes.map((n) => [...n.classes].filter((c) => c !== 'note').join())).toEqual([
      '', '', '', '', '', '', '', 'current', 'current', 'next',
    ]);

    applyStaffHighlight(root, null, 0);
    expect(notes.map((n) => [...n.classes].filter((c) => c !== 'note').join())).toEqual([
      'next', '', '', '', '', '', '', '', '', '',
    ]);
  });
});
