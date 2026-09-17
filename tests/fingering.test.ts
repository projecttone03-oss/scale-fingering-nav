import { describe, expect, it } from 'vitest';
import trumpetData from '../src/data/fingerings/bb_trumpet.json';
import template from '../src/templates/bb_trumpet.svg?raw';
import { displayedFingerings, fingeringsFor, type FingeringEntry, type InstrumentFingerings } from '../src/data/fingerings.ts';
import { parsePitch } from '../src/music/pitch.ts';
import {
  fingeringDescription,
  fingeringName,
  pressedKeyIds,
  renderFingering,
  templateKeyIds,
} from '../src/render/fingering.ts';

const trumpet = trumpetData as InstrumentFingerings;
const valve = (valves: number[], isPrimary = true): FingeringEntry => ({
  id: 'std',
  valves,
  isPrimary,
  confidence: 'verified',
  sources: ['pdf'],
});

describe('テンプレート SVG（SPEC 4.7）', () => {
  it('B♭トランペット：押さえる要素はバルブ v1〜v3 の3つ', () => {
    expect(templateKeyIds(template)).toEqual(['v1', 'v2', 'v3']);
  });

  it('B♭トランペット：横一列の円3つ。間隔は直径の 0.2〜0.3 倍、線の太さは直径の 8〜10%', () => {
    const circles = [...template.matchAll(/<circle id="(v\d)" class="key" cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)" stroke-width="([\d.]+)"\/>/g)].map(
      (m) => ({ id: m[1], cx: Number(m[2]), cy: Number(m[3]), r: Number(m[4]), stroke: Number(m[5]) }),
    );
    expect(circles.map((c) => c.id)).toEqual(['v1', 'v2', 'v3']);
    const diameter = circles[0]!.r * 2;
    for (const [i, c] of circles.entries()) {
      expect(c.r * 2).toBe(diameter);
      expect(c.cy).toBe(circles[0]!.cy);
      expect(c.stroke / diameter).toBeGreaterThanOrEqual(0.08);
      expect(c.stroke / diameter).toBeLessThanOrEqual(0.1);
      if (i > 0) {
        const gap = c.cx - circles[i - 1]!.cx - diameter;
        expect(gap / diameter).toBeGreaterThanOrEqual(0.2);
        expect(gap / diameter).toBeLessThanOrEqual(0.3);
      }
    }
    // 線を含めて viewBox に収まる
    const [, , width, height] = /viewBox="([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)"/.exec(template)!.slice(1).map(Number);
    expect(circles[0]!.cx - circles[0]!.r - circles[0]!.stroke / 2).toBeGreaterThanOrEqual(0);
    expect(circles[2]!.cx + circles[2]!.r + circles[2]!.stroke / 2).toBeLessThanOrEqual(width!);
    expect(circles[0]!.cy + circles[0]!.r + circles[0]!.stroke / 2).toBeLessThanOrEqual(height!);
  });

  it('番号は各円の直後に置き、円の中央に書く（押すバルブの番号を CSS の .key.pressed + .label で白抜きにするため）', () => {
    const pairs = [...template.matchAll(/<circle id="v(\d)" class="key" cx="([\d.]+)" cy="([\d.]+)"[^>]*\/>\s*<text class="label" x="([\d.]+)" y="([\d.]+)"[^>]*>(\d)<\/text>/g)];
    expect(pairs).toHaveLength(3);
    for (const [, valve, cx, cy, x, y, label] of pairs) {
      expect(label).toBe(valve);
      expect(x).toBe(cx);
      expect(y).toBe(cy);
    }
  });

  it('id のない key 要素・重複した id は例外', () => {
    expect(() => templateKeyIds('<svg><rect class="key" x="0"/></svg>')).toThrow('id のない key 要素');
    expect(() => templateKeyIds('<svg><rect id="a" class="key"/><circle id="a" class="key"/></svg>')).toThrow('重複');
  });

  it('class に key を含まない要素は押さえる要素に数えない', () => {
    expect(templateKeyIds('<svg><rect id="body" class="outline"/><path id="k" class="key big"/></svg>')).toEqual(['k']);
  });
});

describe('renderFingering', () => {
  const pressedOf = (svg: string) => [...svg.matchAll(/class="key pressed" data-key="(\w+)"/g)].map((m) => m[1]);
  const keysOf = (svg: string) => [...svg.matchAll(/class="key(?: pressed)?" data-key="(\w+)"/g)].map((m) => m[1]);

  it('押すバルブだけに .pressed を付け、id は data-key に置き換える', () => {
    const svg = renderFingering(template, ['v1', 'v3'], 'D4 の運指');
    expect(pressedOf(svg)).toEqual(['v1', 'v3']);
    expect(keysOf(svg)).toEqual(['v1', 'v2', 'v3']);
    expect(svg).not.toMatch(/\sid="/);
    expect(svg).not.toContain('<!--');
    expect(svg).toMatch(/^<svg class="fingering" role="img" aria-label="D4 の運指" xmlns=/);
  });

  it('押すバルブがなければ .pressed は付かない', () => {
    expect(pressedOf(renderFingering(template, [], 'C4'))).toEqual([]);
  });

  it('テンプレートにないキーは例外（データとテンプレートの食い違い）', () => {
    expect(() => renderFingering(template, ['v4'], 'x')).toThrow('テンプレートにないキーです: v4');
  });

  it('説明の文字列は属性用にエスケープする', () => {
    expect(renderFingering(template, [], 'a"<b>')).toContain('aria-label="a&quot;&lt;b&gt;"');
  });
});

describe('運指エントリ → 押さえる要素・表記', () => {
  it('金管（バルブ）は v＋番号、PDF と同じ番号の並び（なしは 0）', () => {
    expect(pressedKeyIds(valve([1, 3]))).toEqual(['v1', 'v3']);
    expect(fingeringName(valve([1, 2, 3]))).toBe('123');
    expect(fingeringName(valve([]))).toBe('0');
    expect(fingeringDescription(valve([2, 3]))).toBe('バルブ 2・3');
    expect(fingeringDescription(valve([]))).toBe('バルブなし（0）');
  });

  it('木管はキーの id をそのまま使う', () => {
    const entry: FingeringEntry = { id: 'std', keys: ['L1', 'L2'], isPrimary: true, confidence: 'verified', sources: [] };
    expect(pressedKeyIds(entry)).toEqual(['L1', 'L2']);
  });

  it('トロンボーン・ストリングベースの図はまだ描けない', () => {
    const entry: FingeringEntry = { id: 'std', position: 4, isPrimary: true, confidence: 'verified', sources: [] };
    expect(() => pressedKeyIds(entry)).toThrow();
  });
});

describe('B♭トランペットの運指データ（PDF 5・6ページのリップスラーから転記）', () => {
  const primaryOf = (pitch: string) => fingeringName(fingeringsFor(trumpet, parsePitch(pitch).midi)[0]!);
  const allOf = (pitch: string) => fingeringsFor(trumpet, parsePitch(pitch).midi).map(fingeringName);

  it('音域 F♯3〜C6 のすべての半音に、主運指がちょうど1つ', () => {
    for (let midi = parsePitch('F#3').midi; midi <= parsePitch('C6').midi; midi++) {
      const entries = trumpet.entries[String(midi)] ?? [];
      expect(entries.filter((e) => e.isPrimary), `MIDI ${midi}`).toHaveLength(1);
    }
    expect(Object.keys(trumpet.entries)).toHaveLength(31);
  });

  it.each([
    // ハ長調（記譜ニ長調）とハ短調（記譜ニ短調）の16音に出てくる音
    ['D4', '13'],
    ['E4', '12'],
    ['F4', '1'],
    ['F#4', '2'],
    ['G4', '0'],
    ['A4', '12'],
    ['Bb4', '1'],
    ['B4', '2'],
    ['C5', '0'],
    ['C#5', '12'],
    ['D5', '1'],
  ])('%s の主運指は %s', (pitch, name) => {
    expect(primaryOf(pitch)).toBe(name);
  });

  it('同じ音高なら綴りが違っても同じ運指（MIDI 番号で引く）', () => {
    expect(allOf('A#4')).toEqual(allOf('Bb4'));
    expect(allOf('Gb5')).toEqual(allOf('F#5'));
  });

  it.each([
    // 同じ音が複数の段に出てくる音。主運指（先頭）は各段で低いほうから数えた位置が小さいもの。上から2番目の音（第7倍音）は主運指にしない
    ['E5', ['0', '12', '123']],
    ['G5', ['0', '12', '13']],
    ['Ab5', ['23', '1']],
    ['A5', ['12', '2']],
    ['Bb5', ['1', '0']],
    ['C6', ['0']],
    ['F#3', ['123']],
  ])('%s の運指（主運指が先頭）：%j', (pitch, names) => {
    expect(allOf(pitch)).toEqual(names);
  });

  it('第7倍音の運指7つは hidden（データに残し、表示しない）。主運指には付けない', () => {
    const hidden = Object.entries(trumpet.entries).flatMap(([midi, entries]) =>
      entries.filter((e) => e.hidden).map((e) => `${midi}:${fingeringName(e)}`),
    );
    const midi = (pitch: string) => parsePitch(pitch).midi;
    expect(hidden).toEqual([
      `${midi('E5')}:123`,
      `${midi('F5')}:13`,
      `${midi('F#5')}:23`,
      `${midi('G5')}:12`,
      `${midi('G#5')}:1`,
      `${midi('A5')}:2`,
      `${midi('Bb5')}:0`,
    ]);
    for (const entries of Object.values(trumpet.entries)) {
      for (const entry of entries) if (entry.isPrimary) expect(entry.hidden).toBeUndefined();
    }
  });

  it('displayedFingerings：オフなら主運指だけ、オンなら hidden を除いた代替運指も（主運指が先頭）', () => {
    const shown = (pitch: string, on: boolean) => displayedFingerings(trumpet, parsePitch(pitch).midi, on).map(fingeringName);
    expect(shown('F#5', false)).toEqual(['2']);
    expect(shown('F#5', true)).toEqual(['2', '123']);
    expect(shown('G5', true)).toEqual(['0', '13']);
    expect(shown('A5', true)).toEqual(['12']);
    expect(shown('D4', true)).toEqual(['13']);
  });

  it('どのエントリも出典は PDF', () => {
    for (const entries of Object.values(trumpet.entries)) {
      for (const entry of entries) expect(entry.sources).toEqual(['pdf']);
    }
  });
});
