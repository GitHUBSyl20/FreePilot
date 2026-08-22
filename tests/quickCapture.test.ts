import type { FinanceData } from '@freepilot/finance-core';
import { captureFieldProspect, defaultSettings } from '@freepilot/finance-core';
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

describe('captureFieldProspect — capture terrain (§6.6)', () => {
  it('crée le prospect, une interaction event, une opportunité identifiée et une tâche à J+2, rien d’autre', () => {
    const data = captureFieldProspect(emptyData(), {
      name: 'Julie Martin',
      company: 'Martin Conseil',
      originEvent: 'Petit-déjeuner CPME 22/08',
      note: 'Intéressée par l’automatisation de sa facturation',
      createdAt: '2026-08-22',
    });

    expect(data.prospects).toHaveLength(1);
    const [prospect] = data.prospects;
    expect(prospect).toMatchObject({ name: 'Julie Martin', company: 'Martin Conseil', source: 'Petit-déjeuner CPME 22/08' });

    expect(data.interactions).toHaveLength(1);
    expect(data.interactions[0]).toMatchObject({
      prospectId: prospect.id,
      channel: 'event',
      date: '2026-08-22',
      note: 'Intéressée par l’automatisation de sa facturation',
    });

    expect(data.opportunities).toHaveLength(1);
    const [opportunity] = data.opportunities;
    expect(opportunity).toMatchObject({ prospectId: prospect.id, stageId: 'identified', status: 'open' });

    // Le premier stade est lui aussi journalisé, comme pour toute création.
    expect(data.stageChanges).toHaveLength(1);
    expect(data.stageChanges[0]).toMatchObject({ opportunityId: opportunity.id, fromStageId: null, toStageId: 'identified' });

    expect(data.tasks).toHaveLength(1);
    expect(data.tasks[0]).toMatchObject({
      prospectId: prospect.id,
      opportunityId: opportunity.id,
      dueDate: '2026-08-24', // J+2
      status: 'open',
    });
  });

  it('accepte une capture minimale, sans entreprise ni événement ni note', () => {
    const data = captureFieldProspect(emptyData(), { name: 'Contact rapide', createdAt: '2026-08-22' });

    expect(data.prospects[0]).toMatchObject({ name: 'Contact rapide', company: null, source: null });
    expect(data.interactions[0].note).toBe('');
    expect(data.opportunities[0].originEvent).toBeNull();
  });
});
