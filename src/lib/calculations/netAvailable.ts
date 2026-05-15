import { AppSettings, CalculationDetail, NetAvailableInput } from '../../types/finance';
import { roundCurrency } from './common';
import { calculateIncomeTaxProvision } from './tax';
import { calculateUrssafProvision } from './urssaf';

export const calculateNetAvailable = (input: NetAvailableInput, settings: AppSettings): CalculationDetail => {
  const urssaf = calculateUrssafProvision(input.monthlyCollectedRevenue, settings).value;
  const tax = calculateIncomeTaxProvision(input.monthlyCollectedRevenue, settings).value;
  const value = roundCurrency(
    input.monthlyCollectedRevenue + input.estimatedARE - urssaf - tax - input.professionalExpenses - input.personalTransfersAlreadyMade,
  );

  return {
    value,
    formula: `${input.monthlyCollectedRevenue} + ${input.estimatedARE} - ${urssaf} - ${tax} - ${input.professionalExpenses} - ${input.personalTransfersAlreadyMade}`,
    assumptions: ['CA encaissé', 'ARE estimée', 'Provision Urssaf', 'Provision impôt', 'Dépenses pro', 'Virements perso'],
    warnings: [],
  };
};
