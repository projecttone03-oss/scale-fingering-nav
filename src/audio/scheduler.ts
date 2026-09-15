// 先読みスケジューラ（SPEC 6.4）と、時刻から進行度を引く関数（SPEC 7.2）。
// ここは Web Audio にも DOM にも触れない。音を鳴らすのは onSchedule を渡す側（player.ts）。
import type { NoteValue } from '../render/staff.ts';
import { NOTE_COUNT, type Progress } from '../state/store.ts';

export const COUNT_IN_BEATS = 4;
export const BEATS_PER_NOTE: Record<NoteValue, number> = { whole: 4, half: 2, quarter: 1 };

/** 再生開始（currentTime）から最初の拍までの余裕（秒） */
export const START_DELAY = 0.05;
/** 先読み幅（秒） */
export const LOOKAHEAD = 0.1;
/** tick 間隔（ミリ秒） */
export const TICK_INTERVAL_MS = 25;

/**
 * countin：カウントインの拍、note：音の開始（クリック＋参考音）、
 * beat：音の途中の拍（クリックだけ）、end：最後の音が終わる時刻
 */
export type EventKind = 'countin' | 'note' | 'beat' | 'end';

export interface ScheduleEvent {
  /** 0 から数えた拍 */
  beat: number;
  /** AudioContext の絶対時刻（秒） */
  time: number;
  kind: EventKind;
  /** note / beat のとき、その拍が属する音（0〜14） */
  noteIndex?: number;
  /** 強拍のクリック（カウントインの1拍目） */
  accent?: boolean;
  /** note のとき、音の長さ（秒） */
  duration?: number;
}

/**
 * 再生開始時に一度だけ作るイベント表（時刻順）。拍 k の時刻は t0 + k × (60 / bpm) で、
 * 足し算を重ねないので長く再生しても誤差がたまらない
 */
export function buildEventTable(t0: number, bpm: number, noteValue: NoteValue): ScheduleEvent[] {
  const secondsPerBeat = 60 / bpm;
  const beatsPerNote = BEATS_PER_NOTE[noteValue];
  const at = (beat: number) => t0 + beat * secondsPerBeat;

  const events: ScheduleEvent[] = [];
  for (let beat = 0; beat < COUNT_IN_BEATS; beat++) {
    events.push({ beat, time: at(beat), kind: 'countin', accent: beat === 0 });
  }
  for (let i = 0; i < NOTE_COUNT; i++) {
    const start = COUNT_IN_BEATS + i * beatsPerNote;
    events.push({ beat: start, time: at(start), kind: 'note', noteIndex: i, duration: beatsPerNote * secondsPerBeat });
    for (let b = 1; b < beatsPerNote; b++) {
      events.push({ beat: start + b, time: at(start + b), kind: 'beat', noteIndex: i });
    }
  }
  const endBeat = COUNT_IN_BEATS + NOTE_COUNT * beatsPerNote;
  events.push({ beat: endBeat, time: at(endBeat), kind: 'end' });
  return events;
}

/**
 * 時刻 time の進行度。time 以下で最後のイベントを二分探索で引く。
 * 音の切り替わりの瞬間（time がちょうど音の開始時刻）は新しい音に入る
 */
export function progressAt(events: readonly ScheduleEvent[], time: number): Progress {
  let lo = 0;
  let hi = events.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (events[mid]!.time <= time) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  const event = events[found];
  if (!event || event.kind === 'countin') return { phase: 'countin', noteIndex: null };
  if (event.kind === 'end') return { phase: 'done', noteIndex: NOTE_COUNT - 1 };
  return { phase: 'playing', noteIndex: event.noteIndex! };
}

export interface Timer {
  setInterval(handler: () => void, ms: number): number;
  clearInterval(id: number): void;
}

const browserTimer: Timer = {
  setInterval: (handler, ms) => window.setInterval(handler, ms),
  clearInterval: (id) => window.clearInterval(id),
};

export interface LookaheadScheduler {
  start(): void;
  stop(): void;
  /** 1回分の先読み（start が setInterval で呼ぶ。テストでは直接呼ぶ） */
  tick(): void;
}

/**
 * 先読みスケジューラ。tick ごとに「時刻 < 現在 + LOOKAHEAD」のイベントを onSchedule に渡す。
 * 渡したイベントは二度と渡さない（イベント表は時刻順なので、次に渡す位置だけ覚えればよい）
 */
export function createLookaheadScheduler(
  events: readonly ScheduleEvent[],
  now: () => number,
  onSchedule: (event: ScheduleEvent) => void,
  timer: Timer = browserTimer,
): LookaheadScheduler {
  let next = 0;
  let intervalId: number | null = null;
  const tick = () => {
    const limit = now() + LOOKAHEAD;
    while (next < events.length && events[next]!.time < limit) {
      onSchedule(events[next]!);
      next++;
    }
  };
  return {
    start() {
      if (intervalId !== null) return;
      tick();
      intervalId = timer.setInterval(tick, TICK_INTERVAL_MS);
    },
    stop() {
      if (intervalId !== null) timer.clearInterval(intervalId);
      intervalId = null;
    },
    tick,
  };
}
