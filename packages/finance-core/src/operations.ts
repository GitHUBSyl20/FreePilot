import type {
  Account,
  AccountBalance,
  ChargeScope,
  DashboardProjection,
  EditableInvoice,
  FinanceData,
  Interaction,
  InteractionChannel,
  MonthlyAREEntry,
  Prospect,
  ProspectStatus,
  ProspectTemperature,
  RecurringCharge,
  Transaction,
} from './types';
import { todayISO } from './crm/day';
import { projectRemainingAREDays } from './monthly/cashflowSeries';
import { chargeDebitAccountId } from './monthly/chargePosting';
import { buildFinanceSeries, projectMonthlyOutlook } from './monthly/financeProjection';

const createId = (prefix: string): string => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const sanitizeAmount = (amount: number): number => Math.max(0, amount);

/** Mois courant dans le fuseau local, et non en UTC : voir `todayISO`. */
export const getCurrentMonth = (date = new Date()): string => todayISO(date).slice(0, 7);

export const calculateAccountBalances = (data: FinanceData): AccountBalance[] =>
  data.accounts.map((account) => {
    const balance = data.transactions.reduce((sum, transaction) => {
      if (transaction.fromAccountId === account.id) return sum - transaction.amount;
      if (transaction.toAccountId === account.id) return sum + transaction.amount;
      return sum;
    }, account.openingBalance);

    return { ...account, balance: Math.round(balance * 100) / 100 };
  });

/** Somme des mouvements enregistrés sur un compte, hors solde d'ouverture. */
const movementsForAccount = (data: FinanceData, accountId: string): number =>
  data.transactions.reduce((sum, transaction) => {
    if (transaction.fromAccountId === accountId) return sum - transaction.amount;
    if (transaction.toAccountId === accountId) return sum + transaction.amount;
    return sum;
  }, 0);

/**
 * Recale un compte sur le solde lu au relevé bancaire.
 *
 * C'est l'inverse du solde d'ouverture, et c'est le sens dans lequel
 * l'information existe : personne ne connaît son solde à une date passée,
 * tout le monde a le solde du jour sous les yeux. L'ouverture s'en déduit, et
 * absorbe au passage tout ce qui n'a pas été saisi.
 */
export const setObservedAccountBalance = (
  data: FinanceData,
  accountId: string,
  observedBalance: number,
): FinanceData => {
  if (!Number.isFinite(observedBalance)) return data;

  return updateAccount(data, accountId, {
    openingBalance: observedBalance - movementsForAccount(data, accountId),
  });
};

export const getProfessionalAccount = (data: FinanceData) =>
  data.accounts.find((account) => account.kind === 'professional') ?? data.accounts[0];

/**
 * Le solde d'ouverture est le point de départ du calcul de solde : il absorbe
 * tout ce qui précède la première opération saisie. C'est le seul moyen de
 * faire coïncider ce qu'affiche l'application avec le relevé bancaire.
 */
export const updateAccount = (
  data: FinanceData,
  accountId: string,
  input: Partial<Pick<Account, 'name' | 'openingBalance'>>,
): FinanceData => ({
  ...data,
  accounts: data.accounts.map((account) => {
    if (account.id !== accountId) return account;

    return {
      ...account,
      name: input.name?.trim() || account.name,
      // Un solde d'ouverture peut être négatif : il rattrape les dépenses
      // antérieures à la première opération saisie. Surtout pas de plancher
      // à zéro ici, contrairement aux montants d'opération.
      openingBalance:
        input.openingBalance === undefined || !Number.isFinite(input.openingBalance)
          ? account.openingBalance
          : Math.round(input.openingBalance * 100) / 100,
    };
  }),
});

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
      pipelinePondere: outlook.weightedPipelineForecast,
      mrrPrevisionnel: outlook.mrrForecast,
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
  input: {
    clientName: string;
    totalTTC: number;
    issueDate: string;
    dueDate?: string | null;
    prospectId?: string | null;
  },
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
    prospectId: input.prospectId ?? null,
  };

  return { ...data, invoices: [invoice, ...data.invoices] };
};

export const updateInvoice = (
  data: FinanceData,
  invoiceId: string,
  input: Partial<
    Pick<
      EditableInvoice,
      'clientName' | 'dueDate' | 'issueDate' | 'paymentAccountId' | 'paymentDate' | 'prospectId' | 'status' | 'totalTTC'
    >
  >,
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

/**
 * Encaissement qui n'est pas du chiffre d'affaires : remboursement d'impôts,
 * aide, remboursement de frais. Il alimente le compte et le reste à vivre sans
 * déclencher d'Urssaf, d'impôt ni de déduction d'ARE.
 */
export const addOtherIncome = (
  data: FinanceData,
  input: { label: string; amount: number; date: string; accountId?: string },
): FinanceData => {
  const toAccountId = input.accountId ?? getProfessionalAccount(data)?.id ?? null;
  if (!toAccountId) return data;

  const transaction: Transaction = {
    id: createId('transaction-other-income'),
    kind: 'otherIncome',
    label: input.label.trim() || 'Encaissement hors CA',
    amount: sanitizeAmount(input.amount),
    date: input.date,
    fromAccountId: null,
    toAccountId,
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
  input: {
    label: string;
    amount: number;
    scope: ChargeScope;
    dayOfMonth?: number | null;
    paymentAccountId?: string | null;
  },
): FinanceData => {
  const charge: RecurringCharge = {
    id: createId('charge'),
    label: input.label.trim() || 'Charge sans libellé',
    amount: sanitizeAmount(input.amount),
    scope: input.scope,
    paymentAccountId: input.paymentAccountId ?? null,
    dayOfMonth: input.dayOfMonth ?? null,
    active: true,
  };

  return { ...data, recurringCharges: [...data.recurringCharges, charge] };
};

export const updateRecurringCharge = (
  data: FinanceData,
  chargeId: string,
  input: Partial<Pick<RecurringCharge, 'active' | 'amount' | 'dayOfMonth' | 'label' | 'paymentAccountId' | 'scope'>>,
): FinanceData => {
  const currentCharge = data.recurringCharges.find((charge) => charge.id === chargeId);
  if (!currentCharge) return data;

  const nextCharge: RecurringCharge = {
    ...currentCharge,
    ...input,
    label: input.label?.trim() || currentCharge.label,
    amount: input.amount === undefined ? currentCharge.amount : sanitizeAmount(input.amount),
  };

  const withCharge: FinanceData = {
    ...data,
    recurringCharges: data.recurringCharges.map((charge) => (charge.id === chargeId ? nextCharge : charge)),
  };

  const debitAccountId = chargeDebitAccountId(withCharge, nextCharge);
  const accountChanged = debitAccountId !== chargeDebitAccountId(data, currentCharge);
  const labelChanged = nextCharge.label !== currentCharge.label;
  if (!accountChanged && !labelChanged) return withCharge;

  /*
   * Le libellé et le compte prélevé se propagent aux échéances déjà posées.
   *
   * Une charge décrit un prélèvement permanent : l'application n'a pas de
   * notion de « le nom a changé à telle date ». Dans la pratique on corrige
   * une saisie, et laisser le passé sous l'ancien nom ou sur le mauvais
   * compte fausserait durablement la lecture. Pour un vrai changement de
   * banque, mieux vaut suspendre la charge et en créer une nouvelle.
   *
   * Le montant, lui, ne se propage pas : un prélèvement passé a pu être
   * différent, et il se corrige échéance par échéance.
   */
  return {
    ...withCharge,
    transactions: withCharge.transactions.map((transaction) =>
      transaction.recurringChargeId === chargeId
        ? { ...transaction, fromAccountId: debitAccountId, label: nextCharge.label }
        : transaction,
    ),
  };
};

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

export const addProspect = (
  data: FinanceData,
  input: {
    name: string;
    company?: string | null;
    source?: string | null;
    temperature: ProspectTemperature;
    nextFollowUpDate?: string | null;
    notes?: string;
    createdAt?: string;
  },
): FinanceData => {
  const prospect: Prospect = {
    id: createId('prospect'),
    name: input.name.trim() || 'Contact sans nom',
    company: input.company?.trim() || null,
    source: input.source?.trim() || null,
    temperature: input.temperature,
    status: 'active',
    nextFollowUpDate: input.nextFollowUpDate ?? null,
    notes: input.notes?.trim() ?? '',
    createdAt: input.createdAt ?? todayISO(),
    // Non exposé au formulaire de saisie rapide pour l'instant : se règle
    // depuis la fiche prospect, au même endroit que température et statut.
    estPrescripteur: false,
  };

  return { ...data, prospects: [prospect, ...data.prospects] };
};

export const updateProspect = (
  data: FinanceData,
  prospectId: string,
  input: Partial<
    Pick<Prospect, 'company' | 'name' | 'nextFollowUpDate' | 'notes' | 'source' | 'status' | 'temperature'>
  >,
): FinanceData => ({
  ...data,
  prospects: data.prospects.map((prospect) => {
    if (prospect.id !== prospectId) return prospect;

    return {
      ...prospect,
      ...input,
      name: input.name?.trim() || prospect.name,
      // Un champ vidé volontairement doit pouvoir redevenir nul.
      company: input.company === undefined ? prospect.company : input.company?.trim() || null,
      source: input.source === undefined ? prospect.source : input.source?.trim() || null,
    };
  }),
});

/**
 * Supprime un prospect ainsi que son historique. Les factures déjà émises,
 * elles, restent : elles portent du chiffre d'affaires réel et sont seulement
 * détachées du prospect.
 */
export const deleteProspect = (data: FinanceData, prospectId: string): FinanceData => ({
  ...data,
  prospects: data.prospects.filter((prospect) => prospect.id !== prospectId),
  interactions: data.interactions.filter((interaction) => interaction.prospectId !== prospectId),
  invoices: data.invoices.map((invoice) => (invoice.prospectId === prospectId ? { ...invoice, prospectId: null } : invoice)),
});

/**
 * Enregistre un contact. La relance suivante est repositionnée dans la foulée :
 * c'est le moment où l'on sait quand revenir, et le seul où on y pense.
 */
export const logInteraction = (
  data: FinanceData,
  input: {
    prospectId: string;
    date: string;
    channel: InteractionChannel;
    note?: string;
    nextFollowUpDate?: string | null;
    temperature?: ProspectTemperature;
    status?: ProspectStatus;
  },
): FinanceData => {
  const prospect = data.prospects.find((item) => item.id === input.prospectId);
  if (!prospect) return data;

  const interaction: Interaction = {
    id: createId('interaction'),
    prospectId: input.prospectId,
    date: input.date,
    channel: input.channel,
    note: input.note?.trim() ?? '',
  };

  const withInteraction = { ...data, interactions: [interaction, ...data.interactions] };
  const prospectChanges = {
    ...(input.nextFollowUpDate === undefined ? {} : { nextFollowUpDate: input.nextFollowUpDate }),
    ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
    ...(input.status === undefined ? {} : { status: input.status }),
  };

  return Object.keys(prospectChanges).length === 0
    ? withInteraction
    : updateProspect(withInteraction, input.prospectId, prospectChanges);
};

export const deleteInteraction = (data: FinanceData, interactionId: string): FinanceData => ({
  ...data,
  interactions: data.interactions.filter((interaction) => interaction.id !== interactionId),
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
