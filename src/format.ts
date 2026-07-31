import { todayISO } from '@freepilot/finance-core';

const currencyFormatter = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const monthFormatter = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
const dayFormatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const percentFormatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const dateFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const timeFormatter = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

export const formatCurrency = (value: number): string => currencyFormatter.format(value);

export const formatDays = (value: number): string => `${dayFormatter.format(value)} j`;

export const formatPercent = (value: number): string => `${percentFormatter.format(value)} %`;

/** '2026-07' -> 'Juillet 2026' */
export const formatMonthLabel = (month: string): string => {
  const [year, monthNumber] = month.split('-').map(Number);
  const label = monthFormatter.format(new Date(year, monthNumber - 1, 1));
  return label.charAt(0).toUpperCase() + label.slice(1);
};

/**
 * '2026-07' -> 'de juillet 2026', '2026-08' -> 'd’août 2026'
 *
 * Avril, août et octobre commencent par une voyelle et imposent l'élision.
 * Composer « de » + le libellé donne « de août », qui saute aux yeux dans une
 * phrase par ailleurs soignée.
 */
export const formatMonthComplement = (month: string): string => {
  const label = formatMonthLabel(month).toLowerCase();
  return /^[aeiou]/.test(label) ? `d’${label}` : `de ${label}`;
};

/** '2026-07-27' -> '27 juillet 2026' */
export const formatDate = (day: string): string => {
  const [year, month, dayOfMonth] = day.split('-').map(Number);
  return dateFormatter.format(new Date(year, month - 1, dayOfMonth));
};

/**
 * Horodatage ISO complet -> '27 juillet 2026 à 14:32'.
 * Réservé aux évènements techniques comme la synchro, où l'heure compte
 * autant que le jour ; les dates métier restent au jour près.
 */
export const formatDateTime = (timestamp: string): string => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;

  return `${dateFormatter.format(date)} à ${timeFormatter.format(date)}`;
};

/** Écart en jours mis en mots : « il y a 3 jours », « dans 5 jours ». */
export const formatDayGap = (days: number): string => {
  if (days === 0) return "aujourd'hui";
  if (days === 1) return 'demain';
  if (days === -1) return 'hier';
  return days > 0 ? `dans ${days} jours` : `il y a ${Math.abs(days)} jours`;
};

export const today = (): string => todayISO();

/** Accepte la virgule décimale, usuelle sur un clavier français. */
export const parseAmount = (value: string): number => Number(value.replace(',', '.')) || 0;

/**
 * Variante pour les champs déjà remplis, comme les réglages ou un solde
 * d'ouverture : un champ vidé le temps d'une frappe ne doit pas être lu comme
 * un zéro, sinon le réglage bascule pendant la saisie. Accepte le négatif.
 */
export const parseOptionalAmount = (value: string): number | undefined => {
  const normalized = value.trim().replace(',', '.');
  if (!normalized) return undefined;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
};
