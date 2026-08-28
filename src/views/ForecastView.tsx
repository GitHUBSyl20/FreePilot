import type { ForecastMonth } from '@freepilot/finance-core';
import { EmptyState, Panel } from '../components/Panel';
import { formatCurrency, formatMonthLabel } from '../format';

type Props = {
  months: ForecastMonth[];
  /** Total des factures émises, pas encore payées, sans échéance saisie : exclu de `months`. */
  facturesSansEcheance: number;
};

/**
 * D'où sort le CA d'un mois : les trois sources ne se recouvrent jamais
 * (une facture émise n'est plus une affaire « ouverte » côté CRM), donc leur
 * somme se lit sans double compte. Un mois sans aucune des trois ne renvoie
 * rien à afficher plutôt qu'une liste vide encombrante.
 */
const revenueSources = (month: ForecastMonth): string => {
  const parts: string[] = [];
  if (month.facturesEnAttente > 0) parts.push(`factures ${formatCurrency(month.facturesEnAttente)}`);
  if (month.pipelinePondere > 0) parts.push(`pipeline ${formatCurrency(month.pipelinePondere)}`);
  if (month.mrrPrevisionnel > 0) parts.push(`MRR ${formatCurrency(month.mrrPrevisionnel)}`);
  return parts.join(' + ');
};

/**
 * Timeline horizontale, une carte par mois, à faire défiler au doigt ou à la
 * molette : le reste à vivre projeté (barre) et la trésorerie cumulée qui en
 * découle. Une facture émise compte comme CA dès le mois courant (principe du
 * prévisionnel, différent du tableau de bord) ; les mois futurs ajoutent en
 * plus le pipeline pondéré et le MRR. Charges fixes constantes et ARE
 * reconduite au-delà — un repère, pas une prédiction exacte, d'où le rappel
 * d'hypothèses et le badge « estimé ».
 */
export function ForecastView({ facturesSansEcheance, months }: Props) {
  if (months.length === 0) {
    return (
      <section className="details-stack single">
        <Panel title="Prévisionnel">
          <EmptyState>Aucune donnée à projeter pour l’instant.</EmptyState>
        </Panel>
      </section>
    );
  }

  // Échelle commune à tous les mois : une barre ne se lit que relativement aux autres.
  const scale = Math.max(...months.map((month) => Math.abs(month.resteAVivre)), 1);

  return (
    <section className="details-stack single">
      <Panel title="Prévisionnel">
        <p className="muted-note">Hypothèses des mois estimés :</p>
        <dl className="forecast-formulas">
          <dt>CA</dt>
          <dd>= factures en attente (échéance, dès le mois courant) + pipeline pondéré CRM + MRR déjà gagné (mois futurs)</dd>
          <dt>ARE</dt>
          <dd>= dernière ARE pleine connue, reconduite</dd>
          <dt>Charges fixes</dt>
          <dd>= identiques à aujourd’hui</dd>
          <dt>Trésorerie cumulée</dt>
          <dd>= solde réel (pro + perso) − Σ déficits des mois négatifs (un mois positif est vécu, pas épargné)</dd>
        </dl>

        {facturesSansEcheance > 0 ? (
          <aside className="pwa-banner" role="status">
            <p>
              {formatCurrency(facturesSansEcheance)} de factures en attente n’ont pas d’échéance renseignée : elles ne
              sont comptées sur aucun mois ci-dessous. Ajoute une échéance dans l’onglet Factures pour les inclure.
            </p>
          </aside>
        ) : null}

        <div className="forecast-timeline" role="list" aria-label="Prévisionnel mois par mois">
          {months.map((month) => {
            const sources = revenueSources(month);
            const barHeight = Math.max(4, (Math.abs(month.resteAVivre) / scale) * 100);

            return (
              <div className="forecast-card" key={month.month} role="listitem">
                <span className="forecast-card-month">
                  {formatMonthLabel(month.month)}
                  {month.isEstimated ? <span className="badge estimated">estimé</span> : null}
                </span>

                <div className="forecast-card-bar-track">
                  <div
                    className={month.resteAVivre < 0 ? 'forecast-card-bar negative' : 'forecast-card-bar'}
                    style={{ height: `${barHeight}%` }}
                  />
                </div>
                <strong className={month.resteAVivre < 0 ? 'forecast-card-value negative' : 'forecast-card-value'}>
                  {formatCurrency(month.resteAVivre)}
                </strong>
                <span className="forecast-card-caption">reste à vivre</span>

                {sources ? <p className="forecast-card-sources">dont {sources}</p> : null}

                <div className="forecast-card-cash">
                  <span>{month.isEstimated ? 'trésorerie estimée' : 'trésorerie réelle'}</span>
                  <strong>{formatCurrency(month.cumulativeCash)}</strong>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    </section>
  );
}
