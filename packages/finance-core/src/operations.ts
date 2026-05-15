import type {
  AccountBalance,
  DashboardProjection,
  EditableInvoice,
  FinanceData,
  Transaction,
} from './types';
import { calculateARECutoff } from './calculations/are';
import { calculateMonthlySnapshot } from './monthly/snapshot';

const createId = (prefix: string): string => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const sameMonth = (date: string, month: string): boolean => date.startsWith(month);

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
  const professionalExpenses = data.transactions
    .filter((transaction) => transaction.kind === 'expense' && sameMonth(transaction.date, month))
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const personalTransfersAlreadyMade = data.transactions
    .filter((transaction) => {
      const toAccount = data.accounts.find((account) => account.id === transaction.toAccountId);
      return transaction.kind === 'transfer' && toAccount?.kind === 'personal' && sameMonth(transaction.date, month);
    })
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  const snapshot = calculateMonthlySnapshot(
    {
      month,
      invoices: data.invoices,
      professionalExpenses,
      personalTransfersAlreadyMade,
    },
    data.settings,
  );

  return {
    month,
    kpis: {
      caEncaisse: snapshot.collectedRevenue,
      facturesImpayees: snapshot.invoicedUnpaidRevenue,
      areEstimeeM1: snapshot.estimatedARE.value,
      netDisponible: snapshot.netAvailable.value,
      seuilCoupureARE: calculateARECutoff(data.settings).value,
    },
    formulas: {
      are: snapshot.estimatedARE.formula,
      net: snapshot.netAvailable.formula,
    },
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
