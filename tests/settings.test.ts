import type { FinanceData } from '@freepilot/finance-core';
import {
  calculateARECutoff,
  calculateAccountBalances,
  defaultSettings,
  sanitizeSettings,
  setObservedAccountBalance,
  updateAccount,
  updateSettings,
} from '@freepilot/finance-core';
import { describe, expect, it } from 'vitest';

const data = (): FinanceData => ({
  version: 4,
  recurringChargeAutoPostFrom: null,
  settings: defaultSettings,
  accounts: [
    { id: 'pro', name: 'Compte pro', kind: 'professional', openingBalance: 0 },
    { id: 'perso', name: 'Compte perso', kind: 'personal', openingBalance: 0 },
  ],
  invoices: [],
  transactions: [
    { id: 'tx-1', kind: 'income', label: 'Encaissement', amount: 800, date: '2026-06-15', fromAccountId: null, toAccountId: 'pro' },
  ],
  recurringCharges: [],
  areMonths: [],
  prospects: [],
  interactions: [],
});

describe('sanitizeSettings', () => {
  it('laisse les réglages intacts quand rien n’est fourni', () => {
    expect(sanitizeSettings(defaultSettings, {})).toEqual(defaultSettings);
  });

  it('ignore une valeur illisible plutôt que de la lire comme zéro', () => {
    // Un champ vidé le temps d'une frappe ne doit pas annuler un taux.
    const next = sanitizeSettings(defaultSettings, { areDailyAmount: Number.NaN });

    expect(next.areDailyAmount).toBe(50.39);
  });

  it('ramène une saisie hors bornes dans le domaine du possible', () => {
    const next = sanitizeSettings(defaultSettings, {
      bncAbatementRate: 340,
      areDailyAmount: -5,
      theoreticalMonthlyDays: 45,
      hotProspectFollowUpDays: 0,
    });

    expect(next.bncAbatementRate).toBe(100);
    expect(next.areDailyAmount).toBe(0);
    expect(next.theoreticalMonthlyDays).toBe(31);
    expect(next.hotProspectFollowUpDays).toBe(1);
  });

  it('arrondit les jours à l’entier et les taux au centième', () => {
    const next = sanitizeSettings(defaultSettings, { remainingAREDays: 412.7, areDailyAmount: 50.3912 });

    expect(next.remainingAREDays).toBe(413);
    expect(next.areDailyAmount).toBe(50.39);
  });

  it('déduit le total Urssaf de ses deux composantes', () => {
    const next = sanitizeSettings(defaultSettings, { urssafSocialContributionRate: 24.6 });

    expect(next.totalUrssafProvisionRate).toBe(24.8);
  });

  it('refuse un total Urssaf saisi en contradiction avec ses composantes', () => {
    // Seul le total sert au calcul de la provision : le laisser diverger
    // afficherait un détail ne correspondant à rien.
    const next = sanitizeSettings(defaultSettings, { totalUrssafProvisionRate: 99 });

    expect(next.totalUrssafProvisionRate).toBe(25.8);
  });

  it('accepte le basculement du versement libératoire', () => {
    expect(sanitizeSettings(defaultSettings, { versementLiberatoireEnabled: true }).versementLiberatoireEnabled).toBe(true);
  });
});

describe('updateSettings', () => {
  it('remplace les réglages sans toucher au reste des données', () => {
    const before = data();
    const after = updateSettings(before, { remainingAREDays: 380 });

    expect(after.settings.remainingAREDays).toBe(380);
    expect(after.transactions).toEqual(before.transactions);
    expect(after.accounts).toEqual(before.accounts);
  });

  it('propage le changement jusqu’au seuil de coupure', () => {
    // 50,39 × 30 = 1 511,70 € d'ARE pleine.
    // Par défaut : 1 511,70 / ((1 − 34 %) × 70 %) = 1 511,70 / 0,462.
    expect(calculateARECutoff(defaultSettings).value).toBe(3272.08);

    // Avec un abattement de 50 % : 1 511,70 / ((1 − 50 %) × 70 %) = 1 511,70 / 0,35.
    const after = updateSettings(data(), { bncAbatementRate: 50 });
    expect(calculateARECutoff(after.settings).value).toBe(4319.14);
  });
});

describe('updateAccount', () => {
  it('accepte un solde d’ouverture négatif', () => {
    // Il absorbe les dépenses antérieures à la première opération saisie.
    const after = updateAccount(data(), 'perso', { openingBalance: -712.67 });

    expect(after.accounts.find((account) => account.id === 'perso')?.openingBalance).toBe(-712.67);
  });

  it('arrondit le solde au centime', () => {
    const after = updateAccount(data(), 'pro', { openingBalance: -1177.914 });

    expect(after.accounts.find((account) => account.id === 'pro')?.openingBalance).toBe(-1177.91);
  });

  it('reporte le solde d’ouverture sur le solde affiché', () => {
    const after = updateAccount(data(), 'pro', { openingBalance: -1177.91 });
    const balances = calculateAccountBalances(after);

    // −1 177,91 + 800 encaissés.
    expect(balances.find((account) => account.id === 'pro')?.balance).toBe(-377.91);
  });

  it('laisse le solde en place quand la saisie est absente ou illisible', () => {
    const withOpening = updateAccount(data(), 'pro', { openingBalance: -1177.91 });

    expect(updateAccount(withOpening, 'pro', {}).accounts[0].openingBalance).toBe(-1177.91);
    expect(updateAccount(withOpening, 'pro', { openingBalance: Number.NaN }).accounts[0].openingBalance).toBe(-1177.91);
  });

  it('ignore un compte inconnu et un nom vide', () => {
    const before = data();

    expect(updateAccount(before, 'inexistant', { openingBalance: 500 })).toEqual(before);
    expect(updateAccount(before, 'pro', { name: '   ' }).accounts[0].name).toBe('Compte pro');
  });
});

describe('setObservedAccountBalance', () => {
  /** Un virement et une dépense, pour que les mouvements aillent dans les deux sens. */
  const withMovements = (): FinanceData => ({
    ...data(),
    transactions: [
      { id: 'tx-1', kind: 'transfer', label: 'Virement perso', amount: 300, date: '2026-08-02', fromAccountId: 'pro', toAccountId: 'perso' },
      { id: 'tx-2', kind: 'expense', label: 'Loyer', amount: 700, date: '2026-08-05', fromAccountId: 'perso', toAccountId: null },
      { id: 'tx-3', kind: 'expense', label: 'Outils', amount: 60, date: '2026-08-01', fromAccountId: 'pro', toAccountId: null },
    ],
  });

  it('déduit le solde d’ouverture du solde lu au relevé', () => {
    const recalibrated = setObservedAccountBalance(withMovements(), 'perso', 53.61);

    // Mouvements du perso : +300 de virement − 700 de loyer = −400.
    expect(recalibrated.accounts.find((account) => account.id === 'perso')?.openingBalance).toBe(453.61);
  });

  it('fait retomber le solde affiché exactement sur le relevé', () => {
    const recalibrated = [
      { id: 'pro', observed: 22 },
      { id: 'perso', observed: 53.61 },
    ].reduce((current, entry) => setObservedAccountBalance(current, entry.id, entry.observed), withMovements());
    const balances = calculateAccountBalances(recalibrated);

    expect(balances.find((account) => account.id === 'pro')?.balance).toBe(22);
    expect(balances.find((account) => account.id === 'perso')?.balance).toBe(53.61);
  });

  it('ne bouge plus au second recalage sur la même valeur', () => {
    const once = setObservedAccountBalance(withMovements(), 'perso', 53.61);
    const twice = setObservedAccountBalance(once, 'perso', 53.61);

    expect(twice.accounts).toEqual(once.accounts);
  });

  it('ignore une valeur illisible', () => {
    const before = withMovements();

    expect(setObservedAccountBalance(before, 'perso', Number.NaN)).toBe(before);
  });
});
