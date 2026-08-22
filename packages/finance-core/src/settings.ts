import type { AppSettings, FinanceData } from './types';
import { PIPELINE_STAGES, stageProbabilityKey } from './crm/pipelines';

/** Nature d'un réglage, pour le présenter et le borner correctement. */
export type SettingKind = 'rate' | 'currency' | 'days';

export type SettingRule = {
  kind: SettingKind;
  min: number;
  max: number;
  integer?: boolean;
};

/**
 * Tous les réglages scalaires, sauf l'unique booléen et `stageProbabilities`.
 *
 * `stageProbabilities` est une map imbriquée (une probabilité par stade et
 * par pipeline) : elle ne rentre pas dans une règle min/max simple et suit sa
 * propre validation ci-dessous.
 */
export type NumericSettingKey = Exclude<keyof AppSettings, 'stageProbabilities' | 'versementLiberatoireEnabled'>;

/**
 * Bornes de saisie de chaque réglage.
 *
 * Ces valeurs pilotent des montants réels : une virgule mal placée sur
 * l'abattement fausse d'un coup l'ARE, l'impôt et le seuil de coupure. Les
 * bornes ne remplacent pas la relecture, elles écartent l'absurde.
 *
 * Le `Record` est exhaustif à dessein : ajouter un réglage sans lui donner de
 * règle casse la compilation, plutôt que de le laisser passer sans contrôle.
 */
export const settingRules: Record<NumericSettingKey, SettingRule> = {
  areDailyAmount: { kind: 'currency', min: 0, max: 500 },
  theoreticalMonthlyDays: { kind: 'days', min: 28, max: 31, integer: true },
  remainingAREDays: { kind: 'days', min: 0, max: 1825, integer: true },
  bncAbatementRate: { kind: 'rate', min: 0, max: 100 },
  franceTravailDeductionRate: { kind: 'rate', min: 0, max: 100 },
  urssafSocialContributionRate: { kind: 'rate', min: 0, max: 100 },
  professionalTrainingContributionRate: { kind: 'rate', min: 0, max: 100 },
  totalUrssafProvisionRate: { kind: 'rate', min: 0, max: 100 },
  prudentIncomeTaxProvisionRate: { kind: 'rate', min: 0, max: 100 },
  versementLiberatoireRateBNC: { kind: 'rate', min: 0, max: 100 },
  monthlyRevenueSafetyThreshold: { kind: 'currency', min: 0, max: 1000000 },
  monthlyRevenueTakeoffThreshold: { kind: 'currency', min: 0, max: 1000000 },
  hotProspectFollowUpDays: { kind: 'days', min: 1, max: 365, integer: true },
  warmProspectFollowUpDays: { kind: 'days', min: 1, max: 365, integer: true },
  coldProspectFollowUpDays: { kind: 'days', min: 1, max: 365, integer: true },
  dormantOpportunityDays: { kind: 'days', min: 1, max: 365, integer: true },
  dormantPartnershipDays: { kind: 'days', min: 1, max: 365, integer: true },
};

/** Clés valides de `stageProbabilities` : un stade connu de `pipelines.ts`. */
const knownStageProbabilityKeys = new Set(
  PIPELINE_STAGES.map((stage) => stageProbabilityKey(stage.pipeline, stage.id)),
);

/**
 * Une probabilité par stade et par pipeline, bornée à 0–100. Une clé inconnue
 * (stade renommé, faute de frappe venue d'un import) est ignorée plutôt que
 * stockée : elle ne correspondrait à aucun stade affiché nulle part.
 */
const sanitizeStageProbabilities = (
  current: Record<string, number>,
  patch: Record<string, number>,
): Record<string, number> => {
  const next = { ...current };

  for (const [key, value] of Object.entries(patch)) {
    if (!knownStageProbabilityKeys.has(key)) continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    next[key] = Math.min(100, Math.max(0, Math.round(value)));
  }

  return next;
};

const roundTo2 = (value: number): number => Math.round(value * 100) / 100;

const clamp = (value: number, rule: SettingRule): number => {
  const bounded = Math.min(rule.max, Math.max(rule.min, value));
  return rule.integer ? Math.round(bounded) : roundTo2(bounded);
};

/**
 * Applique une saisie aux réglages en cours.
 *
 * Une valeur absente ou illisible laisse le réglage en place : mieux vaut
 * l'ancienne valeur qu'un zéro venu d'un champ vidé, qui ferait basculer tous
 * les calculs sans prévenir.
 */
export const sanitizeSettings = (current: AppSettings, patch: Partial<AppSettings>): AppSettings => {
  const next: AppSettings = { ...current };
  // Tous les réglages listés dans `settingRules` sont numériques : l'accès
  // indexé passe par cette vue typée plutôt que par une clé d'union.
  const numeric = next as unknown as Record<NumericSettingKey, number>;

  for (const key of Object.keys(settingRules) as NumericSettingKey[]) {
    const candidate = patch[key];
    if (typeof candidate !== 'number' || !Number.isFinite(candidate)) continue;
    numeric[key] = clamp(candidate, settingRules[key]);
  }

  if (typeof patch.versementLiberatoireEnabled === 'boolean') {
    next.versementLiberatoireEnabled = patch.versementLiberatoireEnabled;
  }

  if (patch.stageProbabilities) {
    next.stageProbabilities = sanitizeStageProbabilities(current.stageProbabilities, patch.stageProbabilities);
  }

  // Le total Urssaf n'est pas un réglage indépendant : c'est lui seul qui sert
  // au calcul de la provision, ses deux composantes ne font que le détailler.
  // Les laisser diverger afficherait un détail ne correspondant à rien.
  next.totalUrssafProvisionRate = roundTo2(
    next.urssafSocialContributionRate + next.professionalTrainingContributionRate,
  );

  return next;
};

export const updateSettings = (data: FinanceData, patch: Partial<AppSettings>): FinanceData => ({
  ...data,
  settings: sanitizeSettings(data.settings, patch),
});
