import type { AppSettings, NumericSettingKey } from '@freepilot/finance-core';
import {
  calculateARECutoff,
  calculateAREDeduction,
  calculateIncomeTaxProvision,
  calculateTheoreticalMonthlyARE,
  sanitizeSettings,
} from '@freepilot/finance-core';
import { useState } from 'react';
import { InfoRow, Panel } from '../components/Panel';
import { formatCurrency, formatPercent, parseOptionalAmount } from '../format';

/** Ce que la saisie en cours produit vraiment, recalculé à chaque frappe. */
type Effects = {
  areDeductionRate: number;
};

type Field = {
  key: NumericSettingKey;
  label: string;
  helper?: string;
  /**
   * Un taux dont l'effet ne se lit qu'ailleurs sur l'écran se saisit de
   * travers sans que rien ne l'indique : le rappeler sous le champ rend
   * l'erreur visible au moment où elle se commet.
   */
  effect?: (effects: Effects) => string;
};

type Group = {
  title: string;
  fields: Field[];
  /** Les deux groupes les plus longs se replient ; les courts n'y gagneraient rien. */
  collapsible?: boolean;
};

/**
 * `totalUrssafProvisionRate` ne figure volontairement dans aucun groupe : il
 * se déduit de ses deux composantes. Le laisser saisir ouvrirait la porte à un
 * détail qui ne correspond pas au taux réellement appliqué.
 */
const groups: Group[] = [
  {
    title: 'Allocation ARE',
    collapsible: true,
    fields: [
      { key: 'areDailyAmount', label: 'Montant journalier (€)', helper: 'Le journalier notifié par France Travail.' },
      { key: 'theoreticalMonthlyDays', label: 'Jours indemnisés par mois' },
      {
        key: 'remainingAREDays',
        label: 'Jours de droits restants',
        helper: 'Capital de jours non encore consommés, relevé sur ton espace France Travail.',
      },
      {
        key: 'franceTravailDeductionRate',
        label: 'Taux de déduction France Travail (%)',
        helper: 'Appliqué au revenu après abattement, 70 % en principe.',
        // Le panneau des effets annonce « 46,2 % du CA » : ce chiffre est le
        // produit de l'abattement et de ce taux, pas le taux lui-même. Le
        // confondre divise la déduction par un tiers, en silence. L'effet
        // affiché sous le champ démonte la confusion au lieu de la déconseiller.
        effect: ({ areDeductionRate }) => `Cette valeur donne une déduction de ${formatPercent(areDeductionRate)} du CA.`,
      },
    ],
  },
  {
    title: 'Micro-BNC',
    collapsible: true,
    fields: [
      { key: 'bncAbatementRate', label: 'Abattement forfaitaire (%)' },
      { key: 'urssafSocialContributionRate', label: 'Cotisations sociales (%)' },
      { key: 'professionalTrainingContributionRate', label: 'Formation professionnelle (%)' },
      {
        key: 'prudentIncomeTaxProvisionRate',
        label: "Taux d'impôt provisionné (%)",
        helper: 'Appliqué au revenu après abattement.',
      },
      {
        key: 'versementLiberatoireRateBNC',
        label: 'Taux du versement libératoire (%)',
        helper: 'Utilisé seulement si le versement libératoire est activé, et alors sur le CA brut.',
      },
    ],
  },
  {
    title: 'Paliers de CA',
    fields: [
      { key: 'monthlyRevenueSafetyThreshold', label: 'Palier sécurité (€)', helper: 'CA mensuel couvrant les charges fixes.' },
      {
        key: 'monthlyRevenueTakeoffThreshold',
        label: 'Palier décollage (€)',
        helper: "CA mensuel visé pour ne plus dépendre de l'ARE.",
      },
    ],
  },
  {
    title: 'Délais de relance',
    fields: [
      { key: 'hotProspectFollowUpDays', label: 'Prospect chaud (jours)' },
      { key: 'warmProspectFollowUpDays', label: 'Prospect tiède (jours)' },
      { key: 'coldProspectFollowUpDays', label: 'Prospect froid (jours)' },
    ],
  },
];

const editableKeys = groups.flatMap((group) => group.fields.map((field) => field.key));

type Draft = Partial<Record<NumericSettingKey, string>>;

/** La virgule décimale à l'affichage comme à la saisie : clavier français. */
const toDraft = (settings: AppSettings): Draft =>
  Object.fromEntries(editableKeys.map((key) => [key, String(settings[key]).replace('.', ',')]));

type Props = {
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
};

export function SettingsView({ onSave, settings }: Props) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(settings));
  const [liberatoire, setLiberatoire] = useState(settings.versementLiberatoireEnabled);
  const [saved, setSaved] = useState(false);

  const numericPatch: Partial<Record<NumericSettingKey, number>> = {};
  for (const key of editableKeys) {
    const parsed = parseOptionalAmount(draft[key] ?? '');
    if (parsed !== undefined) numericPatch[key] = parsed;
  }

  // Les effets se calculent sur les réglages tels qu'ils seront enregistrés,
  // bornes appliquées : autrement l'écran annoncerait des conséquences que
  // l'enregistrement ne produirait pas.
  const preview = sanitizeSettings(settings, { ...numericPatch, versementLiberatoireEnabled: liberatoire });
  const dirty = JSON.stringify(preview) !== JSON.stringify(settings);

  // Sur 100 € de CA, la valeur renvoyée par le moteur est directement le
  // pourcentage : les effets ne peuvent pas diverger des calculs réels.
  const areDeductionRate = calculateAREDeduction(100, preview).value;
  const taxRate = calculateIncomeTaxProvision(100, preview).value;
  const effects: Effects = { areDeductionRate };

  const edit = (key: NumericSettingKey, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };

  const submit = () => {
    onSave(preview);
    setDraft(toDraft(preview));
    setLiberatoire(preview.versementLiberatoireEnabled);
    setSaved(true);
  };

  return (
    <>
      <Panel title="Effet de ces réglages">
        <InfoRow helper="Retirée de l'ARE du mois suivant" label="Déduction ARE" value={`${formatPercent(areDeductionRate)} du CA`} />
        <InfoRow label="Provision Urssaf" value={`${formatPercent(preview.totalUrssafProvisionRate)} du CA`} />
        <InfoRow
          helper={preview.versementLiberatoireEnabled ? 'Versement libératoire, sur le CA brut' : 'Après abattement forfaitaire'}
          label="Provision impôt"
          value={`${formatPercent(taxRate)} du CA`}
        />
        <InfoRow label="ARE théorique mensuelle" value={formatCurrency(calculateTheoreticalMonthlyARE(preview).value)} />
        <InfoRow
          helper="CA encaissé au-delà duquel l'ARE du mois suivant tombe à zéro"
          label="Seuil de coupure"
          value={formatCurrency(calculateARECutoff(preview).value)}
        />
      </Panel>

      {groups.map((group) => (
        <Panel collapsible={group.collapsible} key={group.title} title={group.title}>
          {group.title === 'Micro-BNC' ? (
            <>
              <label htmlFor="setting-liberatoire">Versement libératoire</label>
              <select
                id="setting-liberatoire"
                onChange={(event) => {
                  setLiberatoire(event.target.value === 'oui');
                  setSaved(false);
                }}
                value={liberatoire ? 'oui' : 'non'}
              >
                <option value="non">Non</option>
                <option value="oui">Oui</option>
              </select>
            </>
          ) : null}

          {group.fields.map((field) => (
            <div className="field" key={field.key}>
              <label htmlFor={`setting-${field.key}`}>{field.label}</label>
              {field.helper ? <p className="muted-note">{field.helper}</p> : null}
              <input
                id={`setting-${field.key}`}
                inputMode="decimal"
                onChange={(event) => edit(field.key, event.target.value)}
                value={draft[field.key] ?? ''}
              />
              {field.effect ? <p className="field-effect">{field.effect(effects)}</p> : null}
            </div>
          ))}
        </Panel>
      ))}

      <Panel title="Enregistrement">
        <p className="muted-note">
          Ces valeurs pilotent l'ARE, l'Urssaf, l'impôt et le seuil de coupure. Relis le bloc « Effet de ces
          réglages » avant d'enregistrer : il montre ce que ta saisie donnera vraiment.
        </p>
        <button className="primary-button" disabled={!dirty} onClick={submit} type="button">
          Enregistrer les réglages
        </button>
        {saved ? (
          <p className="notice-ok" role="status">
            Réglages enregistrés.
          </p>
        ) : null}
      </Panel>
    </>
  );
}
