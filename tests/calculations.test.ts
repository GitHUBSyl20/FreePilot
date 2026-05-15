import { describe, expect, it } from 'vitest';
import { calculateARECutoff, calculateEstimatedARE } from '../src/lib/calculations/are';
import { calculateNetAvailable } from '../src/lib/calculations/netAvailable';
import { calculateIncomeTaxProvision } from '../src/lib/calculations/tax';
import { calculateUrssafProvision } from '../src/lib/calculations/urssaf';
import { calculateCollectedRevenueFromInvoices } from '../src/lib/monthly/snapshot';
import { AppSettings } from '../src/types/finance';

const settings: AppSettings = {
  areDailyAmount: 50.39,
  theoreticalMonthlyDays: 30,
  remainingAREDays: 440,
  bncAbatementRate: 34,
  franceTravailDeductionRate: 70,
  urssafSocialContributionRate: 25.6,
  professionalTrainingContributionRate: 0.2,
  totalUrssafProvisionRate: 25.8,
  prudentIncomeTaxProvisionRate: 10,
  versementLiberatoireEnabled: false,
  versementLiberatoireRateBNC: 2.2,
};

describe('calculation rules', () => {
  it('calculates estimated ARE and never negative', () => {
    expect(calculateEstimatedARE(1000, settings).value).toBe(1049.7);
    expect(calculateEstimatedARE(10000, settings).value).toBe(0);
  });

  it('calculates ARE cutoff threshold', () => {
    expect(calculateARECutoff(settings).value).toBeCloseTo(3272.08, 2);
  });

  it('calculates urssaf provision', () => {
    expect(calculateUrssafProvision(1000, settings).value).toBe(258);
  });

  it('calculates income tax provision', () => {
    expect(calculateIncomeTaxProvision(1000, settings).value).toBe(100);
  });

  it('calculates net available', () => {
    const are = calculateEstimatedARE(1000, settings).value;
    expect(
      calculateNetAvailable(
        { monthlyCollectedRevenue: 1000, estimatedARE: are, professionalExpenses: 200, personalTransfersAlreadyMade: 150 },
        settings,
      ).value,
    ).toBe(1341.7);
  });

  it('counts paid invoices in month only and ignores sent invoices', () => {
    const invoices = [
      { status: 'paid' as const, paymentDate: '2026-05-01', totalTTC: 500 },
      { status: 'paid' as const, paymentDate: '2026-04-28', totalTTC: 700 },
      { status: 'sent' as const, paymentDate: null, totalTTC: 1200 },
    ];
    expect(calculateCollectedRevenueFromInvoices('2026-05', invoices)).toBe(500);
  });

  it('returns warnings when settings are missing', () => {
    const badSettings = { ...settings, areDailyAmount: 0 };
    expect(calculateEstimatedARE(1000, badSettings).warnings.length).toBeGreaterThan(0);
  });
});
