import type { FinanceData } from '../types';
import { addProspect, logInteraction } from '../operations';
import { addDays, todayISO } from './day';
import { addOpportunity } from './opportunities';
import { PIPELINE_ORDER } from './pipelines';
import { addTask } from './tasks';

export type QuickCaptureInput = {
  name: string;
  company?: string | null;
  originEvent?: string | null;
  note?: string;
  createdAt?: string;
};

/**
 * Capture terrain (§6.6) : deux gestes, quatre champs, quatre écritures —
 * rien d'autre. Composé à partir des opérations existantes (addProspect,
 * logInteraction, addOpportunity, addTask) plutôt que réécrit, pour hériter
 * de leurs règles (journalisation R6, etc.) sans les dupliquer.
 *
 * Pipeline par défaut : `PIPELINE_ORDER[0]`, la même convention que le
 * formulaire d'opportunité complet — la capture terrain ne demande pas la
 * nature de l'affaire, à trancher plus tard depuis la fiche prospect.
 */
export const captureFieldProspect = (data: FinanceData, input: QuickCaptureInput): FinanceData => {
  const createdAt = input.createdAt ?? todayISO();
  const company = input.company?.trim() || null;
  const originEvent = input.originEvent?.trim() || null;

  const withProspect = addProspect(data, {
    name: input.name,
    company,
    source: originEvent,
    temperature: 'warm',
    createdAt,
  });
  const prospectId = withProspect.prospects[0].id;

  const withInteraction = logInteraction(withProspect, {
    prospectId,
    date: createdAt,
    channel: 'event',
    note: input.note ?? '',
  });

  const withOpportunity = addOpportunity(withInteraction, {
    prospectId,
    title: company ? `${input.name} — ${company}` : input.name,
    pipeline: PIPELINE_ORDER[0],
    stageId: 'identified',
    originEvent,
    createdAt,
  });
  const opportunityId = withOpportunity.opportunities[0].id;

  return addTask(withOpportunity, {
    prospectId,
    opportunityId,
    label: 'Reprendre contact après l’événement',
    dueDate: addDays(createdAt, 2),
    createdAt,
  });
};
