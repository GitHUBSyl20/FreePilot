import type { FinanceData, ForecastMonth, MonthlyRecord } from '../types';
import { roundCurrency, safeNumber } from '../calculations/common';
import { mrrForecast, weightedPipelineForMonth } from '../crm/weightedPipeline';
import { calculateAccountBalances, calculateAvailableCash } from '../operations';
import { buildMonthlyCashflowSeries } from './cashflowSeries';
import {
  collectedRevenueForMonth,
  listCoveredMonths,
  otherIncomeForMonth,
  sumRecurringCharges,
  variableExpensesForMonth,
} from './financeProjection';
import { addMonths, compareMonths, monthRange } from './month';

/**
 * Dernière ARE pleine connue à `fromMonth` ou avant, pour prolonger
 * l'hypothèse sur les mois futurs sans bascule brutale à zéro : une ARE pleine
 * absente vaudrait 0 dans le moteur, ce qui ferait chuter artificiellement
 * l'estimation dès le premier mois projeté.
 */
const latestKnownFullMonthlyARE = (data: FinanceData, atOrBefore: string): number => {
  const known = data.areMonths
    .filter((entry) => compareMonths(entry.month, atOrBefore) <= 0)
    .sort((left, right) => compareMonths(left.month, right.month));

  return known.length === 0 ? 0 : known[known.length - 1].fullMonthlyARE;
};

/**
 * Factures déjà émises, pas encore payées, attendues sur `month` à leur
 * échéance saisie.
 *
 * Une facture sans échéance n'est comptée sur aucun mois — surtout pas repliée
 * sur le mois courant : « aujourd'hui » change à chaque ouverture de l'écran,
 * ce qui ferait rejouer artificiellement le même CA sur un mois différent à
 * chaque fois, avec la déduction ARE et l'Urssaf/impôt qui vont avec. Voir
 * `pendingInvoiceRevenueWithoutDueDate` pour leur total, à part.
 */
const pendingInvoiceRevenueForMonth = (data: FinanceData, month: string): number =>
  roundCurrency(
    data.invoices
      .filter((invoice) => invoice.status === 'sent' || invoice.status === 'overdue')
      .filter((invoice) => invoice.dueDate?.slice(0, 7) === month)
      .reduce((sum, invoice) => sum + safeNumber(invoice.totalTTC), 0),
  );

/**
 * Total des factures émises, pas encore payées, sans échéance saisie.
 *
 * Volontairement tenu à l'écart du prévisionnel mois par mois (voir
 * `pendingInvoiceRevenueForMonth`) : sans date, il n'y a rien de fiable à
 * projeter sur un mois précis. Le bon geste est de renseigner l'échéance sur
 * ces factures, dans l'onglet Factures.
 */
export const pendingInvoiceRevenueWithoutDueDate = (data: FinanceData): number =>
  roundCurrency(
    data.invoices
      .filter((invoice) => invoice.status === 'sent' || invoice.status === 'overdue')
      .filter((invoice) => !invoice.dueDate)
      .reduce((sum, invoice) => sum + safeNumber(invoice.totalTTC), 0),
  );

/**
 * Prévisionnel simple, mois par mois, à partir de `fromMonth` inclus.
 *
 * Principe du prévisionnel, différent de celui du tableau de bord (Accueil) :
 * une facture déjà émise mais pas encore payée compte comme CA dès qu'elle
 * existe, à son échéance — même pour le mois courant. C'est tout l'intérêt de
 * simuler : anticiper un encaissement attendu, pas seulement constater ce qui
 * est déjà en banque. Le tableau de bord, lui, reste strictement sur
 * l'encaissé (règle « facturé ≠ encaissé », AGENTS.md) : les deux vues
 * coexistent volontairement, chacune avec sa question (« où j'en suis » pour
 * l'un, « où je vais » pour l'autre).
 *
 * Le CA de chaque mois vient donc de trois sources, exposées séparément pour
 * rester transparent sur leur origine :
 * - les factures déjà émises, pas encore payées, à leur échéance (le plus
 *   concret : le client existe, le montant est arrêté) — y compris pour le
 *   mois courant ;
 * - le pipeline pondéré du CRM (probabilités par stade, affaires pas encore
 *   facturées), pour les mois futurs seulement ;
 * - le MRR déjà gagné (missions récurrentes signées), pour les mois futurs
 *   seulement.
 * Une affaire facturée n'est plus « ouverte » côté CRM : les deux premières
 * sources ne se chevauchent jamais.
 *
 * ARE pleine reconduite depuis la dernière valeur connue ; charges fixes et
 * dépenses au même rythme qu'aujourd'hui (charges récurrentes actives, aucune
 * dépense ponctuelle future puisqu'aucune n'est connue). Connu et estimé
 * passent par la même moulinette (`buildMonthlyCashflowSeries`) pour que la
 * déduction ARE continue de se transmettre correctement d'un mois à l'autre.
 */
export const buildForecastMonths = (data: FinanceData, fromMonth: string, monthsAhead = 6): ForecastMonth[] => {
  const horizon = monthRange(fromMonth, Math.max(1, monthsAhead));

  const knownMonths = listCoveredMonths(data, fromMonth).filter((month) => compareMonths(month, fromMonth) <= 0);
  // Contrairement à `buildMonthlyRecords` (utilisé par le tableau de bord),
  // le CA de la simulation inclut les factures en attente : voir la note de
  // `buildForecastMonths` ci-dessus.
  const knownRecords: MonthlyRecord[] = knownMonths.map((month) => {
    const areEntry = data.areMonths.find((entry) => entry.month === month);

    return {
      month,
      collectedRevenue: roundCurrency(
        collectedRevenueForMonth(data, month) + pendingInvoiceRevenueForMonth(data, month),
      ),
      fullMonthlyARE: safeNumber(areEntry?.fullMonthlyARE),
      actualARE: areEntry?.actualARE ?? null,
    };
  });

  const fallbackFullMonthlyARE = latestKnownFullMonthlyARE(data, fromMonth);
  const futureRecords: MonthlyRecord[] = horizon
    .filter((month) => compareMonths(month, fromMonth) > 0)
    .map((month) => ({
      month,
      collectedRevenue: roundCurrency(
        pendingInvoiceRevenueForMonth(data, month) +
          weightedPipelineForMonth(data, month) +
          // Comparaison lexicographique de 'YYYY-MM-DD' : le 31 n'a pas besoin
          // d'exister réellement, la chaîne suffit à borner le mois par le haut.
          mrrForecast(data, `${month}-31`),
      ),
      fullMonthlyARE: fallbackFullMonthlyARE,
      actualARE: null,
    }));

  const cashflowSeries = buildMonthlyCashflowSeries([...knownRecords, ...futureRecords], data.settings);
  const recurringCharges = sumRecurringCharges(data.recurringCharges);
  const startingCash = calculateAvailableCash(calculateAccountBalances(data));

  let cumulativeCash = startingCash;

  return horizon.map((month) => {
    const isEstimated = compareMonths(month, fromMonth) > 0;
    const cashflow = cashflowSeries.find((entry) => entry.month === month);
    const netFinal = cashflow?.netFinal.value ?? 0;
    // L'impôt généré par le CA de ce mois n'est prélevé que le mois suivant
    // (même décalage que l'Urssaf, déjà appliqué dans netFinal) : c'est
    // l'impôt hérité du mois précédent qui pèse ici.
    const carriedIncomeTax = cashflow?.carriedIncomeTax ?? 0;
    // Un mois estimé n'a par construction aucune dépense ponctuelle ni
    // encaissement hors CA saisis : ils resteraient à 0 même sans ce garde-fou,
    // il documente juste l'intention plutôt que de la laisser implicite.
    const variableExpenses = isEstimated ? 0 : variableExpensesForMonth(data, month);
    const otherIncome = isEstimated ? 0 : otherIncomeForMonth(data, month);

    const resteAVivre = roundCurrency(
      netFinal - carriedIncomeTax - recurringCharges.total - variableExpenses + otherIncome,
    );

    // Le mois courant part de la photo réelle des comptes. Au-delà, un reste
    // à vivre positif est par définition de l'argent destiné à être vécu — pas
    // épargné — donc il ne fait pas grimper la trésorerie : seul un mois
    // déficitaire l'entame vraiment, puisqu'il faut alors puiser dans la
    // réserve pour boucler les charges. Additionner aussi les mois positifs
    // ferait grimper la courbe indéfiniment, comme si le reste à vivre
    // s'accumulait au lieu de partir dans le quotidien.
    cumulativeCash = isEstimated ? roundCurrency(cumulativeCash + Math.min(0, resteAVivre)) : startingCash;

    return {
      month,
      isEstimated,
      collectedRevenue: cashflow?.collectedRevenue ?? 0,
      // Composent déjà collectedRevenue, y compris pour le mois courant (voir
      // la note de `buildForecastMonths`) ; exposées à part pour rester
      // traçable sur ce qui vient de factures déjà émises.
      facturesEnAttente: pendingInvoiceRevenueForMonth(data, month),
      pipelinePondere: weightedPipelineForMonth(data, month),
      mrrPrevisionnel: mrrForecast(data, `${month}-31`),
      effectiveARE: cashflow?.effectiveARE ?? 0,
      chargesFixes: recurringCharges.total,
      resteAVivre,
      cumulativeCash,
    };
  });
};

// Réexporté pour que les appelants puissent situer l'horizon sans recalculer
// `addMonths` eux-mêmes (ex. libellé « jusqu'à … »).
export const forecastEndMonth = (fromMonth: string, monthsAhead = 6): string =>
  addMonths(fromMonth, Math.max(1, monthsAhead) - 1);
