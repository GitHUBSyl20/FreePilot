import type { FinanceData } from '@freepilot/finance-core';
import {
  addOpportunity,
  addTask,
  cancelTask,
  completeTask,
  defaultSettings,
  deleteTask,
  dormantOpportunities,
  dueTasks,
  openTasksForOpportunity,
  openTasksForProspect,
  suggestNextTask,
  updateTask,
} from '@freepilot/finance-core';
import { describe, expect, it } from 'vitest';

const TODAY = '2026-07-27';

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

describe('addTask / updateTask / cycle de vie', () => {
  it('crée une tâche ouverte, datée et priorisée', () => {
    const data = addTask(emptyData(), {
      prospectId: 'p-1',
      opportunityId: 'o-1',
      label: '  Envoyer le devis  ',
      dueDate: '2026-08-01',
      priority: 'high',
    });

    expect(data.tasks[0]).toMatchObject({
      prospectId: 'p-1',
      opportunityId: 'o-1',
      label: 'Envoyer le devis',
      dueDate: '2026-08-01',
      priority: 'high',
      status: 'open',
      completedAt: null,
    });
  });

  it('complète puis peut rouvrir une tâche', () => {
    const created = addTask(emptyData(), { prospectId: 'p-1', label: 'Appeler', dueDate: TODAY });
    const taskId = created.tasks[0].id;

    const done = completeTask(created, taskId, TODAY);
    expect(done.tasks[0]).toMatchObject({ status: 'done', completedAt: TODAY });
  });

  it('annule une tâche sans lui laisser de date de complétion', () => {
    const created = addTask(emptyData(), { prospectId: 'p-1', label: 'Appeler', dueDate: TODAY });
    const cancelled = cancelTask(created, created.tasks[0].id);

    expect(cancelled.tasks[0]).toMatchObject({ status: 'cancelled', completedAt: null });
  });

  it('modifie le libellé et l’échéance sans toucher au reste', () => {
    const created = addTask(emptyData(), { prospectId: 'p-1', label: 'Appeler', dueDate: TODAY, priority: 'low' });
    const updated = updateTask(created, created.tasks[0].id, { label: 'Rappeler demain', dueDate: '2026-07-28' });

    expect(updated.tasks[0]).toMatchObject({ label: 'Rappeler demain', dueDate: '2026-07-28', priority: 'low' });
  });

  it('supprime une tâche', () => {
    const created = addTask(emptyData(), { prospectId: 'p-1', label: 'Appeler', dueDate: TODAY });
    expect(deleteTask(created, created.tasks[0].id).tasks).toHaveLength(0);
  });
});

describe('dueTasks', () => {
  it('ne retient que les tâches ouvertes en retard ou dues du jour, priorité haute en tête', () => {
    let data = addTask(emptyData(), { prospectId: 'p-1', label: 'En retard', dueDate: '2026-07-20', priority: 'normal' });
    data = addTask(data, { prospectId: 'p-1', label: 'Aujourd’hui, urgent', dueDate: TODAY, priority: 'high' });
    data = addTask(data, { prospectId: 'p-1', label: 'À venir', dueDate: '2026-08-15' });
    const doneOne = addTask(data, { prospectId: 'p-1', label: 'Déjà faite', dueDate: '2026-07-10' });
    data = completeTask(doneOne, doneOne.tasks[0].id, '2026-07-10');

    const due = dueTasks(data, TODAY);

    expect(due.map((task) => task.label)).toEqual(['En retard', 'Aujourd’hui, urgent']);
  });
});

describe('openTasksForOpportunity / openTasksForProspect', () => {
  it('filtre par opportunité et par prospect, échéance la plus proche en tête', () => {
    let data = addTask(emptyData(), { prospectId: 'p-1', opportunityId: 'o-1', label: 'B', dueDate: '2026-08-05' });
    data = addTask(data, { prospectId: 'p-1', opportunityId: 'o-1', label: 'A', dueDate: '2026-08-01' });
    data = addTask(data, { prospectId: 'p-1', opportunityId: 'o-2', label: 'Autre affaire', dueDate: '2026-08-01' });
    data = addTask(data, { prospectId: 'p-2', label: 'Autre prospect', dueDate: '2026-08-01' });

    expect(openTasksForOpportunity(data, 'o-1').map((task) => task.label)).toEqual(['A', 'B']);
    expect(openTasksForProspect(data, 'p-1').map((task) => task.label)).toHaveLength(3);
  });
});

describe('suggestNextTask — R5 cadence après un contact', () => {
  it('propose J+2, J+7, J+21, J+45 puis trimestriel selon le rang', () => {
    const fromDate = '2026-07-01';

    expect(suggestNextTask({ interactionCount: 1, fromDate }).dueDate).toBe('2026-07-03');
    expect(suggestNextTask({ interactionCount: 2, fromDate }).dueDate).toBe('2026-07-08');
    expect(suggestNextTask({ interactionCount: 3, fromDate }).dueDate).toBe('2026-07-22');
    expect(suggestNextTask({ interactionCount: 4, fromDate }).dueDate).toBe('2026-08-15');
    expect(suggestNextTask({ interactionCount: 5, fromDate }).dueDate).toBe('2026-09-29');
    // Au-delà, la cadence reste trimestrielle.
    expect(suggestNextTask({ interactionCount: 9, fromDate }).dueDate).toBe('2026-09-29');
  });

  it('propose un libellé orienté valeur, jamais « relancer »', () => {
    const suggestion = suggestNextTask({ interactionCount: 1, fromDate: '2026-07-01' });

    expect(suggestion.label.toLowerCase()).not.toContain('relancer');
    expect(suggestion.label.length).toBeGreaterThan(0);
  });
});

describe('dormantOpportunities — R2', () => {
  const withOpportunity = (pipeline: 'partenariat' | 'projet') =>
    addOpportunity(emptyData(), {
      prospectId: 'p-1',
      title: 'Test dormance',
      pipeline,
      stageId: 'identified',
      createdAt: '2026-06-01',
    });

  it('marque dormante une opportunité projet sans interaction depuis le seuil réglé', () => {
    // Seuil par défaut : 14 jours. Créée le 1er juin, on est le 27 juillet.
    const data = withOpportunity('projet');

    expect(dormantOpportunities(data, TODAY)).toHaveLength(1);
  });

  it('ne marque rien tant qu’une interaction récente existe', () => {
    const created = withOpportunity('projet');
    const data: FinanceData = {
      ...created,
      interactions: [{ id: 'i-1', prospectId: 'p-1', date: '2026-07-20', channel: 'email', note: '' }],
    };

    expect(dormantOpportunities(data, TODAY)).toHaveLength(0);
  });

  it('applique le seuil plus long du pipeline partenariat', () => {
    const created = withOpportunity('partenariat');
    // Dernier contact le 10 juillet : 17 jours, sous le seuil projet (14) mais
    // sous le seuil partenariat (30) aussi -> pas dormant.
    const data: FinanceData = {
      ...created,
      interactions: [{ id: 'i-1', prospectId: 'p-1', date: '2026-07-10', channel: 'email', note: '' }],
    };

    expect(dormantOpportunities(data, TODAY)).toHaveLength(0);
  });

  it('ignore les opportunités déjà closes', () => {
    const data = withOpportunity('projet');
    const closed: FinanceData = {
      ...data,
      opportunities: data.opportunities.map((opportunity) => ({ ...opportunity, status: 'lost', lossReason: 'timing' })),
    };

    expect(dormantOpportunities(closed, TODAY)).toHaveLength(0);
  });
});
