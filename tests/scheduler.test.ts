import { describe, expect, it } from 'vitest';
import {
  BEATS_PER_NOTE,
  COUNT_IN_BEATS,
  LOOKAHEAD,
  TICK_INTERVAL_MS,
  buildEventTable,
  createLookaheadScheduler,
  progressAt,
  type ScheduleEvent,
  type Timer,
} from '../src/audio/scheduler.ts';
import type { NoteValue } from '../src/render/staff.ts';

const T0 = 10.05;
const notesOf = (events: ScheduleEvent[]) => events.filter((e) => e.kind === 'note');

describe('buildEventTable（SPEC 6.4）', () => {
  it('bpm=60・二分音符で、音 i の時刻は t0 + (4 + 2i) 秒（SPEC 10.1）', () => {
    const notes = notesOf(buildEventTable(T0, 60, 'half'));
    expect(notes).toHaveLength(16);
    notes.forEach((note, i) => {
      expect(note.noteIndex).toBe(i);
      expect(note.time).toBeCloseTo(T0 + (4 + 2 * i), 9);
      expect(note.duration).toBeCloseTo(2, 9);
    });
  });

  it('カウントインは 4 拍、1 拍目だけアクセント', () => {
    const countin = buildEventTable(T0, 60, 'half').filter((e) => e.kind === 'countin');
    expect(countin.map((e) => [e.beat, e.time, e.accent])).toEqual([
      [0, T0, true],
      [1, T0 + 1, false],
      [2, T0 + 2, false],
      [3, T0 + 3, false],
    ]);
  });

  it.each([
    ['whole', 60, 4],
    ['whole', 90, 4],
    ['half', 60, 2],
    ['half', 120, 2],
    ['quarter', 120, 1],
    ['quarter', 40, 1],
  ] as [NoteValue, number, number][])('%s・%i BPM：音の途中の拍にもクリック、end は 4 + 16 × %i 拍目', (value, bpm, bpn) => {
    const events = buildEventTable(T0, bpm, value);
    const spb = 60 / bpm;
    expect(BEATS_PER_NOTE[value]).toBe(bpn);
    // 拍は 0 から end まで 1 つずつ、時刻は t0 + 拍 × (60 / bpm)
    const endBeat = COUNT_IN_BEATS + 16 * bpn;
    expect(events.map((e) => e.beat)).toEqual(Array.from({ length: endBeat + 1 }, (_, k) => k));
    for (const e of events) expect(e.time).toBeCloseTo(T0 + e.beat * spb, 9);
    // 種類ごとの数
    const count = (kind: string) => events.filter((e) => e.kind === kind).length;
    expect([count('countin'), count('note'), count('beat'), count('end')]).toEqual([4, 16, 16 * (bpn - 1), 1]);
    // 音の途中の拍は、その音の noteIndex を持つ
    for (const e of events.filter((e) => e.kind === 'beat')) {
      expect(e.noteIndex).toBe(Math.floor((e.beat - COUNT_IN_BEATS) / bpn));
    }
    // 音の長さは「音価の拍数 × 1拍の秒数」（拍数そのものではない）
    for (const e of notesOf(events)) expect(e.duration).toBeCloseTo(bpn * spb, 9);
    // アクセントはカウントインの1拍目だけ
    expect(events.filter((e) => e.accent).map((e) => e.beat)).toEqual([0]);
  });

  it('長く再生しても誤差がたまらない（時刻を足し算で重ねない）', () => {
    const events = buildEventTable(0, 97, 'quarter');
    const end = events.at(-1)!;
    expect(end.time).toBe((4 + 16) * (60 / 97));
  });
});

describe('progressAt：時刻 → 進行度（SPEC 7.2・10.1）', () => {
  const events = buildEventTable(T0, 60, 'half');
  const noteTime = (i: number) => notesOf(events)[i]!.time;
  const EPS = 1e-9;

  it('再生開始前とカウントイン中は countin', () => {
    expect(progressAt(events, 0)).toEqual({ phase: 'countin', noteIndex: null });
    expect(progressAt(events, T0)).toEqual({ phase: 'countin', noteIndex: null });
    expect(progressAt(events, T0 + 3.5)).toEqual({ phase: 'countin', noteIndex: null });
    expect(progressAt(events, noteTime(0) - EPS)).toEqual({ phase: 'countin', noteIndex: null });
  });

  it('音の切り替わりの瞬間は新しい音に入り、その直前は前の音のまま', () => {
    for (let i = 0; i < 16; i++) {
      expect(progressAt(events, noteTime(i))).toEqual({ phase: 'playing', noteIndex: i });
      if (i > 0) expect(progressAt(events, noteTime(i) - EPS)).toEqual({ phase: 'playing', noteIndex: i - 1 });
    }
  });

  it('音の途中の拍（クリックだけ鳴る拍）でも同じ音のまま', () => {
    expect(progressAt(events, noteTime(3) + 1)).toEqual({ phase: 'playing', noteIndex: 3 });
    expect(progressAt(events, noteTime(3) + 1.999)).toEqual({ phase: 'playing', noteIndex: 3 });
  });

  it('最後の音が終わった瞬間から done（最終音を残す）', () => {
    const end = events.at(-1)!.time;
    expect(progressAt(events, end - EPS)).toEqual({ phase: 'playing', noteIndex: 15 });
    expect(progressAt(events, end)).toEqual({ phase: 'done', noteIndex: 15 });
    expect(progressAt(events, end + 100)).toEqual({ phase: 'done', noteIndex: 15 });
  });

  it('割り切れないテンポ（90 BPM）でも、表の時刻ちょうどで切り替わる', () => {
    const table = buildEventTable(0.05, 90, 'quarter');
    for (const e of table.filter((e) => e.kind === 'note')) {
      expect(progressAt(table, e.time).noteIndex).toBe(e.noteIndex);
    }
  });
});

describe('createLookaheadScheduler（先読み）', () => {
  function setup() {
    let now = 0;
    const scheduled: ScheduleEvent[] = [];
    const intervals = new Map<number, () => void>();
    let nextId = 1;
    const timer: Timer = {
      setInterval: (handler, ms) => {
        expect(ms).toBe(TICK_INTERVAL_MS);
        intervals.set(nextId, handler);
        return nextId++;
      },
      clearInterval: (id) => intervals.delete(id),
    };
    const events = buildEventTable(0.05, 60, 'half');
    const scheduler = createLookaheadScheduler(events, () => now, (e) => scheduled.push(e), timer);
    const runTicks = (time: number) => {
      now = time;
      for (const handler of intervals.values()) handler();
    };
    return { events, scheduler, scheduled, intervals, runTicks };
  }

  it('tick 間隔 25ms・先読み幅 100ms（SPEC 6.4）。tick 間隔は先読み幅より短い', () => {
    expect(TICK_INTERVAL_MS).toBe(25);
    expect(LOOKAHEAD).toBe(0.1);
    expect(TICK_INTERVAL_MS / 1000).toBeLessThan(LOOKAHEAD);
  });

  it('start で「時刻 < 現在 + 100ms」のイベントだけ予約し、tick を始める', () => {
    const { scheduler, scheduled, intervals } = setup();
    scheduler.start();
    expect(scheduled.map((e) => e.beat)).toEqual([0]);
    expect(intervals.size).toBe(1);
  });

  it('予約済みのイベントは二度と予約しない。先読み幅ちょうどの時刻はまだ予約しない', () => {
    const { scheduler, scheduled, runTicks } = setup();
    scheduler.start();
    runTicks(0.5);
    runTicks(0.9); // 1.05 - 0.1 = 0.95 → まだ
    expect(scheduled.map((e) => e.beat)).toEqual([0]);
    runTicks(0.95); // 1.05 < 0.95 + 0.1 は浮動小数で境界ちょうど。予約はどちらでもよいが重複しないこと
    runTicks(0.96);
    runTicks(0.97);
    expect(scheduled.map((e) => e.beat)).toEqual([0, 1]);
  });

  it('tick が遅れても、たまったイベントを時刻順に一度ずつ予約する', () => {
    const { events, scheduler, scheduled, runTicks } = setup();
    scheduler.start();
    runTicks(10);
    expect(scheduled.map((e) => e.beat)).toEqual(events.filter((e) => e.time < 10.1).map((e) => e.beat));
    runTicks(1000);
    expect(scheduled).toHaveLength(events.length);
    expect(new Set(scheduled).size).toBe(events.length);
  });

  it('stop で tick を止め、start を二度呼んでも tick は1つ', () => {
    const { scheduler, intervals } = setup();
    scheduler.start();
    scheduler.start();
    expect(intervals.size).toBe(1);
    scheduler.stop();
    expect(intervals.size).toBe(0);
  });
});
