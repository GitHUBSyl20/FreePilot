/** Utilitaires sur les mois au format 'YYYY-MM'. */

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export const isValidMonth = (month: string): boolean => MONTH_PATTERN.test(month);

/** addMonths('2026-11', 2) -> '2027-01' */
export const addMonths = (month: string, offset: number): string => {
  const [year, monthNumber] = month.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
};

export const compareMonths = (left: string, right: string): number => left.localeCompare(right);

/** Suite de `count` mois consécutifs à partir de `startMonth` inclus. */
export const monthRange = (startMonth: string, count: number): string[] =>
  Array.from({ length: Math.max(0, count) }, (_unused, index) => addMonths(startMonth, index));
