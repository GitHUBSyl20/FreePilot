import type { FinanceData, FinanceStore } from '@freepilot/finance-core';

const STORAGE_KEY = 'freepilot.financeData.v1';

export const webFinanceStore: FinanceStore = {
  load: async () => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as FinanceData) : null;
  },
  save: async (data) => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  },
  clear: async () => {
    window.localStorage.removeItem(STORAGE_KEY);
  },
};
