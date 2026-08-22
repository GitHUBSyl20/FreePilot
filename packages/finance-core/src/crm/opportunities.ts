import type { FinanceData, LossReason, Opportunity, OpportunityStatus, PipelineKind, StageChange } from '../types';
import { daysBetween, todayISO } from './day';
import { stageProbability } from './pipelines';

const createId = (prefix: string): string => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const sanitizeAmount = (amount: number): number => Math.max(0, amount);

const clampProbability = (value: number): number => Math.min(100, Math.max(0, Math.round(value)));

/** Changement de stade le plus récent d'une opportunité, ou `null` s'il n'y en a aucun. */
const lastStageChangeFor = (stageChanges: StageChange[], opportunityId: string): StageChange | null =>
  stageChanges
    .filter((change) => change.opportunityId === opportunityId)
    .sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id))[0] ?? null;

export type AddOpportunityInput = {
  prospectId: string;
  title: string;
  pipeline: PipelineKind;
  stageId: string;
  amount?: number;
  recurring?: boolean;
  monthlyAmount?: number | null;
  /** Saisie manuelle : fige `probabilityOverride` (R4). Absente, la probabilité suit le stade. */
  probability?: number;
  expectedCloseDate?: string | null;
  originEvent?: string | null;
  referrerProspectId?: string | null;
  funding?: 'direct' | 'opco' | 'mixed' | null;
  createdAt?: string;
};

/**
 * Crée une opportunité et journalise son premier stade (R6) : le passage de
 * « rien » au stade initial est lui aussi un changement de stade.
 *
 * Le pipeline partenariat n'a ni montant ni probabilité chiffrée (§4) : les
 * deux sont forcés à zéro quel que soit ce qui est saisi, pour qu'il ne
 * puisse jamais entrer dans le pondéré par erreur de saisie.
 */
export const addOpportunity = (data: FinanceData, input: AddOpportunityInput): FinanceData => {
  const createdAt = input.createdAt ?? todayISO();
  const isPartnership = input.pipeline === 'partenariat';
  const probabilityOverride = input.probability !== undefined;
  const recurring = isPartnership ? false : Boolean(input.recurring);

  const opportunity: Opportunity = {
    id: createId('opportunity'),
    prospectId: input.prospectId,
    title: input.title.trim() || 'Affaire sans titre',
    pipeline: input.pipeline,
    stageId: input.stageId,
    amount: isPartnership ? 0 : sanitizeAmount(input.amount ?? 0),
    recurring,
    monthlyAmount: recurring ? input.monthlyAmount ?? null : null,
    probability: isPartnership
      ? 0
      : probabilityOverride
        ? clampProbability(input.probability as number)
        : stageProbability(input.pipeline, input.stageId, data.settings.stageProbabilities),
    probabilityOverride: isPartnership ? false : probabilityOverride,
    expectedCloseDate: input.expectedCloseDate ?? null,
    originEvent: input.originEvent?.trim() || null,
    referrerProspectId: input.referrerProspectId ?? null,
    funding: input.pipeline === 'formation' ? input.funding ?? null : null,
    status: 'open',
    lossReason: null,
    statusDate: null,
    createdAt,
  };

  const stageChange: StageChange = {
    id: createId('stage-change'),
    opportunityId: opportunity.id,
    fromStageId: null,
    toStageId: opportunity.stageId,
    date: createdAt,
    daysInPreviousStage: null,
  };

  return {
    ...data,
    opportunities: [opportunity, ...data.opportunities],
    stageChanges: [stageChange, ...data.stageChanges],
  };
};

export type UpdateOpportunityInput = Partial<{
  title: string;
  pipeline: PipelineKind;
  stageId: string;
  amount: number;
  recurring: boolean;
  monthlyAmount: number | null;
  /** Saisie manuelle : fige `probabilityOverride` (R4). */
  probability: number;
  /**
   * Passé explicitement à `false`, revient à la probabilité automatique du
   * stade courant — même idiome que `nextFollowUpDate: null` sur un
   * prospect. Sans effet si `probability` est fourni dans le même appel.
   */
  probabilityOverride: false;
  expectedCloseDate: string | null;
  originEvent: string | null;
  referrerProspectId: string | null;
  funding: 'direct' | 'opco' | 'mixed' | null;
  status: OpportunityStatus;
  lossReason: LossReason | null;
  /** Date de gain ou de perte. Par défaut, celle du jour à la clôture. */
  statusDate: string | null;
}>;

/**
 * Motif de refus d'une transition de statut (R3) : « pas d'exception, y
 * compris à l'import ». Exportée pour que l'écran de saisie affiche le champ
 * manquant avant même d'appeler `updateOpportunity`, et pour être testée
 * indépendamment de tout composant.
 */
export type OpportunityStatusRejection = 'wonRequiresAmountAndDate' | 'lostRequiresReason';

export const checkOpportunityStatusTransition = (
  current: Opportunity,
  input: UpdateOpportunityInput,
  today: string,
): OpportunityStatusRejection | null => {
  const nextStatus = input.status ?? current.status;

  if (nextStatus === 'won') {
    const amount = input.amount ?? current.amount;
    const recurring = input.recurring ?? current.recurring;
    const monthlyAmount = input.monthlyAmount !== undefined ? input.monthlyAmount : current.monthlyAmount;
    // Une affaire purement récurrente (amount à 0, valeur portée par
    // monthlyAmount) compte comme montant valide : R3 vérifie qu'un
    // engagement chiffré existe, pas que ce soit précisément `amount`.
    const hasValue = amount > 0 || (recurring && monthlyAmount !== null && monthlyAmount > 0);
    const statusDate = input.statusDate !== undefined ? input.statusDate : current.status === 'won' ? current.statusDate : today;
    if (!hasValue || !statusDate) return 'wonRequiresAmountAndDate';
  }

  if (nextStatus === 'lost') {
    const lossReason = input.lossReason !== undefined ? input.lossReason : current.status === 'lost' ? current.lossReason : null;
    if (!lossReason) return 'lostRequiresReason';
  }

  return null;
};

/**
 * Met à jour une opportunité. Une transition vers `won` ou `lost` qui ne
 * respecte pas R3 est refusée : la fonction renvoie `data` inchangée, comme
 * le fait déjà `logInteraction` sur un prospect inconnu. L'écran de saisie
 * doit appeler `checkOpportunityStatusTransition` en amont pour guider la
 * saisie plutôt que de découvrir le refus après coup.
 */
export const updateOpportunity = (
  data: FinanceData,
  opportunityId: string,
  input: UpdateOpportunityInput,
  today: string = todayISO(),
): FinanceData => {
  const current = data.opportunities.find((item) => item.id === opportunityId);
  if (!current) return data;
  if (checkOpportunityStatusTransition(current, input, today) !== null) return data;

  const nextPipeline = input.pipeline ?? current.pipeline;
  const nextStageId = input.stageId ?? current.stageId;
  const nextStatus = input.status ?? current.status;
  const isPartnership = nextPipeline === 'partenariat';
  const stageChanged = nextStageId !== current.stageId || nextPipeline !== current.pipeline;

  // R4 — la probabilité suit le stade par défaut ; une saisie manuelle la
  // fige, et un changement de stade n'écrase plus une valeur déjà figée.
  // `probabilityOverride: false` explicite revient à l'automatique, sauf si
  // `probability` est fourni dans le même appel (la saisie l'emporte).
  const clearingOverride = input.probability === undefined && input.probabilityOverride === false;
  const probabilityOverride = clearingOverride ? false : input.probability !== undefined ? true : current.probabilityOverride;
  const probability = isPartnership
    ? 0
    : input.probability !== undefined
      ? clampProbability(input.probability)
      : clearingOverride || (stageChanged && !current.probabilityOverride)
        ? stageProbability(nextPipeline, nextStageId, data.settings.stageProbabilities)
        : current.probability;

  const recurring = isPartnership ? false : input.recurring ?? current.recurring;
  const statusChangedToClosed = nextStatus !== 'open' && current.status !== nextStatus;

  const updated: Opportunity = {
    ...current,
    title: input.title?.trim() || current.title,
    pipeline: nextPipeline,
    stageId: nextStageId,
    amount: isPartnership ? 0 : input.amount !== undefined ? sanitizeAmount(input.amount) : current.amount,
    recurring,
    monthlyAmount: recurring ? input.monthlyAmount ?? current.monthlyAmount : null,
    probability,
    probabilityOverride: isPartnership ? false : probabilityOverride,
    expectedCloseDate: input.expectedCloseDate === undefined ? current.expectedCloseDate : input.expectedCloseDate,
    originEvent: input.originEvent === undefined ? current.originEvent : input.originEvent?.trim() || null,
    referrerProspectId: input.referrerProspectId === undefined ? current.referrerProspectId : input.referrerProspectId,
    funding: nextPipeline === 'formation' ? input.funding ?? current.funding : null,
    status: nextStatus,
    lossReason: nextStatus === 'lost' ? input.lossReason ?? current.lossReason : nextStatus === 'open' ? null : current.lossReason,
    statusDate:
      input.statusDate !== undefined
        ? input.statusDate
        : statusChangedToClosed
          ? today
          : nextStatus === 'open'
            ? null
            : current.statusDate,
  };

  const opportunities = data.opportunities.map((item) => (item.id === opportunityId ? updated : item));

  if (!stageChanged) return { ...data, opportunities };

  // R6 — journalisation au moment du changement, jamais reconstruite après coup.
  const lastChange = lastStageChangeFor(data.stageChanges, opportunityId);
  const daysInPreviousStage = daysBetween(lastChange ? lastChange.date : current.createdAt, today);
  const stageChange: StageChange = {
    id: createId('stage-change'),
    opportunityId,
    fromStageId: current.stageId,
    toStageId: nextStageId,
    date: today,
    daysInPreviousStage,
  };

  return { ...data, opportunities, stageChanges: [stageChange, ...data.stageChanges] };
};

/**
 * Supprime une opportunité avec ses tâches et son historique de stades. Les
 * interactions restent : elles appartiennent au prospect, pas à l'affaire.
 */
export const deleteOpportunity = (data: FinanceData, opportunityId: string): FinanceData => ({
  ...data,
  opportunities: data.opportunities.filter((opportunity) => opportunity.id !== opportunityId),
  stageChanges: data.stageChanges.filter((change) => change.opportunityId !== opportunityId),
  tasks: data.tasks.filter((task) => task.opportunityId !== opportunityId),
});

/**
 * R1 — toute opportunité ouverte doit porter au moins une tâche ouverte.
 * Ne bloque jamais l'enregistrement : signale seulement, pour remonter dans
 * l'alerte « Sans prochaine action » de `TodayView`.
 */
export const opportunitiesMissingNextAction = (data: FinanceData): Opportunity[] =>
  data.opportunities.filter(
    (opportunity) =>
      opportunity.status === 'open' &&
      !data.tasks.some((task) => task.opportunityId === opportunity.id && task.status === 'open'),
  );

/** R7 — une échéance de clôture dépassée sur une affaire encore ouverte appelle une replanification. */
export const opportunitiesPastCloseDate = (data: FinanceData, today: string = todayISO()): Opportunity[] =>
  data.opportunities.filter(
    (opportunity) =>
      opportunity.status === 'open' && opportunity.expectedCloseDate !== null && opportunity.expectedCloseDate < today,
  );

/** Opportunités ouvertes d'un prospect, les plus récemment créées d'abord. */
export const opportunitiesForProspect = (data: FinanceData, prospectId: string): Opportunity[] =>
  data.opportunities
    .filter((opportunity) => opportunity.prospectId === prospectId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
