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
  onUpdate: (
    chargeId: string,
    input: { label: string; amount: number; scope: ChargeScope; dayOfMonth: number | null; paymentAccountId: string },
  ) => void;
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

/**
 * Noms courts pour le sélecteur posé sur la ligne d'une charge : « Compte
 * perso » y pousserait les deux boutons à la ligne suivante et doublerait la
 * hauteur de la liste. Le nom complet reste porté par l'aria-label.
 */
const shortAccountLabels: Record<Account['kind'], string> = {
  professional: 'Pro',
  personal: 'Perso',
  provision: 'Prov.',
  savings: 'Épargne',
};

export function RecurringChargesView({
  accounts,
  charges,
  totals,
  onAdd,
  onDelete,
  onSetPaymentAccount,
  onToggle,
  onUpdate,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [scope, setScope] = useState<ChargeScope>('personal');
  const [dayOfMonth, setDayOfMonth] = useState('');
  const [paymentAccountId, setPaymentAccountId] = useState('');

  const reset = () => {
    setEditingId(null);
    setLabel('');
    setAmount('');
    setDayOfMonth('');
    setPaymentAccountId('');
    setScope('personal');
  };

  const submit = () => {
    const parsedAmount = parseAmount(amount);
    if (!label.trim() || !parsedAmount) return;

    const parsedDay = Number(dayOfMonth);
    const input = {
      label,
      amount: parsedAmount,
      scope,
      dayOfMonth: Number.isInteger(parsedDay) && parsedDay >= 1 && parsedDay <= 31 ? parsedDay : null,
      paymentAccountId: paymentAccountId || defaultAccountId(accounts, scope),
    };

    if (editingId) onUpdate(editingId, input);
    else onAdd(input);

    reset();
  };

  const edit = (charge: RecurringCharge) => {
    setEditingId(charge.id);
    setLabel(charge.label);
    setAmount(String(charge.amount).replace('.', ','));
    setScope(charge.scope);
    setDayOfMonth(charge.dayOfMonth === null ? '' : String(charge.dayOfMonth));
    setPaymentAccountId(charge.paymentAccountId || defaultAccountId(accounts, charge.scope));
  };

  return (
    <section className="details-stack single">
      <Panel title="Total mensuel">
        <InfoRow label="Charges pro" value={formatCurrency(totals.professional)} />
        <InfoRow label="Charges perso" value={formatCurrency(totals.personal)} />
        <InfoRow label="Total" value={formatCurrency(totals.total)} />
        <p className="muted-note">
          Chaque charge active engendre son opération sur le compte prélevé, le jour indiqué ou le 1er.
          Touche le libellé d’une charge pour la modifier.
        </p>
      </Panel>

      <Panel title={editingId ? 'Modifier la charge' : 'Nouvelle charge fixe'}>
        <input aria-label="Libellé" onChange={(event) => setLabel(event.target.value)} placeholder="Libellé" value={label} />
        <div className="field-grid">
          <input
            aria-label="Montant mensuel"
            inputMode="decimal"
            onChange={(event) => setAmount(event.target.value)}
            placeholder="Montant"
            value={amount}
          />
          <input
            aria-label="Jour de prélèvement"
            inputMode="numeric"
            onChange={(event) => setDayOfMonth(event.target.value)}
            placeholder="Jour (option.)"
            value={dayOfMonth}
          />
        </div>
        {/* Le rattachement dit la nature de la charge, le compte dit d'où part
            l'argent : un abonnement pro peut très bien être prélevé sur le perso. */}
        <div className="field-grid">
          <div className="field">
            <label htmlFor="charge-scope">Nature</label>
            <select id="charge-scope" onChange={(event) => setScope(event.target.value as ChargeScope)} value={scope}>
              <option value="personal">Perso</option>
              <option value="professional">Pro</option>
            </select>
          </div>
          <div className="field">
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
          </div>
        </div>
        <div className="button-row">
          <button className="primary-button" onClick={submit} type="button">
            {editingId ? 'Enregistrer la charge' : 'Ajouter la charge'}
          </button>
          {editingId ? (
            <button className="secondary-button" onClick={reset} type="button">
              Annuler
            </button>
          ) : null}
        </div>
      </Panel>

      <Panel title="Charges enregistrées">
        {charges.length === 0 ? (
          <EmptyState>Aucune charge fixe enregistrée.</EmptyState>
        ) : (
          [...charges]
            .sort((left, right) => right.amount - left.amount)
            .map((charge) => (
              <div className="charge-row" key={charge.id}>
                {/* Le libellé sert de bouton d'édition : une quatrième action sur
                    la ligne la ferait passer sur deux rangées. */}
                <button
                  aria-label={`Modifier ${charge.label}`}
                  className="charge-label"
                  onClick={() => edit(charge)}
                  type="button"
                >
                  <strong>{charge.label}</strong>{' '}
                  <span>
                    {[scopeLabels[charge.scope], charge.dayOfMonth ? `le ${charge.dayOfMonth}` : null, charge.active ? null : 'suspendue']
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </button>
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
                        {shortAccountLabels[account.kind]}
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
