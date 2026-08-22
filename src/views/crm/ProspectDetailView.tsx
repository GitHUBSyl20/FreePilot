import type {
  Interaction,
  InteractionChannel,
  Opportunity,
  Prospect,
  ProspectFollowUp,
  ProspectStatus,
  ProspectTemperature,
  Task,
} from '@freepilot/finance-core';
import { PIPELINE_LABELS, findStage, suggestNextTask } from '@freepilot/finance-core';
import { useState } from 'react';
import { EmptyState, InfoRow, Panel } from '../../components/Panel';
import { formatCurrency, formatDate, formatDayGap } from '../../format';
import { Badge } from './ProspectRow';
import {
  channelLabels,
  channelOrder,
  opportunityStatusLabels,
  statusLabels,
  temperatureLabels,
  temperatureOrder,
  urgencyLabels,
} from './labels';

type ProspectChanges = Partial<
  Pick<Prospect, 'company' | 'name' | 'nextFollowUpDate' | 'notes' | 'source' | 'status' | 'temperature'>
>;

type Props = {
  followUp: ProspectFollowUp;
  history: Interaction[];
  opportunities: Opportunity[];
  tasks: Task[];
  today: string;
  onBack: () => void;
  onUpdate: (input: ProspectChanges) => void;
  onLogInteraction: (input: {
    date: string;
    channel: InteractionChannel;
    note: string;
    nextFollowUpDate: string | null;
  }) => void;
  onDeleteInteraction: (interaction: Interaction) => void;
  onDelete: () => void;
  onOpenOpportunity: (opportunityId: string | null) => void;
  onCompleteTask: (taskId: string) => void;
  onCancelTask: (taskId: string) => void;
  onAddTask: (input: { label: string; dueDate: string }) => void;
};

/** Une ligne d'historique, interaction ou tâche traitée, fusionnées puis triées. */
type TimelineEntry =
  | { kind: 'interaction'; date: string; interaction: Interaction }
  | { kind: 'task'; date: string; task: Task };

export function ProspectDetailView({
  followUp,
  history,
  onBack,
  onCancelTask,
  onCompleteTask,
  onDelete,
  onDeleteInteraction,
  onAddTask,
  onLogInteraction,
  onOpenOpportunity,
  onUpdate,
  opportunities,
  tasks,
  today,
}: Props) {
  const { prospect } = followUp;
  const [contactDate, setContactDate] = useState(today);
  const [channel, setChannel] = useState<InteractionChannel>('email');
  const [note, setNote] = useState('');
  const [nextFollowUpDate, setNextFollowUpDate] = useState('');
  const [notes, setNotes] = useState(prospect.notes);
  // R5 : proposée juste après l'enregistrement d'un contact, jamais créée
  // automatiquement — l'utilisateur l'ajuste ou la valide en un geste.
  const [suggestion, setSuggestion] = useState<{ label: string; dueDate: string } | null>(null);

  const submitInteraction = () => {
    if (!contactDate) return;

    onLogInteraction({ date: contactDate, channel, note, nextFollowUpDate: nextFollowUpDate || null });
    setSuggestion(suggestNextTask({ interactionCount: history.length + 1, fromDate: contactDate }));
    setNote('');
    setNextFollowUpDate('');
    setContactDate(today);
  };

  const openTasks = tasks.filter((task) => task.status === 'open');
  const timeline: TimelineEntry[] = [
    ...history.map((interaction): TimelineEntry => ({ kind: 'interaction', date: interaction.date, interaction })),
    ...tasks
      .filter((task) => task.status !== 'open')
      .map((task): TimelineEntry => ({ kind: 'task', date: task.completedAt ?? task.dueDate, task })),
  ].sort((left, right) => right.date.localeCompare(left.date));

  return (
    <section className="details-stack single">
      <button className="secondary-button" onClick={onBack} type="button">
        ← Retour
      </button>

      <article className="balance-card">
        <span>{prospect.company ?? 'Contact indépendant'}</span>
        <strong className="prospect-name">{prospect.name}</strong>
        <span className="badge-row">
          <Badge tone={prospect.temperature}>{temperatureLabels[prospect.temperature]}</Badge>
          <Badge tone={`status-${prospect.status}`}>{statusLabels[prospect.status]}</Badge>
          {followUp.urgency ? <Badge tone={followUp.urgency}>{urgencyLabels[followUp.urgency]}</Badge> : null}
        </span>
        <p>
          {followUp.dueDate && followUp.daysUntilDue !== null
            ? `Relance le ${formatDate(followUp.dueDate)} · ${formatDayGap(followUp.daysUntilDue)}${
                followUp.inferred ? ' (délai automatique)' : ''
              }`
            : 'Aucune relance prévue'}
        </p>
      </article>

      <Panel title="Opportunités">
        {opportunities.length === 0 ? (
          <EmptyState>Aucune affaire en cours pour ce prospect.</EmptyState>
        ) : (
          opportunities.map((opportunity) => {
            const stage = findStage(opportunity.pipeline, opportunity.stageId);
            return (
              <button
                className="row-button"
                key={opportunity.id}
                onClick={() => onOpenOpportunity(opportunity.id)}
                type="button"
              >
                <span className="row-title">
                  <strong>{opportunity.title}</strong>
                  <span className="badge-row">
                    <Badge tone={`status-${opportunity.status === 'open' ? 'active' : opportunity.status === 'won' ? 'signed' : 'lost'}`}>
                      {opportunityStatusLabels[opportunity.status]}
                    </Badge>
                  </span>
                </span>
                <span className="row-detail">
                  {PIPELINE_LABELS[opportunity.pipeline]} · {stage?.label ?? opportunity.stageId}
                </span>
                {opportunity.amount > 0 ? <span className="row-detail">{formatCurrency(opportunity.amount)}</span> : null}
              </button>
            );
          })
        )}
        <button className="secondary-button" onClick={() => onOpenOpportunity(null)} type="button">
          Nouvelle affaire
        </button>
      </Panel>

      {openTasks.length > 0 ? (
        <Panel title="Tâches">
          {openTasks.map((task) => (
            <div className="charge-row" key={task.id}>
              <span className="charge-label">
                <strong>{task.label}</strong>
                <span>{formatDate(task.dueDate)}</span>
              </span>
              <div className="charge-actions">
                <button className="mini-button" onClick={() => onCompleteTask(task.id)} type="button">
                  Fait
                </button>
                <button className="mini-button danger" onClick={() => onCancelTask(task.id)} type="button">
                  Annuler
                </button>
              </div>
            </div>
          ))}
        </Panel>
      ) : null}

      <Panel title="Suivi">
        <label htmlFor="detail-temperature">Température</label>
        <select
          id="detail-temperature"
          onChange={(event) => onUpdate({ temperature: event.target.value as ProspectTemperature })}
          value={prospect.temperature}
        >
          {temperatureOrder.map((value) => (
            <option key={value} value={value}>
              {temperatureLabels[value]}
            </option>
          ))}
        </select>

        <label htmlFor="detail-status">Statut</label>
        <select
          id="detail-status"
          onChange={(event) => onUpdate({ status: event.target.value as ProspectStatus })}
          value={prospect.status}
        >
          {(['active', 'signed', 'lost'] as ProspectStatus[]).map((value) => (
            <option key={value} value={value}>
              {statusLabels[value]}
            </option>
          ))}
        </select>

        <label htmlFor="detail-follow-up">Relance planifiée</label>
        <input
          id="detail-follow-up"
          onChange={(event) => onUpdate({ nextFollowUpDate: event.target.value || null })}
          type="date"
          value={prospect.nextFollowUpDate ?? ''}
        />
        {prospect.nextFollowUpDate ? (
          <button className="secondary-button" onClick={() => onUpdate({ nextFollowUpDate: null })} type="button">
            Revenir au délai automatique
          </button>
        ) : (
          <p className="muted-note">
            Échéance calculée automatiquement, {followUp.lastInteraction ? 'à partir du dernier contact' : 'à partir de la date d’ajout'}.
          </p>
        )}

        <InfoRow
          helper={prospect.source ? `Source : ${prospect.source}` : 'Source non renseignée'}
          label="Ajouté le"
          value={formatDate(prospect.createdAt)}
        />
        <InfoRow
          helper={followUp.interactionCount === 0 ? 'Aucun contact enregistré' : `${followUp.interactionCount} contact(s)`}
          label="Dernier contact"
          value={followUp.lastInteraction ? formatDate(followUp.lastInteraction.date) : '—'}
        />
      </Panel>

      <Panel title="Journaliser un contact">
        <label htmlFor="interaction-date">Date</label>
        <input
          id="interaction-date"
          onChange={(event) => setContactDate(event.target.value)}
          type="date"
          value={contactDate}
        />

        <label htmlFor="interaction-channel">Canal</label>
        <select
          id="interaction-channel"
          onChange={(event) => setChannel(event.target.value as InteractionChannel)}
          value={channel}
        >
          {channelOrder.map((value) => (
            <option key={value} value={value}>
              {channelLabels[value]}
            </option>
          ))}
        </select>

        <textarea onChange={(event) => setNote(event.target.value)} placeholder="Ce qui s’est dit" rows={3} value={note} />

        <label htmlFor="interaction-next">Prochaine relance réseau (optionnel)</label>
        <input
          id="interaction-next"
          onChange={(event) => setNextFollowUpDate(event.target.value)}
          type="date"
          value={nextFollowUpDate}
        />

        <button className="primary-button" onClick={submitInteraction} type="button">
          Enregistrer le contact
        </button>
        <p className="muted-note">
          Sans date, la prochaine échéance repart du délai lié à la température, décompté depuis ce contact.
        </p>

        {suggestion ? (
          <div className="record-card">
            <label htmlFor="suggested-task-label">Prochaine action suggérée</label>
            <input
              id="suggested-task-label"
              onChange={(event) => setSuggestion({ ...suggestion, label: event.target.value })}
              value={suggestion.label}
            />
            <input
              aria-label="Échéance de la tâche suggérée"
              onChange={(event) => setSuggestion({ ...suggestion, dueDate: event.target.value })}
              type="date"
              value={suggestion.dueDate}
            />
            <div className="button-row">
              <button
                className="primary-button"
                onClick={() => {
                  onAddTask(suggestion);
                  setSuggestion(null);
                }}
                type="button"
              >
                Valider la tâche
              </button>
              <button className="secondary-button" onClick={() => setSuggestion(null)} type="button">
                Ignorer
              </button>
            </div>
          </div>
        ) : null}
      </Panel>

      <Panel title="Historique">
        {timeline.length === 0 ? (
          <EmptyState>Aucun contact ni tâche enregistrés.</EmptyState>
        ) : (
          timeline.map((entry) =>
            entry.kind === 'interaction' ? (
              <div className="record-card" key={`interaction-${entry.interaction.id}`}>
                <InfoRow
                  helper={entry.interaction.note || null}
                  label={formatDate(entry.interaction.date)}
                  value={channelLabels[entry.interaction.channel]}
                />
                <button className="danger-button" onClick={() => onDeleteInteraction(entry.interaction)} type="button">
                  Supprimer
                </button>
              </div>
            ) : (
              <div className="record-card" key={`task-${entry.task.id}`}>
                <InfoRow
                  helper={entry.task.status === 'done' ? 'Faite' : 'Annulée'}
                  label={formatDate(entry.date)}
                  value={entry.task.label}
                />
              </div>
            ),
          )
        )}
      </Panel>

      <Panel title="Chiffre d’affaires rattaché">
        <InfoRow label="Encaissé" value={formatCurrency(followUp.revenue.collected)} />
        <InfoRow label="En attente" value={formatCurrency(followUp.revenue.pending)} />
        <p className="muted-note">
          Le rattachement se fait à la création d’une facture, dans l’onglet Finances.
        </p>
      </Panel>

      <Panel title="Remarques">
        <textarea
          onBlur={() => (notes === prospect.notes ? undefined : onUpdate({ notes }))}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Contexte, besoins, points à retenir"
          rows={4}
          value={notes}
        />
        <button className="danger-button" onClick={onDelete} type="button">
          Supprimer le prospect
        </button>
      </Panel>
    </section>
  );
}
