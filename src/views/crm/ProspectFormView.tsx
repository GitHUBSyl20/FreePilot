import type { ProspectTemperature } from '@freepilot/finance-core';
import { useState } from 'react';
import { Panel } from '../../components/Panel';
import { temperatureLabels, temperatureOrder } from './labels';

type Props = {
  onAdd: (input: {
    name: string;
    company: string | null;
    source: string | null;
    temperature: ProspectTemperature;
    nextFollowUpDate: string | null;
    notes: string;
  }) => void;
};

export function ProspectFormView({ onAdd }: Props) {
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [source, setSource] = useState('');
  const [temperature, setTemperature] = useState<ProspectTemperature>('warm');
  const [nextFollowUpDate, setNextFollowUpDate] = useState('');
  const [notes, setNotes] = useState('');

  const submit = () => {
    if (!name.trim()) return;

    onAdd({
      name,
      company: company.trim() || null,
      source: source.trim() || null,
      temperature,
      nextFollowUpDate: nextFollowUpDate || null,
      notes,
    });

    setName('');
    setCompany('');
    setSource('');
    setNextFollowUpDate('');
    setNotes('');
  };

  return (
    <section className="details-stack single">
      <Panel title="Nouveau prospect">
        <input onChange={(event) => setName(event.target.value)} placeholder="Nom du contact" value={name} />
        <input onChange={(event) => setCompany(event.target.value)} placeholder="Entreprise (optionnel)" value={company} />
        <input
          onChange={(event) => setSource(event.target.value)}
          placeholder="Source du contact (réseau, événement...)"
          value={source}
        />

        <label htmlFor="prospect-temperature">Température</label>
        <select
          id="prospect-temperature"
          onChange={(event) => setTemperature(event.target.value as ProspectTemperature)}
          value={temperature}
        >
          {temperatureOrder.map((value) => (
            <option key={value} value={value}>
              {temperatureLabels[value]}
            </option>
          ))}
        </select>

        <label htmlFor="prospect-follow-up">Première relance (optionnel)</label>
        <input
          id="prospect-follow-up"
          onChange={(event) => setNextFollowUpDate(event.target.value)}
          type="date"
          value={nextFollowUpDate}
        />

        <textarea
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Remarques"
          rows={3}
          value={notes}
        />

        <button className="primary-button" onClick={submit} type="button">
          Ajouter le prospect
        </button>
        <p className="muted-note">
          Sans date de relance, l’échéance est calculée à partir de la date d’ajout puis du dernier contact.
        </p>
      </Panel>
    </section>
  );
}
