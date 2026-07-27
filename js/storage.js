import { APP_CONFIG } from './config.js';
import { clone } from './utils.js';

export class LocalDatabase {
  #db = null;
  #fallback = false;
  #fallbackKey = 'dorox_official_state';

  get mode() {
    return this.#fallback ? 'localStorage' : 'IndexedDB';
  }

  async init() {
    if (!('indexedDB' in window)) {
      this.#fallback = true;
      return this;
    }

    try {
      this.#db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(APP_CONFIG.databaseName, APP_CONFIG.databaseVersion);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(APP_CONFIG.stateStore)) {
            db.createObjectStore(APP_CONFIG.stateStore);
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Impossible d’ouvrir la base locale.'));
        request.onblocked = () => reject(new Error('La base locale est bloquée par une autre fenêtre.'));
      });
    } catch (error) {
      console.warn('[DOROX] IndexedDB indisponible, repli vers localStorage.', error);
      this.#fallback = true;
    }
    return this;
  }

  async readState() {
    if (this.#fallback) {
      const raw = localStorage.getItem(this.#fallbackKey);
      return raw ? JSON.parse(raw) : null;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.#db.transaction(APP_CONFIG.stateStore, 'readonly');
      const request = transaction.objectStore(APP_CONFIG.stateStore).get(APP_CONFIG.stateKey);
      request.onsuccess = () => resolve(request.result ? clone(request.result) : null);
      request.onerror = () => reject(request.error || new Error('Lecture locale impossible.'));
    });
  }

  async writeState(state) {
    const snapshot = clone(state);
    if (this.#fallback) {
      localStorage.setItem(this.#fallbackKey, JSON.stringify(snapshot));
      return;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.#db.transaction(APP_CONFIG.stateStore, 'readwrite');
      transaction.objectStore(APP_CONFIG.stateStore).put(snapshot, APP_CONFIG.stateKey);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Enregistrement local impossible.'));
      transaction.onabort = () => reject(transaction.error || new Error('Enregistrement local annulé.'));
    });
  }

  async clearState() {
    if (this.#fallback) {
      localStorage.removeItem(this.#fallbackKey);
      return;
    }
    return new Promise((resolve, reject) => {
      const transaction = this.#db.transaction(APP_CONFIG.stateStore, 'readwrite');
      transaction.objectStore(APP_CONFIG.stateStore).delete(APP_CONFIG.stateKey);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Réinitialisation impossible.'));
    });
  }

  readLegacyState() {
    for (const key of APP_CONFIG.legacyKeys) {
      try {
        const parsed = JSON.parse(localStorage.getItem(key));
        if (parsed) return { key, data: parsed };
      } catch (error) {
        console.warn(`[DOROX] Données historiques illisibles pour ${key}.`, error);
      }
    }
    return null;
  }

  removeLegacyState(key) {
    if (key) localStorage.removeItem(key);
  }
}
