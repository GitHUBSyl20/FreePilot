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

/** Données saisies pour un mois donné, en entrée du calcul de trésorerie. */
export type MonthlyRecord = {
  month: string;
  /** CA réellement encaissé sur le mois. */
  collectedRevenue: number;
  /**
   * ARE mensuelle pleine annoncée par France Travail, avant déduction liée
   * à l'activité. Saisie par mois : elle est révisée dans le temps
   * (1 476 € puis 1 416 € sur l'historique de référence).
   */
  fullMonthlyARE: number;
  /** ARE effectivement versée, quand elle est connue. */
  actualARE?: number | null;
};

/** Résultat du calcul pour un mois, avec le décalage M / M+1. */
export type MonthlyCashflow = {
  month: string;
  collectedRevenue: number;
  /** Déduction générée par le CA de ce mois, imputée sur l'ARE du mois suivant. */
  areDeduction: CalculationDetail;
  /** Déduction héritée du mois précédent, imputée sur l'ARE de ce mois. */
  carriedDeduction: number;
  /** ARE théorique du mois = ARE pleine − déduction du mois précédent. */
  theoreticalARE: CalculationDetail;
  actualARE: number | null;
  /** ARE retenue pour la trésorerie : la réelle si connue, sinon la théorique. */
  effectiveARE: number;
  /** Jours de droits consommés, décomptés sur l'ARE effective. */
  areDaysConsumed: number;
  areDaysPreserved: number;
  urssafProvision: CalculationDetail;
  /** Mois de paiement effectif de l'Urssaf due sur le CA de ce mois. */
  urssafPaymentMonth: string;
  incomeTaxProvision: CalculationDetail;
  /** Trésorerie du mois : CA − Urssaf + ARE effective. */
  netFinal: CalculationDetail;
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
