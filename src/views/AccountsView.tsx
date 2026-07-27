import type { AccountBalance } from '@freepilot/finance-core';
import { useEffect, useState } from 'react';
import { InfoRow, Panel } from '../components/Panel';
import { formatCurrency, parseAmount } from '../format';

type Props = {
  accounts: AccountBalance[];
  onTransfer: (input: { fromAccountId: string; toAccountId: string; amount: number }) => void;
};

export function AccountsView({ accounts, onTransfer }: Props) {
  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [amount, setAmount] = useState('');

  // Les comptes arrivent après le chargement des données : on initialise le
  // virement sur le trajet le plus courant, du pro vers le perso.
  useEffect(() => {
    setFromAccountId((current) => current || accounts.find((account) => account.kind === 'professional')?.id || '');
    setToAccountId((current) => current || accounts.find((account) => account.kind === 'personal')?.id || '');
  }, [accounts]);

  const submit = () => {
    const parsedAmount = parseAmount(amount);
    if (!parsedAmount || !fromAccountId || !toAccountId) return;

    onTransfer({ fromAccountId, toAccountId, amount: parsedAmount });
    setAmount('');
  };

  const sameAccount = fromAccountId !== '' && fromAccountId === toAccountId;

  return (
    <section className="details-stack single">
      <Panel title="Soldes">
        {accounts.map((account) => (
          <InfoRow helper={account.kind} key={account.id} label={account.name} value={formatCurrency(account.balance)} />
        ))}
      </Panel>

      <Panel title="Virement entre comptes">
        <label htmlFor="transfer-from">Depuis</label>
        <select id="transfer-from" onChange={(event) => setFromAccountId(event.target.value)} value={fromAccountId}>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>{account.name}</option>
          ))}
        </select>

        <label htmlFor="transfer-to">Vers</label>
        <select id="transfer-to" onChange={(event) => setToAccountId(event.target.value)} value={toAccountId}>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>{account.name}</option>
          ))}
        </select>

        <input inputMode="decimal" onChange={(event) => setAmount(event.target.value)} placeholder="Montant" value={amount} />
        {sameAccount ? <p className="notice-error">Choisis deux comptes différents.</p> : null}
        <button className="primary-button" disabled={sameAccount} onClick={submit} type="button">
          Créer le virement
        </button>
      </Panel>
    </section>
  );
}
