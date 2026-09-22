// 五線譜のカーソル（SPEC 2.5）。停止中、五線譜のどこかに触れると縦のバーを出し、指を左右に動かすとバーが追従して、
// バーと重なった位置の音を選ぶ（「いま」枠にその音の運指が出る）。指を離すとその音が開始位置として確定し、バーは消える。
// 音符を正確に狙わなくてよいので、楽器を持ったままでも選びやすい。上段・下段のどちらでも、指のある段で選ぶ。
import { STAVE_HEIGHT } from '../render/staff.ts';

/** 1つの音符の横の範囲（SVG の座標。ハイライトの背景 .note-bg の左端〜右端） */
export interface NoteSpan {
  index: number;
  /** 0 = 上段、1 = 下段 */
  stave: number;
  left: number;
  right: number;
}

/** 指の位置の段（SVG の y。上段の高さより上なら上段、それ以外は下段。五線譜の外に出ても近いほうの段） */
export const staveAt = (y: number) => (y < STAVE_HEIGHT ? 0 : 1);

/**
 * バーの位置（SVG の座標 x, y）で選ぶ音。指のある段の音符のうち、バーが範囲に重なる音符、
 * 重ならなければ（音符と音符の間、音部記号の上など）範囲が最も近い音符。段に音符がなければ null
 */
export function noteIndexAt(spans: readonly NoteSpan[], x: number, y: number): number | null {
  const stave = staveAt(y);
  let best: NoteSpan | null = null;
  let bestDistance = Infinity;
  for (const span of spans) {
    if (span.stave !== stave) continue;
    const distance = x < span.left ? span.left - x : x > span.right ? x - span.right : 0;
    if (distance < bestDistance) {
      best = span;
      bestDistance = distance;
    }
  }
  return best?.index ?? null;
}

/** 描いた五線譜（renderScaleStaves の <svg>）から、音符の横の範囲を読む */
export function readNoteSpans(svg: SVGSVGElement): NoteSpan[] {
  const staves = [...svg.querySelectorAll('.stave')];
  return [...svg.querySelectorAll<SVGGElement>('.note')].map((note) => {
    const background = note.querySelector('.note-bg')!;
    const left = Number(background.getAttribute('x'));
    return {
      index: Number(note.dataset.index),
      stave: Math.max(0, staves.indexOf(note.closest('.stave')!)),
      left,
      right: left + Number(background.getAttribute('width')),
    };
  });
}

export interface StaffCursorOptions {
  /** 今選べるか（停止中だけ。再生中は受け付けない） */
  isEnabled(): boolean;
  getSelected(): number | null;
  /** 選ぶ音を変える（バーの位置の音が変わったとき。操作が取り消されたときは元の音に戻す） */
  select(index: number | null): void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
/** バーの太さ（SVG の単位。線間隔は 10。375px 幅の画面で約 5.5px） */
const CURSOR_WIDTH = 8;
/** バーの上端と長さ。音符のハイライトの背景と同じ（段の上から線間隔1つ分下、線間隔10個分） */
const CURSOR_TOP = 10;
const CURSOR_HEIGHT = 100;

/**
 * container（五線譜の <svg class="staff"> を中に置く要素）でカーソルの操作を受け付ける。
 * 五線譜は描き直されてもよい（触れた時点の <svg> を使う）。戻り値で解除
 */
export function attachStaffCursor(container: HTMLElement, options: StaffCursorOptions): () => void {
  container.classList.add('staff-selectable');
  const bar = document.createElementNS(SVG_NS, 'rect');
  bar.setAttribute('class', 'staff-cursor');
  bar.setAttribute('aria-hidden', 'true');
  bar.setAttribute('width', String(CURSOR_WIDTH));
  bar.setAttribute('height', String(CURSOR_HEIGHT));
  bar.setAttribute('rx', String(CURSOR_WIDTH / 2));

  let drag: { pointerId: number; svg: SVGSVGElement; spans: NoteSpan[]; previous: number | null } | null = null;

  const follow = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { svg, spans } = drag;
    const box = svg.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;
    if (box.width === 0 || box.height === 0) return;
    const x = ((event.clientX - box.left) * viewBox.width) / box.width;
    const y = ((event.clientY - box.top) * viewBox.height) / box.height;
    const barX = Math.min(Math.max(x, 0), viewBox.width);
    bar.setAttribute('x', (barX - CURSOR_WIDTH / 2).toFixed(1));
    bar.setAttribute('y', String(staveAt(y) * STAVE_HEIGHT + CURSOR_TOP));
    const index = noteIndexAt(spans, x, y);
    if (index !== null && index !== options.getSelected()) options.select(index);
  };

  const finish = (cancelled: boolean) => (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (cancelled) options.select(drag.previous);
    drag = null;
    bar.remove();
  };

  const onDown = (event: PointerEvent) => {
    if (drag || !event.isPrimary || !options.isEnabled()) return;
    const svg = container.querySelector<SVGSVGElement>('svg.staff');
    if (!svg) return;
    event.preventDefault();
    drag = { pointerId: event.pointerId, svg, spans: readNoteSpans(svg), previous: options.getSelected() };
    // 指が五線譜の外へ出ても追従するように捕まえる。指がもう離れているなどで捕まえられなくても、選ぶ操作は続ける
    try {
      container.setPointerCapture(event.pointerId);
    } catch {
      // 捕まえられないときは、五線譜の上にある間だけ追従する
    }
    svg.append(bar);
    follow(event);
  };
  const onUp = finish(false);
  const onCancel = finish(true);

  container.addEventListener('pointerdown', onDown);
  container.addEventListener('pointermove', follow);
  container.addEventListener('pointerup', onUp);
  container.addEventListener('pointercancel', onCancel);
  return () => {
    container.removeEventListener('pointerdown', onDown);
    container.removeEventListener('pointermove', follow);
    container.removeEventListener('pointerup', onUp);
    container.removeEventListener('pointercancel', onCancel);
    container.classList.remove('staff-selectable');
    bar.remove();
  };
}
