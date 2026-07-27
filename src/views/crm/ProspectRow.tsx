import type { ProspectFollowUp } from '@freepilot/finance-core';
import type { ReactNode } from 'react';
import { formatDate, formatDayGap } from '../../format';
import { temperatureLabels, urgencyLabels } from './labels';

export function Badge({ children, tone }: { children: ReactNode; tone: string }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

/** Échéance de relance en une phrase, avec l'origine de la date. */
const dueSummary = (followUp: ProspectFollowUp): string => {
  if (!followUp.dueDate || followUp.daysUntilDue === null) return 'Aucune relance prévue';

  const origin = followUp.inferred ? 'délai automatique' : 'relance planifiée';
  return `${formatDate(followUp.dueDate)} · ${formatDayGap(followUp.daysUntilDue)} · ${origin}`;
};

const contactSummary = (followUp: ProspectFollowUp): string => {
  if (followUp.daysSinceLastContact === null) return 'Jamais contacté';
  return `Dernier contact ${formatDayGap(-followUp.daysSinceLastContact)}`;
};

export function ProspectRow({ followUp, onOpen }: { followUp: ProspectFollowUp; onOpen: () => void }) {
  const { prospect } = followUp;

  return (
    <button aria-label={`Ouvrir la fiche de ${prospect.name}`} className="row-button" onClick={onOpen} type="button">
      <span className="row-title">
        <strong>{prospect.name}</strong>
        <span className="badge-row">
          <Badge tone={prospect.temperature}>{temperatureLabels[prospect.temperature]}</Badge>
          {followUp.urgency ? <Badge tone={followUp.urgency}>{urgencyLabels[followUp.urgency]}</Badge> : null}
        </span>
      </span>
      {prospect.company ? <span className="row-detail">{prospect.company}</span> : null}
      <span className="row-detail">{dueSummary(followUp)}</span>
      <span className="row-detail">{contactSummary(followUp)}</span>
    </button>
  );
}
