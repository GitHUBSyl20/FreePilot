import type { AccountBalance } from '@freepilot/finance-core';
import { useEffect, useState } from 'react';
import { InfoRow, Panel } from '../components/Panel';
import { formatCurrency, parseAmount, parseOptionalAmount } from '../format';

type Props = {
  accounts: AccountBalance[];
  onTransfer: (input: { fromAccountId: string; toAccountId: string; amount: number }) => void;
  onSetObservedBalances: (entries: { id: string; observedBalance: number }[]) => void;
};

export function AccountsView({ accounts, onSetObservedBalances, onTransfer }: Props) {
  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [observed, setObserved] = useState<Record<string, string>>({});
  const [observedSaved, setObservedSaved] = useState(false);

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

  const submitObserved = () => {
    const entries = accounts
      .map((account) => ({ id: account.id, observedBalance: parseOptionalAmount(observed[account.id] ?? '') }))
      .filter((entry): entry is { id: string; observedBalance: number } => entry.observedBalance !== undefined);

    if (entries.length === 0) return;

    onSetObservedBalances(entries);
    // Les champs se vident : le solde affiché vient de devenir la référence.
    setObserved({});
    setObservedSaved(true);
  };

  return (
    <section className="details-stack single">
      <Panel title="Soldes">
        {accounts.map((account) => (
          <InfoRow helper={account.kind} key={account.id} label={account.name} value={formatCurrency(account.balance)} />
        ))}
      </Panel>

      <Panel title="Recaler sur le relevé">
        <p className="muted-note">
          Saisis le solde lu sur ton relevé bancaire : l'application ajuste le point de départ du compte pour
          retomber dessus, et absorbe au passage ce qu'elle n'a pas enregistré. Laisse vide un compte que tu ne
          veux pas toucher.
        </p>
        {accounts.map((account) => (
          <div className="charge-row" key={account.id}>
            <label className="charge-label" htmlFor={`observed-${account.id}`}>
              <strong>{account.name}</strong> <span>départ {formatCurrency(account.openingBalance)}</span>
            </label>
            <input
              className="row-input"
              id={`observed-${account.id}`}
              inputMode="decimal"
              onChange={(event) => {
                setObserved((current) => ({ ...current, [account.id]: event.target.value }));
                setObservedSaved(false);
              }}
              placeholder="relevé"
              value={observed[account.id] ?? ''}
            />
          </div>
        ))}
        <button className="primary-button" onClick={submitObserved} type="button">
          Recaler les soldes
        </button>
        {observedSaved ? (
          <p className="notice-ok" role="status">
            Soldes recalés sur le relevé.
          </p>
        ) : null}
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
