import type { SyncMeta } from '@freepilot/finance-core';
import { emptySyncMeta } from '@freepilot/finance-core';
import { idbDelete, idbGet, idbSet } from '../storage/indexedDb';

/**
 * Clé distincte de celle des données financières : l'état de synchro décrit
 * cet appareil, pas le patrimoine. Rangé dans `FinanceData`, il partirait dans
 * les exports et mentirait sur l'appareil qui les restaure.
 */
const SYNC_META_KEY = 'syncMeta';

/**
 * Une lecture qui échoue ramène un état vierge : au pire l'appareil se croit
 * jamais synchronisé, ce qui déclenche une comparaison de plus. Jamais une
 * perte de données.
 */
export const readSyncMeta = async (): Promise<SyncMeta> => {
  try {
    return (await idbGet<SyncMeta>(SYNC_META_KEY)) ?? emptySyncMeta();
  } catch {
    return emptySyncMeta();
  }
};

export const writeSyncMeta = async (meta: SyncMeta): Promise<void> => {
  try {
    await idbSet(SYNC_META_KEY, meta);
  } catch {
    // Sans persistance, la synchro reste correcte : elle recomparera au
    // prochain lancement au lieu de faire confiance à sa mémoire.
  }
};

export const clearSyncMeta = async (): Promise<void> => {
  try {
    await idbDelete(SYNC_META_KEY);
  } catch {
    // Voir ci-dessus.
  }
};
