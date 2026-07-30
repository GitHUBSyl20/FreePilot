import type { Transaction, TransactionKind } from '@freepilot/finance-core';
import { useState } from 'react';
import { EmptyState, InfoRow, Panel } from '../components/Panel';
import { formatCurrency, formatDate, parseAmount } from '../format';

/** Ce qui se saisit à la main ici : le reste vient des factures ou des virements. */
type EntryKind = 'expense' | 'otherIncome';

type Props = {
  transactions: Transaction[];
  onAddExpense: (input: { label: string; amount: number }) => void;
  onAddOtherIncome: (input: { label: string; amount: number }) => void;
  onUpdate: (transactionId: string, input: { label: string; amount: number }) => void;
  onDelete: (transaction: Transaction) => void;
};

const kindLabels: Record<TransactionKind, string> = {
  income: 'Encaissement de facture',
  otherIncome: 'Encaissement hors CA',
  expense: 'Dépense',
  transfer: 'Virement interne',
  provision: 'Provision',
};

export function TransactionsView({ onAddExpense, onAddOtherIncome, onDelete, onUpdate, transactions }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [entryKind, setEntryKind] = useState<EntryKind>('expense');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');

  const reset = () => {
    setEditingId(null);
    setLabel('');
    setAmount('');
  };

  const submit = () => {
    const parsedAmount = parseAmount(amount);
    if (!parsedAmount) return;

    if (editingId) onUpdate(editingId, { label, amount: parsedAmount });
    else if (entryKind === 'otherIncome') onAddOtherIncome({ label, amount: parsedAmount });
    else onAddExpense({ label, amount: parsedAmount });

    reset();
  };

  const edit = (transaction: Transaction) => {
    setEditingId(transaction.id);
    setLabel(transaction.label);
    setAmount(String(transaction.amount));
  };

  return (
    <section className="details-stack single">
      <Panel title={editingId ? 'Modifier l’opération' : 'Nouvelle opération'}>
        {editingId ? null : (
          <>
            <label htmlFor="entry-kind">Nature</label>
            <select
              id="entry-kind"
              onChange={(event) => setEntryKind(event.target.value as EntryKind)}
              value={entryKind}
            >
              <option value="expense">Dépense ponctuelle</option>
              <option value="otherIncome">Encaissement hors CA</option>
            </select>
          </>
        )}
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

      <Panel title="Historique">
        {/* Les règles valent pour toute la liste : les répéter sous chaque ligne
            allongeait l'écran d'une page entière dès qu'il y avait des charges. */}
        <p className="muted-note">
          Un encaissement de facture se modifie depuis la facture. Un prélèvement de charge fixe se corrige
          ici mais ne se supprime pas — il serait recréé ; pour l’arrêter, suspends la charge.
        </p>
        {transactions.length === 0 ? (
          <EmptyState>Aucune opération enregistrée.</EmptyState>
        ) : (
          transactions.map((transaction) => (
            <div className="charge-row" key={transaction.id}>
              <span className="charge-label">
                <strong>{transaction.label}</strong>{' '}
                <span>
                  {transaction.recurringChargeId ? 'Charge fixe' : kindLabels[transaction.kind]} ·{' '}
                  {formatDate(transaction.date)}
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
          ))
        )}
      </Panel>
    </section>
  );
}
