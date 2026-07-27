import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Bandeau de mise à jour du service worker.
 * En mode `prompt`, la nouvelle version n'est jamais appliquée sans action
 * de l'utilisateur : pas de rechargement au milieu d'une saisie.
 */
export const PwaBanners = () => {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();

  if (needRefresh) {
    return (
      <aside className="pwa-banner" role="status">
        <p>Une nouvelle version de FreePilot est disponible.</p>
        <div className="button-row">
          <button className="primary-button" onClick={() => void updateServiceWorker(true)} type="button">
            Mettre à jour
          </button>
          <button className="secondary-button" onClick={() => setNeedRefresh(false)} type="button">
            Plus tard
          </button>
        </div>
      </aside>
    );
  }

  if (offlineReady) {
    return (
      <aside className="pwa-banner" role="status">
        <p>FreePilot est prête à fonctionner hors ligne.</p>
        <div className="button-row">
          <button className="secondary-button" onClick={() => setOfflineReady(false)} type="button">
            Fermer
          </button>
        </div>
      </aside>
    );
  }

  return null;
};
