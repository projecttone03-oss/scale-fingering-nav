// 端末に保存する設定（localStorage、SPEC 7.4）。今は「別の運指を表示」だけ。調・テンポなどは M5 で足す。
// localStorage が使えない環境（プライベートブラウズ等）でも、読み書きの失敗でアプリを止めない。
import type { AppState, Store } from './store.ts';

export const SETTINGS_STORAGE_KEY = 'scale-fingering-nav:settings';

/** 保存する設定 */
export type StoredSettings = Pick<AppState, 'showAlternateFingerings'>;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/** ブラウザの localStorage。使えなければ null */
export function browserStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** 保存されている設定のうち、正しい形のものだけを返す（なければ空） */
export function loadSettings(storage: StorageLike | null = browserStorage()): Partial<StoredSettings> {
  let saved: unknown;
  try {
    saved = JSON.parse(storage?.getItem(SETTINGS_STORAGE_KEY) ?? 'null');
  } catch {
    return {};
  }
  if (typeof saved !== 'object' || saved === null) return {};
  const settings: Partial<StoredSettings> = {};
  const { showAlternateFingerings } = saved as Record<string, unknown>;
  if (typeof showAlternateFingerings === 'boolean') settings.showAlternateFingerings = showAlternateFingerings;
  return settings;
}

export function saveSettings(settings: StoredSettings, storage: StorageLike | null = browserStorage()): void {
  try {
    storage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // 容量超過・保存禁止の環境では保存しない（設定はこのページを開いている間だけ有効）
  }
}

/** 設定が変わるたびに保存する。戻り値で解除 */
export function persistSettings(store: Store, storage: StorageLike | null = browserStorage()): () => void {
  return store.subscribe((state, prev) => {
    if (state.showAlternateFingerings === prev.showAlternateFingerings) return;
    saveSettings({ showAlternateFingerings: state.showAlternateFingerings }, storage);
  });
}
