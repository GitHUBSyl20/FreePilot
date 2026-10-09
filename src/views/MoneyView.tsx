import type { ComponentProps } from 'react';
import { AccountsView } from './AccountsView';
import { RecurringChargesView } from './RecurringChargesView';
import { TransactionsView } from './TransactionsView';

type Props = {
  accounts: ComponentProps<typeof AccountsView>;
  transactions: ComponentProps<typeof TransactionsView>;
  charges: ComponentProps<typeof RecurringChargesView>;
};

/**
 * Tout ce qui touche à l'argent qui bouge, sur un seul écran : soldes,
 * opérations ponctuelles, puis charges fixes. Simple empilement des vues
 * existantes, pour ne rien réécrire de leur logique de saisie.
 */
export function MoneyView({ accounts, charges, transactions }: Props) {
  return (
    <>
      <AccountsView {...accounts} />
      <TransactionsView {...transactions} />
      <RecurringChargesView {...charges} />
    </>
  );
}
