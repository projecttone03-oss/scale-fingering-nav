// 五線の幅 500 / 480 / 400 を並べて比べるページ（開発用、本番ビルドには含まれない）。
// スマホを譜面台に置いた距離から読みやすさを比べる（この比較で幅 500 に決定。SPEC 5.7）。例：dev/widths.html?key=C_major&value=whole&bpm=60
import '../src/styles/base.css';
import '../src/styles/staff.css';
import trumpet from '../src/data/scales/bb_trumpet.json';
import { createPlayer } from '../src/audio/player.ts';
import { getInstrument } from '../src/data/instruments.ts';
import type { InstrumentScales, ScaleEntry } from '../src/data/scales.ts';
import { parsePitch } from '../src/music/pitch.ts';
import type { NoteValue } from '../src/music/meter.ts';
import { STAVE_WIDTH, applyStaffHighlight, renderScaleStaves } from '../src/render/staff.ts';
import {
  BPM_MAX,
  BPM_MIN,
  INITIAL_STATE,
  clampBpm,
  createStore,
  isPlaying,
  staffHighlight,
  type AppState,
} from '../src/state/store.ts';

const data = trumpet as InstrumentScales;
const instrument = getInstrument(data.instrument);

const up = (s: string) => s.split(' ');
const SAMPLES: Record<string, { label: string; scale: ScaleEntry }> = {
  C_major: { label: 'ハ長調 ♯2', scale: data.scales.C_major! },
  C_minor: { label: 'ハ短調 ♭1', scale: data.scales.C_minor! },
  // 調号が多いときの窮屈さを見るための音列。PDF から転記したデータではないので src/data には入れない
  sharp7: {
    label: '見本 ♯7',
    scale: { keySignature: 7, ascending: up('C#4 D#4 E#4 F#4 G#4 A#4 B#4 C#5'), descending: up('C#5 B#4 A#4 G#4 F#4 E#4 D#4 C#4') },
  },
  flat6: {
    label: '見本 ♭6',
    scale: { keySignature: -6, ascending: up('Gb4 Ab4 Bb4 Cb5 Db5 Eb5 F5 Gb5'), descending: up('Gb5 F5 Eb5 Db5 Cb5 Bb4 Ab4 Gb4') },
  },
};
const VALUES: Record<NoteValue, string> = { whole: '全音符', half: '二分音符', quarter: '四分音符' };
const OPTIONS = [
  { letter: 'A', width: 500 },
  { letter: 'B', width: 480 },
  { letter: 'C', width: 400 },
] as const;

const params = new URLSearchParams(location.search);
const sampleId = Object.keys(SAMPLES).find((id) => id === params.get('key')) ?? 'C_major';
const value = (Object.keys(VALUES) as NoteValue[]).find((v) => v === params.get('value')) ?? 'whole';
const { scale } = SAMPLES[sampleId]!;
const pitches = [...scale.ascending, ...scale.descending];
const writtenMidis = pitches.map((p) => parsePitch(p).midi);

const store = createStore({
  ...INITIAL_STATE,
  instrumentId: instrument.id,
  noteValue: value,
  bpm: params.has('bpm') ? clampBpm(Number(params.get('bpm'))) : INITIAL_STATE.bpm,
});
const player = createPlayer(store);

const selectOptions = (entries: [string, string][], selected: string) =>
  entries.map(([id, label]) => `<option value="${id}"${id === selected ? ' selected' : ''}>${label}</option>`).join('');

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <style>
    .controls { display: flex; flex-wrap: wrap; gap: 6px 8px; align-items: center; }
    .controls select, .controls button, .controls input { font-size: 1rem; min-height: 44px; }
    .controls input { width: 3.5em; }
    .option { margin-top: 10px; }
    .option h2 { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 0.6em; margin: 0; font-size: 0.95rem; }
    .option .letter { font-size: 1.25rem; }
    .option .info { font-size: 0.8rem; font-weight: normal; opacity: 0.75; }
    .hint { font-size: 0.8rem; opacity: 0.75; margin-top: 16px; }
  </style>
  <!-- 3案が画面に収まるよう、よく使う操作だけを上に1行で置く（テンポは下） -->
  <div class="controls">
    <select id="key" aria-label="調">${selectOptions(Object.entries(SAMPLES).map(([id, s]) => [id, s.label]), sampleId)}</select>
    <select id="value" aria-label="音価">${selectOptions(Object.entries(VALUES), value)}</select>
    <button id="play" style="min-width:5.5em">▶ 再生</button>
  </div>
  ${OPTIONS.map(
    (option) => `
    <section class="option" data-width="${option.width}">
      <h2>
        <span class="letter">${option.letter}</span>
        <span>幅 ${option.width}${option.width === STAVE_WIDTH ? '（今）' : ''}</span>
        <span class="info"></span>
      </h2>
      ${renderScaleStaves(scale, instrument.clef, value, option.width)}
    </section>`,
  ).join('')}
  <p class="controls">
    <label>テンポ ♩= <input id="bpm" type="number" min="${BPM_MIN}" max="${BPM_MAX}" step="1"></label>
  </p>
  <p class="hint">
    3つの楽譜はハイライトがそろって動きます。停止中に音符をタップすると、その音をハイライトします（もう一度タップで解除）。<br>
    「余白 83%」などの表示は、音符が収まらないため小節線まわりの余白を PDF の 83% に縮めていることを表します。<br>
    「見本 ♯7／♭6」は調号が多いときの確認用の音列で、アプリのデータではありません。
  </p>
`;

const $ = <T extends HTMLElement>(selector: string) => app.querySelector<T>(selector)!;
const keySelect = $<HTMLSelectElement>('#key');
const valueSelect = $<HTMLSelectElement>('#value');
const bpmInput = $<HTMLInputElement>('#bpm');
const playButton = $<HTMLButtonElement>('#play');

/**
 * 上段の「拍子記号の右端 → 最初の符頭」が PDF の値の何倍か（SPEC 5.7）。
 * 1 未満なら、音符が収まらないので小節線まわりの余白を縮めている。
 * 18 は数字「4」の幅（1.8 線間）、22 は PDF の間隔（2.2 線間）。staff.ts の値に合わせる
 */
function upperGapRatio(svg: SVGSVGElement): number {
  const timeSig = svg.querySelector<SVGTextElement>('.time-signature text')!;
  const head = svg.querySelector<SVGTextElement>('.note[data-index="0"] .head')!;
  return (Number(head.getAttribute('x')) - Number(timeSig.getAttribute('x')) - 18) / 22;
}

// 1線間が実際に何 px で表示されているか（端末の幅で変わる）と、余白を縮めているか
function updateInfo() {
  for (const section of app.querySelectorAll<HTMLElement>('.option')) {
    const svg = section.querySelector<SVGSVGElement>('svg.staff')!;
    const space = (svg.getBoundingClientRect().width / Number(section.dataset.width)) * 10;
    const ratio = upperGapRatio(svg);
    const gap = ratio >= 0.995 ? 'PDF どおり' : `余白 ${Math.round(ratio * 100)}%`;
    section.querySelector('.info')!.textContent = `1線間 ${space.toFixed(1)}px　${gap}`;
  }
}

function render(state: AppState) {
  const { progress } = state;
  const playing = isPlaying(progress);

  const highlight = staffHighlight(progress, state.previewIndex);
  applyStaffHighlight(app, highlight.current, highlight.next);

  playButton.textContent = playing ? '■ 停止' : '▶ 再生';
  // 再生中は調・音価・テンポを変えない（SPEC 6.5）
  for (const control of [keySelect, valueSelect, bpmInput]) control.disabled = playing;
  if (document.activeElement !== bpmInput) bpmInput.value = String(state.bpm);
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

// 調・音価を変えたらページを読み込み直す（テンポは引き継ぐ）
const reload = () => {
  location.search = `?${new URLSearchParams({ key: keySelect.value, value: valueSelect.value, bpm: String(store.getState().bpm) })}`;
};
keySelect.addEventListener('change', reload);
valueSelect.addEventListener('change', reload);

bpmInput.addEventListener('change', () => {
  if (Number.isFinite(bpmInput.valueAsNumber)) store.setState({ bpm: clampBpm(bpmInput.valueAsNumber) });
  bpmInput.value = String(store.getState().bpm);
});

// 音符のタップで予習表示（停止中のみ）。3つの楽譜は同じ data-index を持つので、どれをタップしてもそろう
app.addEventListener('click', (event) => {
  const note = (event.target as Element).closest<SVGGElement>('.note');
  if (!note) return;
  const { progress, previewIndex } = store.getState();
  if (isPlaying(progress)) return;
  // 再生が終わって最終音が残っている（done）ときは、先頭（idle）に戻してから予習表示にする
  if (progress.phase === 'done') player.stop();
  const index = Number(note.dataset.index);
  store.setState({ previewIndex: index === previewIndex ? null : index });
});

store.subscribe((state) => render(state));
render(store.getState());
updateInfo();
window.addEventListener('resize', updateInfo);
