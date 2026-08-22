import type {
  AppSettings,
  CrmSummary,
  EditableInvoice,
  FinanceData,
  FollowUpUrgency,
  Interaction,
  Prospect,
  ProspectFollowUp,
  ProspectRevenue,
  ProspectTemperature,
} from '../types';
import { addDays, daysBetween, todayISO } from './day';

const noRevenue = (): ProspectRevenue => ({ collected: 0, pending: 0 });

/** Délai de relance applicable à un prospect, selon sa température. */
export const followUpDelayDays = (temperature: ProspectTemperature, settings: AppSettings): number => {
  if (temperature === 'hot') return settings.hotProspectFollowUpDays;
  if (temperature === 'warm') return settings.warmProspectFollowUpDays;
  return settings.coldProspectFollowUpDays;
};

/**
 * CA rattaché à chaque prospect : encaissé pour les factures payées, attendu
 * pour celles qui sont parties sans être réglées.
 */
export const revenueByProspect = (invoices: EditableInvoice[]): Map<string, ProspectRevenue> => {
  const revenues = new Map<string, ProspectRevenue>();

  for (const invoice of invoices) {
    if (!invoice.prospectId) continue;

    const revenue = revenues.get(invoice.prospectId) ?? noRevenue();
    if (invoice.status === 'paid') revenue.collected += invoice.totalTTC;
    if (invoice.status === 'sent' || invoice.status === 'overdue') revenue.pending += invoice.totalTTC;
    revenues.set(invoice.prospectId, revenue);
  }

  return revenues;
};

/** Contacts d'un prospect, du plus récent au plus ancien. */
export const interactionsForProspect = (interactions: Interaction[], prospectId: string): Interaction[] =>
  interactions
    .filter((interaction) => interaction.prospectId === prospectId)
    .sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id));

const urgencyFor = (daysUntilDue: number): FollowUpUrgency => {
  if (daysUntilDue < 0) return 'overdue';
  if (daysUntilDue === 0) return 'today';
  return 'upcoming';
};

/**
 * Situation de relance d'un prospect.
 *
 * Sans date planifiée, l'échéance se déduit du dernier contact et du délai lié
 * à la température : c'est ce qui évite qu'un prospect sorte des radars faute
 * d'avoir pensé à noter une relance. Un prospect signé ou perdu ne remonte que
 * si une date a été posée explicitement.
 */
export const buildProspectFollowUp = (
  prospect: Prospect,
  context: { interactions: Interaction[]; settings: AppSettings; revenue?: ProspectRevenue },
  today: string,
): ProspectFollowUp => {
  const history = interactionsForProspect(context.interactions, prospect.id);
  const lastInteraction = history[0] ?? null;

  const inferredDueDate =
    prospect.status === 'active'
      ? addDays(lastInteraction?.date ?? prospect.createdAt, followUpDelayDays(prospect.temperature, context.settings))
      : null;
  const dueDate = prospect.nextFollowUpDate ?? inferredDueDate;
  const daysUntilDue = dueDate ? daysBetween(today, dueDate) : null;

  return {
    prospect,
    lastInteraction,
    interactionCount: history.length,
    daysSinceLastContact: lastInteraction ? daysBetween(lastInteraction.date, today) : null,
    dueDate,
    inferred: dueDate !== null && prospect.nextFollowUpDate === null,
    urgency: daysUntilDue === null ? null : urgencyFor(daysUntilDue),
    daysUntilDue,
    revenue: context.revenue ?? noRevenue(),
  };
};

/** Tous les prospects, les échéances les plus anciennes d'abord. */
export const buildProspectFollowUps = (data: FinanceData, today: string = todayISO()): ProspectFollowUp[] => {
  const revenues = revenueByProspect(data.invoices);

  return data.prospects
    .map((prospect) =>
      buildProspectFollowUp(
        prospect,
        { interactions: data.interactions, settings: data.settings, revenue: revenues.get(prospect.id) },
        today,
      ),
    )
    .sort((left, right) => {
      // Les prospects sans échéance ferment la marche.
      if (left.dueDate === null || right.dueDate === null) {
        if (left.dueDate === right.dueDate) return left.prospect.name.localeCompare(right.prospect.name);
        return left.dueDate === null ? 1 : -1;
      }

      return left.dueDate.localeCompare(right.dueDate) || left.prospect.name.localeCompare(right.prospect.name);
    });
};

/** Relances à traiter : en retard ou à faire aujourd'hui. */
export const listDueFollowUps = (data: FinanceData, today: string = todayISO()): ProspectFollowUp[] =>
  buildProspectFollowUps(data, today).filter(
    (followUp) => followUp.urgency === 'overdue' || followUp.urgency === 'today',
  );

/** Vrai si le prospect porte au moins une opportunité encore ouverte. */
const hasOpenOpportunity = (data: FinanceData, prospectId: string): boolean =>
  data.opportunities.some((opportunity) => opportunity.prospectId === prospectId && opportunity.status === 'open');

/**
 * R8 — le moteur de relance par température ne couvre que les prospects sans
 * opportunité ouverte (le nurturing de réseau). Dès qu'une affaire est
 * ouverte, ce sont les `Task` qui pilotent la relance : les deux ne doivent
 * jamais se concurrencer sur le même prospect le même jour, ce que ce filtre
 * garantit par construction plutôt que par une déduplication a posteriori.
 */
export const networkFollowUps = (data: FinanceData, today: string = todayISO()): ProspectFollowUp[] =>
  buildProspectFollowUps(data, today).filter((followUp) => !hasOpenOpportunity(data, followUp.prospect.id));

/** Relances réseau à traiter : en retard ou à faire aujourd'hui, hors prospects déjà pilotés par une affaire. */
export const listDueNetworkFollowUps = (data: FinanceData, today: string = todayISO()): ProspectFollowUp[] =>
  networkFollowUps(data, today).filter((followUp) => followUp.urgency === 'overdue' || followUp.urgency === 'today');

export const summarizeCrm = (data: FinanceData, today: string = todayISO()): CrmSummary => {
  const followUps = buildProspectFollowUps(data, today);
  const summary: CrmSummary = {
    total: followUps.length,
    active: 0,
    signed: 0,
    lost: 0,
    byTemperature: { hot: 0, warm: 0, cold: 0 },
    overdue: 0,
    dueToday: 0,
    neverContacted: 0,
    signedCollectedRevenue: 0,
    pendingRevenue: 0,
  };

  for (const followUp of followUps) {
    const { prospect } = followUp;

    if (prospect.status === 'active') summary.active += 1;
    if (prospect.status === 'signed') summary.signed += 1;
    if (prospect.status === 'lost') summary.lost += 1;

    // La température ne qualifie que les relations encore ouvertes.
    if (prospect.status === 'active') summary.byTemperature[prospect.temperature] += 1;

    // R8 : une fois pilotée par une affaire ouverte, l'échéance de température
    // ne compte plus dans les compteurs de relance réseau — sinon le même
    // prospect remonterait deux fois le même jour, une fois ici et une fois
    // parmi les tâches.
    const coveredByNetwork = !hasOpenOpportunity(data, prospect.id);
    if (coveredByNetwork && followUp.urgency === 'overdue') summary.overdue += 1;
    if (coveredByNetwork && followUp.urgency === 'today') summary.dueToday += 1;
    if (prospect.status === 'active' && followUp.interactionCount === 0) summary.neverContacted += 1;

    if (prospect.status === 'signed') summary.signedCollectedRevenue += followUp.revenue.collected;
    summary.pendingRevenue += followUp.revenue.pending;
  }

  return summary;
};
