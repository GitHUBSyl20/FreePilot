import type { EditableInvoice, FinanceData, RecurringCharge, Transaction } from '@freepilot/finance-core';
import {
  addExpense,
  addInvoice,
  addOtherIncome,
  addRecurringCharge,
  buildFinanceSeries,
  buildForecastMonths,
  createTransfer,
  deleteAREMonth,
  deleteInvoice,
  deleteRecurringCharge,
  deleteTransaction,
  getCurrentMonth,
  getProfessionalAccount,
  loadOrSeedFinanceData,
  markInvoicePaid,
  postDueRecurringCharges,
  projectDashboard,
  setObservedAccountBalance,
  updateInvoice,
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
import { formatMonthLabel, today } from './format';
import { webFinanceStore } from './localFinanceStore';
import { PwaBanners } from './PwaBanners';
import { AREMonthsView } from './views/AREMonthsView';
import { DashboardView } from './views/DashboardView';
import { InvoicesView } from './views/InvoicesView';
import { MoneyView } from './views/MoneyView';
import { SettingsView } from './views/SettingsView';

/**
 * Version simplifiée : quatre onglets plats et les réglages derrière ⚙.
 * Le CRM, le prévisionnel détaillé, le cloud et l'import/export restent dans
 * le code (vues et moteur intacts) mais ne sont plus affichés ; les données
 * qu'ils portent sont conservées.
 */
type Page = 'dashboard' | 'invoices' | 'money' | 'are' | 'settings';

const pages: [Exclude<Page, 'settings'>, string][] = [
  ['dashboard', 'Accueil'],
  ['invoices', 'Factures'],
  ['money', 'Argent'],
  ['are', 'ARE'],
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
  const [page, setPage] = useState<Page>('dashboard');
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  const currentMonth = useMemo(() => getCurrentMonth(), []);

  useEffect(() => {
    void loadOrSeedFinanceData(webFinanceStore).then(setData);
  }, []);

  // Défini avant le rendu conditionnel : la synchro en a besoin pour appliquer
  // un document venu du cloud, exactement comme une modification locale.
  const saveData = useCallback((nextData: FinanceData) => {
    setData(nextData);
    void webFinanceStore.save(nextData);
  }, []);

  // L'écran Cloud est masqué, mais une session déjà connectée continue de
  // synchroniser : masquer l'interface ne doit pas couper la sauvegarde.
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
  // CRM masqué : ses affaires ne doivent pas gonfler les mois à venir.
  const forecastMonths = useMemo(
    () => (data ? buildForecastMonths(data, currentMonth, 4, { includeCrm: false }) : []),
    [currentMonth, data],
  );

  if (!data || !projection) {
    return (
      <main className="phone-shell">
        <p className="loading">Chargement de FreePilot...</p>
      </main>
    );
  }

  const professionalAccountId = getProfessionalAccount(data)?.id;
  const cloudBadge = cloudBadges[cloud.status];

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

  return (
    <main className="phone-shell">
      <header className="top-bar">
        <div>
          <p className="eyebrow">FreePilot</p>
          <h1>{formatMonthLabel(currentMonth)}</h1>
        </div>
        <div className="header-actions">
          <span className={`local-badge ${cloudBadge.tone}`}>{cloudBadge.label}</span>
          <button
            aria-label="Réglages"
            className={page === 'settings' ? 'settings-button active' : 'settings-button'}
            onClick={() => setPage(page === 'settings' ? 'dashboard' : 'settings')}
            type="button"
          >
            ⚙
          </button>
        </div>
      </header>

      <PwaBanners />

      <nav className="tabs sections" aria-label="Navigation">
        {pages.map(([id, label]) => (
          <button className={page === id ? 'active' : ''} key={id} onClick={() => setPage(id)} type="button">
            {label}
          </button>
        ))}
      </nav>

      {page === 'dashboard' ? (
        <DashboardView
          forecastMonths={forecastMonths}
          onAddExpense={() => setPage('money')}
          onAddInvoice={() => setPage('invoices')}
          projection={projection}
          settings={data.settings}
        />
      ) : null}

      {page === 'invoices' ? (
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
          // CRM masqué : pas de rattachement à un prospect. Un lien déjà posé
          // est conservé à l'édition par le formulaire.
          prospects={[]}
        />
      ) : null}

      {page === 'money' ? (
        <MoneyView
          accounts={{
            accounts: projection.accountBalances,
            onSetObservedBalances: (entries) =>
              saveData(
                entries.reduce(
                  (current, entry) => setObservedAccountBalance(current, entry.id, entry.observedBalance),
                  data,
                ),
              ),
            onTransfer: (input) => saveData(createTransfer(data, { ...input, date: today() })),
          }}
          charges={{
            accounts: data.accounts,
            charges: data.recurringCharges,
            onAdd: (input) => saveData(addRecurringCharge(data, input)),
            onDelete: handleDeleteCharge,
            onSetPaymentAccount: (charge, paymentAccountId) =>
              saveData(updateRecurringCharge(data, charge.id, { paymentAccountId })),
            onToggle: (charge) => saveData(updateRecurringCharge(data, charge.id, { active: !charge.active })),
            onUpdate: (chargeId, input) => saveData(updateRecurringCharge(data, chargeId, input)),
            totals: projection.outlook.recurringCharges,
          }}
          transactions={{
            accounts: data.accounts,
            onAddExpense: (input) =>
              saveData(addExpense(data, { ...input, date: today(), accountId: input.accountId || professionalAccountId })),
            onAddOtherIncome: (input) =>
              saveData(
                addOtherIncome(data, { ...input, date: today(), accountId: input.accountId || professionalAccountId }),
              ),
            onDelete: handleDeleteTransaction,
            onUpdate: (transactionId, input) => saveData(updateTransaction(data, transactionId, input)),
            transactions: data.transactions,
          }}
        />
      ) : null}

      {page === 'are' ? (
        <AREMonthsView
          currentMonth={currentMonth}
          entries={data.areMonths}
          onDelete={(month) => saveData(deleteAREMonth(data, month))}
          onSave={(input) => saveData(upsertAREMonth(data, input))}
          series={series}
        />
      ) : null}

      {page === 'settings' ? (
        <section className="details-stack single">
          <SettingsView
            monthlyFixedCharges={projection.outlook.recurringCharges.total}
            onSave={(nextSettings) => saveData(updateSettings(data, nextSettings))} settings={data.settings} />
        </section>
      ) : null}

      {confirmation ? (
        <ConfirmDialog confirmation={confirmation} onCancel={() => setConfirmation(null)} />
      ) : null}
    </main>
  );
};
