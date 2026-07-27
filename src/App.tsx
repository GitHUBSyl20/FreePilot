import type { ChangeEvent } from 'react';
import type { EditableInvoice, FinanceData, RecurringCharge, Transaction } from '@freepilot/finance-core';
import {
  addExpense,
  addInvoice,
  addRecurringCharge,
  buildFinanceSeries,
  createTransfer,
  deleteAREMonth,
  deleteInvoice,
  deleteRecurringCharge,
  deleteTransaction,
  getCurrentMonth,
  getProfessionalAccount,
  loadOrSeedFinanceData,
  markInvoicePaid,
  projectDashboard,
  resetFinanceData,
  updateInvoice,
  updateRecurringCharge,
  updateTransaction,
  upsertAREMonth,
} from '@freepilot/finance-core';
import { useEffect, useMemo, useState } from 'react';
import { downloadFinanceData, readFinanceDataFile } from './dataTransfer';
import { formatMonthLabel, today } from './format';
import { webFinanceStore } from './localFinanceStore';
import { PwaBanners } from './PwaBanners';
import { AccountsView } from './views/AccountsView';
import { AREMonthsView } from './views/AREMonthsView';
import { CrmView } from './views/CrmView';
import { DashboardView } from './views/DashboardView';
import { DataView } from './views/DataView';
import { InvoicesView } from './views/InvoicesView';
import { RecurringChargesView } from './views/RecurringChargesView';
import { TransactionsView } from './views/TransactionsView';

type Section = 'finances' | 'crm' | 'settings';
type FinancePage = 'dashboard' | 'accounts' | 'invoices' | 'transactions' | 'charges' | 'are';

const sections: [Section, string][] = [
  ['finances', 'Finances'],
  ['crm', 'CRM'],
  ['settings', 'Réglages'],
];

const financePages: [FinancePage, string][] = [
  ['dashboard', 'Accueil'],
  ['accounts', 'Comptes'],
  ['invoices', 'Factures'],
  ['transactions', 'Opérations'],
  ['charges', 'Charges'],
  ['are', 'ARE'],
];

export const App = () => {
  const [data, setData] = useState<FinanceData | null>(null);
  const [section, setSection] = useState<Section>('finances');
  const [financePage, setFinancePage] = useState<FinancePage>('dashboard');
  const [dataNotice, setDataNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const currentMonth = useMemo(() => getCurrentMonth(), []);

  useEffect(() => {
    void loadOrSeedFinanceData(webFinanceStore).then(setData);
  }, []);

  const projection = useMemo(() => (data ? projectDashboard(data, currentMonth) : null), [currentMonth, data]);
  const series = useMemo(() => (data ? buildFinanceSeries(data, currentMonth) : []), [currentMonth, data]);

  if (!data || !projection) {
    return (
      <main className="phone-shell">
        <p className="loading">Chargement de FreePilot...</p>
      </main>
    );
  }

  const saveData = (nextData: FinanceData) => {
    setData(nextData);
    void webFinanceStore.save(nextData);
  };

  const professionalAccountId = getProfessionalAccount(data)?.id;

  const handleExportData = () => {
    downloadFinanceData(data);
    setDataNotice({ tone: 'ok', text: 'Sauvegarde téléchargée.' });
  };

  const handleImportData = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Le champ est réinitialisé pour permettre de réimporter le même fichier.
    event.target.value = '';
    if (!file) return;

    try {
      const imported = await readFinanceDataFile(file);
      if (!window.confirm('Remplacer toutes les données actuelles par le contenu de ce fichier ?')) return;

      saveData(imported);
      setDataNotice({
        tone: 'ok',
        text: `Import réussi : ${imported.invoices.length} facture(s), ${imported.recurringCharges.length} charge(s), ${imported.areMonths.length} mois d’ARE.`,
      });
    } catch (error) {
      setDataNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Import impossible.' });
    }
  };

  const handleResetData = () => {
    if (!window.confirm('Effacer toutes les données locales et repartir des données de démo ?')) return;

    void resetFinanceData(webFinanceStore).then((resetData) => {
      setData(resetData);
      setSection('finances');
      setFinancePage('dashboard');
    });
  };

  const handleDeleteInvoice = (invoice: EditableInvoice) => {
    if (!window.confirm(`Supprimer la facture de ${invoice.clientName} ?`)) return;
    saveData(deleteInvoice(data, invoice.id));
  };

  const handleDeleteTransaction = (transaction: Transaction) => {
    if (!window.confirm(`Supprimer l'opération "${transaction.label}" ?`)) return;
    saveData(deleteTransaction(data, transaction.id));
  };

  const handleDeleteCharge = (charge: RecurringCharge) => {
    if (!window.confirm(`Supprimer la charge "${charge.label}" ?`)) return;
    saveData(deleteRecurringCharge(data, charge.id));
  };

  return (
    <main className="phone-shell">
      <header className="top-bar">
        <div>
          <p className="eyebrow">FreePilot</p>
          <h1>{formatMonthLabel(currentMonth)}</h1>
        </div>
        <div className="header-actions">
          <span className="local-badge">Local</span>
        </div>
      </header>

      <PwaBanners />

      <nav className="tabs sections" aria-label="Sections">
        {sections.map(([id, label]) => (
          <button className={section === id ? 'active' : ''} key={id} onClick={() => setSection(id)} type="button">
            {label}
          </button>
        ))}
      </nav>

      {section === 'finances' ? (
        <>
          <nav className="tabs" aria-label="Navigation finances">
            {financePages.map(([id, label]) => (
              <button
                className={financePage === id ? 'active' : ''}
                key={id}
                onClick={() => setFinancePage(id)}
                type="button"
              >
                {label}
              </button>
            ))}
          </nav>

          {financePage === 'dashboard' ? (
            <DashboardView
              onAddExpense={() => setFinancePage('transactions')}
              onAddInvoice={() => setFinancePage('invoices')}
              projection={projection}
              settings={data.settings}
            />
          ) : null}

          {financePage === 'accounts' ? (
            <AccountsView
              accounts={projection.accountBalances}
              onTransfer={(input) => saveData(createTransfer(data, { ...input, date: today() }))}
            />
          ) : null}

          {financePage === 'invoices' ? (
            <InvoicesView
              canMarkPaid={Boolean(professionalAccountId)}
              invoices={data.invoices}
              onCreate={(input) => saveData(addInvoice(data, { ...input, issueDate: today() }))}
              onDelete={handleDeleteInvoice}
              onMarkPaid={(invoice) =>
                saveData(markInvoicePaid(data, invoice.id, { paymentDate: today(), accountId: professionalAccountId }))
              }
              onUpdate={(invoiceId, input) => saveData(updateInvoice(data, invoiceId, input))}
            />
          ) : null}

          {financePage === 'transactions' ? (
            <TransactionsView
              onAddExpense={(input) =>
                saveData(addExpense(data, { ...input, date: today(), accountId: professionalAccountId }))
              }
              onDelete={handleDeleteTransaction}
              onUpdate={(transactionId, input) => saveData(updateTransaction(data, transactionId, input))}
              transactions={data.transactions}
            />
          ) : null}

          {financePage === 'charges' ? (
            <RecurringChargesView
              charges={data.recurringCharges}
              onAdd={(input) => saveData(addRecurringCharge(data, input))}
              onDelete={handleDeleteCharge}
              onToggle={(charge) => saveData(updateRecurringCharge(data, charge.id, { active: !charge.active }))}
              totals={projection.outlook.recurringCharges}
            />
          ) : null}

          {financePage === 'are' ? (
            <AREMonthsView
              currentMonth={currentMonth}
              entries={data.areMonths}
              onDelete={(month) => saveData(deleteAREMonth(data, month))}
              onSave={(input) => saveData(upsertAREMonth(data, input))}
              series={series}
            />
          ) : null}
        </>
      ) : null}

      {section === 'crm' ? <CrmView /> : null}

      {section === 'settings' ? (
        <DataView
          notice={dataNotice}
          onExport={handleExportData}
          onImport={handleImportData}
          onReset={handleResetData}
        />
      ) : null}
    </main>
  );
};
