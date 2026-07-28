import type { SupabaseClient } from '@supabase/supabase-js';
import { readCloudConfig } from './config';

let clientPromise: Promise<SupabaseClient> | null = null;

/**
 * Le SDK Supabase n'est chargé qu'à la première utilisation.
 *
 * FreePilot doit s'ouvrir hors ligne et démarrer vite sur un téléphone : un
 * client réseau n'a rien à faire dans le bundle initial, surtout quand le
 * cloud n'est pas configuré. L'import de type ci-dessus est effacé à la
 * compilation, il ne tire aucun code.
 */
export const getCloudClient = async (): Promise<SupabaseClient> => {
  const config = readCloudConfig();
  if (!config) throw new Error('Synchronisation cloud non configurée.');
  if (clientPromise) return clientPromise;

  clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(config.url, config.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Aucun lien de connexion à intercepter : on s'authentifie par mot de
        // passe, et lire l'URL casserait la navigation de la PWA.
        detectSessionInUrl: false,
      },
    }),
  );

  // Un échec de chargement ne doit pas rester en cache : on pourra réessayer
  // au retour du réseau.
  clientPromise.catch(() => {
    clientPromise = null;
  });

  return clientPromise;
};
