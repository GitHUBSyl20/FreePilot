import type { AppSettings } from './types';
import { calculateARECutoff } from './calculations/are';
import { defaultStageProbabilities } from './crm/pipelines';
import { calculateMonthlySnapshot } from './monthly/snapshot';

export const defaultSettings: AppSettings = {
  areDailyAmount: 50.39,
  theoreticalMonthlyDays: 30,
  remainingAREDays: 440,
  bncAbatementRate: 34,
  franceTravailDeductionRate: 70,
  urssafSocialContributionRate: 25.6,
  professionalTrainingContributionRate: 0.2,
  totalUrssafProvisionRate: 25.8,
  prudentIncomeTaxProvisionRate: 11,
  versementLiberatoireEnabled: false,
  versementLiberatoireRateBNC: 2.2,
  monthlyRevenueSafetyThreshold: 1000,
  monthlyRevenueTakeoffThreshold: 1500,
  hotProspectFollowUpDays: 7,
  warmProspectFollowUpDays: 21,
  coldProspectFollowUpDays: 60,
  dormantOpportunityDays: 14,
  dormantPartnershipDays: 30,
  stageProbabilities: defaultStageProbabilities(),
};

export const getDashboardMock = () => {
  const month = '2026-05';
  const invoices = [
    { status: 'paid' as const, totalTTC: 1200, paymentDate: '2026-05-03' },
    { status: 'paid' as const, totalTTC: 650, paymentDate: '2026-05-18' },
    { status: 'sent' as const, totalTTC: 900, paymentDate: null },
  ];

  const snapshot = calculateMonthlySnapshot(
    { month, invoices, professionalExpenses: 250, personalTransfersAlreadyMade: 300 },
    defaultSettings,
  );

  return {
    kpis: {
      caEncaisse: snapshot.collectedRevenue,
      facturesImpayees: snapshot.invoicedUnpaidRevenue,
      areEstimeeM1: snapshot.estimatedARE.value,
      netDisponible: snapshot.netAvailable.value,
      seuilCoupureARE: calculateARECutoff(defaultSettings).value,
    },
    formulas: {
      are: snapshot.estimatedARE.formula,
      net: snapshot.netAvailable.formula,
    },
  };
};
