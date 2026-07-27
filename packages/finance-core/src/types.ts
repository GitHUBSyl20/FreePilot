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
  /** CA mensuel couvrant les charges fixes : le plancher à tenir. */
  monthlyRevenueSafetyThreshold: number;
  /** CA mensuel visé pour ne plus dépendre de l'ARE. */
  monthlyRevenueTakeoffThreshold: number;
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

/** Rattachement d'une charge : elle pèse sur le compte pro ou sur le perso. */
export type ChargeScope = 'professional' | 'personal';

/**
 * Charge fixe qui retombe chaque mois (loyer, abonnements, assurances).
 *
 * En micro-BNC ces charges ne réduisent ni l'Urssaf ni l'impôt : l'abattement
 * forfaitaire les remplace. Elles n'entrent donc que dans la trésorerie.
 */
export type RecurringCharge = {
  id: string;
  label: string;
  /** Montant mensuel, positif. */
  amount: number;
  scope: ChargeScope;
  /** Jour de prélèvement, quand il est connu. */
  dayOfMonth: number | null;
  active: boolean;
};

/** ARE d'un mois donné, telle que notifiée puis telle que versée. */
export type MonthlyAREEntry = {
  month: string;
  /** ARE pleine notifiée par France Travail, avant déduction. */
  fullMonthlyARE: number;
  /** ARE effectivement versée, renseignée après coup. */
  actualARE: number | null;
};

export const FINANCE_DATA_VERSION = 2;

export type FinanceData = {
  version: typeof FINANCE_DATA_VERSION;
  settings: AppSettings;
  accounts: Account[];
  invoices: EditableInvoice[];
  transactions: Transaction[];
  recurringCharges: RecurringCharge[];
  areMonths: MonthlyAREEntry[];
};

export type AccountBalance = Account & {
  balance: number;
};

export type RecurringChargeTotals = {
  professional: number;
  personal: number;
  total: number;
};

/** Vue consolidée d'un mois : trésorerie, charges et reste à vivre. */
export type MonthlyOutlook = {
  month: string;
  cashflow: MonthlyCashflow;
  recurringCharges: RecurringChargeTotals;
  /** Dépenses ponctuelles saisies sur le mois, hors charges fixes. */
  variableExpenses: number;
  /** Ce qui reste une fois l'impôt provisionné et toutes les charges payées. */
  resteAVivre: CalculationDetail;
  /** CA à partir duquel l'ARE du mois suivant tombe à zéro. */
  areCutoff: CalculationDetail;
  /** ARE théorique du mois suivant, compte tenu du CA encaissé ce mois-ci. */
  nextMonthARE: number;
};

export type DashboardProjection = {
  month: string;
  kpis: {
    caEncaisse: number;
    facturesImpayees: number;
    areDuMois: number;
    areEstimeeM1: number;
    netFinal: number;
    chargesFixes: number;
    resteAVivre: number;
    seuilCoupureARE: number;
    joursAreRestants: number;
  };
  formulas: {
    are: string;
    resteAVivre: string;
  };
  outlook: MonthlyOutlook;
  accountBalances: AccountBalance[];
  recentTransactions: Transaction[];
};

export type FinanceStore = {
  load: () => Promise<FinanceData | null>;
  save: (data: FinanceData) => Promise<void>;
  clear: () => Promise<void>;
};
