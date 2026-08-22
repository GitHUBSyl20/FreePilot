import type { ProspectFollowUp, ProspectTemperature } from '@freepilot/finance-core';
import { EmptyState, Panel } from '../../components/Panel';
import { ProspectRow } from './ProspectRow';
import { temperatureLabels, temperatureOrder } from './labels';

type Props = {
  followUps: ProspectFollowUp[];
  onOpen: (prospectId: string) => void;
};

/**
 * Vue par température : la relation, indépendamment de toute affaire en
 * cours. Sert à décider où remettre du temps de réseau, pas à piloter une
 * opportunité — c'est le rôle de `PipelineView`, par stade. Contenu et
 * comportement inchangés depuis l'ancien `PipelineView` : seul le nom a
 * changé, pour laisser « Pipeline » au nouveau découpage par stade.
 */
export function TemperatureView({ followUps, onOpen }: Props) {
  const active = followUps.filter((followUp) => followUp.prospect.status === 'active');
  const byTemperature = (temperature: ProspectTemperature) =>
    active.filter((followUp) => followUp.prospect.temperature === temperature);

  const signed = followUps.filter((followUp) => followUp.prospect.status === 'signed');
  const lost = followUps.filter((followUp) => followUp.prospect.status === 'lost');

  return (
    <section className="details-stack single">
      {temperatureOrder.map((temperature) => {
        const group = byTemperature(temperature);

        return (
          <Panel key={temperature} title={`${temperatureLabels[temperature]} (${group.length})`}>
            {group.length === 0 ? (
              <EmptyState>Aucun prospect à cette température.</EmptyState>
            ) : (
              group.map((followUp) => (
                <ProspectRow followUp={followUp} key={followUp.prospect.id} onOpen={() => onOpen(followUp.prospect.id)} />
              ))
            )}
          </Panel>
        );
      })}

      <Panel title={`Signés (${signed.length})`}>
        {signed.length === 0 ? (
          <EmptyState>Aucun client signé pour l’instant.</EmptyState>
        ) : (
          signed.map((followUp) => (
            <ProspectRow followUp={followUp} key={followUp.prospect.id} onOpen={() => onOpen(followUp.prospect.id)} />
          ))
        )}
      </Panel>

      {lost.length > 0 ? (
        <Panel title={`Perdus (${lost.length})`}>
          {lost.map((followUp) => (
            <ProspectRow followUp={followUp} key={followUp.prospect.id} onOpen={() => onOpen(followUp.prospect.id)} />
          ))}
        </Panel>
      ) : null}
    </section>
  );
}
