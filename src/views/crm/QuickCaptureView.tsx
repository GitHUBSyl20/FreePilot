import { useState } from 'react';
import { Panel } from '../../components/Panel';

export type QuickCaptureFormInput = {
  name: string;
  company: string | null;
  originEvent: string | null;
  note: string;
};

type Props = {
  onCapture: (input: QuickCaptureFormInput) => void;
  onCancel: () => void;
};

/**
 * Capture terrain (§6.6) : nom, entreprise, événement d'origine, note.
 * Rien d'autre — l'écran qu'on utilise sur le parking en sortant d'un
 * petit-déjeuner, en deux gestes (ouvrir l'écran, valider).
 */
export function QuickCaptureView({ onCancel, onCapture }: Props) {
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [originEvent, setOriginEvent] = useState('');
  const [note, setNote] = useState('');

  const submit = () => {
    if (!name.trim()) return;

    onCapture({ name, company: company.trim() || null, originEvent: originEvent.trim() || null, note });
    setName('');
    setCompany('');
    setOriginEvent('');
    setNote('');
  };

  return (
    <section className="details-stack single">
      <Panel title="Capture terrain">
        <input autoFocus onChange={(event) => setName(event.target.value)} placeholder="Nom du contact" value={name} />
        <input onChange={(event) => setCompany(event.target.value)} placeholder="Entreprise (optionnel)" value={company} />
        <input
          onChange={(event) => setOriginEvent(event.target.value)}
          placeholder="Événement d’origine (ex. Petit-déj CPME 12/03)"
          value={originEvent}
        />
        <textarea onChange={(event) => setNote(event.target.value)} placeholder="Note (optionnel)" rows={3} value={note} />

        <div className="button-row">
          <button className="primary-button" onClick={submit} type="button">
            Capturer
          </button>
          <button className="secondary-button" onClick={onCancel} type="button">
            Annuler
          </button>
        </div>
        <p className="muted-note">
          Crée le contact, journalise l’échange, ouvre une affaire au stade « Identifié » et programme une relance à J+2.
          Rien d’autre — le reste se règle depuis la fiche prospect.
        </p>
      </Panel>
    </section>
  );
}
