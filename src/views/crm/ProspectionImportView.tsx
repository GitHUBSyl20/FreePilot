import type {
  InteractionChannel,
  ParsedProspectionRow,
  PipelineKind,
  ProspectionImportRow,
  ProspectTemperature,
} from '@freepilot/finance-core';
import { parseProspectionCsv, PIPELINE_LABELS, PIPELINE_ORDER, stagesForPipeline } from '@freepilot/finance-core';
import { useState } from 'react';
import { EmptyState, Panel } from '../../components/Panel';
import { channelLabels, channelOrder, temperatureLabels, temperatureOrder } from './labels';

type InteractionDraft = { date: string; warning: string | null; channel: InteractionChannel; note: string };
type TaskDraft = { include: boolean; label: string; dueDate: string };

type RowDraft = {
  key: string;
  included: boolean;
  errors: string[];
  name: string;
  company: string;
  companyLooksLikeActivity: boolean;
  source: string;
  temperature: ProspectTemperature;
  pipeline: PipelineKind;
  pipelineUncertain: boolean;
  stageId: string;
  originEvent: string;
  signaled: boolean;
  interactions: InteractionDraft[];
  task: TaskDraft | null;
};

type Props = {
  /**
   * Le dernier import réussi, remonté par le parent plutôt que gardé en état
   * local : ce composant est démonté à chaque changement d'onglet (comme le
   * reste de l'application), ce qui effacerait le bouton d'annulation dès
   * qu'on quitte l'écran des yeux — le contraire de ce qu'un filet de
   * sécurité doit faire.
   */
  lastImportBatch: { batchId: string; count: number } | null;
  onImport: (rows: ProspectionImportRow[], batchId: string) => void;
  onRollback: (batchId: string) => void;
};

const toDraft = (row: ParsedProspectionRow): RowDraft => ({
  key: String(row.rowNumber),
  included: row.errors.length === 0,
  errors: row.errors,
  name: row.name,
  company: row.company ?? '',
  companyLooksLikeActivity: row.companyLooksLikeActivity,
  source: row.source ?? '',
  temperature: row.temperature,
  pipeline: row.pipeline,
  pipelineUncertain: row.pipelineUncertain,
  stageId: row.stageId,
  originEvent: row.originEvent ?? '',
  signaled: row.signaled,
  interactions: row.interactions.map((interaction) => ({
    date: interaction.date ?? '',
    warning: interaction.warning,
    channel: interaction.channel,
    note: interaction.note,
  })),
  task: row.suggestedTask ? { include: true, label: row.suggestedTask.label, dueDate: row.suggestedTask.dueDate } : null,
});

const createBatchId = (): string => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * Import du suivi Excel (§9). Prévisualisation ligne par ligne obligatoire :
 * rien n'est jamais écrit sans passer par ce tableau, toujours modifiable
 * avant validation.
 */
export function ProspectionImportView({ lastImportBatch, onImport, onRollback }: Props) {
  const [csvText, setCsvText] = useState('');
  const [rows, setRows] = useState<RowDraft[] | null>(null);

  const analyze = () => {
    setRows(parseProspectionCsv(csvText).map(toDraft));
  };

  const updateRow = (key: string, patch: Partial<RowDraft>) => {
    setRows((current) => current?.map((row) => (row.key === key ? { ...row, ...patch } : row)) ?? null);
  };

  const updateInteraction = (key: string, index: number, patch: Partial<InteractionDraft>) => {
    setRows(
      (current) =>
        current?.map((row) =>
          row.key === key
            ? { ...row, interactions: row.interactions.map((interaction, i) => (i === index ? { ...interaction, ...patch } : interaction)) }
            : row,
        ) ?? null,
    );
  };

  const includedCount = rows?.filter((row) => row.included && row.errors.length === 0 && row.name.trim()).length ?? 0;

  const confirmImport = () => {
    if (!rows) return;

    const toImport: ProspectionImportRow[] = rows
      .filter((row) => row.included && row.errors.length === 0 && row.name.trim())
      .map((row) => ({
        name: row.name.trim(),
        company: row.company.trim() || null,
        source: row.source.trim() || null,
        temperature: row.temperature,
        // Dérivé du pipeline retenu, pas du diagnostic d'origine : si la
        // ligne a été corrigée vers « partenariat » en relecture, le
        // prospect doit être marqué prescripteur en conséquence.
        estPrescripteur: row.pipeline === 'partenariat',
        pipeline: row.pipeline,
        stageId: row.stageId,
        originEvent: row.originEvent.trim() || null,
        interactions: row.interactions
          .filter((interaction) => interaction.date)
          .map((interaction) => ({ date: interaction.date, channel: interaction.channel, note: interaction.note })),
        task: row.task?.include ? { label: row.task.label, dueDate: row.task.dueDate } : null,
      }));

    if (toImport.length === 0) return;

    const batchId = createBatchId();
    onImport(toImport, batchId);
    setRows(null);
    setCsvText('');
  };

  return (
    <>
      <Panel title="Import du suivi Excel">
        <p className="muted-note">
          Exporte ta feuille « Prospection » en CSV et colle le contenu ci-dessous. Aucune ligne n'est écrite avant la
          prévisualisation.
        </p>
        <textarea
          onChange={(event) => setCsvText(event.target.value)}
          placeholder="Colle ici le contenu CSV"
          rows={6}
          value={csvText}
        />
        <button className="primary-button" disabled={!csvText.trim()} onClick={analyze} type="button">
          Analyser
        </button>

        {lastImportBatch ? (
          <p className="notice-ok" role="status">
            {lastImportBatch.count} prospect(s) importé(s).{' '}
            <button className="mini-button" onClick={() => onRollback(lastImportBatch.batchId)} type="button">
              Annuler cet import
            </button>
          </p>
        ) : null}
      </Panel>

      {rows ? (
        <Panel title={`Prévisualisation (${rows.length} ligne(s), ${includedCount} à importer)`}>
          {rows.length === 0 ? (
            <EmptyState>Aucune ligne exploitable dans ce texte.</EmptyState>
          ) : (
            rows.map((row) => (
              <div className="record-card" key={row.key}>
                {row.errors.length > 0 ? (
                  <p className="notice-error">
                    Ligne {row.key} : {row.errors.join(' ')}
                  </p>
                ) : (
                  <label>
                    <input
                      checked={row.included}
                      onChange={(event) => updateRow(row.key, { included: event.target.checked })}
                      type="checkbox"
                    />{' '}
                    Importer cette ligne
                  </label>
                )}

                <div className="field-grid">
                  <input
                    onChange={(event) => updateRow(row.key, { name: event.target.value })}
                    placeholder="Nom"
                    value={row.name}
                  />
                  <input
                    onChange={(event) => updateRow(row.key, { company: event.target.value })}
                    placeholder="Entreprise"
                    value={row.company}
                  />
                </div>
                {row.companyLooksLikeActivity ? (
                  <p className="muted-note">
                    « {row.company} » ressemble à une description d'activité plutôt qu'à une raison sociale — à vérifier.
                  </p>
                ) : null}

                <div className="field-grid">
                  <select onChange={(event) => updateRow(row.key, { temperature: event.target.value as ProspectTemperature })} value={row.temperature}>
                    {temperatureOrder.map((value) => (
                      <option key={value} value={value}>
                        {temperatureLabels[value]}
                      </option>
                    ))}
                  </select>
                  <input
                    onChange={(event) => updateRow(row.key, { source: event.target.value })}
                    placeholder="Source"
                    value={row.source}
                  />
                </div>

                <div className="field-grid">
                  <select
                    onChange={(event) => {
                      const pipeline = event.target.value as PipelineKind;
                      updateRow(row.key, { pipeline, pipelineUncertain: false, stageId: stagesForPipeline(pipeline)[0].id });
                    }}
                    value={row.pipeline}
                  >
                    {PIPELINE_ORDER.map((kind) => (
                      <option key={kind} value={kind}>
                        {PIPELINE_LABELS[kind]}
                      </option>
                    ))}
                  </select>
                  <select onChange={(event) => updateRow(row.key, { stageId: event.target.value })} value={row.stageId}>
                    {stagesForPipeline(row.pipeline).map((stage) => (
                      <option key={stage.id} value={stage.id}>
                        {stage.label}
                      </option>
                    ))}
                  </select>
                </div>
                {row.pipelineUncertain ? (
                  <p className="muted-note">Pipeline proposé par défaut — la colonne Nature ne permettait pas de trancher.</p>
                ) : null}
                {row.signaled ? (
                  <p className="muted-note">Signature indiquée dans le suivi — l'affaire reste ouverte à l'import (R3) : à marquer gagnée à la main une fois le montant connu.</p>
                ) : null}

                <input
                  onChange={(event) => updateRow(row.key, { originEvent: event.target.value })}
                  placeholder="Événement d'origine"
                  value={row.originEvent}
                />

                {row.interactions.map((interaction, index) => (
                  <div className="field-grid" key={index}>
                    <input
                      onChange={(event) => updateInteraction(row.key, index, { date: event.target.value })}
                      type="date"
                      value={interaction.date}
                    />
                    <select
                      onChange={(event) => updateInteraction(row.key, index, { channel: event.target.value as InteractionChannel })}
                      value={interaction.channel}
                    >
                      {channelOrder.map((value) => (
                        <option key={value} value={value}>
                          {channelLabels[value]}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
                {row.interactions.some((interaction) => interaction.warning) ? (
                  <p className="muted-note">
                    {row.interactions
                      .map((interaction) => interaction.warning)
                      .filter(Boolean)
                      .join(' ')}
                  </p>
                ) : null}

                {row.task ? (
                  <div className="field-grid">
                    <label>
                      <input
                        checked={row.task.include}
                        onChange={(event) => updateRow(row.key, { task: { ...row.task!, include: event.target.checked } })}
                        type="checkbox"
                      />{' '}
                      Créer la tâche suggérée
                    </label>
                    <input
                      onChange={(event) => updateRow(row.key, { task: { ...row.task!, dueDate: event.target.value } })}
                      type="date"
                      value={row.task.dueDate}
                    />
                    <input
                      onChange={(event) => updateRow(row.key, { task: { ...row.task!, label: event.target.value } })}
                      value={row.task.label}
                    />
                  </div>
                ) : null}
              </div>
            ))
          )}

          <button className="primary-button" disabled={includedCount === 0} onClick={confirmImport} type="button">
            Importer {includedCount} ligne(s)
          </button>
        </Panel>
      ) : null}
    </>
  );
}
