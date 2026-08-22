import type { FinanceData, Opportunity } from '../types';
import { daysBetween } from './day';
import { interactionsForProspect } from './followUps';

/** Bucket des affaires sans source, sans événement d'origine ou sans prescripteur. */
export const UNSPECIFIED_CHANNEL_LABEL = 'Non renseigné';

export type ChannelStats = {
  key: string;
  label: string;
  opportunityCount: number;
  wonCount: number;
  /** % d'opportunités devenues gagnées, sur l'ensemble générées par ce canal. */
  conversionRate: number;
  signedRevenue: number;
  averageDeal: number | null;
  averageCycleDays: number | null;
};

const roundTo1 = (value: number): number => Math.round(value * 10) / 10;
const roundCurrency = (value: number): number => Math.round(value * 100) / 100;

const buildStats = (key: string, label: string, opportunities: Opportunity[]): ChannelStats => {
  const won = opportunities.filter((opportunity) => opportunity.status === 'won');
  const signedRevenue = won.reduce((sum, opportunity) => sum + opportunity.amount, 0);
  const cycleSamples = won
    .filter((opportunity): opportunity is Opportunity & { statusDate: string } => opportunity.statusDate !== null)
    .map((opportunity) => daysBetween(opportunity.createdAt, opportunity.statusDate));

  return {
    key,
    label,
    opportunityCount: opportunities.length,
    wonCount: won.length,
    conversionRate: opportunities.length > 0 ? roundTo1((won.length / opportunities.length) * 100) : 0,
    signedRevenue: roundCurrency(signedRevenue),
    averageDeal: won.length > 0 ? roundCurrency(signedRevenue / won.length) : null,
    averageCycleDays:
      cycleSamples.length > 0 ? roundTo1(cycleSamples.reduce((sum, days) => sum + days, 0) / cycleSamples.length) : null,
  };
};

/** Regroupe les opportunités par la clé fournie, `null` rejoignant le bucket « Non renseigné ». */
const groupBy = (opportunities: Opportunity[], keyOf: (opportunity: Opportunity) => string | null): Map<string, Opportunity[]> => {
  const groups = new Map<string, Opportunity[]>();

  for (const opportunity of opportunities) {
    const key = keyOf(opportunity) ?? UNSPECIFIED_CHANNEL_LABEL;
    const bucket = groups.get(key);
    if (bucket) bucket.push(opportunity);
    else groups.set(key, [opportunity]);
  }

  return groups;
};

const byRevenueDesc = (left: ChannelStats, right: ChannelStats): number => right.signedRevenue - left.signedRevenue;

/** §6.5 — décider où remettre du temps de prospection : conversion et CA par source de contact du prospect. */
export const channelStatsBySource = (data: FinanceData): ChannelStats[] => {
  const sourceByProspect = new Map(data.prospects.map((prospect) => [prospect.id, prospect.source]));
  const groups = groupBy(data.opportunities, (opportunity) => sourceByProspect.get(opportunity.prospectId) ?? null);

  return [...groups.entries()].map(([key, opportunities]) => buildStats(key, key, opportunities)).sort(byRevenueDesc);
};

/** Même lecture, mais par événement précis d'origine de l'affaire plutôt que par source générale du contact. */
export const channelStatsByOriginEvent = (data: FinanceData): ChannelStats[] => {
  const groups = groupBy(data.opportunities, (opportunity) => opportunity.originEvent);

  return [...groups.entries()].map(([key, opportunities]) => buildStats(key, key, opportunities)).sort(byRevenueDesc);
};

export type ReferrerStats = ChannelStats & {
  /** Dernier contact avec le prescripteur lui-même, pas avec les affaires référées. */
  lastContactDate: string | null;
};

/** « Même tableau » par prescripteur (§6.5), avec la date du dernier contact en plus (§4). */
export const channelStatsByReferrer = (data: FinanceData): ReferrerStats[] => {
  const referred = data.opportunities.filter(
    (opportunity): opportunity is Opportunity & { referrerProspectId: string } => opportunity.referrerProspectId !== null,
  );
  const groups = groupBy(referred, (opportunity) => opportunity.referrerProspectId);
  const prospectById = new Map(data.prospects.map((prospect) => [prospect.id, prospect]));

  return [...groups.entries()]
    .map(([referrerId, opportunities]) => {
      const referrer = prospectById.get(referrerId);
      const label = referrer?.name ?? 'Prescripteur supprimé';
      const lastContactDate = interactionsForProspect(data.interactions, referrerId)[0]?.date ?? null;

      return { ...buildStats(referrerId, label, opportunities), lastContactDate };
    })
    .sort(byRevenueDesc);
};
