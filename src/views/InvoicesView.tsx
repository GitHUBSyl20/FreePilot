import type { EditableInvoice } from '@freepilot/finance-core';
import { useState } from 'react';
import { EmptyState, InfoRow, Panel } from '../components/Panel';
import { formatCurrency, parseAmount } from '../format';

type Props = {
  invoices: EditableInvoice[];
  canMarkPaid: boolean;
  onCreate: (input: { clientName: string; totalTTC: number }) => void;
  onUpdate: (invoiceId: string, input: { clientName: string; totalTTC: number }) => void;
  onDelete: (invoice: EditableInvoice) => void;
  onMarkPaid: (invoice: EditableInvoice) => void;
};

export function InvoicesView({ canMarkPaid, invoices, onCreate, onDelete, onMarkPaid, onUpdate }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [clientName, setClientName] = useState('');
  const [amount, setAmount] = useState('');

  const reset = () => {
    setEditingId(null);
    setClientName('');
    setAmount('');
  };

  const submit = () => {
    const parsedAmount = parseAmount(amount);
    if (!parsedAmount) return;

    if (editingId) onUpdate(editingId, { clientName, totalTTC: parsedAmount });
    else onCreate({ clientName, totalTTC: parsedAmount });

    reset();
  };

  const edit = (invoice: EditableInvoice) => {
    setEditingId(invoice.id);
    setClientName(invoice.clientName);
    setAmount(String(invoice.totalTTC));
  };

  return (
    <section className="details-stack single">
      <Panel title={editingId ? 'Modifier la facture' : 'Nouvelle facture'}>
        <input onChange={(event) => setClientName(event.target.value)} placeholder="Client" value={clientName} />
        <input inputMode="decimal" onChange={(event) => setAmount(event.target.value)} placeholder="Montant TTC" value={amount} />
        <div className="button-row">
          <button className="primary-button" onClick={submit} type="button">
            {editingId ? 'Enregistrer la facture' : 'Ajouter la facture'}
          </button>
          {editingId ? (
            <button className="secondary-button" onClick={reset} type="button">Annuler</button>
          ) : null}
        </div>
      </Panel>

      <Panel title="Factures">
        {invoices.length === 0 ? (
          <EmptyState>Aucune facture enregistrée.</EmptyState>
        ) : (
          invoices.map((invoice) => (
            <div className="record-card" key={invoice.id}>
              <InfoRow
                helper={invoice.status === 'paid' ? `Payée le ${invoice.paymentDate}` : `Émise le ${invoice.issueDate}`}
                label={invoice.clientName}
                value={formatCurrency(invoice.totalTTC)}
              />
              {invoice.status !== 'paid' && canMarkPaid ? (
                <button className="secondary-button" onClick={() => onMarkPaid(invoice)} type="button">
                  Marquer payée
                </button>
              ) : null}
              <div className="button-row">
                <button className="secondary-button" onClick={() => edit(invoice)} type="button">Modifier</button>
                <button
                  className="danger-button"
                  onClick={() => {
                    onDelete(invoice);
                    if (editingId === invoice.id) reset();
                  }}
                  type="button"
                >
                  Supprimer
                </button>
              </div>
            </div>
          ))
        )}
      </Panel>
    </section>
  );
}
