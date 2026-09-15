// アプリ状態のストアと subscribe（SPEC 7.4）。フレームワークは使わない。
import type { InstrumentId } from '../data/instruments.ts';
import type { NoteValue } from '../render/staff.ts';

/** スケールの音数（上行8音＋下行7音） */
export const NOTE_COUNT = 15;

export type Phase = 'idle' | 'countin' | 'playing' | 'done';

/** UI が参照する唯一の進行度（SPEC 7.1） */
export interface Progress {
  noteIndex: number | null;
  phase: Phase;
}

export interface AppState {
  instrumentId: InstrumentId | null;
  keyId: string;
  bpm: number;
  noteValue: NoteValue;
  toneEnabled: boolean;
  progress: Progress;
  /** 停止中に音符タップで予習表示する音 */
  previewIndex: number | null;
}

export const IDLE: Progress = { noteIndex: null, phase: 'idle' };
export const COUNTIN: Progress = { noteIndex: null, phase: 'countin' };

export const INITIAL_STATE: AppState = {
  instrumentId: null,
  keyId: 'C_major',
  bpm: 60,
  noteValue: 'half',
  toneEnabled: true,
  progress: IDLE,
  previewIndex: null,
};

export const BPM_MIN = 40;
export const BPM_MAX = 160;

/** テンポを 40〜160 BPM の整数にそろえる（SPEC 2.4） */
export function clampBpm(bpm: number): number {
  if (!Number.isFinite(bpm)) return INITIAL_STATE.bpm;
  return Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(bpm)));
}

export const sameProgress = (a: Progress, b: Progress) => a.phase === b.phase && a.noteIndex === b.noteIndex;

/** 再生中（カウントイン中を含む）か。再生中は調・音価・テンポを変えられない */
export const isPlaying = (p: Progress) => p.phase === 'countin' || p.phase === 'playing';

export type Listener = (state: AppState, prev: AppState) => void;

export interface Store {
  getState(): AppState;
  /** 渡した項目だけ書き換える。値が変わらなければ通知しない */
  setState(patch: Partial<AppState>): void;
  /** 変更のたびに (新しい状態, 前の状態) で呼ぶ。戻り値で解除 */
  subscribe(listener: Listener): () => void;
}

export function createStore(initial: AppState = INITIAL_STATE): Store {
  let state = initial;
  const listeners = new Set<Listener>();
  return {
    getState: () => state,
    setState(patch) {
      const changed = (Object.keys(patch) as (keyof AppState)[]).some((key) =>
        key === 'progress' ? !sameProgress(patch.progress!, state.progress) : patch[key] !== state[key],
      );
      if (!changed) return;
      const prev = state;
      state = { ...state, ...patch };
      for (const listener of [...listeners]) listener(state, prev);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** いま／つぎ（SPEC 7.3）。next の 'end' は「おわり」 */
export function nowNext(p: Progress): { now: number | null; next: number | 'end' } {
  switch (p.phase) {
    case 'idle':
    case 'countin':
      return { now: null, next: 0 };
    case 'playing': {
      const i = p.noteIndex ?? 0;
      return { now: i, next: i < NOTE_COUNT - 1 ? i + 1 : 'end' };
    }
    case 'done':
      return { now: NOTE_COUNT - 1, next: 'end' };
  }
}

/**
 * 五線譜のハイライト（SPEC 2.5）。再生前はなし、カウントイン中は先頭を「次」、
 * 再生中は今の音と次の音、終了後は最終音を「今」のまま残す
 */
export function staffHighlight(p: Progress): { current: number | null; next: number | null } {
  if (p.phase === 'idle') return { current: null, next: null };
  const { now, next } = nowNext(p);
  return { current: now, next: next === 'end' ? null : next };
}
