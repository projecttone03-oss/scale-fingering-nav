import { describe, expect, it } from 'vitest';
import trumpet from '../src/data/scales/bb_trumpet.json';
import type { InstrumentScales } from '../src/data/scales.ts';
import {
  applyStaffHighlight,
  renderScaleStaves,
  renderStave,
  staffStep,
  stemEndY,
  type NoteValue,
} from '../src/render/staff.ts';

const scales = (trumpet as InstrumentScales).scales;

/** 音符ごとの属性と中身（次の音符の手前まで） */
function notesOf(svg: string) {
  return svg
    .split('<g class="note" ')
    .slice(1)
    .map((segment) => {
      const attrs = /^data-index="(\d+)" data-pitch="([^"]+)"(?: data-accidental="([^"]+)")?>/.exec(segment)!;
      const stem = /class="stem" d="M([\d.]+) ([\d.]+)V([\d.]+)"/.exec(segment);
      const ledgers = /<g class="ledgers"><path d="([^"]+)"/.exec(segment);
      const head = /<text class="glyph (notehead\w+) head" x="([\d.]+)" y="([\d.]+)"/.exec(segment)!;
      return {
        index: Number(attrs[1]),
        pitch: attrs[2],
        accidental: attrs[3] ?? null,
        stemDirection: stem ? (Number(stem[3]) > Number(stem[2]) ? 'down' : 'up') : null,
        stem: stem ? { x: Number(stem[1]), y1: Number(stem[2]), y2: Number(stem[3]) } : null,
        ledgerCount: ledgers ? ledgers[1]!.split('H').length - 1 : 0,
        head: { glyph: head[1], x: Number(head[2]), y: Number(head[3]) },
      };
    });
}

/** 段の座標：第1線 = 80、第3線（中央線）= 60、第5線 = 40。1段 = 線間隔の半分 = 5 */
const MIDDLE_Y = 60;
const quarterNotes = (pitches: string[], clef: 'treble' | 'bass' = 'treble') =>
  notesOf(
    renderStave(
      pitches.map((pitch, index) => ({ pitch, index, accidental: null })),
      { clef, keySignature: 0, noteValue: 'quarter' },
    ),
  );

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
    ['whole', 0, 'noteheadWhole'],
    ['half', 16, 'noteheadHalf'],
    ['quarter', 16, 'noteheadBlack'],
  ] as [NoteValue, number, string][])('%s：符幹 %i 本、符頭は Bravura の %s', (value, stems, glyph) => {
    const svg = renderScaleStaves(scales.C_major!, 'treble', value);
    expect(count(svg, 'class="stem"')).toBe(stems);
    expect(new Set(notesOf(svg).map((n) => n.head.glyph))).toEqual(new Set([glyph]));
  });

  it('符幹は第3線（中央線）上とそれより高い音が下向き、低い音が上向き', () => {
    const upper = notesOf(renderScaleStaves(scales.C_major!, 'treble', 'quarter')).slice(0, 8);
    expect(upper.map((n) => [n.pitch, n.stemDirection])).toEqual([
      ['D4', 'up'],
      ['E4', 'up'],
      ['F#4', 'up'],
      ['G4', 'up'],
      ['A4', 'up'],
      ['B4', 'down'],
      ['C#5', 'down'],
      ['D5', 'down'],
    ]);
  });
});

describe('符幹の長さ（PDF の記譜に合わせる）', () => {
  // PDF で確認した音：6ページ G5・B♭5・C6（下向き）、5ページ F♯3・C♯4・F♯4（上向き）
  it.each([
    ['G5', 70, '3.5 線間（第2線まで）'],
    ['Bb5', MIDDLE_Y, '3.5 線間でちょうど第3線'],
    ['C6', MIDDLE_Y, '3.5 線間では届かないので第3線まで伸ばす'],
    ['E6', MIDDLE_Y, '第3線まで伸ばす'],
    ['F#3', MIDDLE_Y, '第3線まで伸ばす'],
    ['C#4', 55, '3.5 線間（第3線を越える）'],
    ['F#4', 40, '3.5 線間'],
  ])('%s の符幹の先端は y=%i（%s）', (pitch, endY) => {
    const [note] = quarterNotes([pitch]);
    expect(note!.stem!.y2).toBeCloseTo(endY, 5);
  });

  it('ヘ音記号でも同じ規則（G4 は上第3線 → 第3線まで、E2 は下第1線 → 3.5 線間）', () => {
    const [high, low] = quarterNotes(['G4', 'E2'], 'bass');
    expect(high!.stem!.y2).toBeCloseTo(MIDDLE_Y, 5);
    expect(low!.stem!.y2).toBeCloseTo(90 - 35, 5);
  });

  it('stemEndY：第3線上の音は下向きに 3.5 線間', () => {
    expect(stemEndY(4)).toBe(MIDDLE_Y + 35);
  });

  // PDF の実測（符幹の先端が第3線でそろい、長さは第3線までの距離ぶん伸びる）
  // 符幹の長さ = 符頭の中心（y）から先端まで。1 線間 = 10
  const stemLength = (n: ReturnType<typeof notesOf>[number]) => Math.abs(n.stem!.y2 - n.head.y) / 10;

  it.each([
    ['A3', 4],
    ['Ab3', 4],
    ['G3', 4.5],
    ['F#3', 5],
  ])('トランペット譜 5ページ：%s は先端が第3線、長さ %f 線間', (pitch, length) => {
    const [note] = quarterNotes([pitch]);
    expect(note!.stemDirection).toBe('up');
    expect(note!.stem!.y2).toBeCloseTo(MIDDLE_Y, 5);
    expect(stemLength(note!)).toBeCloseTo(length, 5);
  });

  it.each([
    ['E4', 4],
    ['F4', 4.5],
    ['G4', 5],
    ['A4', 5.5],
  ])('トロンボーン譜 5〜6ページ（ヘ音記号）：%s は先端が第3線、長さ %f 線間', (pitch, length) => {
    const [note] = quarterNotes([pitch], 'bass');
    expect(note!.stemDirection).toBe('down');
    expect(note!.stem!.y2).toBeCloseTo(MIDDLE_Y, 5);
    expect(stemLength(note!)).toBeCloseTo(length, 5);
  });

  it('高さの違う遠い音は、先端が同じ第3線で、長さは音ごとに違う', () => {
    const notes = quarterNotes(['A3', 'G3', 'F#3']);
    expect(new Set(notes.map((n) => n.stem!.y2))).toEqual(new Set([MIDDLE_Y]));
    expect(notes.map(stemLength)).toEqual([4, 4.5, 5]);
  });
});

describe('線の太さ（Bravura の推奨値）', () => {
  const svg = renderStave([{ pitch: 'C4', index: 0, accidental: null }], { clef: 'treble', keySignature: 0, noteValue: 'quarter' });

  it('五線 0.13 線間、加線 0.16 線間、符幹 0.12 線間', () => {
    expect(/<g class="staff-lines"><path [^>]*stroke-width="([\d.]+)"/.exec(svg)![1]).toBe('1.3');
    expect(/<g class="ledgers"><path [^>]*stroke-width="([\d.]+)"/.exec(svg)![1]).toBe('1.6');
    expect(/class="stem" [^>]*stroke-width="([\d.]+)"/.exec(svg)![1]).toBe('1.2');
  });
});

describe('符頭と符幹の接続（SMuFL の anchor）', () => {
  const [up, down] = quarterNotes(['E4', 'F5']);

  it('上向き：符幹の右端が符頭の右端（stemUpSE の x 1.18）、下端が中心から 0.168 線間上', () => {
    const thickness = 1.2;
    expect(up!.stem!.x + thickness / 2).toBeCloseTo(up!.head.x + 11.8, 1);
    expect(up!.stem!.y1).toBeCloseTo(up!.head.y - 1.68, 1);
  });

  it('下向き：符幹の左端が符頭の左端（stemDownNW の x 0）、上端が中心から 0.168 線間下', () => {
    const thickness = 1.2;
    expect(down!.stem!.x - thickness / 2).toBeCloseTo(down!.head.x, 1);
    expect(down!.stem!.y1).toBeCloseTo(down!.head.y + 1.68, 1);
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

  it.each([
    ['treble', 'gClef', 2.684],
    ['bass', 'fClef', 2.736],
  ] as const)('%s：音部記号の右端と調号のすき間は 0.42 線間', (clef, clefGlyph, clefWidth) => {
    const svg = renderStave([], { clef, keySignature: 1, noteValue: 'half' });
    const clefX = Number(new RegExp(`class="glyph ${clefGlyph}" x="([\\d.]+)"`).exec(svg)![1]);
    const sharpX = Number(/class="glyph sharp" x="([\d.]+)"/.exec(svg)![1]);
    expect(sharpX - (clefX + clefWidth * 10)).toBeCloseTo(4.2, 1);
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
