import type { AppSettings, MonthlyRecord } from '@freepilot/finance-core';
import {
  addMonths,
  buildMonthlyCashflowSeries,
  calculateARECutoff,
  monthRange,
  projectRemainingAREDays,
} from '@freepilot/finance-core';
import { describe, expect, it } from 'vitest';

/** Réglages du tableur de référence. */
const settings: AppSettings = {
  areDailyAmount: 50.39,
  theoreticalMonthlyDays: 30,
  remainingAREDays: 440,
  bncAbatementRate: 34,
  franceTravailDeductionRate: 70,
  urssafSocialContributionRate: 25.6,
  professionalTrainingContributionRate: 0.2,
  totalUrssafProvisionRate: 25.8,
  prudentIncomeTaxProvisionRate: 11,
  versementLiberatoireEnabled: false,
  versementLiberatoireRateBNC: 2.2,
  monthlyRevenueSafetyThreshold: 1000,
  monthlyRevenueTakeoffThreshold: 1500,
  hotProspectFollowUpDays: 7,
  warmProspectFollowUpDays: 21,
  coldProspectFollowUpDays: 60,
  dormantOpportunityDays: 14,
  dormantPartnershipDays: 30,
  stageProbabilities: {},
};

/**
 * Historique réel repris du tableur (seul l'enchaînement des mois compte).
 * L'ARE pleine passe de 1 476 € à 1 416 € à partir du deuxième mois.
 */
const history: MonthlyRecord[] = [
  { month: '2026-04', collectedRevenue: 270, fullMonthlyARE: 1476, actualARE: 1476 },
  { month: '2026-05', collectedRevenue: 1900, fullMonthlyARE: 1416, actualARE: 1012 },
  { month: '2026-06', collectedRevenue: 800, fullMonthlyARE: 1416, actualARE: 552 },
  { month: '2026-07', collectedRevenue: 1625, fullMonthlyARE: 1416, actualARE: 988 },
  { month: '2026-08', collectedRevenue: 1065, fullMonthlyARE: 1416, actualARE: 600 },
];

describe('série mensuelle de trésorerie', () => {
  const series = buildMonthlyCashflowSeries(history, settings);
  const byMonth = Object.fromEntries(series.map((month) => [month.month, month]));

  it('déduit de l’ARE 46,2 % du CA encaissé (66 % × 70 %)', () => {
    expect(byMonth['2026-04'].areDeduction.value).toBe(124.74);
    expect(byMonth['2026-05'].areDeduction.value).toBe(877.8);
    expect(byMonth['2026-06'].areDeduction.value).toBe(369.6);
    expect(byMonth['2026-07'].areDeduction.value).toBe(750.75);
    expect(byMonth['2026-08'].areDeduction.value).toBe(492.03);
  });

  it('impute la déduction du mois M sur l’ARE du mois M+1', () => {
    expect(byMonth['2026-04'].carriedDeduction).toBe(0);
    expect(byMonth['2026-05'].carriedDeduction).toBe(124.74);
    expect(byMonth['2026-06'].carriedDeduction).toBe(877.8);
    expect(byMonth['2026-07'].carriedDeduction).toBe(369.6);
    expect(byMonth['2026-08'].carriedDeduction).toBe(750.75);
  });

  it('calcule l’ARE théorique = ARE pleine − déduction du mois précédent', () => {
    expect(byMonth['2026-04'].theoreticalARE.value).toBe(1476);
    expect(byMonth['2026-05'].theoreticalARE.value).toBe(1291.26);
    expect(byMonth['2026-06'].theoreticalARE.value).toBe(538.2);
    expect(byMonth['2026-07'].theoreticalARE.value).toBe(1046.4);
    expect(byMonth['2026-08'].theoreticalARE.value).toBe(665.25);
  });

  it('provisionne l’Urssaf à 25,8 % du CA, payable le mois suivant', () => {
    expect(byMonth['2026-04'].urssafProvision.value).toBe(69.66);
    expect(byMonth['2026-05'].urssafProvision.value).toBe(490.2);
    expect(byMonth['2026-06'].urssafProvision.value).toBe(206.4);
    expect(byMonth['2026-07'].urssafProvision.value).toBe(419.25);
    expect(byMonth['2026-08'].urssafProvision.value).toBe(274.77);

    expect(byMonth['2026-04'].urssafPaymentMonth).toBe('2026-05');
    expect(byMonth['2026-08'].urssafPaymentMonth).toBe('2026-09');
  });

  it('provisionne l’impôt à 11 % du revenu après abattement, soit 7,26 % du CA', () => {
    expect(byMonth['2026-04'].incomeTaxProvision.value).toBe(19.6);
    expect(byMonth['2026-05'].incomeTaxProvision.value).toBe(137.94);
    expect(byMonth['2026-06'].incomeTaxProvision.value).toBe(58.08);
    expect(byMonth['2026-07'].incomeTaxProvision.value).toBe(117.98);
    expect(byMonth['2026-08'].incomeTaxProvision.value).toBe(77.32);
  });

  it('calcule le net final = CA − Urssaf héritée du mois précédent + ARE effective', () => {
    // Avril est le premier mois de la série : aucune Urssaf héritée, donc 0 y est prélevé.
    expect(byMonth['2026-04'].netFinal.value).toBe(1746);
    // Mai prélève l'Urssaf générée par le CA d'avril (69,66) : 1900 − 69,66 + 1012.
    expect(byMonth['2026-05'].netFinal.value).toBe(2842.34);
    // Juin prélève celle de mai (490,2) : 800 − 490,2 + 552.
    expect(byMonth['2026-06'].netFinal.value).toBe(861.8);
    // Juillet prélève celle de juin (206,4) : 1625 − 206,4 + 988.
    expect(byMonth['2026-07'].netFinal.value).toBe(2406.6);
    // Août prélève celle de juillet (419,25) : 1065 − 419,25 + 600.
    expect(byMonth['2026-08'].netFinal.value).toBe(1245.75);
  });

  it('reporte l’Urssaf générée par un mois sur le netFinal du mois suivant', () => {
    expect(byMonth['2026-04'].carriedUrssaf).toBe(0);
    expect(byMonth['2026-05'].carriedUrssaf).toBe(69.66);
    expect(byMonth['2026-06'].carriedUrssaf).toBe(490.2);
    expect(byMonth['2026-07'].carriedUrssaf).toBe(206.4);
    expect(byMonth['2026-08'].carriedUrssaf).toBe(419.25);
  });

  it('reporte l’impôt généré par un mois sur le mois suivant, même logique que l’Urssaf', () => {
    expect(byMonth['2026-04'].carriedIncomeTax).toBe(0);
    expect(byMonth['2026-05'].carriedIncomeTax).toBe(19.6);
    expect(byMonth['2026-06'].carriedIncomeTax).toBe(137.94);
    expect(byMonth['2026-07'].carriedIncomeTax).toBe(58.08);
    expect(byMonth['2026-08'].carriedIncomeTax).toBe(117.98);
  });

  it('décompte les jours sur l’ARE réellement versée, pas sur la théorique', () => {
    expect(byMonth['2026-04'].areDaysConsumed).toBeCloseTo(29.291526, 5);
    expect(byMonth['2026-04'].areDaysPreserved).toBeCloseTo(0.708474, 5);

    // Juin : 552 € réellement versés (et non 538,20 € théoriques).
    expect(byMonth['2026-06'].areDaysConsumed).toBeCloseTo(10.954554, 5);
    expect(byMonth['2026-06'].areDaysPreserved).toBeCloseTo(19.045446, 5);

    expect(byMonth['2026-05'].areDaysConsumed).toBeCloseTo(20.08335, 5);
    expect(byMonth['2026-07'].areDaysConsumed).toBeCloseTo(19.607065, 5);
    expect(byMonth['2026-08'].areDaysConsumed).toBeCloseTo(11.907124, 5);
  });

  it('retient l’ARE réellement versée quand elle est connue', () => {
    expect(byMonth['2026-05'].theoreticalARE.value).toBe(1291.26);
    expect(byMonth['2026-05'].actualARE).toBe(1012);
    expect(byMonth['2026-05'].effectiveARE).toBe(1012);
  });
});

describe('cas limites de la série', () => {
  it('retombe sur l’ARE théorique quand l’ARE réelle est inconnue', () => {
    const [month] = buildMonthlyCashflowSeries(
      [{ month: '2026-04', collectedRevenue: 270, fullMonthlyARE: 1476 }],
      settings,
    );

    expect(month.actualARE).toBeNull();
    expect(month.effectiveARE).toBe(1476);
  });

  it('ne rend jamais une ARE négative : au-delà du seuil, elle est coupée', () => {
    const series = buildMonthlyCashflowSeries(
      [
        { month: '2026-04', collectedRevenue: 10000, fullMonthlyARE: 1416 },
        { month: '2026-05', collectedRevenue: 0, fullMonthlyARE: 1416 },
      ],
      settings,
    );

    expect(series[0].areDeduction.value).toBe(4620);
    expect(series[1].theoreticalARE.value).toBe(0);
    // Le mois sans CA ne consomme aucun jour de droits.
    expect(series[1].areDaysConsumed).toBe(0);
    expect(series[1].areDaysPreserved).toBe(30);
  });

  it('remet les mois dans l’ordre avant de chaîner les déductions', () => {
    const series = buildMonthlyCashflowSeries([...history].reverse(), settings);

    expect(series.map((month) => month.month)).toEqual([
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
    ]);
    expect(series[1].carriedDeduction).toBe(124.74);
  });

  it('accepte une Urssaf et un impôt hérités d’un mois hors série', () => {
    const [month] = buildMonthlyCashflowSeries(
      [{ month: '2026-05', collectedRevenue: 0, fullMonthlyARE: 1416 }],
      settings,
      { carriedUrssaf: 258, carriedIncomeTax: 72.6 },
    );

    // 0 − 258 + 1416.
    expect(month.netFinal.value).toBe(1158);
    expect(month.carriedUrssaf).toBe(258);
    expect(month.carriedIncomeTax).toBe(72.6);
  });

  it('accepte une déduction héritée d’un mois hors série', () => {
    const [month] = buildMonthlyCashflowSeries(
      [{ month: '2026-05', collectedRevenue: 0, fullMonthlyARE: 1416 }],
      settings,
      { carriedDeduction: 124.74 },
    );

    expect(month.theoreticalARE.value).toBe(1291.26);
  });

  it('décompte les jours consommés du capital de droits restants', () => {
    const remaining = projectRemainingAREDays(buildMonthlyCashflowSeries(history, settings), settings);

    // 91,84362 jours consommés sur les 440 de capital initial.
    expect(remaining).toBeCloseTo(348.15638, 4);
  });
});

describe('seuil de coupure de l’ARE', () => {
  it('se calcule sur l’ARE pleine notifiée quand elle est fournie', () => {
    // 1416 / 46,2 % — le CA au-delà duquel l'ARE du mois suivant tombe à 0.
    expect(calculateARECutoff(settings, 1416).value).toBeCloseTo(3064.94, 2);
  });

  it('retombe sur montant journalier × jours quand l’ARE pleine est inconnue', () => {
    // 50,39 × 30 = 1511,70, soit un seuil sensiblement plus haut.
    expect(calculateARECutoff(settings).value).toBeCloseTo(3272.08, 2);
  });

  it('annule le seuil plutôt que de diviser par zéro', () => {
    const invalid = { ...settings, franceTravailDeductionRate: 0 };
    const cutoff = calculateARECutoff(invalid, 1416);

    expect(cutoff.value).toBe(0);
    expect(cutoff.warnings).toContain('Taux de déduction ARE invalide.');
  });
});

describe('utilitaires de mois', () => {
  it('avance et recule en franchissant les années', () => {
    expect(addMonths('2026-11', 2)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-07', 0)).toBe('2026-07');
  });

  it('produit une suite de mois consécutifs', () => {
    expect(monthRange('2026-11', 4)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
    expect(monthRange('2026-11', 0)).toEqual([]);
  });
});
