import { describe, expect, it } from 'vitest';
import { formatMonthComplement, formatMonthLabel } from '../src/format';

describe('formatMonthLabel', () => {
  it('met la majuscule sur le mois', () => {
    expect(formatMonthLabel('2026-07')).toBe('Juillet 2026');
  });
});

describe('formatMonthComplement', () => {
  it('emploie « de » devant une consonne', () => {
    expect(formatMonthComplement('2026-07')).toBe('de juillet 2026');
    expect(formatMonthComplement('2026-12')).toBe('de décembre 2026');
  });

  // Les trois mois qui commencent par une voyelle : ce sont les seuls cas où la
  // concaténation naïve produit « de août », et ils reviennent tous les ans.
  it('élide devant une voyelle', () => {
    expect(formatMonthComplement('2026-04')).toBe('d’avril 2026');
    expect(formatMonthComplement('2026-08')).toBe('d’août 2026');
    expect(formatMonthComplement('2026-10')).toBe('d’octobre 2026');
  });
});
