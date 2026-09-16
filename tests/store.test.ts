import { describe, expect, it, vi } from 'vitest';
import {
  COUNTIN,
  IDLE,
  INITIAL_STATE,
  NOTE_COUNT,
  clampBpm,
  createStore,
  isPlaying,
  nowNext,
  staffHighlight,
  type Progress,
} from '../src/state/store.ts';

describe('AppState の既定値（SPEC 7.4）', () => {
  it('調 C_major・60 BPM・二分音符・参考音 ON・停止中', () => {
    expect(INITIAL_STATE).toEqual({
      instrumentId: null,
      keyId: 'C_major',
      bpm: 60,
      noteValue: 'half',
      toneEnabled: true,
      progress: { noteIndex: null, phase: 'idle' },
      previewIndex: null,
    });
    expect(NOTE_COUNT).toBe(16);
  });
});

describe('createStore', () => {
  it('setState は渡した項目だけ書き換え、(新しい状態, 前の状態) で通知する', () => {
    const store = createStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.setState({ bpm: 90 });
    expect(store.getState().bpm).toBe(90);
    expect(store.getState().keyId).toBe('C_major');
    expect(listener).toHaveBeenCalledTimes(1);
    const [state, prev] = listener.mock.calls[0]!;
    expect(state.bpm).toBe(90);
    expect(prev.bpm).toBe(60);
  });

  it('値が変わらなければ通知しない（progress は中身で比べる）', () => {
    const store = createStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.setState({ bpm: 60 });
    store.setState({ progress: { noteIndex: null, phase: 'idle' } });
    expect(listener).not.toHaveBeenCalled();
    store.setState({ progress: { noteIndex: 3, phase: 'playing' } });
    store.setState({ progress: { noteIndex: 3, phase: 'playing' } });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('subscribe の戻り値で解除できる。通知中に解除しても他の購読者に届く', () => {
    const store = createStore();
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = store.subscribe(() => {
      first();
      unsubscribeFirst();
    });
    store.subscribe(second);
    store.setState({ bpm: 70 });
    store.setState({ bpm: 80 });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });
});

describe('clampBpm（40〜160 BPM の整数）', () => {
  it.each([
    [60, 60],
    [39, 40],
    [161, 160],
    [72.4, 72],
    [Number.NaN, 60],
  ])('%f → %i', (input, expected) => {
    expect(clampBpm(input)).toBe(expected);
  });
});

describe('いま／つぎの導出（SPEC 7.3）と五線譜のハイライト（SPEC 2.5）', () => {
  const playing = (i: number): Progress => ({ phase: 'playing', noteIndex: i });
  const done: Progress = { phase: 'done', noteIndex: 15 };

  it.each([
    ['idle', IDLE, { now: null, next: 0 }, { current: null, next: null }],
    ['countin', COUNTIN, { now: null, next: 0 }, { current: null, next: 0 }],
    ['playing 0', playing(0), { now: 0, next: 1 }, { current: 0, next: 1 }],
    ['playing 7', playing(7), { now: 7, next: 8 }, { current: 7, next: 8 }],
    ['playing 14', playing(14), { now: 14, next: 15 }, { current: 14, next: 15 }],
    ['playing 15', playing(15), { now: 15, next: 'end' }, { current: 15, next: null }],
    ['done', done, { now: 15, next: 'end' }, { current: 15, next: null }],
  ] as const)('%s', (_, progress, expectedNowNext, expectedHighlight) => {
    expect(nowNext(progress)).toEqual(expectedNowNext);
    expect(staffHighlight(progress)).toEqual(expectedHighlight);
  });

  it('isPlaying はカウントイン中と再生中だけ真', () => {
    expect([IDLE, COUNTIN, playing(3), done].map(isPlaying)).toEqual([false, true, true, false]);
  });
});
