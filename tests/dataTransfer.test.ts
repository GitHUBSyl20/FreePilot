import { createInitialFinanceData } from '@freepilot/finance-core';
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
    expect(envelope.data.version).toBe(1);
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
    const payload = { ...createInitialFinanceData(), version: 2 };

    await expect(readFinanceDataFile(asFile(JSON.stringify(payload)))).rejects.toThrow(/Version de données/);
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
