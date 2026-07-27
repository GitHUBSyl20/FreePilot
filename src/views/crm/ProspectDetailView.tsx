import type {
  Interaction,
  InteractionChannel,
  Prospect,
  ProspectFollowUp,
  ProspectStatus,
  ProspectTemperature,
} from '@freepilot/finance-core';
import { useState } from 'react';
import { EmptyState, InfoRow, Panel } from '../../components/Panel';
import { formatCurrency, formatDate, formatDayGap } from '../../format';
import { Badge } from './ProspectRow';
import { channelLabels, channelOrder, statusLabels, temperatureLabels, temperatureOrder, urgencyLabels } from './labels';

type ProspectChanges = Partial<
  Pick<Prospect, 'company' | 'name' | 'nextFollowUpDate' | 'notes' | 'source' | 'status' | 'temperature'>
>;

type Props = {
  followUp: ProspectFollowUp;
  history: Interaction[];
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
};

export function ProspectDetailView({
  followUp,
  history,
  onBack,
  onDelete,
  onDeleteInteraction,
  onLogInteraction,
  onUpdate,
  today,
}: Props) {
  const { prospect } = followUp;
  const [contactDate, setContactDate] = useState(today);
  const [channel, setChannel] = useState<InteractionChannel>('email');
  const [note, setNote] = useState('');
  const [nextFollowUpDate, setNextFollowUpDate] = useState('');
  const [notes, setNotes] = useState(prospect.notes);

  const submitInteraction = () => {
    if (!contactDate) return;

    onLogInteraction({ date: contactDate, channel, note, nextFollowUpDate: nextFollowUpDate || null });
    setNote('');
    setNextFollowUpDate('');
    setContactDate(today);
  };

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

      <Panel title="Enregistrer un contact">
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

        <label htmlFor="interaction-next">Prochaine relance (optionnel)</label>
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
      </Panel>

      <Panel title="Historique">
        {history.length === 0 ? (
          <EmptyState>Aucun contact enregistré.</EmptyState>
        ) : (
          history.map((interaction) => (
            <div className="record-card" key={interaction.id}>
              <InfoRow
                helper={interaction.note || null}
                label={formatDate(interaction.date)}
                value={channelLabels[interaction.channel]}
              />
              <button className="danger-button" onClick={() => onDeleteInteraction(interaction)} type="button">
                Supprimer
              </button>
            </div>
          ))
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
