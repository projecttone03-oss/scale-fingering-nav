import { describe, expect, it, vi } from 'vitest';
import { audibleTime } from '../src/audio/context.ts';
import { FADE, createPlayer, type PlayParams, type PlayerDeps } from '../src/audio/player.ts';
import { toneEnvelope } from '../src/audio/sounds.ts';
import { midiToFreq } from '../src/music/pitch.ts';
import { createStore } from '../src/state/store.ts';
import { FakeAudioContext } from './fakeAudio.ts';

// B♭トランペット ハ長調（記譜ニ長調）の16音（最高音 D5 = 74 は上行の最後と下行の最初で2回）
const WRITTEN = [62, 64, 66, 67, 69, 71, 73, 74, 74, 73, 71, 69, 67, 66, 64, 62];
const PARAMS: PlayParams = { writtenMidis: WRITTEN, transposition: -2, bpm: 60, noteValue: 'half' };
// 60 BPM・二分音符・開始時刻 0：t0 = 0.05、音 i は 4.05 + 2i、終了は 4.05 + 2 × 16 = 36.05
const noteStart = (i: number) => 4.05 + 2 * i;
const END = 36.05;

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

interface SetupOptions {
  unlock?: () => Promise<AudioContext>;
  audibleTime?: (ctx: AudioContext) => number;
}

function setup(options: SetupOptions = {}) {
  const ctx = new FakeAudioContext();
  const store = createStore();
  const intervals = new Map<number, () => void>();
  let nextTimer = 1;
  let frame: (() => void) | null = null;
  let frameId = 0;
  const cancelled: number[] = [];
  let hidden: (() => void) | null = null;

  const deps: PlayerDeps = {
    unlock: options.unlock ?? (() => Promise.resolve(ctx.asAudioContext)),
    audibleTime: options.audibleTime ?? ((c) => c.currentTime),
    requestFrame: (callback) => {
      frame = callback;
      return ++frameId;
    },
    cancelFrame: (id) => {
      cancelled.push(id);
      frame = null;
    },
    onHidden: (callback) => {
      hidden = callback;
      return () => {};
    },
    timer: {
      setInterval: (handler) => {
        intervals.set(nextTimer, handler);
        return nextTimer++;
      },
      clearInterval: (id) => intervals.delete(id),
    },
  };
  const player = createPlayer(store, deps);

  /** 時刻を進め、先読みの tick と次のフレームを1回ずつ走らせる */
  const advance = (time: number) => {
    ctx.currentTime = time;
    for (const handler of [...intervals.values()]) handler();
    const callback = frame;
    frame = null;
    callback?.();
  };
  /** 25ms ごとに tick とフレームを走らせながら time まで進める */
  const runUntil = (time: number) => {
    for (let t = ctx.currentTime; t < time; t += 0.025) advance(t);
    advance(time);
  };
  const progress = () => store.getState().progress;
  const pendingFrame = () => frame !== null;
  return { ctx, store, player, intervals, cancelled, advance, runUntil, progress, pendingFrame, hide: () => hidden?.() };
}

const clicks = (ctx: FakeAudioContext) => ctx.oscillators.filter((o) => o.type === 'sine');
const tones = (ctx: FakeAudioContext) => ctx.oscillators.filter((o) => o.type === 'triangle');
/** 1回目の再生で最初に作られるゲイン：[0] 再生ごとの出力（bus）、[1] 参考音の出力（toneBus） */
const busesOf = (ctx: FakeAudioContext) => ({ bus: ctx.gains[0]!, toneBus: ctx.gains[1]! });

describe('createPlayer（SPEC 2.7）', () => {
  it('再生ボタンで countin になり、カウントイン1拍目のアクセントから予約する', async () => {
    const { ctx, player, progress, intervals } = setup();
    player.play(PARAMS);
    expect(progress()).toEqual({ phase: 'countin', noteIndex: null });
    await flush();
    expect(intervals.size).toBe(1);
    expect(clicks(ctx).map((o) => [o.frequency.value, o.startAt])).toEqual([[1500, 0.05]]);
  });

  it('カウントインはクリックだけ。1音目から実音の参考音をクリックと同時に鳴らす', async () => {
    const { ctx, player, advance, progress } = setup();
    player.play(PARAMS);
    await flush();
    advance(3.5);
    expect(progress().phase).toBe('countin');
    expect(tones(ctx)).toHaveLength(0);
    expect(clicks(ctx).map((o) => o.frequency.value)).toEqual([1500, 1000, 1000, 1000]);

    advance(noteStart(0));
    expect(progress()).toEqual({ phase: 'playing', noteIndex: 0 });
    // 記譜 D4 + (-2) = 実音 C4
    expect(tones(ctx).map((o) => [o.frequency.value, o.startAt])).toEqual([[midiToFreq(60), noteStart(0)]]);
  });

  it('最後まで再生：クリックは 4 + 16×2 = 36 回（アクセントは1拍目だけ、終了時には鳴らない）、参考音は16音すべて実音で（最高音は2回）', async () => {
    const { ctx, player, runUntil } = setup();
    player.play(PARAMS);
    await flush();
    runUntil(END + 5);
    expect(clicks(ctx).map((o) => o.frequency.value)).toEqual([1500, ...Array(35).fill(1000)]);
    clicks(ctx).forEach((o, k) => expect(o.startAt).toBeCloseTo(0.05 + k, 9));
    expect(tones(ctx).map((o) => o.frequency.value)).toEqual(WRITTEN.map((m) => midiToFreq(m - 2)));
    tones(ctx).forEach((o, i) => expect(o.startAt).toBeCloseTo(noteStart(i), 9));
  });

  it('120 BPM・二分音符：参考音の長さは 1 秒（音価 × 拍の秒数）で、次の音と重ならない', async () => {
    const { ctx, player, runUntil } = setup();
    player.play({ ...PARAMS, bpm: 120 });
    await flush();
    runUntil(20);
    expect(tones(ctx)).toHaveLength(16);
    for (const o of tones(ctx)) expect(o.stopAt).toBeCloseTo(toneEnvelope(o.startAt!, 1).end, 9);
  });

  it('再生開始の時刻は、その時点の currentTime + 0.05（2回目以降の再生でも）', async () => {
    const { ctx, player, advance, progress } = setup();
    ctx.currentTime = 40;
    player.play(PARAMS);
    await flush();
    expect(clicks(ctx).map((o) => o.startAt)).toHaveLength(1);
    expect(clicks(ctx)[0]!.startAt).toBeCloseTo(40.05, 9);
    advance(40 + noteStart(3));
    expect(progress()).toEqual({ phase: 'playing', noteIndex: 3 });
  });

  it('progress は音が切り替わったときだけ通知する（SPEC 7.2）', async () => {
    const { store, player, advance } = setup();
    player.play(PARAMS);
    await flush();
    const listener = vi.fn();
    store.subscribe(listener);
    for (let t = 4; t < noteStart(1) + 0.5; t += 0.016) advance(t); // 約 60 fps で 2.5 秒
    const phases = listener.mock.calls.map(([state]) => `${state.progress.phase}:${state.progress.noteIndex}`);
    expect(phases).toEqual(['playing:0', 'playing:1']);
  });

  it('画面は出力遅延を差し引いた時刻で進み、音の予約は currentTime で行う', async () => {
    const latency = 0.2;
    const { ctx, player, advance, progress } = setup({ audibleTime: (c) => c.currentTime - latency });
    player.play(PARAMS);
    await flush();
    expect(clicks(ctx)[0]!.startAt).toBeCloseTo(0.05, 9);
    advance(noteStart(0) + 0.1);
    expect(progress().phase).toBe('countin'); // 音は鳴り始めたが、まだ耳に届いていない
    advance(noteStart(0) + latency + 0.001);
    expect(progress()).toEqual({ phase: 'playing', noteIndex: 0 });
  });

  it('16音目が終わったら自動停止し、done（最終音）を残す', async () => {
    const { player, advance, progress, intervals, pendingFrame } = setup();
    player.play(PARAMS);
    await flush();
    advance(END - 0.01);
    expect(progress()).toEqual({ phase: 'playing', noteIndex: 15 });
    advance(END);
    expect(progress()).toEqual({ phase: 'done', noteIndex: 15 });
    expect(intervals.size).toBe(0);
    expect(pendingFrame()).toBe(false);
  });

  it('再生中に再生ボタンを押しても二重に再生しない。終了後はもう一度、その時刻から再生できる', async () => {
    const { ctx, player, advance, progress } = setup();
    const outputs = () => ctx.gains.filter((g) => g.connections.includes(ctx.destination));
    player.play(PARAMS);
    player.play(PARAMS);
    await flush();
    expect(outputs()).toHaveLength(1);
    advance(END);
    expect(progress().phase).toBe('done');
    const before = ctx.oscillators.length;
    player.play(PARAMS);
    expect(progress().phase).toBe('countin');
    await flush();
    expect(outputs()).toHaveLength(2);
    const added = ctx.oscillators.slice(before);
    expect(added).toHaveLength(1);
    expect(added[0]!.startAt).toBeCloseTo(END + 0.05, 9);
  });

  it('16音でないデータは受け付けない', () => {
    const { player } = setup();
    expect(() => player.play({ ...PARAMS, writtenMidis: WRITTEN.slice(0, 15) })).toThrow();
  });
});

describe('参考音の ON/OFF（再生中も切り替えられる。SPEC 2.4・2.7）', () => {
  it('参考音は ON/OFF に関係なく予約し、参考音専用の出力のゲインで切り替える', async () => {
    const { ctx, store, player, runUntil } = setup();
    store.setState({ toneEnabled: false });
    player.play(PARAMS);
    await flush();
    const { bus, toneBus } = busesOf(ctx);
    expect(toneBus.gain.value).toBe(0);
    expect(toneBus.connections).toEqual([bus]);
    runUntil(noteStart(2));
    expect(tones(ctx)).toHaveLength(3);
    // 参考音は toneBus へ、クリックは bus へ
    for (const o of tones(ctx)) expect((o.connections[0] as { connections: unknown[] }).connections).toEqual([toneBus]);
    for (const o of clicks(ctx)) expect((o.connections[0] as { connections: unknown[] }).connections).toEqual([bus]);
  });

  it('鳴っている途中で OFF にすると、その時刻から FADE で消える', async () => {
    const { ctx, store, player, advance } = setup();
    player.play(PARAMS);
    await flush();
    const { toneBus } = busesOf(ctx);
    expect(toneBus.gain.value).toBe(1);
    const t = noteStart(0) + 0.5;
    advance(t);
    store.setState({ toneEnabled: false });
    expect(toneBus.gain.calls).toEqual([
      ['cancel', 0, t],
      ['set', 1, t],
      ['linear', 0, t + FADE],
    ]);
  });

  it('音の開始の 50ms 前（予約済み）に OFF にしても、その音は頭から聞こえない', async () => {
    const { ctx, store, player, advance } = setup();
    player.play(PARAMS);
    await flush();
    const { toneBus } = busesOf(ctx);
    const t = noteStart(1) - 0.05;
    advance(t);
    expect(tones(ctx).map((o) => o.startAt)).toContain(noteStart(1)); // すでに予約済み
    store.setState({ toneEnabled: false });
    const [, , ramp] = toneBus.gain.calls;
    expect(ramp).toEqual(['linear', 0, t + FADE]);
    expect(t + FADE).toBeLessThan(noteStart(1));
  });

  it('音の開始の 50ms 前（予約済み）に ON にすると、その音の頭から聞こえる', async () => {
    const { ctx, store, player, advance } = setup();
    store.setState({ toneEnabled: false });
    player.play(PARAMS);
    await flush();
    const { toneBus } = busesOf(ctx);
    const t = noteStart(1) - 0.05;
    advance(t);
    store.setState({ toneEnabled: true });
    expect(toneBus.gain.calls).toEqual([
      ['cancel', 0, t],
      ['set', 0, t],
      ['set', 1, noteStart(1)],
    ]);
  });

  it('鳴っている途中で ON にしても、その音は途中から鳴らさず、次の音の頭から鳴らす', async () => {
    const { ctx, store, player, advance } = setup();
    store.setState({ toneEnabled: false });
    player.play(PARAMS);
    await flush();
    const { toneBus } = busesOf(ctx);
    advance(noteStart(1) + 0.5);
    store.setState({ toneEnabled: true });
    expect(toneBus.gain.calls.at(-1)).toEqual(['set', 1, noteStart(2)]);
  });

  it('最後の音の途中で ON にしても鳴らさない（次の音がない）', async () => {
    const { ctx, store, player, advance } = setup();
    store.setState({ toneEnabled: false });
    player.play(PARAMS);
    await flush();
    const { toneBus } = busesOf(ctx);
    advance(noteStart(15) + 0.5);
    store.setState({ toneEnabled: true });
    expect(toneBus.gain.calls.filter(([kind, value]) => kind === 'set' && value === 1)).toEqual([]);
  });

  it('停止した後の切り替えには反応しない（購読を解除している）', async () => {
    const { ctx, store, player, advance } = setup();
    player.play(PARAMS);
    await flush();
    const { toneBus } = busesOf(ctx);
    advance(noteStart(0));
    player.stop();
    store.setState({ toneEnabled: false });
    expect(toneBus.gain.calls).toEqual([]);
  });
});

describe('停止（SPEC 2.7-5・6.1）', () => {
  it('停止ボタン：FADE で音量を 0 にしてから予約済みの音を止め、鳴り終わったら出力を外し、先頭（idle）に戻す', async () => {
    const { ctx, player, advance, progress, intervals, cancelled, pendingFrame } = setup();
    player.play(PARAMS);
    await flush();
    const { bus, toneBus } = busesOf(ctx);
    const t = noteStart(1) + 0.3;
    advance(t);
    player.stop();
    expect(progress()).toEqual({ phase: 'idle', noteIndex: null });
    expect(intervals.size).toBe(0);
    expect(cancelled.length).toBe(1);
    expect(pendingFrame()).toBe(false);
    // いきなり切らず、FADE かけて 0 へ
    expect(bus.gain.calls).toEqual([
      ['cancel', 0, t],
      ['set', 1, t],
      ['linear', 0, t + FADE],
    ]);
    // 予約時に終わりの時刻で stop 済み（1回目）。停止で FADE 後に止め直す（2回目）。まだ始まっていない音も同じ
    expect(ctx.oscillators.length).toBeGreaterThan(0);
    for (const o of ctx.oscillators) expect([o.stopCalls, o.stopAt]).toEqual([2, t + FADE]);
    // 鳴り終わる（ended）までは出力を外さない。全部鳴り終わったら外す
    expect(bus.disconnected).toBe(false);
    for (const o of ctx.oscillators) o.fireEnded();
    expect(bus.disconnected).toBe(true);
    expect(toneBus.disconnected).toBe(true);
  });

  it('resume を待つあいだに停止したら、再生を始めない', async () => {
    let resolve!: (ctx: AudioContext) => void;
    const pending = new Promise<AudioContext>((r) => (resolve = r));
    const { ctx, player, progress, intervals } = setup({ unlock: () => pending });
    player.play(PARAMS);
    player.stop();
    resolve(ctx.asAudioContext);
    await flush();
    expect(progress().phase).toBe('idle');
    expect(intervals.size).toBe(0);
    expect(ctx.oscillators).toHaveLength(0);
  });

  it('AudioContext を使えなかったら idle に戻す', async () => {
    const { player, progress } = setup({ unlock: () => Promise.reject(new Error('not allowed')) });
    player.play(PARAMS);
    await flush();
    expect(progress().phase).toBe('idle');
  });

  it('ページが非表示になったら停止する（SPEC 6.1）', async () => {
    const { player, advance, progress, hide, intervals } = setup();
    player.play(PARAMS);
    await flush();
    advance(noteStart(3));
    hide();
    expect(progress().phase).toBe('idle');
    expect(intervals.size).toBe(0);
  });

  it('resume を待つあいだに非表示になっても、再生を始めない', async () => {
    let resolve!: (ctx: AudioContext) => void;
    const pending = new Promise<AudioContext>((r) => (resolve = r));
    const { ctx, player, progress, intervals, hide } = setup({ unlock: () => pending });
    player.play(PARAMS);
    hide();
    resolve(ctx.asAudioContext);
    await flush();
    expect(progress().phase).toBe('idle');
    expect(intervals.size).toBe(0);
    expect(ctx.oscillators).toHaveLength(0);
  });
});

describe('audibleTime（出力遅延を差し引いた時刻）', () => {
  it('outputLatency を差し引く。対応しないブラウザ（undefined）では currentTime のまま', () => {
    expect(audibleTime({ currentTime: 10, outputLatency: 0.2 } as AudioContext)).toBeCloseTo(9.8, 9);
    expect(audibleTime({ currentTime: 10 } as AudioContext)).toBe(10);
  });
});
