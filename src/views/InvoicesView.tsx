import type { EditableInvoice, Prospect } from '@freepilot/finance-core';
import { useState } from 'react';
import { EmptyState, InfoRow, Panel } from '../components/Panel';
import { formatCurrency, formatDate, parseAmount } from '../format';

type InvoiceInput = { clientName: string; totalTTC: number; prospectId: string | null };

type Props = {
  invoices: EditableInvoice[];
  prospects: Prospect[];
  canMarkPaid: boolean;
  onCreate: (input: InvoiceInput) => void;
  onUpdate: (invoiceId: string, input: InvoiceInput) => void;
  onDelete: (invoice: EditableInvoice) => void;
  onMarkPaid: (invoice: EditableInvoice) => void;
  onMarkSent: (invoice: EditableInvoice) => void;
};

/**
 * État de la facture en clair. Un brouillon sert aux échéances connues d'un
 * contrat : elles ne comptent ni dans le CA ni dans les factures à encaisser
 * tant que la facture n'est pas réellement émise.
 */
export const statusSummary = (invoice: EditableInvoice): string => {
  if (invoice.status === 'paid' && invoice.paymentDate) return `Payée le ${formatDate(invoice.paymentDate)}`;
  if (invoice.status === 'draft') return `Brouillon · à facturer le ${formatDate(invoice.issueDate)}`;
  if (invoice.status === 'overdue') return `En retard · émise le ${formatDate(invoice.issueDate)}`;
  if (invoice.status === 'cancelled') return 'Annulée';
  return `Émise le ${formatDate(invoice.issueDate)}`;
};

export function InvoicesView({
  canMarkPaid,
  invoices,
  onCreate,
  onDelete,
  onMarkPaid,
  onMarkSent,
  onUpdate,
  prospects,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [clientName, setClientName] = useState('');
  const [amount, setAmount] = useState('');
  const [prospectId, setProspectId] = useState('');

  const prospectName = (id: string | null | undefined): string | null =>
    prospects.find((prospect) => prospect.id === id)?.name ?? null;

  const reset = () => {
    setEditingId(null);
    setClientName('');
    setAmount('');
    setProspectId('');
  };

  const submit = () => {
    const parsedAmount = parseAmount(amount);
    if (!parsedAmount) return;

    const input: InvoiceInput = { clientName, totalTTC: parsedAmount, prospectId: prospectId || null };
    if (editingId) onUpdate(editingId, input);
    else onCreate(input);

    reset();
  };

  const edit = (invoice: EditableInvoice) => {
    setEditingId(invoice.id);
    setClientName(invoice.clientName);
    setAmount(String(invoice.totalTTC));
    setProspectId(invoice.prospectId ?? '');
  };

  // Rattacher un prospect renseigne le nom du client tant qu'il est vide.
  const selectProspect = (id: string) => {
    setProspectId(id);
    if (!clientName.trim()) setClientName(prospectName(id) ?? '');
  };

  return (
    <section className="details-stack single">
      <Panel title={editingId ? 'Modifier la facture' : 'Nouvelle facture'}>
        <input onChange={(event) => setClientName(event.target.value)} placeholder="Client" value={clientName} />
        <input inputMode="decimal" onChange={(event) => setAmount(event.target.value)} placeholder="Montant TTC" value={amount} />
        {prospects.length > 0 ? (
          <>
            <label htmlFor="invoice-prospect">Prospect du CRM (optionnel)</label>
            <select id="invoice-prospect" onChange={(event) => selectProspect(event.target.value)} value={prospectId}>
              <option value="">Aucun</option>
              {prospects.map((prospect) => (
                <option key={prospect.id} value={prospect.id}>
                  {prospect.company ? `${prospect.name} — ${prospect.company}` : prospect.name}
                </option>
              ))}
            </select>
          </>
        ) : null}
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
                helper={[statusSummary(invoice), prospectName(invoice.prospectId)].filter(Boolean).join(' · ')}
                label={invoice.clientName}
                value={formatCurrency(invoice.totalTTC)}
              />
              <div className="button-row">
                {invoice.status === 'draft' ? (
                  <button className="secondary-button" onClick={() => onMarkSent(invoice)} type="button">
                    Marquer émise
                  </button>
                ) : null}
                {invoice.status !== 'paid' && canMarkPaid ? (
                  <button className="secondary-button" onClick={() => onMarkPaid(invoice)} type="button">
                    Marquer payée
                  </button>
                ) : null}
              </div>
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
