// いま／つぎ枠（SPEC 2.6, 7.3）。各枠に音名と運指図を並べる（音の高さは五線譜のハイライトで示す）。
// 中身は progress（と停止中に選んだ音 selectedIndex）だけから決める。
import { displayedFingerings, type FingeringEntry, type InstrumentFingerings } from '../data/fingerings.ts';
import type { ScaleEntry } from '../data/scales.ts';
import { parsePitch } from '../music/pitch.ts';
import { NOTE_COUNT, nowNext, type BeatClock, type Progress } from '../state/store.ts';
import { fingeringDescription, pressedKeyIds, renderFingering } from './fingering.ts';
import { FRAME_PULSE, createBeatPulse, prefersReducedMotion } from './pulse.ts';

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
 * いま／つぎの中身（SPEC 7.3）。停止中（idle）に選んだ音があれば、その音を「いま」、次の音を「つぎ」にする（SPEC 2.5）
 */
export function nowNextFrames(progress: Progress, selectedIndex: number | null): Frames {
  if (progress.phase === 'idle' && selectedIndex !== null) {
    return { now: noteFrame(selectedIndex), next: selectedIndex < NOTE_COUNT - 1 ? noteFrame(selectedIndex + 1) : END };
  }
  const { now, next } = nowNext(progress);
  return {
    now: now !== null ? noteFrame(now) : { kind: progress.phase === 'countin' ? 'countin' : 'start' },
    next: next === 'end' ? END : noteFrame(next),
  };
}

export const sameFrame = (a: FrameContent, b: FrameContent) =>
  a.kind === b.kind && (a.kind !== 'note' || a.index === (b as { index: number }).index);

/** 左右のスワイプとみなす指の横の移動（px）。これより短い動きはタップ */
export const SWIPE_MIN_PX = 40;

/**
 * いま／つぎ枠のスワイプの向き（SPEC 2.6）。左へ（指が右から左へ）なら次の音 +1、右へなら前の音 -1。
 * 横の移動が短い、または縦の動きに対して横が小さいときはスワイプとしない（null）
 */
export function swipeDirection(dx: number, dy: number): 1 | -1 | null {
  if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return null;
  return dx < 0 ? 1 : -1;
}

/** 「つぎ」だった音が「いま」に移ったか（SPEC 2.6 のクロスフェードをする切り替え） */
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
  fingerings: InstrumentFingerings;
  /** 運指図のテンプレート SVG（SPEC 4.7） */
  template: string;
}

export function nowNextSource(scale: ScaleEntry, fingerings: InstrumentFingerings, template: string): NowNextSource {
  return { pitches: [...scale.ascending, ...scale.descending], fingerings, template };
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
 * 枠の中身。音なら上から音名・運指図。表示する代替運指があれば（「別の運指を表示」がオンのときだけ）、
 * 運指図の下に「別の運指あり」
 */
export function frameHtml(source: NowNextSource, content: FrameContent, showAlternates: boolean): string {
  if (content.kind !== 'note') return `<p class="nn-message">${MESSAGES[content.kind]}</p>`;
  const { index } = content;
  const pitch = source.pitches[index]!;
  const name = displayPitch(pitch);
  const [primary, ...alternates] = noteFingerings(source, index, showAlternates);
  const fingering = primary ? fingeringSvg(source, index, primary) : '<p class="nn-message">運指データなし</p>';
  // 「別の運指あり」の行は、ないときも高さを取っておく（運指図の大きさが音ごとに変わらないように）
  const alt = alternates.length > 0 ? '<p class="nn-alt">別の運指あり</p>' : '<p class="nn-alt" aria-hidden="true"></p>';
  return `<p class="nn-name">${name}</p><div class="nn-fingering">${fingering}${alt}</div>`;
}

// ---- DOM ----

export type FrameName = 'now' | 'next';

export interface NowNextView {
  /** progress・選んだ音・「別の運指を表示」が変わったら呼ぶ。中身が同じ枠は書き換えない */
  update(progress: Progress, selectedIndex: number | null, showAlternates: boolean): void;
  /** 調を変えたら呼ぶ（次の update で両方の枠を描き直す） */
  setSource(source: NowNextSource): void;
  /** 再生中の拍の時刻。「いま」枠の枠線を拍に合わせて脈動させる（null で止める。SPEC 2.6） */
  setBeatClock(clock: BeatClock | null): void;
}

/** 音の切り替えのアニメーション（クロスフェード）の長さ（SPEC 2.6） */
export const CROSSFADE_MS = 120;

export interface NowNextHandlers {
  /** 音の入った枠をタップしたとき（S3 で拡大） */
  onOpen(frame: FrameName, index: number): void;
  /** 枠の上で左右にスワイプしたとき（+1 次の音、-1 前の音）。停止中かどうかは呼ぶ側で確かめる */
  onSwipe(direction: 1 | -1): void;
}

/**
 * root に「いま」「つぎ」の2枠を作る。タップで onOpen、左右のスワイプで onSwipe を呼ぶ
 */
export function mountNowNext(root: HTMLElement, initialSource: NowNextSource, handlers: NowNextHandlers): NowNextView {
  root.classList.add('now-next');
  root.innerHTML = (['now', 'next'] as const)
    .map(
      (name) =>
        `<section class="nn-frame nn-${name}" aria-label="${name === 'now' ? 'いま' : 'つぎ'}">` +
        (name === 'now' ? '<div class="nn-pulse" aria-hidden="true"></div>' : '') +
        `<h2 class="nn-title">${name === 'now' ? 'いま' : 'つぎ'}</h2>` +
        `<div class="nn-body" data-frame="${name}"><div class="nn-content"></div></div>` +
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
  const framePulse = createBeatPulse(FRAME_PULSE);
  const pulseRing = root.querySelector<HTMLDivElement>('.nn-pulse')!;

  /**
   * 枠の中身を入れ替える。crossfade が真なら、前の中身を同じ位置に重ねたまま薄くし、
   * 新しい中身を浮かび上がらせる（SPEC 2.6）。中身は動かさないので枠からはみ出さない。
   * 動きを減らす設定のときは、アニメーションなしですぐ切り替える
   */
  function show(name: FrameName, content: FrameContent, crossfade: boolean) {
    const body = bodies[name];
    const view = body.querySelector<HTMLDivElement>('.nn-content')!;
    const ghost = crossfade && !prefersReducedMotion() ? (view.cloneNode(true) as HTMLDivElement) : null;
    view.innerHTML = frameHtml(source, content, showAlternates);
    if (ghost) {
      // 前の切り替えが残っていたら消してから重ねる
      for (const old of body.querySelectorAll('.nn-ghost')) old.remove();
      ghost.classList.add('nn-ghost');
      ghost.setAttribute('aria-hidden', 'true');
      body.append(ghost);
      const options: KeyframeAnimationOptions = { duration: CROSSFADE_MS, easing: 'ease-out' };
      const remove = () => ghost.remove();
      ghost.animate([{ opacity: 1 }, { opacity: 0 }], options).finished.then(remove, remove);
      view.animate([{ opacity: 0 }, { opacity: 1 }], options);
    }
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

  // 左右のスワイプ（SPEC 2.6）。指を離した位置で向きを決める。スワイプしたあとのクリックでは S3 を開かない
  let swipeStart: { pointerId: number; x: number; y: number } | null = null;
  let swiped = false;
  root.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary) return;
    swipeStart = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    swiped = false;
  });
  root.addEventListener('pointerup', (event) => {
    if (!swipeStart || event.pointerId !== swipeStart.pointerId) return;
    const direction = swipeDirection(event.clientX - swipeStart.x, event.clientY - swipeStart.y);
    swipeStart = null;
    if (direction === null) return;
    swiped = true;
    handlers.onSwipe(direction);
  });
  root.addEventListener('pointercancel', () => {
    swipeStart = null;
  });

  for (const name of ['now', 'next'] as const) {
    const body = bodies[name];
    const open = () => {
      if (body.dataset.index) handlers.onOpen(name, Number(body.dataset.index));
    };
    body.addEventListener('click', () => {
      if (swiped) {
        swiped = false;
        return;
      }
      open();
    });
    body.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      open();
    });
  }

  return {
    update(progress, selectedIndex, alternates) {
      // 「別の運指を表示」を切り替えたら、両方の枠を描き直す（動かさない）
      if (alternates !== showAlternates) {
        showAlternates = alternates;
        shown = null;
      }
      const frames = nowNextFrames(progress, selectedIndex);
      if (shown && sameFrame(shown.now, frames.now) && sameFrame(shown.next, frames.next)) return;
      // 音が次へ進んだ切り替えだけクロスフェードする（離れた音を選んだときや、調を変えたときはすぐ切り替える）
      const advance = shown !== null && isAdvance(shown, frames);
      if (!shown || !sameFrame(shown.now, frames.now)) show('now', frames.now, advance);
      if (!shown || !sameFrame(shown.next, frames.next)) show('next', frames.next, advance);
      shown = frames;
    },
    setSource(next) {
      source = next;
      shown = null;
    },
    setBeatClock(clock) {
      framePulse.set(clock ? pulseRing : null, clock);
    },
  };
}
