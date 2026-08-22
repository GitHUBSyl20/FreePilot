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
  /**
   * Délais au-delà desquels un prospect sans relance planifiée remonte comme
   * à relancer, par température. Un contact chaud se refroidit vite, un contact
   * froid n'a pas besoin d'être sollicité toutes les semaines.
   */
  hotProspectFollowUpDays: number;
  warmProspectFollowUpDays: number;
  coldProspectFollowUpDays: number;
  /**
   * Jours sans interaction sur le prospect au-delà desquels une opportunité
   * ouverte est marquée dormante. Le pipeline partenariat suit son propre
   * rythme : voir `dormantPartnershipDays`.
   */
  dormantOpportunityDays: number;
  dormantPartnershipDays: number;
  /**
   * Probabilité par stade, modifiable dans les réglages plutôt que codée en
   * dur (AGENTS.md). Clé composite `${pipeline}:${stageId}` — voir
   * `stageProbabilityKey` dans `crm/pipelines.ts` — car un même identifiant de
   * stade (ex. « proposal ») porte des probabilités différentes selon le
   * pipeline.
   */
  stageProbabilities: Record<string, number>;
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
  /** Prospect du CRM à l'origine de la facture, quand le lien est fait. */
  prospectId?: string | null;
  /** Opportunité passée au réel à la facturation, quand le lien est fait. */
  opportunityId?: string | null;
};

/**
 * `income` est réservé aux encaissements de factures : c'est le chiffre
 * d'affaires. `otherIncome` couvre l'argent qui entre sans être du CA
 * (remboursement d'impôts, aide, remboursement de frais) : il ne génère ni
 * Urssaf, ni impôt, ni déduction ARE, mais il compte dans le reste à vivre.
 */
export type TransactionKind = 'income' | 'otherIncome' | 'expense' | 'transfer' | 'provision';

export type Transaction = {
  id: string;
  kind: TransactionKind;
  label: string;
  amount: number;
  date: string;
  fromAccountId: string | null;
  toAccountId: string | null;
  invoiceId?: string;
  /**
   * Charge fixe à l'origine de l'opération, quand elle a été générée
   * automatiquement à la date de prélèvement. Sert à ne pas la regénérer, et
   * surtout à ne pas la compter une seconde fois en dépense ponctuelle.
   */
  recurringChargeId?: string;
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
  /**
   * Compte réellement débité.
   *
   * `scope` dit la nature de la charge ; il ne dit pas d'où part l'argent. Un
   * abonnement professionnel prélevé sur le compte personnel est le cas
   * courant chez un auto-entrepreneur qui n'a qu'une seule carte. Confondre
   * les deux ferait mentir les soldes. Absent, le compte se déduit du
   * rattachement, ce qui préserve le comportement des données existantes.
   */
  paymentAccountId?: string | null;
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

/**
 * Température du prospect, reprise du suivi de prospection : elle dit à quelle
 * fréquence il faut revenir vers lui, pas où il en est du cycle de vente.
 */
export type ProspectTemperature = 'hot' | 'warm' | 'cold';

/** Issue de la relation : tant qu'elle est ouverte, le prospect est relancé. */
export type ProspectStatus = 'active' | 'signed' | 'lost';

/** Canal par lequel le contact a eu lieu. */
export type InteractionChannel = 'email' | 'phone' | 'linkedin' | 'whatsapp' | 'meeting' | 'event' | 'other';

export type Prospect = {
  id: string;
  name: string;
  company: string | null;
  /** D'où vient le contact : réseau, événement, prospection directe. */
  source: string | null;
  temperature: ProspectTemperature;
  status: ProspectStatus;
  /**
   * Relance décidée à la main. Quand elle est absente, le délai lié à la
   * température prend le relais : aucun prospect ne tombe dans l'oubli.
   */
  nextFollowUpDate: string | null;
  notes: string;
  createdAt: string;
  /**
   * Prospect qui apporte des affaires plutôt qu'il n'en signe : un client
   * satisfait, un confrère, un contact réseau. Piloté sur le pipeline
   * `partenariat` et suivi séparément dans `ChannelsView`.
   */
  estPrescripteur: boolean;
};

/** Un contact réellement passé, à conserver sans limite de nombre. */
export type Interaction = {
  id: string;
  prospectId: string;
  date: string;
  channel: InteractionChannel;
  note: string;
};

/**
 * Trois cycles de vente distincts, avec des stades qui ne se recouvrent pas.
 * Voir `crm/pipelines.ts` pour le détail des stades et leurs critères de
 * sortie.
 */
export type PipelineKind = 'formation' | 'projet' | 'partenariat';

export type OpportunityStatus = 'open' | 'won' | 'lost' | 'abandoned';

export type LossReason =
  | 'price'
  | 'noBudget'
  | 'timing'
  | 'needUnconfirmed'
  | 'competitor'
  | 'notDecisionMaker'
  | 'noAnswer'
  | 'outOfScope';

/**
 * Une affaire : un montant, un pipeline, un stade, une probabilité. Un
 * prospect (la relation) peut porter plusieurs opportunités simultanées —
 * c'est le cas central, pas le cas limite.
 */
export type Opportunity = {
  id: string;
  prospectId: string;
  title: string;
  pipeline: PipelineKind;
  stageId: string;
  /** Montant HT de l'affaire. Zéro sur le pipeline partenariat. */
  amount: number;
  /** Prestation récurrente : alimente le MRR prévisionnel à partir du gain. */
  recurring: boolean;
  monthlyAmount: number | null;
  /**
   * Probabilité retenue. Héritée du stade par défaut ; une saisie manuelle la
   * fige via `probabilityOverride`, sinon un changement de stade écraserait
   * un jugement humain.
   */
  probability: number;
  probabilityOverride: boolean;
  expectedCloseDate: string | null;
  /** Événement précis d'origine : « Petit déj CPME 12/03 ». */
  originEvent: string | null;
  /** Prospect prescripteur à l'origine de l'affaire, quand il y en a un. */
  referrerProspectId: string | null;
  /** Formation uniquement : le mode de financement change le délai. */
  funding: 'direct' | 'opco' | 'mixed' | null;
  status: OpportunityStatus;
  lossReason: LossReason | null;
  statusDate: string | null;
  createdAt: string;
};

/** Changement de stade journalisé à l'écriture, jamais reconstruit après coup. */
export type StageChange = {
  id: string;
  opportunityId: string;
  fromStageId: string | null;
  toStageId: string;
  date: string;
  daysInPreviousStage: number | null;
};

export type TaskStatus = 'open' | 'done' | 'cancelled';

export type Task = {
  id: string;
  prospectId: string;
  opportunityId: string | null;
  /** Ce qu'il faut faire, en clair. Une date sans libellé ne sert à rien. */
  label: string;
  dueDate: string;
  priority: 'high' | 'normal' | 'low';
  status: TaskStatus;
  completedAt: string | null;
  createdAt: string;
};

export const FINANCE_DATA_VERSION = 5;

export type FinanceData = {
  version: typeof FINANCE_DATA_VERSION;
  settings: AppSettings;
  accounts: Account[];
  invoices: EditableInvoice[];
  transactions: Transaction[];
  recurringCharges: RecurringCharge[];
  areMonths: MonthlyAREEntry[];
  prospects: Prospect[];
  interactions: Interaction[];
  opportunities: Opportunity[];
  stageChanges: StageChange[];
  tasks: Task[];
  /**
   * Premier mois pour lequel les charges fixes ont engendré leurs opérations.
   *
   * Sans ce repère, activer la génération créerait d'un coup toutes les
   * échéances depuis le début de l'historique, alors que les soldes
   * d'ouverture les absorbent déjà : la trésorerie passée serait comptée
   * deux fois. `null` signifie que la génération n'a pas encore démarré ;
   * elle s'amorce alors sur le mois courant, jamais avant.
   */
  recurringChargeAutoPostFrom: string | null;
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
  /** Encaissements du mois qui ne sont pas du chiffre d'affaires. */
  otherIncome: number;
  /** Ce qui reste une fois l'impôt provisionné et toutes les charges payées. */
  resteAVivre: CalculationDetail;
  /** CA à partir duquel l'ARE du mois suivant tombe à zéro. */
  areCutoff: CalculationDetail;
  /**
   * ARE théorique du mois suivant, compte tenu du CA encaissé ce mois-ci, ou
   * `null` tant que son ARE pleine n'est pas saisie. La distinction compte :
   * une ARE pleine absente vaut zéro dans le calcul, et un zéro affiché comme
   * un montant se lit comme un mois sans allocation.
   */
  nextMonthARE: number | null;
};

export type DashboardProjection = {
  month: string;
  kpis: {
    caEncaisse: number;
    facturesImpayees: number;
    areDuMois: number;
    /** `null` tant que l'ARE pleine du mois suivant n'est pas renseignée. */
    areEstimeeM1: number | null;
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

/** Degré d'urgence d'une relance, une fois la date d'échéance connue. */
export type FollowUpUrgency = 'overdue' | 'today' | 'upcoming';

/** CA rattaché à un prospect, encaissé et encore attendu. */
export type ProspectRevenue = {
  collected: number;
  pending: number;
};

/** Un prospect vu sous l'angle de la relance : quand, et depuis combien de temps. */
export type ProspectFollowUp = {
  prospect: Prospect;
  lastInteraction: Interaction | null;
  interactionCount: number;
  /** Jours écoulés depuis le dernier contact, null si aucun contact enregistré. */
  daysSinceLastContact: number | null;
  /** Échéance retenue : la date planifiée, sinon celle déduite de la température. */
  dueDate: string | null;
  /** Vrai quand l'échéance vient du délai automatique et non d'une saisie. */
  inferred: boolean;
  urgency: FollowUpUrgency | null;
  /** Négatif quand l'échéance est passée. */
  daysUntilDue: number | null;
  revenue: ProspectRevenue;
};

/** Vue d'ensemble du portefeuille, pour l'accueil du CRM. */
export type CrmSummary = {
  total: number;
  active: number;
  signed: number;
  lost: number;
  byTemperature: Record<ProspectTemperature, number>;
  overdue: number;
  dueToday: number;
  /** Prospects ouverts sans aucun contact enregistré. */
  neverContacted: number;
  signedCollectedRevenue: number;
  pendingRevenue: number;
};

export type FinanceStore = {
  load: () => Promise<FinanceData | null>;
  save: (data: FinanceData) => Promise<void>;
  clear: () => Promise<void>;
};

/**
 * En-tête du document distant : de quoi décider quoi faire sans télécharger
 * le document entier, ce qui compte sur un forfait mobile.
 */
export type RemoteDocumentHeader = {
  /** Incrémentée à chaque écriture distante : c'est l'arbitre des conflits. */
  revision: number;
  /** Version de schéma avec laquelle l'appareil émetteur a écrit. */
  schemaVersion: number;
  updatedAt: string;
};

export type RemoteDocument = RemoteDocumentHeader & {
  data: FinanceData;
};

/**
 * Ce que cet appareil sait du dernier échange réussi.
 *
 * Ces informations vivent à côté des données et jamais dedans : elles
 * décrivent un appareil, pas un patrimoine. Rangées dans `FinanceData`, elles
 * voyageraient dans les exports et feraient croire à un autre appareil qu'il
 * est déjà synchronisé.
 */
export type SyncMeta = {
  /** Révision distante alignée avec le contenu local, null avant tout échange. */
  revision: number | null;
  /** Empreinte des données locales au moment de cet échange. */
  fingerprint: string | null;
  syncedAt: string | null;
};

/**
 * Ce qu'il faut faire au prochain échange.
 *
 * `blocked` signale un document distant écrit par une version plus récente de
 * FreePilot : le lire ferait perdre les champs que cette version ignore, et le
 * réécrire les effacerait pour de bon. On préfère ne rien faire et le dire.
 */
export type SyncDecision = 'up-to-date' | 'push' | 'pull' | 'conflict' | 'blocked';
