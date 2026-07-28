import type { AccountBalance } from '@freepilot/finance-core';
import { useEffect, useState } from 'react';
import { InfoRow, Panel } from '../components/Panel';
import { formatCurrency, parseAmount, parseOptionalAmount } from '../format';

type Props = {
  accounts: AccountBalance[];
  onTransfer: (input: { fromAccountId: string; toAccountId: string; amount: number }) => void;
  onUpdateOpeningBalances: (entries: { id: string; openingBalance: number }[]) => void;
};

export function AccountsView({ accounts, onTransfer, onUpdateOpeningBalances }: Props) {
  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [openingDraft, setOpeningDraft] = useState<Record<string, string>>({});
  const [openingSaved, setOpeningSaved] = useState(false);

  // Les comptes arrivent après le chargement des données : on initialise le
  // virement sur le trajet le plus courant, du pro vers le perso.
  useEffect(() => {
    setFromAccountId((current) => current || accounts.find((account) => account.kind === 'professional')?.id || '');
    setToAccountId((current) => current || accounts.find((account) => account.kind === 'personal')?.id || '');
  }, [accounts]);

  // Les soldes d'ouverture ne sont initialisés qu'une fois : les réinitialiser
  // à chaque rendu écraserait la saisie en cours, puisque `accounts` est
  // recalculé à chaque modification des données.
  useEffect(() => {
    setOpeningDraft((current) =>
      accounts.reduce<Record<string, string>>(
        (draft, account) => ({
          ...draft,
          [account.id]: current[account.id] ?? String(account.openingBalance).replace('.', ','),
        }),
        {},
      ),
    );
  }, [accounts]);

  const submit = () => {
    const parsedAmount = parseAmount(amount);
    if (!parsedAmount || !fromAccountId || !toAccountId) return;

    onTransfer({ fromAccountId, toAccountId, amount: parsedAmount });
    setAmount('');
  };

  const sameAccount = fromAccountId !== '' && fromAccountId === toAccountId;

  const submitOpeningBalances = () => {
    const entries = accounts
      .map((account) => ({ id: account.id, openingBalance: parseOptionalAmount(openingDraft[account.id] ?? '') }))
      .filter((entry): entry is { id: string; openingBalance: number } => entry.openingBalance !== undefined);

    if (entries.length === 0) return;

    onUpdateOpeningBalances(entries);
    // On réaffiche les valeurs telles qu'elles sont enregistrées, arrondies au
    // centime, plutôt que la frappe brute.
    setOpeningDraft((current) =>
      entries.reduce(
        (draft, entry) => ({ ...draft, [entry.id]: String(Math.round(entry.openingBalance * 100) / 100).replace('.', ',') }),
        current,
      ),
    );
    setOpeningSaved(true);
  };

  return (
    <section className="details-stack single">
      <Panel title="Soldes">
        {accounts.map((account) => (
          <InfoRow helper={account.kind} key={account.id} label={account.name} value={formatCurrency(account.balance)} />
        ))}
      </Panel>

      <Panel title="Soldes d'ouverture">
        <p className="muted-note">
          Point de départ du calcul : ce qu'il y avait sur le compte avant la première opération saisie ici.
          Ajuste-le pour que le solde affiché colle à ton relevé bancaire. Une valeur négative est permise,
          elle absorbe des dépenses antérieures.
        </p>
        {accounts.map((account) => (
          <div className="charge-row" key={account.id}>
            <label className="charge-label" htmlFor={`opening-${account.id}`}>
              <strong>{account.name}</strong>
            </label>
            <input
              className="row-input"
              id={`opening-${account.id}`}
              inputMode="decimal"
              onChange={(event) => {
                setOpeningDraft((current) => ({ ...current, [account.id]: event.target.value }));
                setOpeningSaved(false);
              }}
              value={openingDraft[account.id] ?? ''}
            />
          </div>
        ))}
        <button className="primary-button" onClick={submitOpeningBalances} type="button">
          Enregistrer les soldes d'ouverture
        </button>
        {openingSaved ? (
          <p className="notice-ok" role="status">
            Soldes d'ouverture enregistrés.
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
