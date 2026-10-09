import type { AppSettings, CalculationDetail } from '../types';
import { calculateTheoreticalMonthlyARE } from './are';
import { roundCurrency, safeNumber } from './common';
import { calculateIncomeTaxProvision } from './tax';
import { calculateUrssafProvision } from './urssaf';

/**
 * Part du CA qui reste une fois l'Urssaf et l'impôt provisionnés.
 *
 * Les taux sont lus sur 100 € de CA via les fonctions de provision : la règle
 * du versement libératoire n'est ainsi écrite qu'une fois.
 */
export const calculateNetRevenueRate = (settings: AppSettings): number => {
  const urssafRate = calculateUrssafProvision(100, settings).value / 100;
  const taxRate = calculateIncomeTaxProvision(100, settings).value / 100;
  return 1 - urssafRate - taxRate;
};

const netRateFormula = (netRate: number): string => `${roundCurrency(netRate * 100)}%`;

/**
 * Palier sécurité : CA mensuel dont le net paie les charges fixes et le
 * budget de vie, sans compter sur l'ARE. C'est le plancher à tenir le jour
 * où les droits s'arrêtent.
 */
export const calculateSafetyThreshold = (settings: AppSettings, monthlyFixedCharges: number): CalculationDetail => {
  const needs = roundCurrency(safeNumber(monthlyFixedCharges) + safeNumber(settings.monthlyLivingBudget));
  const netRate = calculateNetRevenueRate(settings);
  const warnings: string[] = [];

  if (netRate <= 0) warnings.push('Taux Urssaf + impôt supérieurs ou égaux à 100 % du CA.');

  return {
    value: netRate > 0 ? roundCurrency(needs / netRate) : 0,
    formula: `(${safeNumber(monthlyFixedCharges)} + ${safeNumber(settings.monthlyLivingBudget)}) / ${netRateFormula(netRate)}`,
    assumptions: ['Charges fixes actives', 'Budget de vie mensuel', 'Provision Urssaf', 'Provision impôt'],
    warnings,
  };
};

/**
 * Palier décollage : CA mensuel dont le net, une fois l'Urssaf et l'impôt
 * provisionnés, rapporte autant que l'ARE pleine. Au-delà, l'activité seule
 * fait vivre aussi bien que l'allocation.
 */
export const calculateTakeoffThreshold = (settings: AppSettings): CalculationDetail => {
  const fullARE = calculateTheoreticalMonthlyARE(settings).value;
  const netRate = calculateNetRevenueRate(settings);
  const warnings: string[] = [];

  if (fullARE <= 0) warnings.push('ARE théorique nulle : montant journalier ou jours à renseigner.');
  if (netRate <= 0) warnings.push('Taux Urssaf + impôt supérieurs ou égaux à 100 % du CA.');

  return {
    value: fullARE > 0 && netRate > 0 ? roundCurrency(fullARE / netRate) : 0,
    formula: `${fullARE} / ${netRateFormula(netRate)}`,
    assumptions: ['ARE théorique mensuelle', 'Provision Urssaf', 'Provision impôt'],
    warnings,
  };
};
