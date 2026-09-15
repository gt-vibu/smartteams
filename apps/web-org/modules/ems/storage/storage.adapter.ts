import { EMS_STORAGE_KEYS, EMS_STORAGE_VERSION } from './storage.keys';

/**
 * Browser storage for interface preferences.
 *
 * Deliberately narrow. This once seeded whole demo scenarios — attendance, timesheets, shifts and
 * holidays — into `localStorage`, which is how the product came to show one browser's invented
 * records as though they were shared state. Those paths are gone, along with the scenario
 * switcher that drove them.
 *
 * What may live here is a per-browser preference that nobody else needs to see: which workspace
 * you last chose, and the theme. Business data never does — it belongs to the API, and an
 * unreachable API must surface as an error rather than as a stale local copy.
 */
class EmsStorageAdapter {
  private isBrowser: boolean;

  constructor() {
    this.isBrowser = typeof window !== 'undefined';
    if (this.isBrowser) this.initSeed();
  }

  /** Writes only the version marker, so a future change can recognise and clear old keys. */
  public initSeed(forceReset = false): void {
    if (!this.isBrowser) return;
    try {
      const storedVersion = localStorage.getItem(EMS_STORAGE_KEYS.VERSION);
      if (!storedVersion || storedVersion !== EMS_STORAGE_VERSION || forceReset) {
        localStorage.setItem(EMS_STORAGE_KEYS.VERSION, EMS_STORAGE_VERSION);
      }
    } catch {
      // Private mode and restricted iframes both throw here; a preference is not worth failing on.
    }
  }

  public getItem<T>(key: string, fallback: T): T {
    if (!this.isBrowser) return fallback;
    try {
      const item = localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : fallback;
    } catch {
      return fallback;
    }
  }

  public setItem<T>(key: string, value: T): void {
    if (!this.isBrowser) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
      // Dispatched asynchronously so an active render pass is never interrupted mid-commit.
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('ems:storage:change', { detail: { key } }));
      }, 0);
    } catch {
      // Quota exceeded, or storage disabled.
    }
  }

  public removeItem(key: string): void {
    if (!this.isBrowser) return;
    try {
      localStorage.removeItem(key);
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('ems:storage:change', { detail: { key } }));
      }, 0);
    } catch {
      // Ignore.
    }
  }
}

export const emsStorageAdapter = new EmsStorageAdapter();
