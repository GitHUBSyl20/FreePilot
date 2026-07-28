import type { ChangeEvent } from 'react';
import { Panel } from '../components/Panel';

type Props = {
  /** Vrai quand une session cloud est ouverte : les données ne sont plus seules ici. */
  cloudActive: boolean;
  notice: { tone: 'ok' | 'error'; text: string } | null;
  onExport: () => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  onReset: () => void;
};

export function DataView({ cloudActive, notice, onExport, onImport, onReset }: Props) {
  return (
    <>
      <Panel title="Sauvegarde">
        <p className="muted-note">
          {cloudActive
            ? "Tes données sont synchronisées avec ton espace cloud. Un export reste utile : il ne dépend d'aucun service et se relit tel quel."
            : 'Tes données ne quittent pas cet appareil. Exporte-les régulièrement : si le navigateur efface ses données de site, FreePilot repart de zéro.'}
        </p>
        <button className="primary-button" onClick={onExport} type="button">
          Exporter mes données
        </button>
        <label className="file-button">
          Importer une sauvegarde
          <input accept="application/json,.json" onChange={(event) => void onImport(event)} type="file" />
        </label>
        {notice ? (
          <p className={notice.tone === 'error' ? 'notice-error' : 'notice-ok'} role="status">
            {notice.text}
          </p>
        ) : null}
      </Panel>

      <Panel title="Réinitialisation">
        <p className="muted-note">
          Efface tout le contenu local et repart des données de démonstration.
          {cloudActive ? ' Le cloud recevra ces données de démonstration à la synchro suivante.' : ''}
        </p>
        <button className="danger-button" onClick={onReset} type="button">
          Effacer les données
        </button>
      </Panel>
    </>
  );
}
