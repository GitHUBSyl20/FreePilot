import type { FinanceData, RemoteDocumentHeader, SyncMeta } from '@freepilot/finance-core';
import {
  FINANCE_DATA_VERSION,
  defaultSettings,
  emptySyncMeta,
  fingerprintFinanceData,
  resolveSync,
  syncedMeta,
} from '@freepilot/finance-core';
import { describe, expect, it } from 'vitest';

/** Document minimal : la synchro ne regarde pas le contenu métier. */
const document = (): FinanceData => ({
  version: 4,
  recurringChargeAutoPostFrom: null,
  settings: defaultSettings,
  accounts: [{ id: 'pro', name: 'Compte pro', kind: 'professional', openingBalance: 0 }],
  invoices: [
    {
      id: 'inv-1',
      clientName: 'Client Alpha',
      status: 'paid',
      totalTTC: 1000,
      issueDate: '2026-06-02',
      dueDate: null,
      paymentDate: '2026-06-20',
      paymentAccountId: 'pro',
    },
  ],
  transactions: [],
  recurringCharges: [{ id: 'c-1', label: 'Loyer', amount: 700, scope: 'personal', dayOfMonth: 5, active: true }],
  areMonths: [{ month: '2026-06', fullMonthlyARE: 1416, actualARE: 552 }],
  prospects: [],
  interactions: [],
});

const header = (overrides: Partial<RemoteDocumentHeader> = {}): RemoteDocumentHeader => ({
  revision: 4,
  schemaVersion: FINANCE_DATA_VERSION,
  updatedAt: '2026-07-28T09:00:00.000Z',
  ...overrides,
});

/** Métadonnées d'un appareil déjà aligné sur le document passé. */
const alignedMeta = (data: FinanceData, revision: number): SyncMeta => ({
  revision,
  fingerprint: fingerprintFinanceData(data),
  syncedAt: '2026-07-28T09:00:00.000Z',
});

describe('fingerprintFinanceData', () => {
  it("ne dépend pas de l'ordre des clés", () => {
    const data = document();
    const reordered = {
      interactions: data.interactions,
      prospects: data.prospects,
      areMonths: data.areMonths,
      recurringCharges: data.recurringCharges,
      transactions: data.transactions,
      invoices: data.invoices,
      accounts: data.accounts,
      settings: data.settings,
      recurringChargeAutoPostFrom: data.recurringChargeAutoPostFrom,
      version: data.version,
    } as FinanceData;

    expect(fingerprintFinanceData(reordered)).toBe(fingerprintFinanceData(data));
  });

  it('traite une clé optionnelle absente et une clé à undefined de la même façon', () => {
    const absent = document();
    const undefined_ = document();
    undefined_.invoices[0].prospectId = undefined;

    expect(fingerprintFinanceData(undefined_)).toBe(fingerprintFinanceData(absent));
  });

  it('change dès qu’une valeur change', () => {
    const before = document();
    const after = document();
    after.invoices[0].totalTTC = 1000.01;

    expect(fingerprintFinanceData(after)).not.toBe(fingerprintFinanceData(before));
  });

  it("change quand l'ordre d'un tableau change", () => {
    // L'ordre des éléments est une donnée : il ne doit pas être normalisé,
    // sinon un réagencement ne partirait jamais au cloud.
    const before = document();
    before.areMonths = [
      { month: '2026-06', fullMonthlyARE: 1416, actualARE: 552 },
      { month: '2026-07', fullMonthlyARE: 1416, actualARE: 988 },
    ];
    const after = document();
    after.areMonths = [...before.areMonths].reverse();

    expect(fingerprintFinanceData(after)).not.toBe(fingerprintFinanceData(before));
  });
});

describe('resolveSync', () => {
  it('envoie quand le cloud est vide', () => {
    expect(resolveSync({ local: document(), meta: emptySyncMeta(), remote: null })).toBe('push');
  });

  it('envoie quand la ligne distante a disparu', () => {
    const data = document();

    expect(resolveSync({ local: data, meta: alignedMeta(data, 4), remote: null })).toBe('push');
  });

  it('ne fait rien quand les deux côtés sont alignés', () => {
    const data = document();

    expect(resolveSync({ local: data, meta: alignedMeta(data, 4), remote: header({ revision: 4 }) })).toBe('up-to-date');
  });

  it('envoie quand seul le local a bougé', () => {
    const data = document();
    const meta = alignedMeta(data, 4);
    data.recurringCharges[0].amount = 720;

    expect(resolveSync({ local: data, meta, remote: header({ revision: 4 }) })).toBe('push');
  });

  it('tire quand seul le distant a bougé', () => {
    const data = document();

    expect(resolveSync({ local: data, meta: alignedMeta(data, 4), remote: header({ revision: 5 }) })).toBe('pull');
  });

  it('signale un conflit quand les deux côtés ont bougé', () => {
    const data = document();
    const meta = alignedMeta(data, 4);
    data.recurringCharges[0].amount = 720;

    expect(resolveSync({ local: data, meta, remote: header({ revision: 5 }) })).toBe('conflict');
  });

  it('signale un conflit sur un appareil neuf face à un cloud déjà rempli', () => {
    // Rien ne dit lequel des deux est le bon : c'est à l'utilisateur de choisir.
    expect(resolveSync({ local: document(), meta: emptySyncMeta(), remote: header() })).toBe('conflict');
  });

  it('bloque quand le cloud vient d’une version plus récente', () => {
    const data = document();
    const remote = header({ revision: 4, schemaVersion: FINANCE_DATA_VERSION + 1 });

    // Même parfaitement aligné par ailleurs : lire ce document perdrait des
    // champs, et le réécrire les effacerait pour de bon.
    expect(resolveSync({ local: data, meta: alignedMeta(data, 4), remote })).toBe('blocked');
  });
});

describe('syncedMeta', () => {
  it('enregistre la révision et l’empreinte des données envoyées', () => {
    const data = document();
    const meta = syncedMeta({ revision: 7, data, at: '2026-07-28T10:30:00.000Z' });

    expect(meta).toEqual({
      revision: 7,
      fingerprint: fingerprintFinanceData(data),
      syncedAt: '2026-07-28T10:30:00.000Z',
    });
    expect(resolveSync({ local: data, meta, remote: header({ revision: 7 }) })).toBe('up-to-date');
  });
});
