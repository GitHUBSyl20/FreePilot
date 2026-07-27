import type { Transaction } from '@freepilot/finance-core';
import { useState } from 'react';
import { EmptyState, InfoRow, Panel } from '../components/Panel';
import { formatCurrency, parseAmount } from '../format';

type Props = {
  transactions: Transaction[];
  onAddExpense: (input: { label: string; amount: number }) => void;
  onUpdate: (transactionId: string, input: { label: string; amount: number }) => void;
  onDelete: (transaction: Transaction) => void;
};

export function TransactionsView({ onAddExpense, onDelete, onUpdate, transactions }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
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
      <Panel title={editingId ? 'Modifier l’opération' : 'Nouvelle dépense ponctuelle'}>
        <input onChange={(event) => setLabel(event.target.value)} placeholder="Libellé" value={label} />
        <input inputMode="decimal" onChange={(event) => setAmount(event.target.value)} placeholder="Montant" value={amount} />
        <div className="button-row">
          <button className="primary-button" onClick={submit} type="button">
            {editingId ? 'Enregistrer l’opération' : 'Ajouter la dépense'}
          </button>
          {editingId ? (
            <button className="secondary-button" onClick={reset} type="button">Annuler</button>
          ) : null}
        </div>
        <p className="muted-note">Les charges qui reviennent chaque mois se saisissent dans l’onglet Charges.</p>
      </Panel>

      <Panel title="Historique">
        {transactions.length === 0 ? (
          <EmptyState>Aucune opération enregistrée.</EmptyState>
        ) : (
          transactions.map((transaction) => (
            <div className="record-card" key={transaction.id}>
              <InfoRow
                helper={`${transaction.kind} · ${transaction.date}`}
                label={transaction.label}
                value={formatCurrency(transaction.amount)}
              />
              {transaction.invoiceId ? (
                <p className="muted-note">Encaissement lié à une facture, à modifier depuis la facture.</p>
              ) : (
                <div className="button-row">
                  <button className="secondary-button" onClick={() => edit(transaction)} type="button">Modifier</button>
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
                </div>
              )}
            </div>
          ))
        )}
      </Panel>
    </section>
  );
}
