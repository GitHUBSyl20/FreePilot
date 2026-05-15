export const roundCurrency = (value: number): number => Math.round(value * 100) / 100;

export const asRate = (value: number): number => value / 100;

export const safeNumber = (value: number | null | undefined): number =>
  Number.isFinite(value) ? Number(value) : 0;
