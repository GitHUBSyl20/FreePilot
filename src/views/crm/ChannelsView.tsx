import type { ChannelStats, FinanceData, ReferrerStats } from '@freepilot/finance-core';
import { channelStatsByOriginEvent, channelStatsByReferrer, channelStatsBySource } from '@freepilot/finance-core';
import { useMemo, type ReactNode } from 'react';
import { EmptyState, InfoRow, Panel } from '../../components/Panel';
import { formatCurrency, formatDate, formatDays, formatPercent } from '../../format';

type Props = {
  data: FinanceData;
};

/** Une carte de synthèse par canal, même forme quelle que soit la clé de regroupement (§6.5). */
function ChannelCard({ extra, stats }: { stats: ChannelStats; extra?: ReactNode }) {
  return (
    <div className="record-card">
      <strong>{stats.label}</strong>
      <InfoRow
        helper={`${stats.wonCount} gagnée(s) sur ${stats.opportunityCount}`}
        label="Opportunités"
        value={String(stats.opportunityCount)}
      />
      <InfoRow label="Taux de conversion" value={formatPercent(stats.conversionRate)} />
      <InfoRow label="CA signé" value={formatCurrency(stats.signedRevenue)} />
      <InfoRow label="Panier moyen" value={stats.averageDeal !== null ? formatCurrency(stats.averageDeal) : '—'} />
      <InfoRow label="Durée de cycle moyenne" value={stats.averageCycleDays !== null ? formatDays(stats.averageCycleDays) : '—'} />
      {extra}
    </div>
  );
}

/**
 * Décide où remettre du temps de prospection (§6.5) : conversion, CA et durée
 * de cycle par source, par événement précis et par prescripteur. Lecture
 * seule — les affaires se créent et se modifient depuis la fiche prospect.
 */
export function ChannelsView({ data }: Props) {
  const bySource = useMemo(() => channelStatsBySource(data), [data]);
  const byOriginEvent = useMemo(() => channelStatsByOriginEvent(data), [data]);
  const byReferrer = useMemo(() => channelStatsByReferrer(data), [data]);

  return (
    <section className="details-stack single">
      <Panel collapsible title="Par source">
        {bySource.length === 0 ? (
          <EmptyState>Aucune opportunité enregistrée pour l’instant.</EmptyState>
        ) : (
          bySource.map((stats) => <ChannelCard key={stats.key} stats={stats} />)
        )}
      </Panel>

      <Panel collapsible title="Par événement d’origine">
        {byOriginEvent.length === 0 ? (
          <EmptyState>Aucune opportunité enregistrée pour l’instant.</EmptyState>
        ) : (
          byOriginEvent.map((stats) => <ChannelCard key={stats.key} stats={stats} />)
        )}
      </Panel>

      <Panel collapsible title="Par prescripteur">
        {byReferrer.length === 0 ? (
          <EmptyState>Aucune affaire référencée par un prescripteur pour l’instant.</EmptyState>
        ) : (
          byReferrer.map((stats: ReferrerStats) => (
            <ChannelCard
              extra={
                <InfoRow
                  label="Dernier contact"
                  value={stats.lastContactDate ? formatDate(stats.lastContactDate) : 'Jamais contacté'}
                />
              }
              key={stats.key}
              stats={stats}
            />
          ))
        )}
      </Panel>
    </section>
  );
}
