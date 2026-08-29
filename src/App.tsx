import type { ChangeEvent } from 'react';
import type { EditableInvoice, FinanceData, Interaction, Opportunity, Prospect, RecurringCharge, Transaction } from '@freepilot/finance-core';
import {
  addExpense,
  addInvoice,
  addOpportunity,
  addOtherIncome,
  addProspect,
  addRecurringCharge,
  addTask,
  applyProspectionImport,
  buildFinanceSeries,
  buildForecastMonths,
  buildProspectFollowUps,
  cancelTask,
  captureFieldProspect,
  completeTask,
  createTransfer,
  deleteAREMonth,
  deleteInteraction,
  deleteInvoice,
  deleteOpportunity,
  deleteProspect,
  deleteRecurringCharge,
  deleteTransaction,
  dueTasks,
  getCurrentMonth,
  getProfessionalAccount,
  loadOrSeedFinanceData,
  logInteraction,
  markInvoicePaid,
  pendingInvoiceRevenueWithoutDueDate,
  postDueRecurringCharges,
  projectDashboard,
  removeImportBatch,
  resetFinanceData,
  setObservedAccountBalance,
  summarizeCrm,
  todayISO,
  updateInvoice,
  updateOpportunity,
  updateProspect,
  updateRecurringCharge,
  updateSettings,
  updateTransaction,
  upsertAREMonth,
} from '@freepilot/finance-core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CloudStatus } from './cloud/useCloudSync';
import { useCloudSync } from './cloud/useCloudSync';
import type { Confirmation } from './components/ConfirmDialog';
import { ConfirmDialog } from './components/ConfirmDialog';
import { downloadFinanceData, readFinanceDataFile } from './dataTransfer';
import { formatMonthLabel, today } from './format';
import { webFinanceStore } from './localFinanceStore';
import { PwaBanners } from './PwaBanners';
import { AccountsView } from './views/AccountsView';
import { AREMonthsView } from './views/AREMonthsView';
import { CloudView } from './views/CloudView';
import { CrmView } from './views/crm/CrmView';
import { ProspectionImportView } from './views/crm/ProspectionImportView';
import { DashboardView } from './views/DashboardView';
import { DataView } from './views/DataView';
import { ForecastView } from './views/ForecastView';
import { InvoicesView } from './views/InvoicesView';
import { RecurringChargesView } from './views/RecurringChargesView';
import { SettingsView } from './views/SettingsView';
import { TransactionsView } from './views/TransactionsView';

type Section = 'finances' | 'crm' | 'settings';
type FinancePage = 'dashboard' | 'accounts' | 'invoices' | 'transactions' | 'charges' | 'are' | 'forecast';
type SettingsPage = 'calculs' | 'cloud' | 'donnees';

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
  ['forecast', 'Prévisionnel'],
];

const settingsPages: [SettingsPage, string][] = [
  ['calculs', 'Calculs'],
  ['cloud', 'Cloud'],
  ['donnees', 'Données'],
];

/** Le bandeau dit d'un coup d'œil où vivent les données en ce moment. */
const cloudBadges: Record<CloudStatus, { label: string; tone: '' | 'ok' | 'warn' }> = {
  disabled: { label: 'Local', tone: '' },
  'signed-out': { label: 'Local', tone: '' },
  idle: { label: 'Cloud', tone: 'ok' },
  syncing: { label: 'Synchro…', tone: '' },
  offline: { label: 'Hors ligne', tone: '' },
  conflict: { label: 'Conflit', tone: 'warn' },
  blocked: { label: 'À mettre à jour', tone: 'warn' },
  error: { label: 'Erreur', tone: 'warn' },
};

export const App = () => {
  const [data, setData] = useState<FinanceData | null>(null);
  const [section, setSection] = useState<Section>('finances');
  const [financePage, setFinancePage] = useState<FinancePage>('dashboard');
  const [settingsPage, setSettingsPage] = useState<SettingsPage>('calculs');
  const [dataNotice, setDataNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  // Levé ici plutôt que gardé dans ProspectionImportView : ce dernier est
  // démonté à chaque changement d'onglet, ce qui effacerait le bouton
  // d'annulation dès qu'on quitte l'écran des yeux.
  const [lastImportBatch, setLastImportBatch] = useState<{ batchId: string; count: number } | null>(null);

  const currentMonth = useMemo(() => getCurrentMonth(), []);
  const currentDay = useMemo(() => todayISO(), []);

  useEffect(() => {
    void loadOrSeedFinanceData(webFinanceStore).then(setData);
  }, []);

  // Défini avant le rendu conditionnel : la synchro en a besoin pour appliquer
  // un document venu du cloud, exactement comme une modification locale.
  const saveData = useCallback((nextData: FinanceData) => {
    setData(nextData);
    void webFinanceStore.save(nextData);
  }, []);

  const cloud = useCloudSync({ data, onRemoteData: saveData });

  // Les charges fixes engendrent leurs opérations dès que le mois est ouvert,
  // y compris sur un document qui vient d'être importé ou tiré du cloud.
  // L'opération est idempotente et renvoie les mêmes données quand tout est
  // déjà posé : aucune boucle d'enregistrement possible.
  useEffect(() => {
    if (!data) return;

    const posted = postDueRecurringCharges(data, currentMonth);
    if (posted !== data) saveData(posted);
  }, [currentMonth, data, saveData]);

  const projection = useMemo(() => (data ? projectDashboard(data, currentMonth) : null), [currentMonth, data]);
  const series = useMemo(() => (data ? buildFinanceSeries(data, currentMonth) : []), [currentMonth, data]);
  const forecastMonths = useMemo(
    () => (data ? buildForecastMonths(data, currentMonth, 6) : []),
    [currentMonth, data],
  );
  const facturesSansEcheance = useMemo(
    () => (data ? pendingInvoiceRevenueWithoutDueDate(data) : 0),
    [data],
  );
  const followUps = useMemo(() => (data ? buildProspectFollowUps(data, currentDay) : []), [currentDay, data]);
  const crmSummary = useMemo(() => (data ? summarizeCrm(data, currentDay) : null), [currentDay, data]);
  // Compteur d'onglet CRM : relances réseau dues + tâches dues, sans double
  // compte grâce au filtrage R8 déjà appliqué à crmSummary.overdue.
  const dueTaskCount = useMemo(() => (data ? dueTasks(data, currentDay).length : 0), [currentDay, data]);

  if (!data || !projection || !crmSummary) {
    return (
      <main className="phone-shell">
        <p className="loading">Chargement de FreePilot...</p>
      </main>
    );
  }

  const professionalAccountId = getProfessionalAccount(data)?.id;
  const cloudBadge = cloudBadges[cloud.status];

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

  const handleDeleteOpportunity = (opportunity: Opportunity) => {
    setConfirmation({
      title: 'Supprimer l’affaire ?',
      message: `« ${opportunity.title} » et ses tâches liées seront supprimées.`,
      confirmLabel: 'Supprimer',
      onConfirm: () => saveData(deleteOpportunity(data, opportunity.id)),
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
          <span className={`local-badge ${cloudBadge.tone}`}>{cloudBadge.label}</span>
        </div>
      </header>

      <PwaBanners />

      <nav className="tabs sections" aria-label="Sections">
        {sections.map(([id, label]) => (
          <button className={section === id ? 'active' : ''} key={id} onClick={() => setSection(id)} type="button">
            {label}
            {id === 'crm' && crmSummary.overdue + dueTaskCount > 0 ? (
              <span className="tab-count">{crmSummary.overdue + dueTaskCount}</span>
            ) : null}
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
              onSetObservedBalances={(entries) =>
                saveData(
                  entries.reduce(
                    (current, entry) => setObservedAccountBalance(current, entry.id, entry.observedBalance),
                    data,
                  ),
                )
              }
              onTransfer={(input) => saveData(createTransfer(data, { ...input, date: today() }))}
            />
          ) : null}

          {financePage === 'invoices' ? (
            <InvoicesView
              canMarkPaid={Boolean(professionalAccountId)}
              invoices={data.invoices}
              onCreate={(input) => saveData(addInvoice(data, { ...input, issueDate: input.issueDate ?? today() }))}
              onDelete={handleDeleteInvoice}
              onMarkPaid={(invoice, paymentDate) =>
                saveData(markInvoicePaid(data, invoice.id, { paymentDate, accountId: professionalAccountId }))
              }
              onMarkSent={(invoice) => saveData(updateInvoice(data, invoice.id, { status: 'sent' }))}
              onUpdate={(invoiceId, input) => saveData(updateInvoice(data, invoiceId, input))}
              prospects={data.prospects}
            />
          ) : null}

          {financePage === 'transactions' ? (
            <TransactionsView
              accounts={data.accounts}
              onAddExpense={(input) =>
                saveData(addExpense(data, { ...input, date: today(), accountId: input.accountId || professionalAccountId }))
              }
              onAddOtherIncome={(input) =>
                saveData(
                  addOtherIncome(data, { ...input, date: today(), accountId: input.accountId || professionalAccountId }),
                )
              }
              onDelete={handleDeleteTransaction}
              onUpdate={(transactionId, input) => saveData(updateTransaction(data, transactionId, input))}
              transactions={data.transactions}
            />
          ) : null}

          {financePage === 'charges' ? (
            <RecurringChargesView
              accounts={data.accounts}
              charges={data.recurringCharges}
              onAdd={(input) => saveData(addRecurringCharge(data, input))}
              onDelete={handleDeleteCharge}
              onSetPaymentAccount={(charge, paymentAccountId) =>
                saveData(updateRecurringCharge(data, charge.id, { paymentAccountId }))
              }
              onToggle={(charge) => saveData(updateRecurringCharge(data, charge.id, { active: !charge.active }))}
              onUpdate={(chargeId, input) => saveData(updateRecurringCharge(data, chargeId, input))}
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

          {financePage === 'forecast' ? (
            <ForecastView facturesSansEcheance={facturesSansEcheance} months={forecastMonths} />
          ) : null}
        </>
      ) : null}

      {section === 'crm' ? (
        <CrmView
          data={data}
          followUps={followUps}
          interactions={data.interactions}
          onAddProspect={(input) => saveData(addProspect(data, input))}
          onAddTask={(input) => saveData(addTask(data, input))}
          onCancelTask={(taskId) => saveData(cancelTask(data, taskId))}
          onChangeOpportunityStage={(opportunityId, stageId) =>
            saveData(updateOpportunity(data, opportunityId, { stageId }, currentDay))
          }
          onCompleteTask={(taskId) => saveData(completeTask(data, taskId))}
          onCreateOpportunity={(input) => saveData(addOpportunity(data, input))}
          onDeleteInteraction={handleDeleteInteraction}
          onDeleteOpportunity={handleDeleteOpportunity}
          onDeleteProspect={handleDeleteProspect}
          onLogInteraction={(input) => saveData(logInteraction(data, input))}
          onQuickCapture={(input) => saveData(captureFieldProspect(data, { ...input, createdAt: currentDay }))}
          onUpdateOpportunity={(opportunityId, input) => saveData(updateOpportunity(data, opportunityId, input, currentDay))}
          onUpdateProspect={(prospectId, input) => saveData(updateProspect(data, prospectId, input))}
          summary={crmSummary}
          today={currentDay}
        />
      ) : null}

      {section === 'settings' ? (
        <>
          <nav className="tabs" aria-label="Navigation réglages">
            {settingsPages.map(([id, label]) => (
              <button
                className={settingsPage === id ? 'active' : ''}
                key={id}
                onClick={() => setSettingsPage(id)}
                type="button"
              >
                {label}
              </button>
            ))}
          </nav>

          <section className="details-stack single">
            {settingsPage === 'calculs' ? (
              <SettingsView
                onSave={(nextSettings) => saveData(updateSettings(data, nextSettings))}
                settings={data.settings}
              />
            ) : null}

            {settingsPage === 'cloud' ? <CloudView cloud={cloud} /> : null}

            {settingsPage === 'donnees' ? (
              <>
                <DataView
                  cloudActive={cloud.user !== null}
                  notice={dataNotice}
                  onExport={handleExportData}
                  onImport={handleImportData}
                  onReset={handleResetData}
                />
                <ProspectionImportView
                  lastImportBatch={lastImportBatch}
                  onImport={(rows, batchId) => {
                    saveData(applyProspectionImport(data, rows, batchId, currentDay));
                    setLastImportBatch({ batchId, count: rows.length });
                  }}
                  onRollback={(batchId) => {
                    saveData(removeImportBatch(data, batchId));
                    setLastImportBatch(null);
                  }}
                />
              </>
            ) : null}
          </section>
        </>
      ) : null}

      {confirmation ? (
        <ConfirmDialog confirmation={confirmation} onCancel={() => setConfirmation(null)} />
      ) : null}
    </main>
  );
};
