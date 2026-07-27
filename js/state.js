import { APP_CONFIG } from './config.js';
import { DEFAULT_PRODUCTS } from './data/default-products.js';
import { normalizeProduct } from './engine.js';
import { clone, currentMonth, nowIso } from './utils.js';

export function createDefaultState(products = DEFAULT_PRODUCTS) {
  return {
    schemaVersion: APP_CONFIG.schemaVersion,
    appVersion: APP_CONFIG.version,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    settings: {
      baseBudget: APP_CONFIG.defaultBudget,
      adjustedBudget: null,
      reserve: APP_CONFIG.defaultReserve,
      currentPhase: 1,
      useReserve: false,
      activeMonth: currentMonth(),
      waterLitresPerWeek: APP_CONFIG.defaultWaterLitresPerWeek,
      developerMode: false
    },
    products: clone(products).map(normalizeProduct),
    session: null,
    history: []
  };
}

export function migrateState(raw) {
  if (!raw) return createDefaultState();

  if (Array.isArray(raw)) {
    return createDefaultState(raw);
  }

  const defaults = createDefaultState(raw.products || DEFAULT_PRODUCTS);
  const state = {
    ...defaults,
    ...raw,
    schemaVersion: APP_CONFIG.schemaVersion,
    appVersion: APP_CONFIG.version,
    settings: {
      ...defaults.settings,
      ...(raw.settings || {})
    },
    products: (raw.products || defaults.products).map(normalizeProduct),
    history: Array.isArray(raw.history) ? raw.history : [],
    session: raw.session && Array.isArray(raw.session.items) ? raw.session : null,
    updatedAt: nowIso()
  };

  state.settings.currentPhase = Math.min(4, Math.max(1, Number(state.settings.currentPhase || 1)));
  state.settings.reserve = Math.min(APP_CONFIG.maximumReserve, Math.max(APP_CONFIG.minimumReserve, Number(state.settings.reserve || APP_CONFIG.defaultReserve)));
  return state;
}

export class AppStore extends EventTarget {
  #database;
  #state;
  #saveTimer;

  constructor(database) {
    super();
    this.#database = database;
  }

  get state() {
    return this.#state;
  }

  get storageMode() {
    return this.#database.mode;
  }

  async init() {
    await this.#database.init();
    const saved = await this.#database.readState();

    if (saved) {
      this.#state = migrateState(saved);
    } else {
      const legacy = this.#database.readLegacyState();
      this.#state = migrateState(legacy?.data);
      await this.saveNow();
      if (legacy?.key) this.#database.removeLegacyState(legacy.key);
    }
    return this;
  }

  update(mutator, { save = true, announce = true } = {}) {
    mutator(this.#state);
    this.#state.updatedAt = nowIso();
    if (save) this.scheduleSave();
    if (announce) this.dispatchEvent(new CustomEvent('change', { detail: this.#state }));
  }

  replace(nextState) {
    this.#state = migrateState(nextState);
    this.scheduleSave(0);
    this.dispatchEvent(new CustomEvent('change', { detail: this.#state }));
  }

  scheduleSave(delay = 120) {
    clearTimeout(this.#saveTimer);
    this.#saveTimer = setTimeout(() => {
      this.saveNow().catch(error => console.error('[DOROX] Sauvegarde locale impossible.', error));
    }, delay);
  }

  async saveNow() {
    this.#state.updatedAt = nowIso();
    await this.#database.writeState(this.#state);
  }

  async reset() {
    await this.#database.clearState();
    this.#state = createDefaultState();
    await this.saveNow();
    this.dispatchEvent(new CustomEvent('change', { detail: this.#state }));
  }
}
