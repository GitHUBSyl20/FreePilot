import type { ChangeEvent } from 'react';
import { Panel } from '../components/Panel';

type Props = {
  notice: { tone: 'ok' | 'error'; text: string } | null;
  onExport: () => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  onReset: () => void;
};

export function DataView({ notice, onExport, onImport, onReset }: Props) {
  return (
    <section className="details-stack single">
      <Panel title="Sauvegarde">
        <p className="muted-note">
          Tes données ne quittent pas cet appareil. Exporte-les régulièrement : si le navigateur efface
          ses données de site, FreePilot repart de zéro.
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
        <p className="muted-note">Efface tout le contenu local et repart des données de démonstration.</p>
        <button className="danger-button" onClick={onReset} type="button">
          Effacer les données
        </button>
      </Panel>
    </section>
  );
}
