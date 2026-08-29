import type { Account, Transaction, TransactionKind } from '@freepilot/finance-core';
import { useState } from 'react';
import { EmptyState, Panel } from '../components/Panel';
import { formatCurrency, formatDate, parseAmount } from '../format';

/** Ce qui se saisit à la main ici : le reste vient des factures ou des virements. */
type EntryKind = 'expense' | 'otherIncome';

type Props = {
  accounts: Account[];
  transactions: Transaction[];
  onAddExpense: (input: { label: string; amount: number; accountId: string }) => void;
  onAddOtherIncome: (input: { label: string; amount: number; accountId: string }) => void;
  onUpdate: (
    transactionId: string,
    input: { label: string; amount: number; fromAccountId?: string; toAccountId?: string },
  ) => void;
  onDelete: (transaction: Transaction) => void;
};

const kindLabels: Record<TransactionKind, string> = {
  income: 'Encaissement de facture',
  otherIncome: 'Encaissement hors CA',
  expense: 'Dépense',
  transfer: 'Virement interne',
  provision: 'Provision',
};

/** Compte proposé tant que rien n'est choisi : le pro, cas le plus courant. */
const defaultAccountId = (accounts: Account[]): string =>
  (accounts.find((account) => account.kind === 'professional') ?? accounts[0])?.id ?? '';

/**
 * Le compte de rattachement se change ici pour ce qui a été saisi ici. Un
 * encaissement de facture appartient à la facture, et un prélèvement de charge
 * fixe serait réécrit au prochain report : leur compte se choisit dans l'onglet
 * d'origine, pas dans l'historique.
 */
const canPickAccount = (transaction: Transaction): boolean =>
  (transaction.kind === 'expense' || transaction.kind === 'otherIncome') &&
  !transaction.invoiceId &&
  !transaction.recurringChargeId;

/**
 * Sur quel compte l'opération est retombée. Affiché sur chaque ligne parce que
 * c'est invisible autrement : une dépense perso partie sur le compte pro ne se
 * repère qu'en comparant les soldes.
 */
const accountLabel = (accounts: Account[], transaction: Transaction): string | null => {
  const nameOf = (id: string | null): string | null =>
    accounts.find((account) => account.id === id)?.name ?? null;

  if (transaction.kind === 'transfer' && transaction.fromAccountId && transaction.toAccountId) {
    return `${nameOf(transaction.fromAccountId) ?? '?'} → ${nameOf(transaction.toAccountId) ?? '?'}`;
  }

  return nameOf(transaction.fromAccountId ?? transaction.toAccountId);
};

export function TransactionsView({
  accounts,
  onAddExpense,
  onAddOtherIncome,
  onDelete,
  onUpdate,
  transactions,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [entryKind, setEntryKind] = useState<EntryKind>('expense');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState('');

  const editingTransaction = editingId ? transactions.find((item) => item.id === editingId) ?? null : null;
  // En édition, la nature est celle de l'opération : on ne la redemande pas.
  const pickerKind: EntryKind = editingTransaction
    ? editingTransaction.kind === 'otherIncome'
      ? 'otherIncome'
      : 'expense'
    : entryKind;
  const showAccountPicker = editingTransaction ? canPickAccount(editingTransaction) : accounts.length > 0;
  const selectedAccountId = accountId || defaultAccountId(accounts);

  const reset = () => {
    setEditingId(null);
    setLabel('');
    setAmount('');
    setAccountId('');
  };

  const submit = () => {
    const parsedAmount = parseAmount(amount);
    if (!parsedAmount) return;

    if (editingId) {
      // `fromAccountId` pour une sortie, `toAccountId` pour une entrée : c'est
      // le sens du mouvement qui décide du champ, pas le compte choisi.
      const movedAccount =
        editingTransaction && canPickAccount(editingTransaction) && selectedAccountId
          ? editingTransaction.kind === 'expense'
            ? { fromAccountId: selectedAccountId }
            : { toAccountId: selectedAccountId }
          : {};

      onUpdate(editingId, { label, amount: parsedAmount, ...movedAccount });
    } else if (entryKind === 'otherIncome') {
      onAddOtherIncome({ label, amount: parsedAmount, accountId: selectedAccountId });
    } else {
      onAddExpense({ label, amount: parsedAmount, accountId: selectedAccountId });
    }

    reset();
  };

  const edit = (transaction: Transaction) => {
    setEditingId(transaction.id);
    setLabel(transaction.label);
    setAmount(String(transaction.amount));
    setAccountId(transaction.fromAccountId ?? transaction.toAccountId ?? '');
  };

  return (
    <section className="details-stack single">
      <Panel title={editingId ? 'Modifier l’opération' : 'Nouvelle opération'}>
        <div className="field-grid">
          {editingId ? null : (
            <div className="field">
              <label htmlFor="entry-kind">Nature</label>
              <select
                id="entry-kind"
                onChange={(event) => setEntryKind(event.target.value as EntryKind)}
                value={entryKind}
              >
                <option value="expense">Dépense ponctuelle</option>
                <option value="otherIncome">Encaissement hors CA</option>
              </select>
            </div>
          )}
          {showAccountPicker ? (
            <div className="field">
              <label htmlFor="entry-account">
                {pickerKind === 'otherIncome' ? 'Compte crédité' : 'Compte débité'}
              </label>
              <select id="entry-account" onChange={(event) => setAccountId(event.target.value)} value={selectedAccountId}>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
        <input onChange={(event) => setLabel(event.target.value)} placeholder="Libellé" value={label} />
        <input inputMode="decimal" onChange={(event) => setAmount(event.target.value)} placeholder="Montant" value={amount} />
        <div className="button-row">
          <button className="primary-button" onClick={submit} type="button">
            {editingId ? 'Enregistrer l’opération' : 'Ajouter l’opération'}
          </button>
          {editingId ? (
            <button className="secondary-button" onClick={reset} type="button">Annuler</button>
          ) : null}
        </div>
        <p className="muted-note">
          {entryKind === 'otherIncome' && !editingId
            ? 'Remboursement d’impôts, aide, remboursement de frais : de l’argent qui entre sans être du chiffre d’affaires. Il ne déclenche ni Urssaf, ni impôt, ni déduction d’ARE, mais compte dans le reste à vivre. Un paiement de client se saisit dans Factures.'
            : 'Les charges qui reviennent chaque mois se saisissent dans l’onglet Charges.'}
        </p>
      </Panel>

      <Panel collapsible title="Historique">
        {/* Les règles valent pour toute la liste : les répéter sous chaque ligne
            allongeait l'écran d'une page entière dès qu'il y avait des charges. */}
        <p className="muted-note">
          Un encaissement de facture se modifie depuis la facture. Un prélèvement de charge fixe se corrige
          ici mais ne se supprime pas — il serait recréé ; pour l’arrêter, suspends la charge. Le compte prélevé
          par une charge fixe se change dans l’onglet Charges.
        </p>
        {transactions.length === 0 ? (
          <EmptyState>Aucune opération enregistrée.</EmptyState>
        ) : (
          transactions.map((transaction) => {
            const account = accountLabel(accounts, transaction);

            return (
              <div className="charge-row" key={transaction.id}>
                <span className="charge-label">
                  <strong>{transaction.label}</strong>{' '}
                  <span>
                    {transaction.recurringChargeId ? 'Charge fixe' : kindLabels[transaction.kind]} ·{' '}
                    {formatDate(transaction.date)}
                    {account ? ` · ${account}` : ''}
                  </span>
                </span>
                <strong className="charge-amount">{formatCurrency(transaction.amount)}</strong>
                <span className="charge-actions">
                  {transaction.invoiceId ? null : (
                    <button
                      aria-label={`Modifier ${transaction.label}`}
                      className="mini-button"
                      onClick={() => edit(transaction)}
                      type="button"
                    >
                      Modif.
                    </button>
                  )}
                  {transaction.invoiceId || transaction.recurringChargeId ? null : (
                    <button
                      aria-label={`Supprimer ${transaction.label}`}
                      className="mini-button danger"
                      onClick={() => {
                        onDelete(transaction);
                        if (editingId === transaction.id) reset();
                      }}
                      type="button"
                    >
                      Suppr.
                    </button>
                  )}
                </span>
              </div>
            );
          })
        )}
      </Panel>
    </section>
  );
}
