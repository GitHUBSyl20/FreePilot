import type { FinanceData } from '@freepilot/finance-core';
import {
  buildFinanceSeries,
  defaultSettings,
  listCoveredMonths,
  projectDashboard,
  projectMonthlyOutlook,
  sumRecurringCharges,
} from '@freepilot/finance-core';
import { describe, expect, it } from 'vitest';

/** Scénario fictif : deux mois facturés, une ARE versée, deux charges fixes. */
const scenario = (): FinanceData => ({
  version: 2,
  settings: defaultSettings,
  accounts: [{ id: 'pro', name: 'Compte pro', kind: 'professional', openingBalance: 0 }],
  invoices: [
    {
      id: 'inv-1',
      clientName: 'Client A',
      status: 'paid',
      totalTTC: 1000,
      issueDate: '2026-05-02',
      dueDate: null,
      paymentDate: '2026-05-20',
      paymentAccountId: 'pro',
    },
    {
      id: 'inv-2',
      clientName: 'Client B',
      status: 'paid',
      totalTTC: 800,
      issueDate: '2026-06-02',
      dueDate: null,
      paymentDate: '2026-06-18',
      paymentAccountId: 'pro',
    },
    {
      id: 'inv-3',
      clientName: 'Client C',
      status: 'sent',
      totalTTC: 450,
      issueDate: '2026-06-25',
      dueDate: null,
      paymentDate: null,
      paymentAccountId: null,
    },
  ],
  transactions: [
    { id: 'tx-1', kind: 'expense', label: 'Matériel', amount: 50, date: '2026-06-10', fromAccountId: 'pro', toAccountId: null },
  ],
  recurringCharges: [
    { id: 'c-1', label: 'Loyer', amount: 700, scope: 'personal', dayOfMonth: 5, active: true },
    { id: 'c-2', label: 'Outils', amount: 100, scope: 'professional', dayOfMonth: 1, active: true },
    { id: 'c-3', label: 'Abonnement suspendu', amount: 999, scope: 'personal', dayOfMonth: null, active: false },
  ],
  areMonths: [
    { month: '2026-05', fullMonthlyARE: 1416, actualARE: null },
    { month: '2026-06', fullMonthlyARE: 1416, actualARE: 600 },
    { month: '2026-07', fullMonthlyARE: 1416, actualARE: null },
  ],
});

describe('charges récurrentes', () => {
  it('totalise par rattachement et ignore les charges suspendues', () => {
    const totals = sumRecurringCharges(scenario().recurringCharges);

    expect(totals.professional).toBe(100);
    expect(totals.personal).toBe(700);
    expect(totals.total).toBe(800);
  });
});

describe('couverture des mois', () => {
  it('comble les trous pour ne pas casser le chaînage des déductions', () => {
    const data = scenario();
    // Aucune donnée en août, mais la série doit passer par ce mois.
    data.areMonths.push({ month: '2026-09', fullMonthlyARE: 1416, actualARE: null });

    expect(listCoveredMonths(data, '2026-07')).toEqual([
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
    ]);
  });
});

describe('projection mensuelle', () => {
  const outlook = projectMonthlyOutlook(scenario(), '2026-06');

  it('reprend la trésorerie du moteur pour le mois demandé', () => {
    expect(outlook.cashflow.collectedRevenue).toBe(800);
    expect(outlook.cashflow.theoreticalARE.value).toBe(954);
    expect(outlook.cashflow.effectiveARE).toBe(600);
    expect(outlook.cashflow.netFinal.value).toBe(1193.6);
  });

  it('déduit impôt, charges fixes et dépenses ponctuelles du reste à vivre', () => {
    // 1193,60 − 58,08 − 800 − 50
    expect(outlook.resteAVivre.value).toBe(285.52);
    expect(outlook.variableExpenses).toBe(50);
  });

  it('projette l’ARE du mois suivant à partir du CA de ce mois', () => {
    // 1416 − (800 × 46,2 %)
    expect(outlook.nextMonthARE).toBe(1046.4);
  });

  it('calcule le seuil de coupure sur l’ARE pleine du mois suivant', () => {
    expect(outlook.areCutoff.value).toBeCloseTo(3064.94, 2);
  });

  it('signale un mois qui ne couvre pas ses charges', () => {
    const data = scenario();
    data.recurringCharges = [{ id: 'c-x', label: 'Loyer', amount: 5000, scope: 'personal', dayOfMonth: null, active: true }];

    const tight = projectMonthlyOutlook(data, '2026-06');

    expect(tight.resteAVivre.value).toBeLessThan(0);
    expect(tight.resteAVivre.warnings).toContain('Le mois ne couvre pas les charges.');
  });
});

describe('dashboard', () => {
  const projection = projectDashboard(scenario(), '2026-06');

  it('expose les indicateurs du mois', () => {
    expect(projection.kpis.caEncaisse).toBe(800);
    expect(projection.kpis.facturesImpayees).toBe(450);
    expect(projection.kpis.areDuMois).toBe(600);
    expect(projection.kpis.areEstimeeM1).toBe(1046.4);
    expect(projection.kpis.netFinal).toBe(1193.6);
    expect(projection.kpis.chargesFixes).toBe(800);
    expect(projection.kpis.resteAVivre).toBe(285.52);
  });

  it('ne décompte les jours de droits que jusqu’au mois affiché', () => {
    // Mai 1416 € et juin 600 € versés, soit 40,0079 jours sur 440.
    expect(projection.kpis.joursAreRestants).toBeCloseTo(399.99206, 4);
  });

  it('construit une série continue jusqu’au mois suivant', () => {
    expect(buildFinanceSeries(scenario(), '2026-06').map((entry) => entry.month)).toEqual([
      '2026-05',
      '2026-06',
      '2026-07',
    ]);
  });
});
