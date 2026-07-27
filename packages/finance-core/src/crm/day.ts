/** Utilitaires sur les dates au format 'YYYY-MM-DD'. */

const DAY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const pad = (value: number): string => String(value).padStart(2, '0');

export const isValidDay = (day: string): boolean => DAY_PATTERN.test(day);

/**
 * Date du jour dans le fuseau de l'utilisateur.
 *
 * `toISOString()` renvoie la date UTC : en France l'été, il annoncerait encore
 * la veille jusqu'à 2 h du matin. Une relance datée d'un jour de trop passerait
 * en retard sans raison.
 */
export const todayISO = (date = new Date()): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const toTimestamp = (day: string): number => {
  const [year, month, dayOfMonth] = day.split('-').map(Number);
  return Date.UTC(year, month - 1, dayOfMonth);
};

const MS_PER_DAY = 86_400_000;

/** addDays('2026-12-30', 5) -> '2027-01-04' */
export const addDays = (day: string, offset: number): string => {
  const shifted = new Date(toTimestamp(day) + offset * MS_PER_DAY);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
};

/** Nombre de jours entiers de `from` vers `to`, négatif si `to` précède `from`. */
export const daysBetween = (from: string, to: string): number =>
  Math.round((toTimestamp(to) - toTimestamp(from)) / MS_PER_DAY);

export const compareDays = (left: string, right: string): number => left.localeCompare(right);
