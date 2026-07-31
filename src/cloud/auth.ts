import { getCloudClient } from './client';

export type CloudUser = {
  id: string;
  email: string | null;
};

/**
 * Les messages de Supabase sont en anglais et parfois techniques. On traduit
 * les cas que l'on rencontre vraiment, et on garde le reste tel quel : un
 * message obscur reste plus utile qu'un « une erreur est survenue ».
 */
export const translateCloudError = (message: string): string => {
  const normalized = message.toLowerCase();

  if (normalized.includes('invalid login credentials')) return 'Adresse ou mot de passe incorrect.';
  // Le tableau de bord Supabase met l'URL de l'API REST en évidence, et c'est
  // celle-là qu'on copie naturellement. Le SDK ajoute son propre chemin par
  // dessus : la requête n'atteint jamais l'authentification, et l'échec se lit
  // comme un refus de connexion alors que rien n'est encore parti.
  if (normalized.includes('invalid path specified'))
    return "URL du projet Supabase incorrecte : elle doit s'arrêter à « .supabase.co », sans /rest/v1 ni barre finale.";
  if (normalized.includes('email not confirmed')) return "Adresse non confirmée : ouvre le message reçu par courriel.";
  if (normalized.includes('email logins are disabled')) return 'La connexion par mot de passe est désactivée sur le projet Supabase.';
  if (normalized.includes('failed to fetch') || normalized.includes('networkerror')) return 'Serveur injoignable : vérifie ta connexion.';
  if (normalized.includes('jwt') || normalized.includes('token is expired')) return 'Session expirée : reconnecte-toi.';

  return message;
};

const toCloudUser = (user: { id: string; email?: string | null } | null | undefined): CloudUser | null =>
  user ? { id: user.id, email: user.email ?? null } : null;

export const getCloudUser = async (): Promise<CloudUser | null> => {
  const client = await getCloudClient();
  const { data } = await client.auth.getSession();

  return toCloudUser(data.session?.user);
};

export const signInToCloud = async (email: string, password: string): Promise<CloudUser> => {
  const client = await getCloudClient();
  const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });

  if (error) throw new Error(translateCloudError(error.message));

  const user = toCloudUser(data.user);
  if (!user) throw new Error('Connexion refusée par le serveur.');

  return user;
};

export const signOutFromCloud = async (): Promise<void> => {
  const client = await getCloudClient();
  await client.auth.signOut();
};

/**
 * Prévient quand la session change, y compris quand elle expire d'elle-même :
 * l'écran doit alors repasser en local plutôt que d'échouer en boucle.
 */
export const onCloudAuthChange = async (listener: (user: CloudUser | null) => void): Promise<() => void> => {
  const client = await getCloudClient();
  const { data } = client.auth.onAuthStateChange((_event, session) => listener(toCloudUser(session?.user)));

  return () => data.subscription.unsubscribe();
};
