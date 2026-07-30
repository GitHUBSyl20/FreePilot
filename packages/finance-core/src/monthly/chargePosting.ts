import type { FinanceData, RecurringCharge, Transaction } from '../types';
import { addMonths, compareMonths, isValidMonth } from './month';

/** Dernier jour du mois : un prélèvement le 31 n'existe pas en février. */
const lastDayOfMonth = (month: string): number => {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
};

/**
 * Date de prélèvement d'une charge sur un mois donné.
 *
 * Une charge dont le jour n'est pas renseigné est posée au 1er : c'est le mois
 * de sortie qui compte pour la trésorerie, le jour ne joue que sur l'ordre
 * d'affichage.
 */
export const chargePostingDate = (charge: RecurringCharge, month: string): string => {
  const day = Math.min(Math.max(charge.dayOfMonth ?? 1, 1), lastDayOfMonth(month));

  return `${month}-${String(day).padStart(2, '0')}`;
};

/**
 * Identifiant reproductible plutôt qu'aléatoire : la même charge sur le même
 * mois retombe sur la même opération, ce qui rend la génération rejouable sans
 * risque de doublon même si le repère de départ est perdu.
 */
export const chargeTransactionId = (chargeId: string, month: string): string => `charge-${chargeId}-${month}`;

/**
 * Compte à débiter : celui que la charge désigne, sinon celui que suggère son
 * rattachement. Un compte désigné mais disparu retombe sur le rattachement
 * plutôt que de produire une opération orpheline.
 */
export const chargeDebitAccountId = (data: FinanceData, charge: RecurringCharge): string | null => {
  if (charge.paymentAccountId && data.accounts.some((account) => account.id === charge.paymentAccountId)) {
    return charge.paymentAccountId;
  }

  const kind = charge.scope === 'professional' ? 'professional' : 'personal';

  return (data.accounts.find((account) => account.kind === kind) ?? data.accounts[0])?.id ?? null;
};

const monthsFrom = (from: string, to: string): string[] => {
  if (compareMonths(from, to) > 0) return [];

  const months: string[] = [];
  for (let cursor = from; compareMonths(cursor, to) <= 0; cursor = addMonths(cursor, 1)) months.push(cursor);

  return months;
};

/**
 * Crée les opérations manquantes pour les charges fixes actives, de leur mois
 * de départ jusqu'au mois courant.
 *
 * Sans cela, les charges ne pesaient que sur le reste à vivre et jamais sur
 * les soldes de comptes, qui dérivaient donc du montant des charges chaque
 * mois. La génération ne remonte jamais avant `recurringChargeAutoPostFrom` :
 * le passé est déjà absorbé par les soldes d'ouverture, le recréer compterait
 * la même sortie deux fois.
 *
 * L'opération est sans effet quand tout est déjà posé, et renvoie alors les
 * données inchangées — la comparaison de référence suffit à l'appelant pour
 * savoir s'il doit enregistrer.
 */
export const postDueRecurringCharges = (data: FinanceData, currentMonth: string): FinanceData => {
  if (!isValidMonth(currentMonth)) return data;

  const from =
    data.recurringChargeAutoPostFrom && isValidMonth(data.recurringChargeAutoPostFrom)
      ? data.recurringChargeAutoPostFrom
      : currentMonth;

  const alreadyPosted = new Set(
    data.transactions
      .filter((transaction) => transaction.recurringChargeId)
      .map((transaction) => `${transaction.recurringChargeId}|${transaction.date.slice(0, 7)}`),
  );

  const created: Transaction[] = [];

  for (const month of monthsFrom(from, currentMonth)) {
    for (const charge of data.recurringCharges) {
      if (!charge.active) continue;
      if (alreadyPosted.has(`${charge.id}|${month}`)) continue;

      created.push({
        id: chargeTransactionId(charge.id, month),
        kind: 'expense',
        label: charge.label,
        amount: charge.amount,
        date: chargePostingDate(charge, month),
        fromAccountId: chargeDebitAccountId(data, charge),
        toAccountId: null,
        recurringChargeId: charge.id,
      });
    }
  }

  if (created.length === 0 && from === data.recurringChargeAutoPostFrom) return data;

  return {
    ...data,
    transactions: [...created, ...data.transactions],
    recurringChargeAutoPostFrom: from,
  };
};
