// 音が切り替わるときの見せ方を、3案同時に動かして比べるページ（開発用、本番ビルドには含まれない）。
// 1つの再生（1つのストア）で3組の「いま／つぎ」枠を動かすので、同じ音の切り替わりを3案で見比べられる。
// 例：dev/transitions.html?key=C_minor&value=quarter&bpm=120
import '../src/styles/base.css';
import '../src/styles/staff.css';
import '../src/styles/fingering.css';
import '../src/styles/nowNext.css';
import './transitions.css';
import trumpetFingerings from '../src/data/fingerings/bb_trumpet.json';
import trumpetScales from '../src/data/scales/bb_trumpet.json';
import trumpetTemplate from '../src/templates/bb_trumpet.svg?raw';
import { createPlayer } from '../src/audio/player.ts';
import type { InstrumentFingerings } from '../src/data/fingerings.ts';
import { getInstrument } from '../src/data/instruments.ts';
import { getScaleKey } from '../src/data/keys.ts';
import type { InstrumentScales } from '../src/data/scales.ts';
import type { NoteValue } from '../src/music/meter.ts';
import { parsePitch } from '../src/music/pitch.ts';
import { mountNowNext, nowNextSource, type FrameTransition } from '../src/render/nowNext.ts';
import {
  BPM_MAX,
  BPM_MIN,
  INITIAL_STATE,
  NOTE_COUNT,
  clampBpm,
  createStore,
  isPlaying,
  stepSelection,
  type AppState,
} from '../src/state/store.ts';

const scales = trumpetScales as InstrumentScales;
const fingerings = trumpetFingerings as InstrumentFingerings;
const instrument = getInstrument(scales.instrument);
const keyIds = Object.keys(scales.scales);
const VALUES: Record<NoteValue, string> = { whole: '全音符', half: '二分', quarter: '四分' };

/** 比べた3案（SPEC 2.6。実機で比べて案3に決定） */
const CASES: { transition: FrameTransition; label: string }[] = [
  { transition: 'crossfade', label: '案1　クロスフェード' },
  { transition: 'valves', label: '案2　変わるバルブだけ一瞬ふくらむ' },
  { transition: 'slide', label: '案3　枠の中だけでスライド（採用）' },
];

const params = new URLSearchParams(location.search);
const store = createStore({
  ...INITIAL_STATE,
  instrumentId: instrument.id,
  keyId: keyIds.find((id) => id === params.get('key')) ?? keyIds[0]!,
  noteValue: (Object.keys(VALUES) as NoteValue[]).find((v) => v === params.get('value')) ?? 'quarter',
  bpm: params.has('bpm') ? clampBpm(Number(params.get('bpm'))) : INITIAL_STATE.bpm,
});
const player = createPlayer(store);

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <h1>音の切り替えの見せ方（3案）</h1>
  <div class="controls">
    <select id="key" aria-label="調">${keyIds
      .map((id) => `<option value="${id}">${getScaleKey(id).nameJa}</option>`)
      .join('')}</select>
    <select id="value" aria-label="音価">${(Object.keys(VALUES) as NoteValue[])
      .map((v) => `<option value="${v}">${VALUES[v]}</option>`)
      .join('')}</select>
    <input id="bpm" type="number" min="${BPM_MIN}" max="${BPM_MAX}" step="1" aria-label="テンポ（BPM）">
    <button type="button" id="play" class="play">▶ 再生</button>
    <span class="steps">
      <button type="button" id="prevNote" aria-label="前の音">◀</button>
      <span class="position" id="position"></span>
      <button type="button" id="nextNote" aria-label="次の音">▶</button>
    </span>
  </div>
  ${CASES.map(({ label }, i) => `<section class="case"><h2>${label}</h2><div class="pair" data-case="${i}"></div></section>`).join('')}
  <p class="hint">再生すると3案が同時に動きます。停止中は ◀ ▶ と枠の左右スワイプでも切り替えを試せます。</p>
`;

const $ = <T extends Element>(selector: string) => app.querySelector<T>(selector)!;
const keySelect = $<HTMLSelectElement>('#key');
const valueSelect = $<HTMLSelectElement>('#value');
const bpmInput = $<HTMLInputElement>('#bpm');
const playButton = $<HTMLButtonElement>('#play');
const position = $<HTMLSpanElement>('#position');
const stepButtons = [$<HTMLButtonElement>('#prevNote'), $<HTMLButtonElement>('#nextNote')];

const sourceOf = (state: AppState) => nowNextSource(scales.scales[state.keyId]!, fingerings, trumpetTemplate);
let source = sourceOf(store.getState());

const step = (direction: 1 | -1) => {
  const { progress, selectedIndex } = store.getState();
  if (isPlaying(progress)) return;
  if (progress.phase === 'done') player.stop();
  store.setState({ selectedIndex: stepSelection(selectedIndex, direction) });
};

const views = CASES.map(({ transition }, i) =>
  mountNowNext($<HTMLDivElement>(`.pair[data-case="${i}"]`), source, {
    // この比較ページでは S3 は開かない（切り替えの見え方だけを比べる）
    onOpen: () => {},
    onSwipe: step,
    transition,
  }),
);

function render(state: AppState) {
  const { progress } = state;
  const playing = isPlaying(progress);
  for (const view of views) {
    view.update(progress, state.selectedIndex, state.showAlternateFingerings);
    view.setBeatClock(state.beatClock);
  }
  playButton.textContent = playing ? '■ 停止' : '▶ 再生';
  for (const control of [keySelect, valueSelect, bpmInput, ...stepButtons]) control.disabled = playing;
  if (document.activeElement !== bpmInput) bpmInput.value = String(state.bpm);
  keySelect.value = state.keyId;
  valueSelect.value = state.noteValue;
  const shown = progress.phase === 'idle' ? state.selectedIndex : progress.noteIndex;
  position.textContent = `${shown === null ? '–' : shown + 1} / ${NOTE_COUNT}`;
}

store.subscribe((state, prev) => {
  if (state.keyId !== prev.keyId) {
    source = sourceOf(state);
    for (const view of views) view.setSource(source);
  }
  render(state);
});

keySelect.addEventListener('change', () => store.setState({ keyId: keySelect.value, selectedIndex: null }));
valueSelect.addEventListener('change', () => store.setState({ noteValue: valueSelect.value as NoteValue }));
bpmInput.addEventListener('change', () => {
  if (Number.isFinite(bpmInput.valueAsNumber)) store.setState({ bpm: clampBpm(bpmInput.valueAsNumber) });
  bpmInput.value = String(store.getState().bpm);
});
stepButtons[0]!.addEventListener('click', () => step(-1));
stepButtons[1]!.addEventListener('click', () => step(1));

playButton.addEventListener('click', () => {
  const state = store.getState();
  if (isPlaying(state.progress)) {
    player.stop();
    return;
  }
  // クリック処理の中で play を呼ぶ（AudioContext の生成・resume がこの中で行われる）
  player.play({
    writtenMidis: source.pitches.map((p) => parsePitch(p).midi),
    transposition: instrument.transposition,
    bpm: state.bpm,
    noteValue: state.noteValue,
    startIndex: state.selectedIndex ?? 0,
  });
});

render(store.getState());
