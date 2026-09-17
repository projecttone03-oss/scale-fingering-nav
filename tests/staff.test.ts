import { describe, expect, it } from 'vitest';
import trumpet from '../src/data/scales/bb_trumpet.json';
import type { InstrumentScales } from '../src/data/scales.ts';
import {
  SNIPPET_HEIGHT,
  SNIPPET_WIDTH,
  STAVE_HEIGHT,
  STAVE_WIDTH,
  applyStaffHighlight,
  layoutNotes,
  renderScaleStaves,
  renderSnippet,
  renderStave,
  staffStep,
  stemEndY,
  type NoteValue,
  type StaveNote,
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
  it('2段に8音ずつ（計16音）。最高音は上段の最後（7）と下段の最初（8）の2か所', () => {
    const notes = notesOf(renderScaleStaves(scales.C_major!, 'treble', 'half'));
    expect(notes.map((n) => n.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
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
      [9, 'C5', 'natural'],
      [10, 'Bb4', 'flat'],
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

describe('拍子記号・小節線・終止線（SPEC 5.6）', () => {
  const W = STAVE_WIDTH;
  /** 2段の SVG を上段・下段に分ける */
  const staves = (svg: string) => {
    const parts = svg.split('<g class="stave"');
    return { upper: parts[1]!, lower: parts[2]! };
  };
  const barlineXs = (svg: string, cls = 'barline') =>
    [...svg.matchAll(new RegExp(`<path class="${cls}" d="M([\\d.]+) 40V80" stroke="currentColor" stroke-width="([\\d.]+)"`, 'g'))].map(
      (m) => ({ x: Number(m[1]), width: Number(m[2]) }),
    );

  it('上段だけ、調号の右に拍子記号 4/4（上の4は第4線、下の4は第2線が中心）', () => {
    const { upper, lower } = staves(renderScaleStaves(scales.C_major!, 'treble', 'half'));
    const fours = [...upper.matchAll(/<text class="glyph timeSig4" x="([\d.]+)" y="([\d.]+)"/g)];
    expect(fours.map((m) => Number(m[2]))).toEqual([50, 70]);
    expect(lower).not.toContain('timeSig4');
    // 調号（♯2つ）の最後の記号の右端から 0.5 線間
    const sharps = [...upper.matchAll(/<text class="glyph sharp" x="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(Number(fours[0]![1])).toBeCloseTo(sharps.at(-1)! + 9.96 + 5, 1);
    // 音符は拍子記号の後から
    const firstHead = notesOf(upper)[0]!.head.x;
    expect(firstHead).toBeGreaterThan(Number(fours[0]![1]) + 18);
  });

  it.each([
    ['whole', 7],
    ['half', 3],
    ['quarter', 1],
  ] as [NoteValue, number][])('%s：4拍ごとに小節線（1段の途中に %i 本）。上段の終わりは細い小節線、下段の終わりは終止線', (value, inner) => {
    const { upper, lower } = staves(renderScaleStaves(scales.C_major!, 'treble', value));
    expect(barlineXs(upper)).toHaveLength(inner);
    expect(barlineXs(lower)).toHaveLength(inner);
    expect(barlineXs(upper, 'barline end')).toEqual([{ x: W - 0.8, width: 1.6 }]);
    expect(barlineXs(lower, 'barline end')).toEqual([]);
    // 終止線：細い線 0.16 ＋ 間隔 0.4 ＋ 太い線 0.5（線間隔単位）。太い線の右端が五線の右端
    expect(barlineXs(lower, 'barline final thick')).toEqual([{ x: W - 2.5, width: 5 }]);
    expect(barlineXs(lower, 'barline final thin')).toEqual([{ x: W - 5 - 4 - 0.8, width: 1.6 }]);
    expect(barlineXs(upper, 'barline final thick')).toEqual([]);
  });

  it.each(['whole', 'half', 'quarter'] as NoteValue[])(
    '%s：音符の間隔は一定。小節線は「間隔＋0.5」の位置、その 1.4 後に次の符頭（SPEC 5.7）',
    (value) => {
      const { upper } = staves(renderScaleStaves(scales.C_major!, 'treble', value));
      const heads = notesOf(upper).map((n) => n.head.x);
      const bars = barlineXs(upper).map((b) => b.x - 0.8); // 小節線の左端
      const perBar = { whole: 1, half: 2, quarter: 4 }[value];
      // 音符の間隔：最初の小節線の左端 − 0.5 線間 − その直前の符頭の左端
      const spacing = bars[0]! - 5 - heads[perBar - 1]!;
      let bar = 0;
      for (let i = 0; i < 7; i++) {
        if ((i + 1) % perBar === 0) {
          expect(bars[bar]!).toBeCloseTo(heads[i]! + spacing + 5, 1);
          expect(heads[i + 1]!).toBeCloseTo(bars[bar]! + 1.6 + 14, 1);
          bar++;
        } else {
          expect(heads[i + 1]! - heads[i]!).toBeCloseTo(spacing, 1);
        }
      }
      // 段の終わりの細い小節線も、最後の符頭の左端から「間隔＋0.5」
      expect(barlineXs(upper, 'barline end')[0]!.x - 0.8).toBeCloseTo(heads[7]! + spacing + 5, 1);
    },
  );

  it('最初の符頭は拍子記号の右端から 2.2 線間。下段は調号の右端から 2.2 線間', () => {
    const { upper, lower } = staves(renderScaleStaves(scales.C_major!, 'treble', 'half'));
    const tsX = Number(/<text class="glyph timeSig4" x="([\d.]+)"/.exec(upper)![1]);
    expect(notesOf(upper)[0]!.head.x).toBeCloseTo(tsX + 18 + 22, 1);
    const lastSharp = Math.max(...[...lower.matchAll(/<text class="glyph sharp" x="([\d.]+)"/g)].map((m) => Number(m[1])));
    expect(notesOf(lower)[0]!.head.x).toBeCloseTo(lastSharp + 9.96 + 22, 1);
  });

  it('臨時記号が付いても音符の間隔は変わらない（小節の中）', () => {
    // ハ短調（記譜ニ短調）・四分音符：上段2小節目の B♮4・C♯5 に臨時記号
    const { upper } = staves(renderScaleStaves(scales.C_minor!, 'treble', 'quarter'));
    const heads = notesOf(upper).map((n) => n.head.x);
    const inBar = [heads[1]! - heads[0]!, heads[2]! - heads[1]!, heads[5]! - heads[4]!, heads[6]! - heads[5]!, heads[7]! - heads[6]!];
    for (const d of inBar) expect(d).toBeCloseTo(inBar[0]!, 1);
  });

  it('小節線の直後の音符に臨時記号が付くときは、臨時記号と小節線のすき間を 0.4 線間以上あける', () => {
    // ハ短調・二分音符の下段：D5 C♮5 | B♭4 A4 …。B♭4 の ♭ は小節線の直後
    const { lower } = staves(renderScaleStaves(scales.C_minor!, 'treble', 'half'));
    const bar = barlineXs(lower)[0]!.x + 0.8; // 小節線の右端
    const flatX = Number(/<text class="glyph flat" x="([\d.]+)"/.exec(lower.split('data-index="10"')[1]!)![1]);
    expect(flatX - bar).toBeCloseTo(4, 1);
  });

  it('どの音符も、前の符頭とのすき間（臨時記号を含む）が 0.5 線間以上', () => {
    for (const key of ['C_major', 'C_minor'] as const) {
      for (const value of ['whole', 'half', 'quarter'] as NoteValue[]) {
        const svg = renderScaleStaves(scales[key]!, 'treble', value);
        for (const part of Object.values(staves(svg))) {
          const notes = notesOf(part);
          const headWidth = value === 'whole' ? 16.88 : 11.8;
          for (let i = 1; i < notes.length; i++) {
            const accX = /<text class="glyph (?:natural|sharp|flat)" x="([\d.]+)"/.exec(part.split(`data-index="${notes[i]!.index}"`)[1]!);
            const left = notes[i]!.accidental ? Number(accX![1]) : notes[i]!.head.x;
            expect(left - (notes[i - 1]!.head.x + headWidth)).toBeGreaterThanOrEqual(5 - 0.01);
          }
        }
      }
    }
  });

  it('最後の音符と終止線は重ならない', () => {
    for (const value of ['whole', 'half', 'quarter'] as NoteValue[]) {
      const { lower } = staves(renderScaleStaves(scales.C_minor!, 'treble', value));
      const last = notesOf(lower).at(-1)!;
      const headWidth = value === 'whole' ? 16.88 : 11.8;
      expect(last.head.x + headWidth).toBeLessThan(barlineXs(lower, 'barline final thin')[0]!.x - 0.8);
    }
  });

  it('renderStave は指定しなければ拍子記号・小節線を描かない（記号の見本・楽譜断片用）', () => {
    const svg = renderStave([{ pitch: 'D4', index: 0, accidental: null }], { clef: 'treble', keySignature: 2, noteValue: 'half' });
    expect(svg).not.toContain('timeSig4');
    expect(svg).not.toContain('class="barline');
  });
});

describe('段の幅と、収まらないときの縮め方（SPEC 5.7）', () => {
  const notes = (count: number, accidentals: Record<number, StaveNote['accidental']> = {}): StaveNote[] =>
    Array.from({ length: count }, (_, index) => ({ pitch: 'D4', index, accidental: accidentals[index] ?? null }));
  // 全音符8つ（1小節1音）の固定の間隔の合計：最初の符頭の前 ＋ 段の終わりの線の前 ＋ 小節線7本 ×（前 ＋ 太さ 1.6 ＋ 後）
  const FIXED_FULL = 22 + 5 + 7 * (5 + 1.6 + 14);
  const FIXED_FLOOR = 11 + 2.5 + 7 * (2.5 + 1.6 + 7);
  /** 全音符の最小の間隔：符頭の幅 1.688 線間 ＋ 0.5 線間 */
  const WHOLE_MINIMUM = 16.88 + 5;

  it('収まるときは PDF どおり（固定の間隔は縮めない）', () => {
    const layout = layoutNotes(notes(8), 'whole', 0, 8 * (WHOLE_MINIMUM + 1) + FIXED_FULL, 1);
    expect(layout.compression).toBe(1);
    expect(layout.spacing).toBeCloseTo(WHOLE_MINIMUM + 1, 5);
    expect(layout.heads[0]).toBeCloseTo(22, 5);
  });

  it('収まらないときは、固定の間隔を下限に向けて同じ割合で縮め、音符の間隔を最小の間隔にする', () => {
    // 固定の間隔を PDF の値と下限のちょうど中間まで縮めると収まる幅
    const endX = 8 * WHOLE_MINIMUM + (FIXED_FULL + FIXED_FLOOR) / 2;
    const { heads, bars, spacing, compression } = layoutNotes(notes(8), 'whole', 0, endX, 1);
    expect(compression).toBeCloseTo(0.5, 5);
    expect(spacing).toBeCloseTo(WHOLE_MINIMUM, 5);
    const beforeBar = 2.5 + 0.5 * (5 - 2.5);
    expect(heads[0]).toBeCloseTo(11 + 0.5 * (22 - 11), 5); // 最初の符頭の前
    for (let i = 0; i < 7; i++) {
      expect(bars[i]! - (heads[i]! + spacing)).toBeCloseTo(beforeBar, 5); // 小節線の前
      expect(heads[i + 1]! - (bars[i]! + 1.6)).toBeCloseTo(7 + 0.5 * (14 - 7), 5); // 小節線の後
    }
    // 段の終わりの線は、縮めても段の右端（endX）のまま
    expect(heads[7]! + spacing + beforeBar).toBeCloseTo(endX, 5);
  });

  it('下限まで縮めても収まらないときは、下限の間隔と最小の間隔で並べる（段の右端からはみ出す）', () => {
    const { heads, spacing, compression } = layoutNotes(notes(8), 'whole', 0, 200, 1);
    expect(compression).toBe(0);
    expect(spacing).toBeCloseTo(WHOLE_MINIMUM, 5);
    expect(heads[0]).toBeCloseTo(11, 5);
  });

  it('最小の間隔には、小節の中の音符に付く臨時記号の幅を含める', () => {
    // 四分音符（1小節4音）の3音目に ♯：符頭の幅 11.8 ＋ 0.5 線間 ＋ 臨時記号と符頭のすき間 3 ＋ ♯ の幅 9.96
    const { spacing, compression } = layoutNotes(notes(8, { 2: 'sharp' }), 'quarter', 0, 150, 4);
    expect(compression).toBe(0);
    expect(spacing).toBeCloseTo(11.8 + 5 + 3 + 9.96, 5);
  });

  // 調号7つの短調で最も幅をとる形：上行の6・7音目（全音符では小節線の直後）に、
  // ♯7 はダブルシャープ（例：嬰イ短調の F𝄪・G𝄪）、♭7 はナチュラル（例：変イ短調の F♮・G♮）が付く
  it.each([
    ['treble', 7, 'doubleSharp', 9.96],
    ['treble', -7, 'natural', 9.04],
    ['bass', 7, 'doubleSharp', 9.96],
    ['bass', -7, 'natural', 9.04],
  ] as const)('%s・調号 %i（%s 2つ）：幅 500 なら全音符の2段を PDF どおりの間隔で描ける', (clef, keySignature, accidental, sigWidth) => {
    expect(STAVE_WIDTH).toBe(500);
    const common = { clef, keySignature, noteValue: 'whole', notesPerBar: 1 } as const;
    const upper = renderStave(notes(8, { 5: accidental, 6: accidental }), { ...common, timeSignature: true, end: 'barline' });
    const tsX = Number(/<text class="glyph timeSig4" x="([\d.]+)"/.exec(upper)![1]);
    expect(notesOf(upper)[0]!.head.x).toBeCloseTo(tsX + 18 + 22, 1);

    const lower = renderStave(notes(8, { 1: accidental, 2: accidental }), { ...common, end: 'final' });
    const lastSig = Math.max(...[...lower.matchAll(/<text class="glyph (?:sharp|flat)" x="([\d.]+)"/g)].map((m) => Number(m[1])));
    expect(notesOf(lower)[0]!.head.x).toBeCloseTo(lastSig + sigWidth + 22, 1);
  });
});

describe('楽譜断片（SPEC 5.5）', () => {
  const headX = (svg: string) => Number(/<text class="glyph noteheadWhole head" x="([\d.]+)"/.exec(svg)![1]);

  it('五線・音部記号・調号と全音符の符頭1つ。拍子記号・小節線・符幹は描かない', () => {
    const svg = renderSnippet({ pitch: 'F#4', accidental: null }, 'treble', 2);
    expect(svg).toMatch(new RegExp(`^<svg class="staff snippet" [^>]*viewBox="0 0 ${SNIPPET_WIDTH} ${SNIPPET_HEIGHT}"`));
    expect(svg.match(/glyph sharp/g)).toHaveLength(2);
    expect(svg.match(/notehead/g)).toHaveLength(1);
    expect(svg).not.toContain('timeSig4');
    expect(svg).not.toContain('barline');
    expect(svg).not.toContain('class="stem"');
    expect(svg).not.toContain('data-index');
  });

  it('本体の段より上下に広い（本体は上下 4 線間、断片は 6 線間）', () => {
    expect(SNIPPET_HEIGHT).toBe(STAVE_HEIGHT + 40);
    // 五線の位置を 2 線間下げる：第5線 y=40 → 60
    expect(renderSnippet({ pitch: 'C5', accidental: null }, 'treble', 0)).toContain('<g transform="translate(0 20)">');
  });

  it('加線の多い音も断片の中に収まる（ト音記号の C7：上に加線5本、F3：下に加線3本）', () => {
    for (const pitch of ['C7', 'A3', 'F3']) {
      const svg = renderSnippet({ pitch, accidental: null }, 'treble', 0);
      const y = Number(/<text class="glyph noteheadWhole head" x="[\d.]+" y="(-?[\d.]+)"/.exec(svg)![1]) + 20;
      expect(y - 5, pitch).toBeGreaterThanOrEqual(0);
      expect(y + 5, pitch).toBeLessThanOrEqual(SNIPPET_HEIGHT);
    }
  });

  it('音符は調号の後の余白の中央に置く', () => {
    // 調号なし：音部記号の右端 4 + 26.84 = 30.84 から右端 180 までの中央に、幅 16.88 の符頭
    expect(headX(renderSnippet({ pitch: 'G4', accidental: null }, 'treble', 0))).toBeCloseTo((30.84 + 180 - 16.88) / 2, 1);
  });

  it('調号7つと臨時記号でも幅に収まり、調号から 2.2 線間以上離す', () => {
    for (const keySignature of [7, -7]) {
      for (const accidental of ['doubleSharp', 'doubleFlat'] as const) {
        const svg = renderSnippet({ pitch: 'C5', accidental }, 'bass', keySignature);
        const x = headX(svg);
        const sigs = [...svg.matchAll(/<text class="glyph (sharp|flat)" x="([\d.]+)"/g)].map((m) => Number(m[2]) + (m[1] === 'sharp' ? 9.96 : 9.04));
        expect(x - Math.max(...sigs)).toBeGreaterThanOrEqual(22 - 0.01);
        expect(x + 16.88).toBeLessThanOrEqual(SNIPPET_WIDTH);
      }
    }
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

  it('current / next の data-index だけにクラスを付ける', () => {
    const notes = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(fakeNote);
    const root = { querySelectorAll: () => notes } as unknown as ParentNode;

    applyStaffHighlight(root, 7, 8);
    expect(notes.map((n) => [...n.classes].filter((c) => c !== 'note').join())).toEqual([
      '', '', '', '', '', '', '', 'current', 'next', '',
    ]);

    applyStaffHighlight(root, null, 0);
    expect(notes.map((n) => [...n.classes].filter((c) => c !== 'note').join())).toEqual([
      'next', '', '', '', '', '', '', '', '', '',
    ]);
  });
});
