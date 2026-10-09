import type { AppSettings } from '@freepilot/finance-core';
import { buildAREDaysBalance, buildMonthlyCashflowSeries, defaultSettings, sanitizeSettings } from '@freepilot/finance-core';
import { describe, expect, it } from 'vitest';

const settings: AppSettings = {
  ...defaultSettings,
  areDailyAmount: 47.23,
  theoreticalMonthlyDays: 30,
  remainingAREDays: 345,
  remainingAREDaysAsOf: '2026-09-30',
};

// Septembre : 1 000 € de CA. Octobre : ARE pleine 1 416,90 €, versée 900 €.
const series = buildMonthlyCashflowSeries(
  [
    { month: '2026-09', collectedRevenue: 1000, fullMonthlyARE: 1416.9, actualARE: 1416.9 },
    { month: '2026-10', collectedRevenue: 0, fullMonthlyARE: 1416.9, actualARE: 900 },
    { month: '2026-11', collectedRevenue: 0, fullMonthlyARE: 1416.9, actualARE: null },
  ],
  settings,
);

describe('jours de droits ARE', () => {
  it('ne décompte que les mois postérieurs au relevé, jusqu’au mois courant', () => {
    const balance = buildAREDaysBalance(series, settings, '2026-10');

    // Septembre est couvert par le relevé du 30/09 ; novembre est dans le futur.
    expect(balance.months.map((month) => month.month)).toEqual(['2026-10']);
    // 900 / 47,23 = 19,06 j consommés, 30 − 19,06 = 10,94 j reportés.
    expect(balance.months[0].consumed).toBeCloseTo(19.06, 2);
    expect(balance.months[0].deferred).toBeCloseTo(10.94, 2);
    expect(balance.remaining).toBeCloseTo(325.94, 2);
  });

  it('estime la fin de droits au plus tôt avec une ARE pleine ensuite', () => {
    // 325,94 j / 30 = 10,9 → 11 mois après octobre 2026.
    expect(buildAREDaysBalance(series, settings, '2026-10').estimatedLastMonth).toBe('2027-09');
  });

  it('sans date de relevé, décompte toute la série connue', () => {
    const balance = buildAREDaysBalance(series, { ...settings, remainingAREDaysAsOf: null }, '2026-10');

    expect(balance.months.map((month) => month.month)).toEqual(['2026-09', '2026-10']);
  });

  it('n’accepte qu’une date au format AAAA-MM-JJ', () => {
    expect(sanitizeSettings(settings, { remainingAREDaysAsOf: '30/09/2026' }).remainingAREDaysAsOf).toBe('2026-09-30');
    expect(sanitizeSettings(settings, { remainingAREDaysAsOf: '2026-10-31' }).remainingAREDaysAsOf).toBe('2026-10-31');
    expect(sanitizeSettings(settings, { remainingAREDaysAsOf: null }).remainingAREDaysAsOf).toBeNull();
  });
});
