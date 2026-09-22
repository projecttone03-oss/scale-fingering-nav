// 五線譜 SVG の生成（SPEC 5章）。記譜ライブラリは使わない。
// 音部記号・調号・臨時記号・符頭は SMuFL フォント Bravura のグリフ、符幹・五線・加線は自前のパスで描く。
import type { Clef } from '../data/instruments.ts';
import type { ScaleEntry } from '../data/scales.ts';
import { accidentalMarks, type AccidentalMark } from '../music/accidentals.ts';
import { notesPerBar, type NoteValue } from '../music/meter.ts';
import { parsePitch, type Letter } from '../music/pitch.ts';

export type { NoteValue } from '../music/meter.ts';

export interface StaveNote {
  pitch: string;
  /** 16音の中の位置（0〜15）。data-index になり、ハイライトの対象を決める */
  index: number;
  accidental: AccidentalMark | null;
}

export interface StaveOptions {
  clef: Clef;
  keySignature: number;
  noteValue: NoteValue;
  width?: number;
  /** 調号の右に拍子記号 4/4 を描く（SPEC 5.6。スケールでは上段だけ） */
  timeSignature?: boolean;
  /** この数の音符ごとに小節線を引く（段の途中だけ。段の終わりは end で決める） */
  notesPerBar?: number;
  /** 段の終わりの線：細い小節線、終止線、なし */
  end?: 'barline' | 'final' | 'none';
}

/** 五線の線間隔（SVG 単位） */
const S = 10;
/** 1段の高さ。線5本（4S）＋上下に加線4本分の余白（各4S） */
export const STAVE_HEIGHT = S * 12;
/** 1段の横幅（50S）。表示するときは親要素の幅に合わせて拡縮する。調号7つの全音符でも PDF どおりの間隔で収まる幅（SPEC 5.7） */
export const STAVE_WIDTH = 500;
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
const THIN_BARLINE = 0.16 * S;
const THICK_BARLINE = 0.5 * S;
/** 終止線の細い線の右端と太い線の左端の間隔 */
const FINAL_BARLINE_GAP = 0.4 * S;
/** 調号の最後の記号と拍子記号のすき間 */
const KEY_TIME_GAP = 0.5 * S;

// 音符の配置（SPEC 5.7。PDF の実測値）
/** 拍子記号（なければ調号・音部記号）の右端から最初の符頭の左端まで */
const FIRST_NOTE_GAP = 2.2 * S;
/** 最初の音符に臨時記号が付くとき、その前の記号と臨時記号のすき間の最小 */
const FIRST_ACCIDENTAL_CLEAR = 0.7 * S;
/** 小節の最後の音符の「音符の間隔」の終わりから小節線の左端まで */
const BEFORE_BARLINE = 0.5 * S;
/** 小節線の右端から次の符頭の左端まで */
const AFTER_BARLINE = 1.4 * S;
/** 小節線の直後の音符に臨時記号が付くとき、小節線と臨時記号のすき間の最小 */
const AFTER_BARLINE_ACCIDENTAL_CLEAR = 0.4 * S;
/** 前の符頭の右端と次の音符（臨時記号を含む）の左端のすき間の最小 */
const MIN_NOTE_CLEAR = 0.5 * S;
/** ハイライトの背景が音符（臨時記号を含む）からはみ出す幅 */
const HIGHLIGHT_PAD = 0.4 * S;
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
type GlyphName = 'gClef' | 'fClef' | 'timeSig4' | AccidentalMark | NoteheadName;

/** SMuFL のコードポイントと、字形の右端（線間隔単位。Bravura メタデータの bBoxNE の x） */
const GLYPHS: Record<GlyphName, { code: string; width: number }> = {
  gClef: { code: 'E050', width: 2.684 },
  fClef: { code: 'E062', width: 2.736 },
  // 拍子記号の数字。高さ 2 線間で、ベースラインが縦の中心
  timeSig4: { code: 'E084', width: 1.8 },
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

/** 臨時記号が符頭の左に張り出す幅（すき間を含む） */
const accidentalExtent = (note: Pick<StaveNote, 'accidental'>) =>
  note.accidental ? ACCIDENTAL_GAP + glyphWidth(note.accidental) : 0;

/** 符頭の左端 headLeft に、音符の加線・臨時記号・符頭・符幹を描く */
function noteParts(note: Pick<StaveNote, 'pitch' | 'accidental'>, headLeft: number, clef: Clef, noteValue: NoteValue): string {
  const step = staffStep(note.pitch, clef);
  const y = stepY(step);

  const headName = NOTEHEADS[noteValue];
  const headWidth = glyphWidth(headName);

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

  return `${ledgers}${accidental}${head}${stem}`;
}

/** 五線譜の音符。data-index を持ち、ハイライトの対象になる */
function renderNote(note: StaveNote, headLeft: number, clef: Clef, noteValue: NoteValue): string {
  // ハイライトの背景は、音符（臨時記号を含む）を囲む
  const bgLeft = headLeft - accidentalExtent(note) - HIGHLIGHT_PAD;
  const bgWidth = headLeft + glyphWidth(NOTEHEADS[noteValue]) + HIGHLIGHT_PAD - bgLeft;
  const bg = `<rect class="note-bg" x="${r2(bgLeft)}" y="${S}" width="${r2(bgWidth)}" height="${S * 10}" rx="${S * 0.6}"/>`;

  const accidentalAttr = note.accidental ? ` data-accidental="${note.accidental}"` : '';
  return `<g class="note" data-index="${note.index}" data-pitch="${note.pitch}"${accidentalAttr}>${bg}${noteParts(note, headLeft, clef, noteValue)}</g>`;
}

export interface NoteLayout {
  /** 各音符の符頭の左端 */
  heads: number[];
  /** 音符の間隔（符頭の左端から次の符頭の左端まで。小節線をまたがない場合） */
  spacing: number;
  /** 段の途中の小節線の左端 */
  bars: number[];
  /** 固定の間隔の縮め具合。1 は PDF どおり、0 は下限まで縮めた状態 */
  compression: number;
}

// 段に収まらないときに固定の間隔を縮める下限（PDF の値のおよそ半分）
const FIRST_NOTE_GAP_MIN = 1.1 * S;
const BEFORE_BARLINE_MIN = 0.25 * S;
const AFTER_BARLINE_MIN = 0.7 * S;

/**
 * 音符の横の配置（SPEC 5.7）。1段の音符は同じ音価なので「音符の間隔」は1つで、
 * 段の終わりの線がちょうど段の右端に来るように決める。
 * - 最初の符頭：start（拍子記号・調号・音部記号の右端）から FIRST_NOTE_GAP
 * - 小節線：小節の最後の符頭の左端から「音符の間隔 + BEFORE_BARLINE」、次の符頭はその右端から AFTER_BARLINE
 * - 段の終わりの線：最後の符頭の左端から「音符の間隔 + BEFORE_BARLINE」
 * - 臨時記号が付いても間隔は変えない（前の符頭との間に収める）
 * 段が狭く、音符の間隔が「符頭と次の音符がぶつからない最小の間隔」を下回るときだけ、
 * 固定の間隔（最初の符頭の前・小節線の前後）を下限に向けて同じ割合で縮める
 */
export function layoutNotes(
  notes: readonly StaveNote[],
  noteValue: NoteValue,
  start: number,
  endX: number,
  perBar: number,
): NoteLayout {
  const n = notes.length;
  if (n === 0) return { heads: [], spacing: 0, bars: [], compression: 1 };
  const headWidth = glyphWidth(NOTEHEADS[noteValue]);
  const barAfter = (i: number) => perBar > 0 && (i + 1) % perBar === 0 && i < n - 1;
  const ext = (i: number) => accidentalExtent(notes[i]!);
  /** 下限 floor から PDF の値 full までを k で補う（k = 1 で PDF どおり） */
  const gap = (floor: number, full: number, k: number) => floor + k * Math.max(0, full - floor);

  const firstGap = (k: number) =>
    gap(Math.max(FIRST_NOTE_GAP_MIN, AFTER_BARLINE_ACCIDENTAL_CLEAR + ext(0)), Math.max(FIRST_NOTE_GAP, FIRST_ACCIDENTAL_CLEAR + ext(0)), k);
  const beforeBar = (k: number) => gap(BEFORE_BARLINE_MIN, BEFORE_BARLINE, k);
  // 小節線をまたぐとき、音符の間隔に加わる長さ（小節線の前後のすき間と小節線の太さ）
  const barExtra = (i: number, k: number) =>
    beforeBar(k) +
    THIN_BARLINE +
    gap(
      Math.max(AFTER_BARLINE_MIN, 0.2 * S + ext(i + 1)),
      Math.max(AFTER_BARLINE, AFTER_BARLINE_ACCIDENTAL_CLEAR + ext(i + 1)),
      k,
    );
  // 最後の符頭の左端 + 間隔 + beforeBar = endX になる間隔
  const spacingFor = (k: number) => {
    let fixed = firstGap(k) + beforeBar(k);
    for (let i = 0; i < n; i++) if (barAfter(i)) fixed += barExtra(i, k);
    return (endX - start - fixed) / n;
  };

  // 小節線をまたがない隣どうしで、符頭と次の音符（臨時記号を含む）がぶつからない最小の間隔
  let minimum = headWidth + MIN_NOTE_CLEAR;
  for (let i = 1; i < n; i++) if (!barAfter(i - 1)) minimum = Math.max(minimum, headWidth + MIN_NOTE_CLEAR + ext(i));

  let k = 1;
  let spacing = spacingFor(1);
  if (spacing < minimum) {
    // 間隔は k について一次式なので、最小の間隔になる k を直接求める
    const loose = spacingFor(0);
    k = loose > spacing ? Math.min(1, Math.max(0, (loose - minimum) / (loose - spacing))) : 0;
    spacing = Math.max(spacingFor(k), minimum);
  }

  const heads = [start + firstGap(k)];
  const bars: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    if (barAfter(i)) {
      bars.push(heads[i]! + spacing + beforeBar(k));
      heads.push(heads[i]! + spacing + barExtra(i, k));
    } else {
      heads.push(heads[i]! + spacing);
    }
  }
  return { heads, spacing, bars, compression: k };
}

/** 第5線から第1線までの縦線（小節線・終止線） */
const barline = (x: number, thickness: number, cls: string) =>
  `<path class="${cls}" d="M${r2(x)} ${stepY(TOP_LINE)}V${stepY(0)}" stroke="currentColor" stroke-width="${r2(thickness)}"/>`;

/** 五線（幅 width）・音部記号・調号。rightEdge は最後の調号（なければ音部記号）の右端 */
function staveBeginning(clef: Clef, keySignature: number, width: number) {
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
  const rightEdge = count > 0 ? sigX + count * sigAdvance - KEY_SIG_GAP : sigX - CLEF_KEY_SIG_GAP;

  return { staffLines, symbols: `${clefMarkup}<g class="key-signature">${keySig}</g>`, hasKeySignature: count > 0, sigX, rightEdge };
}

/**
 * 1段分の中身（<svg> の中に置く <g>）。音部記号・調号・拍子記号・音符を左から並べ、
 * 小節線と段の終わりの線を引く（SPEC 5.1, 5.6）
 */
export function renderStave(notes: readonly StaveNote[], options: StaveOptions): string {
  const { clef, keySignature, noteValue, width = STAVE_WIDTH, timeSignature = false, notesPerBar: perBar = 0, end = 'none' } =
    options;
  const { staffLines, symbols, hasKeySignature, sigX, rightEdge } = staveBeginning(clef, keySignature, width);

  // 拍子記号 4/4：上の「4」は第4線、下の「4」は第2線を中心に置く
  let timeSig = '';
  /** 音符を並べ始める基準（拍子記号、なければ調号・音部記号の右端） */
  let notesStart = rightEdge;
  if (timeSignature) {
    const x = hasKeySignature ? rightEdge + KEY_TIME_GAP : sigX;
    timeSig = `<g class="time-signature">${glyph('timeSig4', x, stepY(6))}${glyph('timeSig4', x, stepY(2))}</g>`;
    notesStart = x + glyphWidth('timeSig4');
  }

  // 音符の配置（SPEC 5.7）。段の終わりの線の左端に最後の音符の間隔が届くように並べる
  const endWidth = end === 'final' ? THIN_BARLINE + FINAL_BARLINE_GAP + THICK_BARLINE : end === 'barline' ? THIN_BARLINE : 0;
  const layout = layoutNotes(notes, noteValue, notesStart, width - endWidth, perBar);
  const noteMarkup = notes.map((note, i) => renderNote(note, layout.heads[i]!, clef, noteValue)).join('');

  const bars = layout.bars.map((x) => barline(x + THIN_BARLINE / 2, THIN_BARLINE, 'barline'));
  if (end === 'barline') bars.push(barline(width - THIN_BARLINE / 2, THIN_BARLINE, 'barline end'));
  if (end === 'final') {
    // 終止線：細い線＋間隔＋太い線。太い線の右端を五線の右端にそろえる
    bars.push(barline(width - THICK_BARLINE - FINAL_BARLINE_GAP - THIN_BARLINE / 2, THIN_BARLINE, 'barline final thin'));
    bars.push(barline(width - THICK_BARLINE / 2, THICK_BARLINE, 'barline final thick'));
  }
  const barlines = bars.length ? `<g class="barlines">${bars.join('')}</g>` : '';

  return `${staffLines}${barlines}${symbols}${timeSig}${noteMarkup}`;
}

/**
 * スケール全体の2段（上段＝上行8音、下段＝下行8音。最高音は上段の最後と下段の最初の2か所）。
 * data-index は 0〜15。臨時記号は上行・下行を通した16音で SPEC 5.3 のルールを適用して決める。
 * 4/4 拍子で、拍子記号は上段だけ、小節線は4拍ごと、下段の最後に終止線（SPEC 5.6）
 */
export function renderScaleStaves(scale: ScaleEntry, clef: Clef, noteValue: NoteValue, width: number = STAVE_WIDTH): string {
  const pitches = [...scale.ascending, ...scale.descending];
  const marks = accidentalMarks(scale.keySignature, pitches);
  const note = (index: number): StaveNote => ({ pitch: pitches[index]!, index, accidental: marks[index] ?? null });
  const upper = scale.ascending.map((_, i) => note(i));
  const lower = scale.descending.map((_, i) => note(scale.ascending.length + i));
  const common = { clef, keySignature: scale.keySignature, noteValue, notesPerBar: notesPerBar(noteValue), width };
  const label = `上行 ${scale.ascending.join(' ')}、下行 ${scale.descending.join(' ')}`;
  return (
    `<svg class="staff" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${STAVE_HEIGHT * 2}" role="img" aria-label="${label}">` +
    `<g class="stave">${renderStave(upper, { ...common, timeSignature: true, end: 'barline' })}</g>` +
    `<g class="stave" transform="translate(0 ${STAVE_HEIGHT})">${renderStave(lower, { ...common, end: 'final' })}</g>` +
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
