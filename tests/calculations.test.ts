import { describe, expect, it } from 'vitest';
import {
  AppSettings,
  addExpense,
  addInvoice,
  calculateARECutoff,
  calculateAccountBalances,
  calculateCollectedRevenueFromInvoices,
  calculateEstimatedARE,
  calculateIncomeTaxProvision,
  calculateNetAvailable,
  calculateUrssafProvision,
  createInitialFinanceData,
  createTransfer,
  deleteInvoice,
  deleteTransaction,
  markInvoicePaid,
  projectDashboard,
  updateInvoice,
  updateTransaction,
} from '@freepilot/finance-core';

const settings: AppSettings = {
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
};

describe('calculation rules', () => {
  it('calculates estimated ARE and never negative', () => {
    expect(calculateEstimatedARE(1000, settings).value).toBe(1049.7);
    expect(calculateEstimatedARE(10000, settings).value).toBe(0);
  });

  it('calculates ARE cutoff threshold', () => {
    expect(calculateARECutoff(settings).value).toBeCloseTo(3272.08, 2);
  });

  it('calculates urssaf provision', () => {
    expect(calculateUrssafProvision(1000, settings).value).toBe(258);
  });

  it('calculates income tax provision on income after abatement', () => {
    // 11 % sur 66 % du CA = 7,26 % du CA.
    expect(calculateIncomeTaxProvision(1000, settings).value).toBe(72.6);
  });

  it('applies versement libératoire directly to collected revenue', () => {
    const liberatoire = { ...settings, versementLiberatoireEnabled: true };
    expect(calculateIncomeTaxProvision(1000, liberatoire).value).toBe(22);
  });

  it('rounds half a cent up despite binary floating point', () => {
    // 1625 × 66 % × 11 % = 117,975 exactement.
    expect(calculateIncomeTaxProvision(1625, settings).value).toBe(117.98);
  });

  it('calculates net available', () => {
    const are = calculateEstimatedARE(1000, settings).value;
    expect(
      calculateNetAvailable(
        { monthlyCollectedRevenue: 1000, estimatedARE: are, professionalExpenses: 200, personalTransfersAlreadyMade: 150 },
        settings,
      ).value,
    ).toBe(1369.1);
  });

  it('counts paid invoices in month only and ignores sent invoices', () => {
    const invoices = [
      { status: 'paid' as const, paymentDate: '2026-05-01', totalTTC: 500 },
      { status: 'paid' as const, paymentDate: '2026-04-28', totalTTC: 700 },
      { status: 'sent' as const, paymentDate: null, totalTTC: 1200 },
    ];
    expect(calculateCollectedRevenueFromInvoices('2026-05', invoices)).toBe(500);
  });

  it('returns warnings when settings are missing', () => {
    const badSettings = { ...settings, areDailyAmount: 0 };
    expect(calculateEstimatedARE(1000, badSettings).warnings.length).toBeGreaterThan(0);
  });

  it('updates dashboard KPIs when an invoice is paid', () => {
    const data = createInitialFinanceData();
    const withInvoice = addInvoice(data, {
      clientName: 'Nouveau client',
      totalTTC: 1000,
      issueDate: '2026-05-22',
    });

    expect(projectDashboard(withInvoice, '2026-05').kpis.caEncaisse).toBe(1850);
    expect(projectDashboard(withInvoice, '2026-05').kpis.facturesImpayees).toBe(1900);

    const invoice = withInvoice.invoices[0];
    const paid = markInvoicePaid(withInvoice, invoice.id, {
      paymentDate: '2026-05-23',
      accountId: 'account-pro',
    });

    expect(projectDashboard(paid, '2026-05').kpis.caEncaisse).toBe(2850);
    expect(projectDashboard(paid, '2026-05').kpis.facturesImpayees).toBe(900);
  });

  it('transfers debit one account and credit another without changing total balances', () => {
    const data = createInitialFinanceData();
    const before = calculateAccountBalances(data).reduce((sum, account) => sum + account.balance, 0);
    const transferred = createTransfer(data, {
      fromAccountId: 'account-pro',
      toAccountId: 'account-personal',
      amount: 500,
      date: '2026-05-24',
    });
    const balances = calculateAccountBalances(transferred);
    const after = balances.reduce((sum, account) => sum + account.balance, 0);

    expect(balances.find((account) => account.id === 'account-pro')?.balance).toBe(3300);
    expect(balances.find((account) => account.id === 'account-personal')?.balance).toBe(1600);
    expect(after).toBe(before);
  });

  it('expenses reduce professional balance and reste à vivre', () => {
    const data = createInitialFinanceData();
    const before = projectDashboard(data, '2026-05').kpis.resteAVivre;
    const withExpense = addExpense(data, {
      label: 'Achat logiciel',
      amount: 100,
      date: '2026-05-25',
      accountId: 'account-pro',
    });

    expect(projectDashboard(withExpense, '2026-05').kpis.resteAVivre).toBe(before - 100);
    expect(calculateAccountBalances(withExpense).find((account) => account.id === 'account-pro')?.balance).toBe(3700);
  });

  it('updates a paid invoice and keeps its payment transaction in sync', () => {
    const data = createInitialFinanceData();
    const updated = updateInvoice(data, 'invoice-001', { clientName: 'Client Alpha corrigé', totalTTC: 1500 });
    const payment = updated.transactions.find((transaction) => transaction.invoiceId === 'invoice-001');

    expect(updated.invoices.find((invoice) => invoice.id === 'invoice-001')?.totalTTC).toBe(1500);
    expect(payment?.amount).toBe(1500);
    expect(payment?.label).toBe('Paiement Client Alpha corrigé');
    expect(projectDashboard(updated, '2026-05').kpis.caEncaisse).toBe(2150);
  });

  it('deletes an invoice and its linked payment transaction', () => {
    const data = createInitialFinanceData();
    const deleted = deleteInvoice(data, 'invoice-001');

    expect(deleted.invoices.some((invoice) => invoice.id === 'invoice-001')).toBe(false);
    expect(deleted.transactions.some((transaction) => transaction.invoiceId === 'invoice-001')).toBe(false);
    expect(projectDashboard(deleted, '2026-05').kpis.caEncaisse).toBe(650);
  });

  it('updates and deletes manually entered transactions', () => {
    const data = createInitialFinanceData();
    const expense = data.transactions.find((transaction) => transaction.id === 'transaction-expense-001');
    expect(expense).toBeDefined();

    const updated = updateTransaction(data, expense!.id, { label: 'Outils corrigés', amount: 300 });
    expect(updated.transactions.find((transaction) => transaction.id === expense!.id)?.label).toBe('Outils corrigés');
    expect(projectDashboard(updated, '2026-05').kpis.resteAVivre).toBe(projectDashboard(data, '2026-05').kpis.resteAVivre - 50);

    const deleted = deleteTransaction(updated, expense!.id);
    expect(deleted.transactions.some((transaction) => transaction.id === expense!.id)).toBe(false);
    expect(projectDashboard(deleted, '2026-05').kpis.resteAVivre).toBe(projectDashboard(data, '2026-05').kpis.resteAVivre + 250);
  });
});
