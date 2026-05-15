import type { FinanceData, FinanceStore } from './types';
import { createInitialFinanceData } from './seed';

export const loadOrSeedFinanceData = async (store: FinanceStore): Promise<FinanceData> => {
  const existing = await store.load();
  if (existing) return existing;

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
