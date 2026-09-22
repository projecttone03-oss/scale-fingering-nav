import { describe, expect, it } from 'vitest';
import trumpetFingerings from '../src/data/fingerings/bb_trumpet.json';
import trumpetScales from '../src/data/scales/bb_trumpet.json';
import template from '../src/templates/bb_trumpet.svg?raw';
import type { InstrumentFingerings } from '../src/data/fingerings.ts';
import type { InstrumentScales } from '../src/data/scales.ts';
import {
  displayPitch,
  frameHtml,
  isAdvance,
  noteFingerings,
  nowNextFrames,
  changedKeys,
  nowNextSource,
  swipeDirection,
  type FrameContent,
  type Frames,
} from '../src/render/nowNext.ts';
import { fingeringName } from '../src/render/fingering.ts';
import { IDLE, countIn, type Progress } from '../src/state/store.ts';
import { optionLabel } from '../src/ui/modals.ts';

const scales = (trumpetScales as InstrumentScales).scales;
const fingerings = trumpetFingerings as InstrumentFingerings;
const note = (index: number): FrameContent => ({ kind: 'note', index });
const playing = (i: number): Progress => ({ phase: 'playing', noteIndex: i });

describe('いま／つぎの中身（SPEC 2.6, 7.3）', () => {
  it.each([
    ['再生前：いまは「▶で開始」、つぎは1音目', IDLE, null, { now: { kind: 'start' }, next: note(0) }],
    ['カウントイン中：いまはカウント、つぎは1音目', countIn(0), null, { now: { kind: 'countin' }, next: note(0) }],
    ['途中から（6音目）のカウントイン中：つぎは選んだ音', countIn(5), null, { now: { kind: 'countin' }, next: note(5) }],
    ['再生中', playing(4), null, { now: note(4), next: note(5) }],
    ['16音目：つぎは「おわり」', playing(15), null, { now: note(15), next: { kind: 'end' } }],
    ['終了後：いまに最終音を残し、つぎは「おわり」', { phase: 'done', noteIndex: 15 }, null, { now: note(15), next: { kind: 'end' } }],
    ['停止中に選んだ音（SPEC 2.5）', IDLE, 9, { now: note(9), next: note(10) }],
    ['選んだ音が最後の音', IDLE, 15, { now: note(15), next: { kind: 'end' } }],
    ['再生中は選んだ音を使わない', playing(2), 9, { now: note(2), next: note(3) }],
  ] as [string, Progress, number | null, Frames][])('%s', (_, progress, preview, expected) => {
    expect(nowNextFrames(progress, preview)).toEqual(expected);
  });

  it('クロスフェードするのは「つぎ」の音が「いま」に移ったときだけ', () => {
    const frames = (progress: Progress, preview: number | null = null) => nowNextFrames(progress, preview);
    expect(isAdvance(frames(countIn(0)), frames(playing(0)))).toBe(true);
    expect(isAdvance(frames(countIn(5)), frames(playing(5)))).toBe(true);
    expect(isAdvance(frames(playing(0)), frames(playing(1)))).toBe(true);
    expect(isAdvance(frames(playing(14)), frames(playing(15)))).toBe(true);
    // 選んだ音を次の音へ進めたときも同じ
    expect(isAdvance(frames(IDLE, 5), frames(IDLE, 6))).toBe(true);
    // 最終音のまま終了、再生開始（カウントインへ）、停止、離れた音を選んだときは動かさない
    expect(isAdvance(frames(playing(15)), frames({ phase: 'done', noteIndex: 15 }))).toBe(false);
    expect(isAdvance(frames(IDLE), frames(countIn(0)))).toBe(false);
    expect(isAdvance(frames(playing(6)), frames(IDLE))).toBe(false);
    expect(isAdvance(frames(IDLE, 5), frames(IDLE, 9))).toBe(false);
  });
});

describe('いま／つぎ枠のスワイプ（SPEC 2.6）', () => {
  it('左へ（指が右から左へ）40px 以上で次の音、右へで前の音', () => {
    expect(swipeDirection(-60, 5)).toBe(1);
    expect(swipeDirection(60, -5)).toBe(-1);
    expect(swipeDirection(-40, 0)).toBe(1);
  });

  it('短い動き（タップ）や、縦の動きが大きいときはスワイプとしない', () => {
    expect(swipeDirection(-39, 0)).toBeNull();
    expect(swipeDirection(3, 2)).toBeNull();
    expect(swipeDirection(-60, 50)).toBeNull();
  });
});

describe('音の切り替えの見せ方（SPEC 2.6）', () => {
  it('案2：押す・離すが変わったバルブだけを動かす（変わらないバルブは動かさない）', () => {
    // D4（1・3）→ E4（1・2）：2 と 3 が変わり、1 は変わらない
    expect(changedKeys(['v1', 'v3'], ['v1', 'v2'])).toEqual(['v3', 'v2']);
    // C5（開放）→ B4（2）
    expect(changedKeys([], ['v2'])).toEqual(['v2']);
    // 同じ運指（最高音の D5 が2回続くとき）は動かさない
    expect(changedKeys(['v1'], ['v1'])).toEqual([]);
  });
});

describe('音名の表示', () => {
  it.each([
    ['D5', 'D5'],
    ['F#4', 'F♯4'],
    ['Bb4', 'B♭4'],
    ['Fx5', 'F𝄪5'],
    ['Ebb4', 'E𝄫4'],
  ])('%s → %s', (pitch, shown) => {
    expect(displayPitch(pitch)).toBe(shown);
  });
});

describe('枠の中身の HTML', () => {
  const minor = nowNextSource(scales.C_minor!, fingerings, template);
  const major = nowNextSource(scales.C_major!, fingerings, template);
  const pressed = (html: string) => [...html.matchAll(/class="key pressed" data-key="(\w+)"/g)].map((m) => m[1]);

  it('音名と運指図を上から並べる（楽譜断片は出さない。音の高さは五線譜のハイライトで示す）', () => {
    // ハ長調（記譜ニ長調）の1音目 D4 は 1・3
    const html = frameHtml(major, note(0), false);
    expect(html).toMatch(/^<p class="nn-name">D4<\/p><div class="nn-fingering"><svg class="fingering"/);
    expect(pressed(html)).toEqual(['v1', 'v3']);
    expect(html).not.toContain('class="staff');
    // ハ短調の上行 B4（記譜の B♮4）は 2
    expect(frameHtml(minor, note(5), false)).toContain('<p class="nn-name">B4</p>');
    expect(pressed(frameHtml(minor, note(5), false))).toEqual(['v2']);
  });

  const EMPTY_ALT = '<p class="nn-alt" aria-hidden="true"></p>';
  const ALT = '<p class="nn-alt">別の運指あり</p>';

  it('「別の運指を表示」がオフ（既定）なら、代替運指がある音でも「別の運指あり」を出さない（行の高さは取る）', () => {
    // B4（2、別に 1・3）
    expect(frameHtml(minor, note(5), false)).toContain(EMPTY_ALT);
    expect(frameHtml(minor, note(5), false)).not.toContain('別の運指あり');
  });

  it('オンなら、代替運指がある音だけ「別の運指あり」を出す', () => {
    // D4（1・3 のみ）と B4（2、別に 1・3）
    expect(frameHtml(major, note(0), true)).toContain(EMPTY_ALT);
    expect(frameHtml(minor, note(5), true)).toContain(ALT);
  });

  it('オンでも、代替運指が第7倍音（hidden）だけの音には「別の運指あり」を出さない', () => {
    // G♯5（23、別に 1 があるが第7倍音）と E5（0、別に 12 と第7倍音の 123）
    const source = { ...major, pitches: ['G#5', 'E5'] };
    expect(frameHtml(source, note(0), true)).toContain(EMPTY_ALT);
    expect(frameHtml(source, note(1), true)).toContain(ALT);
  });

  it('音がない枠は文言だけ', () => {
    expect(frameHtml(major, { kind: 'start' }, true)).toBe('<p class="nn-message">▶で開始</p>');
    expect(frameHtml(major, { kind: 'countin' }, true)).toBe('<p class="nn-message">カウント</p>');
    expect(frameHtml(major, { kind: 'end' }, true)).toBe('<p class="nn-message">おわり</p>');
  });

  it('枠の中身は data-index を持たない（五線譜のハイライトの対象にならない）', () => {
    expect(frameHtml(major, note(3), false)).not.toContain('data-index');
  });
});

describe('S3 に表示する運指（切り替えボタンは2つ以上のときだけ）', () => {
  const source = nowNextSource(scales.C_minor!, fingerings, template);
  const names = (pitches: string[], showAlternates: boolean) =>
    noteFingerings({ ...source, pitches }, 0, showAlternates).map((e) => fingeringName(e));

  it('オフ（既定）なら主運指だけ（切り替えボタンは出ない）', () => {
    expect(names(['B4'], false)).toEqual(['2']);
    expect(names(['E5'], false)).toEqual(['0']);
  });

  it('オンなら主運指と代替運指。第7倍音（hidden）は出さない', () => {
    expect(names(['B4'], true)).toEqual(['2', '13']);
    expect(names(['E5'], true)).toEqual(['0', '12']);
    expect(names(['G#5'], true)).toEqual(['23']);
    expect(names(['Bb5'], true)).toEqual(['1']);
  });
});

describe('S3 の運指の切り替えボタン', () => {
  const entry = (valves: number[], isPrimary: boolean) => ({ id: 'x', valves, isPrimary, confidence: 'verified' as const, sources: [] });
  it('主運指は「標準」、代替は「別」。金管はバルブ番号を添える', () => {
    expect(optionLabel(entry([2], true), 0)).toBe('標準　2');
    expect(optionLabel(entry([1, 3], false), 1)).toBe('別　13');
    expect(optionLabel(entry([], false), 1)).toBe('別　0');
  });
  it('番号の表記がない楽器は「別1」「別2」', () => {
    const woodwind = (isPrimary: boolean) => ({ id: 'x', keys: ['L1'], isPrimary, confidence: 'verified' as const, sources: [] });
    expect(optionLabel(woodwind(true), 0)).toBe('標準');
    expect(optionLabel(woodwind(false), 2)).toBe('別2');
  });
});
