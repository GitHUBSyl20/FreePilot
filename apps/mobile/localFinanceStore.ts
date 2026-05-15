import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FinanceData, FinanceStore } from '@freepilot/finance-core';

const STORAGE_KEY = 'freepilot.financeData.v1';

export const mobileFinanceStore: FinanceStore = {
  load: async () => {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as FinanceData) : null;
  },
  save: async (data) => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  },
  clear: async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
  },
};
