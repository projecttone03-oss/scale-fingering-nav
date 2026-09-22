// アプリ状態のストアと subscribe（SPEC 7.4）。フレームワークは使わない。
import type { InstrumentId } from '../data/instruments.ts';
import type { NoteValue } from '../music/meter.ts';

/** スケールの音数（上行8音＋下行8音。最高音は2回鳴らす） */
export const NOTE_COUNT = 16;

export type Phase = 'idle' | 'countin' | 'playing' | 'done';

/** UI が参照する唯一の進行度（SPEC 7.1） */
export interface Progress {
  /** 再生中・終了後は今の音。カウントイン中は、これから鳴らす最初の音（開始位置）。停止中は null */
  noteIndex: number | null;
  phase: Phase;
}

/**
 * 拍の時刻（SPEC 7.2）。拍に合わせた脈動のアニメーションだけに使う（音・ハイライトの同期には使わない）。
 * 再生開始時に player が決め、停止・終了で null に戻す
 */
export interface BeatClock {
  /** カウントイン1拍目が耳に届く時刻（ミリ秒。performance.now()・document.timeline と同じ基準） */
  origin: number;
  /** 1拍の長さ（ミリ秒） */
  beatMs: number;
}

export interface AppState {
  instrumentId: InstrumentId | null;
  keyId: string;
  bpm: number;
  noteValue: NoteValue;
  toneEnabled: boolean;
  /** 「別の運指を表示」（SPEC 2.6）。オフなら主運指だけを表示する。端末に保存する（settings.ts） */
  showAlternateFingerings: boolean;
  progress: Progress;
  /** 停止中に五線譜で選んだ音（SPEC 2.5）。「いま」に表示し、再生はこの音から始める。null なら先頭から */
  selectedIndex: number | null;
  /** 再生中の拍の時刻（脈動用）。停止中は null */
  beatClock: BeatClock | null;
}

export const IDLE: Progress = { noteIndex: null, phase: 'idle' };
/** カウントイン中。startIndex はこれから鳴らす最初の音 */
export const countIn = (startIndex = 0): Progress => ({ noteIndex: startIndex, phase: 'countin' });

export const INITIAL_STATE: AppState = {
  instrumentId: null,
  keyId: 'C_major',
  bpm: 60,
  noteValue: 'half',
  toneEnabled: true,
  showAlternateFingerings: false,
  progress: IDLE,
  selectedIndex: null,
  beatClock: null,
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

/** いま／つぎ（SPEC 7.3）。next の 'end' は「おわり」。カウントイン中の「つぎ」は開始位置の音 */
export function nowNext(p: Progress): { now: number | null; next: number | 'end' } {
  switch (p.phase) {
    case 'idle':
      return { now: null, next: 0 };
    case 'countin':
      return { now: null, next: p.noteIndex ?? 0 };
    case 'playing': {
      const i = p.noteIndex ?? 0;
      return { now: i, next: i < NOTE_COUNT - 1 ? i + 1 : 'end' };
    }
    case 'done':
      return { now: NOTE_COUNT - 1, next: 'end' };
  }
}

/**
 * 五線譜のハイライト（SPEC 2.5）。再生前はなし、カウントイン中は開始位置の音を「次」、
 * 再生中は今の音と次の音、終了後は最終音を「今」のまま残す。
 * 停止中（idle）に選んだ音（selectedIndex）があれば、その音を「今」、次の音を「次」にする
 */
export function staffHighlight(p: Progress, selectedIndex: number | null = null): { current: number | null; next: number | null } {
  if (p.phase === 'idle') {
    if (selectedIndex === null) return { current: null, next: null };
    return { current: selectedIndex, next: selectedIndex < NOTE_COUNT - 1 ? selectedIndex + 1 : null };
  }
  const { now, next } = nowNext(p);
  return { current: now, next: next === 'end' ? null : next };
}

/**
 * 選んだ音を前後に1つ動かす（再生バーの ◀ ▶、いま／つぎ枠のスワイプ。SPEC 2.5）。
 * 次へ：未選択なら1音目、最後の音ではそのまま。前へ：1音目より前は未選択（先頭から・「▶で開始」）に戻す
 */
export function stepSelection(selectedIndex: number | null, delta: 1 | -1): number | null {
  if (delta > 0) return selectedIndex === null ? 0 : Math.min(NOTE_COUNT - 1, selectedIndex + 1);
  if (selectedIndex === null || selectedIndex === 0) return null;
  return selectedIndex - 1;
}
