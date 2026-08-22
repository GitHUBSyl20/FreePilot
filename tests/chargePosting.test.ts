import type { FinanceData } from '@freepilot/finance-core';
import {
  calculateAccountBalances,
  chargeTransactionId,
  defaultSettings,
  postDueRecurringCharges,
  projectMonthlyOutlook,
  sumRecurringCharges,
  updateRecurringCharge,
  variableExpensesForMonth,
} from '@freepilot/finance-core';
import { describe, expect, it } from 'vitest';

/**
 * Deux charges actives — une perso avec jour de prélèvement, une pro sans —
 * et une suspendue, qui ne doit jamais engendrer d'échéance.
 */
const scenario = (overrides: Partial<FinanceData> = {}): FinanceData => ({
  version: 5,
  recurringChargeAutoPostFrom: null,
  settings: defaultSettings,
  accounts: [
    { id: 'pro', name: 'Compte pro', kind: 'professional', openingBalance: 0 },
    { id: 'perso', name: 'Compte perso', kind: 'personal', openingBalance: 0 },
  ],
  invoices: [],
  transactions: [],
  recurringCharges: [
    { id: 'loyer', label: 'Loyer', amount: 700, scope: 'personal', dayOfMonth: 5, active: true },
    { id: 'outils', label: 'Outils', amount: 60, scope: 'professional', dayOfMonth: null, active: true },
    { id: 'pause', label: 'Abonnement suspendu', amount: 999, scope: 'personal', dayOfMonth: 10, active: false },
  ],
  areMonths: [{ month: '2026-08', fullMonthlyARE: 1416, actualARE: null }],
  prospects: [],
  interactions: [],
  opportunities: [],
  stageChanges: [],
  tasks: [],
  ...overrides,
});

const generated = (data: FinanceData) => data.transactions.filter((transaction) => transaction.recurringChargeId);

describe('postDueRecurringCharges', () => {
  it('démarre sur le mois courant sans remonter le passé', () => {
    // Les mois antérieurs sont déjà absorbés par les soldes d'ouverture :
    // les recréer compterait la même sortie deux fois.
    const posted = postDueRecurringCharges(scenario(), '2026-08');

    expect(posted.recurringChargeAutoPostFrom).toBe('2026-08');
    expect(generated(posted).map((transaction) => transaction.date).sort()).toEqual(['2026-08-01', '2026-08-05']);
  });

  it('ignore les charges suspendues', () => {
    const posted = postDueRecurringCharges(scenario(), '2026-08');

    expect(generated(posted).some((transaction) => transaction.recurringChargeId === 'pause')).toBe(false);
  });

  it('ne crée rien de plus au second passage', () => {
    const once = postDueRecurringCharges(scenario(), '2026-08');
    const twice = postDueRecurringCharges(once, '2026-08');

    // La même référence : l'appelant sait ainsi qu'il n'a rien à enregistrer.
    expect(twice).toBe(once);
  });

  it('rattrape les mois écoulés depuis le démarrage', () => {
    const posted = postDueRecurringCharges(scenario({ recurringChargeAutoPostFrom: '2026-06' }), '2026-08');

    // Deux charges actives sur juin, juillet et août.
    expect(generated(posted)).toHaveLength(6);
    expect(generated(posted).filter((transaction) => transaction.date.startsWith('2026-07'))).toHaveLength(2);
  });

  it('ramène un jour de prélèvement au dernier jour du mois', () => {
    const data = scenario({
      recurringChargeAutoPostFrom: '2026-02',
      recurringCharges: [{ id: 'assurance', label: 'Assurance', amount: 30, scope: 'personal', dayOfMonth: 31, active: true }],
    });
    const posted = postDueRecurringCharges(data, '2026-04');

    // Février 2026 compte 28 jours, avril en compte 30.
    expect(generated(posted).map((transaction) => transaction.date).sort()).toEqual([
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });

  it('impute la charge sur le compte correspondant à son rattachement', () => {
    const posted = postDueRecurringCharges(scenario(), '2026-08');
    const byCharge = Object.fromEntries(generated(posted).map((transaction) => [transaction.recurringChargeId, transaction]));

    expect(byCharge.loyer.fromAccountId).toBe('perso');
    expect(byCharge.outils.fromAccountId).toBe('pro');
    expect(byCharge.loyer.id).toBe(chargeTransactionId('loyer', '2026-08'));
  });

  it('fait enfin peser les charges sur les soldes de comptes', () => {
    const posted = postDueRecurringCharges(scenario(), '2026-08');
    const balances = calculateAccountBalances(posted);

    expect(balances.find((account) => account.id === 'perso')?.balance).toBe(-700);
    expect(balances.find((account) => account.id === 'pro')?.balance).toBe(-60);
  });

  it('laisse les données intactes quand le mois courant est illisible', () => {
    const data = scenario();

    expect(postDueRecurringCharges(data, 'pas-un-mois')).toBe(data);
  });
});

describe('compte prélevé', () => {
  it('prime sur le rattachement', () => {
    // Un abonnement de nature professionnelle peut très bien sortir du compte
    // personnel : c'est le cas courant quand il n'y a qu'une seule carte.
    const data = scenario({
      recurringCharges: [
        { id: 'outils', label: 'Outils', amount: 60, scope: 'professional', paymentAccountId: 'perso', dayOfMonth: 1, active: true },
      ],
    });
    const posted = postDueRecurringCharges(data, '2026-08');

    expect(generated(posted)[0].fromAccountId).toBe('perso');
    // La nature reste professionnelle : c'est elle qui alimente le détail
    // pro / perso des charges fixes.
    expect(sumRecurringCharges(posted.recurringCharges).professional).toBe(60);
  });

  it('retombe sur le rattachement quand le compte désigné a disparu', () => {
    const data = scenario({
      recurringCharges: [
        { id: 'outils', label: 'Outils', amount: 60, scope: 'professional', paymentAccountId: 'compte-supprimé', dayOfMonth: 1, active: true },
      ],
    });
    const posted = postDueRecurringCharges(data, '2026-08');

    expect(generated(posted)[0].fromAccountId).toBe('pro');
  });

  it('repointe les échéances déjà posées quand on corrige le compte', () => {
    const posted = postDueRecurringCharges(scenario(), '2026-08');
    const corrected = updateRecurringCharge(posted, 'outils', { paymentAccountId: 'perso' });
    const balances = calculateAccountBalances(corrected);

    expect(balances.find((account) => account.id === 'pro')?.balance).toBe(0);
    expect(balances.find((account) => account.id === 'perso')?.balance).toBe(-760);
  });

  it('renomme aussi les échéances déjà posées', () => {
    // Renommer une charge corrige une saisie : laisser le passé sous l'ancien
    // nom rendrait l'historique illisible.
    const posted = postDueRecurringCharges(scenario(), '2026-08');
    const renamed = updateRecurringCharge(posted, 'outils', { label: 'Abonnements en ligne' });

    expect(generated(renamed).find((transaction) => transaction.recurringChargeId === 'outils')?.label).toBe(
      'Abonnements en ligne',
    );
  });

  it('ne propage pas un changement de montant aux échéances passées', () => {
    // Un prélèvement déjà passé a eu le montant qu'il a eu ; seul l'avenir
    // suit le nouveau montant.
    const posted = postDueRecurringCharges(scenario(), '2026-08');
    const repriced = updateRecurringCharge(posted, 'outils', { amount: 75 });

    expect(generated(repriced).find((transaction) => transaction.recurringChargeId === 'outils')?.amount).toBe(60);
  });

  it('ne touche pas aux échéances quand ni le libellé ni le compte ne changent', () => {
    const posted = postDueRecurringCharges(scenario(), '2026-08');
    const moved = updateRecurringCharge(posted, 'outils', { dayOfMonth: 12 });

    expect(moved.transactions).toEqual(posted.transactions);
  });
});

describe('charges générées et double comptage', () => {
  const withVariableExpense = () =>
    scenario({
      transactions: [
        { id: 'tx-1', kind: 'expense', label: 'Matériel', amount: 250, date: '2026-08-12', fromAccountId: 'pro', toAccountId: null },
      ],
    });

  it('exclut les échéances de charge des dépenses ponctuelles', () => {
    const posted = postDueRecurringCharges(withVariableExpense(), '2026-08');

    // Seule la dépense réellement ponctuelle est comptée ici : les 760 € de
    // charges sont déjà portés par le total des charges fixes.
    expect(variableExpensesForMonth(posted, '2026-08')).toBe(250);
    expect(sumRecurringCharges(posted.recurringCharges).total).toBe(760);
  });

  it('ne fait pas peser une charge deux fois sur le reste à vivre', () => {
    const posted = postDueRecurringCharges(withVariableExpense(), '2026-08');
    const outlook = projectMonthlyOutlook(posted, '2026-08');

    // Aucun CA : trésorerie = ARE pleine de 1 416 €.
    // 1 416 − 0 d'impôt − 760 de charges fixes − 250 de dépense ponctuelle.
    expect(outlook.cashflow.netFinal.value).toBe(1416);
    expect(outlook.resteAVivre.value).toBe(406);
  });
});
