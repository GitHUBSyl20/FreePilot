import type { FinanceData, FinanceStore } from '@freepilot/finance-core';
import { idbDelete, idbGet, idbSet, isIndexedDbAvailable } from './storage/indexedDb';

/** Clé IndexedDB (stockage courant). */
const STORAGE_KEY = 'financeData';
/** Ancienne clé localStorage, conservée pour la migration des données existantes. */
const LEGACY_STORAGE_KEY = 'freepilot.financeData.v1';

const readLegacyData = (): FinanceData | null => {
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as FinanceData) : null;
  } catch {
    return null;
  }
};

/** Repli utilisé quand IndexedDB est indisponible (navigation privée, navigateur ancien). */
const localStorageFallback: FinanceStore = {
  load: async () => readLegacyData(),
  save: async (data) => {
    window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(data));
  },
  clear: async () => {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  },
};

const indexedDbStore: FinanceStore = {
  load: async () => {
    const stored = await idbGet<FinanceData>(STORAGE_KEY);
    if (stored) return stored;

    // Première ouverture depuis la bascule vers IndexedDB : on récupère
    // les données localStorage puis on libère l'ancienne clé.
    const legacy = readLegacyData();
    if (legacy) {
      await idbSet(STORAGE_KEY, legacy);
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      return legacy;
    }

    return null;
  },
  save: async (data) => {
    await idbSet(STORAGE_KEY, data);
  },
  clear: async () => {
    await idbDelete(STORAGE_KEY);
  },
};

const withFallback = (store: FinanceStore): FinanceStore => ({
  load: async () => {
    try {
      return await store.load();
    } catch {
      return localStorageFallback.load();
    }
  },
  save: async (data) => {
    try {
      await store.save(data);
    } catch {
      await localStorageFallback.save(data);
    }
  },
  clear: async () => {
    try {
      await store.clear();
    } catch {
      await localStorageFallback.clear();
    }
  },
});

export const webFinanceStore: FinanceStore = isIndexedDbAvailable()
  ? withFallback(indexedDbStore)
  : localStorageFallback;
