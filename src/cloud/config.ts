/**
 * La synchronisation cloud est optionnelle : sans configuration, FreePilot
 * reste strictement local et aucun code réseau n'est chargé.
 *
 * Les identifiants viennent de l'environnement de build. Le dépôt est public :
 * ni URL ni clé ne doivent y figurer, seulement `.env.example` qui montre les
 * noms des variables.
 */
export type CloudConfig = {
  url: string;
  anonKey: string;
};

export const readCloudConfig = (): CloudConfig | null => {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

  return url && anonKey ? { url, anonKey } : null;
};

export const isCloudConfigured = (): boolean => readCloudConfig() !== null;
