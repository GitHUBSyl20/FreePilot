import type {
  CrmSummary,
  Interaction,
  InteractionChannel,
  Prospect,
  ProspectFollowUp,
  ProspectTemperature,
} from '@freepilot/finance-core';
import { interactionsForProspect } from '@freepilot/finance-core';
import { useState } from 'react';
import { EmptyState, Panel } from '../../components/Panel';
import { FollowUpsView } from './FollowUpsView';
import { PipelineView } from './PipelineView';
import { ProspectDetailView } from './ProspectDetailView';
import { ProspectFormView } from './ProspectFormView';

type CrmPage = 'followUps' | 'pipeline' | 'new';

type ProspectChanges = Partial<
  Pick<Prospect, 'company' | 'name' | 'nextFollowUpDate' | 'notes' | 'source' | 'status' | 'temperature'>
>;

type Props = {
  followUps: ProspectFollowUp[];
  summary: CrmSummary;
  interactions: Interaction[];
  today: string;
  onAddProspect: (input: {
    name: string;
    company: string | null;
    source: string | null;
    temperature: ProspectTemperature;
    nextFollowUpDate: string | null;
    notes: string;
  }) => void;
  onUpdateProspect: (prospectId: string, input: ProspectChanges) => void;
  onDeleteProspect: (prospect: Prospect) => void;
  onLogInteraction: (input: {
    prospectId: string;
    date: string;
    channel: InteractionChannel;
    note: string;
    nextFollowUpDate: string | null;
  }) => void;
  onDeleteInteraction: (interaction: Interaction) => void;
};

const pages: [CrmPage, string][] = [
  ['followUps', 'À relancer'],
  ['pipeline', 'Pipeline'],
  ['new', 'Ajouter'],
];

export function CrmView({
  followUps,
  interactions,
  onAddProspect,
  onDeleteInteraction,
  onDeleteProspect,
  onLogInteraction,
  onUpdateProspect,
  summary,
  today,
}: Props) {
  const [page, setPage] = useState<CrmPage>('followUps');
  const [selectedProspectId, setSelectedProspectId] = useState<string | null>(null);

  // La sélection ne survit pas à la suppression du prospect.
  const selected = followUps.find((followUp) => followUp.prospect.id === selectedProspectId) ?? null;

  if (selected) {
    return (
      <ProspectDetailView
        followUp={selected}
        history={interactionsForProspect(interactions, selected.prospect.id)}
        key={selected.prospect.id}
        onBack={() => setSelectedProspectId(null)}
        onDelete={() => {
          onDeleteProspect(selected.prospect);
          setSelectedProspectId(null);
        }}
        onDeleteInteraction={onDeleteInteraction}
        onLogInteraction={(input) => onLogInteraction({ ...input, prospectId: selected.prospect.id })}
        onUpdate={(input) => onUpdateProspect(selected.prospect.id, input)}
        today={today}
      />
    );
  }

  return (
    <>
      <nav className="tabs" aria-label="Navigation CRM">
        {pages.map(([id, label]) => (
          <button className={page === id ? 'active' : ''} key={id} onClick={() => setPage(id)} type="button">
            {label}
            {id === 'followUps' && summary.overdue > 0 ? <span className="tab-count">{summary.overdue}</span> : null}
          </button>
        ))}
      </nav>

      {page === 'new' ? (
        <ProspectFormView
          onAdd={(input) => {
            onAddProspect(input);
            setPage('pipeline');
          }}
        />
      ) : null}

      {page !== 'new' && followUps.length === 0 ? (
        <section className="details-stack single">
          <Panel title="Suivi client">
            <EmptyState>
              Aucun prospect enregistré. Ajoute un contact pour que ses relances remontent ici.
            </EmptyState>
            <button className="primary-button" onClick={() => setPage('new')} type="button">
              Ajouter un prospect
            </button>
          </Panel>
        </section>
      ) : null}

      {page === 'followUps' && followUps.length > 0 ? (
        <FollowUpsView followUps={followUps} onOpen={setSelectedProspectId} summary={summary} />
      ) : null}

      {page === 'pipeline' && followUps.length > 0 ? (
        <PipelineView followUps={followUps} onOpen={setSelectedProspectId} />
      ) : null}
    </>
  );
}
