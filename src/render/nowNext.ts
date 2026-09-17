// いま／つぎ枠（SPEC 2.6, 7.3）。各枠に音名・楽譜断片・運指図を並べる。
// 中身は progress（と停止中の予習表示 previewIndex）だけから決める。
import { displayedFingerings, type FingeringEntry, type InstrumentFingerings } from '../data/fingerings.ts';
import type { Clef } from '../data/instruments.ts';
import type { ScaleEntry } from '../data/scales.ts';
import { accidentalMarks, type AccidentalMark } from '../music/accidentals.ts';
import { parsePitch } from '../music/pitch.ts';
import { NOTE_COUNT, nowNext, type Progress } from '../state/store.ts';
import { fingeringDescription, pressedKeyIds, renderFingering } from './fingering.ts';
import { renderSnippet } from './staff.ts';

// ---- 枠の中身の導出（DOM を使わない） ----

export type FrameContent =
  | { kind: 'note'; index: number }
  /** 再生前（「▶で開始」） */
  | { kind: 'start' }
  /** カウントイン中 */
  | { kind: 'countin' }
  /** 最後の音の次（「おわり」） */
  | { kind: 'end' };

export interface Frames {
  now: FrameContent;
  next: FrameContent;
}

const noteFrame = (index: number): FrameContent => ({ kind: 'note', index });
const END: FrameContent = { kind: 'end' };

/**
 * いま／つぎの中身（SPEC 7.3）。停止中（idle）に予習表示の音があれば、その音を「いま」、次の音を「つぎ」にする（SPEC 2.5）
 */
export function nowNextFrames(progress: Progress, previewIndex: number | null): Frames {
  if (progress.phase === 'idle' && previewIndex !== null) {
    return { now: noteFrame(previewIndex), next: previewIndex < NOTE_COUNT - 1 ? noteFrame(previewIndex + 1) : END };
  }
  const { now, next } = nowNext(progress);
  return {
    now: now !== null ? noteFrame(now) : { kind: progress.phase === 'countin' ? 'countin' : 'start' },
    next: next === 'end' ? END : noteFrame(next),
  };
}

export const sameFrame = (a: FrameContent, b: FrameContent) =>
  a.kind === b.kind && (a.kind !== 'note' || a.index === (b as { index: number }).index);

/** 「つぎ」だった音が「いま」に移ったか（SPEC 2.6 のスライドをする切り替え） */
export function isAdvance(prev: Frames, next: Frames): boolean {
  return prev.next.kind === 'note' && sameFrame(prev.next, next.now) && !sameFrame(prev.now, next.now);
}

/** 音名の表示（SPEC 2.6。例 D5、F♯4、B♭4。日本式の音名は使わない） */
export function displayPitch(pitch: string): string {
  const { letter, accidental, octave } = parsePitch(pitch);
  const mark = { '': '', '#': '♯', b: '♭', x: '𝄪', bb: '𝄫' }[accidental];
  return `${letter}${mark}${octave}`;
}

// ---- 枠の中身の HTML ----

/** 1つの調の16音と、その楽器の運指図を描くのに必要なもの */
export interface NowNextSource {
  /** 16音（記譜。上行8音 → 下行8音） */
  pitches: readonly string[];
  /** 五線譜と同じ臨時記号（SPEC 5.3） */
  marks: readonly (AccidentalMark | null)[];
  clef: Clef;
  keySignature: number;
  fingerings: InstrumentFingerings;
  /** 運指図のテンプレート SVG（SPEC 4.7） */
  template: string;
}

export function nowNextSource(scale: ScaleEntry, clef: Clef, fingerings: InstrumentFingerings, template: string): NowNextSource {
  const pitches = [...scale.ascending, ...scale.descending];
  return { pitches, marks: accidentalMarks(scale.keySignature, pitches), clef, keySignature: scale.keySignature, fingerings, template };
}

/** その音の表示する運指（主運指が先頭。代替運指は「別の運指を表示」がオンのときだけ、hidden は除く） */
export const noteFingerings = (source: NowNextSource, index: number, showAlternates: boolean): FingeringEntry[] =>
  displayedFingerings(source.fingerings, parsePitch(source.pitches[index]!).midi, showAlternates);

/** 運指図（<svg class="fingering">）。読み上げ用に音名と運指を添える */
export function fingeringSvg(source: NowNextSource, index: number, entry: FingeringEntry): string {
  const name = displayPitch(source.pitches[index]!);
  return renderFingering(source.template, pressedKeyIds(entry), `${name} の運指：${fingeringDescription(entry)}`);
}

const MESSAGES = { start: '▶で開始', countin: 'カウント', end: 'おわり' } as const;

/**
 * 枠の中身。音なら上から音名・楽譜断片・運指図。表示する代替運指があれば（「別の運指を表示」がオンのときだけ）、
 * 運指図の下に「別の運指あり」
 */
export function frameHtml(source: NowNextSource, content: FrameContent, showAlternates: boolean): string {
  if (content.kind !== 'note') return `<p class="nn-message">${MESSAGES[content.kind]}</p>`;
  const { index } = content;
  const pitch = source.pitches[index]!;
  const name = displayPitch(pitch);
  const [primary, ...alternates] = noteFingerings(source, index, showAlternates);
  const snippet = renderSnippet({ pitch, accidental: source.marks[index] ?? null }, source.clef, source.keySignature, `${name} の楽譜`);
  const fingering = primary ? fingeringSvg(source, index, primary) : '<p class="nn-message">運指データなし</p>';
  // 「別の運指あり」の行は、ないときも高さを取っておく（運指図の大きさが音ごとに変わらないように）
  const alt = alternates.length > 0 ? '<p class="nn-alt">別の運指あり</p>' : '<p class="nn-alt" aria-hidden="true"></p>';
  return `<p class="nn-name">${name}</p><div class="nn-snippet">${snippet}</div><div class="nn-fingering">${fingering}${alt}</div>`;
}

// ---- DOM ----

export type FrameName = 'now' | 'next';

export interface NowNextView {
  /** progress・予習表示・「別の運指を表示」が変わったら呼ぶ。中身が同じ枠は書き換えない */
  update(progress: Progress, previewIndex: number | null, showAlternates: boolean): void;
  /** 調を変えたら呼ぶ（次の update で両方の枠を描き直す） */
  setSource(source: NowNextSource): void;
}

/** 音の切り替えのアニメーションの長さ（SPEC 2.6） */
export const SLIDE_MS = 120;

/**
 * root に「いま」「つぎ」の2枠を作る。音の入った枠をタップすると onOpen(枠, 音の位置) を呼ぶ（S3）
 */
export function mountNowNext(
  root: HTMLElement,
  initialSource: NowNextSource,
  onOpen: (frame: FrameName, index: number) => void,
): NowNextView {
  root.classList.add('now-next');
  root.innerHTML = (['now', 'next'] as const)
    .map(
      (name) =>
        `<section class="nn-frame nn-${name}" aria-label="${name === 'now' ? 'いま' : 'つぎ'}">` +
        `<h2 class="nn-title">${name === 'now' ? 'いま' : 'つぎ'}</h2>` +
        `<div class="nn-body" data-frame="${name}"></div>` +
        `</section>`,
    )
    .join('');
  const bodies = {
    now: root.querySelector<HTMLDivElement>('.nn-body[data-frame="now"]')!,
    next: root.querySelector<HTMLDivElement>('.nn-body[data-frame="next"]')!,
  };

  let source = initialSource;
  let shown: Frames | null = null;
  let showAlternates = false;

  function show(name: FrameName, content: FrameContent) {
    const body = bodies[name];
    body.innerHTML = frameHtml(source, content, showAlternates);
    const index = content.kind === 'note' ? content.index : null;
    body.dataset.index = index === null ? '' : String(index);
    // 音の入った枠だけ、タップ（キーボードでは Enter・Space）で拡大できる
    if (index === null) {
      body.removeAttribute('role');
      body.removeAttribute('tabindex');
      body.removeAttribute('aria-label');
    } else {
      body.setAttribute('role', 'button');
      body.setAttribute('tabindex', '0');
      body.setAttribute('aria-label', `${name === 'now' ? 'いま' : 'つぎ'} ${displayPitch(source.pitches[index]!)}。タップで運指を拡大`);
    }
  }

  // つぎの中身が左の「いま」へ移り、新しい「つぎ」が右からフェードインする。動きを減らす設定では動かさない
  function slide() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const from = bodies.next.getBoundingClientRect();
    const to = bodies.now.getBoundingClientRect();
    if (to.width === 0) return;
    const options: KeyframeAnimationOptions = { duration: SLIDE_MS, easing: 'ease-out' };
    bodies.now.animate(
      [{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width})` }, { transform: 'none' }],
      options,
    );
    bodies.next.animate([{ opacity: 0, transform: 'translateX(20%)' }, { opacity: 1, transform: 'none' }], options);
  }

  for (const name of ['now', 'next'] as const) {
    const body = bodies[name];
    const open = () => {
      if (body.dataset.index) onOpen(name, Number(body.dataset.index));
    };
    body.addEventListener('click', open);
    body.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      open();
    });
  }

  return {
    update(progress, previewIndex, alternates) {
      // 「別の運指を表示」を切り替えたら、両方の枠を描き直す（動かさない）
      if (alternates !== showAlternates) {
        showAlternates = alternates;
        shown = null;
      }
      const frames = nowNextFrames(progress, previewIndex);
      if (shown && sameFrame(shown.now, frames.now) && sameFrame(shown.next, frames.next)) return;
      const advance = shown !== null && isAdvance(shown, frames);
      if (!shown || !sameFrame(shown.now, frames.now)) show('now', frames.now);
      if (!shown || !sameFrame(shown.next, frames.next)) show('next', frames.next);
      shown = frames;
      if (advance) slide();
    },
    setSource(next) {
      source = next;
      shown = null;
    },
  };
}
