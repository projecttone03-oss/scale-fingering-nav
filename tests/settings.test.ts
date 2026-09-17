import { describe, expect, it } from 'vitest';
import { SETTINGS_STORAGE_KEY, loadSettings, persistSettings, saveSettings } from '../src/state/settings.ts';
import { INITIAL_STATE, createStore } from '../src/state/store.ts';

/** getItem / setItem だけを持つ偽の localStorage */
function fakeStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

describe('端末に保存する設定（localStorage）', () => {
  it('保存がなければ空（既定値のまま）', () => {
    expect(loadSettings(fakeStorage())).toEqual({});
    expect(loadSettings(null)).toEqual({});
  });

  it('保存した「別の運指を表示」を次回起動時に読み込む', () => {
    const storage = fakeStorage();
    saveSettings({ showAlternateFingerings: true }, storage);
    expect(JSON.parse(storage.items.get(SETTINGS_STORAGE_KEY)!)).toEqual({ showAlternateFingerings: true });
    expect(loadSettings(storage)).toEqual({ showAlternateFingerings: true });
  });

  it.each([
    ['JSON でない', '{oops'],
    ['オブジェクトでない', '"on"'],
    ['型が違う', '{"showAlternateFingerings":"yes"}'],
  ])('壊れた保存（%s）は無視する', (_, saved) => {
    expect(loadSettings(fakeStorage({ [SETTINGS_STORAGE_KEY]: saved }))).toEqual({});
  });

  it('localStorage の読み書きで例外が出てもアプリを止めない', () => {
    const broken = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(loadSettings(broken)).toEqual({});
    expect(() => saveSettings({ showAlternateFingerings: true }, broken)).not.toThrow();
  });

  it('persistSettings：「別の運指を表示」が変わったときだけ保存する', () => {
    const storage = fakeStorage();
    const store = createStore({ ...INITIAL_STATE, ...loadSettings(storage) });
    const stop = persistSettings(store, storage);
    store.setState({ bpm: 90 });
    expect(storage.items.size).toBe(0);
    store.setState({ showAlternateFingerings: true });
    expect(loadSettings(storage)).toEqual({ showAlternateFingerings: true });

    // 次回起動：保存した値で始まる
    expect(createStore({ ...INITIAL_STATE, ...loadSettings(storage) }).getState().showAlternateFingerings).toBe(true);

    stop();
    store.setState({ showAlternateFingerings: false });
    expect(loadSettings(storage)).toEqual({ showAlternateFingerings: true });
  });
});
