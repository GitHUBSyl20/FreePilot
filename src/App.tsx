import { defaultSettings, getDashboardMock } from './ui/dashboardMock';

const currencyFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
});

const dashboard = getDashboardMock();

const secondaryKpis = [
  { label: 'CA encaissé', value: dashboard.kpis.caEncaisse, helper: 'Paiements reçus ce mois-ci' },
  { label: 'Factures à encaisser', value: dashboard.kpis.facturesImpayees, helper: 'Envoyées ou en retard' },
  { label: 'ARE estimée M+1', value: dashboard.kpis.areEstimeeM1, helper: 'Après déduction France Travail' },
  { label: 'Seuil coupure ARE', value: dashboard.kpis.seuilCoupureARE, helper: 'CA encaissé avant ARE à 0 €' },
];

export const App = () => (
  <main className="phone-shell">
    <header className="top-bar">
      <div>
        <p className="eyebrow">FreePilot</p>
        <h1>Mai 2026</h1>
      </div>
      <button className="icon-button" type="button" aria-label="Ouvrir les réglages">
        FP
      </button>
    </header>

    <section className="balance-card" aria-labelledby="net-disponible-title">
      <span>Net disponible estimé</span>
      <strong id="net-disponible-title">{currencyFormatter.format(dashboard.kpis.netDisponible)}</strong>
      <p>Après Urssaf, impôt prudent, dépenses pro et virements déjà faits.</p>
    </section>

    <nav className="quick-actions" aria-label="Actions rapides">
      <button type="button">Ajouter facture</button>
      <button type="button">Saisir dépense</button>
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
      <article className="panel">
        <h2>Hypothèses ARE</h2>
        <dl>
          <div>
            <dt>Montant journalier</dt>
            <dd>{currencyFormatter.format(defaultSettings.areDailyAmount)}</dd>
          </div>
          <div>
            <dt>Jours théoriques</dt>
            <dd>{defaultSettings.theoreticalMonthlyDays}</dd>
          </div>
          <div>
            <dt>Abattement micro-BNC</dt>
            <dd>{defaultSettings.bncAbatementRate}%</dd>
          </div>
        </dl>
      </article>

      <article className="panel">
        <h2>Formules</h2>
        <div className="formula-row">
          <span>ARE</span>
          <code>{dashboard.formulas.are}</code>
        </div>
        <div className="formula-row">
          <span>Net disponible</span>
          <code>{dashboard.formulas.net}</code>
        </div>
      </article>
    </section>
  </main>
);
