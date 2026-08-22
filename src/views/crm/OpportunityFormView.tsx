import type {
  AddOpportunityInput,
  AppSettings,
  LossReason,
  Opportunity,
  OpportunityStatus,
  PipelineKind,
  Prospect,
  UpdateOpportunityInput,
} from '@freepilot/finance-core';
import { checkOpportunityStatusTransition, PIPELINE_LABELS, PIPELINE_ORDER, stageProbability, stagesForPipeline } from '@freepilot/finance-core';
import { useState } from 'react';
import { Panel } from '../../components/Panel';
import { parseAmount, parseOptionalAmount, today as todayFn } from '../../format';
import {
  fundingLabels,
  fundingOrder,
  lossReasonLabels,
  lossReasonOrder,
  opportunityStatusLabels,
  opportunityStatusOrder,
} from './labels';

type Props = {
  prospectId: string;
  prospects: Prospect[];
  settings: AppSettings;
  opportunity: Opportunity | null;
  today: string;
  onCreate: (input: AddOpportunityInput) => void;
  onUpdate: (input: UpdateOpportunityInput) => void;
  onDelete: () => void;
  onCancel: () => void;
};

export function OpportunityFormView({
  onCancel,
  onCreate,
  onDelete,
  onUpdate,
  opportunity,
  prospectId,
  prospects,
  settings,
  today,
}: Props) {
  const isEditing = opportunity !== null;

  const [title, setTitle] = useState(opportunity?.title ?? '');
  const [pipeline, setPipeline] = useState<PipelineKind>(opportunity?.pipeline ?? PIPELINE_ORDER[0]);
  const [stageId, setStageId] = useState(opportunity?.stageId ?? stagesForPipeline(opportunity?.pipeline ?? PIPELINE_ORDER[0])[0].id);
  const [amount, setAmount] = useState(opportunity ? String(opportunity.amount) : '');
  const [recurring, setRecurring] = useState(opportunity?.recurring ?? false);
  const [monthlyAmount, setMonthlyAmount] = useState(opportunity?.monthlyAmount != null ? String(opportunity.monthlyAmount) : '');
  const [probabilityOverrideEnabled, setProbabilityOverrideEnabled] = useState(opportunity?.probabilityOverride ?? false);
  const [probabilityInput, setProbabilityInput] = useState(opportunity ? String(opportunity.probability) : '');
  const [expectedCloseDate, setExpectedCloseDate] = useState(opportunity?.expectedCloseDate ?? '');
  const [originEvent, setOriginEvent] = useState(opportunity?.originEvent ?? '');
  const [referrerProspectId, setReferrerProspectId] = useState(opportunity?.referrerProspectId ?? '');
  const [funding, setFunding] = useState<'' | 'direct' | 'opco' | 'mixed'>(opportunity?.funding ?? '');
  const [status, setStatus] = useState<OpportunityStatus>(opportunity?.status ?? 'open');
  const [lossReason, setLossReason] = useState<'' | LossReason>(opportunity?.lossReason ?? '');
  const [statusDate, setStatusDate] = useState(opportunity?.statusDate ?? todayFn());

  const stages = stagesForPipeline(pipeline);
  const isPartnership = pipeline === 'partenariat';
  const isFormation = pipeline === 'formation';
  const defaultProbability = stageProbability(pipeline, stageId, settings.stageProbabilities);
  const effectiveProbability = probabilityOverrideEnabled ? parseAmount(probabilityInput) : defaultProbability;

  const changePipeline = (nextPipeline: PipelineKind) => {
    setPipeline(nextPipeline);
    setStageId(stagesForPipeline(nextPipeline)[0].id);
  };

  const rejection =
    isEditing && opportunity
      ? checkOpportunityStatusTransition(
          opportunity,
          {
            status,
            amount: parseAmount(amount),
            recurring,
            monthlyAmount: recurring ? parseOptionalAmount(monthlyAmount) ?? null : null,
            lossReason: lossReason || null,
            statusDate: statusDate || null,
          },
          today,
        )
      : null;

  const submit = () => {
    if (rejection) return;
    if (!title.trim()) return;

    if (!isEditing) {
      onCreate({
        prospectId,
        title,
        pipeline,
        stageId,
        amount: isPartnership ? 0 : parseAmount(amount),
        recurring: isPartnership ? false : recurring,
        monthlyAmount: !isPartnership && recurring ? parseOptionalAmount(monthlyAmount) ?? null : null,
        probability: probabilityOverrideEnabled ? parseAmount(probabilityInput) : undefined,
        expectedCloseDate: expectedCloseDate || null,
        originEvent: originEvent || null,
        referrerProspectId: referrerProspectId || null,
        funding: isFormation && funding ? funding : null,
      });
      return;
    }

    onUpdate({
      title,
      pipeline,
      stageId,
      amount: isPartnership ? 0 : parseAmount(amount),
      recurring: isPartnership ? false : recurring,
      monthlyAmount: !isPartnership && recurring ? parseOptionalAmount(monthlyAmount) ?? null : null,
      ...(probabilityOverrideEnabled ? { probability: parseAmount(probabilityInput) } : { probabilityOverride: false }),
      expectedCloseDate: expectedCloseDate || null,
      originEvent: originEvent || null,
      referrerProspectId: referrerProspectId || null,
      funding: isFormation && funding ? funding : null,
      status,
      lossReason: status === 'lost' ? lossReason || null : null,
      statusDate: status === 'open' ? null : statusDate || null,
    });
  };

  return (
    <section className="details-stack single">
      <Panel title={isEditing ? 'Modifier l’affaire' : 'Nouvelle affaire'}>
        <input onChange={(event) => setTitle(event.target.value)} placeholder="Titre de l’affaire" value={title} />

        <label htmlFor="opportunity-pipeline">Pipeline</label>
        <select
          id="opportunity-pipeline"
          onChange={(event) => changePipeline(event.target.value as PipelineKind)}
          value={pipeline}
        >
          {PIPELINE_ORDER.map((kind) => (
            <option key={kind} value={kind}>
              {PIPELINE_LABELS[kind]}
            </option>
          ))}
        </select>

        <label htmlFor="opportunity-stage">Stade</label>
        <select id="opportunity-stage" onChange={(event) => setStageId(event.target.value)} value={stageId}>
          {stages.map((stage) => (
            <option key={stage.id} value={stage.id}>
              {stage.label}
            </option>
          ))}
        </select>

        {!isPartnership ? (
          <>
            <input
              inputMode="decimal"
              onChange={(event) => setAmount(event.target.value)}
              placeholder="Montant HT"
              value={amount}
            />

            <label htmlFor="opportunity-recurring">Prestation récurrente</label>
            <select
              id="opportunity-recurring"
              onChange={(event) => setRecurring(event.target.value === 'oui')}
              value={recurring ? 'oui' : 'non'}
            >
              <option value="non">Non</option>
              <option value="oui">Oui</option>
            </select>

            {recurring ? (
              <input
                inputMode="decimal"
                onChange={(event) => setMonthlyAmount(event.target.value)}
                placeholder="Montant mensuel récurrent"
                value={monthlyAmount}
              />
            ) : null}

            <label htmlFor="opportunity-probability">
              Probabilité {probabilityOverrideEnabled ? '(saisie manuelle)' : `(automatique, stade : ${defaultProbability} %)`}
            </label>
            <input
              disabled={!probabilityOverrideEnabled}
              id="opportunity-probability"
              inputMode="decimal"
              onChange={(event) => setProbabilityInput(event.target.value)}
              value={probabilityOverrideEnabled ? probabilityInput : String(defaultProbability)}
            />
            <button
              className="secondary-button"
              onClick={() => {
                if (probabilityOverrideEnabled) {
                  setProbabilityOverrideEnabled(false);
                } else {
                  setProbabilityInput(String(defaultProbability));
                  setProbabilityOverrideEnabled(true);
                }
              }}
              type="button"
            >
              {probabilityOverrideEnabled ? 'Revenir à l’automatique' : 'Fixer manuellement'}
            </button>
          </>
        ) : (
          <p className="muted-note">
            Le pipeline partenariat n’a ni montant ni probabilité : il n’entre jamais dans le pondéré.
          </p>
        )}

        <label htmlFor="opportunity-close-date">Date de clôture prévue</label>
        <input
          id="opportunity-close-date"
          onChange={(event) => setExpectedCloseDate(event.target.value)}
          type="date"
          value={expectedCloseDate}
        />

        <input
          onChange={(event) => setOriginEvent(event.target.value)}
          placeholder="Événement d’origine (optionnel)"
          value={originEvent}
        />

        {prospects.length > 0 ? (
          <>
            <label htmlFor="opportunity-referrer">Prescripteur (optionnel)</label>
            <select id="opportunity-referrer" onChange={(event) => setReferrerProspectId(event.target.value)} value={referrerProspectId}>
              <option value="">Aucun</option>
              {prospects
                .filter((prospect) => prospect.id !== prospectId)
                .map((prospect) => (
                  <option key={prospect.id} value={prospect.id}>
                    {prospect.company ? `${prospect.name} — ${prospect.company}` : prospect.name}
                  </option>
                ))}
            </select>
          </>
        ) : null}

        {isFormation ? (
          <>
            <label htmlFor="opportunity-funding">Financement</label>
            <select id="opportunity-funding" onChange={(event) => setFunding(event.target.value as typeof funding)} value={funding}>
              <option value="">Non renseigné</option>
              {fundingOrder.map((value) => (
                <option key={value} value={value}>
                  {fundingLabels[value]}
                </option>
              ))}
            </select>
          </>
        ) : null}

        {isEditing ? (
          <>
            <label htmlFor="opportunity-status">Statut</label>
            <select id="opportunity-status" onChange={(event) => setStatus(event.target.value as OpportunityStatus)} value={status}>
              {opportunityStatusOrder.map((value) => (
                <option key={value} value={value}>
                  {opportunityStatusLabels[value]}
                </option>
              ))}
            </select>

            {status === 'lost' || status === 'abandoned' ? (
              <>
                <label htmlFor="opportunity-loss-reason">Motif</label>
                <select
                  id="opportunity-loss-reason"
                  onChange={(event) => setLossReason(event.target.value as typeof lossReason)}
                  value={lossReason}
                >
                  <option value="">À préciser</option>
                  {lossReasonOrder.map((value) => (
                    <option key={value} value={value}>
                      {lossReasonLabels[value]}
                    </option>
                  ))}
                </select>
              </>
            ) : null}

            {status !== 'open' ? (
              <>
                <label htmlFor="opportunity-status-date">Date de {status === 'won' ? 'gain' : 'clôture'}</label>
                <input
                  id="opportunity-status-date"
                  onChange={(event) => setStatusDate(event.target.value)}
                  type="date"
                  value={statusDate}
                />
              </>
            ) : null}

            {rejection === 'wonRequiresAmountAndDate' ? (
              <p className="notice-error">Un gain exige un montant (ou un montant mensuel récurrent) et une date.</p>
            ) : null}
            {rejection === 'lostRequiresReason' ? <p className="notice-error">Une perte exige un motif.</p> : null}
          </>
        ) : null}

        <div className="button-row">
          <button className="primary-button" disabled={rejection !== null} onClick={submit} type="button">
            {isEditing ? 'Enregistrer' : 'Créer l’affaire'}
          </button>
          <button className="secondary-button" onClick={onCancel} type="button">
            Annuler
          </button>
          {isEditing ? (
            <button className="danger-button" onClick={onDelete} type="button">
              Supprimer l’affaire
            </button>
          ) : null}
        </div>
      </Panel>
    </section>
  );
}
