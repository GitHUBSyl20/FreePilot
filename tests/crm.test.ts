import type { FinanceData, Interaction, Prospect } from '@freepilot/finance-core';
import {
  addDays,
  addOpportunity,
  addProspect,
  addTask,
  buildProspectFollowUps,
  daysBetween,
  defaultSettings,
  deleteInteraction,
  deleteProspect,
  getCurrentMonth,
  listDueFollowUps,
  listDueNetworkFollowUps,
  logInteraction,
  networkFollowUps,
  revenueByProspect,
  summarizeCrm,
  todayISO,
  updateOpportunity,
  updateProspect,
} from '@freepilot/finance-core';
import { describe, expect, it } from 'vitest';

const TODAY = '2026-07-27';

const prospect = (
  id: string,
  name: string,
  overrides: Partial<Prospect>,
): Prospect => ({
  id,
  name,
  company: null,
  source: null,
  temperature: 'warm',
  status: 'active',
  nextFollowUpDate: null,
  notes: '',
  createdAt: '2026-07-01',
  estPrescripteur: false,
  ...overrides,
});

const contact = (id: string, prospectId: string, date: string): Interaction => ({
  id,
  prospectId,
  date,
  channel: 'email',
  note: '',
});

/**
 * Portefeuille fictif couvrant les six situations de relance : en retard,
 * du jour, à venir sur délai déduit, à venir sur date posée, signé et perdu.
 */
const portfolio = (): FinanceData => ({
  version: 5,
  recurringChargeAutoPostFrom: null,
  settings: defaultSettings,
  accounts: [{ id: 'pro', name: 'Compte pro', kind: 'professional', openingBalance: 0 }],
  invoices: [
    {
      id: 'inv-1',
      clientName: 'Elena',
      status: 'paid',
      totalTTC: 1200,
      issueDate: '2026-05-12',
      dueDate: null,
      paymentDate: '2026-05-30',
      paymentAccountId: 'pro',
      prospectId: 'p-signed',
    },
    {
      id: 'inv-2',
      clientName: 'David',
      status: 'sent',
      totalTTC: 800,
      issueDate: '2026-07-20',
      dueDate: null,
      paymentDate: null,
      paymentAccountId: null,
      prospectId: 'p-planned',
    },
    {
      id: 'inv-3',
      clientName: 'Client hors CRM',
      status: 'paid',
      totalTTC: 400,
      issueDate: '2026-07-02',
      dueDate: null,
      paymentDate: '2026-07-10',
      paymentAccountId: 'pro',
      prospectId: null,
    },
    {
      id: 'inv-4',
      clientName: 'Alice',
      status: 'overdue',
      totalTTC: 150,
      issueDate: '2026-06-15',
      dueDate: '2026-07-01',
      paymentDate: null,
      paymentAccountId: null,
      prospectId: 'p-hot',
    },
  ],
  transactions: [],
  recurringCharges: [],
  areMonths: [],
  prospects: [
    prospect('p-hot', 'Alice', { temperature: 'hot', createdAt: '2026-07-01' }),
    prospect('p-warm', 'Bruno', { temperature: 'warm', createdAt: '2026-07-06' }),
    prospect('p-cold', 'Chloé', { temperature: 'cold', createdAt: '2026-07-20' }),
    prospect('p-planned', 'David', { createdAt: '2026-06-10', nextFollowUpDate: '2026-08-03' }),
    prospect('p-signed', 'Elena', { temperature: 'hot', status: 'signed', createdAt: '2026-05-02' }),
    prospect('p-lost', 'Farid', { temperature: 'cold', status: 'lost', createdAt: '2026-06-01' }),
  ],
  interactions: [
    contact('i-1', 'p-hot', '2026-07-15'),
    contact('i-2', 'p-warm', '2026-07-06'),
    contact('i-3', 'p-planned', '2026-07-25'),
    contact('i-4', 'p-signed', '2026-05-10'),
  ],
  opportunities: [],
  stageChanges: [],
  tasks: [],
});

const byName = (data: FinanceData, name: string) =>
  buildProspectFollowUps(data, TODAY).find((followUp) => followUp.prospect.name === name)!;

describe('arithmétique des jours', () => {
  it('franchit les fins d’année', () => {
    expect(addDays('2026-12-30', 5)).toBe('2027-01-04');
    expect(addDays('2027-01-04', -5)).toBe('2026-12-30');
  });

  it('compte les jours dans les deux sens', () => {
    expect(daysBetween('2026-07-27', '2026-09-18')).toBe(53);
    expect(daysBetween('2026-07-27', '2026-07-22')).toBe(-5);
    expect(daysBetween('2026-07-27', '2026-07-27')).toBe(0);
  });

  it('donne la date locale et non la date UTC', () => {
    // 00 h 30 heure française : en UTC on serait encore la veille.
    expect(todayISO(new Date(2026, 6, 27, 0, 30))).toBe('2026-07-27');
    expect(getCurrentMonth(new Date(2026, 7, 1, 0, 30))).toBe('2026-08');
  });
});

describe('échéance de relance', () => {
  it('déduit l’échéance du dernier contact et du délai de la température', () => {
    const alice = byName(portfolio(), 'Alice');

    // Dernier contact le 15 juillet, délai « chaud » de 7 jours.
    expect(alice.dueDate).toBe('2026-07-22');
    expect(alice.inferred).toBe(true);
    expect(alice.urgency).toBe('overdue');
    expect(alice.daysUntilDue).toBe(-5);
    expect(alice.daysSinceLastContact).toBe(12);
  });

  it('signale la relance du jour', () => {
    const bruno = byName(portfolio(), 'Bruno');

    expect(bruno.dueDate).toBe('2026-07-27');
    expect(bruno.urgency).toBe('today');
    expect(bruno.daysUntilDue).toBe(0);
  });

  it('part de la date d’ajout quand aucun contact n’a eu lieu', () => {
    const chloe = byName(portfolio(), 'Chloé');

    // Ajoutée le 20 juillet, délai « froid » de 60 jours.
    expect(chloe.dueDate).toBe('2026-09-18');
    expect(chloe.urgency).toBe('upcoming');
    expect(chloe.daysSinceLastContact).toBeNull();
    expect(chloe.interactionCount).toBe(0);
  });

  it('donne la priorité à la date posée à la main', () => {
    const david = byName(portfolio(), 'David');

    expect(david.dueDate).toBe('2026-08-03');
    expect(david.inferred).toBe(false);
    expect(david.daysUntilDue).toBe(7);
  });

  it('ne relance ni les signés ni les perdus sans date explicite', () => {
    expect(byName(portfolio(), 'Elena').dueDate).toBeNull();
    expect(byName(portfolio(), 'Elena').urgency).toBeNull();
    expect(byName(portfolio(), 'Farid').dueDate).toBeNull();
  });

  it('relance un client signé dès qu’une date est posée', () => {
    const data = updateProspect(portfolio(), 'p-signed', { nextFollowUpDate: '2026-07-20' });

    const elena = byName(data, 'Elena');
    expect(elena.dueDate).toBe('2026-07-20');
    expect(elena.urgency).toBe('overdue');
  });

  it('classe les échéances les plus anciennes en tête, sans échéance en fin', () => {
    expect(buildProspectFollowUps(portfolio(), TODAY).map((followUp) => followUp.prospect.name)).toEqual([
      'Alice',
      'Bruno',
      'David',
      'Chloé',
      'Elena',
      'Farid',
    ]);
  });

  it('ne retient comme à traiter que le retard et le jour même', () => {
    expect(listDueFollowUps(portfolio(), TODAY).map((followUp) => followUp.prospect.name)).toEqual(['Alice', 'Bruno']);
  });
});

describe('chiffre d’affaires rattaché', () => {
  it('sépare l’encaissé de l’attendu et ignore les factures sans prospect', () => {
    const revenues = revenueByProspect(portfolio().invoices);

    expect(revenues.get('p-signed')).toEqual({ collected: 1200, pending: 0 });
    expect(revenues.get('p-planned')).toEqual({ collected: 0, pending: 800 });
    // Une facture en retard de paiement reste du CA attendu.
    expect(revenues.get('p-hot')).toEqual({ collected: 0, pending: 150 });
    expect(revenues.size).toBe(3);
  });
});

describe('synthèse du portefeuille', () => {
  const summary = summarizeCrm(portfolio(), TODAY);

  it('compte les relations par statut', () => {
    expect(summary.total).toBe(6);
    expect(summary.active).toBe(4);
    expect(summary.signed).toBe(1);
    expect(summary.lost).toBe(1);
  });

  it('ne qualifie par température que les relations ouvertes', () => {
    expect(summary.byTemperature).toEqual({ hot: 1, warm: 2, cold: 1 });
  });

  it('remonte les relances dues et les prospects jamais contactés', () => {
    expect(summary.overdue).toBe(1);
    expect(summary.dueToday).toBe(1);
    expect(summary.neverContacted).toBe(1);
  });

  it('totalise le CA signé et le CA attendu', () => {
    expect(summary.signedCollectedRevenue).toBe(1200);
    expect(summary.pendingRevenue).toBe(950);
  });
});

describe('opérations CRM', () => {
  it('ajoute un prospect actif daté du jour', () => {
    const data = addProspect(portfolio(), { name: '  Gaëlle  ', temperature: 'hot', company: ' Studio ' });
    const created = data.prospects[0];

    expect(created.name).toBe('Gaëlle');
    expect(created.company).toBe('Studio');
    expect(created.status).toBe('active');
    expect(created.createdAt).toBe(todayISO());
    expect(data.prospects).toHaveLength(7);
  });

  it('repositionne la relance à l’enregistrement d’un contact', () => {
    const data = logInteraction(portfolio(), {
      prospectId: 'p-hot',
      date: '2026-07-26',
      channel: 'phone',
      note: 'Rappelé, revient vers moi',
      nextFollowUpDate: '2026-08-10',
    });

    const alice = byName(data, 'Alice');
    expect(alice.dueDate).toBe('2026-08-10');
    expect(alice.inferred).toBe(false);
    expect(alice.lastInteraction?.channel).toBe('phone');
    expect(alice.interactionCount).toBe(2);
  });

  it('rend la main au délai automatique quand aucune date n’est posée', () => {
    // La date manuelle est effacée : l'échéance repart du contact du jour.
    const data = logInteraction(portfolio(), {
      prospectId: 'p-planned',
      date: TODAY,
      channel: 'meeting',
      nextFollowUpDate: null,
    });

    const david = byName(data, 'David');
    expect(david.prospect.nextFollowUpDate).toBeNull();
    expect(david.inferred).toBe(true);
    expect(david.dueDate).toBe('2026-08-17');
  });

  it('ignore un contact enregistré sur un prospect inconnu', () => {
    const data = logInteraction(portfolio(), { prospectId: 'inconnu', date: TODAY, channel: 'email' });

    expect(data.interactions).toHaveLength(4);
  });

  it('supprime l’historique avec le prospect mais conserve les factures', () => {
    const data = deleteProspect(portfolio(), 'p-hot');

    expect(data.prospects.map((item) => item.id)).not.toContain('p-hot');
    expect(data.interactions.some((item) => item.prospectId === 'p-hot')).toBe(false);
    // La facture reste, simplement détachée : elle porte du CA réel.
    expect(data.invoices.find((invoice) => invoice.id === 'inv-4')?.prospectId).toBeNull();
    expect(data.invoices).toHaveLength(4);
  });

  it('supprime aussi les opportunités du prospect, leur historique de stades et leurs tâches', () => {
    const withOpportunity = addOpportunity(portfolio(), {
      prospectId: 'p-hot',
      title: 'Automatisation reporting',
      pipeline: 'projet',
      stageId: 'discovery',
      createdAt: TODAY,
    });
    const opportunityId = withOpportunity.opportunities[0].id;
    const withTask = addTask(withOpportunity, {
      prospectId: 'p-hot',
      opportunityId,
      label: 'Envoyer le devis',
      dueDate: TODAY,
    });

    const data = deleteProspect(withTask, 'p-hot');

    expect(data.opportunities.some((opportunity) => opportunity.prospectId === 'p-hot')).toBe(false);
    expect(data.stageChanges.some((change) => change.opportunityId === opportunityId)).toBe(false);
    expect(data.tasks.some((task) => task.prospectId === 'p-hot')).toBe(false);
  });

  it('supprime un contact isolé de l’historique', () => {
    const data = deleteInteraction(portfolio(), 'i-1');

    expect(data.interactions).toHaveLength(3);
    // Sans ce contact, l'échéance repart de la date d'ajout.
    expect(byName(data, 'Alice').dueDate).toBe('2026-07-08');
  });

  it('vide un champ texte remis à blanc', () => {
    const data = updateProspect(portfolio(), 'p-hot', { company: '   ' });

    expect(data.prospects.find((item) => item.id === 'p-hot')?.company).toBeNull();
  });
});

describe('R8 — pas de relance concurrente entre réseau et affaire ouverte', () => {
  it('exclut du nurturing réseau un prospect qui porte une opportunité ouverte', () => {
    const withOpportunity = addOpportunity(portfolio(), {
      prospectId: 'p-hot',
      title: 'Automatisation reporting',
      pipeline: 'projet',
      stageId: 'discovery',
      createdAt: '2026-07-20',
    });

    // Toujours visible côté température brute (fonction générique inchangée)...
    expect(buildProspectFollowUps(withOpportunity, TODAY).some((followUp) => followUp.prospect.id === 'p-hot')).toBe(true);
    expect(listDueFollowUps(withOpportunity, TODAY).some((followUp) => followUp.prospect.id === 'p-hot')).toBe(true);

    // ...mais plus dans le nurturing réseau, désormais piloté par l'affaire.
    expect(networkFollowUps(withOpportunity, TODAY).some((followUp) => followUp.prospect.id === 'p-hot')).toBe(false);
    expect(listDueNetworkFollowUps(withOpportunity, TODAY).some((followUp) => followUp.prospect.id === 'p-hot')).toBe(false);
  });

  it('retire ce prospect du compteur « en retard » de summarizeCrm', () => {
    expect(summarizeCrm(portfolio(), TODAY).overdue).toBe(1); // Alice, en retard sur la seule température

    const withOpportunity = addOpportunity(portfolio(), {
      prospectId: 'p-hot',
      title: 'Automatisation reporting',
      pipeline: 'projet',
      stageId: 'discovery',
      createdAt: '2026-07-20',
    });

    expect(summarizeCrm(withOpportunity, TODAY).overdue).toBe(0);
  });

  it('redevient couvert par le nurturing réseau une fois l’affaire close', () => {
    const withOpportunity = addOpportunity(portfolio(), {
      prospectId: 'p-hot',
      title: 'Automatisation reporting',
      pipeline: 'projet',
      stageId: 'negotiation',
      amount: 3000,
      createdAt: '2026-07-20',
    });
    const closed = updateOpportunity(
      withOpportunity,
      withOpportunity.opportunities[0].id,
      { status: 'won', amount: 3000 },
      TODAY,
    );

    expect(networkFollowUps(closed, TODAY).some((followUp) => followUp.prospect.id === 'p-hot')).toBe(true);
  });
});
