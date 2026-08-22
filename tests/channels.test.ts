import type { FinanceData, Opportunity, Prospect } from '@freepilot/finance-core';
import { channelStatsByOriginEvent, channelStatsByReferrer, channelStatsBySource, defaultSettings } from '@freepilot/finance-core';
import { describe, expect, it } from 'vitest';

const prospect = (id: string, overrides: Partial<Prospect> = {}): Prospect => ({
  id,
  name: id,
  company: null,
  source: null,
  temperature: 'warm',
  status: 'active',
  nextFollowUpDate: null,
  notes: '',
  createdAt: '2026-01-01',
  estPrescripteur: false,
  ...overrides,
});

const opportunity = (id: string, overrides: Partial<Opportunity>): Opportunity => ({
  id,
  prospectId: 'p1',
  title: id,
  pipeline: 'projet',
  stageId: 'negotiation',
  amount: 0,
  recurring: false,
  monthlyAmount: null,
  probability: 0,
  probabilityOverride: false,
  expectedCloseDate: null,
  originEvent: null,
  referrerProspectId: null,
  funding: null,
  status: 'open',
  lossReason: null,
  statusDate: null,
  createdAt: '2026-01-01',
  ...overrides,
});

/**
 * Portefeuille couvrant trois sources (CPME, sans source, LinkedIn), deux
 * événements d'origine (un partagé, l'un absent) et un prescripteur avec deux
 * interactions, pour vérifier que seule la plus récente compte.
 */
const scenario = (): FinanceData => ({
  version: 5,
  recurringChargeAutoPostFrom: null,
  settings: defaultSettings,
  accounts: [],
  invoices: [],
  transactions: [],
  recurringCharges: [],
  areMonths: [],
  prospects: [
    prospect('p1', { source: 'CPME' }),
    prospect('p2', { source: 'CPME' }),
    prospect('p3', { source: null }),
    prospect('p4', { source: 'Réseau', estPrescripteur: true }),
    prospect('p5', { source: 'LinkedIn' }),
  ],
  interactions: [
    { id: 'i-1', prospectId: 'p4', date: '2026-03-01', channel: 'email', note: '' },
    { id: 'i-2', prospectId: 'p4', date: '2026-02-01', channel: 'phone', note: '' },
  ],
  opportunities: [
    opportunity('o1', {
      prospectId: 'p1',
      status: 'won',
      amount: 3000,
      createdAt: '2026-01-01',
      statusDate: '2026-01-20',
      originEvent: 'Petit-déj CPME 12/03',
    }),
    opportunity('o2', { prospectId: 'p2', status: 'open', amount: 1000, createdAt: '2026-02-01' }),
    opportunity('o3', {
      prospectId: 'p3',
      pipeline: 'formation',
      status: 'won',
      amount: 500,
      createdAt: '2026-02-01',
      statusDate: '2026-02-11',
      originEvent: 'Petit-déj CPME 12/03',
    }),
    opportunity('o4', {
      prospectId: 'p5',
      status: 'won',
      amount: 2000,
      createdAt: '2026-03-05',
      statusDate: '2026-03-25',
      referrerProspectId: 'p4',
    }),
  ],
  stageChanges: [],
  tasks: [],
});

describe('channelStatsBySource', () => {
  it('regroupe par source du prospect, triées par CA signé décroissant', () => {
    const stats = channelStatsBySource(scenario());

    expect(stats.map((entry) => entry.key)).toEqual(['CPME', 'LinkedIn', 'Non renseigné']);

    const cpme = stats.find((entry) => entry.key === 'CPME')!;
    expect(cpme).toMatchObject({ opportunityCount: 2, wonCount: 1, conversionRate: 50, signedRevenue: 3000, averageDeal: 3000, averageCycleDays: 19 });

    const unspecified = stats.find((entry) => entry.key === 'Non renseigné')!;
    expect(unspecified).toMatchObject({ opportunityCount: 1, wonCount: 1, conversionRate: 100, signedRevenue: 500, averageCycleDays: 10 });
  });

  it('n’a ni panier moyen ni durée de cycle sans aucune affaire gagnée', () => {
    const onlyOpen: FinanceData = {
      ...scenario(),
      opportunities: [opportunity('o1', { prospectId: 'p1', status: 'open', amount: 100 })],
    };

    const [stats] = channelStatsBySource(onlyOpen);
    expect(stats.conversionRate).toBe(0);
    expect(stats.averageDeal).toBeNull();
    expect(stats.averageCycleDays).toBeNull();
  });
});

describe('channelStatsByOriginEvent', () => {
  it('agrège deux affaires venues du même événement', () => {
    const stats = channelStatsByOriginEvent(scenario());
    const event = stats.find((entry) => entry.key === 'Petit-déj CPME 12/03')!;

    expect(event).toMatchObject({ opportunityCount: 2, wonCount: 2, conversionRate: 100, signedRevenue: 3500, averageDeal: 1750 });
    expect(event.averageCycleDays).toBe(14.5); // (19 + 10) / 2

    const unspecified = stats.find((entry) => entry.key === 'Non renseigné')!;
    expect(unspecified).toMatchObject({ opportunityCount: 2, wonCount: 1, signedRevenue: 2000 });
  });
});

describe('channelStatsByReferrer', () => {
  it('ne retient que les affaires référencées et la date du dernier contact avec le prescripteur', () => {
    const [stats] = channelStatsByReferrer(scenario());

    expect(stats).toMatchObject({
      key: 'p4',
      label: 'p4',
      opportunityCount: 1,
      wonCount: 1,
      signedRevenue: 2000,
      averageCycleDays: 20,
      lastContactDate: '2026-03-01', // la plus récente des deux interactions
    });
  });

  it('renvoie une liste vide sans aucune affaire référencée', () => {
    const withoutReferrer: FinanceData = { ...scenario(), opportunities: [opportunity('o1', { prospectId: 'p1' })] };

    expect(channelStatsByReferrer(withoutReferrer)).toEqual([]);
  });
});
