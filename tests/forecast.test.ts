import type { FinanceData } from '@freepilot/finance-core';
import { buildForecastMonths, defaultSettings, pendingInvoiceRevenueWithoutDueDate } from '@freepilot/finance-core';
import { describe, expect, it } from 'vitest';

/** Même trame que financeProjection.test.ts : deux mois facturés, une ARE versée, deux charges fixes. */
const scenario = (): FinanceData => ({
  version: 5,
  recurringChargeAutoPostFrom: null,
  settings: defaultSettings,
  accounts: [
    { id: 'pro', name: 'Compte pro', kind: 'professional', openingBalance: 0 },
    { id: 'perso', name: 'Compte perso', kind: 'personal', openingBalance: 200 },
    { id: 'epargne', name: 'Livret', kind: 'savings', openingBalance: 5000 },
  ],
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
  ],
  transactions: [
    { id: 'tx-1', kind: 'expense', label: 'Matériel', amount: 50, date: '2026-06-10', fromAccountId: 'pro', toAccountId: null },
  ],
  recurringCharges: [
    { id: 'c-1', label: 'Loyer', amount: 700, scope: 'personal', dayOfMonth: 5, active: true },
    { id: 'c-2', label: 'Outils', amount: 100, scope: 'professional', dayOfMonth: 1, active: true },
  ],
  areMonths: [
    { month: '2026-05', fullMonthlyARE: 1416, actualARE: null },
    { month: '2026-06', fullMonthlyARE: 1416, actualARE: 600 },
  ],
  prospects: [],
  interactions: [],
  opportunities: [],
  stageChanges: [],
  tasks: [],
});

describe('prévisionnel multi-mois', () => {
  it('démarre au mois courant avec les vraies données, sans y toucher', () => {
    const [current] = buildForecastMonths(scenario(), '2026-06', 6);

    expect(current.month).toBe('2026-06');
    expect(current.isEstimated).toBe(false);
    expect(current.collectedRevenue).toBe(800);
    // Même valeur que outlook.resteAVivre dans financeProjection.test.ts : 219,4
    // (netFinal 1142 − impôt de mai porté sur juin 72,6 − charges 800 − dépense 50).
    expect(current.resteAVivre).toBe(219.4);
  });

  it('projette les mois futurs à partir du pipeline pondéré (nul ici), reconduit l’ARE et porte l’Urssaf/impôt du mois précédent', () => {
    const months = buildForecastMonths(scenario(), '2026-06', 6);
    const july = months.find((month) => month.month === '2026-07')!;

    expect(july.isEstimated).toBe(true);
    // Aucune opportunité dans le scénario : CA estimé nul.
    expect(july.collectedRevenue).toBe(0);
    // ARE pleine reconduite à 1416, déduction héritée du CA de juin (800) :
    // 1416 − (800 × (1 − 34 %) × 70 %) = 1046,4, comme nextMonthARE en juin.
    expect(july.effectiveARE).toBe(1046.4);
    // netFinal = CA (0) − Urssaf due sur le CA de juin (800 × 25,8 % = 206,4) + ARE (1046,4) = 840.
    // resteAVivre = 840 − impôt dû sur le CA de juin (800 × 66 % × 11 % = 58,08) − charges (800) = −18,08.
    // Un mois sans CA propre ne couvre donc pas les impôts hérités du mois précédent.
    expect(july.resteAVivre).toBe(-18.08);
  });

  it('un mois estimé positif ne fait pas grimper la trésorerie : le reste à vivre part dans le quotidien', () => {
    const months = buildForecastMonths(scenario(), '2026-06', 6);
    const [june, july, august] = months;

    // pro : 0 − 50 (dépense) = −50 ; perso : 200 ; épargne exclue du disponible.
    expect(june.cumulativeCash).toBe(150);
    // Juillet est déficitaire (Urssaf/impôt hérités de juin, sans CA propre) : entame la réserve.
    expect(july.resteAVivre).toBeLessThan(0);
    expect(july.cumulativeCash).toBeCloseTo(150 + july.resteAVivre, 2);
    // Août n'hérite plus que d'un Urssaf/impôt nuls (juillet sans CA) : redevient positif,
    // supposé dépensé, la trésorerie reste donc au niveau de juillet.
    expect(august.resteAVivre).toBeGreaterThan(0);
    expect(august.cumulativeCash).toBe(july.cumulativeCash);
  });

  it('un mois estimé déficitaire entame réellement la trésorerie', () => {
    const data = scenario();
    // Loyer démesuré : le mois ne couvrira jamais ses charges, même mois après mois.
    data.recurringCharges = [{ id: 'c-x', label: 'Loyer', amount: 5000, scope: 'personal', dayOfMonth: null, active: true }];

    const months = buildForecastMonths(data, '2026-06', 3);
    const [june, july, august] = months;

    expect(july.resteAVivre).toBeLessThan(0);
    expect(july.cumulativeCash).toBeCloseTo(june.cumulativeCash + july.resteAVivre, 2);
    expect(august.cumulativeCash).toBeCloseTo(july.cumulativeCash + august.resteAVivre, 2);
  });

  it('couvre exactement l’horizon demandé, mois consécutifs', () => {
    const months = buildForecastMonths(scenario(), '2026-06', 4);

    expect(months.map((month) => month.month)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09']);
  });
});

describe('prévisionnel : factures émises pas encore payées', () => {
  const withPendingInvoices = (): FinanceData => {
    const data = scenario();
    data.invoices.push(
      // Échéance connue : compte dans le mois de son échéance, pas celui d'émission.
      {
        id: 'inv-sent',
        clientName: 'Client C',
        status: 'sent',
        totalTTC: 300,
        issueDate: '2026-06-20',
        dueDate: '2026-08-15',
        paymentDate: null,
        paymentAccountId: null,
      },
      // Aucune échéance saisie : exclue du prévisionnel mois par mois.
      {
        id: 'inv-overdue',
        clientName: 'Client D',
        status: 'overdue',
        totalTTC: 150,
        issueDate: '2026-05-05',
        dueDate: null,
        paymentDate: null,
        paymentAccountId: null,
      },
    );
    return data;
  };

  it('range une facture en attente sur le mois de son échéance, pas celui d’émission', () => {
    const months = buildForecastMonths(withPendingInvoices(), '2026-06', 6);
    const july = months.find((month) => month.month === '2026-07')!;
    const august = months.find((month) => month.month === '2026-08')!;

    expect(july.facturesEnAttente).toBe(0);
    expect(august.facturesEnAttente).toBe(300);
    // Aucun pipeline ni MRR dans ce scénario : le CA estimé d'août n'est que la facture.
    expect(august.collectedRevenue).toBe(300);
  });

  it('exclut une facture sans échéance du prévisionnel mois par mois, plutôt que de deviner un mois', () => {
    const withUndated = (): FinanceData => {
      const data = scenario();
      data.invoices.push({
        id: 'inv-overdue',
        clientName: 'Client D',
        status: 'overdue',
        totalTTC: 150,
        issueDate: '2026-05-05',
        dueDate: null,
        paymentDate: null,
        paymentAccountId: null,
      });
      return data;
    };

    const withPending = buildForecastMonths(withUndated(), '2026-06', 6);
    const withoutPending = buildForecastMonths(scenario(), '2026-06', 6);

    // Aucun mois de l'horizon ne voit passer les 150 € sans échéance : ni
    // dans facturesEnAttente, ni dans le CA, ni dans le reste à vivre — sinon
    // « aujourd'hui » repousserait le même montant sur un mois différent à
    // chaque ouverture de l'écran (voir pendingInvoiceRevenueWithoutDueDate
    // pour leur total, tenu à part).
    withPending.forEach((month, index) => {
      expect(month.facturesEnAttente).toBe(withoutPending[index].facturesEnAttente);
      expect(month.collectedRevenue).toBe(withoutPending[index].collectedRevenue);
      expect(month.resteAVivre).toBe(withoutPending[index].resteAVivre);
    });
  });

  it('expose à part le total des factures sans échéance, sans jamais les affecter à un mois', () => {
    expect(pendingInvoiceRevenueWithoutDueDate(withPendingInvoices())).toBe(150);
    expect(pendingInvoiceRevenueWithoutDueDate(scenario())).toBe(0);
  });
});
