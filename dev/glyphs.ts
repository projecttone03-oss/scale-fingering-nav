// 記号の見本ページ（開発用、本番ビルドには含まれない）。
// 使う記号を五線に置き、アプリと同じ実際の表示サイズと、その3倍を並べて確認する。
import '../src/styles/base.css';
import '../src/styles/staff.css';
import type { AccidentalMark } from '../src/music/accidentals.ts';
import { STAVE_HEIGHT, STAVE_WIDTH, renderStave, type StaveOptions } from '../src/render/staff.ts';

/** アプリで五線譜を表示するときの縮尺（スマホ幅 375px に 400 単位の段を描く） */
const ACTUAL = 375 / STAVE_WIDTH;
const ZOOM = 3;

interface Sample {
  label: string;
  options: StaveOptions & { width: number };
  notes?: readonly (readonly [pitch: string, accidental?: AccidentalMark])[];
}

const treble = (width: number, extra: Partial<StaveOptions> = {}) =>
  ({ clef: 'treble', keySignature: 0, noteValue: 'half', width, ...extra }) as const;
const bass = (width: number, extra: Partial<StaveOptions> = {}) =>
  ({ clef: 'bass', keySignature: 0, noteValue: 'half', width, ...extra }) as const;

const SECTIONS: { title: string; samples: Sample[] }[] = [
  {
    title: '音部記号',
    samples: [
      { label: 'ト音記号', options: treble(45) },
      { label: 'ヘ音記号', options: bass(45) },
    ],
  },
  {
    title: '臨時記号',
    samples: [
      {
        label: '♯（C♯5）・♭（B♭4）・♮（A4）・ダブルシャープ（F𝄪5）・ダブルフラット（E𝄫4）',
        options: treble(250),
        notes: [['C#5', 'sharp'], ['Bb4', 'flat'], ['A4', 'natural'], ['Fx5', 'doubleSharp'], ['Ebb4', 'doubleFlat']],
      },
    ],
  },
  {
    title: '符頭と符幹',
    samples: (['whole', 'half', 'quarter'] as const).map((noteValue) => ({
      label: {
        whole: '全音符（符幹なし）：E4 A4 B4 F5',
        half: '二分音符：E4 A4 は上向き、B4（第3線）F5 は下向き',
        quarter: '四分音符：E4 A4 は上向き、B4（第3線）F5 は下向き',
      }[noteValue],
      options: treble(200, { noteValue }),
      notes: [['E4'], ['A4'], ['B4'], ['F5']],
    })),
  },
  {
    title: '加線',
    samples: [
      {
        label: 'ト音記号：上第1〜3線（A5 C6 E6）、下第1〜3線（C4 A3 F3）',
        options: treble(300, { noteValue: 'quarter' }),
        notes: [['A5'], ['C6'], ['E6'], ['C4'], ['A3'], ['F3']],
      },
      {
        label: 'ヘ音記号：上第1〜3線（C4 E4 G4）、下第1〜3線（E2 C2 A1）',
        options: bass(300, { noteValue: 'quarter' }),
        notes: [['C4'], ['E4'], ['G4'], ['E2'], ['C2'], ['A1']],
      },
    ],
  },
  {
    title: '調号（記号が最も多い状態）',
    samples: [
      { label: 'ト音記号 ♯7つ（嬰ハ長調の主音 C♯5 と）', options: treble(180, { keySignature: 7 }), notes: [['C#5']] },
      { label: 'ト音記号 ♭7つ（変ハ長調の主音 C♭5 と）', options: treble(180, { keySignature: -7 }), notes: [['Cb5']] },
      { label: 'ヘ音記号 ♯7つ（C♯3 と）', options: bass(180, { keySignature: 7 }), notes: [['C#3']] },
      { label: 'ヘ音記号 ♭7つ（C♭3 と）', options: bass(180, { keySignature: -7 }), notes: [['Cb3']] },
    ],
  },
];

function staffSvg(sample: Sample, scale: number): string {
  const { width } = sample.options;
  const notes = (sample.notes ?? []).map(([pitch, accidental], index) => ({ pitch, index, accidental: accidental ?? null }));
  return (
    `<svg class="staff" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${STAVE_HEIGHT}" ` +
    `style="width:${width * scale}px;flex:none">${renderStave(notes, sample.options)}</svg>`
  );
}

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <style>
    h1 { font-size: 1.1rem; }
    h2 { font-size: 1rem; margin: 28px 0 8px; border-bottom: 1px solid #999; }
    figure { margin: 0 0 20px; }
    figcaption { font-size: 0.85rem; margin-bottom: 6px; }
    .pair { display: flex; gap: 24px; align-items: flex-start; overflow-x: auto; }
    .pair > div { flex: none; }
    .size { font-size: 0.75rem; color: #888; }
    .frame { border: 1px dashed #bbb; }
  </style>
  <h1>記号の見本（開発用）</h1>
  <p class="size">左：実寸（アプリの五線譜と同じ縮尺。1線間 ≈ ${(10 * ACTUAL).toFixed(1)}px）　右：${ZOOM}倍</p>
  ${SECTIONS.map(
    (section) => `
    <h2>${section.title}</h2>
    ${section.samples
      .map(
        (sample) => `
      <figure>
        <figcaption>${sample.label}</figcaption>
        <div class="pair">
          <div><div class="size">実寸</div><div class="frame">${staffSvg(sample, ACTUAL)}</div></div>
          <div><div class="size">${ZOOM}倍</div><div class="frame">${staffSvg(sample, ACTUAL * ZOOM)}</div></div>
        </div>
      </figure>`,
      )
      .join('')}`,
  ).join('')}
`;
