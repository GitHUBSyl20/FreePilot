import type { FinanceData, InteractionChannel, PipelineKind, ProspectTemperature } from '../types';
import { addProspect, deleteProspect, logInteraction } from '../operations';
import { addDays, todayISO } from './day';
import { addOpportunity } from './opportunities';
import { addTask } from './tasks';

const pad = (value: number): string => String(value).padStart(2, '0');

// --- Dates -------------------------------------------------------------

/**
 * Numéros de série Excel, base 1899-12-30 (la fameuse « année bissextile
 * 1900 » fictive d'Excel, déjà absorbée par cette base plutôt qu'à corriger
 * ici). Contrôlé sur trois repères connus : 46079 → 26/02/2026,
 * 46098 → 17/03/2026, 46136 → 24/04/2026 (voir prospectImport.test.ts).
 */
const EXCEL_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 86_400_000;
const MIN_IMPORT_YEAR = 2024;
const MAX_IMPORT_YEAR = 2027;

const isPlausibleYear = (year: number): boolean => year >= MIN_IMPORT_YEAR && year <= MAX_IMPORT_YEAR;

const excelSerialToISODate = (serial: number): string | null => {
  if (!Number.isFinite(serial)) return null;

  const date = new Date(EXCEL_EPOCH_UTC_MS + Math.round(serial) * MS_PER_DAY);
  const year = date.getUTCFullYear();
  if (!isPlausibleYear(year)) return null;

  return `${year}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
};

const FRENCH_MONTHS: Record<string, number> = {
  janvier: 1,
  fevrier: 2,
  février: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  aout: 8,
  août: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  decembre: 12,
  décembre: 12,
};

const findFrenchMonth = (text: string): number | null => {
  const normalized = text.toLowerCase();
  for (const [name, month] of Object.entries(FRENCH_MONTHS)) {
    if (normalized.includes(name)) return month;
  }
  return null;
};

export type ParsedDate = { date: string | null; warning: string | null };

/**
 * Une cellule de date de la feuille Prospection : un numéro de série Excel
 * le plus souvent, parfois une date déjà mise en forme, parfois un texte
 * approximatif (« février », « Juin », « Mi-Mars ») converti au premier jour
 * du mois et signalé plutôt que deviné en silence.
 */
export const parseDateCell = (value: string, assumedYear: number): ParsedDate => {
  const trimmed = value.trim();
  if (!trimmed) return { date: null, warning: null };

  if (/^\d+([.,]\d+)?$/.test(trimmed)) {
    const serial = Number(trimmed.replace(',', '.'));
    const date = excelSerialToISODate(serial);
    return date
      ? { date, warning: null }
      : { date: null, warning: `Date hors de la plage ${MIN_IMPORT_YEAR}-${MAX_IMPORT_YEAR} (numéro de série ${trimmed}).` };
  }

  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    if (!isPlausibleYear(Number(year))) {
      return { date: null, warning: `Date hors de la plage ${MIN_IMPORT_YEAR}-${MAX_IMPORT_YEAR} (${trimmed}).` };
    }
    return { date: `${year}-${pad(Number(month))}-${pad(Number(day))}`, warning: null };
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, year] = isoMatch;
    if (!isPlausibleYear(Number(year))) {
      return { date: null, warning: `Date hors de la plage ${MIN_IMPORT_YEAR}-${MAX_IMPORT_YEAR} (${trimmed}).` };
    }
    return { date: trimmed, warning: null };
  }

  const month = findFrenchMonth(trimmed);
  if (month) {
    return {
      date: `${assumedYear}-${pad(month)}-01`,
      warning: `Date textuelle approximative convertie au 1er du mois : « ${trimmed} ».`,
    };
  }

  return { date: null, warning: `Date non reconnue : « ${trimmed} ».` };
};

// --- CSV -----------------------------------------------------------------

const detectDelimiter = (text: string): ',' | ';' => {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  return semicolons > commas ? ';' : ',';
};

/**
 * Tokenise le CSV caractère par caractère plutôt que ligne par ligne : une
 * remarque collée depuis Excel peut contenir des sauts de ligne à l'intérieur
 * de guillemets, qu'un simple `split('\n')` couperait à tort.
 */
const parseCsvTable = (text: string, delimiter: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\r') {
      // ignoré : normalise CRLF sans dupliquer la fin de ligne.
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
};

const stripDiacritics = (value: string): string => value.normalize('NFD').replace(/\p{Diacritic}/gu, '');
const normalizeHeader = (value: string): string => stripDiacritics(value).trim().toLowerCase();

// --- Mapping (§9) ----------------------------------------------------------

const mapTemperature = (value: string): ProspectTemperature => {
  const normalized = stripDiacritics(value).toLowerCase();
  if (normalized.includes('chaud')) return 'hot';
  if (normalized.includes('tiede')) return 'warm'; // couvre « Tiède » et « Tiède à réchauffer »
  return 'cold'; // « Froid », « Curieux », et toute valeur non reconnue
};

/** Deuxième usage de la même colonne Température : une proposition de stade, toujours modifiable. */
const mapTemperatureToStage = (value: string): string => {
  const normalized = stripDiacritics(value).toLowerCase();
  if (normalized.includes('chaud')) return 'qualified';
  if (normalized.includes('curieux') || normalized.includes('tiede')) return 'contacted';
  return 'identified';
};

const mapChannel = (value: string): InteractionChannel => {
  const normalized = stripDiacritics(value).toLowerCase();
  if (normalized.includes('mail')) return 'email';
  if (normalized.includes('whatsapp')) return 'whatsapp';
  return 'other';
};

type NatureMapping = { pipeline: PipelineKind; pipelineUncertain: boolean; estPrescripteur: boolean };

/**
 * « À trancher ligne par ligne » (§9) : seule la valeur « Collaboration » est
 * sans ambiguïté. Le reste reçoit une proposition — jamais silencieuse,
 * `pipelineUncertain` le signale en prévisualisation dès qu'aucun mot-clé net
 * n'a été trouvé.
 */
const mapNatureToPipeline = (value: string): NatureMapping => {
  const normalized = stripDiacritics(value).toLowerCase();
  if (normalized.includes('collaboration')) return { pipeline: 'partenariat', pipelineUncertain: false, estPrescripteur: true };
  if (normalized.includes('formation')) return { pipeline: 'formation', pipelineUncertain: false, estPrescripteur: false };
  if (normalized.includes('projet')) return { pipeline: 'projet', pipelineUncertain: false, estPrescripteur: false };
  return { pipeline: 'projet', pipelineUncertain: true, estPrescripteur: false };
};

/**
 * Une cellule Entreprise qui décrit une activité plutôt qu'une raison
 * sociale (§9 : « Courtage assurance, prêt, rachat crédit », « Société
 * nettoyage ») — heuristique volontairement simple, jamais corrigée toute
 * seule : seulement signalée pour saisie manuelle.
 */
const ACTIVITY_PREFIXES = ['societe', 'cabinet', 'entreprise', 'activite', 'artisan', 'courtage', 'auto-entrepreneur', 'micro-entreprise'];

export const looksLikeActivityDescription = (company: string): boolean => {
  const normalized = stripDiacritics(company).trim().toLowerCase();
  if (normalized.includes(',')) return true;
  return ACTIVITY_PREFIXES.some((prefix) => normalized.startsWith(prefix));
};

const ACTION_KEYWORDS = ['relancer', 'recontact', 'rendez-vous', 'rendez vous', 'rappeler', 'a revoir', 'suivre', 'relance'];

/**
 * Extrait une action des remarques (§9 : « relancer sur axe formation »,
 * « me recontactera », « rendez-vous fixé 30 mars »). Une date écrite en
 * toutes lettres dans la remarque est reprise si elle est trouvée, sinon
 * l'échéance retombe à J+7 du dernier contact connu. Ne crée jamais la
 * tâche elle-même — seulement une proposition pour la prévisualisation.
 */
export const suggestTaskFromRemark = (
  remark: string,
  assumedYear: number,
  fallbackFromDate: string,
): { label: string; dueDate: string } | null => {
  const normalized = stripDiacritics(remark).toLowerCase();
  if (!ACTION_KEYWORDS.some((keyword) => normalized.includes(keyword))) return null;

  const dayMonthMatch = remark.match(/(\d{1,2})\s+([a-zéûôA-ZÉÛÔ]+)/);
  const month = dayMonthMatch ? findFrenchMonth(dayMonthMatch[2]) : null;
  const day = dayMonthMatch ? Number(dayMonthMatch[1]) : null;
  const extractedDate = month && day && day >= 1 && day <= 31 ? `${assumedYear}-${pad(month)}-${pad(day)}` : null;

  return { label: remark.trim(), dueDate: extractedDate ?? addDays(fallbackFromDate, 7) };
};

// --- Ligne prévisualisée -----------------------------------------------

export type ParsedProspectionRow = {
  rowNumber: number;
  name: string;
  company: string | null;
  companyLooksLikeActivity: boolean;
  source: string | null;
  temperature: ProspectTemperature;
  pipeline: PipelineKind;
  pipelineUncertain: boolean;
  estPrescripteur: boolean;
  stageId: string;
  originEvent: string | null;
  /** Signatures = Oui : ne passe jamais l'affaire à `won` toute seule, voir R3 (§9). */
  signaled: boolean;
  interactions: { date: string | null; warning: string | null; channel: InteractionChannel; note: string }[];
  suggestedTask: { label: string; dueDate: string } | null;
  errors: string[];
};

const REQUIRED_HEADERS = ['Nom', 'Entreprise', 'Nature', 'Température', 'Source contact', 'Date prise contact', 'Modalité', 'Date contact 2', 'Remarques', 'Signatures'] as const;

/**
 * Parseur pur de la feuille « Prospection » exportée en CSV — aucune
 * dépendance de lecture xlsx (§9) : l'utilisateur colle le texte, le
 * parseur fait le reste. `assumedYear` sert aux dates textuelles
 * approximatives, sans année propre ; par défaut l'année en cours.
 */
export const parseProspectionCsv = (csvText: string, options: { assumedYear?: number } = {}): ParsedProspectionRow[] => {
  const assumedYear = options.assumedYear ?? Number(todayISO().slice(0, 4));
  // ﻿ : BOM laissé par Excel en tête d'un export CSV UTF-8.
  const withoutBom = csvText.replace(/^﻿/, '');
  if (!withoutBom.trim()) return [];

  const delimiter = detectDelimiter(withoutBom);
  const table = parseCsvTable(withoutBom, delimiter);
  if (table.length < 2) return [];

  const header = table[0].map(normalizeHeader);
  const col = (row: string[], label: string): string => {
    const index = header.indexOf(normalizeHeader(label));
    return index === -1 ? '' : (row[index] ?? '').trim();
  };
  void REQUIRED_HEADERS; // documente les colonnes attendues, cf. §9 ; absentes -> cellules vides, jamais une exception.

  return table.slice(1).map((row, index) => {
    const rowNumber = index + 2;

    const name = col(row, 'Nom');
    const company = col(row, 'Entreprise') || null;
    const source = col(row, 'Source contact') || null;
    const remark = col(row, 'Remarques');
    const channel = mapChannel(col(row, 'Modalité'));
    const temperatureRaw = col(row, 'Température');
    const { estPrescripteur, pipeline, pipelineUncertain } = mapNatureToPipeline(col(row, 'Nature'));

    const firstContact = parseDateCell(col(row, 'Date prise contact'), assumedYear);
    const secondContactRaw = col(row, 'Date contact 2');
    const secondContact = secondContactRaw ? parseDateCell(secondContactRaw, assumedYear) : null;

    // La remarque n'a qu'une colonne pour deux contacts possibles : elle
    // décrit l'état le plus récent, donc rattachée au dernier contact connu.
    const interactions = secondContact
      ? [
          { date: firstContact.date, warning: firstContact.warning, channel, note: '' },
          { date: secondContact.date, warning: secondContact.warning, channel, note: remark },
        ]
      : [{ date: firstContact.date, warning: firstContact.warning, channel, note: remark }];

    const errors: string[] = [];
    if (!name) errors.push('Nom manquant : ligne ignorée.');

    return {
      rowNumber,
      name,
      company,
      companyLooksLikeActivity: company ? looksLikeActivityDescription(company) : false,
      source,
      temperature: mapTemperature(temperatureRaw),
      pipeline,
      pipelineUncertain,
      estPrescripteur,
      stageId: mapTemperatureToStage(temperatureRaw),
      originEvent: source,
      signaled: col(row, 'Signatures').trim().toLowerCase() === 'oui',
      interactions,
      suggestedTask: remark
        ? suggestTaskFromRemark(remark, assumedYear, secondContact?.date ?? firstContact.date ?? todayISO())
        : null,
      errors,
    };
  });
};

// --- Écriture, marquée pour retour arrière complet ------------------------

export type ProspectionImportRow = {
  name: string;
  company: string | null;
  source: string | null;
  temperature: ProspectTemperature;
  estPrescripteur: boolean;
  pipeline: PipelineKind;
  stageId: string;
  originEvent: string | null;
  interactions: { date: string; channel: InteractionChannel; note: string }[];
  task: { label: string; dueDate: string } | null;
};

/**
 * Étiquette posée dans `Prospect.notes` de chaque prospect importé : la
 * feuille Prospection n'a aucune colonne qui alimente ce champ (Remarques va
 * dans l'interaction, pas ici), il reste donc libre pour marquer l'origine
 * sans ajouter de champ au schéma. `removeImportBatch` s'appuie dessus pour
 * un retour arrière complet (§9), en réutilisant la cascade déjà en place
 * sur `deleteProspect`.
 */
export const importBatchTag = (batchId: string): string => `[Import CSV ${batchId}]`;

export const applyProspectionImport = (
  data: FinanceData,
  rows: ProspectionImportRow[],
  batchId: string,
  today: string = todayISO(),
): FinanceData =>
  rows.reduce((current, row) => {
    const withProspect = addProspect(current, {
      name: row.name,
      company: row.company,
      source: row.source,
      temperature: row.temperature,
      estPrescripteur: row.estPrescripteur,
      createdAt: today,
      notes: importBatchTag(batchId),
    });
    const prospectId = withProspect.prospects[0].id;

    const withInteractions = row.interactions.reduce(
      (acc, interaction) => logInteraction(acc, { prospectId, date: interaction.date, channel: interaction.channel, note: interaction.note }),
      withProspect,
    );

    const withOpportunity = addOpportunity(withInteractions, {
      prospectId,
      title: row.company ? `${row.name} — ${row.company}` : row.name,
      pipeline: row.pipeline,
      stageId: row.stageId,
      originEvent: row.originEvent,
      createdAt: today,
    });

    if (!row.task) return withOpportunity;

    const opportunityId = withOpportunity.opportunities[0].id;
    return addTask(withOpportunity, {
      prospectId,
      opportunityId,
      label: row.task.label,
      dueDate: row.task.dueDate,
      createdAt: today,
    });
  }, data);

/**
 * Annule un import entier — supprime chaque prospect marqué, avec toute sa
 * cascade. Réutilise `deleteProspect` (qui supprime déjà opportunités,
 * historique de stades et tâches depuis la correction de l'étape 8) plutôt
 * que de dupliquer cette logique.
 */
export const removeImportBatch = (data: FinanceData, batchId: string): FinanceData => {
  const tag = importBatchTag(batchId);
  const importedIds = data.prospects.filter((prospect) => prospect.notes.includes(tag)).map((prospect) => prospect.id);

  return importedIds.reduce((current, prospectId) => deleteProspect(current, prospectId), data);
};
