import type { Account, ChargeScope, RecurringCharge, RecurringChargeTotals } from '@freepilot/finance-core';
import { useState } from 'react';
import { EmptyState, InfoRow, Panel } from '../components/Panel';
import { formatCurrency, parseAmount } from '../format';

type Props = {
  accounts: Account[];
  charges: RecurringCharge[];
  totals: RecurringChargeTotals;
  onAdd: (input: {
    label: string;
    amount: number;
    scope: ChargeScope;
    dayOfMonth: number | null;
    paymentAccountId: string | null;
  }) => void;
  onToggle: (charge: RecurringCharge) => void;
  onDelete: (charge: RecurringCharge) => void;
  onSetPaymentAccount: (charge: RecurringCharge, paymentAccountId: string) => void;
};

const scopeLabels: Record<ChargeScope, string> = {
  professional: 'Pro',
  personal: 'Perso',
};

/** Compte débité par défaut quand la charge n'en désigne aucun. */
const defaultAccountId = (accounts: Account[], scope: ChargeScope): string => {
  const kind = scope === 'professional' ? 'professional' : 'personal';

  return (accounts.find((account) => account.kind === kind) ?? accounts[0])?.id ?? '';
};

export function RecurringChargesView({
  accounts,
  charges,
  totals,
  onAdd,
  onDelete,
  onSetPaymentAccount,
  onToggle,
}: Props) {
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [scope, setScope] = useState<ChargeScope>('personal');
  const [dayOfMonth, setDayOfMonth] = useState('');
  const [paymentAccountId, setPaymentAccountId] = useState('');

  const submit = () => {
    const parsedAmount = parseAmount(amount);
    if (!label.trim() || !parsedAmount) return;

    const parsedDay = Number(dayOfMonth);
    onAdd({
      label,
      amount: parsedAmount,
      scope,
      dayOfMonth: Number.isInteger(parsedDay) && parsedDay >= 1 && parsedDay <= 31 ? parsedDay : null,
      paymentAccountId: paymentAccountId || defaultAccountId(accounts, scope),
    });

    setLabel('');
    setAmount('');
    setDayOfMonth('');
    setPaymentAccountId('');
  };

  return (
    <section className="details-stack single">
      <Panel title="Total mensuel">
        <InfoRow label="Charges pro" value={formatCurrency(totals.professional)} />
        <InfoRow label="Charges perso" value={formatCurrency(totals.personal)} />
        <InfoRow label="Total" value={formatCurrency(totals.total)} />
        <p className="muted-note">
          Chaque charge active engendre son opération à la date de prélèvement, sur le compte pro ou perso
          selon son rattachement : les soldes affichés tiennent donc compte des charges. Sans jour renseigné,
          l’échéance est posée le 1er.
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
        {/* Le rattachement dit la nature de la charge, le compte dit d'où part
            l'argent : un abonnement pro peut très bien être prélevé sur le perso. */}
        <label htmlFor="charge-account">Compte prélevé</label>
        <select
          id="charge-account"
          onChange={(event) => setPaymentAccountId(event.target.value)}
          value={paymentAccountId || defaultAccountId(accounts, scope)}
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
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
              <div className="charge-row" key={charge.id}>
                <span className="charge-label">
                  <strong>{charge.label}</strong>{' '}
                  <span>
                    {[scopeLabels[charge.scope], charge.dayOfMonth ? `le ${charge.dayOfMonth}` : null, charge.active ? null : 'suspendue']
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <strong className="charge-amount">{formatCurrency(charge.amount)}</strong>
                {/* Libellés courts pour tenir sur la ligne ; le sens complet est dans l'aria-label. */}
                <span className="charge-actions">
                  <select
                    aria-label={`Compte prélevé pour ${charge.label}`}
                    className="row-select"
                    onChange={(event) => onSetPaymentAccount(charge, event.target.value)}
                    value={charge.paymentAccountId || defaultAccountId(accounts, charge.scope)}
                  >
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                  <button
                    aria-label={`${charge.active ? 'Suspendre' : 'Réactiver'} ${charge.label}`}
                    className="mini-button"
                    onClick={() => onToggle(charge)}
                    type="button"
                  >
                    {charge.active ? 'Pause' : 'Activer'}
                  </button>
                  <button
                    aria-label={`Supprimer ${charge.label}`}
                    className="mini-button danger"
                    onClick={() => onDelete(charge)}
                    type="button"
                  >
                    Suppr.
                  </button>
                </span>
              </div>
            ))
        )}
      </Panel>
    </section>
  );
}
