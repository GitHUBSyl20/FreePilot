import { useState } from 'react';
import type { CloudStatus, CloudSync } from '../cloud/useCloudSync';
import { Panel } from '../components/Panel';
import { formatDateTime } from '../format';

const statusLabels: Record<CloudStatus, string> = {
  disabled: 'Local uniquement',
  'signed-out': 'Déconnecté',
  idle: 'À jour',
  syncing: 'Synchronisation…',
  offline: 'Hors ligne',
  conflict: 'Conflit à trancher',
  blocked: 'Mise à jour requise',
  error: 'Erreur',
};

type Props = {
  cloud: CloudSync;
};

export function CloudView({ cloud }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signInError, setSignInError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submitSignIn = async () => {
    if (!email.trim() || !password) return;

    setBusy(true);
    setSignInError(null);
    try {
      await cloud.signIn(email, password);
      // Le mot de passe ne reste pas en mémoire du composant une fois la
      // session ouverte : la session, elle, est gérée par le SDK.
      setPassword('');
    } catch (error) {
      setSignInError(error instanceof Error ? error.message : 'Connexion impossible.');
    } finally {
      setBusy(false);
    }
  };

  if (!cloud.configured) {
    return (
      <Panel title="Synchronisation cloud">
        <p className="muted-note">
          Aucun serveur configuré : FreePilot fonctionne entièrement sur cet appareil. Pour synchroniser
          téléphone et ordinateur, suis la marche à suivre dans <code>supabase/README.md</code>.
        </p>
      </Panel>
    );
  }

  if (!cloud.user) {
    return (
      <Panel title="Synchronisation cloud">
        <p className="muted-note">
          Connecte-toi pour retrouver les mêmes données sur tous tes appareils. Sans connexion, tout reste
          local et rien n'est perdu.
        </p>
        <label htmlFor="cloud-email">Adresse électronique</label>
        <input
          autoComplete="username"
          id="cloud-email"
          inputMode="email"
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          value={email}
        />
        <label htmlFor="cloud-password">Mot de passe</label>
        <input
          autoComplete="current-password"
          id="cloud-password"
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          value={password}
        />
        <button className="primary-button" disabled={busy} onClick={() => void submitSignIn()} type="button">
          {busy ? 'Connexion…' : 'Se connecter'}
        </button>
        {signInError ? (
          <p className="notice-error" role="status">
            {signInError}
          </p>
        ) : null}
      </Panel>
    );
  }

  return (
    <>
      <Panel title="Synchronisation cloud">
        <div className="info-row">
          <div>
            <span>État</span>
            <p>{cloud.user.email ?? 'Compte connecté'}</p>
          </div>
          <strong className={`sync-status ${cloud.status}`}>{statusLabels[cloud.status]}</strong>
        </div>
        <div className="info-row">
          <div>
            <span>Dernière synchro</span>
          </div>
          <strong>{cloud.lastSyncedAt ? formatDateTime(cloud.lastSyncedAt) : 'Jamais'}</strong>
        </div>
        {cloud.message ? (
          <p className={cloud.status === 'error' || cloud.status === 'blocked' ? 'notice-error' : 'notice-ok'} role="status">
            {cloud.message}
          </p>
        ) : null}
        <div className="button-row">
          <button
            className="primary-button"
            disabled={cloud.status === 'syncing'}
            onClick={cloud.syncNow}
            type="button"
          >
            Synchroniser maintenant
          </button>
          <button className="secondary-button" onClick={() => void cloud.signOut()} type="button">
            Se déconnecter
          </button>
        </div>
      </Panel>

      {cloud.status === 'conflict' ? (
        <Panel title="Quelle version garder ?">
          <p className="muted-note">
            Les deux côtés ont été modifiés depuis la dernière synchronisation. Choisir une version efface
            définitivement l'autre : si tu hésites, exporte d'abord une sauvegarde depuis le bloc
            ci-dessous.
          </p>
          <div className="button-row">
            <button className="primary-button" onClick={() => cloud.resolveConflict('local')} type="button">
              Garder cet appareil
            </button>
            <button className="secondary-button" onClick={() => cloud.resolveConflict('remote')} type="button">
              Prendre la version du cloud
            </button>
          </div>
        </Panel>
      ) : null}
    </>
  );
}
