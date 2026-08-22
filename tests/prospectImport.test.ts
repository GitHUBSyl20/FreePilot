import type { FinanceData } from '@freepilot/finance-core';
import {
  applyProspectionImport,
  defaultSettings,
  looksLikeActivityDescription,
  parseDateCell,
  parseProspectionCsv,
  removeImportBatch,
  suggestTaskFromRemark,
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

const HEADER = 'Nom;Entreprise;Nature;Température;Source contact;Date prise contact;Modalité;Date contact 2;Remarques;Signatures';

const SAMPLE_CSV = [
  HEADER,
  'Julie Martin;Martin Conseil;Formation;Chaud;Petit-déj CPME;46079;Mail;;Envoyer le devis rapidement;Non',
  'Marc Petit;Société nettoyage;Projet;Tiède;LinkedIn;46098;Téléphone;46136;relancer sur axe formation;Oui',
  ';Cabinet Fiscal;Collaboration;Curieux;;;;;;Non',
  'Anna Dupuis;;Projet;Froid;Salon Pro;février;Mail;;;Non',
  'Marc Late;;Projet;Chaud;;99999;Mail;;;Non',
].join('\n');

describe('parseDateCell — numéros de série Excel (base 1899-12-30)', () => {
  it('convertit les trois repères connus', () => {
    expect(parseDateCell('46079', 2026)).toEqual({ date: '2026-02-26', warning: null });
    expect(parseDateCell('46098', 2026)).toEqual({ date: '2026-03-17', warning: null });
    expect(parseDateCell('46136', 2026)).toEqual({ date: '2026-04-24', warning: null });
  });

  it('rejette une conversion hors de la plage 2024-2027', () => {
    const result = parseDateCell('99999', 2026);
    expect(result.date).toBeNull();
    expect(result.warning).toMatch(/hors de la plage/);
  });

  it('convertit une date textuelle approximative au premier du mois, en la signalant', () => {
    expect(parseDateCell('février', 2026)).toEqual({
      date: '2026-02-01',
      warning: 'Date textuelle approximative convertie au 1er du mois : « février ».',
    });
    expect(parseDateCell('Mi-Mars', 2026).date).toBe('2026-03-01');
    expect(parseDateCell('Juin', 2027).date).toBe('2027-06-01');
  });

  it('accepte une cellule vide sans avertissement', () => {
    expect(parseDateCell('', 2026)).toEqual({ date: null, warning: null });
  });

  it('signale une date illisible', () => {
    expect(parseDateCell('n/a', 2026).warning).toMatch(/non reconnue/);
  });
});

describe('looksLikeActivityDescription', () => {
  it('signale une liste d’activités plutôt qu’une raison sociale', () => {
    expect(looksLikeActivityDescription('Courtage assurance, prêt, rachat crédit')).toBe(true);
    expect(looksLikeActivityDescription('Société nettoyage')).toBe(true);
    expect(looksLikeActivityDescription('Martin Conseil')).toBe(false);
  });
});

describe('suggestTaskFromRemark', () => {
  it('propose une tâche sur un mot-clé d’action, sans jamais la créer elle-même', () => {
    const suggestion = suggestTaskFromRemark('relancer sur axe formation', 2026, '2026-04-24');
    expect(suggestion).toEqual({ label: 'relancer sur axe formation', dueDate: '2026-05-01' }); // J+7 par défaut
  });

  it('reprend une date écrite en toutes lettres quand elle est présente', () => {
    const suggestion = suggestTaskFromRemark('rendez-vous fixé 30 mars', 2026, '2026-01-01');
    expect(suggestion?.dueDate).toBe('2026-03-30');
  });

  it('ne propose rien sans mot-clé d’action', () => {
    expect(suggestTaskFromRemark('Intéressée mais pas pressée', 2026, '2026-01-01')).toBeNull();
  });
});

describe('parseProspectionCsv', () => {
  const rows = parseProspectionCsv(SAMPLE_CSV, { assumedYear: 2026 });

  it('mappe température, stade proposé, canal et pipeline', () => {
    const julie = rows[0];
    expect(julie).toMatchObject({
      name: 'Julie Martin',
      company: 'Martin Conseil',
      temperature: 'hot',
      stageId: 'qualified',
      pipeline: 'formation',
      pipelineUncertain: false,
      companyLooksLikeActivity: false,
      signaled: false,
    });
    expect(julie.interactions[0]).toMatchObject({ date: '2026-02-26', channel: 'email' });
  });

  it('rattache la remarque au dernier contact connu et propose une tâche', () => {
    const marc = rows[1];
    expect(marc.temperature).toBe('warm');
    expect(marc.stageId).toBe('contacted');
    expect(marc.companyLooksLikeActivity).toBe(true);
    expect(marc.signaled).toBe(true); // Signatures = Oui, mais R3 s'applique à l'écriture
    expect(marc.interactions).toHaveLength(2);
    expect(marc.interactions[0].note).toBe('');
    expect(marc.interactions[1]).toMatchObject({ date: '2026-04-24', channel: 'other', note: 'relancer sur axe formation' });
    expect(marc.suggestedTask).toEqual({ label: 'relancer sur axe formation', dueDate: '2026-05-01' });
  });

  it('refuse une ligne sans nom plutôt que de planter, tout en gardant le reste exploitable', () => {
    const noName = rows[2];
    expect(noName.errors).toEqual(['Nom manquant : ligne ignorée.']);
    expect(noName.pipeline).toBe('partenariat');
    expect(noName.estPrescripteur).toBe(true);
    expect(noName.temperature).toBe('cold');
    expect(noName.stageId).toBe('contacted'); // « Curieux »
  });

  it('signale une date textuelle et rejette une date hors plage', () => {
    expect(rows[3].interactions[0]).toMatchObject({ date: '2026-02-01' });
    expect(rows[3].interactions[0].warning).toMatch(/approximative/);

    expect(rows[4].interactions[0].date).toBeNull();
    expect(rows[4].interactions[0].warning).toMatch(/hors de la plage/);
  });

  it('signale un pipeline incertain quand Nature ne contient aucun mot-clé net', () => {
    const uncertain = parseProspectionCsv(`${HEADER}\nInconnu;;Autre chose;Chaud;;;;;;Non`, { assumedYear: 2026 });
    expect(uncertain[0].pipelineUncertain).toBe(true);
    expect(uncertain[0].pipeline).toBe('projet'); // proposition par défaut, toujours modifiable
  });

  it('renvoie une liste vide pour un texte vide', () => {
    expect(parseProspectionCsv('')).toEqual([]);
  });
});

describe('applyProspectionImport / removeImportBatch', () => {
  it('écrit prospect, interactions, opportunité et tâche, marqués pour un retour arrière complet', () => {
    const data = applyProspectionImport(
      emptyData(),
      [
        {
          name: 'Julie Martin',
          company: 'Martin Conseil',
          source: 'Petit-déj CPME',
          temperature: 'hot',
          estPrescripteur: false,
          pipeline: 'formation',
          stageId: 'qualified',
          originEvent: 'Petit-déj CPME',
          interactions: [{ date: '2026-02-26', channel: 'email', note: '' }],
          task: { label: 'Envoyer le devis', dueDate: '2026-03-05' },
        },
      ],
      'batch-1',
      '2026-08-22',
    );

    expect(data.prospects).toHaveLength(1);
    expect(data.prospects[0].notes).toBe('[Import CSV batch-1]');
    expect(data.interactions).toHaveLength(1);
    expect(data.opportunities).toHaveLength(1);
    expect(data.opportunities[0]).toMatchObject({ pipeline: 'formation', stageId: 'qualified', status: 'open' });
    expect(data.tasks).toHaveLength(1);

    const rolledBack = removeImportBatch(data, 'batch-1');
    expect(rolledBack.prospects).toHaveLength(0);
    expect(rolledBack.interactions).toHaveLength(0);
    expect(rolledBack.opportunities).toHaveLength(0);
    expect(rolledBack.tasks).toHaveLength(0);
  });

  it('ne touche pas aux prospects hors du lot importé', () => {
    const withBatch1 = applyProspectionImport(
      emptyData(),
      [
        {
          name: 'Batch 1',
          company: null,
          source: null,
          temperature: 'warm',
          estPrescripteur: false,
          pipeline: 'projet',
          stageId: 'identified',
          originEvent: null,
          interactions: [],
          task: null,
        },
      ],
      'batch-1',
      '2026-08-22',
    );
    const withBoth = applyProspectionImport(
      withBatch1,
      [
        {
          name: 'Batch 2',
          company: null,
          source: null,
          temperature: 'warm',
          estPrescripteur: false,
          pipeline: 'projet',
          stageId: 'identified',
          originEvent: null,
          interactions: [],
          task: null,
        },
      ],
      'batch-2',
      '2026-08-22',
    );

    const rolledBack = removeImportBatch(withBoth, 'batch-1');
    expect(rolledBack.prospects.map((prospect) => prospect.name)).toEqual(['Batch 2']);
  });
});
