import type { AppSettings, CalculationDetail } from '../types';
import { asRate, roundCurrency, safeNumber } from './common';

export const calculateTheoreticalMonthlyARE = (settings: AppSettings): CalculationDetail => {
  const value = roundCurrency(safeNumber(settings.areDailyAmount) * safeNumber(settings.theoreticalMonthlyDays));
  return {
    value,
    formula: `${settings.areDailyAmount} * ${settings.theoreticalMonthlyDays}`,
    assumptions: ['Montant journalier ARE', 'Nombre de jours théoriques du mois'],
    warnings: [],
  };
};

export const calculateAREDeduction = (
  collectedRevenue: number,
  settings: AppSettings,
): CalculationDetail => {
  const retainedIncomeRate = 1 - asRate(settings.bncAbatementRate);
  const areDeductionRate = retainedIncomeRate * asRate(settings.franceTravailDeductionRate);
  const value = roundCurrency(safeNumber(collectedRevenue) * areDeductionRate);

  return {
    value,
    formula: `${collectedRevenue} * ((1 - ${settings.bncAbatementRate}%) * ${settings.franceTravailDeductionRate}%)`,
    assumptions: ['CA encaissé mensuel', 'Abattement micro-BNC', 'Taux de déduction France Travail'],
    warnings: [],
  };
};

export const calculateEstimatedARE = (collectedRevenue: number, settings: AppSettings): CalculationDetail => {
  const theoretical = calculateTheoreticalMonthlyARE(settings);
  const deduction = calculateAREDeduction(collectedRevenue, settings);
  const raw = theoretical.value - deduction.value;
  const value = roundCurrency(Math.max(0, raw));
  const warnings: string[] = [];

  if (settings.areDailyAmount <= 0) warnings.push('Montant journalier ARE manquant ou nul.');
  if (settings.theoreticalMonthlyDays <= 0) warnings.push('Nombre de jours théoriques manquant ou nul.');

  return {
    value,
    formula: `max(0, ${theoretical.value} - ${deduction.value})`,
    assumptions: [...theoretical.assumptions, ...deduction.assumptions],
    warnings,
  };
};

/**
 * Conversion d'un montant d'ARE en jours d'indemnisation.
 * Les jours non consommés un mois donné sont reportés en fin de droits :
 * c'est le capital de jours restants qui se préserve.
 */
export const calculateAREDays = (
  areAmount: number,
  settings: AppSettings,
): { consumed: number; preserved: number } => {
  const dailyAmount = safeNumber(settings.areDailyAmount);
  const consumed = dailyAmount > 0 ? safeNumber(areAmount) / dailyAmount : 0;

  return { consumed, preserved: safeNumber(settings.theoreticalMonthlyDays) - consumed };
};

/**
 * CA encaissé à partir duquel l'ARE du mois suivant tombe à zéro.
 *
 * `fullMonthlyARE` permet de raisonner sur l'ARE pleine réellement notifiée
 * par France Travail plutôt que sur le produit montant journalier × jours,
 * qui n'en est qu'une approximation.
 */
export const calculateARECutoff = (settings: AppSettings, fullMonthlyARE?: number): CalculationDetail => {
  const reference = fullMonthlyARE === undefined ? calculateTheoreticalMonthlyARE(settings).value : safeNumber(fullMonthlyARE);
  const rate = (1 - asRate(settings.bncAbatementRate)) * asRate(settings.franceTravailDeductionRate);
  const warnings: string[] = [];
  if (rate <= 0) warnings.push('Taux de déduction ARE invalide.');
  const value = rate > 0 ? roundCurrency(reference / rate) : 0;

  return {
    value,
    formula: `${reference} / ((1 - ${settings.bncAbatementRate}%) * ${settings.franceTravailDeductionRate}%)`,
    assumptions: [
      fullMonthlyARE === undefined ? 'ARE théorique mensuelle' : 'ARE pleine notifiée',
      'Taux de déduction ARE',
    ],
    warnings,
  };
};
