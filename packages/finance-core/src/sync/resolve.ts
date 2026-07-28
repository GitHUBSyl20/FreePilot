import type { FinanceData, RemoteDocumentHeader, SyncDecision, SyncMeta } from '../types';
import { FINANCE_DATA_VERSION } from '../types';
import { fingerprintFinanceData } from './fingerprint';

/** État d'un appareil qui n'a encore jamais parlé au cloud. */
export const emptySyncMeta = (): SyncMeta => ({ revision: null, fingerprint: null, syncedAt: null });

/** Métadonnées à enregistrer après un échange réussi. */
export const syncedMeta = (input: { revision: number; data: FinanceData; at: string }): SyncMeta => ({
  revision: input.revision,
  fingerprint: fingerprintFinanceData(input.data),
  syncedAt: input.at,
});

/**
 * Décide de l'action à mener, à partir du seul en-tête distant.
 *
 * Le principe est le local d'abord : la décision ne peut jamais aboutir à
 * écraser un côté sans que l'autre ait été vu. Quand les deux côtés ont bougé
 * depuis le dernier échange, on rend la main à l'utilisateur plutôt que de
 * choisir un gagnant à sa place — il s'agit de son revenu.
 */
export const resolveSync = (input: {
  local: FinanceData;
  meta: SyncMeta;
  remote: RemoteDocumentHeader | null;
}): SyncDecision => {
  const { local, meta, remote } = input;

  if (remote && remote.schemaVersion > FINANCE_DATA_VERSION) return 'blocked';

  const localChanged = fingerprintFinanceData(local) !== meta.fingerprint;

  // Pas de document distant : soit c'est la première synchro, soit la ligne a
  // été supprimée. Dans les deux cas l'envoi la recrée sans rien perdre.
  if (!remote) return 'push';

  const remoteChanged = remote.revision !== meta.revision;

  if (localChanged && remoteChanged) return 'conflict';
  if (localChanged) return 'push';
  if (remoteChanged) return 'pull';

  return 'up-to-date';
};
