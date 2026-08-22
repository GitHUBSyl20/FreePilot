import type { PipelineKind } from '../types';

/**
 * Les stades sont des données, pas du code de vue : un tableau exporté,
 * consommé tel quel par les composants et par les réglages.
 *
 * Chaque stade porte un critère de sortie objectif et vérifiable — jamais un
 * ressenti — sauf sur le pipeline partenariat, qui n'a pas de probabilité
 * chiffrée et n'entre jamais dans le prévisionnel pondéré.
 */
export type PipelineStage = {
  id: string;
  pipeline: PipelineKind;
  label: string;
  /** Position dans le pipeline, pour l'ordre des colonnes. */
  order: number;
  /** Probabilité par défaut : amorce `AppSettings.stageProbabilities`. */
  defaultProbability: number;
  exitCriteria: string;
};

export const PIPELINE_LABELS: Record<PipelineKind, string> = {
  formation: 'Formation',
  projet: 'Projet',
  partenariat: 'Partenariat',
};

export const PIPELINE_ORDER: PipelineKind[] = ['formation', 'projet', 'partenariat'];

export const PIPELINE_STAGES: PipelineStage[] = [
  // FORMATION
  {
    id: 'identified',
    pipeline: 'formation',
    label: 'Identifié',
    order: 0,
    defaultProbability: 10,
    exitCriteria: 'Contact obtenu, sujet pas encore abordé',
  },
  {
    id: 'contacted',
    pipeline: 'formation',
    label: 'Contact établi',
    order: 1,
    defaultProbability: 20,
    exitCriteria: 'Échange réel, intérêt exprimé',
  },
  {
    id: 'qualified',
    pipeline: 'formation',
    label: 'Besoin qualifié',
    order: 2,
    defaultProbability: 40,
    exitCriteria: 'Public, format, volume horaire et budget approximatif connus',
  },
  {
    id: 'proposal',
    pipeline: 'formation',
    label: 'Proposition envoyée',
    order: 3,
    defaultProbability: 60,
    exitCriteria: 'Devis transmis',
  },
  {
    id: 'negotiation',
    pipeline: 'formation',
    label: 'Négociation / administratif',
    order: 4,
    defaultProbability: 80,
    exitCriteria: 'Accord de principe, reste convention, dates ou OPCO',
  },
  // PROJET
  {
    id: 'identified',
    pipeline: 'projet',
    label: 'Identifié',
    order: 0,
    defaultProbability: 10,
    exitCriteria: 'Besoin pressenti',
  },
  {
    id: 'discovery',
    pipeline: 'projet',
    label: 'Découverte',
    order: 1,
    defaultProbability: 20,
    exitCriteria: 'Rendez-vous de découverte réalisé',
  },
  {
    id: 'scoping',
    pipeline: 'projet',
    label: 'Cadrage / audit',
    order: 2,
    defaultProbability: 35,
    exitCriteria: 'Périmètre technique et gains chiffrés validés',
  },
  {
    id: 'proposal',
    pipeline: 'projet',
    label: 'Proposition envoyée',
    order: 3,
    defaultProbability: 55,
    exitCriteria: 'Devis transmis',
  },
  {
    id: 'negotiation',
    pipeline: 'projet',
    label: 'Négociation',
    order: 4,
    defaultProbability: 75,
    exitCriteria: 'Discussion sur prix, planning ou périmètre',
  },
  // PARTENARIAT — pas de probabilité chiffrée, jamais dans le pondéré.
  {
    id: 'identified',
    pipeline: 'partenariat',
    label: 'Identifié',
    order: 0,
    defaultProbability: 0,
    exitCriteria: 'Prescripteur potentiel repéré',
  },
  {
    id: 'firstTalk',
    pipeline: 'partenariat',
    label: 'Premier échange',
    order: 1,
    defaultProbability: 0,
    exitCriteria: 'Échange réel sur une collaboration possible',
  },
  {
    id: 'framing',
    pipeline: 'partenariat',
    label: 'Cadrage de l’accord',
    order: 2,
    defaultProbability: 0,
    exitCriteria: 'Modalités de la collaboration discutées',
  },
  {
    id: 'active',
    pipeline: 'partenariat',
    label: 'Accord actif',
    order: 3,
    defaultProbability: 0,
    exitCriteria: 'Au moins une affaire référée',
  },
  {
    id: 'dormant',
    pipeline: 'partenariat',
    label: 'Dormant',
    order: 4,
    defaultProbability: 0,
    exitCriteria: 'Aucun contact depuis le délai de dormance partenariat',
  },
];

export const stagesForPipeline = (pipeline: PipelineKind): PipelineStage[] =>
  PIPELINE_STAGES.filter((stage) => stage.pipeline === pipeline).sort((left, right) => left.order - right.order);

export const findStage = (pipeline: PipelineKind, stageId: string): PipelineStage | null =>
  PIPELINE_STAGES.find((stage) => stage.pipeline === pipeline && stage.id === stageId) ?? null;

export const isLastStage = (pipeline: PipelineKind, stageId: string): boolean => {
  const stages = stagesForPipeline(pipeline);
  return stages.length > 0 && stages[stages.length - 1].id === stageId;
};

/**
 * Clé de `AppSettings.stageProbabilities`.
 *
 * Un même identifiant de stade (« proposal », « negotiation »…) porte des
 * probabilités différentes selon le pipeline : la clé doit donc composer les
 * deux plutôt que de se fier au seul `stageId`.
 */
export const stageProbabilityKey = (pipeline: PipelineKind, stageId: string): string => `${pipeline}:${stageId}`;

/** Probabilités par défaut, une entrée par stade connu — y compris partenariat, à 0. */
export const defaultStageProbabilities = (): Record<string, number> =>
  Object.fromEntries(
    PIPELINE_STAGES.map((stage) => [stageProbabilityKey(stage.pipeline, stage.id), stage.defaultProbability]),
  );

/** Probabilité effective d'un stade : celle des réglages, sinon celle par défaut du stade. */
export const stageProbability = (
  pipeline: PipelineKind,
  stageId: string,
  stageProbabilities: Record<string, number>,
): number => {
  const key = stageProbabilityKey(pipeline, stageId);
  if (typeof stageProbabilities[key] === 'number') return stageProbabilities[key];
  return findStage(pipeline, stageId)?.defaultProbability ?? 0;
};
