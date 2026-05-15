export type CalculationDetail = {
  value: number;
  formula: string;
  assumptions: string[];
  warnings: string[];
};

export type AppSettings = {
  areDailyAmount: number;
  theoreticalMonthlyDays: number;
  remainingAREDays: number;
  bncAbatementRate: number;
  franceTravailDeductionRate: number;
  urssafSocialContributionRate: number;
  professionalTrainingContributionRate: number;
  totalUrssafProvisionRate: number;
  prudentIncomeTaxProvisionRate: number;
  versementLiberatoireEnabled: boolean;
  versementLiberatoireRateBNC: number;
};

export type NetAvailableInput = {
  monthlyCollectedRevenue: number;
  estimatedARE: number;
  professionalExpenses: number;
  personalTransfersAlreadyMade: number;
};

export type InvoiceRecord = {
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  totalTTC: number;
  paymentDate: string | null;
};

export type MonthlySnapshotInput = {
  month: string;
  invoices: InvoiceRecord[];
  professionalExpenses: number;
  personalTransfersAlreadyMade: number;
};

export type AccountKind = 'professional' | 'personal' | 'provision' | 'savings';

export type Account = {
  id: string;
  name: string;
  kind: AccountKind;
  openingBalance: number;
};

export type EditableInvoice = InvoiceRecord & {
  id: string;
  clientName: string;
  issueDate: string;
  dueDate: string | null;
  paymentAccountId: string | null;
};

export type TransactionKind = 'income' | 'expense' | 'transfer' | 'provision';

export type Transaction = {
  id: string;
  kind: TransactionKind;
  label: string;
  amount: number;
  date: string;
  fromAccountId: string | null;
  toAccountId: string | null;
  invoiceId?: string;
};

export type FinanceData = {
  version: 1;
  settings: AppSettings;
  accounts: Account[];
  invoices: EditableInvoice[];
  transactions: Transaction[];
};

export type AccountBalance = Account & {
  balance: number;
};

export type DashboardProjection = {
  month: string;
  kpis: {
    caEncaisse: number;
    facturesImpayees: number;
    areEstimeeM1: number;
    netDisponible: number;
    seuilCoupureARE: number;
  };
  formulas: {
    are: string;
    net: string;
  };
  accountBalances: AccountBalance[];
  recentTransactions: Transaction[];
};

export type FinanceStore = {
  load: () => Promise<FinanceData | null>;
  save: (data: FinanceData) => Promise<void>;
  clear: () => Promise<void>;
};
