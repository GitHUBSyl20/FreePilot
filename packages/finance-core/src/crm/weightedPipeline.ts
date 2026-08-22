import type { FinanceData, PipelineKind } from '../types';
import { roundCurrency, safeNumber } from '../calculations/common';
import { addMonths, monthRange } from '../monthly/month';
import { todayISO } from './day';

/**
 * Le pipeline partenariat n'a ni montant ni probabilité chiffrée (§4) : il
 * n'entre jamais dans le pondéré, quoi que contiendraient ses opportunités.
 */
export type WeightablePipelineKind = Exclude<PipelineKind, 'partenariat'>;

export type WeightedPipelineMonth = {
  month: string;
  total: number;
  byPipeline: Record<WeightablePipelineKind, number>;
};

/**
 * Pondéré par mois : `amount × probability`, réparti sur `expectedCloseDate`.
 *
 * Une opportunité ouverte sans `expectedCloseDate` n'est répartie sur aucun
 * mois — elle reste visible via `opportunitiesPastCloseDate`/l'alerte R7
 * plutôt que forcée quelque part où elle fausserait la lecture. Distingué du
 * CA encaissé : c'est un revenu *attendu*, jamais de la trésorerie acquise
 * (même discipline qu'AGENTS.md sur les factures payées).
 */
export const weightedPipelineByMonth = (
  data: FinanceData,
  fromMonth: string,
  monthsCount: number,
): WeightedPipelineMonth[] => {
  const months = monthRange(fromMonth, monthsCount);
  const indexByMonth = new Map(months.map((month, index) => [month, index]));
  const results: WeightedPipelineMonth[] = months.map((month) => ({
    month,
    total: 0,
    byPipeline: { formation: 0, projet: 0 },
  }));

  for (const opportunity of data.opportunities) {
    if (opportunity.status !== 'open') continue;
    if (opportunity.pipeline === 'partenariat') continue;
    if (!opportunity.expectedCloseDate) continue;

    const index = indexByMonth.get(opportunity.expectedCloseDate.slice(0, 7));
    if (index === undefined) continue;

    const weighted = opportunity.amount * (opportunity.probability / 100);
    results[index].total += weighted;
    results[index].byPipeline[opportunity.pipeline] += weighted;
  }

  return results.map((entry) => ({
    month: entry.month,
    total: roundCurrency(entry.total),
    byPipeline: { formation: roundCurrency(entry.byPipeline.formation), projet: roundCurrency(entry.byPipeline.projet) },
  }));
};

/** Pondéré d'un seul mois — pratique pour l'alimenter dans `financeProjection`. */
export const weightedPipelineForMonth = (data: FinanceData, month: string): number =>
  weightedPipelineByMonth(data, month, 1)[0]?.total ?? 0;

/**
 * MRR prévisionnel : opportunités récurrentes déjà gagnées, à partir de leur
 * date de gain. Toujours présenté séparément du CA encaissé — une affaire
 * gagnée n'a pas forcément été facturée, encore moins payée.
 */
export const mrrForecast = (data: FinanceData, asOfDate: string = todayISO()): number =>
  roundCurrency(
    data.opportunities
      .filter(
        (opportunity) =>
          opportunity.status === 'won' &&
          opportunity.recurring &&
          opportunity.monthlyAmount !== null &&
          opportunity.statusDate !== null &&
          opportunity.statusDate <= asOfDate,
      )
      .reduce((sum, opportunity) => sum + safeNumber(opportunity.monthlyAmount), 0),
  );

export type MonthCalibration = {
  month: string;
  /** Pondéré rétrospectif : voir la note d'approximation ci-dessous. */
  forecast: number;
  /** CA réellement signé sur le mois (affaires `won`, `statusDate` dans le mois). */
  actual: number;
};

/**
 * Calibrage du mois M-1 : le pondéré tel qu'on le verrait aujourd'hui pour
 * les opportunités dont `expectedCloseDate` tombait en M-1, comparé au CA
 * réellement signé sur M-1.
 *
 * Approximation assumée : FreePilot ne conserve pas un instantané des
 * probabilités telles qu'elles étaient quand l'opportunité était encore
 * ouverte en M-1 — seul l'état courant existe. Une affaire depuis gagnée
 * compte donc à 100 %, une affaire depuis perdue ou abandonnée à 0 %, et une
 * affaire toujours ouverte (échéance reportée ou oubliée) à sa probabilité
 * actuelle. Ce n'est pas une reconstruction historique exacte, seulement un
 * indicateur de tendance : les probabilités par stade sont-elles réalistes ?
 */
export const calibrateForecast = (data: FinanceData, month: string): MonthCalibration => {
  const forecast = roundCurrency(
    data.opportunities
      .filter((opportunity) => opportunity.pipeline !== 'partenariat' && opportunity.expectedCloseDate?.slice(0, 7) === month)
      .reduce((sum, opportunity) => {
        const probability =
          opportunity.status === 'won' ? 100 : opportunity.status === 'lost' || opportunity.status === 'abandoned' ? 0 : opportunity.probability;
        return sum + opportunity.amount * (probability / 100);
      }, 0),
  );

  const actual = roundCurrency(
    data.opportunities
      .filter((opportunity) => opportunity.status === 'won' && opportunity.statusDate?.slice(0, 7) === month)
      .reduce((sum, opportunity) => sum + opportunity.amount, 0),
  );

  return { month, forecast, actual };
};

/** Calibrage du mois précédant `month`, pour un affichage « au fait, on en était où le mois dernier ». */
export const calibrateForecastForPreviousMonth = (data: FinanceData, month: string): MonthCalibration =>
  calibrateForecast(data, addMonths(month, -1));
