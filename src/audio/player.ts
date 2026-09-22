// 再生の制御（SPEC 2.7）。AudioContext・先読みスケジューラ・requestAnimationFrame をまとめ、
// store の progress を更新する。UI はこの progress だけを見て描画する（SPEC 7.1, 7.2）。
import type { NoteValue } from '../music/meter.ts';
import { IDLE, NOTE_COUNT, countIn, isPlaying, sameProgress, type Store } from '../state/store.ts';
import { audibleTime, onPageHidden, unlockAudio } from './context.ts';
import { START_DELAY, buildEventTable, createLookaheadScheduler, progressAt, type Timer } from './scheduler.ts';
import { scheduleClick, scheduleTone, toneFrequency } from './sounds.ts';

export interface PlayParams {
  /** 16音の記譜の MIDI 番号（上行8音 → 下行8音） */
  writtenMidis: readonly number[];
  /** 楽器の移調（実音 = 記譜 + transposition） */
  transposition: number;
  bpm: number;
  noteValue: NoteValue;
  /** この音（0〜15）から16音目まで鳴らす。省略時は先頭から（SPEC 2.7） */
  startIndex?: number;
}

export interface Player {
  /**
   * 再生を始める。再生ボタンのクリック処理の中で呼ぶこと（AudioContext の生成・resume を
   * その中で行わないと iOS Safari で音が出ない）。再生中（カウントイン中を含む）は何もしない
   */
  play(params: PlayParams): void;
  /** 即時停止。予約済みの音を取り消し、先頭（idle）に戻す */
  stop(): void;
}

/** ブラウザの機能への依存。テストでは偽物に差し替える */
export interface PlayerDeps {
  unlock: () => Promise<AudioContext>;
  /** 画面の進行度を決める時刻（出力遅延を差し引いた、耳に届いている時刻） */
  audibleTime: (ctx: AudioContext) => number;
  requestFrame: (callback: () => void) => number;
  cancelFrame: (id: number) => void;
  onHidden: (callback: () => void) => () => void;
  /** 画面のアニメーションの時計（performance.now()、ミリ秒） */
  now: () => number;
  timer?: Timer;
}

const browserDeps: PlayerDeps = {
  unlock: unlockAudio,
  audibleTime,
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (id) => cancelAnimationFrame(id),
  onHidden: onPageHidden,
  now: () => performance.now(),
};

interface Session {
  dispose(): void;
}

/** 停止・参考音 OFF のときに音量を 0 まで下げる時間（秒）。いきなり切るとプツッと鳴るため */
export const FADE = 0.01;

/** 拍の時刻（beatClock）を合わせ直すずれの大きさ（ミリ秒）。音の時計の読みの細かな揺れでは合わせ直さない */
export const BEAT_CLOCK_RESYNC_MS = 25;

export function createPlayer(store: Store, deps: PlayerDeps = browserDeps): Player {
  /** 再生のたびに増やす。resume を待つあいだに停止・再生し直されたら、古い再生は始めない */
  let generation = 0;
  let session: Session | null = null;

  function startSession(ctx: AudioContext, params: PlayParams): Session {
    // 再生ごとの出力。停止時はこれを FADE かけて 0 にしてから外す
    const bus = ctx.createGain();
    bus.connect(ctx.destination);
    // 参考音はこの出力を通す。参考音は常に予約しておき、ON/OFF はこのゲインで切り替える
    const toneBus = ctx.createGain();
    toneBus.gain.value = store.getState().toneEnabled ? 1 : 0;
    toneBus.connect(bus);

    const events = buildEventTable(ctx.currentTime + START_DELAY, params.bpm, params.noteValue, params.startIndex ?? 0);

    // 拍に合わせた脈動の時刻（SPEC 7.2）。カウントイン1拍目（events[0]）が耳に届く時刻を、画面のアニメーションの
    // 時計で表して store に置く。画面はこれを起点にブラウザのアニメーションで拍ごとに脈動させる（毎拍の処理はしない）
    const beatMs = 60000 / params.bpm;
    const syncBeatClock = (force: boolean) => {
      const origin = deps.now() + (events[0]!.time - deps.audibleTime(ctx)) * 1000;
      const current = store.getState().beatClock;
      if (force || !current || Math.abs(current.origin - origin) > BEAT_CLOCK_RESYNC_MS) {
        store.setState({ beatClock: { origin, beatMs } });
      }
    };
    syncBeatClock(true);
    const sources = new Set<AudioScheduledSourceNode>();
    let disposed = false;
    const disconnect = () => {
      toneBus.disconnect();
      bus.disconnect();
    };
    const keep = (source: AudioScheduledSourceNode) => {
      sources.add(source);
      source.addEventListener('ended', () => {
        sources.delete(source);
        // 停止後、最後の音が鳴り終わったら出力を外す
        if (disposed && sources.size === 0) disconnect();
      });
    };

    // 音はイベント表の時刻どおりに先読みで予約する（SPEC 6.4）
    const scheduler = createLookaheadScheduler(
      events,
      () => ctx.currentTime,
      (event) => {
        if (event.kind === 'end') return;
        keep(scheduleClick(ctx, bus, event.time, event.accent === true));
        if (event.kind === 'note') {
          const midi = params.writtenMidis[event.noteIndex!]!;
          keep(scheduleTone(ctx, toneBus, event.time, event.duration!, toneFrequency(midi, params.transposition)));
        }
      },
      deps.timer,
    );

    // 参考音の ON/OFF は再生中も切り替えられる（SPEC 2.4）。
    // OFF はすぐ（FADE で）消す。ON は次の音の開始から鳴らす（SPEC 2.7「各音の開始時に鳴らす」。
    // 鳴っている途中の音を途中から鳴らさない）。参考音は次の音の頭までに消えきるので、前の音は漏れない
    const unsubscribe = store.subscribe((state, prev) => {
      if (state.toneEnabled === prev.toneEnabled) return;
      const now = ctx.currentTime;
      const gain = toneBus.gain;
      gain.cancelScheduledValues(now);
      if (state.toneEnabled) {
        gain.setValueAtTime(0, now);
        const nextNote = events.find((e) => e.kind === 'note' && e.time > now);
        if (nextNote) gain.setValueAtTime(1, nextNote.time);
      } else {
        gain.setValueAtTime(gain.value, now);
        gain.linearRampToValueAtTime(0, now + FADE);
      }
    });

    // 画面は requestAnimationFrame ごとに時刻からイベント表を引いて progress を更新する（SPEC 7.2）。
    // store は値が変わったときだけ通知するので、DOM の更新は音の切り替わりのフレームだけになる
    let frameId: number | null = null;
    const frame = () => {
      frameId = null;
      const progress = progressAt(events, deps.audibleTime(ctx));
      if (progress.phase === 'done') {
        // 自動停止。progress は done のまま残し、「いま」に最終音を表示し続ける（SPEC 2.7）。脈動は止める
        store.setState({ progress, beatClock: null });
        scheduler.stop();
        return;
      }
      const changed = !sameProgress(progress, store.getState().progress);
      store.setState({ progress });
      // 音が切り替わったフレームで、拍の時刻がずれていないか確かめる（再生開始の直後に音の時計の進みが遅れた場合など）
      if (changed) syncBeatClock(false);
      frameId = deps.requestFrame(frame);
    };

    scheduler.start();
    frameId = deps.requestFrame(frame);

    return {
      dispose() {
        unsubscribe();
        scheduler.stop();
        if (frameId !== null) deps.cancelFrame(frameId);
        frameId = null;
        // 鳴っている途中の音をいきなり切るとプツッと鳴るので、FADE かけて音量を 0 にしてから止める。
        // まだ始まっていない予約済みの音は、止める時刻が開始より前になるので鳴らない
        const now = ctx.currentTime;
        bus.gain.cancelScheduledValues(now);
        bus.gain.setValueAtTime(bus.gain.value, now);
        bus.gain.linearRampToValueAtTime(0, now + FADE);
        for (const source of sources) {
          try {
            source.stop(now + FADE);
          } catch {
            // stop を二度呼ぶと例外になる古いブラウザ。予約済みの終了時刻で止まり、音量は 0 のまま
          }
        }
        disposed = true;
        if (sources.size === 0) disconnect();
      },
    };
  }

  function stop() {
    generation++;
    session?.dispose();
    session = null;
    store.setState({ progress: IDLE, beatClock: null });
  }

  // ページが非表示になったら停止する（SPEC 6.1）
  deps.onHidden(() => {
    if (session || isPlaying(store.getState().progress)) stop();
  });

  return {
    play(params) {
      if (params.writtenMidis.length !== NOTE_COUNT) {
        throw new Error(`音の数が ${NOTE_COUNT} ではありません: ${params.writtenMidis.length}`);
      }
      const startIndex = params.startIndex ?? 0;
      if (!Number.isInteger(startIndex) || startIndex < 0 || startIndex >= NOTE_COUNT) {
        throw new Error(`開始位置が 0〜${NOTE_COUNT - 1} ではありません: ${startIndex}`);
      }
      if (isPlaying(store.getState().progress)) return;
      // 前回の再生（終了して done で止まっているもの）を片付ける
      session?.dispose();
      session = null;

      const current = ++generation;
      store.setState({ progress: countIn(startIndex) });
      // unlock はこの呼び出しの中で（await より前に）行う。iOS Safari の自動再生制限対策
      deps.unlock().then(
        (ctx) => {
          if (current === generation) session = startSession(ctx, params);
        },
        () => {
          if (current === generation) store.setState({ progress: IDLE });
        },
      );
    },
    stop,
  };
}
