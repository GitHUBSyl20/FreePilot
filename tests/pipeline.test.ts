import type { FinanceData } from '@freepilot/finance-core';
import {
  addOpportunity,
  calibrateForecast,
  defaultSettings,
  mrrForecast,
  updateOpportunity,
  weightedPipelineByMonth,
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

describe('weightedPipelineByMonth', () => {
  it('répartit amount × probability par mois et par pipeline', () => {
    let data = addOpportunity(emptyData(), {
      prospectId: 'p-1',
      title: 'Formation août',
      pipeline: 'formation',
      stageId: 'proposal', // 60 %
      amount: 2000,
      expectedCloseDate: '2026-08-10',
      createdAt: '2026-07-01',
    });
    data = addOpportunity(data, {
      prospectId: 'p-2',
      title: 'Projet août',
      pipeline: 'projet',
      stageId: 'negotiation', // 75 %
      amount: 4000,
      expectedCloseDate: '2026-08-20',
      createdAt: '2026-07-01',
    });

    const [august] = weightedPipelineByMonth(data, '2026-08', 1);

    expect(august.byPipeline.formation).toBe(1200); // 2000 × 60 %
    expect(august.byPipeline.projet).toBe(3000); // 4000 × 75 %
    expect(august.total).toBe(4200);
  });

  it('exclut systématiquement le pipeline partenariat', () => {
    const data = addOpportunity(emptyData(), {
      prospectId: 'p-1',
      title: 'Prescripteur',
      pipeline: 'partenariat',
      stageId: 'active',
      amount: 999999,
      probability: 100,
      expectedCloseDate: '2026-08-10',
      createdAt: '2026-07-01',
    });

    const [august] = weightedPipelineByMonth(data, '2026-08', 1);

    expect(august.total).toBe(0);
  });

  it('exclut les affaires déjà closes et celles sans échéance', () => {
    let data = addOpportunity(emptyData(), {
      prospectId: 'p-1',
      title: 'Sans échéance',
      pipeline: 'projet',
      stageId: 'proposal',
      amount: 5000,
      createdAt: '2026-07-01',
    });
    data = addOpportunity(data, {
      prospectId: 'p-2',
      title: 'Déjà gagnée',
      pipeline: 'projet',
      stageId: 'proposal',
      amount: 5000,
      expectedCloseDate: '2026-08-10',
      createdAt: '2026-07-01',
    });
    data = updateOpportunity(data, data.opportunities[0].id, { status: 'won', amount: 5000 }, '2026-07-15');

    const [august] = weightedPipelineByMonth(data, '2026-08', 1);

    expect(august.total).toBe(0);
  });

  it('respecte une probabilité figée par saisie manuelle plutôt que celle du stade', () => {
    const data = addOpportunity(emptyData(), {
      prospectId: 'p-1',
      title: 'Probabilité corrigée',
      pipeline: 'projet',
      stageId: 'discovery', // 20 % par défaut
      amount: 10000,
      probability: 90, // saisie manuelle : R4 fige probabilityOverride
      expectedCloseDate: '2026-08-05',
      createdAt: '2026-07-01',
    });

    const [august] = weightedPipelineByMonth(data, '2026-08', 1);

    expect(august.total).toBe(9000); // 10000 × 90 %, pas 20 %
  });

  it('couvre plusieurs mois consécutifs à partir du mois de départ', () => {
    let data = addOpportunity(emptyData(), {
      prospectId: 'p-1',
      title: 'Septembre',
      pipeline: 'projet',
      stageId: 'proposal', // 55 %
      amount: 1000,
      expectedCloseDate: '2026-09-15',
      createdAt: '2026-07-01',
    });

    const months = weightedPipelineByMonth(data, '2026-08', 3);

    expect(months.map((entry) => entry.month)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(months[0].total).toBe(0);
    expect(months[1].total).toBe(550);
    expect(months[2].total).toBe(0);
  });
});

describe('mrrForecast', () => {
  it('additionne le MRR des affaires récurrentes déjà gagnées à la date donnée', () => {
    let data = addOpportunity(emptyData(), {
      prospectId: 'p-1',
      title: 'Abonnement mensuel',
      pipeline: 'projet',
      stageId: 'negotiation',
      amount: 0,
      recurring: true,
      monthlyAmount: 300,
      createdAt: '2026-06-01',
    });
    data = updateOpportunity(data, data.opportunities[0].id, { status: 'won', amount: 0 }, '2026-06-10');

    expect(mrrForecast(data, '2026-07-01')).toBe(300);
    expect(mrrForecast(data, '2026-06-05')).toBe(0); // pas encore gagnée à cette date
  });

  it('ignore une affaire gagnée mais non récurrente', () => {
    let data = addOpportunity(emptyData(), {
      prospectId: 'p-1',
      title: 'Formation ponctuelle',
      pipeline: 'formation',
      stageId: 'negotiation',
      amount: 1500,
      createdAt: '2026-06-01',
    });
    data = updateOpportunity(data, data.opportunities[0].id, { status: 'won', amount: 1500 }, '2026-06-10');

    expect(mrrForecast(data, '2026-07-01')).toBe(0);
  });
});

describe('calibrateForecast', () => {
  it('compare le pondéré rétrospectif d’un mois au CA réellement signé', () => {
    let data = addOpportunity(emptyData(), {
      prospectId: 'p-1',
      title: 'Gagnée dans les temps',
      pipeline: 'projet',
      stageId: 'negotiation',
      amount: 3000,
      expectedCloseDate: '2026-07-10',
      createdAt: '2026-06-01',
    });
    data = updateOpportunity(data, data.opportunities[0].id, { status: 'won', amount: 3000 }, '2026-07-05');

    data = addOpportunity(data, {
      prospectId: 'p-2',
      title: 'Perdue',
      pipeline: 'projet',
      stageId: 'proposal',
      amount: 2000,
      expectedCloseDate: '2026-07-15',
      createdAt: '2026-06-01',
    });
    data = updateOpportunity(data, data.opportunities[0].id, { status: 'lost', lossReason: 'timing' }, '2026-07-20');

    const calibration = calibrateForecast(data, '2026-07');

    // Gagnée : compte à 100 % (3000). Perdue : compte à 0 %. Pondéré = 3000.
    expect(calibration.forecast).toBe(3000);
    // CA réel : seule la gagnée, sur son montant réel.
    expect(calibration.actual).toBe(3000);
  });
});
