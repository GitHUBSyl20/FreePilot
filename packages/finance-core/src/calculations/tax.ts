import type { AppSettings, CalculationDetail } from '../types';
import { asRate, roundCurrency, safeNumber } from './common';

/**
 * Provision d'impôt sur le revenu.
 *
 * Hors versement libératoire, l'impôt porte sur le revenu après abattement
 * micro-BNC, pas sur le CA brut : CA × (1 − abattement) × taux.
 * Avec les réglages par défaut, 11 % sur 66 % du CA = 7,26 % du CA.
 *
 * Le versement libératoire échappe à cette règle : son taux s'applique
 * directement au CA encaissé.
 */
export const calculateIncomeTaxProvision = (collectedRevenue: number, settings: AppSettings): CalculationDetail => {
  const revenue = safeNumber(collectedRevenue);

  if (settings.versementLiberatoireEnabled) {
    const rate = settings.versementLiberatoireRateBNC;
    return {
      value: roundCurrency(revenue * asRate(rate)),
      formula: `${revenue} * ${rate}%`,
      assumptions: ['CA encaissé', 'Versement libératoire activé'],
      warnings: rate <= 0 ? ['Taux de versement libératoire manquant.'] : [],
    };
  }

  const rate = settings.prudentIncomeTaxProvisionRate;
  const retainedRate = 1 - asRate(settings.bncAbatementRate);

  return {
    value: roundCurrency(revenue * retainedRate * asRate(rate)),
    formula: `${revenue} * (1 - ${settings.bncAbatementRate}%) * ${rate}%`,
    assumptions: ['CA encaissé', 'Abattement micro-BNC', 'Provision prudente impôt'],
    warnings: rate <= 0 ? ['Taux d’impôt manquant.'] : [],
  };
};
