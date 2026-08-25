import {
  AccountBalance,
  EditableInvoice,
  FinanceData,
  Transaction,
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
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { mobileFinanceStore } from './localFinanceStore';

type Screen = 'dashboard' | 'accounts' | 'invoices' | 'transactions';

const currencyFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
});

const today = () => new Date().toISOString().slice(0, 10);

const parseAmount = (value: string): number => Number(value.replace(',', '.')) || 0;

export default function App() {
  const [data, setData] = useState<FinanceData | null>(null);
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [invoiceClient, setInvoiceClient] = useState('');
  const [invoiceAmount, setInvoiceAmount] = useState('');
  const [expenseLabel, setExpenseLabel] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferFrom, setTransferFrom] = useState('');
  const [transferTo, setTransferTo] = useState('');
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);

  useEffect(() => {
    void loadOrSeedFinanceData(mobileFinanceStore).then((loaded) => {
      setData(loaded);
      setTransferFrom(getProfessionalAccount(loaded)?.id ?? '');
      setTransferTo(loaded.accounts.find((account) => account.kind === 'personal')?.id ?? '');
    });
  }, []);

  const dashboard = useMemo(() => (data ? projectDashboard(data, getCurrentMonth()) : null), [data]);

  const saveData = (nextData: FinanceData) => {
    setData(nextData);
    void mobileFinanceStore.save(nextData);
  };

  if (!data || !dashboard) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loading}>
          <Text style={styles.loadingText}>Chargement de FreePilot...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const professionalAccountId = getProfessionalAccount(data)?.id;

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
    setScreen('invoices');
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
    Alert.alert(
      'Effacer les données ?',
      'Toutes les données locales seront supprimées et remplacées par les données de démo.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Effacer',
          style: 'destructive',
          onPress: () => {
            void resetFinanceData(mobileFinanceStore).then((resetData) => {
              setData(resetData);
              setTransferFrom(getProfessionalAccount(resetData)?.id ?? '');
              setTransferTo(resetData.accounts.find((account) => account.kind === 'personal')?.id ?? '');
              setScreen('dashboard');
            });
          },
        },
      ],
    );
  };

  const handleEditInvoice = (invoice: EditableInvoice) => {
    setEditingInvoiceId(invoice.id);
    setInvoiceClient(invoice.clientName);
    setInvoiceAmount(String(invoice.totalTTC));
    setScreen('invoices');
  };

  const handleCancelInvoiceEdit = () => {
    setEditingInvoiceId(null);
    setInvoiceClient('');
    setInvoiceAmount('');
  };

  const handleDeleteInvoice = (invoice: EditableInvoice) => {
    Alert.alert('Supprimer la facture ?', `Supprimer la facture de ${invoice.clientName} ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          saveData(deleteInvoice(data, invoice.id));
          if (editingInvoiceId === invoice.id) handleCancelInvoiceEdit();
        },
      },
    ]);
  };

  const handleEditTransaction = (transaction: Transaction) => {
    setEditingTransactionId(transaction.id);
    setExpenseLabel(transaction.label);
    setExpenseAmount(String(transaction.amount));
    setScreen('transactions');
  };

  const handleCancelTransactionEdit = () => {
    setEditingTransactionId(null);
    setExpenseLabel('');
    setExpenseAmount('');
  };

  const handleDeleteTransaction = (transaction: Transaction) => {
    Alert.alert('Supprimer l’opération ?', `Supprimer "${transaction.label}" ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          saveData(deleteTransaction(data, transaction.id));
          if (editingTransactionId === transaction.id) handleCancelTransactionEdit();
        },
      },
    ]);
  };

  const unpaidInvoices = data.invoices.filter((invoice) => invoice.status !== 'paid' && invoice.status !== 'cancelled');

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topBar}>
          <View>
            <Text style={styles.eyebrow}>FreePilot</Text>
            <Text style={styles.title}>Mai 2026</Text>
          </View>
          <View style={styles.headerActions}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Local</Text>
            </View>
            <Pressable onPress={handleResetData} style={styles.dangerButton}>
              <Text style={styles.dangerButtonText}>Effacer</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.tabs}>
          {([
            ['dashboard', 'Accueil'],
            ['accounts', 'Comptes'],
            ['invoices', 'Factures'],
            ['transactions', 'Opérations'],
          ] as const).map(([id, label]) => (
            <Pressable
              accessibilityRole="button"
              key={id}
              onPress={() => setScreen(id)}
              style={[styles.tab, screen === id && styles.tabActive]}
            >
              <Text style={[styles.tabText, screen === id && styles.tabTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {screen === 'dashboard' ? (
          <DashboardScreen
            accountBalances={dashboard.accountBalances}
            invoices={unpaidInvoices}
            kpis={dashboard.kpis}
            onAddExpense={() => setScreen('transactions')}
            onAddInvoice={() => setScreen('invoices')}
            recentTransactions={dashboard.recentTransactions}
          />
        ) : null}

        {screen === 'accounts' ? (
          <AccountsScreen
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

        {screen === 'invoices' ? (
          <InvoicesScreen
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

        {screen === 'transactions' ? (
          <TransactionsScreen
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
      </ScrollView>
    </SafeAreaView>
  );
}

function DashboardScreen({
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
  // Les valeurs sont mises en forme ici : l'ARE M+1 peut ne pas être un
  // montant, et un formateur monétaire n'a rien à dire d'une donnée absente.
  const secondaryKpis = [
    { label: 'CA encaissé', value: currencyFormatter.format(kpis.caEncaisse), helper: 'Paiements reçus ce mois-ci' },
    {
      label: 'Factures à encaisser',
      value: currencyFormatter.format(kpis.facturesImpayees),
      helper: `${invoices.length} facture(s) ouvertes`,
    },
    {
      label: 'ARE estimée M+1',
      value: kpis.areEstimeeM1 === null ? 'À renseigner' : currencyFormatter.format(kpis.areEstimeeM1),
      helper: kpis.areEstimeeM1 === null ? 'ARE pleine du mois suivant non saisie' : 'Après déduction France Travail',
    },
    {
      label: 'Seuil coupure ARE',
      value: currencyFormatter.format(kpis.seuilCoupureARE),
      helper: 'CA encaissé avant ARE à 0 €',
    },
  ];

  return (
    <>
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Net disponible estimé</Text>
        <Text style={styles.balanceValue}>{currencyFormatter.format(kpis.resteAVivre)}</Text>
        <Text style={styles.balanceHelper}>Calculé depuis les factures payées, dépenses et virements locaux.</Text>
      </View>

      <View style={styles.quickActions}>
        <Pressable onPress={onAddInvoice} style={styles.actionButton}>
          <Text style={styles.actionButtonText}>Ajouter facture</Text>
        </Pressable>
        <Pressable onPress={onAddExpense} style={styles.actionButton}>
          <Text style={styles.actionButtonText}>Saisir dépense</Text>
        </Pressable>
      </View>

      <View style={styles.cardGrid}>
        {secondaryKpis.map((kpi) => (
          <View style={styles.kpiRow} key={kpi.label}>
            <View style={styles.kpiText}>
              <Text style={styles.kpiLabel}>{kpi.label}</Text>
              <Text style={styles.kpiHelper}>{kpi.helper}</Text>
            </View>
            <Text style={styles.kpiValue}>{kpi.value}</Text>
          </View>
        ))}
      </View>

      <Section title="Comptes">
        {accountBalances.map((account) => (
          <Row key={account.id} label={account.name} value={currencyFormatter.format(account.balance)} />
        ))}
      </Section>

      <Section title="Dernières opérations">
        {recentTransactions.map((transaction) => (
          <Row
            helper={transaction.date}
            key={transaction.id}
            label={transaction.label}
            value={currencyFormatter.format(transaction.amount)}
          />
        ))}
      </Section>
    </>
  );
}

function AccountsScreen({
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
    <>
      <Section title="Soldes">
        {accounts.map((account) => (
          <Row helper={account.kind} key={account.id} label={account.name} value={currencyFormatter.format(account.balance)} />
        ))}
      </Section>

      <Section title="Virement entre comptes">
        <Text style={styles.fieldLabel}>Depuis</Text>
        <AccountSelector accounts={accounts} selectedId={fromAccountId} onSelect={onFromChange} />
        <Text style={styles.fieldLabel}>Vers</Text>
        <AccountSelector accounts={accounts} selectedId={toAccountId} onSelect={onToChange} />
        <TextInput
          inputMode="decimal"
          onChangeText={onAmountChange}
          placeholder="Montant"
          style={styles.input}
          value={amount}
        />
        <Pressable onPress={onSubmit} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Créer le virement</Text>
        </Pressable>
      </Section>
    </>
  );
}

function InvoicesScreen({
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
    <>
      <Section title={editingInvoiceId ? 'Modifier la facture' : 'Nouvelle facture'}>
        <TextInput onChangeText={onClientChange} placeholder="Client" style={styles.input} value={client} />
        <TextInput
          inputMode="decimal"
          onChangeText={onAmountChange}
          placeholder="Montant TTC"
          style={styles.input}
          value={amount}
        />
        <Pressable onPress={onCreate} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>
            {editingInvoiceId ? 'Enregistrer la facture' : 'Ajouter la facture'}
          </Text>
        </Pressable>
        {editingInvoiceId ? (
          <Pressable onPress={onCancelEdit} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Annuler</Text>
          </Pressable>
        ) : null}
      </Section>

      <Section title="Factures">
        {invoices.map((invoice) => (
          <View key={invoice.id} style={styles.invoiceRow}>
            <Row
              helper={invoice.status === 'paid' ? `Payée le ${invoice.paymentDate}` : `Émise le ${invoice.issueDate}`}
              label={invoice.clientName}
              value={currencyFormatter.format(invoice.totalTTC)}
            />
            {invoice.status !== 'paid' && professionalAccount ? (
              <Pressable onPress={() => onMarkPaid(invoice)} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Marquer payée</Text>
              </Pressable>
            ) : null}
            <View style={styles.recordActions}>
              <Pressable onPress={() => onEdit(invoice)} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Modifier</Text>
              </Pressable>
              <Pressable onPress={() => onDelete(invoice)} style={styles.deleteButton}>
                <Text style={styles.deleteButtonText}>Supprimer</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </Section>
    </>
  );
}

function TransactionsScreen({
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
    <>
      <Section title={editingTransactionId ? 'Modifier l’opération' : 'Nouvelle dépense pro'}>
        <TextInput onChangeText={onLabelChange} placeholder="Libellé" style={styles.input} value={label} />
        <TextInput
          inputMode="decimal"
          onChangeText={onAmountChange}
          placeholder="Montant"
          style={styles.input}
          value={amount}
        />
        <Pressable onPress={onAddExpense} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>
            {editingTransactionId ? 'Enregistrer l’opération' : 'Ajouter la dépense'}
          </Text>
        </Pressable>
        {editingTransactionId ? (
          <Pressable onPress={onCancelEdit} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Annuler</Text>
          </Pressable>
        ) : null}
      </Section>

      <Section title="Historique">
        {transactions.map((transaction) => (
          <View key={transaction.id} style={styles.invoiceRow}>
            <Row
              helper={`${transaction.kind} · ${transaction.date}`}
              label={transaction.label}
              value={currencyFormatter.format(transaction.amount)}
            />
            {transaction.invoiceId ? (
              <Text style={styles.mutedNote}>Encaissement lié à une facture, à modifier depuis la facture.</Text>
            ) : (
              <View style={styles.recordActions}>
                <Pressable onPress={() => onEdit(transaction)} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Modifier</Text>
                </Pressable>
                <Pressable onPress={() => onDelete(transaction)} style={styles.deleteButton}>
                  <Text style={styles.deleteButtonText}>Supprimer</Text>
                </Pressable>
              </View>
            )}
          </View>
        ))}
      </Section>
    </>
  );
}

function Section({ children, title }: { children: ReactNode; title: string }) {
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ helper, label, value }: { helper?: string | null; label: string; value: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {helper ? <Text style={styles.rowHelper}>{helper}</Text> : null}
      </View>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function AccountSelector({
  accounts,
  onSelect,
  selectedId,
}: {
  accounts: AccountBalance[];
  onSelect: (value: string) => void;
  selectedId: string;
}) {
  return (
    <View style={styles.selector}>
      {accounts.map((account) => (
        <Pressable
          key={account.id}
          onPress={() => onSelect(account.id)}
          style={[styles.selectorItem, selectedId === account.id && styles.selectorItemActive]}
        >
          <Text style={[styles.selectorText, selectedId === account.id && styles.selectorTextActive]}>
            {account.name}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#eef2ff',
  },
  loading: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  loadingText: {
    color: '#334155',
    fontWeight: '700',
  },
  content: {
    gap: 16,
    padding: 20,
    paddingBottom: 36,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  eyebrow: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: {
    color: '#0f172a',
    fontSize: 32,
    fontWeight: '800',
  },
  badge: {
    backgroundColor: '#dcfce7',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  headerActions: {
    alignItems: 'flex-end',
    gap: 8,
  },
  badgeText: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '900',
  },
  dangerButton: {
    backgroundColor: '#fee2e2',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dangerButtonText: {
    color: '#991b1b',
    fontSize: 12,
    fontWeight: '900',
  },
  tabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tab: {
    backgroundColor: '#ffffff',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  tabActive: {
    backgroundColor: '#111827',
  },
  tabText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '800',
  },
  tabTextActive: {
    color: '#ffffff',
  },
  balanceCard: {
    backgroundColor: '#111827',
    borderRadius: 28,
    elevation: 8,
    padding: 24,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
  },
  balanceLabel: {
    color: '#c7d2fe',
    fontSize: 14,
    fontWeight: '700',
  },
  balanceValue: {
    color: '#ffffff',
    fontSize: 36,
    fontWeight: '900',
    marginTop: 8,
  },
  balanceHelper: {
    color: '#dbeafe',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    alignItems: 'center',
    backgroundColor: '#4f46e5',
    borderRadius: 18,
    flex: 1,
    paddingVertical: 14,
  },
  actionButtonText: {
    color: '#ffffff',
    fontWeight: '800',
  },
  cardGrid: {
    gap: 12,
  },
  kpiRow: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 22,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 18,
  },
  kpiText: {
    flex: 1,
    paddingRight: 12,
  },
  kpiLabel: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '800',
  },
  kpiHelper: {
    color: '#64748b',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  kpiValue: {
    color: '#0f172a',
    fontSize: 17,
    fontWeight: '900',
  },
  panel: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    gap: 12,
    padding: 18,
  },
  panelTitle: {
    color: '#0f172a',
    fontSize: 20,
    fontWeight: '900',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 14,
  },
  rowText: {
    flex: 1,
  },
  rowLabel: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '800',
  },
  rowHelper: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 3,
  },
  rowValue: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '900',
  },
  invoiceRow: {
    gap: 10,
  },
  recordActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  fieldLabel: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '800',
  },
  input: {
    backgroundColor: '#f8fafc',
    borderColor: '#dbe3ef',
    borderRadius: 16,
    borderWidth: 1,
    color: '#0f172a',
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#4f46e5',
    borderRadius: 16,
    paddingVertical: 14,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '900',
  },
  secondaryButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#eef2ff',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  secondaryButtonText: {
    color: '#4338ca',
    fontWeight: '900',
  },
  deleteButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#fee2e2',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  deleteButtonText: {
    color: '#991b1b',
    fontWeight: '900',
  },
  mutedNote: {
    color: '#64748b',
    fontSize: 12,
    lineHeight: 18,
  },
  selector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  selectorItem: {
    backgroundColor: '#f8fafc',
    borderColor: '#dbe3ef',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  selectorItemActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  selectorText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '800',
  },
  selectorTextActive: {
    color: '#ffffff',
  },
});
