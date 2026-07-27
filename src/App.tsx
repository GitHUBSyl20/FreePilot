import type { AccountBalance, EditableInvoice, FinanceData, Transaction } from '@freepilot/finance-core';
import {
  addExpense,
  addInvoice,
  createTransfer,
  deleteInvoice,
  deleteTransaction,
  getCurrentMonth,
  getProfessionalAccount,
  loadOrSeedFinanceData,
  markInvoicePaid,
  projectDashboard,
  resetFinanceData,
  updateInvoice,
  updateTransaction,
} from '@freepilot/finance-core';
import type { ChangeEvent, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { downloadFinanceData, readFinanceDataFile } from './dataTransfer';
import { webFinanceStore } from './localFinanceStore';
import { PwaBanners } from './PwaBanners';

type Page = 'dashboard' | 'accounts' | 'invoices' | 'transactions' | 'data';

const currencyFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
});

const monthFormatter = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });

/** '2026-07' -> 'Juillet 2026' */
const formatMonthLabel = (month: string): string => {
  const [year, monthNumber] = month.split('-').map(Number);
  const label = monthFormatter.format(new Date(year, monthNumber - 1, 1));
  return label.charAt(0).toUpperCase() + label.slice(1);
};

const today = () => new Date().toISOString().slice(0, 10);

const parseAmount = (value: string): number => Number(value.replace(',', '.')) || 0;

export const App = () => {
  const [data, setData] = useState<FinanceData | null>(null);
  const [page, setPage] = useState<Page>('dashboard');
  const [invoiceClient, setInvoiceClient] = useState('');
  const [invoiceAmount, setInvoiceAmount] = useState('');
  const [expenseLabel, setExpenseLabel] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferFrom, setTransferFrom] = useState('');
  const [transferTo, setTransferTo] = useState('');
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [dataNotice, setDataNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const currentMonth = useMemo(() => getCurrentMonth(), []);

  useEffect(() => {
    void loadOrSeedFinanceData(webFinanceStore).then((loaded) => {
      setData(loaded);
      setTransferFrom(getProfessionalAccount(loaded)?.id ?? '');
      setTransferTo(loaded.accounts.find((account) => account.kind === 'personal')?.id ?? '');
    });
  }, []);

  const dashboard = useMemo(() => (data ? projectDashboard(data, currentMonth) : null), [currentMonth, data]);

  const saveData = (nextData: FinanceData) => {
    setData(nextData);
    void webFinanceStore.save(nextData);
  };

  if (!data || !dashboard) {
    return (
      <main className="phone-shell">
        <p className="loading">Chargement de FreePilot...</p>
      </main>
    );
  }

  const professionalAccountId = getProfessionalAccount(data)?.id;
  const unpaidInvoices = data.invoices.filter((invoice) => invoice.status !== 'paid' && invoice.status !== 'cancelled');

  const handleAddInvoice = () => {
    const amount = parseAmount(invoiceAmount);
    if (!amount) return;
    if (editingInvoiceId) {
      saveData(updateInvoice(data, editingInvoiceId, { clientName: invoiceClient, totalTTC: amount }));
      setEditingInvoiceId(null);
    } else {
      saveData(addInvoice(data, { clientName: invoiceClient, totalTTC: amount, issueDate: today() }));
    }
    setInvoiceClient('');
    setInvoiceAmount('');
    setPage('invoices');
  };

  const handleAddExpense = () => {
    const amount = parseAmount(expenseAmount);
    if (!amount || !professionalAccountId) return;
    if (editingTransactionId) {
      saveData(updateTransaction(data, editingTransactionId, { label: expenseLabel, amount }));
      setEditingTransactionId(null);
    } else {
      saveData(addExpense(data, { label: expenseLabel, amount, date: today(), accountId: professionalAccountId }));
    }
    setExpenseLabel('');
    setExpenseAmount('');
  };

  const handleTransfer = () => {
    const amount = parseAmount(transferAmount);
    if (!amount || !transferFrom || !transferTo) return;
    saveData(createTransfer(data, { fromAccountId: transferFrom, toAccountId: transferTo, amount, date: today() }));
    setTransferAmount('');
  };

  const handleResetData = () => {
    if (!window.confirm('Effacer toutes les données locales et repartir des données de démo ?')) return;

    void resetFinanceData(webFinanceStore).then((resetData) => {
      setData(resetData);
      setTransferFrom(getProfessionalAccount(resetData)?.id ?? '');
      setTransferTo(resetData.accounts.find((account) => account.kind === 'personal')?.id ?? '');
      setPage('dashboard');
    });
  };

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
      setTransferFrom(getProfessionalAccount(imported)?.id ?? '');
      setTransferTo(imported.accounts.find((account) => account.kind === 'personal')?.id ?? '');
      setDataNotice({
        tone: 'ok',
        text: `Import réussi : ${imported.invoices.length} facture(s), ${imported.transactions.length} opération(s).`,
      });
    } catch (error) {
      setDataNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Import impossible.' });
    }
  };

  const handleEditInvoice = (invoice: EditableInvoice) => {
    setEditingInvoiceId(invoice.id);
    setInvoiceClient(invoice.clientName);
    setInvoiceAmount(String(invoice.totalTTC));
    setPage('invoices');
  };

  const handleCancelInvoiceEdit = () => {
    setEditingInvoiceId(null);
    setInvoiceClient('');
    setInvoiceAmount('');
  };

  const handleDeleteInvoice = (invoice: EditableInvoice) => {
    if (!window.confirm(`Supprimer la facture de ${invoice.clientName} ?`)) return;
    saveData(deleteInvoice(data, invoice.id));
    if (editingInvoiceId === invoice.id) handleCancelInvoiceEdit();
  };

  const handleEditTransaction = (transaction: Transaction) => {
    setEditingTransactionId(transaction.id);
    setExpenseLabel(transaction.label);
    setExpenseAmount(String(transaction.amount));
    setPage('transactions');
  };

  const handleCancelTransactionEdit = () => {
    setEditingTransactionId(null);
    setExpenseLabel('');
    setExpenseAmount('');
  };

  const handleDeleteTransaction = (transaction: Transaction) => {
    if (!window.confirm(`Supprimer l'opération "${transaction.label}" ?`)) return;
    saveData(deleteTransaction(data, transaction.id));
    if (editingTransactionId === transaction.id) handleCancelTransactionEdit();
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

      <nav className="tabs" aria-label="Navigation principale">
        {([
          ['dashboard', 'Accueil'],
          ['accounts', 'Comptes'],
          ['invoices', 'Factures'],
          ['transactions', 'Opérations'],
          ['data', 'Données'],
        ] as const).map(([id, label]) => (
          <button className={page === id ? 'active' : ''} key={id} onClick={() => setPage(id)} type="button">
            {label}
          </button>
        ))}
      </nav>

      {page === 'dashboard' ? (
        <DashboardView
          accountBalances={dashboard.accountBalances}
          invoices={unpaidInvoices}
          kpis={dashboard.kpis}
          onAddExpense={() => setPage('transactions')}
          onAddInvoice={() => setPage('invoices')}
          recentTransactions={dashboard.recentTransactions}
        />
      ) : null}

      {page === 'accounts' ? (
        <AccountsView
          accounts={dashboard.accountBalances}
          amount={transferAmount}
          fromAccountId={transferFrom}
          onAmountChange={setTransferAmount}
          onFromChange={setTransferFrom}
          onSubmit={handleTransfer}
          onToChange={setTransferTo}
          toAccountId={transferTo}
        />
      ) : null}

      {page === 'invoices' ? (
        <InvoicesView
          amount={invoiceAmount}
          client={invoiceClient}
          data={data}
          editingInvoiceId={editingInvoiceId}
          invoices={data.invoices}
          onAmountChange={setInvoiceAmount}
          onCancelEdit={handleCancelInvoiceEdit}
          onClientChange={setInvoiceClient}
          onCreate={handleAddInvoice}
          onDelete={handleDeleteInvoice}
          onEdit={handleEditInvoice}
          onMarkPaid={(invoice) =>
            saveData(markInvoicePaid(data, invoice.id, { paymentDate: today(), accountId: professionalAccountId }))
          }
        />
      ) : null}

      {page === 'transactions' ? (
        <TransactionsView
          amount={expenseAmount}
          editingTransactionId={editingTransactionId}
          label={expenseLabel}
          onAddExpense={handleAddExpense}
          onAmountChange={setExpenseAmount}
          onCancelEdit={handleCancelTransactionEdit}
          onDelete={handleDeleteTransaction}
          onEdit={handleEditTransaction}
          onLabelChange={setExpenseLabel}
          transactions={data.transactions}
        />
      ) : null}

      {page === 'data' ? (
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

function DashboardView({
  accountBalances,
  invoices,
  kpis,
  onAddExpense,
  onAddInvoice,
  recentTransactions,
}: {
  accountBalances: AccountBalance[];
  invoices: EditableInvoice[];
  kpis: ReturnType<typeof projectDashboard>['kpis'];
  onAddExpense: () => void;
  onAddInvoice: () => void;
  recentTransactions: Transaction[];
}) {
  const secondaryKpis = [
    { label: 'CA encaissé', value: kpis.caEncaisse, helper: 'Paiements reçus ce mois-ci' },
    { label: 'Factures à encaisser', value: kpis.facturesImpayees, helper: `${invoices.length} facture(s) ouvertes` },
    { label: 'ARE estimée M+1', value: kpis.areEstimeeM1, helper: 'Après déduction France Travail' },
    { label: 'Seuil coupure ARE', value: kpis.seuilCoupureARE, helper: 'CA encaissé avant ARE à 0 €' },
  ];

  return (
    <>
      <section className="balance-card" aria-labelledby="net-disponible-title">
        <span>Net disponible estimé</span>
        <strong id="net-disponible-title">{currencyFormatter.format(kpis.netDisponible)}</strong>
        <p>Calculé depuis les factures payées, dépenses et virements locaux.</p>
      </section>

      <nav className="quick-actions" aria-label="Actions rapides">
        <button onClick={onAddInvoice} type="button">Ajouter facture</button>
        <button onClick={onAddExpense} type="button">Saisir dépense</button>
      </nav>

      <section className="kpi-list" aria-label="Indicateurs financiers">
        {secondaryKpis.map((kpi) => (
          <article className="kpi-row" key={kpi.label}>
            <div>
              <span>{kpi.label}</span>
              <p>{kpi.helper}</p>
            </div>
            <strong>{currencyFormatter.format(kpi.value)}</strong>
          </article>
        ))}
      </section>

      <section className="details-stack">
        <Panel title="Comptes">
          {accountBalances.map((account) => (
            <InfoRow helper={account.kind} key={account.id} label={account.name} value={currencyFormatter.format(account.balance)} />
          ))}
        </Panel>
        <Panel title="Dernières opérations">
          {recentTransactions.map((transaction) => (
            <InfoRow
              helper={transaction.date}
              key={transaction.id}
              label={transaction.label}
              value={currencyFormatter.format(transaction.amount)}
            />
          ))}
        </Panel>
      </section>
    </>
  );
}

function AccountsView({
  accounts,
  amount,
  fromAccountId,
  onAmountChange,
  onFromChange,
  onSubmit,
  onToChange,
  toAccountId,
}: {
  accounts: AccountBalance[];
  amount: string;
  fromAccountId: string;
  onAmountChange: (value: string) => void;
  onFromChange: (value: string) => void;
  onSubmit: () => void;
  onToChange: (value: string) => void;
  toAccountId: string;
}) {
  return (
    <section className="details-stack single">
      <Panel title="Soldes">
        {accounts.map((account) => (
          <InfoRow helper={account.kind} key={account.id} label={account.name} value={currencyFormatter.format(account.balance)} />
        ))}
      </Panel>
      <Panel title="Virement entre comptes">
        <label>Depuis</label>
        <select onChange={(event) => onFromChange(event.target.value)} value={fromAccountId}>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>{account.name}</option>
          ))}
        </select>
        <label>Vers</label>
        <select onChange={(event) => onToChange(event.target.value)} value={toAccountId}>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>{account.name}</option>
          ))}
        </select>
        <input inputMode="decimal" onChange={(event) => onAmountChange(event.target.value)} placeholder="Montant" value={amount} />
        <button className="primary-button" onClick={onSubmit} type="button">Créer le virement</button>
      </Panel>
    </section>
  );
}

function InvoicesView({
  amount,
  client,
  data,
  editingInvoiceId,
  invoices,
  onAmountChange,
  onCancelEdit,
  onClientChange,
  onCreate,
  onDelete,
  onEdit,
  onMarkPaid,
}: {
  amount: string;
  client: string;
  data: FinanceData;
  editingInvoiceId: string | null;
  invoices: EditableInvoice[];
  onAmountChange: (value: string) => void;
  onCancelEdit: () => void;
  onClientChange: (value: string) => void;
  onCreate: () => void;
  onDelete: (invoice: EditableInvoice) => void;
  onEdit: (invoice: EditableInvoice) => void;
  onMarkPaid: (invoice: EditableInvoice) => void;
}) {
  const professionalAccount = getProfessionalAccount(data);

  return (
    <section className="details-stack single">
      <Panel title={editingInvoiceId ? 'Modifier la facture' : 'Nouvelle facture'}>
        <input onChange={(event) => onClientChange(event.target.value)} placeholder="Client" value={client} />
        <input inputMode="decimal" onChange={(event) => onAmountChange(event.target.value)} placeholder="Montant TTC" value={amount} />
        <div className="button-row">
          <button className="primary-button" onClick={onCreate} type="button">
            {editingInvoiceId ? 'Enregistrer la facture' : 'Ajouter la facture'}
          </button>
          {editingInvoiceId ? (
            <button className="secondary-button" onClick={onCancelEdit} type="button">Annuler</button>
          ) : null}
        </div>
      </Panel>
      <Panel title="Factures">
        {invoices.map((invoice) => (
          <div className="record-card" key={invoice.id}>
            <InfoRow
              helper={invoice.status === 'paid' ? `Payée le ${invoice.paymentDate}` : `Émise le ${invoice.issueDate}`}
              label={invoice.clientName}
              value={currencyFormatter.format(invoice.totalTTC)}
            />
            {invoice.status !== 'paid' && professionalAccount ? (
              <button className="secondary-button" onClick={() => onMarkPaid(invoice)} type="button">Marquer payée</button>
            ) : null}
            <div className="button-row">
              <button className="secondary-button" onClick={() => onEdit(invoice)} type="button">Modifier</button>
              <button className="danger-button" onClick={() => onDelete(invoice)} type="button">Supprimer</button>
            </div>
          </div>
        ))}
      </Panel>
    </section>
  );
}

function TransactionsView({
  amount,
  editingTransactionId,
  label,
  onAddExpense,
  onAmountChange,
  onCancelEdit,
  onDelete,
  onEdit,
  onLabelChange,
  transactions,
}: {
  amount: string;
  editingTransactionId: string | null;
  label: string;
  onAddExpense: () => void;
  onAmountChange: (value: string) => void;
  onCancelEdit: () => void;
  onDelete: (transaction: Transaction) => void;
  onEdit: (transaction: Transaction) => void;
  onLabelChange: (value: string) => void;
  transactions: Transaction[];
}) {
  return (
    <section className="details-stack single">
      <Panel title={editingTransactionId ? 'Modifier l’opération' : 'Nouvelle dépense pro'}>
        <input onChange={(event) => onLabelChange(event.target.value)} placeholder="Libellé" value={label} />
        <input inputMode="decimal" onChange={(event) => onAmountChange(event.target.value)} placeholder="Montant" value={amount} />
        <div className="button-row">
          <button className="primary-button" onClick={onAddExpense} type="button">
            {editingTransactionId ? 'Enregistrer l’opération' : 'Ajouter la dépense'}
          </button>
          {editingTransactionId ? (
            <button className="secondary-button" onClick={onCancelEdit} type="button">Annuler</button>
          ) : null}
        </div>
      </Panel>
      <Panel title="Historique">
        {transactions.map((transaction) => (
          <div className="record-card" key={transaction.id}>
            <InfoRow
              helper={`${transaction.kind} · ${transaction.date}`}
              label={transaction.label}
              value={currencyFormatter.format(transaction.amount)}
            />
            {transaction.invoiceId ? (
              <p className="muted-note">Encaissement lié à une facture, à modifier depuis la facture.</p>
            ) : (
              <div className="button-row">
                <button className="secondary-button" onClick={() => onEdit(transaction)} type="button">Modifier</button>
                <button className="danger-button" onClick={() => onDelete(transaction)} type="button">Supprimer</button>
              </div>
            )}
          </div>
        ))}
      </Panel>
    </section>
  );
}

function DataView({
  notice,
  onExport,
  onImport,
  onReset,
}: {
  notice: { tone: 'ok' | 'error'; text: string } | null;
  onExport: () => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  onReset: () => void;
}) {
  return (
    <section className="details-stack single">
      <Panel title="Sauvegarde">
        <p className="muted-note">
          Tes données ne quittent pas cet appareil. Exporte-les régulièrement : si le navigateur efface
          ses données de site, FreePilot repart de zéro.
        </p>
        <button className="primary-button" onClick={onExport} type="button">
          Exporter mes données
        </button>
        <label className="file-button">
          Importer une sauvegarde
          <input accept="application/json,.json" onChange={(event) => void onImport(event)} type="file" />
        </label>
        {notice ? (
          <p className={notice.tone === 'error' ? 'notice-error' : 'notice-ok'} role="status">
            {notice.text}
          </p>
        ) : null}
      </Panel>

      <Panel title="Réinitialisation">
        <p className="muted-note">Efface tout le contenu local et repart des données de démonstration.</p>
        <button className="danger-button" onClick={onReset} type="button">
          Effacer les données
        </button>
      </Panel>
    </section>
  );
}

function Panel({ children, title }: { children: ReactNode; title: string }) {
  return (
    <article className="panel">
      <h2>{title}</h2>
      {children}
    </article>
  );
}

function InfoRow({ helper, label, value }: { helper?: string | null; label: string; value: string }) {
  return (
    <div className="info-row">
      <div>
        <span>{label}</span>
        {helper ? <p>{helper}</p> : null}
      </div>
      <strong>{value}</strong>
    </div>
  );
}
