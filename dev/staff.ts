// 五線譜と再生の確認ページ（開発用、本番ビルドには含まれない）。
// 例：dev/staff.html?key=C_minor&value=half&bpm=90&current=5
import '../src/styles/base.css';
import '../src/styles/staff.css';
import trumpet from '../src/data/scales/bb_trumpet.json';
import { createPlayer } from '../src/audio/player.ts';
import { getInstrument } from '../src/data/instruments.ts';
import { getScaleKey } from '../src/data/keys.ts';
import type { InstrumentScales } from '../src/data/scales.ts';
import { accidentalMarks } from '../src/music/accidentals.ts';
import { parsePitch } from '../src/music/pitch.ts';
import type { NoteValue } from '../src/music/meter.ts';
import { applyStaffHighlight, renderScaleStaves } from '../src/render/staff.ts';
import {
  BPM_MAX,
  BPM_MIN,
  INITIAL_STATE,
  NOTE_COUNT,
  clampBpm,
  createStore,
  isPlaying,
  nowNext,
  staffHighlight,
  type AppState,
} from '../src/state/store.ts';

const data = trumpet as InstrumentScales;
const instrument = getInstrument(data.instrument);
const keyIds = Object.keys(data.scales);
const VALUES: Record<NoteValue, string> = { whole: '全音符', half: '二分音符', quarter: '四分音符' };

const params = new URLSearchParams(location.search);
const keyId = keyIds.find((id) => id === params.get('key')) ?? keyIds[0]!;
const value = (Object.keys(VALUES) as NoteValue[]).find((v) => v === params.get('value')) ?? 'half';
const scale = data.scales[keyId]!;
const key = getScaleKey(keyId);

const initialPreview = params.get('current');
const store = createStore({
  ...INITIAL_STATE,
  instrumentId: instrument.id,
  keyId,
  noteValue: value,
  bpm: params.has('bpm') ? clampBpm(Number(params.get('bpm'))) : INITIAL_STATE.bpm,
  previewIndex:
    initialPreview !== null && /^\d+$/.test(initialPreview) ? Math.min(Number(initialPreview), NOTE_COUNT - 1) : null,
});
const player = createPlayer(store);

// 調・音価のリンク。href はテンポが変わるたびに作り直す（updateLinks）
const link = (next: { key?: string; value?: string }, label: string, active: boolean) => {
  const data = next.key ? `data-key="${next.key}"` : `data-value="${next.value}"`;
  return active ? `<strong>${label}</strong>` : `<a class="nav" ${data}>${label}</a>`;
};

const pitches = [...scale.ascending, ...scale.descending];
const writtenMidis = pitches.map((p) => parsePitch(p).midi);
const marks = accidentalMarks(scale.keySignature, pitches);
const MARK_LABEL = { natural: '♮', sharp: '♯', flat: '♭', doubleSharp: '𝄪', doubleFlat: '𝄫' } as const;
// 五線の幅（SVG 単位、線間隔 = 10）。?width=480 などで比べる（開発用）
const staffWidth = /^\d+$/.test(params.get('width') ?? '') ? Math.min(800, Math.max(300, Number(params.get('width')))) : undefined;
const staff = renderScaleStaves(scale, instrument.clef, value, staffWidth);

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <h1 style="font-size:1.1rem">${instrument.nameJa}：${key.nameJa} (${key.nameEn})・${VALUES[value]}</h1>
  <p>調：${keyIds.map((id) => link({ key: id }, getScaleKey(id).nameJa, id === keyId)).join(' ／ ')}</p>
  <p>音価：${(Object.keys(VALUES) as NoteValue[]).map((v) => link({ value: v }, VALUES[v], v === value)).join(' ／ ')}</p>
  <p>
    <button id="play" style="min-width:5em;min-height:44px">▶ 再生</button>
    テンポ：<button id="slower">−5</button>
    <input id="bpm" type="number" min="${BPM_MIN}" max="${BPM_MAX}" step="1" style="width:4em"> BPM
    <button id="faster">+5</button>
    <label><input id="tone" type="checkbox"> 参考音</label>
  </p>
  <p id="status" style="font-variant-numeric:tabular-nums"></p>
  <p>
    予習（停止中のみ）：<button id="prev">◀</button> <button id="next">▶</button> <button id="clear">解除</button>
  </p>
  <h2 style="font-size:1rem">スマホ幅（375px）</h2>
  <div style="width:375px;max-width:100%;border:1px dashed #999;box-sizing:border-box">${staff}</div>
  <h2 style="font-size:1rem">広い画面（720px）</h2>
  <div style="width:720px;max-width:100%;border:1px dashed #999;box-sizing:border-box">${staff}</div>
  <h2 style="font-size:1rem">16音と臨時記号（SPEC 5.3）</h2>
  <ol start="0">${pitches
    .map((p, i) => `<li>${i < 8 ? '上行' : '下行'} ${p}${marks[i] ? `　→ 記号 ${MARK_LABEL[marks[i]]}` : ''}</li>`)
    .join('')}</ol>
`;

const $ = <T extends HTMLElement>(selector: string) => app.querySelector<T>(selector)!;
const playButton = $<HTMLButtonElement>('#play');
const bpmInput = $<HTMLInputElement>('#bpm');
const toneInput = $<HTMLInputElement>('#tone');
const status = $<HTMLParagraphElement>('#status');
const tempoControls = [bpmInput, $<HTMLButtonElement>('#slower'), $<HTMLButtonElement>('#faster')];
const previewControls = [$<HTMLButtonElement>('#prev'), $<HTMLButtonElement>('#next'), $<HTMLButtonElement>('#clear')];

const PHASE_LABEL = { idle: '停止中', countin: 'カウントイン', playing: '再生中', done: 'おわり' } as const;
const label = (index: number | 'end' | null) => (index === null ? '―' : index === 'end' ? 'おわり' : pitches[index]);

function render(state: AppState) {
  const { progress } = state;
  const playing = isPlaying(progress);

  // ハイライト：停止中は予習表示、それ以外は progress から（SPEC 2.5, 7.3）
  const highlight =
    progress.phase === 'idle' && state.previewIndex !== null
      ? { current: state.previewIndex, next: state.previewIndex < NOTE_COUNT - 1 ? state.previewIndex + 1 : null }
      : staffHighlight(progress);
  applyStaffHighlight(app, highlight.current, highlight.next);

  playButton.textContent = playing ? '■ 停止' : '▶ 再生';
  // v1 は再生中のテンポ変更不可（SPEC 6.5）。参考音は再生中も切り替えられる
  for (const control of tempoControls) control.disabled = playing;
  for (const control of previewControls) control.disabled = playing;
  if (document.activeElement !== bpmInput) bpmInput.value = String(state.bpm);
  toneInput.checked = state.toneEnabled;

  const { now, next } = nowNext(progress);
  const position = progress.noteIndex === null ? '–' : String(progress.noteIndex + 1);
  status.textContent = `${PHASE_LABEL[progress.phase]}　${position} / ${NOTE_COUNT}　いま：${label(now)}　つぎ：${label(next)}`;
}

playButton.addEventListener('click', () => {
  const state = store.getState();
  if (isPlaying(state.progress)) {
    player.stop();
    return;
  }
  store.setState({ previewIndex: null });
  // クリック処理の中で play を呼ぶ（AudioContext の生成・resume がこの中で行われる）
  player.play({ writtenMidis, transposition: instrument.transposition, bpm: state.bpm, noteValue: state.noteValue });
});

const setBpm = (bpm: number) => store.setState({ bpm: clampBpm(bpm) });
bpmInput.addEventListener('change', () => {
  // 空欄や数字でない値は無視する。確定したら、丸めた値（40〜160 の整数）を必ず欄に書き戻す
  if (Number.isFinite(bpmInput.valueAsNumber)) setBpm(bpmInput.valueAsNumber);
  bpmInput.value = String(store.getState().bpm);
});
$<HTMLButtonElement>('#slower').addEventListener('click', () => setBpm(store.getState().bpm - 5));
$<HTMLButtonElement>('#faster').addEventListener('click', () => setBpm(store.getState().bpm + 5));
toneInput.addEventListener('change', () => store.setState({ toneEnabled: toneInput.checked }));

const movePreview = (delta: number) => {
  const { previewIndex, progress } = store.getState();
  // 再生が終わって最終音が残っている（done）ときは、先頭（idle）に戻してから予習表示にする
  if (progress.phase === 'done') player.stop();
  const start = previewIndex ?? (delta > 0 ? -1 : NOTE_COUNT);
  store.setState({ previewIndex: Math.min(NOTE_COUNT - 1, Math.max(0, start + delta)) });
};
$<HTMLButtonElement>('#prev').addEventListener('click', () => movePreview(-1));
$<HTMLButtonElement>('#next').addEventListener('click', () => movePreview(1));
$<HTMLButtonElement>('#clear').addEventListener('click', () => store.setState({ previewIndex: null }));

function updateLinks(bpm: number) {
  for (const a of app.querySelectorAll<HTMLAnchorElement>('a.nav')) {
    const q = new URLSearchParams({ key: a.dataset.key ?? keyId, value: a.dataset.value ?? value, bpm: String(bpm) });
    a.href = `?${q}`;
  }
}

store.subscribe((state, prev) => {
  render(state);
  if (state.bpm !== prev.bpm) updateLinks(state.bpm);
});
render(store.getState());
updateLinks(store.getState().bpm);
