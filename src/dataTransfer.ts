import type { FinanceData } from '@freepilot/finance-core';
import { migrateFinanceData } from '@freepilot/finance-core';

type ExportEnvelope = {
  app: 'freepilot';
  exportedAt: string;
  data: FinanceData;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * Valide puis migre un fichier importé : les données pilotent un revenu réel,
 * mieux vaut refuser un fichier douteux que corrompre l'historique.
 * Les sauvegardes d'une version antérieure restent acceptées.
 */
const parseFinanceData = (candidate: unknown): FinanceData => {
  if (!isRecord(candidate)) throw new Error('Fichier illisible : contenu JSON inattendu.');

  // On accepte l'enveloppe d'export comme un FinanceData brut.
  return migrateFinanceData(isRecord(candidate.data) ? candidate.data : candidate);
};

export const buildExportFileName = (date = new Date()): string =>
  `freepilot-export-${date.toISOString().slice(0, 10)}.json`;

export const serializeFinanceData = (data: FinanceData, date = new Date()): string => {
  const envelope: ExportEnvelope = { app: 'freepilot', exportedAt: date.toISOString(), data };
  return JSON.stringify(envelope, null, 2);
};

export const downloadFinanceData = (data: FinanceData): void => {
  const blob = new Blob([serializeFinanceData(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = buildExportFileName();
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

/**
 * `File.text()` manque sur les navigateurs mobiles un peu anciens (Safari
 * antérieur à 14, certaines vues web intégrées). On retombe alors sur
 * `FileReader`, sinon l'import échouerait sur le téléphone.
 */
const readFileText = async (file: File): Promise<string> => {
  if (typeof file.text === 'function') return file.text();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Fichier illisible : lecture impossible.'));
    reader.readAsText(file);
  });
};

export const readFinanceDataFile = async (file: File): Promise<FinanceData> => {
  const text = await readFileText(file);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Fichier illisible : ce n'est pas du JSON valide.");
  }

  return parseFinanceData(parsed);
};
