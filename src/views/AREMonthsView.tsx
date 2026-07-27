import type { MonthlyAREEntry, MonthlyCashflow } from '@freepilot/finance-core';
import { useState } from 'react';
import { EmptyState, InfoRow, Panel } from '../components/Panel';
import { formatCurrency, formatDays, formatMonthLabel, parseAmount } from '../format';

type Props = {
  entries: MonthlyAREEntry[];
  series: MonthlyCashflow[];
  currentMonth: string;
  onSave: (input: { month: string; fullMonthlyARE: number; actualARE: number | null }) => void;
  onDelete: (month: string) => void;
};

export function AREMonthsView({ currentMonth, entries, onDelete, onSave, series }: Props) {
  const [month, setMonth] = useState(currentMonth);
  const [fullARE, setFullARE] = useState('');
  const [actualARE, setActualARE] = useState('');

  const submit = () => {
    const parsedFull = parseAmount(fullARE);
    if (!parsedFull) return;

    const trimmedActual = actualARE.trim();
    onSave({
      month,
      fullMonthlyARE: parsedFull,
      actualARE: trimmedActual === '' ? null : parseAmount(trimmedActual),
    });

    setFullARE('');
    setActualARE('');
  };

  const edit = (entry: MonthlyAREEntry) => {
    setMonth(entry.month);
    setFullARE(String(entry.fullMonthlyARE));
    setActualARE(entry.actualARE === null ? '' : String(entry.actualARE));
  };

  return (
    <section className="details-stack single">
      <Panel title="Saisir l’ARE d’un mois">
        <p className="muted-note">
          L’ARE pleine est le montant notifié par France Travail avant déduction. Elle est révisée dans le temps,
          d’où une saisie mois par mois. L’ARE versée se renseigne une fois le paiement reçu : c’est elle qui
          décompte tes jours de droits.
        </p>
        <label htmlFor="are-month">Mois</label>
        <input id="are-month" onChange={(event) => setMonth(event.target.value)} type="month" value={month} />
        <input
          inputMode="decimal"
          onChange={(event) => setFullARE(event.target.value)}
          placeholder="ARE pleine notifiée"
          value={fullARE}
        />
        <input
          inputMode="decimal"
          onChange={(event) => setActualARE(event.target.value)}
          placeholder="ARE versée (optionnel)"
          value={actualARE}
        />
        <button className="primary-button" onClick={submit} type="button">
          Enregistrer le mois
        </button>
      </Panel>

      <Panel title="Mois renseignés">
        {entries.length === 0 ? (
          <EmptyState>Aucun mois renseigné : les estimations d’ARE resteront à zéro.</EmptyState>
        ) : (
          [...entries]
            .sort((left, right) => right.month.localeCompare(left.month))
            .map((entry) => (
              <div className="record-card" key={entry.month}>
                <InfoRow
                  helper={entry.actualARE === null ? 'ARE versée non renseignée' : `Versée : ${formatCurrency(entry.actualARE)}`}
                  label={formatMonthLabel(entry.month)}
                  value={formatCurrency(entry.fullMonthlyARE)}
                />
                <div className="button-row">
                  <button className="secondary-button" onClick={() => edit(entry)} type="button">
                    Modifier
                  </button>
                  <button className="danger-button" onClick={() => onDelete(entry.month)} type="button">
                    Supprimer
                  </button>
                </div>
              </div>
            ))
        )}
      </Panel>

      <Panel title="Enchaînement calculé">
        {series.length === 0 ? (
          <EmptyState>Rien à projeter pour l’instant.</EmptyState>
        ) : (
          [...series].reverse().map((cashflow) => (
            <div className="record-card" key={cashflow.month}>
              <InfoRow
                helper={`ARE théorique ${formatCurrency(cashflow.theoreticalARE.value)} · déduction reportée ${formatCurrency(cashflow.carriedDeduction)}`}
                label={formatMonthLabel(cashflow.month)}
                value={formatCurrency(cashflow.effectiveARE)}
              />
              <p className="muted-note">
                CA {formatCurrency(cashflow.collectedRevenue)} → déduction {formatCurrency(cashflow.areDeduction.value)} sur le mois suivant ·
                {' '}{formatDays(cashflow.areDaysConsumed)} consommés
              </p>
            </div>
          ))
        )}
      </Panel>
    </section>
  );
}
