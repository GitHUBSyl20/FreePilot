import type { FinanceData, Opportunity, PipelineKind } from '@freepilot/finance-core';
import { daysInCurrentStage, openTasksForOpportunity, PIPELINE_LABELS, PIPELINE_ORDER, stagesForPipeline } from '@freepilot/finance-core';
import { useMemo, useState } from 'react';
import { EmptyState, Panel } from '../../components/Panel';
import { formatCurrency, formatDate } from '../../format';

type Props = {
  data: FinanceData;
  today: string;
  onOpenProspect: (prospectId: string) => void;
  onChangeStage: (opportunityId: string, stageId: string) => void;
};

/** Vert sous 7 jours dans le stade, orange de 7 à 14, rouge au-delà (§6.2). */
const freshnessTone = (days: number): 'fresh' | 'stale-warn' | 'stale-alert' => {
  if (days < 7) return 'fresh';
  if (days <= 14) return 'stale-warn';
  return 'stale-alert';
};

const weightedTotal = (opportunities: Opportunity[]): number =>
  opportunities.reduce((sum, opportunity) => sum + opportunity.amount * (opportunity.probability / 100), 0);

/**
 * Pipeline par stade — l'axe central voulu par la spec : où en est l'affaire
 * dans son cycle de vente, indépendamment de la température de la relation
 * (qui reste consultable dans l'onglet séparé `TemperatureView`).
 */
export function PipelineView({ data, onChangeStage, onOpenProspect, today }: Props) {
  const [pipeline, setPipeline] = useState<PipelineKind>(PIPELINE_ORDER[0]);

  const prospectById = useMemo(() => new Map(data.prospects.map((prospect) => [prospect.id, prospect])), [data.prospects]);
  const openOpportunities = useMemo(
    () => data.opportunities.filter((opportunity) => opportunity.pipeline === pipeline && opportunity.status === 'open'),
    [data.opportunities, pipeline],
  );
  const stages = useMemo(() => stagesForPipeline(pipeline), [pipeline]);

  const prospectLabel = (prospectId: string): string => {
    const prospect = prospectById.get(prospectId);
    if (!prospect) return 'Prospect supprimé';
    return prospect.company ? `${prospect.name} · ${prospect.company}` : prospect.name;
  };

  return (
    <section className="details-stack single">
      <nav className="tabs" aria-label="Choix du pipeline">
        {PIPELINE_ORDER.map((kind) => (
          <button className={pipeline === kind ? 'active' : ''} key={kind} onClick={() => setPipeline(kind)} type="button">
            {PIPELINE_LABELS[kind]}
          </button>
        ))}
      </nav>

      {stages.map((stage) => {
        const inStage = openOpportunities.filter((opportunity) => opportunity.stageId === stage.id);

        return (
          <Panel key={stage.id} title={`${stage.label} (${inStage.length})`}>
            {inStage.length === 0 ? (
              <EmptyState>Aucune affaire à ce stade.</EmptyState>
            ) : (
              inStage.map((opportunity) => {
                const nextTask = openTasksForOpportunity(data, opportunity.id)[0] ?? null;
                const stageAge = daysInCurrentStage(data, opportunity, today);
                const freshness = freshnessTone(stageAge);

                return (
                  <div className="record-card" key={opportunity.id}>
                    <button className="charge-label" onClick={() => onOpenProspect(opportunity.prospectId)} type="button">
                      <strong>{opportunity.title}</strong>
                      <span>{prospectLabel(opportunity.prospectId)}</span>
                    </button>

                    <span className="badge-row">
                      <span className={`badge ${freshness}`}>{stageAge} j dans ce stade</span>
                      {opportunity.amount > 0 ? <span className="row-detail">{formatCurrency(opportunity.amount)}</span> : null}
                      {pipeline !== 'partenariat' ? <span className="row-detail">{opportunity.probability} %</span> : null}
                    </span>

                    <p className="muted-note">
                      {nextTask ? `${nextTask.label} · ${formatDate(nextTask.dueDate)}` : 'Sans prochaine action'}
                    </p>

                    <select
                      aria-label={`Stade de « ${opportunity.title} »`}
                      onChange={(event) => onChangeStage(opportunity.id, event.target.value)}
                      value={opportunity.stageId}
                    >
                      {stages.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })
            )}

            {pipeline !== 'partenariat' && inStage.length > 0 ? (
              <p className="muted-note">Pondéré du stade : {formatCurrency(weightedTotal(inStage))}</p>
            ) : null}
          </Panel>
        );
      })}
    </section>
  );
}
