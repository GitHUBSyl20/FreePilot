import { addInvoice, createInitialFinanceData, sortInvoicesByDateDesc } from '@freepilot/finance-core';
import { describe, expect, it } from 'vitest';

describe('ordre des factures', () => {
  it('met la plus récente en haut, par date de facturation', () => {
    const sorted = sortInvoicesByDateDesc([
      { id: 'a', issueDate: '2026-08-15' },
      { id: 'b', issueDate: '2026-10-02' },
      { id: 'c', issueDate: '2026-09-20' },
    ]);

    expect(sorted.map((invoice) => invoice.id)).toEqual(['b', 'c', 'a']);
  });

  it('à date égale, met la dernière saisie en haut sans toucher à l’ordre stocké', () => {
    let data = createInitialFinanceData();
    data = { ...data, invoices: [] };
    data = addInvoice(data, { clientName: 'Premier', totalTTC: 100, issueDate: '2026-10-01' });
    data = addInvoice(data, { clientName: 'Second', totalTTC: 200, issueDate: '2026-10-01' });
    const stored = data.invoices.map((invoice) => invoice.clientName);

    expect(sortInvoicesByDateDesc(data.invoices).map((invoice) => invoice.clientName)).toEqual(['Second', 'Premier']);
    expect(data.invoices.map((invoice) => invoice.clientName)).toEqual(stored);
  });
});
