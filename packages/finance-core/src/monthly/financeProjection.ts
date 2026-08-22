import type {
  ChargeScope,
  FinanceData,
  MonthlyCashflow,
  MonthlyOutlook,
  MonthlyRecord,
  RecurringCharge,
  RecurringChargeTotals,
} from '../types';
import { calculateARECutoff } from '../calculations/are';
import { roundCurrency, safeNumber } from '../calculations/common';
import { mrrForecast, weightedPipelineForMonth } from '../crm/weightedPipeline';
import { buildMonthlyCashflowSeries } from './cashflowSeries';
import { addMonths, compareMonths } from './month';

export const sumRecurringCharges = (charges: RecurringCharge[]): RecurringChargeTotals => {
  const sumForScope = (scope: ChargeScope) =>
    roundCurrency(
      charges
        .filter((charge) => charge.active && charge.scope === scope)
        .reduce((total, charge) => total + safeNumber(charge.amount), 0),
    );

  const professional = sumForScope('professional');
  const personal = sumForScope('personal');

  return { professional, personal, total: roundCurrency(professional + personal) };
};

export const collectedRevenueForMonth = (data: FinanceData, month: string): number =>
  roundCurrency(
    data.invoices
      .filter((invoice) => invoice.status === 'paid' && invoice.paymentDate?.startsWith(month))
      .reduce((total, invoice) => total + safeNumber(invoice.totalTTC), 0),
  );

/**
 * Dépenses ponctuelles du mois, hors charges fixes.
 *
 * Les opérations engendrées par une charge fixe sont exclues : elles sont déjà
 * portées par `recurringCharges`, et les compter ici les ferait peser deux
 * fois sur le reste à vivre.
 */
export const variableExpensesForMonth = (data: FinanceData, month: string): number =>
  roundCurrency(
    data.transactions
      .filter(
        (transaction) =>
          transaction.kind === 'expense' &&
          transaction.recurringChargeId === undefined &&
          transaction.date.startsWith(month),
      )
      .reduce((total, transaction) => total + safeNumber(transaction.amount), 0),
  );

/**
 * Encaissements du mois qui ne sont pas du chiffre d'affaires.
 *
 * Ils restent volontairement hors de `collectedRevenue` : les faire entrer
 * dans le CA déclencherait de l'Urssaf, de l'impôt et une déduction d'ARE sur
 * de l'argent qui n'en génère aucun.
 */
export const otherIncomeForMonth = (data: FinanceData, month: string): number =>
  roundCurrency(
    data.transactions
      .filter((transaction) => transaction.kind === 'otherIncome' && transaction.date.startsWith(month))
      .reduce((total, transaction) => total + safeNumber(transaction.amount), 0),
  );

/**
 * Mois couverts par les données, de façon continue.
 *
 * La continuité est indispensable : la déduction se transmet de mois en mois,
 * un trou dans la série casserait le chaînage.
 */
export const listCoveredMonths = (data: FinanceData, upToMonth: string): string[] => {
  const known = [
    ...data.invoices.filter((invoice) => invoice.paymentDate).map((invoice) => invoice.paymentDate!.slice(0, 7)),
    ...data.areMonths.map((entry) => entry.month),
    upToMonth,
  ].filter(Boolean);

  if (known.length === 0) return [upToMonth];

  const sorted = [...known].sort(compareMonths);
  const months: string[] = [];
  for (let cursor = sorted[0]; compareMonths(cursor, sorted[sorted.length - 1]) <= 0; cursor = addMonths(cursor, 1)) {
    months.push(cursor);
  }

  return months;
};

export const buildMonthlyRecords = (data: FinanceData, months: string[]): MonthlyRecord[] =>
  months.map((month) => {
    const areEntry = data.areMonths.find((entry) => entry.month === month);

    return {
      month,
      collectedRevenue: collectedRevenueForMonth(data, month),
      fullMonthlyARE: safeNumber(areEntry?.fullMonthlyARE),
      actualARE: areEntry?.actualARE ?? null,
    };
  });

/** Série complète, du premier mois connu jusqu'au mois suivant `month` inclus. */
export const buildFinanceSeries = (data: FinanceData, month: string): MonthlyCashflow[] => {
  const months = listCoveredMonths(data, addMonths(month, 1));
  return buildMonthlyCashflowSeries(buildMonthlyRecords(data, months), data.settings);
};

/**
 * Vue d'un mois : trésorerie issue du moteur, charges fixes, reste à vivre.
 *
 * Les charges récurrentes décrivent le plan mensuel, les transactions décrivent
 * les mouvements constatés. Une charge fixe ne doit donc pas être saisie aussi
 * comme dépense ponctuelle, sinon elle est comptée deux fois.
 */
export const projectMonthlyOutlook = (data: FinanceData, month: string): MonthlyOutlook => {
  const series = buildFinanceSeries(data, month);
  const cashflow = series.find((entry) => entry.month === month) ?? series[series.length - 1];
  const nextCashflow = series.find((entry) => entry.month === addMonths(month, 1));
  const nextARE = nextCashflow?.theoreticalARE;

  const recurringCharges = sumRecurringCharges(data.recurringCharges);
  const variableExpenses = variableExpensesForMonth(data, month);
  const otherIncome = otherIncomeForMonth(data, month);

  const resteAVivreValue = roundCurrency(
    cashflow.netFinal.value -
      cashflow.incomeTaxProvision.value -
      recurringCharges.total -
      variableExpenses +
      otherIncome,
  );

  const areEntry = data.areMonths.find((entry) => entry.month === addMonths(month, 1));

  return {
    month,
    cashflow,
    recurringCharges,
    variableExpenses,
    otherIncome,
    resteAVivre: {
      value: resteAVivreValue,
      formula: `${cashflow.netFinal.value} - ${cashflow.incomeTaxProvision.value} - ${recurringCharges.total} - ${variableExpenses} + ${otherIncome}`,
      assumptions: [
        'Trésorerie du mois',
        'Provision impôt',
        'Charges fixes',
        'Dépenses ponctuelles',
        'Encaissements hors CA',
      ],
      warnings: resteAVivreValue < 0 ? ['Le mois ne couvre pas les charges.'] : [],
    },
    areCutoff: calculateARECutoff(data.settings, areEntry ? areEntry.fullMonthlyARE : undefined),
    // Le moteur signale déjà l'ARE pleine manquante par un avertissement : on
    // s'appuie dessus plutôt que de redire la règle ici, sinon les deux
    // finiraient par diverger.
    nextMonthARE: nextARE && nextARE.warnings.length === 0 ? nextARE.value : null,
    weightedPipelineForecast: weightedPipelineForMonth(data, month),
    // Comparaison lexicographique de 'YYYY-MM-DD' : le 31 n'a pas besoin
    // d'exister réellement, la chaîne suffit à borner le mois par le haut.
    mrrForecast: mrrForecast(data, `${month}-31`),
  };
};
