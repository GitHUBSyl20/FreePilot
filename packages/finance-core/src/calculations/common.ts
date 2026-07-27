/**
 * Arrondi monétaire au centime, au demi supérieur.
 *
 * Un `Math.round(value * 100) / 100` naïf est faussé par la représentation
 * binaire des décimaux : 1625 × 66 % × 11 % vaut 117,974999999… en flottant,
 * donc 117,97 € au lieu de 117,98 €. On absorbe d'abord cette erreur en
 * ramenant la valeur à 12 chiffres significatifs, puis on arrondit.
 */
export const roundCurrency = (value: number): number => {
  if (!Number.isFinite(value)) return 0;

  const cents = Number((value * 100).toPrecision(12));
  return Math.round(cents) / 100;
};

export const asRate = (value: number): number => value / 100;

export const safeNumber = (value: number | null | undefined): number =>
  Number.isFinite(value) ? Number(value) : 0;
