import type { FinanceData, RemoteDocument, RemoteDocumentHeader } from '@freepilot/finance-core';
import { FINANCE_DATA_VERSION, migrateFinanceData } from '@freepilot/finance-core';
import { translateCloudError } from './auth';
import { getCloudClient } from './client';

const TABLE = 'finance_documents';

const safeNumber = (value: unknown): number => (typeof value === 'number' ? value : Number(value));

/**
 * Les politiques RLS limitent déjà chaque compte à sa ligne. Le filtre sur
 * `user_id` est écrit quand même : une politique désactivée par erreur ne doit
 * pas suffire à faire lire les données de quelqu'un d'autre.
 */
export const fetchRemoteHeader = async (userId: string): Promise<RemoteDocumentHeader | null> => {
  const client = await getCloudClient();
  const { data, error } = await client
    .from(TABLE)
    .select('revision, schema_version, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(translateCloudError(error.message));
  if (!data) return null;

  return {
    revision: safeNumber(data.revision),
    schemaVersion: safeNumber(data.schema_version),
    updatedAt: String(data.updated_at),
  };
};

/**
 * Le document distant passe par la migration comme un fichier importé : un
 * autre appareil a pu écrire avec une version antérieure du schéma.
 */
export const fetchRemoteDocument = async (userId: string): Promise<RemoteDocument | null> => {
  const client = await getCloudClient();
  const { data, error } = await client
    .from(TABLE)
    .select('revision, schema_version, updated_at, data')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(translateCloudError(error.message));
  if (!data) return null;

  return {
    revision: safeNumber(data.revision),
    schemaVersion: safeNumber(data.schema_version),
    updatedAt: String(data.updated_at),
    data: migrateFinanceData(data.data),
  };
};

/**
 * Envoie le document et renvoie sa nouvelle révision, ou `null` quand la
 * révision attendue ne correspond plus côté serveur : c'est un conflit, il
 * revient à l'utilisateur de le trancher.
 */
export const pushRemoteDocument = async (input: {
  data: FinanceData;
  expectedRevision: number | null;
  force?: boolean;
}): Promise<number | null> => {
  const client = await getCloudClient();
  const { data, error } = await client.rpc('push_finance_document', {
    p_data: input.data,
    p_schema_version: FINANCE_DATA_VERSION,
    p_expected_revision: input.expectedRevision,
    p_force: input.force ?? false,
  });

  if (error) throw new Error(translateCloudError(error.message));

  return data === null ? null : safeNumber(data);
};
