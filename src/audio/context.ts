// AudioContext のライフサイクル（SPEC 6.1）。
// iOS Safari は、ユーザー操作（タップ）の処理の中で生成・resume しないと音が出ない。

let context: AudioContext | null = null;

/**
 * 再生ボタンのクリック処理の中で、await より前に呼ぶ。初回は AudioContext を作り、
 * 止まっていれば（suspended / iOS の interrupted）resume する
 */
export function unlockAudio(): Promise<AudioContext> {
  context ??= new AudioContext({ latencyHint: 'interactive' });
  const ctx = context;
  if (ctx.state === 'running') return Promise.resolve(ctx);
  return ctx.resume().then(() => ctx);
}

/**
 * 音が実際にスピーカーから出ている時刻。currentTime は「これから出力する音」の時刻なので、
 * 出力の遅延（Bluetooth イヤホンなどで大きい）を差し引いて画面と耳をそろえる。
 * outputLatency に対応しないブラウザ（Safari など）では currentTime のまま
 */
export function audibleTime(ctx: AudioContext): number {
  const latency = ctx.outputLatency;
  return ctx.currentTime - (Number.isFinite(latency) ? latency : 0);
}

/** ページが非表示になったら callback を呼ぶ（SPEC 6.1）。戻り値で解除 */
export function onPageHidden(callback: () => void): () => void {
  const handler = () => {
    if (document.visibilityState === 'hidden') callback();
  };
  document.addEventListener('visibilitychange', handler);
  return () => document.removeEventListener('visibilitychange', handler);
}
