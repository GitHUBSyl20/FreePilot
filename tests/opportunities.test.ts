import type { FinanceData, Task } from '@freepilot/finance-core';
import {
  addOpportunity,
  checkOpportunityStatusTransition,
  defaultSettings,
  deleteOpportunity,
  opportunitiesForProspect,
  opportunitiesMissingNextAction,
  opportunitiesPastCloseDate,
  updateOpportunity,
} from '@freepilot/finance-core';
import { describe, expect, it } from 'vitest';

const TODAY = '2026-07-27';

const task = (id: string, opportunityId: string | null, overrides: Partial<Task> = {}): Task => ({
  id,
  prospectId: 'p-1',
  opportunityId,
  label: 'Tâche',
  dueDate: TODAY,
  priority: 'normal',
  status: 'open',
  completedAt: null,
  createdAt: TODAY,
  ...overrides,
});

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

describe('addOpportunity', () => {
  it('hérite la probabilité par défaut du stade et journalise le premier stade', () => {
    const data = addOpportunity(emptyData(), {
      prospectId: 'p-1',
      title: '  Automatisation reporting  ',
      pipeline: 'projet',
      stageId: 'discovery',
      amount: 3000,
      createdAt: TODAY,
    });

    const [created] = data.opportunities;
    expect(created.title).toBe('Automatisation reporting');
    expect(created.probability).toBe(20); // stade « discovery » du pipeline projet
    expect(created.probabilityOverride).toBe(false);
    expect(created.status).toBe('open');

    expect(data.stageChanges).toHaveLength(1);
    expect(data.stageChanges[0]).toMatchObject({
      opportunityId: created.id,
      fromStageId: null,
      toStageId: 'discovery',
      date: TODAY,
      daysInPreviousStage: null,
    });
  });

  it('fige la probabilité sur une saisie manuelle', () => {
    const data = addOpportunity(emptyData(), {
      prospectId: 'p-1',
      title: 'Formation Excel',
      pipeline: 'formation',
      stageId: 'identified',
      probability: 35,
      createdAt: TODAY,
    });

    expect(data.opportunities[0].probability).toBe(35);
    expect(data.opportunities[0].probabilityOverride).toBe(true);
  });

  it('ne laisse jamais le pipeline partenariat porter un montant ou une probabilité', () => {
    const data = addOpportunity(emptyData(), {
      prospectId: 'p-1',
      title: 'Prescripteur potentiel',
      pipeline: 'partenariat',
      stageId: 'identified',
      amount: 5000,
      probability: 80,
      createdAt: TODAY,
    });

    expect(data.opportunities[0].amount).toBe(0);
    expect(data.opportunities[0].probability).toBe(0);
    expect(data.opportunities[0].probabilityOverride).toBe(false);
  });
});

describe('updateOpportunity — changement de stade et probabilité (R4, R6)', () => {
  const withOpen = () =>
    addOpportunity(emptyData(), {
      prospectId: 'p-1',
      title: 'Audit automatisation',
      pipeline: 'projet',
      stageId: 'discovery',
      amount: 4000,
      createdAt: '2026-07-01',
    });

  it('recalcule la probabilité au changement de stade quand rien n’a été figé', () => {
    const opened = withOpen();
    const opportunityId = opened.opportunities[0].id;

    const data = updateOpportunity(opened, opportunityId, { stageId: 'scoping' }, TODAY);

    expect(data.opportunities[0].probability).toBe(35); // stade « scoping »
    expect(data.opportunities[0].probabilityOverride).toBe(false);
  });

  it('ne recalcule plus la probabilité une fois qu’elle a été saisie à la main', () => {
    const opened = withOpen();
    const opportunityId = opened.opportunities[0].id;
    const overridden = updateOpportunity(opened, opportunityId, { probability: 90 }, '2026-07-10');

    const data = updateOpportunity(overridden, opportunityId, { stageId: 'proposal' }, TODAY);

    expect(data.opportunities[0].probability).toBe(90);
    expect(data.opportunities[0].probabilityOverride).toBe(true);
  });

  it('revient à la probabilité automatique du stade sur probabilityOverride: false explicite', () => {
    const opened = withOpen(); // stade « discovery », 20 %
    const opportunityId = opened.opportunities[0].id;
    const overridden = updateOpportunity(opened, opportunityId, { probability: 90 }, '2026-07-10');

    const reverted = updateOpportunity(overridden, opportunityId, { probabilityOverride: false }, TODAY);

    expect(reverted.opportunities[0].probability).toBe(20); // stade courant, toujours « discovery »
    expect(reverted.opportunities[0].probabilityOverride).toBe(false);
  });

  it('ignore probabilityOverride: false si une probabilité est fournie dans le même appel', () => {
    const opened = withOpen();
    const opportunityId = opened.opportunities[0].id;

    const data = updateOpportunity(opened, opportunityId, { probability: 65, probabilityOverride: false }, TODAY);

    expect(data.opportunities[0].probability).toBe(65);
    expect(data.opportunities[0].probabilityOverride).toBe(true);
  });

  it('journalise chaque changement de stade avec la durée passée dans le précédent', () => {
    const opened = withOpen();
    const opportunityId = opened.opportunities[0].id;

    const afterFirstMove = updateOpportunity(opened, opportunityId, { stageId: 'scoping' }, '2026-07-09');
    const afterSecondMove = updateOpportunity(afterFirstMove, opportunityId, { stageId: 'proposal' }, TODAY);

    expect(afterSecondMove.stageChanges).toHaveLength(3); // création + 2 changements
    const [latest] = afterSecondMove.stageChanges;
    expect(latest).toMatchObject({ fromStageId: 'scoping', toStageId: 'proposal', date: TODAY });
    // Du 9 au 27 juillet : 18 jours passés dans le stade « scoping ».
    expect(latest.daysInPreviousStage).toBe(18);
  });

  it('ne journalise rien quand aucun stade ne change', () => {
    const opened = withOpen();
    const opportunityId = opened.opportunities[0].id;

    const data = updateOpportunity(opened, opportunityId, { amount: 4500 }, TODAY);

    expect(data.stageChanges).toHaveLength(1);
    expect(data.opportunities[0].amount).toBe(4500);
  });
});

describe('checkOpportunityStatusTransition et updateOpportunity — sortie contrôlée (R3)', () => {
  const opened = () =>
    addOpportunity(emptyData(), {
      prospectId: 'p-1',
      title: 'Mission cadrage',
      pipeline: 'projet',
      stageId: 'negotiation',
      amount: 0,
      createdAt: '2026-07-01',
    });

  it('refuse un gain sans montant', () => {
    const data = opened();
    const opportunity = data.opportunities[0];

    expect(checkOpportunityStatusTransition(opportunity, { status: 'won' }, TODAY)).toBe('wonRequiresAmountAndDate');

    const unchanged = updateOpportunity(data, opportunity.id, { status: 'won' }, TODAY);
    expect(unchanged).toBe(data);
  });

  it('accepte un gain avec montant, en datant du jour par défaut', () => {
    const data = opened();
    const opportunity = data.opportunities[0];

    const won = updateOpportunity(data, opportunity.id, { status: 'won', amount: 6000 }, TODAY);

    expect(won.opportunities[0]).toMatchObject({ status: 'won', amount: 6000, statusDate: TODAY });
  });

  it('refuse une perte sans motif', () => {
    const data = opened();
    const opportunity = data.opportunities[0];

    expect(checkOpportunityStatusTransition(opportunity, { status: 'lost' }, TODAY)).toBe('lostRequiresReason');
    expect(updateOpportunity(data, opportunity.id, { status: 'lost' }, TODAY)).toBe(data);
  });

  it('accepte une perte avec motif', () => {
    const data = opened();
    const opportunity = data.opportunities[0];

    const lost = updateOpportunity(data, opportunity.id, { status: 'lost', lossReason: 'noBudget' }, TODAY);

    expect(lost.opportunities[0]).toMatchObject({ status: 'lost', lossReason: 'noBudget', statusDate: TODAY });
  });

  it('efface le motif de perte quand l’affaire est rouverte', () => {
    const data = opened();
    const opportunity = data.opportunities[0];
    const lost = updateOpportunity(data, opportunity.id, { status: 'lost', lossReason: 'timing' }, TODAY);

    const reopened = updateOpportunity(lost, opportunity.id, { status: 'open' }, TODAY);

    expect(reopened.opportunities[0]).toMatchObject({ status: 'open', lossReason: null, statusDate: null });
  });
});

describe('R1 — prochaine action obligatoire', () => {
  it('remonte une opportunité ouverte sans tâche ouverte, sans bloquer son enregistrement', () => {
    const withOpp = addOpportunity(emptyData(), {
      prospectId: 'p-1',
      title: 'Sans action',
      pipeline: 'projet',
      stageId: 'identified',
      createdAt: TODAY,
    });

    expect(opportunitiesMissingNextAction(withOpp)).toHaveLength(1);
  });

  it('ne remonte plus l’opportunité une fois une tâche ouverte posée', () => {
    const withOpp = addOpportunity(emptyData(), {
      prospectId: 'p-1',
      title: 'Avec action',
      pipeline: 'projet',
      stageId: 'identified',
      createdAt: TODAY,
    });
    const opportunityId = withOpp.opportunities[0].id;
    const data: FinanceData = { ...withOpp, tasks: [task('t-1', opportunityId)] };

    expect(opportunitiesMissingNextAction(data)).toHaveLength(0);
  });

  it('une tâche déjà faite ou annulée ne compte pas comme prochaine action', () => {
    const withOpp = addOpportunity(emptyData(), {
      prospectId: 'p-1',
      title: 'Tâche close',
      pipeline: 'projet',
      stageId: 'identified',
      createdAt: TODAY,
    });
    const opportunityId = withOpp.opportunities[0].id;
    const data: FinanceData = { ...withOpp, tasks: [task('t-1', opportunityId, { status: 'done' })] };

    expect(opportunitiesMissingNextAction(data)).toHaveLength(1);
  });
});

describe('R7 — clôture dépassée', () => {
  it('signale une échéance dépassée sur une affaire encore ouverte', () => {
    const withOpp = addOpportunity(emptyData(), {
      prospectId: 'p-1',
      title: 'En retard',
      pipeline: 'projet',
      stageId: 'proposal',
      expectedCloseDate: '2026-07-01',
      createdAt: '2026-06-01',
    });

    expect(opportunitiesPastCloseDate(withOpp, TODAY)).toHaveLength(1);
  });

  it('ignore une affaire déjà close, même en retard', () => {
    const withOpp = addOpportunity(emptyData(), {
      prospectId: 'p-1',
      title: 'Perdue',
      pipeline: 'projet',
      stageId: 'proposal',
      expectedCloseDate: '2026-07-01',
      createdAt: '2026-06-01',
    });
    const closed = updateOpportunity(
      withOpp,
      withOpp.opportunities[0].id,
      { status: 'lost', lossReason: 'timing' },
      TODAY,
    );

    expect(opportunitiesPastCloseDate(closed, TODAY)).toHaveLength(0);
  });

  it('ignore une échéance encore à venir', () => {
    const withOpp = addOpportunity(emptyData(), {
      prospectId: 'p-1',
      title: 'À temps',
      pipeline: 'projet',
      stageId: 'proposal',
      expectedCloseDate: '2026-08-15',
      createdAt: '2026-06-01',
    });

    expect(opportunitiesPastCloseDate(withOpp, TODAY)).toHaveLength(0);
  });
});

describe('deleteOpportunity', () => {
  it('supprime les tâches et l’historique de stades liés, sans toucher aux interactions', () => {
    const withOpp = addOpportunity(emptyData(), {
      prospectId: 'p-1',
      title: 'À supprimer',
      pipeline: 'projet',
      stageId: 'identified',
      createdAt: TODAY,
    });
    const opportunityId = withOpp.opportunities[0].id;
    const data: FinanceData = {
      ...withOpp,
      tasks: [task('t-1', opportunityId)],
      interactions: [{ id: 'i-1', prospectId: 'p-1', date: TODAY, channel: 'email', note: '' }],
    };

    const result = deleteOpportunity(data, opportunityId);

    expect(result.opportunities).toHaveLength(0);
    expect(result.stageChanges).toHaveLength(0);
    expect(result.tasks).toHaveLength(0);
    expect(result.interactions).toHaveLength(1);
  });
});

describe('opportunitiesForProspect', () => {
  it('trie les opportunités d’un prospect des plus récentes aux plus anciennes', () => {
    const first = addOpportunity(emptyData(), {
      prospectId: 'p-1',
      title: 'Ancienne',
      pipeline: 'projet',
      stageId: 'identified',
      createdAt: '2026-05-01',
    });
    const both = addOpportunity(first, {
      prospectId: 'p-1',
      title: 'Récente',
      pipeline: 'formation',
      stageId: 'identified',
      createdAt: '2026-07-01',
    });
    const withOther = addOpportunity(both, {
      prospectId: 'p-2',
      title: 'Autre prospect',
      pipeline: 'projet',
      stageId: 'identified',
      createdAt: '2026-07-15',
    });

    expect(opportunitiesForProspect(withOther, 'p-1').map((opportunity) => opportunity.title)).toEqual([
      'Récente',
      'Ancienne',
    ]);
  });
});
