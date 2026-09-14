// 五線譜 SVG の生成（SPEC 5章）。記譜ライブラリは使わない。
// 音部記号・調号・臨時記号・符頭は SMuFL フォント Bravura のグリフ、符幹・五線・加線は自前のパスで描く。
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

/** 五線の線間隔（SVG 単位） */
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
/** 音部記号の右端と調号のすき間（ト音・ヘ音とも同じ） */
const CLEF_KEY_SIG_GAP = 0.42 * S;

/** 符幹の基本の長さ（符頭の中心から）。これで第3線に届かない音は第3線まで伸ばす */
const STEM_LENGTH = 3.5 * S;
// 以下は Bravura の engravingDefaults の値
const STAFF_LINE_THICKNESS = 0.13 * S;
const LEDGER_THICKNESS = 0.16 * S;
const STEM_THICKNESS = 0.12 * S;
const LEDGER_EXTENSION = 0.4 * S;
/** 調号の記号どうしのすき間 */
const KEY_SIG_GAP = 0.2 * S;
/** 臨時記号と符頭のすき間 */
const ACCIDENTAL_GAP = 0.3 * S;

/** 第1線からの段数（線と間を1段ずつ数える。第1線 = 0、第5線 = 8） */
export function staffStep(pitch: string, clef: Clef): number {
  const { letter, octave } = parsePitch(pitch);
  return octave * 7 + LETTER_INDEX[letter] - BOTTOM_LINE_STEP[clef];
}

const stepY = (step: number) => BOTTOM_LINE_Y - (step * S) / 2;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** 線（五線・加線）。端は丸めず、指定した長さちょうどで止める */
const strokePath = (d: string, width: number) =>
  `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${r2(width)}"/>`;

// ---- 記号（Bravura のグリフ） ----

// SMuFL は 1em = 線間隔4つ分。グリフの原点（左端・ベースライン）を、音部記号は基準の線に、
// 臨時記号と符頭は音の高さに置く
const GLYPH_FONT_SIZE = 4 * S;

type NoteheadName = 'noteheadWhole' | 'noteheadHalf' | 'noteheadBlack';
type GlyphName = 'gClef' | 'fClef' | AccidentalMark | NoteheadName;

/** SMuFL のコードポイントと、字形の右端（線間隔単位。Bravura メタデータの bBoxNE の x） */
const GLYPHS: Record<GlyphName, { code: string; width: number }> = {
  gClef: { code: 'E050', width: 2.684 },
  fClef: { code: 'E062', width: 2.736 },
  flat: { code: 'E260', width: 0.904 },
  natural: { code: 'E261', width: 0.672 },
  sharp: { code: 'E262', width: 0.996 },
  doubleSharp: { code: 'E263', width: 0.988 },
  doubleFlat: { code: 'E264', width: 1.644 },
  noteheadWhole: { code: 'E0A2', width: 1.688 },
  noteheadHalf: { code: 'E0A3', width: 1.18 },
  noteheadBlack: { code: 'E0A4', width: 1.18 },
};

const glyphWidth = (name: GlyphName) => GLYPHS[name].width * S;

/** グリフを左端 x・ベースライン y に置く */
function glyph(name: GlyphName, x: number, y: number, extraClass = ''): string {
  const cls = extraClass ? `glyph ${name} ${extraClass}` : `glyph ${name}`;
  return `<text class="${cls}" x="${r2(x)}" y="${r2(y)}" font-size="${GLYPH_FONT_SIZE}">&#x${GLYPHS[name].code};</text>`;
}

// 音部記号の基準の線：ト音記号は第2線（G）、ヘ音記号は第4線（F）
const CLEF_GLYPH: Record<Clef, { name: GlyphName; step: number }> = {
  treble: { name: 'gClef', step: 2 },
  bass: { name: 'fClef', step: 6 },
};

/** 調号の1つ目の左端。音部記号の右端から CLEF_KEY_SIG_GAP 空ける */
const keySigX = (clef: Clef) => CLEF_X + glyphWidth(CLEF_GLYPH[clef].name) + CLEF_KEY_SIG_GAP;

// ---- 符頭と符幹 ----

const NOTEHEADS: Record<NoteValue, NoteheadName> = {
  whole: 'noteheadWhole',
  half: 'noteheadHalf',
  quarter: 'noteheadBlack',
};

/**
 * SMuFL の anchor（Bravura の値、線間隔単位）。上向きの符幹は右端を stemUpSE に、
 * 下向きの符幹は左端を stemDownNW に合わせる。y は上向きが正
 */
const STEM_ANCHORS = {
  up: { x: 1.18, y: 0.168 },
  down: { x: 0, y: -0.168 },
};

/**
 * 符幹の先端の y。基本は符頭の中心から STEM_LENGTH だが、それで第3線に届かない音
 * （五線から離れた音）は第3線まで伸ばす（PDF の記譜と同じ）
 */
export function stemEndY(step: number): number {
  const y = stepY(step);
  const middle = stepY(MIDDLE_LINE);
  return step >= MIDDLE_LINE ? Math.max(y + STEM_LENGTH, middle) : Math.min(y - STEM_LENGTH, middle);
}

// ---- 段 ----

function renderNote(note: StaveNote, x: number, spacing: number, clef: Clef, noteValue: NoteValue): string {
  const step = staffStep(note.pitch, clef);
  const y = stepY(step);

  const bg = `<rect class="note-bg" x="${r2(x - spacing / 2 + 2)}" y="${S}" width="${r2(spacing - 4)}" height="${S * 10}" rx="${S * 0.6}"/>`;

  // 符頭は x を中心に置く
  const headName = NOTEHEADS[noteValue];
  const headWidth = glyphWidth(headName);
  const headLeft = x - headWidth / 2;

  // 加線は符頭の左右に LEDGER_EXTENSION はみ出す
  const ledgerSteps: number[] = [];
  for (let s = -2; s >= step; s -= 2) ledgerSteps.push(s);
  for (let s = TOP_LINE + 2; s <= step; s += 2) ledgerSteps.push(s);
  const ledgers = ledgerSteps.length
    ? `<g class="ledgers">${strokePath(
        ledgerSteps.map((s) => `M${r2(headLeft - LEDGER_EXTENSION)} ${stepY(s)}H${r2(headLeft + headWidth + LEDGER_EXTENSION)}`).join(''),
        LEDGER_THICKNESS,
      )}</g>`
    : '';

  // 臨時記号は右端を符頭の左端から ACCIDENTAL_GAP だけ離して置く
  const accidental = note.accidental
    ? glyph(note.accidental, headLeft - ACCIDENTAL_GAP - glyphWidth(note.accidental), y)
    : '';

  const head = glyph(headName, headLeft, y, 'head');

  let stem = '';
  if (noteValue !== 'whole') {
    // 第3線（中央線）上とそれより高い音は下向き、中央線より低い音は上向き
    const down = step >= MIDDLE_LINE;
    const anchor = down ? STEM_ANCHORS.down : STEM_ANCHORS.up;
    // anchor は符幹の外側の角なので、線の中心は太さの半分だけ内側（上向きは左、下向きは右）
    const sx = r2(headLeft + anchor.x * S + (down ? STEM_THICKNESS / 2 : -STEM_THICKNESS / 2));
    const y1 = r2(y - anchor.y * S);
    stem = `<path class="stem" d="M${sx} ${y1}V${r2(stemEndY(step))}" stroke="currentColor" stroke-width="${r2(STEM_THICKNESS)}"/>`;
  }

  const accidentalAttr = note.accidental ? ` data-accidental="${note.accidental}"` : '';
  return `<g class="note" data-index="${note.index}" data-pitch="${note.pitch}"${accidentalAttr}>${bg}${ledgers}${accidental}${head}${stem}</g>`;
}

/** 1段分の中身（<svg> の中に置く <g>）。音部記号・調号・音符を左から並べる */
export function renderStave(notes: readonly StaveNote[], options: StaveOptions): string {
  const { clef, keySignature, noteValue, width = STAVE_WIDTH } = options;

  const lines = [0, 2, 4, 6, 8].map((s) => `M0 ${stepY(s)}H${width}`).join('');
  const staffLines = `<g class="staff-lines">${strokePath(lines, STAFF_LINE_THICKNESS)}</g>`;

  const { name: clefName, step: clefStep } = CLEF_GLYPH[clef];
  const clefMarkup = `<g class="clef">${glyph(clefName, CLEF_X, stepY(clefStep))}</g>`;

  // 調号は記号の幅＋すき間ごとに並べる
  const count = Math.abs(keySignature);
  const sigMark: AccidentalMark = keySignature > 0 ? 'sharp' : 'flat';
  const sigAdvance = glyphWidth(sigMark) + KEY_SIG_GAP;
  const sigX = keySigX(clef);
  const keySig = (keySignature > 0 ? SHARP_STEPS : FLAT_STEPS)
    .slice(0, count)
    .map((s, i) => glyph(sigMark, sigX + i * sigAdvance, stepY(s + CLEF_STEP_SHIFT[clef])))
    .join('');

  const notesX = sigX + count * sigAdvance + S;
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
