// 五線譜 SVG の自前生成（SPEC 5章）。記譜ライブラリ・音楽フォントは使わず、記号もすべて独自のパスで描く。
import type { Clef } from '../data/instruments.ts';
import type { ScaleEntry } from '../data/scales.ts';
import { accidentalMarks, type AccidentalMark } from '../music/accidentals.ts';
import { parsePitch, type Letter } from '../music/pitch.ts';

export type NoteValue = 'whole' | 'half' | 'quarter';

export interface StaveNote {
  pitch: string;
  /** 15音の中の位置（0〜14）。data-index になり、ハイライトの対象を決める */
  index: number;
  accidental: AccidentalMark | null;
}

export interface StaveOptions {
  clef: Clef;
  keySignature: number;
  noteValue: NoteValue;
  width?: number;
}

/** 五線の線間隔（SVG 単位）。記号のパスもこの値を前提に書いている */
const S = 10;
/** 1段の高さ。線5本（4S）＋上下に加線4本分の余白（各4S） */
export const STAVE_HEIGHT = S * 12;
export const STAVE_WIDTH = 400;
const BOTTOM_LINE_Y = S * 8;

const LETTER_INDEX: Record<Letter, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
// 第1線の音：ト音記号 E4、ヘ音記号 G2
const BOTTOM_LINE_STEP: Record<Clef, number> = { treble: 4 * 7 + 2, bass: 2 * 7 + 4 };
const MIDDLE_LINE = 4;
const TOP_LINE = 8;

// 調号の位置（ト音記号での段。ヘ音記号は2段下）
const SHARP_STEPS = [8, 5, 9, 6, 3, 7, 4];
const FLAT_STEPS = [4, 7, 3, 6, 2, 5, 1];
const CLEF_STEP_SHIFT: Record<Clef, number> = { treble: 0, bass: -2 };

const CLEF_X = 4;
const CLEF_WIDTH = 2.5 * S;
const KEY_SIG_X = CLEF_X + CLEF_WIDTH + 6;

const STEM_LENGTH = 3.5 * S;
const STEM_OFFSET = 5.7;
const ACCIDENTAL_GAP = 14;

/** 第1線からの段数（線と間を1段ずつ数える。第1線 = 0、第5線 = 8） */
export function staffStep(pitch: string, clef: Clef): number {
  const { letter, octave } = parsePitch(pitch);
  return octave * 7 + LETTER_INDEX[letter] - BOTTOM_LINE_STEP[clef];
}

const stepY = (step: number) => BOTTOM_LINE_Y - (step * S) / 2;
const r2 = (v: number) => Math.round(v * 100) / 100;

// ---- 記号 ----

/** 原点中心・deg 度傾けた楕円のパス */
function ellipse(rx: number, ry: number, deg: number): string {
  const rad = (deg * Math.PI) / 180;
  const x = r2(rx * Math.cos(rad));
  const y = r2(rx * Math.sin(rad));
  return `M${x} ${y}A${rx} ${ry} ${deg} 1 1 ${-x} ${-y}A${rx} ${ry} ${deg} 1 1 ${x} ${y}Z`;
}

// 符頭は横 1.2S・縦 1S。白抜きは内側の楕円を evenodd で抜く
const HEAD_PATHS: Record<NoteValue, string> = {
  whole: ellipse(6.6, 4.6, 0) + ellipse(4, 2.9, 60),
  half: ellipse(6.4, 4.4, -20) + ellipse(5, 1.9, -28),
  quarter: ellipse(6.4, 4.4, -20),
};

/** (x1,y1)→(x2,y2) を中心線とする厚さ t の平行四辺形 */
function bar(x1: number, y1: number, x2: number, y2: number, t: number): string {
  return `M${r2(x1)} ${r2(y1 - t / 2)}L${r2(x2)} ${r2(y2 - t / 2)}V${r2(y2 + t / 2)}L${r2(x1)} ${r2(y1 + t / 2)}Z`;
}

const fillPath = (d: string) => `<path d="${d}" fill="currentColor"/>`;
const strokePath = (d: string, width: number) =>
  `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round"/>`;

function flatParts(x: number, y: number): string {
  const stem = `M${r2(x - 2.5)} ${r2(y - 16)}V${r2(y + 5.5)}`;
  const bowl =
    `M${r2(x - 2.5)} ${r2(y - 0.8)}C${r2(x + 0.5)} ${r2(y - 4.6)} ${r2(x + 5.6)} ${r2(y - 3.8)} ${r2(x + 4.4)} ${r2(y + 0.2)}` +
    `C${r2(x + 3.4)} ${r2(y + 3)} ${r2(x + 0.4)} ${r2(y + 4.4)} ${r2(x - 2.5)} ${r2(y + 5.5)}`;
  return strokePath(stem, 1.1) + strokePath(bowl, 1.6);
}

function accidentalGlyph(mark: AccidentalMark, x: number, y: number): string {
  let body: string;
  switch (mark) {
    case 'sharp': {
      const bars = [-4.5, 4.5].map((c) => bar(x - 4.5, y + c + 1.5, x + 4.5, y + c - 1.5, 2.4)).join('');
      const lines = `M${r2(x - 2)} ${r2(y - 12.5)}V${r2(y + 14)}M${r2(x + 2)} ${r2(y - 14)}V${r2(y + 12.5)}`;
      body = fillPath(bars) + strokePath(lines, 1.1);
      break;
    }
    case 'natural': {
      const bars = [-3.4, 3.4].map((c) => bar(x - 2.3, y + c + 1, x + 2.3, y + c - 1, 2.4)).join('');
      const lines = `M${r2(x - 2.3)} ${r2(y - 13.5)}V${r2(y + 5.5)}M${r2(x + 2.3)} ${r2(y - 5.5)}V${r2(y + 13.5)}`;
      body = fillPath(bars) + strokePath(lines, 1.1);
      break;
    }
    case 'flat':
      body = flatParts(x, y);
      break;
    case 'doubleFlat':
      body = flatParts(x - 3.5, y) + flatParts(x + 3.5, y);
      break;
    case 'doubleSharp': {
      const cross = `M${r2(x - 3.4)} ${r2(y - 3.4)}L${r2(x + 3.4)} ${r2(y + 3.4)}M${r2(x - 3.4)} ${r2(y + 3.4)}L${r2(x + 3.4)} ${r2(y - 3.4)}`;
      const corners = [-3.4, 3.4]
        .flatMap((dx) => [-3.4, 3.4].map((dy) => `M${r2(x + dx - 1.5)} ${r2(y + dy - 1.5)}h3v3h-3Z`))
        .join('');
      body = strokePath(cross, 1.3) + fillPath(corners);
      break;
    }
  }
  return `<g class="glyph ${mark}">${body}</g>`;
}

const CLEFS: Record<Clef, string> = {
  treble:
    strokePath(
      'M14 71C10 71 9.5 65.5 14 64.5C19 63.5 22.5 69 20.5 74C18.5 79 12 81.5 7.5 78.5C2 75 3 66 8 60' +
        'C12 55 18 49 19 40C19.8 33 18 25 15.5 23C12 21 10 30 11 38L15.5 88C16 93 13 96 9.5 94.5',
      1.8,
    ) + '<circle cx="10" cy="92.5" r="2.4" fill="currentColor"/>',
  bass:
    strokePath('M4.5 49C4.5 43 10 40 14.5 40.5C20.5 41 22.5 46 22 51C21.2 60 13 70 3 77', 2.2) +
    '<circle cx="6.5" cy="50" r="3.3" fill="currentColor"/>' +
    '<circle cx="25.5" cy="45" r="1.7" fill="currentColor"/><circle cx="25.5" cy="55" r="1.7" fill="currentColor"/>',
};

// ---- 段 ----

function renderNote(note: StaveNote, x: number, spacing: number, clef: Clef, noteValue: NoteValue): string {
  const step = staffStep(note.pitch, clef);
  const y = stepY(step);

  const bg = `<rect class="note-bg" x="${r2(x - spacing / 2 + 2)}" y="${S}" width="${r2(spacing - 4)}" height="${S * 10}" rx="${S * 0.6}"/>`;

  const ledgerSteps: number[] = [];
  for (let s = -2; s >= step; s -= 2) ledgerSteps.push(s);
  for (let s = TOP_LINE + 2; s <= step; s += 2) ledgerSteps.push(s);
  const ledgers = ledgerSteps.length
    ? `<g class="ledgers">${strokePath(ledgerSteps.map((s) => `M${r2(x - 9)} ${stepY(s)}H${r2(x + 9)}`).join(''), 1)}</g>`
    : '';

  const accidental = note.accidental
    ? accidentalGlyph(note.accidental, x - ACCIDENTAL_GAP - (note.accidental === 'doubleFlat' ? 3 : 0), y)
    : '';

  const head = `<path class="head" d="${HEAD_PATHS[noteValue]}" transform="translate(${r2(x)} ${y})" fill="currentColor" fill-rule="evenodd"/>`;

  let stem = '';
  if (noteValue !== 'whole') {
    // 中央線より上の音は下向き、それ以外は上向き
    const down = step > MIDDLE_LINE;
    const sx = r2(down ? x - STEM_OFFSET : x + STEM_OFFSET);
    const y1 = down ? y + 1 : y - 1;
    const y2 = down ? y + STEM_LENGTH : y - STEM_LENGTH;
    stem = `<path class="stem" d="M${sx} ${y1}V${y2}" stroke="currentColor" stroke-width="1.2"/>`;
  }

  const accidentalAttr = note.accidental ? ` data-accidental="${note.accidental}"` : '';
  return `<g class="note" data-index="${note.index}" data-pitch="${note.pitch}"${accidentalAttr}>${bg}${ledgers}${accidental}${head}${stem}</g>`;
}

/** 1段分の中身（<svg> の中に置く <g>）。音部記号・調号・音符を左から並べる */
export function renderStave(notes: readonly StaveNote[], options: StaveOptions): string {
  const { clef, keySignature, noteValue, width = STAVE_WIDTH } = options;

  const lines = [0, 2, 4, 6, 8].map((s) => `M0 ${stepY(s)}H${width}`).join('');
  const staffLines = `<g class="staff-lines">${strokePath(lines, 1)}</g>`;

  const clefMarkup = `<g class="clef" transform="translate(${CLEF_X} 0)">${CLEFS[clef]}</g>`;

  const count = Math.abs(keySignature);
  const sigSteps = (keySignature > 0 ? SHARP_STEPS : FLAT_STEPS).slice(0, count);
  const sigMark: AccidentalMark = keySignature > 0 ? 'sharp' : 'flat';
  const keySig = sigSteps
    .map((s, i) => accidentalGlyph(sigMark, KEY_SIG_X + S / 2 + i * S, stepY(s + CLEF_STEP_SHIFT[clef])))
    .join('');

  const notesX = KEY_SIG_X + count * S + S;
  const spacing = (width - notesX - S / 2) / notes.length;
  const noteMarkup = notes
    .map((note, i) => renderNote(note, notesX + spacing * (i + 0.5), spacing, clef, noteValue))
    .join('');

  return `${staffLines}${clefMarkup}<g class="key-signature">${keySig}</g>${noteMarkup}`;
}

/**
 * スケール全体の2段（上段＝上行8音、下段＝下行8音）。最高音は両段に描き、どちらも data-index は 7。
 * 臨時記号は上行・下行を通した15音で SPEC 5.3 のルールを適用して決める。
 */
export function renderScaleStaves(scale: ScaleEntry, clef: Clef, noteValue: NoteValue): string {
  const pitches = [...scale.ascending, ...scale.descending];
  const marks = accidentalMarks(scale.keySignature, pitches);
  const note = (index: number): StaveNote => ({ pitch: pitches[index]!, index, accidental: marks[index] ?? null });
  const upper = [0, 1, 2, 3, 4, 5, 6, 7].map(note);
  const lower = [7, 8, 9, 10, 11, 12, 13, 14].map(note);
  const options = { clef, keySignature: scale.keySignature, noteValue };
  const label = `上行 ${scale.ascending.join(' ')}、下行 ${scale.descending.join(' ')}`;
  return (
    `<svg class="staff" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${STAVE_WIDTH} ${STAVE_HEIGHT * 2}" role="img" aria-label="${label}">` +
    `<g class="stave">${renderStave(upper, options)}</g>` +
    `<g class="stave" transform="translate(0 ${STAVE_HEIGHT})">${renderStave(lower, options)}</g>` +
    `</svg>`
  );
}

/** data-index が current / next の音符にクラスを付け、それ以外から外す（SPEC 5.4） */
export function applyStaffHighlight(root: ParentNode, current: number | null, next: number | null): void {
  for (const el of root.querySelectorAll<SVGGElement>('.note')) {
    const index = Number(el.dataset.index);
    el.classList.toggle('current', index === current);
    el.classList.toggle('next', index === next);
  }
}
