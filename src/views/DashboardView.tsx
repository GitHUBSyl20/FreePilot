import type { AppSettings, DashboardProjection } from '@freepilot/finance-core';
import { addMonths } from '@freepilot/finance-core';
import { EmptyState, InfoRow, Panel } from '../components/Panel';
import { formatCurrency, formatDate, formatDays, formatMonthComplement, formatMonthLabel } from '../format';

type Props = {
  projection: DashboardProjection;
  settings: AppSettings;
  onAddInvoice: () => void;
  onAddExpense: () => void;
};

export function DashboardView({ projection, settings, onAddExpense, onAddInvoice }: Props) {
  const { kpis, outlook } = projection;
  const missingARE = outlook.cashflow.theoreticalARE.warnings.length > 0;
  const nextMonth = addMonths(projection.month, 1);

  const indicators = [
    { label: 'CA encaissé', value: formatCurrency(kpis.caEncaisse), helper: 'Factures payées ce mois-ci' },
    { label: 'Factures à encaisser', value: formatCurrency(kpis.facturesImpayees), helper: 'Émises, pas encore payées' },
    { label: 'ARE du mois', value: formatCurrency(kpis.areDuMois), helper: 'Versée si connue, sinon estimée' },
    {
      label: 'ARE estimée M+1',
      value: kpis.areEstimeeM1 === null ? 'À renseigner' : formatCurrency(kpis.areEstimeeM1),
      helper:
        kpis.areEstimeeM1 === null
          ? `ARE pleine ${formatMonthComplement(nextMonth)} non saisie, onglet ARE`
          : 'Après déduction du CA de ce mois',
    },
    { label: 'Trésorerie du mois', value: formatCurrency(kpis.netFinal), helper: 'CA − Urssaf + ARE' },
    { label: 'Charges fixes', value: formatCurrency(kpis.chargesFixes), helper: 'Pro et perso confondues' },
    { label: 'Seuil coupure ARE', value: formatCurrency(kpis.seuilCoupureARE), helper: 'CA encaissé avant ARE à 0 €' },
    { label: 'Jours ARE restants', value: formatDays(kpis.joursAreRestants), helper: 'Capital de droits non consommés' },
  ];

  return (
    <>
      <section className={kpis.resteAVivre < 0 ? 'balance-card negative' : 'balance-card'}>
        <span>Reste à vivre</span>
        <strong>{formatCurrency(kpis.resteAVivre)}</strong>
        <p>Trésorerie du mois, une fois l’impôt provisionné et toutes les charges payées.</p>
      </section>

      {missingARE ? (
        <aside className="pwa-banner" role="status">
          <p>Aucune ARE renseignée pour ce mois : les estimations sont incomplètes.</p>
        </aside>
      ) : null}

      <nav className="quick-actions" aria-label="Actions rapides">
        <button onClick={onAddInvoice} type="button">Ajouter facture</button>
        <button onClick={onAddExpense} type="button">Saisir dépense</button>
      </nav>

      <section className="kpi-list" aria-label="Indicateurs financiers">
        {indicators.map((indicator) => (
          <article className="kpi-row" key={indicator.label}>
            <div>
              <span>{indicator.label}</span>
              <p>{indicator.helper}</p>
            </div>
            <strong>{indicator.value}</strong>
          </article>
        ))}
      </section>

      <section className="details-stack">
        <Panel title="Paliers de CA">
          <ThresholdGauge
            collectedRevenue={kpis.caEncaisse}
            safety={settings.monthlyRevenueSafetyThreshold}
            takeoff={settings.monthlyRevenueTakeoffThreshold}
          />
        </Panel>

        <Panel collapsible title="Détail du mois">
          <InfoRow label="Urssaf provisionnée" helper={`Payable en ${formatMonthLabel(outlook.cashflow.urssafPaymentMonth).toLowerCase()}`} value={formatCurrency(outlook.cashflow.urssafProvision.value)} />
          <InfoRow label="Impôt provisionné" helper="11 % du revenu après abattement" value={formatCurrency(outlook.cashflow.incomeTaxProvision.value)} />
          <InfoRow label="Charges fixes pro" value={formatCurrency(outlook.recurringCharges.professional)} />
          <InfoRow label="Charges fixes perso" value={formatCurrency(outlook.recurringCharges.personal)} />
          <InfoRow label="Dépenses ponctuelles" value={formatCurrency(outlook.variableExpenses)} />
          {outlook.otherIncome > 0 ? (
            <InfoRow
              label="Encaissements hors CA"
              helper="Ni Urssaf, ni impôt, ni déduction d’ARE"
              value={formatCurrency(outlook.otherIncome)}
            />
          ) : null}
          <InfoRow label="Jours ARE consommés" helper="Sur l’ARE réellement versée" value={formatDays(outlook.cashflow.areDaysConsumed)} />
        </Panel>

        <Panel collapsible title="Comptes">
          {projection.accountBalances.map((account) => (
            <InfoRow helper={account.kind} key={account.id} label={account.name} value={formatCurrency(account.balance)} />
          ))}
        </Panel>

        <Panel collapsible title="Dernières opérations">
          {projection.recentTransactions.length === 0 ? (
            <EmptyState>Aucune opération enregistrée.</EmptyState>
          ) : (
            projection.recentTransactions.map((transaction) => (
              <InfoRow
                helper={formatDate(transaction.date)}
                key={transaction.id}
                label={transaction.label}
                value={formatCurrency(transaction.amount)}
              />
            ))
          )}
        </Panel>
      </section>
    </>
  );
}

function ThresholdGauge({
  collectedRevenue,
  safety,
  takeoff,
}: {
  collectedRevenue: number;
  safety: number;
  takeoff: number;
}) {
  // L'échelle va un peu au-delà du palier haut pour que l'objectif reste lisible
  // une fois atteint.
  const scale = Math.max(takeoff * 1.2, collectedRevenue, 1);
  const percent = (value: number) => `${Math.min(100, (value / scale) * 100)}%`;

  const reached = collectedRevenue >= takeoff ? 'décollage' : collectedRevenue >= safety ? 'sécurité' : 'sous le plancher';

  return (
    <>
      <div className="gauge" role="img" aria-label={`CA encaissé ${collectedRevenue} €, palier ${reached}`}>
        <div className="gauge-fill" style={{ width: percent(collectedRevenue) }} />
        <span className="gauge-marker" style={{ left: percent(safety) }} />
        <span className="gauge-marker takeoff" style={{ left: percent(takeoff) }} />
      </div>
      <InfoRow label="Palier sécurité" helper="Couvre les charges fixes" value={formatCurrency(safety)} />
      <InfoRow label="Palier décollage" helper="Autonomie sans ARE" value={formatCurrency(takeoff)} />
      <p className="muted-note">Situation actuelle : {reached}.</p>
    </>
  );
}
