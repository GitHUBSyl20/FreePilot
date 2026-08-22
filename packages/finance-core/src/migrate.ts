import type { AppSettings, EditableInvoice, FinanceData, Opportunity, Prospect, Task } from './types';
import { FINANCE_DATA_VERSION } from './types';
import { todayISO } from './crm/day';
import { defaultSettings } from './dashboardMock';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

const createMigrationId = (prefix: string): string =>
  `${prefix}-migration-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Collections indispensables : leur absence signale un fichier tronqué. */
const requiredCollections = ['accounts', 'invoices', 'transactions'] as const;

/**
 * Collections apparues après la v1 : une sauvegarde plus ancienne n'en a pas,
 * on les initialise à vide plutôt que d'inventer des valeurs.
 */
const optionalCollections = [
  'recurringCharges',
  'areMonths',
  'prospects',
  'interactions',
  'opportunities',
  'stageChanges',
  'tasks',
] as const;

/**
 * Reprise de l'existant à la migration v4 → v5.
 *
 * Chaque prospect déjà `signed` devient une `Opportunity` `won`, avec le CA
 * réellement encaissé sur ses factures — jamais un montant inventé. Le
 * pipeline et le stade d'origine n'existent pas dans les données d'avant : ils
 * sont posés à titre technique et explicitement signalés « à vérifier » dans
 * `originEvent`, plutôt que présentés comme une donnée fiable.
 *
 * Chaque prospect encore `active` avec une relance déjà planifiée devient une
 * `Task` générique, elle aussi marquée comme issue de la migration.
 */
const backfillOpportunitiesAndTasks = (
  prospects: Prospect[],
  invoices: EditableInvoice[],
): { opportunities: Opportunity[]; tasks: Task[] } => {
  const today = todayISO();
  const opportunities: Opportunity[] = [];
  const tasks: Task[] = [];

  for (const prospect of prospects) {
    if (prospect.status === 'signed') {
      const paidInvoices = invoices
        .filter((invoice) => invoice.prospectId === prospect.id && invoice.status === 'paid')
        .sort((left, right) => (left.paymentDate ?? '').localeCompare(right.paymentDate ?? ''));
      const amount = paidInvoices.reduce((total, invoice) => total + invoice.totalTTC, 0);
      const lastPaymentDate = paidInvoices.at(-1)?.paymentDate ?? null;

      opportunities.push({
        id: createMigrationId('opportunity'),
        prospectId: prospect.id,
        title: `${prospect.name} — repris de la migration`,
        pipeline: 'projet',
        stageId: 'negotiation',
        amount,
        recurring: false,
        monthlyAmount: null,
        probability: 100,
        probabilityOverride: true,
        expectedCloseDate: null,
        originEvent: 'Migration v4 → v5 : pipeline et stade à vérifier manuellement',
        referrerProspectId: null,
        funding: null,
        status: 'won',
        lossReason: null,
        statusDate: lastPaymentDate ?? today,
        createdAt: today,
      });
    }

    if (prospect.status === 'active' && prospect.nextFollowUpDate) {
      tasks.push({
        id: createMigrationId('task'),
        prospectId: prospect.id,
        opportunityId: null,
        label: '[Migration] Reprendre le contact',
        dueDate: prospect.nextFollowUpDate,
        priority: 'normal',
        status: 'open',
        completedAt: null,
        createdAt: today,
      });
    }
  }

  return { opportunities, tasks };
};

/**
 * Amène un jeu de données à la version courante.
 *
 * v1 → v2 : charges récurrentes et ARE mensuelle.
 * v2 → v3 : prospects et historique des contacts.
 * v3 → v4 : les charges fixes engendrent leurs opérations.
 * v4 → v5 : opportunités, tâches et journal des changements de stade. Un
 *   document qui n'a jamais connu `opportunities` reçoit une reprise de
 *   l'existant ; un document qui l'a déjà (même vide) n'est pas retouché,
 *   sinon chaque synchronisation cloud regénérerait des doublons.
 */
export const migrateFinanceData = (candidate: unknown): FinanceData => {
  if (!isRecord(candidate)) throw new Error('Données illisibles.');

  const version = candidate.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1 || version > FINANCE_DATA_VERSION) {
    throw new Error(
      `Version de données non supportée (attendu 1 à ${FINANCE_DATA_VERSION}, reçu ${String(version)}).`,
    );
  }
  if (!isRecord(candidate.settings)) throw new Error('Fichier incomplet : réglages manquants.');

  for (const key of requiredCollections) {
    if (!Array.isArray(candidate[key])) throw new Error(`Fichier incomplet : "${key}" manquant ou invalide.`);
  }

  const prospects = asArray<Prospect>(candidate.prospects);
  const isPreV5 = !Array.isArray(candidate.opportunities);
  const backfill = isPreV5
    ? backfillOpportunitiesAndTasks(prospects, asArray<EditableInvoice>(candidate.invoices))
    : null;

  return {
    ...(candidate as unknown as FinanceData),
    version: FINANCE_DATA_VERSION,
    // Les réglages absents prennent leur valeur par défaut : un réglage ajouté
    // après coup ne doit pas rendre illisible une sauvegarde plus ancienne.
    settings: { ...defaultSettings, ...(candidate.settings as Partial<AppSettings>) },
    recurringCharges: asArray(candidate.recurringCharges),
    areMonths: asArray(candidate.areMonths),
    prospects,
    interactions: asArray(candidate.interactions),
    opportunities: backfill ? backfill.opportunities : asArray<Opportunity>(candidate.opportunities),
    stageChanges: asArray(candidate.stageChanges),
    tasks: backfill ? backfill.tasks : asArray<Task>(candidate.tasks),
    // Volontairement laissé à null pour une sauvegarde antérieure : la
    // génération s'amorcera sur le mois courant, sans remonter le passé que
    // les soldes d'ouverture ont déjà absorbé.
    recurringChargeAutoPostFrom:
      typeof candidate.recurringChargeAutoPostFrom === 'string' ? candidate.recurringChargeAutoPostFrom : null,
  };
};

/**
 * Une normalisation est nécessaire dès qu'il manque quelque chose, pas
 * seulement quand la version diffère.
 *
 * Un réglage ajouté sans changement de version laisserait sinon les
 * sauvegardes existantes avec un champ `undefined`, qui ressort en NaN à
 * l'affichage. On compare donc aussi les clés de réglages et les collections.
 */
export const needsMigration = (candidate: unknown): boolean => {
  if (!isRecord(candidate)) return false;
  if (candidate.version !== FINANCE_DATA_VERSION) return true;
  if (optionalCollections.some((key) => !Array.isArray(candidate[key]))) return true;
  // `null` est une valeur valide ici : seule l'absence de la clé compte.
  if (!('recurringChargeAutoPostFrom' in candidate)) return true;

  const settings = candidate.settings;
  if (!isRecord(settings)) return true;

  return Object.keys(defaultSettings).some((key) => settings[key] === undefined);
};
