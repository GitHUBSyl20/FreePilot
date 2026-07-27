import type { AppSettings, MonthlyCashflow, MonthlyRecord } from '../types';
import { calculateAREDays, calculateAREDeduction } from '../calculations/are';
import { roundCurrency, safeNumber } from '../calculations/common';
import { calculateIncomeTaxProvision } from '../calculations/tax';
import { calculateUrssafProvision } from '../calculations/urssaf';
import { addMonths, compareMonths } from './month';

export type CashflowSeriesOptions = {
  /**
   * Déduction issue du mois précédant le premier de la série, à imputer sur
   * son ARE. Nécessaire quand la série ne démarre pas au début des droits.
   */
  carriedDeduction?: number;
};

/**
 * Enchaîne les mois en respectant les décalages réels :
 * - la déduction ARE générée par le CA du mois M frappe l'ARE versée en M+1 ;
 * - l'Urssaf due sur le CA du mois M est payée en M+1.
 *
 * C'est la logique du tableur de référence, à une normalisation près :
 * l'ARE pleine est prise telle qu'elle est saisie pour chaque mois.
 */
export const buildMonthlyCashflowSeries = (
  records: MonthlyRecord[],
  settings: AppSettings,
  options: CashflowSeriesOptions = {},
): MonthlyCashflow[] => {
  const ordered = [...records].sort((left, right) => compareMonths(left.month, right.month));
  let carriedDeduction = safeNumber(options.carriedDeduction);

  return ordered.map((record) => {
    const collectedRevenue = safeNumber(record.collectedRevenue);
    const fullMonthlyARE = safeNumber(record.fullMonthlyARE);

    // L'ARE ne peut pas devenir négative : au-delà, elle est simplement coupée.
    const theoreticalValue = roundCurrency(Math.max(0, fullMonthlyARE - carriedDeduction));
    const theoreticalARE = {
      value: theoreticalValue,
      formula: `max(0, ${fullMonthlyARE} - ${roundCurrency(carriedDeduction)})`,
      assumptions: ['ARE pleine du mois', 'Déduction issue du CA du mois précédent'],
      warnings: fullMonthlyARE <= 0 ? ['ARE pleine du mois non renseignée.'] : [],
    };

    const actualARE = record.actualARE ?? null;
    const effectiveARE = actualARE === null ? theoreticalValue : roundCurrency(safeNumber(actualARE));

    const urssafProvision = calculateUrssafProvision(collectedRevenue, settings);
    const incomeTaxProvision = calculateIncomeTaxProvision(collectedRevenue, settings);
    // Les jours de droits se décomptent sur l'ARE réellement versée quand elle
    // est connue : c'est elle qui a effectivement consommé le capital.
    const { consumed, preserved } = calculateAREDays(effectiveARE, settings);

    const netFinalValue = roundCurrency(collectedRevenue - urssafProvision.value + effectiveARE);

    const cashflow: MonthlyCashflow = {
      month: record.month,
      collectedRevenue,
      areDeduction: calculateAREDeduction(collectedRevenue, settings),
      carriedDeduction: roundCurrency(carriedDeduction),
      theoreticalARE,
      actualARE,
      effectiveARE,
      areDaysConsumed: consumed,
      areDaysPreserved: preserved,
      urssafProvision,
      urssafPaymentMonth: addMonths(record.month, 1),
      incomeTaxProvision,
      netFinal: {
        value: netFinalValue,
        formula: `${collectedRevenue} - ${urssafProvision.value} + ${effectiveARE}`,
        assumptions: ['CA encaissé', 'Provision Urssaf', 'ARE effective'],
        warnings: [],
      },
    };

    carriedDeduction = cashflow.areDeduction.value;
    return cashflow;
  });
};

/** Jours d'ARE restants après consommation de la série. */
export const projectRemainingAREDays = (series: MonthlyCashflow[], settings: AppSettings): number =>
  series.reduce((remaining, month) => remaining - month.areDaysConsumed, safeNumber(settings.remainingAREDays));
