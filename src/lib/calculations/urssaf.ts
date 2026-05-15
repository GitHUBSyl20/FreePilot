import { AppSettings, CalculationDetail } from '../../types/finance';
import { asRate, roundCurrency, safeNumber } from './common';

export const calculateUrssafProvision = (collectedRevenue: number, settings: AppSettings): CalculationDetail => {
  const value = roundCurrency(safeNumber(collectedRevenue) * asRate(settings.totalUrssafProvisionRate));
  return {
    value,
    formula: `${collectedRevenue} * ${settings.totalUrssafProvisionRate}%`,
    assumptions: ['CA encaissé', 'Taux total de provision Urssaf'],
    warnings: settings.totalUrssafProvisionRate <= 0 ? ['Taux Urssaf manquant.'] : [],
  };
};
