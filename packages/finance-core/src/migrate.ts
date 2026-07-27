import type { AppSettings, FinanceData } from './types';
import { FINANCE_DATA_VERSION } from './types';
import { defaultSettings } from './dashboardMock';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

/**
 * Amène un jeu de données à la version courante.
 *
 * La v1 ne connaissait ni les charges récurrentes ni l'ARE mensuelle : on les
 * initialise à vide plutôt que d'inventer des valeurs, pour ne jamais afficher
 * un chiffre que l'utilisateur n'a pas saisi.
 */
export const migrateFinanceData = (candidate: unknown): FinanceData => {
  if (!isRecord(candidate)) throw new Error('Données illisibles.');

  const version = candidate.version;
  if (version !== 1 && version !== FINANCE_DATA_VERSION) {
    throw new Error(`Version de données non supportée (attendu 1 ou ${FINANCE_DATA_VERSION}, reçu ${String(version)}).`);
  }
  if (!isRecord(candidate.settings)) throw new Error('Fichier incomplet : réglages manquants.');

  for (const key of ['accounts', 'invoices', 'transactions'] as const) {
    if (!Array.isArray(candidate[key])) throw new Error(`Fichier incomplet : "${key}" manquant ou invalide.`);
  }

  return {
    ...(candidate as unknown as FinanceData),
    version: FINANCE_DATA_VERSION,
    // Les réglages absents prennent leur valeur par défaut : un réglage ajouté
    // après coup ne doit pas rendre illisible une sauvegarde plus ancienne.
    settings: { ...defaultSettings, ...(candidate.settings as Partial<AppSettings>) },
    recurringCharges: asArray(candidate.recurringCharges),
    areMonths: asArray(candidate.areMonths),
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
  if (!Array.isArray(candidate.recurringCharges) || !Array.isArray(candidate.areMonths)) return true;

  const settings = candidate.settings;
  if (!isRecord(settings)) return true;

  return Object.keys(defaultSettings).some((key) => settings[key] === undefined);
};
