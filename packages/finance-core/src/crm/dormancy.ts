import type { FinanceData, Opportunity } from '../types';
import { daysBetween, todayISO } from './day';
import { interactionsForProspect } from './followUps';

/**
 * R2 — dormance : sans interaction sur le prospect depuis le délai réglé,
 * l'opportunité ouverte est marquée dormante. Le pipeline partenariat suit
 * son propre rythme, plus lent (`dormantPartnershipDays`) : un partenaire ne
 * se sollicite pas comme un prospect en cours de signature.
 *
 * La référence est la dernière interaction du **prospect**, pas de
 * l'opportunité : `Interaction` n'est pas liée à `Opportunity` (voir la
 * décision d'architecture). Sans aucune interaction, la référence est la
 * date de création de l'opportunité elle-même.
 */
export const dormantOpportunities = (data: FinanceData, today: string = todayISO()): Opportunity[] =>
  data.opportunities.filter((opportunity) => {
    if (opportunity.status !== 'open') return false;

    const threshold =
      opportunity.pipeline === 'partenariat' ? data.settings.dormantPartnershipDays : data.settings.dormantOpportunityDays;
    const lastInteraction = interactionsForProspect(data.interactions, opportunity.prospectId)[0];
    const referenceDate = lastInteraction?.date ?? opportunity.createdAt;

    return daysBetween(referenceDate, today) >= threshold;
  });
