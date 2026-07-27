import type { FinanceData, FinanceStore } from './types';
import { migrateFinanceData, needsMigration } from './migrate';
import { createInitialFinanceData } from './seed';

export const loadOrSeedFinanceData = async (store: FinanceStore): Promise<FinanceData> => {
  const existing = await store.load();
  if (existing) {
    if (!needsMigration(existing)) return existing;

    // Les données d'une version antérieure sont migrées puis réenregistrées,
    // pour que la migration ne soit jouée qu'une fois.
    const migrated = migrateFinanceData(existing);
    await store.save(migrated);
    return migrated;
  }

  const seeded = createInitialFinanceData();
  await store.save(seeded);
  return seeded;
};

export const resetFinanceData = async (store: FinanceStore): Promise<FinanceData> => {
  await store.clear();
  const seeded = createInitialFinanceData();
  await store.save(seeded);
  return seeded;
};
