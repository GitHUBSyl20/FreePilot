import { Panel } from '../components/Panel';

/**
 * Emplacement du CRM, construit au lot 4 : pipeline par température,
 * historique des contacts et relances à échéance.
 */
export function CrmView() {
  return (
    <section className="details-stack single">
      <Panel title="Suivi client">
        <p className="muted-note">
          Le CRM arrive au prochain lot : pipeline par température, historique des contacts,
          et liste des prospects à relancer.
        </p>
      </Panel>
    </section>
  );
}
