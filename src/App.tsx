import type { ChangeEvent } from 'react';
import type { EditableInvoice, FinanceData, Interaction, Prospect, RecurringCharge, Transaction } from '@freepilot/finance-core';
import {
  addExpense,
  addInvoice,
  addOtherIncome,
  addProspect,
  addRecurringCharge,
  buildFinanceSeries,
  buildProspectFollowUps,
  createTransfer,
  deleteAREMonth,
  deleteInteraction,
  deleteInvoice,
  deleteProspect,
  deleteRecurringCharge,
  deleteTransaction,
  getCurrentMonth,
  getProfessionalAccount,
  loadOrSeedFinanceData,
  logInteraction,
  markInvoicePaid,
  projectDashboard,
  resetFinanceData,
  summarizeCrm,
  todayISO,
  updateInvoice,
  updateProspect,
  updateRecurringCharge,
  updateTransaction,
  upsertAREMonth,
} from '@freepilot/finance-core';
import { useEffect, useMemo, useState } from 'react';
import type { Confirmation } from './components/ConfirmDialog';
import { ConfirmDialog } from './components/ConfirmDialog';
import { downloadFinanceData, readFinanceDataFile } from './dataTransfer';
import { formatMonthLabel, today } from './format';
import { webFinanceStore } from './localFinanceStore';
import { PwaBanners } from './PwaBanners';
import { AccountsView } from './views/AccountsView';
import { AREMonthsView } from './views/AREMonthsView';
import { CrmView } from './views/crm/CrmView';
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
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  const currentMonth = useMemo(() => getCurrentMonth(), []);
  const currentDay = useMemo(() => todayISO(), []);

  useEffect(() => {
    void loadOrSeedFinanceData(webFinanceStore).then(setData);
  }, []);

  const projection = useMemo(() => (data ? projectDashboard(data, currentMonth) : null), [currentMonth, data]);
  const series = useMemo(() => (data ? buildFinanceSeries(data, currentMonth) : []), [currentMonth, data]);
  const followUps = useMemo(() => (data ? buildProspectFollowUps(data, currentDay) : []), [currentDay, data]);
  const crmSummary = useMemo(() => (data ? summarizeCrm(data, currentDay) : null), [currentDay, data]);

  if (!data || !projection || !crmSummary) {
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
      const summary = `${imported.invoices.length} facture(s), ${imported.recurringCharges.length} charge(s), ${imported.areMonths.length} mois d’ARE, ${imported.prospects.length} prospect(s)`;

      setConfirmation({
        title: 'Remplacer les données ?',
        message: `Le fichier contient ${summary}. Tout le contenu actuel sera écrasé.`,
        confirmLabel: 'Remplacer',
        onConfirm: () => {
          saveData(imported);
          setDataNotice({ tone: 'ok', text: `Import réussi : ${summary}.` });
        },
      });
    } catch (error) {
      setDataNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Import impossible.' });
    }
  };

  const handleResetData = () => {
    setConfirmation({
      title: 'Effacer les données ?',
      message: 'Tout le contenu local est supprimé et remplacé par les données de démonstration.',
      confirmLabel: 'Effacer',
      onConfirm: () => {
        void resetFinanceData(webFinanceStore).then((resetData) => {
          setData(resetData);
          setSection('finances');
          setFinancePage('dashboard');
        });
      },
    });
  };

  const handleDeleteInvoice = (invoice: EditableInvoice) => {
    setConfirmation({
      title: 'Supprimer la facture ?',
      message: `La facture de ${invoice.clientName} et son encaissement éventuel seront supprimés.`,
      confirmLabel: 'Supprimer',
      onConfirm: () => saveData(deleteInvoice(data, invoice.id)),
    });
  };

  const handleDeleteTransaction = (transaction: Transaction) => {
    setConfirmation({
      title: 'Supprimer l’opération ?',
      message: `« ${transaction.label} » sera supprimée.`,
      confirmLabel: 'Supprimer',
      onConfirm: () => saveData(deleteTransaction(data, transaction.id)),
    });
  };

  const handleDeleteCharge = (charge: RecurringCharge) => {
    setConfirmation({
      title: 'Supprimer la charge ?',
      message: `« ${charge.label} » ne sera plus comptée dans les charges fixes.`,
      confirmLabel: 'Supprimer',
      onConfirm: () => saveData(deleteRecurringCharge(data, charge.id)),
    });
  };

  const handleDeleteProspect = (prospect: Prospect) => {
    setConfirmation({
      title: 'Supprimer le prospect ?',
      message: `${prospect.name} et tout son historique de contacts seront supprimés. Les factures déjà émises sont conservées.`,
      confirmLabel: 'Supprimer',
      onConfirm: () => saveData(deleteProspect(data, prospect.id)),
    });
  };

  const handleDeleteInteraction = (interaction: Interaction) => {
    setConfirmation({
      title: 'Supprimer ce contact ?',
      message: 'Il disparaîtra de l’historique, ce qui peut décaler la prochaine relance.',
      confirmLabel: 'Supprimer',
      onConfirm: () => saveData(deleteInteraction(data, interaction.id)),
    });
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
            {id === 'crm' && crmSummary.overdue > 0 ? <span className="tab-count">{crmSummary.overdue}</span> : null}
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
              onMarkSent={(invoice) => saveData(updateInvoice(data, invoice.id, { status: 'sent' }))}
              onUpdate={(invoiceId, input) => saveData(updateInvoice(data, invoiceId, input))}
              prospects={data.prospects}
            />
          ) : null}

          {financePage === 'transactions' ? (
            <TransactionsView
              onAddExpense={(input) =>
                saveData(addExpense(data, { ...input, date: today(), accountId: professionalAccountId }))
              }
              onAddOtherIncome={(input) =>
                saveData(addOtherIncome(data, { ...input, date: today(), accountId: professionalAccountId }))
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

      {section === 'crm' ? (
        <CrmView
          followUps={followUps}
          interactions={data.interactions}
          onAddProspect={(input) => saveData(addProspect(data, input))}
          onDeleteInteraction={handleDeleteInteraction}
          onDeleteProspect={handleDeleteProspect}
          onLogInteraction={(input) => saveData(logInteraction(data, input))}
          onUpdateProspect={(prospectId, input) => saveData(updateProspect(data, prospectId, input))}
          summary={crmSummary}
          today={currentDay}
        />
      ) : null}

      {section === 'settings' ? (
        <DataView
          notice={dataNotice}
          onExport={handleExportData}
          onImport={handleImportData}
          onReset={handleResetData}
        />
      ) : null}

      {confirmation ? (
        <ConfirmDialog confirmation={confirmation} onCancel={() => setConfirmation(null)} />
      ) : null}
    </main>
  );
};
