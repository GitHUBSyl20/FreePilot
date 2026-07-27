import type {
  AccountBalance,
  ChargeScope,
  DashboardProjection,
  EditableInvoice,
  FinanceData,
  MonthlyAREEntry,
  RecurringCharge,
  Transaction,
} from './types';
import { projectRemainingAREDays } from './monthly/cashflowSeries';
import { buildFinanceSeries, projectMonthlyOutlook } from './monthly/financeProjection';

const createId = (prefix: string): string => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const sanitizeAmount = (amount: number): number => Math.max(0, amount);

export const getCurrentMonth = (date = new Date()): string => date.toISOString().slice(0, 7);

export const calculateAccountBalances = (data: FinanceData): AccountBalance[] =>
  data.accounts.map((account) => {
    const balance = data.transactions.reduce((sum, transaction) => {
      if (transaction.fromAccountId === account.id) return sum - transaction.amount;
      if (transaction.toAccountId === account.id) return sum + transaction.amount;
      return sum;
    }, account.openingBalance);

    return { ...account, balance: Math.round(balance * 100) / 100 };
  });

export const getProfessionalAccount = (data: FinanceData) =>
  data.accounts.find((account) => account.kind === 'professional') ?? data.accounts[0];

export const projectDashboard = (data: FinanceData, month: string = getCurrentMonth()): DashboardProjection => {
  const outlook = projectMonthlyOutlook(data, month);
  const invoicedUnpaidRevenue = data.invoices
    .filter((invoice) => invoice.status === 'sent' || invoice.status === 'overdue')
    .reduce((sum, invoice) => sum + invoice.totalTTC, 0);

  // Les jours de droits se décomptent sur l'ensemble des mois écoulés,
  // pas sur le seul mois affiché.
  const consumedUpToMonth = buildFinanceSeries(data, month).filter((entry) => entry.month <= month);

  return {
    month,
    kpis: {
      caEncaisse: outlook.cashflow.collectedRevenue,
      facturesImpayees: invoicedUnpaidRevenue,
      areDuMois: outlook.cashflow.effectiveARE,
      areEstimeeM1: outlook.nextMonthARE,
      netFinal: outlook.cashflow.netFinal.value,
      chargesFixes: outlook.recurringCharges.total,
      resteAVivre: outlook.resteAVivre.value,
      seuilCoupureARE: outlook.areCutoff.value,
      joursAreRestants: projectRemainingAREDays(consumedUpToMonth, data.settings),
    },
    formulas: {
      are: outlook.cashflow.theoreticalARE.formula,
      resteAVivre: outlook.resteAVivre.formula,
    },
    outlook,
    accountBalances: calculateAccountBalances(data),
    recentTransactions: [...data.transactions]
      .sort((left, right) => right.date.localeCompare(left.date))
      .slice(0, 8),
  };
};

export const addInvoice = (
  data: FinanceData,
  input: { clientName: string; totalTTC: number; issueDate: string; dueDate?: string | null },
): FinanceData => {
  const invoice: EditableInvoice = {
    id: createId('invoice'),
    clientName: input.clientName.trim() || 'Client sans nom',
    status: 'sent',
    totalTTC: sanitizeAmount(input.totalTTC),
    issueDate: input.issueDate,
    dueDate: input.dueDate ?? null,
    paymentDate: null,
    paymentAccountId: null,
  };

  return { ...data, invoices: [invoice, ...data.invoices] };
};

export const updateInvoice = (
  data: FinanceData,
  invoiceId: string,
  input: Partial<Pick<EditableInvoice, 'clientName' | 'dueDate' | 'issueDate' | 'paymentAccountId' | 'paymentDate' | 'status' | 'totalTTC'>>,
): FinanceData => {
  const currentInvoice = data.invoices.find((invoice) => invoice.id === invoiceId);
  if (!currentInvoice) return data;

  const nextStatus = input.status ?? currentInvoice.status;
  const updatedInvoice: EditableInvoice = {
    ...currentInvoice,
    ...input,
    clientName: input.clientName?.trim() || currentInvoice.clientName,
    totalTTC: input.totalTTC === undefined ? currentInvoice.totalTTC : sanitizeAmount(input.totalTTC),
    status: nextStatus,
    paymentDate: nextStatus === 'paid' ? input.paymentDate ?? currentInvoice.paymentDate : null,
    paymentAccountId: nextStatus === 'paid' ? input.paymentAccountId ?? currentInvoice.paymentAccountId : null,
  };
  const invoices = data.invoices.map((invoice) => (invoice.id === invoiceId ? updatedInvoice : invoice));

  const transactionsWithoutInvoicePayment = data.transactions.filter((transaction) => transaction.invoiceId !== invoiceId);
  if (updatedInvoice.status !== 'paid' || !updatedInvoice.paymentDate || !updatedInvoice.paymentAccountId) {
    return { ...data, invoices, transactions: transactionsWithoutInvoicePayment };
  }

  const existingPayment = data.transactions.find((transaction) => transaction.invoiceId === invoiceId);
  const paymentTransaction: Transaction = {
    id: existingPayment?.id ?? createId('transaction-income'),
    kind: 'income',
    label: `Paiement ${updatedInvoice.clientName}`,
    amount: updatedInvoice.totalTTC,
    date: updatedInvoice.paymentDate,
    fromAccountId: null,
    toAccountId: updatedInvoice.paymentAccountId,
    invoiceId,
  };

  return { ...data, invoices, transactions: [paymentTransaction, ...transactionsWithoutInvoicePayment] };
};

export const deleteInvoice = (data: FinanceData, invoiceId: string): FinanceData => ({
  ...data,
  invoices: data.invoices.filter((invoice) => invoice.id !== invoiceId),
  transactions: data.transactions.filter((transaction) => transaction.invoiceId !== invoiceId),
});

export const markInvoicePaid = (
  data: FinanceData,
  invoiceId: string,
  input: { paymentDate: string; accountId?: string },
): FinanceData => {
  const invoice = data.invoices.find((item) => item.id === invoiceId);
  const paymentAccount = input.accountId ?? getProfessionalAccount(data)?.id ?? null;
  if (!invoice || !paymentAccount) return data;

  const transaction: Transaction = {
    id: createId('transaction-income'),
    kind: 'income',
    label: `Paiement ${invoice.clientName}`,
    amount: invoice.totalTTC,
    date: input.paymentDate,
    fromAccountId: null,
    toAccountId: paymentAccount,
    invoiceId,
  };

  return {
    ...data,
    invoices: data.invoices.map((item) =>
      item.id === invoiceId
        ? { ...item, status: 'paid', paymentDate: input.paymentDate, paymentAccountId: paymentAccount }
        : item,
    ),
    transactions: [transaction, ...data.transactions.filter((item) => item.invoiceId !== invoiceId)],
  };
};

export const addExpense = (
  data: FinanceData,
  input: { label: string; amount: number; date: string; accountId?: string },
): FinanceData => {
  const fromAccountId = input.accountId ?? getProfessionalAccount(data)?.id ?? null;
  if (!fromAccountId) return data;

  const transaction: Transaction = {
    id: createId('transaction-expense'),
    kind: 'expense',
    label: input.label.trim() || 'Dépense pro',
    amount: sanitizeAmount(input.amount),
    date: input.date,
    fromAccountId,
    toAccountId: null,
  };

  return { ...data, transactions: [transaction, ...data.transactions] };
};

export const updateTransaction = (
  data: FinanceData,
  transactionId: string,
  input: Partial<Pick<Transaction, 'amount' | 'date' | 'fromAccountId' | 'label' | 'toAccountId'>>,
): FinanceData => ({
  ...data,
  transactions: data.transactions.map((transaction) => {
    if (transaction.id !== transactionId) return transaction;

    return {
      ...transaction,
      ...input,
      label: input.label?.trim() || transaction.label,
      amount: input.amount === undefined ? transaction.amount : sanitizeAmount(input.amount),
    };
  }),
});

export const deleteTransaction = (data: FinanceData, transactionId: string): FinanceData => ({
  ...data,
  transactions: data.transactions.filter((transaction) => transaction.id !== transactionId),
});

export const addRecurringCharge = (
  data: FinanceData,
  input: { label: string; amount: number; scope: ChargeScope; dayOfMonth?: number | null },
): FinanceData => {
  const charge: RecurringCharge = {
    id: createId('charge'),
    label: input.label.trim() || 'Charge sans libellé',
    amount: sanitizeAmount(input.amount),
    scope: input.scope,
    dayOfMonth: input.dayOfMonth ?? null,
    active: true,
  };

  return { ...data, recurringCharges: [...data.recurringCharges, charge] };
};

export const updateRecurringCharge = (
  data: FinanceData,
  chargeId: string,
  input: Partial<Pick<RecurringCharge, 'active' | 'amount' | 'dayOfMonth' | 'label' | 'scope'>>,
): FinanceData => ({
  ...data,
  recurringCharges: data.recurringCharges.map((charge) => {
    if (charge.id !== chargeId) return charge;

    return {
      ...charge,
      ...input,
      label: input.label?.trim() || charge.label,
      amount: input.amount === undefined ? charge.amount : sanitizeAmount(input.amount),
    };
  }),
});

export const deleteRecurringCharge = (data: FinanceData, chargeId: string): FinanceData => ({
  ...data,
  recurringCharges: data.recurringCharges.filter((charge) => charge.id !== chargeId),
});

/** Crée ou remplace l'ARE d'un mois : un seul enregistrement par mois. */
export const upsertAREMonth = (
  data: FinanceData,
  input: { month: string; fullMonthlyARE: number; actualARE?: number | null },
): FinanceData => {
  const entry: MonthlyAREEntry = {
    month: input.month,
    fullMonthlyARE: sanitizeAmount(input.fullMonthlyARE),
    actualARE: input.actualARE === null || input.actualARE === undefined ? null : sanitizeAmount(input.actualARE),
  };
  const others = data.areMonths.filter((item) => item.month !== input.month);

  return { ...data, areMonths: [...others, entry].sort((left, right) => left.month.localeCompare(right.month)) };
};

export const deleteAREMonth = (data: FinanceData, month: string): FinanceData => ({
  ...data,
  areMonths: data.areMonths.filter((entry) => entry.month !== month),
});

export const createTransfer = (
  data: FinanceData,
  input: { fromAccountId: string; toAccountId: string; amount: number; date: string; label?: string },
): FinanceData => {
  if (input.fromAccountId === input.toAccountId) return data;

  const transaction: Transaction = {
    id: createId('transaction-transfer'),
    kind: 'transfer',
    label: input.label?.trim() || 'Virement interne',
    amount: sanitizeAmount(input.amount),
    date: input.date,
    fromAccountId: input.fromAccountId,
    toAccountId: input.toAccountId,
  };

  return { ...data, transactions: [transaction, ...data.transactions] };
};
