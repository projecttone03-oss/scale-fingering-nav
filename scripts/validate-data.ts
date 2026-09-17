// データ検証（SPEC 10.2）。全楽器・全調について次を確認し、問題を一覧で出す。
// 1. ascending・descending が 8 音ずつ（どちらも最高音を含む）
// 2. 音列が、実音の調＋楽器の移調から導いた理論音列と MIDI 番号で一致する
// 3. 各音の MIDI 番号に運指エントリがあり、isPrimary: true がちょうど1つ
// 4. 運指エントリの keys がテンプレート SVG にある ID だけ（木管）、position が 1〜7（トロンボーン）
//    （バルブの楽器も、押すバルブ v<番号> がテンプレートにあることを確かめる）
// 5. 各音が楽器の range（運指データの音域）内
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import type { FingeringEntry, InstrumentFingerings } from '../src/data/fingerings.ts';
import { INSTRUMENTS, type Instrument, type InstrumentId } from '../src/data/instruments.ts';
import { SCALE_KEYS } from '../src/data/keys.ts';
import type { InstrumentScales } from '../src/data/scales.ts';
import { parsePitch } from '../src/music/pitch.ts';
import { theoreticalWrittenScale } from '../src/music/theory.ts';
import { templateKeyIds } from '../src/render/fingering.ts';

const scalesDir = new URL('../src/data/scales/', import.meta.url);
const fingeringsDir = new URL('../src/data/fingerings/', import.meta.url);
const templatesDir = new URL('../src/templates/', import.meta.url);

const errors: string[] = [];
const jsonFiles = (dir: URL) => readdirSync(dir).filter((f) => f.endsWith('.json'));
const readJson = <T>(dir: URL, file: string) => JSON.parse(readFileSync(new URL(file, dir), 'utf8')) as T;

/** ファイルの instrument を楽器定義から引く。ファイル名も楽器 id と一致していること */
function instrumentOf(file: string, id: string): Instrument | null {
  const instrument = INSTRUMENTS.find((i) => i.id === id);
  if (!instrument) {
    errors.push(`${file}: 未定義の楽器 "${id}"`);
    return null;
  }
  if (file !== `${instrument.id}.json`) errors.push(`${file}: ファイル名が楽器 id "${instrument.id}" と一致しない`);
  return instrument;
}

/** 音高の文字列の MIDI 番号。読めなければ問題に記録して null */
function midiOf(where: string, pitch: string): number | null {
  try {
    return parsePitch(pitch).midi;
  } catch (e) {
    errors.push(`${where}: ${(e as Error).message}`);
    return null;
  }
}

const isIntegerIn = (value: unknown, min: number, max: number) => Number.isInteger(value) && (value as number) >= min && (value as number) <= max;

// ---- 運指データ ----

interface CheckedFingerings {
  data: InstrumentFingerings;
  lowest: number | null;
  highest: number | null;
}

/** 運指エントリ1つの形と、4（テンプレートの ID・ポジション） */
function checkEntry(where: string, instrument: Instrument, entry: FingeringEntry, templateIds: readonly string[] | null) {
  if (typeof entry.id !== 'string' || entry.id === '') errors.push(`${where}: id がない`);
  if (typeof entry.isPrimary !== 'boolean') errors.push(`${where}: isPrimary が true / false でない`);
  if (entry.confidence !== 'verified' && entry.confidence !== 'conflict') errors.push(`${where}: confidence "${entry.confidence}" が verified / conflict でない`);
  if (!Array.isArray(entry.sources)) errors.push(`${where}: sources が配列でない`);
  if (entry.hidden !== undefined && typeof entry.hidden !== 'boolean') errors.push(`${where}: hidden が true / false でない`);
  if (entry.hidden === true && entry.isPrimary === true) errors.push(`${where}: 主運指に hidden は付けられない（表示する運指がなくなる）`);

  const inTemplate = (id: string) => {
    if (templateIds && !templateIds.includes(id)) {
      errors.push(`${where}: "${id}" がテンプレート templates/${instrument.fingeringTemplate}.svg にない`);
    }
  };

  switch (instrument.family) {
    case 'woodwind':
      if (!('keys' in entry) || !Array.isArray(entry.keys)) {
        errors.push(`${where}: keys（押さえるキーの ID の配列）がない`);
        break;
      }
      for (const key of entry.keys) inTemplate(key);
      break;
    case 'brass_valve':
      if (!('valves' in entry) || !Array.isArray(entry.valves)) {
        errors.push(`${where}: valves（押すバルブの番号の配列）がない`);
        break;
      }
      if (new Set(entry.valves).size !== entry.valves.length) errors.push(`${where}: valves に同じ番号が2回ある`);
      for (const valve of entry.valves) {
        if (!isIntegerIn(valve, 1, 4)) errors.push(`${where}: バルブの番号 ${valve} が 1〜4 の整数でない`);
        else inTemplate(`v${valve}`);
      }
      if (entry.crook !== undefined && instrument.id !== 'f_horn') errors.push(`${where}: crook は Fホルンだけ`);
      if (entry.crook !== undefined && entry.crook !== 'F' && entry.crook !== 'Bb') errors.push(`${where}: crook "${entry.crook}" が F / Bb でない`);
      break;
    case 'brass_slide':
      if (!('position' in entry) || !isIntegerIn(entry.position, 1, 7)) {
        errors.push(`${where}: position ${'position' in entry ? entry.position : '（なし）'} が 1〜7 の整数でない`);
      }
      break;
    case 'string':
      if (!('string' in entry) || !['E', 'A', 'D', 'G'].includes(entry.string)) errors.push(`${where}: string が E / A / D / G でない`);
      if (!('finger' in entry) || !isIntegerIn(entry.finger, 0, 4)) errors.push(`${where}: finger が 0〜4 の整数でない`);
      if (!('position' in entry) || typeof entry.position !== 'string') errors.push(`${where}: position（ポジションの表記）がない`);
      break;
  }
}

const fingeringsByInstrument = new Map<InstrumentId, CheckedFingerings>();
let fingeringNotes = 0;

for (const file of jsonFiles(fingeringsDir)) {
  const data = readJson<InstrumentFingerings>(fingeringsDir, file);
  const instrument = instrumentOf(file, data.instrument);
  if (!instrument) continue;
  if (data.family !== instrument.family) errors.push(`${file}: family "${data.family}" が instruments.ts の "${instrument.family}" と一致しない`);

  const lowest = data.range ? midiOf(`${file} range.lowest`, data.range.lowest) : null;
  const highest = data.range ? midiOf(`${file} range.highest`, data.range.highest) : null;
  if (!data.range) errors.push(`${file}: range がない`);
  if (lowest !== null && highest !== null && lowest > highest) errors.push(`${file}: range の lowest が highest より高い`);

  // テンプレート（木管・バルブは押さえる要素の ID を確かめる。トロンボーン・ストリングベースはファイルがあることだけ）
  const templateFile = new URL(`${instrument.fingeringTemplate}.svg`, templatesDir);
  let templateIds: string[] | null = null;
  if (!existsSync(templateFile)) {
    errors.push(`${file}: テンプレート templates/${instrument.fingeringTemplate}.svg がない`);
  } else {
    try {
      templateIds = templateKeyIds(readFileSync(templateFile, 'utf8'));
    } catch (e) {
      errors.push(`templates/${instrument.fingeringTemplate}.svg: ${(e as Error).message}`);
    }
  }

  for (const [key, entries] of Object.entries(data.entries)) {
    const where = `${file} MIDI ${key}`;
    fingeringNotes++;
    if (!/^\d+$/.test(key)) {
      errors.push(`${where}: キーが MIDI 番号（整数の文字列）でない`);
      continue;
    }
    const midi = Number(key);
    if (lowest !== null && highest !== null && (midi < lowest || midi > highest)) {
      errors.push(`${where}: 運指データの音域 ${data.range.lowest}〜${data.range.highest} の外`);
    }
    if (!Array.isArray(entries) || entries.length === 0) {
      errors.push(`${where}: 運指エントリがない`);
      continue;
    }
    // 3. isPrimary: true がちょうど1つ（楽譜に出てこない音も含めて確かめる）
    const primaries = entries.filter((e) => e.isPrimary === true).length;
    if (primaries !== 1) errors.push(`${where}: isPrimary: true が ${primaries} 個（ちょうど1つのはず）`);
    const ids = entries.map((e) => e.id);
    if (new Set(ids).size !== ids.length) errors.push(`${where}: 運指エントリの id が重複している`);
    entries.forEach((entry, i) => checkEntry(`${where} [${i}]`, instrument, entry, templateIds));
  }
  fingeringsByInstrument.set(instrument.id, { data, lowest, highest });
}

// ---- 楽譜データ ----

let checkedScales = 0;

for (const file of jsonFiles(scalesDir)) {
  const data = readJson<InstrumentScales>(scalesDir, file);
  const instrument = instrumentOf(file, data.instrument);
  if (!instrument) continue;
  if (data.clef !== instrument.clef) errors.push(`${file}: clef "${data.clef}" が instruments.ts の "${instrument.clef}" と一致しない`);
  const fingerings = fingeringsByInstrument.get(instrument.id);
  if (!fingerings) errors.push(`${file}: 運指データ fingerings/${instrument.id}.json がない`);

  for (const [keyId, scale] of Object.entries(data.scales)) {
    const where = `${file} ${keyId}`;
    const key = SCALE_KEYS.find((k) => k.id === keyId);
    if (!key) {
      errors.push(`${where}: 未定義の調`);
      continue;
    }
    checkedScales++;

    if (!Number.isInteger(scale.keySignature) || Math.abs(scale.keySignature) > 7) {
      errors.push(`${where}: keySignature ${scale.keySignature} が -7〜7 の整数でない`);
    }

    // 1. 上行8音・下行8音（どちらも最高音を含む16音）
    if (scale.ascending.length !== 8) errors.push(`${where}: ascending が ${scale.ascending.length} 音（8音のはず）`);
    if (scale.descending.length !== 8) errors.push(`${where}: descending が ${scale.descending.length} 音（8音のはず）`);

    const pitches = [...scale.ascending, ...scale.descending];
    const midis = pitches.map((p) => midiOf(where, p));
    if (midis.some((m) => m === null)) continue;
    const position = (i: number) => (i < scale.ascending.length ? `上行${i + 1}音目` : `下行${i - scale.ascending.length + 1}音目`);

    // 2. 実音の調＋楽器の移調から導いた理論音列と MIDI 番号で一致する
    const expected = theoreticalWrittenScale(key, instrument, midis[0]!);
    const expectedLine = [...expected.ascending, ...expected.descending];
    pitches.forEach((pitch, i) => {
      if (midis[i] !== expectedLine[i]) {
        errors.push(`${where}: ${position(i)} ${pitch}（MIDI ${midis[i]}）が理論値 MIDI ${expectedLine[i]} と一致しない`);
      }
    });

    if (!fingerings) continue;
    pitches.forEach((pitch, i) => {
      const midi = midis[i]!;
      // 3. 運指エントリがある（isPrimary の数は運指データの検証で確かめている）
      if (!fingerings.data.entries[String(midi)]?.length) {
        errors.push(`${where}: ${position(i)} ${pitch}（MIDI ${midi}）の運指エントリがない`);
      }
      // 5. 楽器の音域内
      const { lowest, highest } = fingerings;
      if (lowest !== null && highest !== null && (midi < lowest || midi > highest)) {
        const { range } = fingerings.data;
        errors.push(`${where}: ${position(i)} ${pitch} が楽器の音域 ${range.lowest}〜${range.highest} の外`);
      }
    });
  }
}

if (errors.length > 0) {
  console.error(`データ検証で ${errors.length} 件の問題が見つかりました：`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`OK（楽譜データ ${checkedScales} 調、運指データ ${fingeringsByInstrument.size} 楽器 ${fingeringNotes} 音）`);
