import type { FinanceData, Opportunity, PipelineKind } from '../types';
import { daysBetween, todayISO } from './day';
import { stagesForPipeline } from './pipelines';

/**
 * Jours écoulés depuis l'entrée dans le stade courant de l'opportunité —
 * la pastille de fraîcheur de `PipelineView` (§6.2 : vert sous 7 jours,
 * orange 7 à 14, rouge au-delà).
 */
export const daysInCurrentStage = (data: FinanceData, opportunity: Opportunity, today: string = todayISO()): number => {
  const lastChange = data.stageChanges
    .filter((change) => change.opportunityId === opportunity.id)
    .sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id))[0];
  const referenceDate = lastChange?.date ?? opportunity.createdAt;

  return Math.max(0, daysBetween(referenceDate, today));
};

/**
 * Opportunités actuellement rattachées à ce pipeline.
 *
 * Une opportunité dont le pipeline a changé depuis emporte son historique de
 * stades avec elle : on ne le mélange pas dans les taux de l'ancien
 * pipeline, pour ne pas fausser un funnel avec des stades qui n'y ont jamais
 * vraiment appartenu.
 */
const opportunitiesOf = (data: FinanceData, pipeline: PipelineKind): Opportunity[] =>
  data.opportunities.filter((opportunity) => opportunity.pipeline === pipeline);

/** Nombre d'opportunités distinctes ayant atteint chaque stade, au moins une fois. */
export const stageFunnelCounts = (data: FinanceData, pipeline: PipelineKind): Record<string, number> => {
  const opportunityIds = new Set(opportunitiesOf(data, pipeline).map((opportunity) => opportunity.id));
  const counts: Record<string, number> = {};

  for (const stage of stagesForPipeline(pipeline)) {
    counts[stage.id] = data.stageChanges.filter(
      (change) => opportunityIds.has(change.opportunityId) && change.toStageId === stage.id,
    ).length;
  }

  return counts;
};

/**
 * Taux de conversion vers chaque stade depuis le précédent, en pourcentage.
 * `null` pour le premier stade (pas de précédent) ou si personne n'a encore
 * atteint le stade précédent.
 */
export const stageConversionRates = (data: FinanceData, pipeline: PipelineKind): Record<string, number | null> => {
  const stages = stagesForPipeline(pipeline);
  const counts = stageFunnelCounts(data, pipeline);
  const rates: Record<string, number | null> = {};

  stages.forEach((stage, index) => {
    if (index === 0) {
      rates[stage.id] = null;
      return;
    }

    const previousCount = counts[stages[index - 1].id];
    rates[stage.id] = previousCount > 0 ? Math.round((counts[stage.id] / previousCount) * 1000) / 10 : null;
  });

  return rates;
};

/** Durée moyenne, en jours, passée dans chaque stade avant d'en sortir. */
export const averageDaysInStage = (data: FinanceData, pipeline: PipelineKind): Record<string, number | null> => {
  const opportunityIds = new Set(opportunitiesOf(data, pipeline).map((opportunity) => opportunity.id));
  const durations: Record<string, number | null> = {};

  for (const stage of stagesForPipeline(pipeline)) {
    const samples = data.stageChanges
      .filter(
        (change) =>
          opportunityIds.has(change.opportunityId) && change.fromStageId === stage.id && change.daysInPreviousStage !== null,
      )
      .map((change) => change.daysInPreviousStage as number);

    durations[stage.id] =
      samples.length > 0 ? Math.round((samples.reduce((sum, value) => sum + value, 0) / samples.length) * 10) / 10 : null;
  }

  return durations;
};

/** Durée moyenne du cycle complet — de la création au gain — pour les affaires gagnées du pipeline. */
export const averageCycleDurationDays = (data: FinanceData, pipeline: PipelineKind): number | null => {
  const won = opportunitiesOf(data, pipeline).filter(
    (opportunity): opportunity is Opportunity & { statusDate: string } =>
      opportunity.status === 'won' && opportunity.statusDate !== null,
  );
  if (won.length === 0) return null;

  const total = won.reduce((sum, opportunity) => sum + daysBetween(opportunity.createdAt, opportunity.statusDate), 0);
  return Math.round((total / won.length) * 10) / 10;
};
