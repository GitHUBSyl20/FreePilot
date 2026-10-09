import type { AppSettings, DashboardProjection, ForecastMonth } from '@freepilot/finance-core';
import { addMonths, calculateTakeoffThreshold } from '@freepilot/finance-core';
import { InfoRow, Panel } from '../components/Panel';
import { formatCurrency, formatMonthComplement, formatMonthLabel } from '../format';

type Props = {
  projection: DashboardProjection;
  settings: AppSettings;
  /** Mois courant puis mois estimés, déjà calculés par `buildForecastMonths`. */
  forecastMonths: ForecastMonth[];
  onAddInvoice: () => void;
  onAddExpense: () => void;
};

/**
 * L'accueil répond à deux questions, dans cet ordre : combien je peux
 * dépenser ce mois-ci, et où en est mon CA face à l'objectif. Tout le reste
 * vit dans les onglets ou dans le détail repliable.
 */
export function DashboardView({ forecastMonths, projection, settings, onAddExpense, onAddInvoice }: Props) {
  const { kpis, outlook } = projection;
  const missingARE = outlook.cashflow.theoreticalARE.warnings.length > 0;
  const previousMonth = addMonths(projection.month, -1);
  const upcoming = forecastMonths.filter((month) => month.isEstimated).slice(0, 3);

  return (
    <>
      <section className={kpis.resteAVivre < 0 ? 'balance-card negative' : 'balance-card'}>
        <span>Reste à vivre</span>
        <strong>{formatCurrency(kpis.resteAVivre)}</strong>
        <p>Ce que tu peux dépenser ce mois-ci, Urssaf, impôt et charges déjà déduits.</p>
      </section>

      {missingARE ? (
        <aside className="pwa-banner" role="status">
          <p>ARE du mois non renseignée : le reste à vivre est incomplet (onglet ARE).</p>
        </aside>
      ) : null}

      <section className="details-stack">
        <Panel title="CA encaissé ce mois">
          <ThresholdGauge
            collectedRevenue={kpis.caEncaisse}
            safety={settings.monthlyRevenueSafetyThreshold}
            takeoff={calculateTakeoffThreshold(settings).value}
          />
        </Panel>
      </section>

      <section className="kpi-list" aria-label="Indicateurs">
        <article className="kpi-row">
          <div>
            <span>Factures à encaisser</span>
            <p>Émises, pas encore payées</p>
          </div>
          <strong>{formatCurrency(kpis.facturesImpayees)}</strong>
        </article>
        <article className="kpi-row">
          <div>
            <span>Trésorerie disponible</span>
            <p>Comptes pro + perso, hors épargne</p>
          </div>
          <strong>{formatCurrency(kpis.tresorerieDisponible)}</strong>
        </article>
      </section>

      <nav className="quick-actions" aria-label="Actions rapides">
        <button onClick={onAddInvoice} type="button">Ajouter facture</button>
        <button onClick={onAddExpense} type="button">Saisir dépense</button>
      </nav>

      <section className="details-stack">
        <Panel collapsible title="Calcul du reste à vivre">
          <InfoRow label="CA encaissé" value={formatCurrency(kpis.caEncaisse)} />
          <InfoRow label="ARE du mois" helper="Versée si connue, sinon estimée" value={formatCurrency(kpis.areDuMois)} />
          <InfoRow
            label="− Urssaf"
            helper={`Due sur le CA ${formatMonthComplement(previousMonth)}`}
            value={formatCurrency(outlook.cashflow.carriedUrssaf)}
          />
          <InfoRow
            label="− Impôt"
            helper={`Dû sur le CA ${formatMonthComplement(previousMonth)}`}
            value={formatCurrency(outlook.cashflow.carriedIncomeTax)}
          />
          <InfoRow label="− Charges fixes" helper="Pro et perso" value={formatCurrency(outlook.recurringCharges.total)} />
          <InfoRow label="− Dépenses ponctuelles" value={formatCurrency(outlook.variableExpenses)} />
          {outlook.otherIncome > 0 ? (
            <InfoRow label="+ Encaissements hors CA" value={formatCurrency(outlook.otherIncome)} />
          ) : null}
          <p className="muted-note">
            À mettre de côté pour le mois prochain : {formatCurrency(outlook.cashflow.urssafProvision.value)} d’Urssaf et{' '}
            {formatCurrency(outlook.cashflow.incomeTaxProvision.value)} d’impôt sur le CA de ce mois.
          </p>
        </Panel>

        {upcoming.length > 0 ? (
          <Panel title="Mois à venir">
            {upcoming.map((month) => (
              <InfoRow
                helper="Reste à vivre estimé"
                key={month.month}
                label={formatMonthLabel(month.month)}
                value={formatCurrency(month.resteAVivre)}
              />
            ))}
          </Panel>
        ) : null}
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
  const remaining = Math.max(0, takeoff - collectedRevenue);

  return (
    <>
      <p className="gauge-headline">
        <strong>{formatCurrency(collectedRevenue)}</strong> / {formatCurrency(takeoff)}
      </p>
      <div className="gauge" role="img" aria-label={`CA encaissé ${collectedRevenue} €, palier ${reached}`}>
        <div className="gauge-fill" style={{ width: percent(collectedRevenue) }} />
        <span className="gauge-marker" style={{ left: percent(safety) }} />
        <span className="gauge-marker takeoff" style={{ left: percent(takeoff) }} />
      </div>
      <InfoRow label="Palier sécurité" helper="Couvre les charges fixes" value={formatCurrency(safety)} />
      <InfoRow label="Palier décollage" helper="Net après Urssaf et impôt = ton ARE pleine" value={formatCurrency(takeoff)} />
      <p className="muted-note">
        Situation : {reached}
        {remaining > 0 ? ` — encore ${formatCurrency(remaining)} pour décoller.` : '.'}
      </p>
    </>
  );
}
