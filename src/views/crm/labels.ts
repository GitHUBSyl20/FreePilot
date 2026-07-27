import type { FollowUpUrgency, InteractionChannel, ProspectStatus, ProspectTemperature } from '@freepilot/finance-core';

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
