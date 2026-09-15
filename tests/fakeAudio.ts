// テスト用の偽の Web Audio。呼ばれた内容を記録するだけで音は出さない。

/** 本物の AudioParam と同じく、有限でない値は TypeError にする */
function finite(...values: number[]) {
  for (const v of values) if (!Number.isFinite(v)) throw new TypeError(`有限でない値: ${v}`);
}

export class FakeParam {
  private current = 1;
  readonly calls: [kind: 'set' | 'linear' | 'exp' | 'cancel', value: number, time: number][] = [];
  get value() {
    return this.current;
  }
  set value(v: number) {
    finite(v);
    this.current = v;
  }
  setValueAtTime(value: number, time: number) {
    finite(value, time);
    this.calls.push(['set', value, time]);
    return this;
  }
  linearRampToValueAtTime(value: number, time: number) {
    finite(value, time);
    this.calls.push(['linear', value, time]);
    return this;
  }
  exponentialRampToValueAtTime(value: number, time: number) {
    finite(value, time);
    // 本物は 0 に向かう指数カーブを作れない
    if (value === 0) throw new RangeError('exponentialRampToValueAtTime に 0 は使えない');
    this.calls.push(['exp', value, time]);
    return this;
  }
  cancelScheduledValues(time: number) {
    finite(time);
    this.calls.push(['cancel', 0, time]);
    return this;
  }
}

export class FakeNode {
  readonly connections: unknown[] = [];
  disconnected = false;
  connect<T>(node: T): T {
    this.connections.push(node);
    return node;
  }
  disconnect() {
    this.disconnected = true;
  }
}

export class FakeGain extends FakeNode {
  readonly gain = new FakeParam();
}

export class FakeOscillator extends FakeNode {
  type = 'sine';
  readonly frequency = new FakeParam();
  startAt: number | null = null;
  stopAt: number | null = null;
  stopCalls = 0;
  private readonly endedListeners: (() => void)[] = [];
  private readonly ctx: FakeAudioContext;
  constructor(ctx: FakeAudioContext) {
    super();
    this.ctx = ctx;
  }
  start(time: number) {
    finite(time);
    this.startAt = time;
  }
  stop(time?: number) {
    if (time !== undefined) finite(time);
    this.stopCalls++;
    this.stopAt = time ?? this.ctx.currentTime;
  }
  addEventListener(type: string, listener: () => void) {
    if (type === 'ended') this.endedListeners.push(listener);
  }
  fireEnded() {
    for (const listener of this.endedListeners) listener();
  }
}

export class FakeAudioContext {
  currentTime = 0;
  outputLatency = 0;
  readonly destination = new FakeNode();
  readonly oscillators: FakeOscillator[] = [];
  readonly gains: FakeGain[] = [];
  createOscillator() {
    const osc = new FakeOscillator(this);
    this.oscillators.push(osc);
    return osc;
  }
  createGain() {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }
  /** 本物の AudioContext として渡すための型変換 */
  get asAudioContext(): AudioContext {
    return this as unknown as AudioContext;
  }
}
