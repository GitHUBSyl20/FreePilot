import type {
  CrmSummary,
  FinanceData,
  Interaction,
  InteractionChannel,
  Prospect,
  ProspectFollowUp,
  ProspectTemperature,
} from '@freepilot/finance-core';
import { interactionsForProspect, networkFollowUps } from '@freepilot/finance-core';
import { useMemo, useState } from 'react';
import { EmptyState, Panel } from '../../components/Panel';
import { FollowUpsView } from './FollowUpsView';
import { PipelineView } from './PipelineView';
import { ProspectDetailView } from './ProspectDetailView';
import { ProspectFormView } from './ProspectFormView';
import { TemperatureView } from './TemperatureView';
import { TodayView } from './TodayView';

type CrmPage = 'today' | 'network' | 'pipeline' | 'temperature' | 'new';

type ProspectChanges = Partial<
  Pick<Prospect, 'company' | 'name' | 'nextFollowUpDate' | 'notes' | 'source' | 'status' | 'temperature'>
>;

type Props = {
  data: FinanceData;
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
  onCompleteTask: (taskId: string) => void;
  onChangeOpportunityStage: (opportunityId: string, stageId: string) => void;
};

const pages: [CrmPage, string][] = [
  ['today', 'Aujourd’hui'],
  ['network', 'Réseau'],
  ['pipeline', 'Pipeline'],
  ['temperature', 'Température'],
  ['new', 'Ajouter'],
];

export function CrmView({
  data,
  followUps,
  interactions,
  onAddProspect,
  onChangeOpportunityStage,
  onCompleteTask,
  onDeleteInteraction,
  onDeleteProspect,
  onLogInteraction,
  onUpdateProspect,
  summary,
  today,
}: Props) {
  const [page, setPage] = useState<CrmPage>('today');
  const [selectedProspectId, setSelectedProspectId] = useState<string | null>(null);
  // R8 : le nurturing réseau ne couvre plus un prospect dès qu'une affaire
  // ouverte le pilote — voir crm/followUps.ts.
  const network = useMemo(() => networkFollowUps(data, today), [data, today]);

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
            {id === 'network' && summary.overdue > 0 ? <span className="tab-count">{summary.overdue}</span> : null}
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

      {page === 'today' && followUps.length > 0 ? (
        <TodayView data={data} onCompleteTask={onCompleteTask} onOpenProspect={setSelectedProspectId} today={today} />
      ) : null}

      {page === 'network' && followUps.length > 0 ? (
        <FollowUpsView followUps={network} onOpen={setSelectedProspectId} summary={summary} />
      ) : null}

      {page === 'pipeline' && followUps.length > 0 ? (
        <PipelineView
          data={data}
          onChangeStage={onChangeOpportunityStage}
          onOpenProspect={setSelectedProspectId}
          today={today}
        />
      ) : null}

      {page === 'temperature' && followUps.length > 0 ? (
        <TemperatureView followUps={followUps} onOpen={setSelectedProspectId} />
      ) : null}
    </>
  );
}
