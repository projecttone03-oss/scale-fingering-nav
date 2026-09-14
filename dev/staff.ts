// 五線譜の確認ページ（開発用、本番ビルドには含まれない）。
// 例：dev/staff.html?key=C_minor&value=half&current=5
import '../src/styles/base.css';
import '../src/styles/staff.css';
import trumpet from '../src/data/scales/bb_trumpet.json';
import { getInstrument } from '../src/data/instruments.ts';
import { getScaleKey } from '../src/data/keys.ts';
import type { InstrumentScales } from '../src/data/scales.ts';
import { accidentalMarks } from '../src/music/accidentals.ts';
import { applyStaffHighlight, renderScaleStaves, type NoteValue } from '../src/render/staff.ts';

const data = trumpet as InstrumentScales;
const instrument = getInstrument(data.instrument);
const keyIds = Object.keys(data.scales);
const VALUES: Record<NoteValue, string> = { whole: '全音符', half: '二分音符', quarter: '四分音符' };

const params = new URLSearchParams(location.search);
const keyId = keyIds.find((id) => id === params.get('key')) ?? keyIds[0]!;
const value = (Object.keys(VALUES) as NoteValue[]).find((v) => v === params.get('value')) ?? 'half';
const scale = data.scales[keyId]!;
const key = getScaleKey(keyId);

const link = (next: Record<string, string>, label: string, active: boolean) => {
  const q = new URLSearchParams({ key: keyId, value, ...next });
  return active ? `<strong>${label}</strong>` : `<a href="?${q}">${label}</a>`;
};

const pitches = [...scale.ascending, ...scale.descending];
const marks = accidentalMarks(scale.keySignature, pitches);
const MARK_LABEL = { natural: '♮', sharp: '♯', flat: '♭', doubleSharp: '𝄪', doubleFlat: '𝄫' } as const;
const staff = renderScaleStaves(scale, instrument.clef, value);

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <h1 style="font-size:1.1rem">${instrument.nameJa}：${key.nameJa} (${key.nameEn})・${VALUES[value]}</h1>
  <p>調：${keyIds.map((id) => link({ key: id }, getScaleKey(id).nameJa, id === keyId)).join(' ／ ')}</p>
  <p>音価：${(Object.keys(VALUES) as NoteValue[]).map((v) => link({ value: v }, VALUES[v], v === value)).join(' ／ ')}</p>
  <p>
    ハイライト：<button id="prev">◀</button> <button id="next">▶</button> <button id="clear">解除</button>
    <span id="state"></span>
  </p>
  <h2 style="font-size:1rem">スマホ幅（375px）</h2>
  <div style="width:375px;max-width:100%;border:1px dashed #999;box-sizing:border-box">${staff}</div>
  <h2 style="font-size:1rem">広い画面（720px）</h2>
  <div style="width:720px;max-width:100%;border:1px dashed #999;box-sizing:border-box">${staff}</div>
  <h2 style="font-size:1rem">15音と臨時記号（SPEC 5.3）</h2>
  <ol start="0">${pitches
    .map((p, i) => `<li>${i < 8 ? '上行' : '下行'} ${p}${marks[i] ? `　→ 記号 ${MARK_LABEL[marks[i]]}` : ''}</li>`)
    .join('')}</ol>
`;

const initial = params.get('current');
let current: number | null = initial !== null && /^\d+$/.test(initial) ? Math.min(Number(initial), 14) : null;
const render = () => {
  const next = current === null ? null : current < 14 ? current + 1 : null;
  applyStaffHighlight(app, current, next);
  app.querySelector('#state')!.textContent = current === null ? '（なし）' : `current=${current} / next=${next ?? 'おわり'}`;
};
app.querySelector('#prev')!.addEventListener('click', () => {
  current = current === null ? 14 : Math.max(0, current - 1);
  render();
});
app.querySelector('#next')!.addEventListener('click', () => {
  current = current === null ? 0 : Math.min(14, current + 1);
  render();
});
app.querySelector('#clear')!.addEventListener('click', () => {
  current = null;
  render();
});
render();
