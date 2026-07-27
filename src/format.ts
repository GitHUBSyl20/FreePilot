import { todayISO } from '@freepilot/finance-core';

const currencyFormatter = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const monthFormatter = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
const dayFormatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const dateFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

export const formatCurrency = (value: number): string => currencyFormatter.format(value);

export const formatDays = (value: number): string => `${dayFormatter.format(value)} j`;

/** '2026-07' -> 'Juillet 2026' */
export const formatMonthLabel = (month: string): string => {
  const [year, monthNumber] = month.split('-').map(Number);
  const label = monthFormatter.format(new Date(year, monthNumber - 1, 1));
  return label.charAt(0).toUpperCase() + label.slice(1);
};

/** '2026-07-27' -> '27 juillet 2026' */
export const formatDate = (day: string): string => {
  const [year, month, dayOfMonth] = day.split('-').map(Number);
  return dateFormatter.format(new Date(year, month - 1, dayOfMonth));
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
