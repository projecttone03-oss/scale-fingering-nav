// データ検証（SPEC 10.2）。楽譜データについて 1（音数）と 2（理論音列との一致）を確認する。
// 3〜5（運指エントリ・テンプレート ID・音域）は運指データを入れる M4 以降で追加する。
import { readdirSync, readFileSync } from 'node:fs';
import { INSTRUMENTS } from '../src/data/instruments.ts';
import { SCALE_KEYS } from '../src/data/keys.ts';
import type { InstrumentScales } from '../src/data/scales.ts';
import { parsePitch } from '../src/music/pitch.ts';
import { theoreticalWrittenScale } from '../src/music/theory.ts';

const scalesDir = new URL('../src/data/scales/', import.meta.url);
const errors: string[] = [];
let checked = 0;

for (const file of readdirSync(scalesDir).filter((f) => f.endsWith('.json'))) {
  const data = JSON.parse(readFileSync(new URL(file, scalesDir), 'utf8')) as InstrumentScales;
  const instrument = INSTRUMENTS.find((i) => i.id === data.instrument);
  if (!instrument) {
    errors.push(`${file}: 未定義の楽器 "${data.instrument}"`);
    continue;
  }
  if (file !== `${instrument.id}.json`) errors.push(`${file}: ファイル名が楽器 id "${instrument.id}" と一致しない`);
  if (data.clef !== instrument.clef) errors.push(`${file}: clef "${data.clef}" が instruments.ts の "${instrument.clef}" と一致しない`);

  for (const [keyId, scale] of Object.entries(data.scales)) {
    const where = `${file} ${keyId}`;
    const key = SCALE_KEYS.find((k) => k.id === keyId);
    if (!key) {
      errors.push(`${where}: 未定義の調`);
      continue;
    }
    checked++;

    if (!Number.isInteger(scale.keySignature) || Math.abs(scale.keySignature) > 7) {
      errors.push(`${where}: keySignature ${scale.keySignature} が -7〜7 の整数でない`);
    }

    // 1. 上行8音・下行8音（どちらも最高音を含む16音）
    if (scale.ascending.length !== 8) errors.push(`${where}: ascending が ${scale.ascending.length} 音（8音のはず）`);
    if (scale.descending.length !== 8) errors.push(`${where}: descending が ${scale.descending.length} 音（8音のはず）`);

    // 2. 実音の調＋楽器の移調から導いた理論音列と MIDI 番号で一致する
    const pitches = [...scale.ascending, ...scale.descending];
    let midis: number[];
    try {
      midis = pitches.map((p) => parsePitch(p).midi);
    } catch (e) {
      errors.push(`${where}: ${(e as Error).message}`);
      continue;
    }
    const expected = theoreticalWrittenScale(key, instrument, midis[0]!);
    const expectedLine = [...expected.ascending, ...expected.descending];
    pitches.forEach((pitch, i) => {
      if (midis[i] !== expectedLine[i]) {
        const pos = i < 8 ? `上行${i + 1}音目` : `下行${i - 7}音目`;
        errors.push(`${where}: ${pos} ${pitch}（MIDI ${midis[i]}）が理論値 MIDI ${expectedLine[i]} と一致しない`);
      }
    });
  }
}

if (errors.length > 0) {
  console.error(`データ検証で ${errors.length} 件の問題が見つかりました：`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`OK（楽譜データ ${checked} 調）`);
