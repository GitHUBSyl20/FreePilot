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
        {transactions.length === 0 ? (
          <EmptyState>Aucune opération enregistrée.</EmptyState>
        ) : (
          transactions.map((transaction) => (
            <div className="record-card" key={transaction.id}>
              <InfoRow
                helper={`${transaction.recurringChargeId ? 'Charge fixe' : kindLabels[transaction.kind]} · ${formatDate(transaction.date)}`}
                label={transaction.label}
                value={formatCurrency(transaction.amount)}
              />
              {transaction.invoiceId ? (
                <p className="muted-note">Encaissement lié à une facture, à modifier depuis la facture.</p>
              ) : (
                <>
                  <div className="button-row">
                    <button className="secondary-button" onClick={() => edit(transaction)} type="button">Modifier</button>
                    {/* Une échéance de charge n'est pas supprimable : elle serait
                        aussitôt recréée par la génération automatique. */}
                    {transaction.recurringChargeId ? null : (
                      <button
                        className="danger-button"
                        onClick={() => {
                          onDelete(transaction);
                          if (editingId === transaction.id) reset();
                        }}
                        type="button"
                      >
                        Supprimer
                      </button>
                    )}
                  </div>
                  {transaction.recurringChargeId ? (
                    <p className="muted-note">
                      Prélèvement engendré par une charge fixe. Le montant se corrige ici si le débit du mois a
                      été différent. Pour arrêter les suivants, suspends la charge dans l’onglet Charges.
                    </p>
                  ) : null}
                </>
              )}
            </div>
          ))
        )}
      </Panel>
    </section>
  );
}
