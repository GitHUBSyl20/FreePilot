import type { ChargeScope, RecurringCharge, RecurringChargeTotals } from '@freepilot/finance-core';
import { useState } from 'react';
import { EmptyState, InfoRow, Panel } from '../components/Panel';
import { formatCurrency, parseAmount } from '../format';

type Props = {
  charges: RecurringCharge[];
  totals: RecurringChargeTotals;
  onAdd: (input: { label: string; amount: number; scope: ChargeScope; dayOfMonth: number | null }) => void;
  onToggle: (charge: RecurringCharge) => void;
  onDelete: (charge: RecurringCharge) => void;
};

const scopeLabels: Record<ChargeScope, string> = {
  professional: 'Pro',
  personal: 'Perso',
};

export function RecurringChargesView({ charges, totals, onAdd, onDelete, onToggle }: Props) {
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [scope, setScope] = useState<ChargeScope>('personal');
  const [dayOfMonth, setDayOfMonth] = useState('');

  const submit = () => {
    const parsedAmount = parseAmount(amount);
    if (!label.trim() || !parsedAmount) return;

    const parsedDay = Number(dayOfMonth);
    onAdd({
      label,
      amount: parsedAmount,
      scope,
      dayOfMonth: Number.isInteger(parsedDay) && parsedDay >= 1 && parsedDay <= 31 ? parsedDay : null,
    });

    setLabel('');
    setAmount('');
    setDayOfMonth('');
  };

  return (
    <section className="details-stack single">
      <Panel title="Total mensuel">
        <InfoRow label="Charges pro" value={formatCurrency(totals.professional)} />
        <InfoRow label="Charges perso" value={formatCurrency(totals.personal)} />
        <InfoRow label="Total" value={formatCurrency(totals.total)} />
        <p className="muted-note">
          En micro-BNC ces charges ne réduisent ni l’Urssaf ni l’impôt : l’abattement forfaitaire les remplace.
          Elles pèsent uniquement sur la trésorerie. Ne les saisis pas aussi en dépense ponctuelle, elles
          seraient comptées deux fois.
        </p>
      </Panel>

      <Panel title="Nouvelle charge fixe">
        <input onChange={(event) => setLabel(event.target.value)} placeholder="Libellé" value={label} />
        <input
          inputMode="decimal"
          onChange={(event) => setAmount(event.target.value)}
          placeholder="Montant mensuel"
          value={amount}
        />
        <label htmlFor="charge-scope">Rattachement</label>
        <select id="charge-scope" onChange={(event) => setScope(event.target.value as ChargeScope)} value={scope}>
          <option value="personal">Perso</option>
          <option value="professional">Pro</option>
        </select>
        <input
          inputMode="numeric"
          onChange={(event) => setDayOfMonth(event.target.value)}
          placeholder="Jour de prélèvement (optionnel)"
          value={dayOfMonth}
        />
        <button className="primary-button" onClick={submit} type="button">
          Ajouter la charge
        </button>
      </Panel>

      <Panel title="Charges enregistrées">
        {charges.length === 0 ? (
          <EmptyState>Aucune charge fixe enregistrée.</EmptyState>
        ) : (
          [...charges]
            .sort((left, right) => right.amount - left.amount)
            .map((charge) => (
              <div className="record-card" key={charge.id}>
                <InfoRow
                  helper={[scopeLabels[charge.scope], charge.dayOfMonth ? `le ${charge.dayOfMonth}` : null, charge.active ? null : 'suspendue']
                    .filter(Boolean)
                    .join(' · ')}
                  label={charge.label}
                  value={formatCurrency(charge.amount)}
                />
                <div className="button-row">
                  <button className="secondary-button" onClick={() => onToggle(charge)} type="button">
                    {charge.active ? 'Suspendre' : 'Réactiver'}
                  </button>
                  <button className="danger-button" onClick={() => onDelete(charge)} type="button">
                    Supprimer
                  </button>
                </div>
              </div>
            ))
        )}
      </Panel>
    </section>
  );
}
