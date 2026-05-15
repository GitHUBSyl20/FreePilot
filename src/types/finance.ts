export type CalculationDetail = {
  value: number;
  formula: string;
  assumptions: string[];
  warnings: string[];
};

export type AppSettings = {
  areDailyAmount: number;
  theoreticalMonthlyDays: number;
  remainingAREDays: number;
  bncAbatementRate: number;
  franceTravailDeductionRate: number;
  urssafSocialContributionRate: number;
  professionalTrainingContributionRate: number;
  totalUrssafProvisionRate: number;
  prudentIncomeTaxProvisionRate: number;
  versementLiberatoireEnabled: boolean;
  versementLiberatoireRateBNC: number;
};

export type NetAvailableInput = {
  monthlyCollectedRevenue: number;
  estimatedARE: number;
  professionalExpenses: number;
  personalTransfersAlreadyMade: number;
};

export type InvoiceRecord = {
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  totalTTC: number;
  paymentDate: string | null;
};

export type MonthlySnapshotInput = {
  month: string;
  invoices: InvoiceRecord[];
  professionalExpenses: number;
  personalTransfersAlreadyMade: number;
};
