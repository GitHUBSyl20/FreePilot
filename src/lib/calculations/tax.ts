import { AppSettings, CalculationDetail } from '../../types/finance';
import { asRate, roundCurrency, safeNumber } from './common';

export const calculateIncomeTaxProvision = (collectedRevenue: number, settings: AppSettings): CalculationDetail => {
  const rate = settings.versementLiberatoireEnabled
    ? settings.versementLiberatoireRateBNC
    : settings.prudentIncomeTaxProvisionRate;
  const value = roundCurrency(safeNumber(collectedRevenue) * asRate(rate));

  return {
    value,
    formula: `${collectedRevenue} * ${rate}%`,
    assumptions: [settings.versementLiberatoireEnabled ? 'Versement libératoire activé' : 'Provision prudente impôt'],
    warnings: rate <= 0 ? ['Taux d’impôt manquant.'] : [],
  };
};
