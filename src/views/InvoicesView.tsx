import type { EditableInvoice, Prospect } from '@freepilot/finance-core';
import { useState } from 'react';
import { EmptyState, InfoRow, Panel } from '../components/Panel';
import { formatCurrency, formatDate, parseAmount, today } from '../format';

type InvoiceInput = {
  clientName: string;
  totalTTC: number;
  prospectId: string | null;
  issueDate?: string;
  paymentDate?: string;
};

type Props = {
  invoices: EditableInvoice[];
  prospects: Prospect[];
  canMarkPaid: boolean;
  onCreate: (input: InvoiceInput) => void;
  onUpdate: (invoiceId: string, input: InvoiceInput) => void;
  onDelete: (invoice: EditableInvoice) => void;
  onMarkPaid: (invoice: EditableInvoice, paymentDate: string) => void;
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
  const [issueDate, setIssueDate] = useState(today());
  const [paymentDate, setPaymentDate] = useState('');
  // Facture en cours de marquage « payée » : on demande la date réelle
  // d'encaissement au lieu de forcer la date du jour, sinon impossible de
  // rattacher un paiement tardif au bon mois (déduction ARE, CA du mois...).
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);
  const [markingPaidDate, setMarkingPaidDate] = useState(today());

  const prospectName = (id: string | null | undefined): string | null =>
    prospects.find((prospect) => prospect.id === id)?.name ?? null;

  const reset = () => {
    setEditingId(null);
    setClientName('');
    setAmount('');
    setProspectId('');
    setIssueDate(today());
    setPaymentDate('');
  };

  const submit = () => {
    const parsedAmount = parseAmount(amount);
    if (!parsedAmount) return;

    const input: InvoiceInput = { clientName, totalTTC: parsedAmount, prospectId: prospectId || null, issueDate };
    if (editingId) onUpdate(editingId, paymentDate ? { ...input, paymentDate } : input);
    else onCreate(input);

    reset();
  };

  const edit = (invoice: EditableInvoice) => {
    setEditingId(invoice.id);
    setClientName(invoice.clientName);
    setAmount(String(invoice.totalTTC));
    setProspectId(invoice.prospectId ?? '');
    setIssueDate(invoice.issueDate);
    setPaymentDate(invoice.status === 'paid' ? invoice.paymentDate ?? '' : '');
  };

  const startMarkPaid = (invoice: EditableInvoice) => {
    setMarkingPaidId(invoice.id);
    setMarkingPaidDate(today());
  };

  const confirmMarkPaid = (invoice: EditableInvoice) => {
    onMarkPaid(invoice, markingPaidDate);
    setMarkingPaidId(null);
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
        <label htmlFor="invoice-issue-date">Date de facturation</label>
        <input
          id="invoice-issue-date"
          onChange={(event) => setIssueDate(event.target.value)}
          type="date"
          value={issueDate}
        />
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
        {editingId && paymentDate !== '' ? (
          <>
            <label htmlFor="invoice-payment-date">Date d’encaissement</label>
            <input
              id="invoice-payment-date"
              onChange={(event) => setPaymentDate(event.target.value)}
              type="date"
              value={paymentDate}
            />
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

      <Panel collapsible title="Factures">
        {invoices.length === 0 ? (
          <EmptyState>Aucune facture enregistrée.</EmptyState>
        ) : (
          invoices.map((invoice) => (
            <div className="charge-row" key={invoice.id}>
              <span className="charge-label">
                <strong>{invoice.clientName}</strong>{' '}
                <span>{[statusSummary(invoice), prospectName(invoice.prospectId)].filter(Boolean).join(' · ')}</span>
              </span>
              <strong className="charge-amount">{formatCurrency(invoice.totalTTC)}</strong>
              {/* Libellés courts pour tenir sur la ligne ; le sens complet est dans l'aria-label. */}
              <span className="charge-actions">
                {invoice.status === 'draft' ? (
                  <button
                    aria-label={`Marquer émise la facture ${invoice.clientName}`}
                    className="mini-button"
                    onClick={() => onMarkSent(invoice)}
                    type="button"
                  >
                    Émise
                  </button>
                ) : null}
                {invoice.status !== 'paid' && canMarkPaid && markingPaidId !== invoice.id ? (
                  <button
                    aria-label={`Marquer payée la facture ${invoice.clientName}`}
                    className="mini-button"
                    onClick={() => startMarkPaid(invoice)}
                    type="button"
                  >
                    Payée
                  </button>
                ) : null}
                {markingPaidId === invoice.id ? (
                  <>
                    <input
                      aria-label={`Date d’encaissement de ${invoice.clientName}`}
                      onChange={(event) => setMarkingPaidDate(event.target.value)}
                      type="date"
                      value={markingPaidDate}
                    />
                    <button
                      aria-label={`Confirmer le paiement de ${invoice.clientName}`}
                      className="mini-button"
                      onClick={() => confirmMarkPaid(invoice)}
                      type="button"
                    >
                      Confirmer
                    </button>
                    <button
                      aria-label={`Annuler le paiement de ${invoice.clientName}`}
                      className="mini-button"
                      onClick={() => setMarkingPaidId(null)}
                      type="button"
                    >
                      Annuler
                    </button>
                  </>
                ) : null}
                <button
                  aria-label={`Modifier la facture ${invoice.clientName}`}
                  className="mini-button"
                  onClick={() => edit(invoice)}
                  type="button"
                >
                  Modif.
                </button>
                <button
                  aria-label={`Supprimer la facture ${invoice.clientName}`}
                  className="mini-button danger"
                  onClick={() => {
                    onDelete(invoice);
                    if (editingId === invoice.id) reset();
                  }}
                  type="button"
                >
                  Suppr.
                </button>
              </span>
            </div>
          ))
        )}
      </Panel>
    </section>
  );
}
