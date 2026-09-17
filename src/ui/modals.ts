// S3 運指拡大（SPEC 2.1, 2.6）。S4 情報は M5 で実装する。
// <dialog> を使う（背景の操作を止め、Esc で閉じ、閉じるとフォーカスを元の場所に戻す）。
import type { FingeringEntry } from '../data/fingerings.ts';
import { fingeringDescription, fingeringName } from '../render/fingering.ts';
import { displayPitch, fingeringSvg, noteFingerings, type FrameName, type NowNextSource } from '../render/nowNext.ts';

export interface FingeringModal {
  /**
   * いま／つぎ枠で選んだ音の運指を拡大する。表示する運指が2つ以上あれば（「別の運指を表示」がオンで、
   * hidden でない代替運指があるときだけ）切り替えボタンを出す
   */
  open(source: NowNextSource, frame: FrameName, index: number, showAlternates: boolean): void;
  close(): void;
}

/** 切り替えボタンの表記：主運指は「標準」、代替は「別」。金管は PDF と同じバルブ番号を添え、番号のない楽器は「別1」「別2」 */
export function optionLabel(entry: FingeringEntry, alternateNumber: number): string {
  const name = fingeringName(entry);
  if (entry.isPrimary) return name ? `標準　${name}` : '標準';
  return name ? `別　${name}` : `別${alternateNumber}`;
}

export function createFingeringModal(container: HTMLElement = document.body): FingeringModal {
  const dialog = document.createElement('dialog');
  dialog.className = 'modal fingering-modal';
  dialog.setAttribute('aria-labelledby', 'fingering-modal-title');
  dialog.innerHTML = `
    <div class="modal-panel">
      <div class="modal-header">
        <h2 id="fingering-modal-title" class="fm-title"></h2>
        <button type="button" class="modal-close" aria-label="閉じる">×</button>
      </div>
      <div class="fm-diagram"></div>
      <p class="fm-description"></p>
      <div class="fm-options" role="group" aria-label="運指の切り替え"></div>
    </div>`;
  container.append(dialog);

  const title = dialog.querySelector<HTMLHeadingElement>('.fm-title')!;
  const diagram = dialog.querySelector<HTMLDivElement>('.fm-diagram')!;
  const description = dialog.querySelector<HTMLParagraphElement>('.fm-description')!;
  const options = dialog.querySelector<HTMLDivElement>('.fm-options')!;

  dialog.querySelector('.modal-close')!.addEventListener('click', () => dialog.close());
  // 背景（パネルの外）をタップしても閉じる
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  return {
    open(source, frame, index, showAlternates) {
      const entries = noteFingerings(source, index, showAlternates);
      title.textContent = `${frame === 'now' ? 'いま' : 'つぎ'}　${displayPitch(source.pitches[index]!)}`;

      const select = (selected: number) => {
        const entry = entries[selected]!;
        diagram.innerHTML = fingeringSvg(source, index, entry);
        description.textContent = fingeringDescription(entry);
        for (const [i, button] of [...options.children].entries()) button.setAttribute('aria-pressed', String(i === selected));
      };

      let alternateNumber = 0;
      options.innerHTML = entries
        .map((entry, i) => {
          if (!entry.isPrimary) alternateNumber++;
          return `<button type="button" data-option="${i}">${optionLabel(entry, alternateNumber)}</button>`;
        })
        .join('');
      // 表示する運指が1つだけなら切り替えボタンは出さない
      options.hidden = entries.length < 2;
      for (const button of options.querySelectorAll<HTMLButtonElement>('button')) {
        button.addEventListener('click', () => select(Number(button.dataset.option)));
      }

      if (entries.length === 0) {
        diagram.innerHTML = '<p class="nn-message">運指データなし</p>';
        description.textContent = '';
      } else {
        select(0);
      }
      if (!dialog.open) dialog.showModal();
    },
    close() {
      dialog.close();
    },
  };
}
