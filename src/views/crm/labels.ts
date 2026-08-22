import type {
  FollowUpUrgency,
  InteractionChannel,
  LossReason,
  OpportunityStatus,
  ProspectStatus,
  ProspectTemperature,
  TaskStatus,
} from '@freepilot/finance-core';

export const temperatureLabels: Record<ProspectTemperature, string> = {
  hot: 'Chaud',
  warm: 'Tiède',
  cold: 'Froid',
};

export const statusLabels: Record<ProspectStatus, string> = {
  active: 'En cours',
  signed: 'Signé',
  lost: 'Perdu',
};

/** Canaux repris du suivi de prospection existant. */
export const channelLabels: Record<InteractionChannel, string> = {
  email: 'Mail',
  phone: 'Téléphone',
  linkedin: 'LinkedIn',
  whatsapp: 'WhatsApp',
  meeting: 'Rendez-vous',
  event: 'Événement',
  other: 'Autre',
};

export const urgencyLabels: Record<FollowUpUrgency, string> = {
  overdue: 'En retard',
  today: "Aujourd'hui",
  upcoming: 'À venir',
};

export const opportunityStatusLabels: Record<OpportunityStatus, string> = {
  open: 'En cours',
  won: 'Gagnée',
  lost: 'Perdue',
  abandoned: 'Abandonnée',
};

export const opportunityStatusOrder: OpportunityStatus[] = ['open', 'won', 'lost', 'abandoned'];

export const lossReasonLabels: Record<LossReason, string> = {
  price: 'Prix',
  noBudget: 'Pas de budget',
  timing: 'Mauvais timing',
  needUnconfirmed: 'Besoin non confirmé',
  competitor: 'Parti chez un concurrent',
  notDecisionMaker: "N'était pas décisionnaire",
  noAnswer: 'Sans réponse',
  outOfScope: 'Hors périmètre',
};

export const lossReasonOrder: LossReason[] = [
  'price',
  'noBudget',
  'timing',
  'needUnconfirmed',
  'competitor',
  'notDecisionMaker',
  'noAnswer',
  'outOfScope',
];

export const fundingLabels: Record<'direct' | 'opco' | 'mixed', string> = {
  direct: 'Financement direct',
  opco: 'OPCO',
  mixed: 'Mixte',
};

export const fundingOrder: ('direct' | 'opco' | 'mixed')[] = ['direct', 'opco', 'mixed'];

export const taskStatusLabels: Record<TaskStatus, string> = {
  open: 'À faire',
  done: 'Faite',
  cancelled: 'Annulée',
};

export const temperatureOrder: ProspectTemperature[] = ['hot', 'warm', 'cold'];

export const channelOrder: InteractionChannel[] = [
  'email',
  'phone',
  'linkedin',
  'whatsapp',
  'meeting',
  'event',
  'other',
];
