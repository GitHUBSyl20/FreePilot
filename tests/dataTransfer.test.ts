import { createInitialFinanceData, needsMigration } from '@freepilot/finance-core';
import { describe, expect, it } from 'vitest';
import { buildExportFileName, readFinanceDataFile, serializeFinanceData } from '../src/dataTransfer';

const asFile = (content: string) => new File([content], 'sauvegarde.json', { type: 'application/json' });

describe('export des données', () => {
  it('nomme le fichier avec la date du jour', () => {
    expect(buildExportFileName(new Date('2026-07-27T10:00:00Z'))).toBe('freepilot-export-2026-07-27.json');
  });

  it('enveloppe les données avec un horodatage', () => {
    const envelope = JSON.parse(serializeFinanceData(createInitialFinanceData(), new Date('2026-07-27T10:00:00Z')));

    expect(envelope.app).toBe('freepilot');
    expect(envelope.exportedAt).toBe('2026-07-27T10:00:00.000Z');
    expect(envelope.data.version).toBe(3);
  });
});

describe('import des données', () => {
  it('relit un fichier exporté à l’identique', async () => {
    const original = createInitialFinanceData();
    const imported = await readFinanceDataFile(asFile(serializeFinanceData(original)));

    expect(imported).toEqual(original);
  });

  it('accepte un FinanceData brut sans enveloppe', async () => {
    const original = createInitialFinanceData();
    const imported = await readFinanceDataFile(asFile(JSON.stringify(original)));

    expect(imported).toEqual(original);
  });

  it('refuse un fichier qui n’est pas du JSON', async () => {
    await expect(readFinanceDataFile(asFile('ceci nest pas du json'))).rejects.toThrow(/JSON valide/);
  });

  it('refuse une version de données inconnue', async () => {
    const payload = { ...createInitialFinanceData(), version: 99 };

    await expect(readFinanceDataFile(asFile(JSON.stringify(payload)))).rejects.toThrow(/Version de données/);
  });

  it('migre une sauvegarde v1 dépourvue des collections ajoutées depuis', async () => {
    const {
      recurringCharges: _charges,
      areMonths: _months,
      prospects: _prospects,
      interactions: _interactions,
      ...v1
    } = createInitialFinanceData();
    const legacy = { ...v1, version: 1 };

    const imported = await readFinanceDataFile(asFile(JSON.stringify(legacy)));

    expect(imported.version).toBe(3);
    expect(imported.recurringCharges).toEqual([]);
    expect(imported.areMonths).toEqual([]);
    expect(imported.prospects).toEqual([]);
    expect(imported.interactions).toEqual([]);
    // Les factures et opérations d'origine survivent à la migration.
    expect(imported.invoices).toHaveLength(3);
    expect(imported.transactions).toHaveLength(4);
  });

  it('migre une sauvegarde v2 en conservant charges et ARE mensuelle', async () => {
    const { prospects: _prospects, interactions: _interactions, ...v2 } = createInitialFinanceData();
    const legacy = { ...v2, version: 2 };

    const imported = await readFinanceDataFile(asFile(JSON.stringify(legacy)));

    expect(imported.version).toBe(3);
    expect(imported.recurringCharges).toHaveLength(2);
    expect(imported.areMonths).toHaveLength(2);
    expect(imported.prospects).toEqual([]);
    expect(imported.interactions).toEqual([]);
  });

  it('détecte une collection CRM manquante même à la version courante', () => {
    const { prospects: _removed, ...withoutProspects } = createInitialFinanceData();

    expect(needsMigration(withoutProspects)).toBe(true);
  });

  it('détecte un réglage manquant même à la version courante', () => {
    const base = createInitialFinanceData();
    const { monthlyRevenueTakeoffThreshold: _missing, ...partialSettings } = base.settings;

    // Déjà en v2 : seul le réglage absent doit déclencher la normalisation.
    expect(needsMigration({ ...base, settings: partialSettings })).toBe(true);
    expect(needsMigration(base)).toBe(false);
  });

  it('détecte une collection manquante même à la version courante', () => {
    const { recurringCharges: _removed, ...withoutCharges } = createInitialFinanceData();

    expect(needsMigration(withoutCharges)).toBe(true);
  });

  it('complète les réglages absents d’une sauvegarde plus ancienne', async () => {
    const base = createInitialFinanceData();
    const { monthlyRevenueSafetyThreshold: _threshold, ...partialSettings } = base.settings;
    const legacy = { ...base, version: 1, settings: partialSettings };

    const imported = await readFinanceDataFile(asFile(JSON.stringify(legacy)));

    expect(imported.settings.monthlyRevenueSafetyThreshold).toBe(1000);
    // Les réglages présents ne sont pas écrasés par les valeurs par défaut.
    expect(imported.settings.areDailyAmount).toBe(base.settings.areDailyAmount);
  });

  it('refuse un fichier dont une collection est manquante', async () => {
    const { invoices: _removed, ...withoutInvoices } = createInitialFinanceData();

    await expect(readFinanceDataFile(asFile(JSON.stringify(withoutInvoices)))).rejects.toThrow(/invoices/);
  });

  it('refuse un fichier sans réglages', async () => {
    const { settings: _removed, ...withoutSettings } = createInitialFinanceData();

    await expect(readFinanceDataFile(asFile(JSON.stringify(withoutSettings)))).rejects.toThrow(/réglages/);
  });
});
