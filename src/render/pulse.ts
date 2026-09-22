// 拍に合わせた脈動（SPEC 2.5, 2.6, 7.2）。「いま」枠の枠線と、五線譜の現在音のガイド（赤い背景）を拍ごとにわずかに濃くする。
//
// 音とハイライトの同期を崩さないための作り：
// - 毎拍 JavaScript を動かさない。再生開始時に一度だけ、拍の時刻（beatClock）を起点に Web Animations の
//   繰り返しアニメーションを作り、あとはブラウザに任せる（setTimeout は使わない）。
// - 動かすのは脈動用に重ねた要素の opacity だけ（レイアウトを変えない）。音の予約・progress の計算には関わらない。
// - prefers-reduced-motion が reduce のときは動かさない。
import type { BeatClock } from '../state/store.ts';

/**
 * 脈動の形：拍の頭で最も濃く、拍の半分までに消える。濃さはこの opacity で調整する
 * （M4 の実機確認で、演奏中に視界の端でも拍が分かるよう、枠 0.5 → 1、ガイド 0.14 → 0.35 に強めた）
 */
export const FRAME_PULSE: Keyframe[] = [
  { opacity: 1, easing: 'ease-out' },
  { opacity: 0, offset: 0.5 },
  { opacity: 0 },
];
export const GUIDE_PULSE: Keyframe[] = [
  { opacity: 0.35, easing: 'ease-out' },
  { opacity: 0, offset: 0.5 },
  { opacity: 0 },
];

export const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * element を拍ごとに脈動させる。拍 k の頭（clock.origin + k × clock.beatMs）でキーフレームの先頭になるよう、
 * アニメーションの開始時刻を拍の時刻にそろえる（document.timeline の時刻は performance.now() と同じ基準）。
 * 動きを減らす設定のときは何もせず null
 */
export function startBeatPulse(element: Element, clock: BeatClock, keyframes: Keyframe[]): Animation | null {
  if (prefersReducedMotion()) return null;
  const animation = element.animate(keyframes, { duration: clock.beatMs, iterations: Infinity });
  animation.startTime = clock.origin;
  return animation;
}

export interface BeatPulse {
  /** 脈動させる要素と拍の時刻。どちらかが null なら止める。前と同じなら何もしない */
  set(element: Element | null, clock: BeatClock | null): void;
}

/** 1つの脈動を、対象の要素や拍の時刻が変わるたびに作り直す */
export function createBeatPulse(keyframes: Keyframe[]): BeatPulse {
  let target: Element | null = null;
  let current: BeatClock | null = null;
  let animation: Animation | null = null;
  return {
    set(element, clock) {
      if (element === target && clock === current) return;
      animation?.cancel();
      animation = null;
      target = element;
      current = clock;
      if (element && clock) animation = startBeatPulse(element, clock, keyframes);
    },
  };
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * 五線譜のガイド（音符の背景 .note-bg）の上に重ねる脈動用の矩形。ガイドが別の音符に移ったら、その音符に移して作り直す
 */
export function createGuidePulse(): { set(root: ParentNode, index: number | null, clock: BeatClock | null): void } {
  const rect = document.createElementNS(SVG_NS, 'rect');
  rect.setAttribute('class', 'note-pulse');
  rect.setAttribute('aria-hidden', 'true');
  const pulse = createBeatPulse(GUIDE_PULSE);
  let background: Element | null = null;
  return {
    set(root, index, clock) {
      const next = index === null || !clock ? null : root.querySelector(`.note[data-index="${index}"] .note-bg`);
      if (next !== background) {
        // 別の音符に移すときは、アニメーションを作り直す（要素を移したあとも動き続けるかはブラウザによる）
        pulse.set(null, null);
        background = next;
        rect.remove();
        if (next) {
          for (const name of ['x', 'y', 'width', 'height', 'rx']) rect.setAttribute(name, next.getAttribute(name) ?? '0');
          next.after(rect);
        }
      }
      pulse.set(next ? rect : null, clock);
    },
  };
}
