import type { FinanceData } from '@freepilot/finance-core';
import {
  addOpportunity,
  averageCycleDurationDays,
  averageDaysInStage,
  defaultSettings,
  stageConversionRates,
  stageFunnelCounts,
  updateOpportunity,
} from '@freepilot/finance-core';
import { describe, expect, it } from 'vitest';

const emptyData = (): FinanceData => ({
  version: 5,
  recurringChargeAutoPostFrom: null,
  settings: defaultSettings,
  accounts: [],
  invoices: [],
  transactions: [],
  recurringCharges: [],
  areMonths: [],
  prospects: [],
  interactions: [],
  opportunities: [],
  stageChanges: [],
  tasks: [],
});

/**
 * Deux affaires « projet » : A parcourt identifié → découverte → cadrage →
 * proposition puis gagne, B s'arrête perdue en découverte. De quoi vérifier
 * funnel, conversion, durée par stade et durée de cycle sur un scénario où
 * une seule affaire va au bout.
 */
const scenario = (): FinanceData => {
  let data = addOpportunity(emptyData(), {
    prospectId: 'p-a',
    title: 'Affaire A',
    pipeline: 'projet',
    stageId: 'identified',
    createdAt: '2026-01-01',
  });
  const idA = data.opportunities[0].id;

  data = addOpportunity(data, {
    prospectId: 'p-b',
    title: 'Affaire B',
    pipeline: 'projet',
    stageId: 'identified',
    createdAt: '2026-01-10',
  });
  const idB = data.opportunities.find((opportunity) => opportunity.title === 'Affaire B')!.id;

  data = updateOpportunity(data, idA, { stageId: 'discovery' }, '2026-01-05');
  data = updateOpportunity(data, idA, { stageId: 'scoping' }, '2026-01-15');
  data = updateOpportunity(data, idA, { stageId: 'proposal' }, '2026-02-01');
  data = updateOpportunity(data, idA, { status: 'won', amount: 5000 }, '2026-02-10');

  data = updateOpportunity(data, idB, { stageId: 'discovery' }, '2026-01-20');
  data = updateOpportunity(data, idB, { status: 'lost', lossReason: 'timing' }, '2026-01-25');

  return data;
};

describe('stageFunnelCounts', () => {
  it('compte les affaires distinctes ayant atteint chaque stade', () => {
    const counts = stageFunnelCounts(scenario(), 'projet');

    expect(counts).toEqual({
      identified: 2,
      discovery: 2,
      scoping: 1,
      proposal: 1,
      negotiation: 0,
    });
  });

  it('ignore un pipeline sans aucune donnée', () => {
    expect(stageFunnelCounts(emptyData(), 'formation')).toEqual({
      identified: 0,
      contacted: 0,
      qualified: 0,
      proposal: 0,
      negotiation: 0,
    });
  });
});

describe('stageConversionRates', () => {
  it('calcule le taux de passage d’un stade au suivant', () => {
    const rates = stageConversionRates(scenario(), 'projet');

    expect(rates.identified).toBeNull();
    expect(rates.discovery).toBe(100);
    expect(rates.scoping).toBe(50);
    expect(rates.proposal).toBe(100);
    expect(rates.negotiation).toBe(0);
  });
});

describe('averageDaysInStage', () => {
  it('moyenne la durée réellement passée dans chaque stade avant d’en sortir', () => {
    const durations = averageDaysInStage(scenario(), 'projet');

    expect(durations.identified).toBe(7); // (4 + 10) / 2
    expect(durations.discovery).toBe(10); // seule A en est sortie
    expect(durations.scoping).toBe(17);
    expect(durations.proposal).toBeNull(); // personne n'en est sorti
    expect(durations.negotiation).toBeNull();
  });
});

describe('averageCycleDurationDays', () => {
  it('moyenne la durée de la création au gain, sur les affaires gagnées seulement', () => {
    expect(averageCycleDurationDays(scenario(), 'projet')).toBe(40);
  });

  it('renvoie null sans aucune affaire gagnée', () => {
    expect(averageCycleDurationDays(emptyData(), 'projet')).toBeNull();
  });
});
