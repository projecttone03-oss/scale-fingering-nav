// クリック音と参考音（SPEC 6.2, 6.3）。音ごとにオシレーターを作って使い捨てる。
import { midiToFreq } from '../music/pitch.ts';

export const CLICK = {
  accent: { frequency: 1500, duration: 0.03, gain: 0.6 },
  normal: { frequency: 1000, duration: 0.02, gain: 0.4 },
} as const;

export const TONE = {
  gain: 0.25,
  attack: 0.015,
  release: 0.06,
  /** 音価のこの割合で減衰を始める */
  sustainRatio: 0.95,
} as const;

/** 減衰の最後に向かう音量（exponentialRamp は 0 にできないため） */
const SILENT = 0.0001;

/** 参考音の周波数。記譜の MIDI 番号に移調を足した実音で鳴らす（SPEC 6.3） */
export function toneFrequency(writtenMidi: number, transposition: number): number {
  return midiToFreq(writtenMidi + transposition);
}

/**
 * 参考音のエンベロープの時刻（秒）。減衰は音価の 95% から始めるが、
 * テンポが速く 95% からでは次の音に重なる場合は、次の音の頭で消えきるよう早める
 */
export function toneEnvelope(start: number, duration: number) {
  const hold = Math.max(TONE.attack, Math.min(duration * TONE.sustainRatio, duration - TONE.release));
  const releaseStart = start + hold;
  return { start, attackEnd: start + TONE.attack, releaseStart, end: releaseStart + TONE.release };
}

/** 鳴り終わったらノードをつなぎから外す */
function disposeOnEnded(source: AudioScheduledSourceNode, ...nodes: AudioNode[]) {
  source.addEventListener('ended', () => {
    source.disconnect();
    for (const node of nodes) node.disconnect();
  });
}

/** クリックを time に予約する。アクセントは 1500 Hz・30 ms、通常は 1000 Hz・20 ms の減衰する正弦波 */
export function scheduleClick(
  ctx: BaseAudioContext,
  destination: AudioNode,
  time: number,
  accent: boolean,
): AudioScheduledSourceNode {
  const { frequency, duration, gain } = accent ? CLICK.accent : CLICK.normal;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = frequency;
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(gain, time);
  amp.gain.exponentialRampToValueAtTime(SILENT, time + duration);
  osc.connect(amp).connect(destination);
  osc.start(time);
  osc.stop(time + duration);
  disposeOnEnded(osc, amp);
  return osc;
}

/** 参考音を time から duration 秒のあいだ鳴らす予約をする（三角波、ゲイン 0.25） */
export function scheduleTone(
  ctx: BaseAudioContext,
  destination: AudioNode,
  time: number,
  duration: number,
  frequency: number,
): AudioScheduledSourceNode {
  const env = toneEnvelope(time, duration);
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = frequency;
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, env.start);
  amp.gain.linearRampToValueAtTime(TONE.gain, env.attackEnd);
  amp.gain.setValueAtTime(TONE.gain, env.releaseStart);
  amp.gain.linearRampToValueAtTime(0, env.end);
  osc.connect(amp).connect(destination);
  osc.start(env.start);
  osc.stop(env.end);
  disposeOnEnded(osc, amp);
  return osc;
}
