import type { FinanceData, Opportunity } from '@freepilot/finance-core';
import {
  daysBetween,
  dormantOpportunities,
  dueTasks,
  opportunitiesMissingNextAction,
  opportunitiesPastCloseDate,
  PIPELINE_LABELS,
  weightedPipelineByMonth,
} from '@freepilot/finance-core';
import { useMemo, useState } from 'react';
import { EmptyState, InfoRow, Panel } from '../../components/Panel';
import { formatCurrency, formatDayGap, formatMonthLabel } from '../../format';

type AlertKey = 'missingAction' | 'dormant' | 'pastCloseDate';

type Props = {
  data: FinanceData;
  today: string;
  onOpenProspect: (prospectId: string) => void;
  onCompleteTask: (taskId: string) => void;
};

/**
 * « 30/60/90 jours » se lit ici comme trois mois glissants — mois courant,
 * suivant, puis celui d'après — plutôt qu'une fenêtre exacte en jours : le
 * pondéré se répartit par mois (`expectedCloseDate`), une coupure au jour
 * près couperait des affaires en plein milieu d'un mois sans raison.
 */
const HORIZON_LABELS = ['30 j', '60 j', '90 j'];

export function TodayView({ data, onCompleteTask, onOpenProspect, today }: Props) {
  const [expandedAlert, setExpandedAlert] = useState<AlertKey | null>(null);

  const prospectById = useMemo(() => new Map(data.prospects.map((prospect) => [prospect.id, prospect])), [data.prospects]);
  const tasks = useMemo(() => dueTasks(data, today), [data, today]);
  const missingAction = useMemo(() => opportunitiesMissingNextAction(data), [data]);
  const dormant = useMemo(() => dormantOpportunities(data, today), [data, today]);
  const pastCloseDate = useMemo(() => opportunitiesPastCloseDate(data, today), [data, today]);
  const weighted = useMemo(() => weightedPipelineByMonth(data, today.slice(0, 7), 3), [data, today]);

  const alerts: { key: AlertKey; label: string; opportunities: Opportunity[] }[] = [
    { key: 'missingAction', label: 'Sans prochaine action', opportunities: missingAction },
    { key: 'dormant', label: 'Dormantes', opportunities: dormant },
    { key: 'pastCloseDate', label: 'Clôture dépassée', opportunities: pastCloseDate },
  ];
  const expanded = alerts.find((alert) => alert.key === expandedAlert) ?? null;

  const prospectLabel = (prospectId: string): string => {
    const prospect = prospectById.get(prospectId);
    if (!prospect) return 'Prospect supprimé';
    return prospect.company ? `${prospect.name} · ${prospect.company}` : prospect.name;
  };

  return (
    <section className="details-stack single">
      <article className={`balance-card${tasks.length > 0 ? ' negative' : ''}`}>
        <span>Tâches à traiter aujourd’hui</span>
        <strong>{tasks.length}</strong>
        <p>{tasks.length === 0 ? 'Rien à faire aujourd’hui.' : 'En retard et dues aujourd’hui, priorité haute en tête.'}</p>
      </article>

      <Panel title="Tâches">
        {tasks.length === 0 ? (
          <EmptyState>Aucune tâche en retard ni due aujourd’hui.</EmptyState>
        ) : (
          tasks.map((task) => (
            <div className="charge-row" key={task.id}>
              <button className="charge-label" onClick={() => onOpenProspect(task.prospectId)} type="button">
                <strong>{task.label}</strong>
                <span>
                  {prospectLabel(task.prospectId)} · {formatDayGap(daysBetween(today, task.dueDate))}
                </span>
              </button>
              <div className="charge-actions">
                <button className="mini-button" onClick={() => onCompleteTask(task.id)} type="button">
                  Fait
                </button>
              </div>
            </div>
          ))
        )}
      </Panel>

      <Panel title="Alertes">
        <div className="button-row">
          {alerts.map((alert) => (
            <button
              className="secondary-button"
              key={alert.key}
              onClick={() => setExpandedAlert(expandedAlert === alert.key ? null : alert.key)}
              type="button"
            >
              {alert.label} · {alert.opportunities.length}
            </button>
          ))}
        </div>

        {expanded ? (
          expanded.opportunities.length === 0 ? (
            <EmptyState>Aucune opportunité concernée.</EmptyState>
          ) : (
            expanded.opportunities.map((opportunity) => (
              <button
                className="row-button"
                key={opportunity.id}
                onClick={() => onOpenProspect(opportunity.prospectId)}
                type="button"
              >
                <span className="row-title">
                  <strong>{opportunity.title}</strong>
                  {opportunity.amount > 0 ? <span className="row-detail">{formatCurrency(opportunity.amount)}</span> : null}
                </span>
                <span className="row-detail">{prospectLabel(opportunity.prospectId)}</span>
              </button>
            ))
          )
        ) : null}
      </Panel>

      <Panel title="Pondéré à venir">
        {weighted.map((entry, index) => (
          <InfoRow
            helper={`${PIPELINE_LABELS.formation} ${formatCurrency(entry.byPipeline.formation)} · ${PIPELINE_LABELS.projet} ${formatCurrency(entry.byPipeline.projet)}`}
            key={entry.month}
            label={`${HORIZON_LABELS[index]} · ${formatMonthLabel(entry.month)}`}
            value={formatCurrency(entry.total)}
          />
        ))}
        <p className="muted-note">
          Revenu attendu, pas du chiffre d’affaires encaissé — le pipeline partenariat n’y entre jamais.
        </p>
      </Panel>
    </section>
  );
}
