const currencyFormatter = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const monthFormatter = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
const dayFormatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

export const formatCurrency = (value: number): string => currencyFormatter.format(value);

export const formatDays = (value: number): string => `${dayFormatter.format(value)} j`;

/** '2026-07' -> 'Juillet 2026' */
export const formatMonthLabel = (month: string): string => {
  const [year, monthNumber] = month.split('-').map(Number);
  const label = monthFormatter.format(new Date(year, monthNumber - 1, 1));
  return label.charAt(0).toUpperCase() + label.slice(1);
};

export const today = (): string => new Date().toISOString().slice(0, 10);

/** Accepte la virgule décimale, usuelle sur un clavier français. */
export const parseAmount = (value: string): number => Number(value.replace(',', '.')) || 0;
