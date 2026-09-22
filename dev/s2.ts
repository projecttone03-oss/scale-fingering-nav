// S2 メイン画面を組み立てて確認するページ（開発用、本番ビルドには含まれない）。
// 五線譜・いま／つぎ枠・S3 は本番のモジュールを使う。ヘッダー・設定行・再生バーは、M5 で src/ui/ に作るまでの仮のもの。
// 「別の運指を表示」の切り替えも M5 の設定画面に置くまでの仮の場所（ヘッダー）。設定は localStorage に保存する。
// 例：dev/s2.html?key=C_minor&value=quarter&bpm=90&current=5&open=now（current は選んだ音 0〜15）
import '../src/styles/base.css';
import '../src/styles/staff.css';
import '../src/styles/fingering.css';
import '../src/styles/nowNext.css';
import '../src/styles/modals.css';
import './s2.css';
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
import { mountNowNext, nowNextSource } from '../src/render/nowNext.ts';
import { createGuidePulse } from '../src/render/pulse.ts';
import { applyStaffHighlight, renderScaleStaves } from '../src/render/staff.ts';
import { loadSettings, persistSettings } from '../src/state/settings.ts';
import {
  BPM_MAX,
  BPM_MIN,
  INITIAL_STATE,
  NOTE_COUNT,
  clampBpm,
  createStore,
  isPlaying,
  staffHighlight,
  stepSelection,
  type AppState,
} from '../src/state/store.ts';
import { createFingeringModal } from '../src/ui/modals.ts';
import { attachStaffCursor } from '../src/ui/staffCursor.ts';

const scales = trumpetScales as InstrumentScales;
const fingerings = trumpetFingerings as InstrumentFingerings;
const instrument = getInstrument(scales.instrument);
const keyIds = Object.keys(scales.scales);
const VALUES: Record<NoteValue, string> = { whole: '全音符', half: '二分', quarter: '四分' };

const params = new URLSearchParams(location.search);
const selectedParam = params.get('current');
const store = createStore({
  ...INITIAL_STATE,
  instrumentId: instrument.id,
  keyId: keyIds.find((id) => id === params.get('key')) ?? keyIds[0]!,
  noteValue: (Object.keys(VALUES) as NoteValue[]).find((v) => v === params.get('value')) ?? INITIAL_STATE.noteValue,
  bpm: params.has('bpm') ? clampBpm(Number(params.get('bpm'))) : INITIAL_STATE.bpm,
  selectedIndex: selectedParam !== null && /^\d+$/.test(selectedParam) ? Math.min(Number(selectedParam), NOTE_COUNT - 1) : null,
  ...loadSettings(),
});
persistSettings(store);
const player = createPlayer(store);
const modal = createFingeringModal();

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="s2-header">
    <span class="s2-instrument">${instrument.nameJa}</span>
    <div class="s2-header-actions">
      <button type="button" id="alternates" class="toggle">別の運指を表示</button>
      <button class="s2-info" type="button" aria-label="情報（M5 で実装）" disabled>i</button>
    </div>
  </header>
  <div class="s2-settings">
    <div class="s2-row">
      <select id="key" aria-label="調">${keyIds
        .map((id) => `<option value="${id}">${getScaleKey(id).nameJa} (${getScaleKey(id).nameEn})</option>`)
        .join('')}</select>
      <div class="segmented" role="group" aria-label="音価">${(Object.keys(VALUES) as NoteValue[])
        .map((v) => `<button type="button" data-value="${v}">${VALUES[v]}</button>`)
        .join('')}</div>
    </div>
    <div class="s2-row">
      <div class="tempo">
        <button type="button" id="slower" aria-label="テンポを 5 下げる">−5</button>
        <input id="bpm" type="number" min="${BPM_MIN}" max="${BPM_MAX}" step="1" aria-label="テンポ（BPM）">
        <button type="button" id="faster" aria-label="テンポを 5 上げる">+5</button>
        <span>BPM</span>
      </div>
      <button type="button" id="tone" class="toggle">参考音</button>
    </div>
  </div>
  <div class="s2-staff"></div>
  <div class="s2-nownext"></div>
  <div class="s2-playbar">
    <button type="button" id="play" class="play">▶ 再生</button>
    <div class="s2-position">
      <button type="button" id="prevNote" class="step" aria-label="前の音を選ぶ">◀</button>
      <span class="position" id="position"></span>
      <button type="button" id="nextNote" class="step" aria-label="次の音を選ぶ">▶</button>
    </div>
  </div>
`;

const $ = <T extends Element>(selector: string) => app.querySelector<T>(selector)!;
const keySelect = $<HTMLSelectElement>('#key');
const valueButtons = [...app.querySelectorAll<HTMLButtonElement>('.segmented button')];
const bpmInput = $<HTMLInputElement>('#bpm');
const toneButton = $<HTMLButtonElement>('#tone');
const alternatesButton = $<HTMLButtonElement>('#alternates');
const playButton = $<HTMLButtonElement>('#play');
const position = $<HTMLSpanElement>('#position');
const stepButtons = [$<HTMLButtonElement>('#prevNote'), $<HTMLButtonElement>('#nextNote')];
const staffBlock = $<HTMLDivElement>('.s2-staff');

const scaleOf = (state: AppState) => scales.scales[state.keyId]!;
const sourceOf = (state: AppState) => nowNextSource(scaleOf(state), fingerings, trumpetTemplate);

let source = sourceOf(store.getState());

/**
 * 選ぶ音を変える（五線譜のカーソル・◀ ▶・スワイプ。SPEC 2.5）。再生中は受け付けない。
 * 再生が終わって最終音が残っている（done）ときは、停止（idle）に戻してから選ぶ
 */
function select(index: number | null) {
  const { progress } = store.getState();
  if (isPlaying(progress)) return;
  if (progress.phase === 'done') player.stop();
  store.setState({ selectedIndex: index });
}
const step = (direction: 1 | -1) => {
  if (isPlaying(store.getState().progress)) return;
  select(stepSelection(store.getState().selectedIndex, direction));
};

const nowNextView = mountNowNext($<HTMLDivElement>('.s2-nownext'), source, {
  onOpen: (frame, index) => modal.open(source, frame, index, store.getState().showAlternateFingerings),
  onSwipe: step,
});

const guidePulse = createGuidePulse();

function renderStaff(state: AppState) {
  staffBlock.innerHTML = renderScaleStaves(scaleOf(state), instrument.clef, state.noteValue);
}

function render(state: AppState) {
  const { progress } = state;
  const playing = isPlaying(progress);

  const highlight = staffHighlight(progress, state.selectedIndex);
  applyStaffHighlight(staffBlock, highlight.current, highlight.next);
  nowNextView.update(progress, state.selectedIndex, state.showAlternateFingerings);
  // 拍に合わせた脈動（再生中だけ）。五線譜は現在音のガイド、カウントイン中は1音目（次の音）のガイド
  nowNextView.setBeatClock(state.beatClock);
  guidePulse.set(staffBlock, highlight.current ?? (progress.phase === 'countin' ? highlight.next : null), state.beatClock);

  keySelect.value = state.keyId;
  for (const button of valueButtons) button.setAttribute('aria-pressed', String(button.dataset.value === state.noteValue));
  // 再生中は調・音価・テンポを変えない（SPEC 2.4, 6.5）。参考音は再生中も切り替えられる
  // 音を選ぶ操作（◀ ▶）も再生中は受け付けない
  for (const control of [keySelect, ...valueButtons, bpmInput, $<HTMLButtonElement>('#slower'), $<HTMLButtonElement>('#faster'), ...stepButtons]) {
    control.disabled = playing;
  }
  if (document.activeElement !== bpmInput) bpmInput.value = String(state.bpm);
  toneButton.setAttribute('aria-pressed', String(state.toneEnabled));
  toneButton.textContent = state.toneEnabled ? '参考音 ON' : '参考音 OFF';
  alternatesButton.setAttribute('aria-pressed', String(state.showAlternateFingerings));
  alternatesButton.textContent = `別の運指を表示 ${state.showAlternateFingerings ? 'ON' : 'OFF'}`;

  playButton.textContent = playing ? '■ 停止' : '▶ 再生';
  // 「n / 16」は五線譜の位置で数える（停止中は選んだ音、カウントイン中は開始位置、再生中は今の音。SPEC 2.7）
  const shown = progress.phase === 'idle' ? state.selectedIndex : progress.noteIndex;
  position.textContent = `${shown === null ? '–' : shown + 1} / ${NOTE_COUNT}`;
}

store.subscribe((state, prev) => {
  if (state.keyId !== prev.keyId || state.noteValue !== prev.noteValue) renderStaff(state);
  if (state.keyId !== prev.keyId) {
    source = sourceOf(state);
    nowNextView.setSource(source);
  }
  render(state);
});

keySelect.addEventListener('change', () => store.setState({ keyId: keySelect.value, selectedIndex: null }));
for (const button of valueButtons) {
  button.addEventListener('click', () => store.setState({ noteValue: button.dataset.value as NoteValue }));
}
const setBpm = (bpm: number) => store.setState({ bpm: clampBpm(bpm) });
bpmInput.addEventListener('change', () => {
  if (Number.isFinite(bpmInput.valueAsNumber)) setBpm(bpmInput.valueAsNumber);
  bpmInput.value = String(store.getState().bpm);
});
$('#slower').addEventListener('click', () => setBpm(store.getState().bpm - 5));
$('#faster').addEventListener('click', () => setBpm(store.getState().bpm + 5));
toneButton.addEventListener('click', () => store.setState({ toneEnabled: !store.getState().toneEnabled }));
alternatesButton.addEventListener('click', () =>
  store.setState({ showAlternateFingerings: !store.getState().showAlternateFingerings }),
);

playButton.addEventListener('click', () => {
  const state = store.getState();
  if (isPlaying(state.progress)) {
    player.stop();
    return;
  }
  // 選んだ音から再生する（選んでいなければ先頭から）。選んだ音は消さず、停止・終了後もその音に戻る（SPEC 2.7）。
  // クリック処理の中で play を呼ぶ（AudioContext の生成・resume がこの中で行われる）
  const writtenMidis = source.pitches.map((p) => parsePitch(p).midi);
  player.play({
    writtenMidis,
    transposition: instrument.transposition,
    bpm: state.bpm,
    noteValue: state.noteValue,
    startIndex: state.selectedIndex ?? 0,
  });
});

stepButtons[0]!.addEventListener('click', () => step(-1));
stepButtons[1]!.addEventListener('click', () => step(1));

// 五線譜のカーソル：触れた位置に縦のバーを出し、指に合わせて動かして音を選ぶ（停止中のみ、SPEC 2.5）
attachStaffCursor(staffBlock, {
  isEnabled: () => !isPlaying(store.getState().progress),
  getSelected: () => store.getState().selectedIndex,
  select,
});

renderStaff(store.getState());
render(store.getState());

// スクリーンショット用：?open=now / next で S3 を開いた状態にする
const openParam = params.get('open');
if (openParam === 'now' || openParam === 'next') {
  const index = app.querySelector<HTMLElement>(`.nn-body[data-frame="${openParam}"]`)?.dataset.index;
  if (index) modal.open(source, openParam, Number(index), store.getState().showAlternateFingerings);
}
