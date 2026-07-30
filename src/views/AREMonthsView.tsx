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
        <div className="field-grid">
          <input
            aria-label="Mois"
            id="are-month"
            onChange={(event) => setMonth(event.target.value)}
            type="month"
            value={month}
          />
          <input
            aria-label="ARE pleine notifiée"
            inputMode="decimal"
            onChange={(event) => setFullARE(event.target.value)}
            placeholder="ARE pleine"
            value={fullARE}
          />
          <input
            aria-label="ARE versée"
            inputMode="decimal"
            onChange={(event) => setActualARE(event.target.value)}
            placeholder="ARE versée"
            value={actualARE}
          />
          <button className="primary-button" onClick={submit} type="button">
            Enregistrer
          </button>
        </div>
      </Panel>

      <Panel title="Mois renseignés">
        {entries.length === 0 ? (
          <EmptyState>Aucun mois renseigné : les estimations d’ARE resteront à zéro.</EmptyState>
        ) : (
          [...entries]
            .sort((left, right) => right.month.localeCompare(left.month))
            .map((entry) => (
              <div className="charge-row" key={entry.month}>
                <span className="charge-label">
                  <strong>{formatMonthLabel(entry.month)}</strong>{' '}
                  <span>
                    {entry.actualARE === null ? 'versée non renseignée' : `versée ${formatCurrency(entry.actualARE)}`}
                  </span>
                </span>
                <strong className="charge-amount">{formatCurrency(entry.fullMonthlyARE)}</strong>
                <span className="charge-actions">
                  <button
                    aria-label={`Modifier ${formatMonthLabel(entry.month)}`}
                    className="mini-button"
                    onClick={() => edit(entry)}
                    type="button"
                  >
                    Modif.
                  </button>
                  <button
                    aria-label={`Supprimer ${formatMonthLabel(entry.month)}`}
                    className="mini-button danger"
                    onClick={() => onDelete(entry.month)}
                    type="button"
                  >
                    Suppr.
                  </button>
                </span>
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
                helper={`théorique ${formatCurrency(cashflow.theoreticalARE.value)} · reporté ${formatCurrency(cashflow.carriedDeduction)} · ${formatDays(cashflow.areDaysConsumed)} consommés`}
                label={formatMonthLabel(cashflow.month)}
                value={formatCurrency(cashflow.effectiveARE)}
              />
            </div>
          ))
        )}
      </Panel>
    </section>
  );
}
