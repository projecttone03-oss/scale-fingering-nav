import { afterEach, describe, expect, it, vi } from 'vitest';
import { FRAME_PULSE, GUIDE_PULSE, createBeatPulse, startBeatPulse } from '../src/render/pulse.ts';
import type { BeatClock } from '../src/state/store.ts';

/** animate() の呼び出しを記録する偽の要素（DOM を使わない） */
function fakeElement() {
  const animations: { keyframes: Keyframe[]; options: KeyframeAnimationOptions; startTime: number | null; cancelled: boolean }[] = [];
  const element = {
    animate(keyframes: Keyframe[], options: KeyframeAnimationOptions) {
      const record = { keyframes, options, startTime: null as number | null, cancelled: false };
      animations.push(record);
      return {
        set startTime(value: number) {
          record.startTime = value;
        },
        cancel() {
          record.cancelled = true;
        },
      };
    },
  };
  return { element: element as unknown as Element, animations };
}

const reducedMotion = (reduce: boolean) =>
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduce && query.includes('reduce') }));

const CLOCK: BeatClock = { origin: 5050, beatMs: 500 };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('拍に合わせた脈動（SPEC 7.2）', () => {
  it('1拍の長さで繰り返し、開始時刻を拍の時刻（カウントイン1拍目）にそろえる', () => {
    reducedMotion(false);
    const { element, animations } = fakeElement();
    startBeatPulse(element, CLOCK, FRAME_PULSE);
    expect(animations).toHaveLength(1);
    expect(animations[0]!.options).toEqual({ duration: 500, iterations: Infinity });
    expect(animations[0]!.startTime).toBe(5050);
  });

  it('動かすのは opacity だけで、拍の頭で最も濃く、拍の半分で消える', () => {
    for (const keyframes of [FRAME_PULSE, GUIDE_PULSE]) {
      const properties = new Set(keyframes.flatMap((k) => Object.keys(k).filter((key) => key !== 'offset' && key !== 'easing')));
      expect([...properties]).toEqual(['opacity']);
      expect(keyframes[1]).toMatchObject({ opacity: 0, offset: 0.5 });
    }
    // 強さ：M4 の実機確認で、視界の端でも拍が分かるよう強めた（枠 0.5 → 1、ガイド 0.14 → 0.35）
    expect(FRAME_PULSE[0]!.opacity).toBe(1);
    expect(GUIDE_PULSE[0]!.opacity).toBe(0.35);
  });

  it('prefers-reduced-motion が reduce なら動かさない', () => {
    reducedMotion(true);
    const { element, animations } = fakeElement();
    expect(startBeatPulse(element, CLOCK, FRAME_PULSE)).toBeNull();
    expect(animations).toHaveLength(0);
  });

  it('createBeatPulse：同じ要素・同じ拍の時刻なら作り直さない。変わったら前のアニメーションを止めて作り直す。null で止める', () => {
    reducedMotion(false);
    const { element, animations } = fakeElement();
    const pulse = createBeatPulse(FRAME_PULSE);
    pulse.set(element, CLOCK);
    pulse.set(element, CLOCK);
    expect(animations).toHaveLength(1);

    const resynced: BeatClock = { origin: 5090, beatMs: 500 };
    pulse.set(element, resynced);
    expect(animations.map((a) => [a.startTime, a.cancelled])).toEqual([
      [5050, true],
      [5090, false],
    ]);

    pulse.set(element, null);
    expect(animations[1]!.cancelled).toBe(true);
    expect(animations).toHaveLength(2);
  });
});
