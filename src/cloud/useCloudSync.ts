import type { FinanceData } from '@freepilot/finance-core';
import { resolveSync, syncedMeta } from '@freepilot/finance-core';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CloudUser } from './auth';
import { getCloudUser, onCloudAuthChange, signInToCloud, signOutFromCloud } from './auth';
import { isCloudConfigured } from './config';
import { fetchRemoteDocument, fetchRemoteHeader, pushRemoteDocument } from './documentStore';
import { clearSyncMeta, readSyncMeta, writeSyncMeta } from './syncMeta';

export type CloudStatus =
  | 'disabled'
  | 'signed-out'
  | 'idle'
  | 'syncing'
  | 'offline'
  | 'conflict'
  | 'blocked'
  | 'error';

export type CloudSync = {
  configured: boolean;
  user: CloudUser | null;
  status: CloudStatus;
  message: string | null;
  lastSyncedAt: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  syncNow: () => void;
  resolveConflict: (choice: 'local' | 'remote') => void;
};

/**
 * La saisie ne doit pas déclencher un envoi par caractère tapé. Le délai est
 * assez court pour qu'une donnée saisie puis l'application fermée soit tout de
 * même partie, assez long pour regrouper une série de modifications.
 */
const SYNC_DEBOUNCE_MS = 2500;

type Params = {
  data: FinanceData | null;
  /** Applique un document venu du cloud aux données locales. */
  onRemoteData: (data: FinanceData) => void;
};

export const useCloudSync = ({ data, onRemoteData }: Params): CloudSync => {
  const configured = isCloudConfigured();
  const [user, setUser] = useState<CloudUser | null>(null);
  const [status, setStatus] = useState<CloudStatus>(configured ? 'signed-out' : 'disabled');
  const [message, setMessage] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  // Le cycle de synchro est construit une seule fois : ses entrées mouvantes
  // passent par des refs, sinon chaque frappe le recréerait et relancerait
  // tous les effets qui en dépendent.
  const dataRef = useRef(data);
  const userRef = useRef(user);
  const applyRef = useRef(onRemoteData);
  const runningRef = useRef(false);

  useEffect(() => {
    dataRef.current = data;
    userRef.current = user;
    applyRef.current = onRemoteData;
  });

  /**
   * Ne remplace l'utilisateur que si le compte change vraiment. Supabase émet
   * un nouvel objet de session à chaque renouvellement de jeton : sans ce
   * garde-fou, une synchro en cours ou un conflit affiché seraient balayés
   * toutes les heures.
   */
  const applyUser = useCallback((next: CloudUser | null) => {
    setUser((current) => (current?.id === next?.id ? current : next));
  }, []);

  const runSync = useCallback(
    async (mode: 'auto' | 'keep-local' | 'keep-remote') => {
      const local = dataRef.current;
      const currentUser = userRef.current;
      if (!configured || !currentUser || !local) return;
      // Une seule synchro à la fois : deux cycles concurrents liraient la même
      // révision et le second serait rejeté pour rien.
      if (runningRef.current) return;

      runningRef.current = true;
      setStatus('syncing');
      setMessage(null);

      try {
        const meta = await readSyncMeta();
        const header = await fetchRemoteHeader(currentUser.id);
        const decision =
          mode === 'keep-local' ? 'push' : mode === 'keep-remote' ? 'pull' : resolveSync({ local, meta, remote: header });

        if (decision === 'up-to-date') {
          setLastSyncedAt(meta.syncedAt);
          setStatus('idle');
          return;
        }

        if (decision === 'blocked') {
          setStatus('blocked');
          setMessage(
            "Le cloud contient des données écrites par une version plus récente de FreePilot. Mets l'application à jour avant de synchroniser.",
          );
          return;
        }

        if (decision === 'conflict') {
          setStatus('conflict');
          setMessage('Cet appareil et le cloud ont changé chacun de leur côté depuis la dernière synchro.');
          return;
        }

        if (decision === 'pull') {
          const remote = await fetchRemoteDocument(currentUser.id);
          if (!remote) {
            setStatus('idle');
            setMessage('Aucune donnée dans le cloud.');
            return;
          }

          applyRef.current(remote.data);
          const next = syncedMeta({ revision: remote.revision, data: remote.data, at: new Date().toISOString() });
          await writeSyncMeta(next);
          setLastSyncedAt(next.syncedAt);
          setStatus('idle');
          setMessage('Données du cloud récupérées.');
          return;
        }

        const revision = await pushRemoteDocument({
          data: local,
          expectedRevision: meta.revision,
          force: mode === 'keep-local',
        });

        // Un autre appareil a écrit entre la lecture de l'en-tête et l'envoi.
        if (revision === null) {
          setStatus('conflict');
          setMessage('Un autre appareil a écrit pendant l’envoi.');
          return;
        }

        const next = syncedMeta({ revision, data: local, at: new Date().toISOString() });
        await writeSyncMeta(next);
        setLastSyncedAt(next.syncedAt);
        setStatus('idle');
      } catch (error) {
        // Être hors ligne est l'état normal d'une application de terrain, pas
        // une panne : on le distingue d'une vraie erreur.
        const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
        setStatus(offline ? 'offline' : 'error');
        setMessage(offline ? null : error instanceof Error ? error.message : 'Synchronisation impossible.');
      } finally {
        runningRef.current = false;
      }
    },
    [configured],
  );

  // Session existante au lancement, puis suivi des changements.
  useEffect(() => {
    if (!configured) return;

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    void getCloudUser()
      .then((current) => {
        if (!cancelled) applyUser(current);
      })
      .catch(() => {
        // Session illisible : l'application reste utilisable en local.
      });

    void onCloudAuthChange(applyUser)
      .then((off) => {
        if (cancelled) off();
        else unsubscribe = off;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [applyUser, configured]);

  useEffect(() => {
    if (!configured) return;
    void readSyncMeta().then((meta) => setLastSyncedAt(meta.syncedAt));
  }, [configured]);

  useEffect(() => {
    if (!configured) return;
    setStatus(user ? 'idle' : 'signed-out');
    setMessage(null);
  }, [configured, user]);

  // Toute modification locale part au cloud après un temps de repos.
  useEffect(() => {
    if (!configured || !user || !data) return undefined;

    const timer = window.setTimeout(() => void runSync('auto'), SYNC_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [configured, data, runSync, user]);

  // Retour du réseau ou de l'application au premier plan : deux moments où
  // l'autre appareil a pu prendre de l'avance.
  useEffect(() => {
    if (!configured || !user) return undefined;

    const syncOnReconnect = () => void runSync('auto');
    const syncOnFocus = () => {
      if (document.visibilityState === 'visible') void runSync('auto');
    };

    window.addEventListener('online', syncOnReconnect);
    document.addEventListener('visibilitychange', syncOnFocus);

    return () => {
      window.removeEventListener('online', syncOnReconnect);
      document.removeEventListener('visibilitychange', syncOnFocus);
    };
  }, [configured, runSync, user]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      applyUser(await signInToCloud(email, password));
    },
    [applyUser],
  );

  const signOut = useCallback(async () => {
    await signOutFromCloud();
    // L'état de synchro appartient au document du compte qui se déconnecte :
    // le garder ferait croire au compte suivant qu'il connaît une révision.
    await clearSyncMeta();
    applyUser(null);
    setLastSyncedAt(null);
  }, [applyUser]);

  const syncNow = useCallback(() => void runSync('auto'), [runSync]);

  const resolveConflict = useCallback(
    (choice: 'local' | 'remote') => void runSync(choice === 'local' ? 'keep-local' : 'keep-remote'),
    [runSync],
  );

  return { configured, user, status, message, lastSyncedAt, resolveConflict, signIn, signOut, syncNow };
};
