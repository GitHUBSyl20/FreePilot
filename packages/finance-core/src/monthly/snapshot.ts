import type { AppSettings, MonthlySnapshotInput } from '../types';
import { calculateEstimatedARE } from '../calculations/are';
import { calculateNetAvailable } from '../calculations/netAvailable';

export const calculateCollectedRevenueFromInvoices = (month: string, invoices: MonthlySnapshotInput['invoices']): number =>
  invoices
    .filter((invoice) => invoice.status === 'paid' && invoice.paymentDate?.startsWith(month))
    .reduce((sum, invoice) => sum + invoice.totalTTC, 0);

export const calculateInvoicedUnpaidRevenue = (invoices: MonthlySnapshotInput['invoices']): number =>
  invoices
    .filter((invoice) => invoice.status === 'sent' || invoice.status === 'overdue')
    .reduce((sum, invoice) => sum + invoice.totalTTC, 0);

export const calculateMonthlySnapshot = (input: MonthlySnapshotInput, settings: AppSettings) => {
  const collectedRevenue = calculateCollectedRevenueFromInvoices(input.month, input.invoices);
  const estimatedARE = calculateEstimatedARE(collectedRevenue, settings);
  const netAvailable = calculateNetAvailable(
    {
      monthlyCollectedRevenue: collectedRevenue,
      estimatedARE: estimatedARE.value,
      professionalExpenses: input.professionalExpenses,
      personalTransfersAlreadyMade: input.personalTransfersAlreadyMade,
    },
    settings,
  );

  return {
    month: input.month,
    collectedRevenue,
    invoicedUnpaidRevenue: calculateInvoicedUnpaidRevenue(input.invoices),
    estimatedARE,
    netAvailable,
  };
};
