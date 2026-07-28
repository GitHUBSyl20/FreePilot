import type { EditableInvoice } from '@freepilot/finance-core';
import { describe, expect, it } from 'vitest';
import { statusSummary } from '../src/views/InvoicesView';

const invoice = (overrides: Partial<EditableInvoice>): EditableInvoice => ({
  id: 'inv',
  clientName: 'Client',
  status: 'sent',
  totalTTC: 400,
  issueDate: '2026-09-01',
  dueDate: null,
  paymentDate: null,
  paymentAccountId: null,
  ...overrides,
});

describe('état d’une facture', () => {
  it('distingue le brouillon de la facture émise', () => {
    expect(statusSummary(invoice({ status: 'draft' }))).toBe('Brouillon · à facturer le 1 septembre 2026');
    expect(statusSummary(invoice({}))).toBe('Émise le 1 septembre 2026');
  });

  it('affiche la date de paiement quand elle existe', () => {
    expect(statusSummary(invoice({ status: 'paid', paymentDate: '2026-07-15' }))).toBe('Payée le 15 juillet 2026');
    // Une facture marquée payée sans date retombe sur la date d'émission.
    expect(statusSummary(invoice({ status: 'paid' }))).toBe('Émise le 1 septembre 2026');
  });

  it('signale le retard et l’annulation', () => {
    expect(statusSummary(invoice({ status: 'overdue' }))).toBe('En retard · émise le 1 septembre 2026');
    expect(statusSummary(invoice({ status: 'cancelled' }))).toBe('Annulée');
  });
});
