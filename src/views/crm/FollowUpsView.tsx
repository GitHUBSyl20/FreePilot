import type { CrmSummary, ProspectFollowUp } from '@freepilot/finance-core';
import { EmptyState, InfoRow, Panel } from '../../components/Panel';
import { formatCurrency } from '../../format';
import { ProspectRow } from './ProspectRow';

type Props = {
  followUps: ProspectFollowUp[];
  summary: CrmSummary;
  onOpen: (prospectId: string) => void;
};

/** Horizon des relances à préparer, au-delà de celles déjà dues. */
const UPCOMING_HORIZON_DAYS = 14;

export function FollowUpsView({ followUps, onOpen, summary }: Props) {
  const overdue = followUps.filter((followUp) => followUp.urgency === 'overdue');
  const dueToday = followUps.filter((followUp) => followUp.urgency === 'today');
  const upcoming = followUps.filter(
    (followUp) =>
      followUp.urgency === 'upcoming' && followUp.daysUntilDue !== null && followUp.daysUntilDue <= UPCOMING_HORIZON_DAYS,
  );

  return (
    <section className="details-stack single">
      <article className={`balance-card${overdue.length > 0 ? ' negative' : ''}`}>
        <span>Relances à traiter</span>
        <strong>{overdue.length + dueToday.length}</strong>
        <p>
          {overdue.length} en retard · {dueToday.length} aujourd’hui · {upcoming.length} sous {UPCOMING_HORIZON_DAYS}{' '}
          jours
        </p>
      </article>

      <Panel title="Portefeuille">
        <InfoRow helper="Relations encore ouvertes" label="Prospects en cours" value={String(summary.active)} />
        <InfoRow
          helper={`${summary.byTemperature.hot} chauds · ${summary.byTemperature.warm} tièdes · ${summary.byTemperature.cold} froids`}
          label="Par température"
          value={String(summary.byTemperature.hot + summary.byTemperature.warm + summary.byTemperature.cold)}
        />
        <InfoRow helper="Aucun contact enregistré" label="Jamais contactés" value={String(summary.neverContacted)} />
        <InfoRow label="Signés" value={String(summary.signed)} />
        <InfoRow helper="Factures émises non encaissées" label="CA en attente" value={formatCurrency(summary.pendingRevenue)} />
      </Panel>

      <Panel title="En retard">
        {overdue.length === 0 ? (
          <EmptyState>Aucune relance en retard.</EmptyState>
        ) : (
          overdue.map((followUp) => (
            <ProspectRow followUp={followUp} key={followUp.prospect.id} onOpen={() => onOpen(followUp.prospect.id)} />
          ))
        )}
      </Panel>

      <Panel title="Aujourd’hui">
        {dueToday.length === 0 ? (
          <EmptyState>Rien à relancer aujourd’hui.</EmptyState>
        ) : (
          dueToday.map((followUp) => (
            <ProspectRow followUp={followUp} key={followUp.prospect.id} onOpen={() => onOpen(followUp.prospect.id)} />
          ))
        )}
      </Panel>

      <Panel title="À venir">
        {upcoming.length === 0 ? (
          <EmptyState>Rien de prévu dans les {UPCOMING_HORIZON_DAYS} prochains jours.</EmptyState>
        ) : (
          upcoming.map((followUp) => (
            <ProspectRow followUp={followUp} key={followUp.prospect.id} onOpen={() => onOpen(followUp.prospect.id)} />
          ))
        )}
        <p className="muted-note">
          Sans date posée à la main, l’échéance se déduit du dernier contact et du délai lié à la température.
        </p>
      </Panel>
    </section>
  );
}
