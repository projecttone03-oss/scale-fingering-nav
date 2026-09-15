import { describe, expect, it } from 'vitest';
import { CLICK, TONE, scheduleClick, scheduleTone, toneEnvelope, toneFrequency } from '../src/audio/sounds.ts';
import { getInstrument } from '../src/data/instruments.ts';
import { midiToFreq, parsePitch } from '../src/music/pitch.ts';
import { FakeAudioContext } from './fakeAudio.ts';

describe('toneFrequency：実音で鳴らす（SPEC 6.3）', () => {
  it('B♭トランペットの記譜 D4 は実音 C4（A4 = 442 Hz で約 262.81 Hz）', () => {
    const trumpet = getInstrument('bb_trumpet');
    const hz = toneFrequency(parsePitch('D4').midi, trumpet.transposition);
    expect(hz).toBe(midiToFreq(60));
    expect(hz).toBeCloseTo(262.8148, 3);
  });

  it('移調のない楽器は記譜どおり、ピッコロは1オクターブ上', () => {
    expect(toneFrequency(69, getInstrument('flute').transposition)).toBe(442);
    expect(toneFrequency(69, getInstrument('piccolo').transposition)).toBe(884);
  });
});

describe('toneEnvelope：アタック 15ms、音価の 95% から 60ms で減衰', () => {
  it('60 BPM の二分音符（2 秒）：1.9 秒から減衰し 1.96 秒で消える', () => {
    const env = toneEnvelope(5, 2);
    expect(env.attackEnd).toBeCloseTo(5.015, 9);
    expect(env.releaseStart).toBeCloseTo(6.9, 9);
    expect(env.end).toBeCloseTo(6.96, 9);
  });

  it('速いテンポで 95% からだと次の音に重なる場合は、次の音の頭で消えきる', () => {
    // 160 BPM の四分音符 = 0.375 秒。95% = 0.35625 秒から 60ms だと 0.41625 秒まで鳴ってしまう
    const duration = 60 / 160;
    const env = toneEnvelope(0, duration);
    expect(env.end).toBeLessThanOrEqual(duration + 1e-12);
    expect(env.releaseStart).toBeCloseTo(duration - TONE.release, 9);
  });

  it.each([
    [40, 'whole'],
    [40, 'quarter'],
    [60, 'half'],
    [120, 'quarter'],
    [160, 'quarter'],
  ] as const)('%i BPM・%s：減衰は音価の 95% より遅れず、次の音と重ならない', (bpm, value) => {
    const duration = (60 / bpm) * { whole: 4, half: 2, quarter: 1 }[value];
    const env = toneEnvelope(0, duration);
    expect(env.releaseStart).toBeLessThanOrEqual(duration * 0.95 + 1e-12);
    expect(env.end).toBeLessThanOrEqual(duration + 1e-12);
  });
});

describe('scheduleClick（SPEC 6.2）', () => {
  it.each([
    [true, 1500, 0.03],
    [false, 1000, 0.02],
  ])('accent=%s：%i Hz の正弦波を %f 秒、減衰エンベロープで鳴らす', (accent, frequency, duration) => {
    const ctx = new FakeAudioContext();
    const dest = ctx.destination;
    const osc = scheduleClick(ctx.asAudioContext, dest as unknown as AudioNode, 3, accent);
    const fake = ctx.oscillators[0]!;
    expect(osc).toBe(fake);
    expect(fake.type).toBe('sine');
    expect(fake.frequency.value).toBe(frequency);
    expect([fake.startAt, fake.stopAt]).toEqual([3, 3 + duration]);
    const amp = ctx.gains[0]!;
    const peak = accent ? CLICK.accent.gain : CLICK.normal.gain;
    expect(amp.gain.calls[0]).toEqual(['set', peak, 3]);
    const [kind, target, end] = amp.gain.calls[1]!;
    expect(kind).toBe('exp');
    expect(end).toBeCloseTo(3 + duration, 9);
    // 減衰：ピークより小さい正の値へ（指数カーブは 0 に向かえない）
    expect(target).toBeGreaterThan(0);
    expect(target).toBeLessThan(peak / 100);
    // オシレーター → ゲイン → 出力
    expect(fake.connections).toEqual([amp]);
    expect(amp.connections).toEqual([dest]);
  });

  it('鳴り終わったらノードをつなぎから外す', () => {
    const ctx = new FakeAudioContext();
    scheduleClick(ctx.asAudioContext, ctx.destination as unknown as AudioNode, 0, false);
    ctx.oscillators[0]!.fireEnded();
    expect(ctx.oscillators[0]!.disconnected).toBe(true);
    expect(ctx.gains[0]!.disconnected).toBe(true);
  });
});

describe('scheduleTone（SPEC 6.3）', () => {
  it('三角波・ゲイン 0.25 で、エンベロープの時刻どおりに鳴らす', () => {
    const ctx = new FakeAudioContext();
    scheduleTone(ctx.asAudioContext, ctx.destination as unknown as AudioNode, 5, 2, 262.8);
    const osc = ctx.oscillators[0]!;
    const env = toneEnvelope(5, 2);
    expect(osc.type).toBe('triangle');
    expect(osc.frequency.value).toBe(262.8);
    expect([osc.startAt, osc.stopAt]).toEqual([env.start, env.end]);
    expect(ctx.gains[0]!.gain.calls).toEqual([
      ['set', 0, env.start],
      ['linear', TONE.gain, env.attackEnd],
      ['set', TONE.gain, env.releaseStart],
      ['linear', 0, env.end],
    ]);
    expect(TONE.gain).toBe(0.25);
  });
});
