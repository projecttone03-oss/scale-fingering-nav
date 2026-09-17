// 運指図：テンプレート SVG に押下クラスを付与する（SPEC 4.7）。
// DOM を使わずに文字列で処理する（データ検証スクリプトとテストからも使うため）。
//
// テンプレートの決まり：押さえる要素は <circle> / <rect> / <path> / <ellipse> / <polygon> で、
// class に "key" を含み、id を持つ。描画時は id を data-key に置き換える
// （いま・つぎ・S3 で同じ図を1ページに何度も置くので、id が重複しないように）。
import type { FingeringEntry } from '../data/fingerings.ts';

const SHAPE_TAG = /<(circle|rect|path|ellipse|polygon)\b([^>]*?)(\/?)>/g;

const attribute = (attrs: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(attrs)?.[1];
const classesOf = (attrs: string) => (attribute(attrs, 'class') ?? '').split(/\s+/).filter(Boolean);

const escapeAttribute = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** テンプレートの押さえる要素の id（文書の順） */
export function templateKeyIds(template: string): string[] {
  const ids: string[] = [];
  for (const [tag, , attrs = ''] of template.matchAll(SHAPE_TAG)) {
    if (!classesOf(attrs).includes('key')) continue;
    const id = attribute(attrs, 'id');
    if (!id) throw new Error(`id のない key 要素があります: ${tag}`);
    if (ids.includes(id)) throw new Error(`key 要素の id が重複しています: ${id}`);
    ids.push(id);
  }
  return ids;
}

/** 運指エントリで押さえる要素の id。木管は keys、金管（バルブ）は v1〜v4 */
export function pressedKeyIds(entry: FingeringEntry): string[] {
  if ('keys' in entry) return [...entry.keys];
  if ('valves' in entry) return entry.valves.map((valve) => `v${valve}`);
  throw new Error('トロンボーン・ストリングベースの運指図はまだ描けません');
}

/** 運指の短い表記。金管（バルブ）は PDF と同じく押すバルブの番号を並べる（なしは "0"） */
export function fingeringName(entry: FingeringEntry): string {
  if ('valves' in entry) return entry.valves.length > 0 ? entry.valves.join('') : '0';
  return '';
}

/** 読み上げ用の説明 */
export function fingeringDescription(entry: FingeringEntry): string {
  if ('valves' in entry) return entry.valves.length > 0 ? `バルブ ${entry.valves.join('・')}` : 'バルブなし（0）';
  if ('keys' in entry) return `キー ${entry.keys.join('・')}`;
  return '';
}

/**
 * テンプレートの押さえる要素のうち pressed の id に .pressed を付けた <svg class="fingering">。
 * テンプレートにない id を渡したら例外（データとテンプレートの食い違いを見逃さない）
 */
export function renderFingering(template: string, pressed: readonly string[], label: string): string {
  const ids = templateKeyIds(template);
  for (const id of pressed) {
    if (!ids.includes(id)) throw new Error(`テンプレートにないキーです: ${id}`);
  }
  return template
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim()
    .replace(SHAPE_TAG, (tag, name: string, attrs: string, selfClosing: string) => {
      const classes = classesOf(attrs);
      if (!classes.includes('key')) return tag;
      const id = attribute(attrs, 'id')!;
      if (pressed.includes(id)) classes.push('pressed');
      const rest = attrs.replace(/\sid="[^"]*"/, '').replace(/\sclass="[^"]*"/, '');
      return `<${name} class="${classes.join(' ')}" data-key="${id}"${rest}${selfClosing}>`;
    })
    .replace(/<svg\b/, `<svg class="fingering" role="img" aria-label="${escapeAttribute(label)}"`);
}
